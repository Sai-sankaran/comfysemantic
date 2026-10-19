import { useEffect, useRef } from 'react';
import type { CropperFinished, CropperProgress } from '../../types';
import { ProgressBar } from '../ui';

type Props = {
  lines: string[];
  progress: CropperProgress | null;
  finished: CropperFinished | null;
  error: string | null;
  running: boolean;
  /** Seconds since the detector last printed, used to flag a stalled run. */
  silentFor?: number | null;
  /** Optional heading; omit to render the log without one. */
  title?: string;
};

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  return `${m}m ${Math.round(seconds - m * 60)}s`;
}

/**
 * Live view of the panel cropper's own console output.
 *
 * The detector is the trusted component and its prints are the only honest
 * account of what it actually did, so this shows them verbatim rather than a
 * paraphrase. It stays mounted after the run so the result can be read.
 */
export function CropperLog({ lines, progress, finished, error, running, silentFor, title }: Props) {
  const boxRef = useRef<HTMLPreElement>(null);
  // Only auto-scroll while the user is already at the bottom, so scrolling back
  // to re-read an earlier line is not yanked away on the next event.
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  const summary = (() => {
    const bits: string[] = [];
    if (progress) {
      // The detector block-buffers stdout when it is piped, so image counts
      // arrive only at the end. Crops on disk are polled live instead, and are
      // labelled as files written rather than images processed so the two are
      // never confused.
      const written = progress.artifacts;
      if (written && Object.keys(written).length > 0) {
        const panelCount = written.panels ?? 0;
        if (panelCount > 0) bits.push(`${panelCount} crops written`);
      }
      if (progress.total != null) {
        bits.push(`${progress.processed} / ${progress.total} images`);
      }
      if (progress.elapsed_seconds != null) bits.push(`elapsed ${fmtDuration(progress.elapsed_seconds)}`);
      if (progress.eta_seconds != null && running) bits.push(`ETA ${fmtDuration(progress.eta_seconds)}`);
    }
    if (finished) {
      bits.push(`${finished.panels ?? 0} panels found`);
      bits.push(`${finished.registered ?? 0} linked to catalog`);
    }
    return bits.join(' · ');
  })();

  return (
    <section className="cropper-log">
      {title && <h2>{title}</h2>}

      {running && (
        <>
          <ProgressBar
            value={progress?.percent ?? null}
            indeterminate={progress?.total == null}
            label="Cropper progress"
          />
          {summary && <p className="mono small">{summary}</p>}
          {progress?.current_file && (
            <p className="mono small">current: {progress.current_file}</p>
          )}
          {silentFor != null && silentFor >= 10 && (
            <p className="mono small">
              no new output for {silentFor}s — still running
            </p>
          )}
        </>
      )}

      {!running && finished && (
        <p className="notice">
          Finished — {summary}
          {finished.output_folder && (
            <>
              {' '}
              <span className="mono small">{finished.output_folder}</span>
            </>
          )}
        </p>
      )}

      {!running && error && <p className="notice bad">Cropper failed: {error}</p>}

      {lines.length > 0 && (
        <pre
          className="log"
          ref={boxRef}
          tabIndex={0}
          aria-label="Panel cropper output"
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
        >
          {lines.join('\n')}
        </pre>
      )}

      {running && lines.length === 0 && <p className="muted small">waiting for detector output…</p>}
    </section>
  );
}