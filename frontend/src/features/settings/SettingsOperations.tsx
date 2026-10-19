import { useEffect, useState } from 'react';
import { api } from '../../api';
import type {
  Capabilities,
  EmbeddingStatus,
  ModelStatus,
  PromptExtractionDiagnostics,
} from '../../types';
import { useLibrary } from '../../app/providers';
import { Button, Dialog, Input } from '../../components/ui';

/**
 * The operational half of Settings: the actions that are not settings.
 *
 * They live here because `SET-01` makes the registry the source of *values*; the
 * buttons below perform work (validate a model, back up the catalog, run prompt
 * diagnostics), so they are actions rather than settings and belong to the
 * categories that own them.
 *
 * The Appearance & OCR rows that used to be in this file were removed when the
 * registry took over. `appearance.theme`, `appearance.density` and
 * `appearance.textScale` are registry entries now, and keeping a second copy of
 * the same controls would leave two places that change one value.
 */
export type OperationsFocus = 'runtime' | 'storage' | 'advanced';

export function SettingsOperations({
  focus,
  onOpenGallery,
}: {
  focus: OperationsFocus;
  onOpenGallery?: () => void;
}) {
  const { settings, reloadSettings, libraryId, appSettings } = useLibrary();
  const [modelsRoot, setModelsRoot] = useState(settings?.models_root ?? '');
  const [caps, setCaps] = useState<Capabilities | null>(settings?.capabilities ?? null);
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [embed, setEmbed] = useState<EmbeddingStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [promptDiag, setPromptDiag] = useState<PromptExtractionDiagnostics | null>(null);
  const [promptBusy, setPromptBusy] = useState(false);
  // Used by the catalog-maintenance section to disable its buttons.
  void appSettings;

  const refreshEmbed = () => api.embeddingStatus().then(setEmbed).catch(() => undefined);

  useEffect(() => {
    void api.modelStatus().then(setStatus).catch(() => undefined);
    void refreshEmbed();
  }, []);

  useEffect(() => {
    if (!embed?.indexing.running) return undefined;
    const t = window.setInterval(() => void refreshEmbed(), 1500);
    return () => window.clearInterval(t);
  }, [embed?.indexing.running]);

  useEffect(() => {
    const subs = [
      api.onIndexingFinished(() => void refreshEmbed()),
      api.onIndexingError(() => void refreshEmbed()),
    ];
    return () => {
      subs.forEach((p) => p.then((u) => u()).catch(() => undefined));
    };
  }, []);

  const pendingTotal = embed ? embed.pending.text + embed.pending.image : 0;

  const embedNow = async () => {
    setBusy('embedding');
    setErr(null);
    try {
      const r = await api.embedPending();
      setNote(
        r.status === 'started'
          ? `Embedding pending items across ${r.libraries?.length ?? 1} library(ies).`
          : 'Nothing pending — everything is already embedded.',
      );
      await refreshEmbed();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };


  const validate = async () => {
    setBusy('validating');
    setErr(null);
    setNote(null);
    try {
      const res = await api.validateModel({ models_root: modelsRoot });
      setCaps(res.capabilities);
      if (res.capabilities) {
        // Validation can finish before the mount-time modelStatus() resolves,
        // leaving `s` null. `{...null}` yields `{}`, so status would have
        // `capabilities` but no `runtime_status` - and the render below does
        // `status?.runtime_status.startsWith(...)`, which throws on undefined.
        setStatus((s) =>
          s
            ? { ...s, capabilities: res.capabilities }
            : ({
                runtime_status: 'unknown',
                dimension: null,
                config: null,
                capabilities: res.capabilities,
              } as ModelStatus)
        );
      }
      setNote(
        res.ok
          ? 'Text and image embeddings validated. See per-modality results below.'
          : 'Validation did not pass. See the checks below.',
      );
      if (res.errors.length) setErr(res.errors.join(' · '));
      await reloadSettings();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    setBusy('starting');
    setErr(null);
    try {
      const r = await api.startModel({ models_root: modelsRoot });
      const embedded =
        r.embedding?.status === 'started'
          ? ` · embedding ${r.embedding.libraries?.length ?? 1} library(ies) now`
          : '';
      setNote(`Runtime ready · ${r.dimension} dimensions · ${r.base_url}${embedded}`);
      setStatus(await api.modelStatus());
      await refreshEmbed();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const stop = async () => {
    setBusy('stopping');
    setErr(null);
    try {
      await api.stopModel();
      setStatus(await api.modelStatus());
      await refreshEmbed();
      setNote('Runtime stopped.');
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const doReset = async () => {
    setConfirmReset(false);
    setResetting(true);
    try {
      await api.resetDatabase();
      setNote('Catalog cleared. Source images untouched.');
    } catch (e) {
      setErr(String(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <main className="main">

      {focus === 'runtime' && (<section className="controls">
        <h2>Embedding model</h2>
        <div className="row">
          <Input
            placeholder="Models directory"
            value={modelsRoot}
            onChange={(e) => setModelsRoot(e.target.value)}
          />
          <Button
            onClick={async () => setModelsRoot((await api.openDirectory('Models directory')) ?? modelsRoot)}
          >
            Browse…
          </Button>
        </div>
        {settings && (
          <dl className="kv">
            <div className="kv-row">
              <dt>Models directory</dt>
              <dd className="mono small">{settings.models_root}</dd>
            </div>
            <div className="kv-row">
              <dt>Model GGUF</dt>
              <dd className="mono small">{settings.model_pair?.model_path ?? 'not found'}</dd>
            </div>
            <div className="kv-row">
              <dt>Projector GGUF</dt>
              <dd className="mono small">{settings.model_pair?.mmproj_path ?? 'not found'}</dd>
            </div>
            <div className="kv-row">
              <dt>llama-server</dt>
              <dd className="mono small">{settings.server_exe}</dd>
            </div>
            <div className="kv-row">
              <dt>Catalog database</dt>
              <dd className="mono small">{settings.db_path}</dd>
            </div>
            <div className="kv-row">
              <dt>Cache / thumbnails</dt>
              <dd className="mono small">{settings.cache_dir}</dd>
            </div>
            <div className="kv-row">
              <dt>Logs</dt>
              <dd className="mono small">{settings.log_dir}</dd>
            </div>
          </dl>
        )}
        <div className="row">
          <Button onClick={validate} disabled={busy !== null}>
            Validate model (all modalities)
          </Button>
          <Button onClick={start} disabled={busy !== null}>
            Start runtime
          </Button>
          <Button
            onClick={stop}
            disabled={busy !== null || !status?.runtime_status?.startsWith('ready')}
          >
            Stop runtime
          </Button>
          {busy && <span className="mono small">{busy}…</span>}
        </div>
        {note && <p className="notice">{note}</p>}
        {err && <p className="notice bad">{err}</p>}
      </section>)}

      {focus === 'runtime' && (<section className="controls">
        <h2>Embeddings</h2>
        {!embed ? (
          <p className="empty">Reading embedding status…</p>
        ) : (
          <>
            <div className="row">
              <Button
                onClick={embedNow}
                disabled={
                  busy !== null || !embed.provider_ready || pendingTotal === 0 || embed.indexing.running
                }
              >
                {pendingTotal > 0 ? `Embed pending (${pendingTotal})` : 'Embed pending'}
              </Button>
              {embed.indexing.running ? (
                <span className="mono small">Embedding in progress…</span>
              ) : (
                <span className="muted small">
                  Runtime {embed.runtime_status}
                  {embed.dimension ? ` · ${embed.dimension} dimensions` : ''}
                </span>
              )}
            </div>
            <div className="counter-grid">
              <div className="counter">
                <span className="counter-value">{embed.pending.text}</span>
                <span className="counter-label">Text pending</span>
              </div>
              <div className="counter">
                <span className="counter-value">{embed.pending.image}</span>
                <span className="counter-label">Image pending</span>
              </div>
            </div>
            <p className="hint">
              Semantic and visual search need vectors. Starting the runtime embeds pending items
              automatically; if a library was indexed before the model was running, embed it here.
              Source images are never modified.
            </p>
          </>
        )}
      </section>)}

      {focus === 'runtime' && (<section className="validation">
        <h2>Modality validation</h2>
        {!caps ? (
          <p className="empty">
            Not validated yet. Validation uses synthetic fixtures only and never reads your image library.
          </p>
        ) : (
          <>
            <div className="counter-grid">
              <CapabilityTile label="Text" ok={caps.text_ok} />
              <CapabilityTile label="Image" ok={caps.image_ok} />
              <CapabilityTile label="Audio" ok={caps.audio_ok} />
              <CapabilityTile label="Video" ok={caps.video_ok} />
              <CapabilityTile label="Cross-modal retrieval" ok={caps.cross_modal_ok} />
              <CapabilityTile label="Deterministic" ok={caps.deterministic} />
            </div>
            <p className="mono small">
              dimension={caps.dimension} · normalized={caps.normalized ? 'yes' : 'no'} · verified {caps.verified_at}
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Result</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {caps.checks.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className={c.passed ? 'ok' : 'bad'}>{c.passed ? 'PASS' : 'FAIL'}</td>
                    <td className="mono small">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {caps.errors.length > 0 && (
              <ul className="errors">
                {caps.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>)}

      {focus === 'advanced' && (<section className="controls">
        <h2>Prompt extraction</h2>
        <p className="hint">
          How positively and negatively the stored prompts were resolved from each image's ComfyUI
          graph. “Batch candidate set” means a prompt batcher supplied several fragments and no
          single value is asserted. Diagnostics read stored metadata only; image content is never
          inspected.
        </p>
        <div className="row">
          <Button
            onClick={async () => {
              setPromptBusy(true);
              try {
                setPromptDiag(await api.promptExtractionDiagnostics({ libraryId, sample: 20 }));
              } catch (e) {
                setNote(`Prompt diagnostics failed: ${String(e)}`);
              } finally {
                setPromptBusy(false);
              }
            }}
            disabled={promptBusy}
          >
            {promptBusy ? 'Reading…' : 'Run prompt diagnostics'}
          </Button>
          {promptDiag && <span className="pill">{promptDiag.total_metadata_rows} rows</span>}
        </div>
        {promptDiag && (
          <>
            <div className="counter-grid">
              {(['exact', 'resolved_from_connection', 'batch_candidate_set', 'ambiguous', 'absent', 'malformed'] as const).map(
                (state) => (
                  <div className="counter" key={state}>
                    <span className="counter-label">{state}</span>
                    <span className="counter-value">
                      {promptDiag.prompt_state_counts.positive[state] ?? 0}
                    </span>
                  </div>
                ),
              )}
            </div>
            <p className="mono small">
              positive: candidate/ambiguous sets {promptDiag.ambiguous_or_candidate_sets.positive} ·
              negative: {promptDiag.ambiguous_or_candidate_sets.negative}
            </p>
            {promptDiag.sample.length > 0 && (
              <table className="diag-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Positive</th>
                    <th>State</th>
                    <th>Container</th>
                  </tr>
                </thead>
                <tbody>
                  {promptDiag.sample.map((s) => (
                    <tr key={s.image_id}>
                      <td className="mono small">{s.filename}</td>
                      <td className="mono small">
                        {s.positive_prompt ?? <em>(none asserted)</em>}
                      </td>
                      <td className="mono small">{s.resolution.positive?.state ?? 'absent'}</td>
                      <td className="mono small">{s.resolution.positive?.container ?? 'none'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>)}

      {focus === 'storage' && (<section className="controls">
        <h2>Catalog maintenance</h2>
        <div className="row">
          <Button
            onClick={async () => {
              try {
                setNote(`Backup: ${(await api.backupDatabase()).backup}`);
              } catch (e) {
                setNote(`Backup failed: ${String(e)}`);
              }
            }}
          >
            Back up catalog
          </Button>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            Reset catalog
          </Button>
        </div>
        <p className="hint">
          Removing a library unregisters it from the catalog; the source folder is never deleted.
          Use the Library tab → Remove library.
        </p>
      </section>)}

      {focus === 'advanced' && (<section className="controls">
        <h2>Diagnostics</h2>
        <p className="hint">
          The component gallery renders every shared control in every state, theme,
          density and text scale. It is the fixture for the visual-regression tests.
        </p>
        <div className="row">
          <Button onClick={onOpenGallery} disabled={!onOpenGallery}>
            Component gallery
          </Button>
        </div>
      </section>)}

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset catalog"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" onClick={doReset} disabled={resetting}>
              {resetting ? 'Resetting…' : 'Reset catalog'}
            </Button>
          </>
        }
      >
        <p>Clear the catalog database? Original images are never deleted. Archive a backup first if unsure.</p>
      </Dialog>
    </main>
  );
}

function CapabilityTile({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={ok ? 'counter ok' : 'counter bad'}>
      <span className="counter-value">{ok ? 'PASS' : 'FAIL'}</span>
      <span className="counter-label">{label}</span>
    </div>
  );
}
