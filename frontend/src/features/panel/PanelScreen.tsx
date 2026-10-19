import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import type { CropperIntegrity } from '../../types';
import { useLibrary } from '../../app/providers';
import { Button, Input } from '../../components/ui';
import { CropperLog } from '../../components/cropper/CropperLog';
import { useCropperLog } from '../../components/cropper/useCropperLog';

const SCRIPT_NAME = 'panel_folder_cropper_v11.py';

/**
 * What the detector writes into the output folder. Stated here because the
 * script's own folder contract is the whole behaviour of this tab - the app
 * adds nothing but the two paths and a live view of the prints.
 */
const OUTPUT_ARTIFACTS = [
  // Must match what the detector actually creates - `panel_folder_cropper_v11.py`
  // writes "panels", not "cropped_panels". This list was telling the user to
  // look in a folder that never exists.
  'panels\\',
  'contact_sheets\\',
  'detection_overlays\\',
  'panels.csv',
  'processing_report.csv',
];

function isInsideOrEqual(parent: string, child: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase();
  const a = norm(parent);
  const b = norm(child);
  if (!a || !b) return false;
  return b === a || b.startsWith(a + '\\') || b.startsWith(a + '/');
}

export function PanelScreen() {
  const { libraryId, libraries } = useLibrary();
  const [src, setSrc] = useState('');
  const [dst, setDst] = useState('');
  const [integrity, setIntegrity] = useState<CropperIntegrity | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const cropperLog = useCropperLog();

  useEffect(() => {
    api
      .cropperIntegrity()
      .then(setIntegrity)
      .catch((e) => setMsg({ kind: 'bad', text: String(e) }));
  }, []);

  // Re-count whenever the source folder changes, so the number shown is always
  // a fresh count of what is actually on disk right now.
  useEffect(() => {
    if (!src) {
      setCount(null);
      return;
    }
    setCountLoading(true);
    setCount(null);
    const t = setTimeout(() => {
      api
        .countCropperImages({ input_folder: src })
        .then((r) => setCount(r.count))
        .catch(() => setCount(null))
        .finally(() => setCountLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [src]);

  const nested = !!src && !!dst && isInsideOrEqual(src, dst);
  const running = cropperLog.running || starting;
  const libraryName = useMemo(
    () => libraries.find((l) => l.id === libraryId)?.name ?? null,
    [libraries, libraryId]
  );

  const run = async () => {
    if (!src || !dst) {
      setMsg({ kind: 'bad', text: 'Both a source folder and an output folder are required.' });
      return;
    }
    if (nested) {
      setMsg({
        kind: 'bad',
        text: 'The output folder is inside the source folder. The detector would process its own output. Pick a different location.',
      });
      return;
    }
    setStarting(true);
    setMsg(null);
    cropperLog.reset();
    try {
      await api.runCropper(src, dst, libraryId);
    } catch (e) {
      setMsg({ kind: 'bad', text: String(e) });
    } finally {
      setStarting(false);
    }
  };

  const canRun = !!src && !!dst && !nested && !!integrity?.matches_baseline && !running;

  return (
    <main className="main">
      <section className="controls">
        <h2>Panel Studio</h2>
        <p className="hint">
          Runs your v11 panel detector on a folder and shows its console output. Nothing else
          happens: the script gets the two paths below and the prints are shown here as they come.
        </p>

        {integrity && !integrity.matches_baseline && (
          <div className="notice-row">
            <p className="notice bad">
              Detector {integrity.state === 'missing' ? 'not found' : 'modified'} — this tab will not
              run.
              {integrity.recovery ? ` ${integrity.recovery}` : ''}
            </p>
          </div>
        )}

        <div className="row">
          <Input
            placeholder="Source folder (the images to process)"
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            aria-label="Source folder"
          />
          <Button onClick={async () => setSrc((await api.openDirectory('Source folder')) ?? src)}>
            Browse…
          </Button>
        </div>

        <div className="row">
          <Input
            placeholder="Output folder (must be outside the source folder)"
            value={dst}
            onChange={(e) => setDst(e.target.value)}
            aria-label="Output folder"
          />
          <Button onClick={async () => setDst((await api.openDirectory('Output folder')) ?? dst)}>
            Browse…
          </Button>
        </div>

        {/* Say exactly what is about to be executed. Everything the tab does
            is this one command, so there is nothing to guess about. */}
        <div className="run-plan">
          <p className="mono small strong">This will run</p>
          <p className="mono small run-cmd">
            {src || '<source folder>'} {SCRIPT_NAME} {dst || '<output folder>'}
          </p>
          <ul className="mono small">
            <li>
              {countLoading
                ? 'Counting images in the source folder…'
                : count != null
                  ? `${count} image${count === 1 ? '' : 's'} will be processed.`
                  : 'Images in the source folder: unknown'}
            </li>
            <li>Written to the output folder: {OUTPUT_ARTIFACTS.join(', ')}.</li>
            <li>Source images are never modified or deleted.</li>
            <li>
              {libraryName
                ? `Afterwards each crop is linked to its source image in the "${libraryName}" library.`
                : 'No library is selected, so crops are produced but not linked to catalog entries.'}
            </li>
          </ul>
        </div>

        {nested && (
          <p className="notice bad">
            The output folder is inside the source folder. Pick a different output location.
          </p>
        )}

        <Button variant="primary" onClick={() => void run()} disabled={!canRun}>
          {running ? 'Running…' : 'Run panel cropper'}
        </Button>

        {msg && <p className={msg.kind === 'bad' ? 'notice bad' : 'notice'}>{msg.text}</p>}
      </section>

      {(cropperLog.hasRun || running) && (
        <CropperLog
          lines={cropperLog.lines}
          progress={cropperLog.progress}
          finished={cropperLog.finished}
          error={cropperLog.error}
          running={running}
          silentFor={cropperLog.silentFor}
        />
      )}
    </main>
  );
}