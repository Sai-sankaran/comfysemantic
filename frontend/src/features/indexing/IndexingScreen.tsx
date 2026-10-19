import { useEffect, useState } from 'react';
import { api } from '../../api';
import type {
  IndexingPreflight,
  IndexingPreset,
  IndexingProgressEvent,
  ResourceProfile,
} from '../../types';
import { useLibrary } from '../../app/providers';
import { fmtDuration } from '../../app/format';
import { Button, Checkbox, Dialog, ProgressBar, Select } from '../../components/ui';

/**
 * What a forced re-run does to each forceable stage, stated per stage.
 *
 * A force requeues *every* item, so the question is never "will this be slow"
 * but "what gets rewritten". Only behaviour verified in the backend is written
 * here; nothing is optimistically called safe.
 *
 * `dialogue` is the one stage with an explicit manual-edit policy:
 * `_force_dialogue` deletes only `text_source != 'manual'` rows and marks a page
 * that still holds manual units as `ready`, so curated text survives the
 * re-run and is never re-queued for reprocessing.
 */
const FORCE_STAGE_NOTES: Record<string, string> = {
  discovery: 'Re-scans the folder. Files that appeared are added; nothing stored is deleted.',
  metadata:
    'Re-parses every file and rewrites the model/sampler/prompt columns. Also regenerates the recovered batch-candidate list, which is machine-derived.',
  thumbnails: 'Re-renders thumbnails. Safe: the output files are disposable.',
  fts: 'Rebuilds the text index from stored metadata. Safe: the index is derived.',
  panel_thumbnails: 'Re-renders panel thumbnails. Safe: the output files are disposable.',
  panel_fts: 'Rebuilds the panel text index from stored panel text. Safe: derived.',
  dialogue:
    'Deletes detected regions and re-detects. Text you corrected by hand is kept: only machine-detected rows (text_source != manual) are removed.',
  text_embeddings: 'Recomputes every text vector. Derived, so safe. Slow and needs the model.',
  image_embeddings: 'Recomputes every image vector. Derived, so safe. Slow and needs the model.',
  panel_text_embeddings: 'Recomputes every panel text vector. Derived, so safe. Needs the model.',
  panel_image_embeddings: 'Recomputes every panel image vector. Derived, so safe. Needs the model.',
  audio_embeddings: 'Recomputes every audio vector. Derived, so safe. Needs the model.',
  video_embeddings: 'Recomputes every video vector. Derived, so safe. Needs the model.',
};

/** Mirrors `RETRY_STAGE_TARGETS` in the backend; anything else is not forceable. */
const FORCEABLE_STAGES = new Set(Object.keys(FORCE_STAGE_NOTES));

type StageGroup = {
  key: string;
  title: string;
  desc: string;
  stages: StageDef[];
};

type StageDef = {
  id: string;
  label: string;
  desc: string;
  needsModel?: boolean;
};

const STAGE_GROUPS: StageGroup[] = [
  {
    key: 'catalog',
    title: 'Catalog preparation',
    desc: 'Scan the folder and build the searchable catalog.',
    stages: [
      { id: 'discovery', label: 'Discover files', desc: 'Scan the selected folder and enumerate media and text files.' },
      { id: 'metadata', label: 'Read metadata', desc: 'Extract metadata tags (model, sampler, LoRA, etc.) from files.' },
      { id: 'thumbnails', label: 'Thumbnails', desc: 'Render preview thumbnails for media files.' },
      { id: 'fts', label: 'Text search (FTS)', desc: 'Index text files into the full-text search engine.' },
    ],
  },
  {
    key: 'embeddings',
    title: 'Semantic search vectors',
    desc: 'Power similarity search. Requires the model runtime — skipped automatically when it is off.',
    stages: [
      { id: 'text_embeddings', label: 'Text embeddings', desc: 'Compute semantic vectors for text records.', needsModel: true },
      { id: 'image_embeddings', label: 'Image embeddings', desc: 'Compute semantic vectors for images.', needsModel: true },
      { id: 'audio_embeddings', label: 'Audio embeddings', desc: 'Compute semantic vectors for audio files.', needsModel: true },
      { id: 'video_embeddings', label: 'Video embeddings', desc: 'Compute semantic vectors for video files.', needsModel: true },
    ],
  },
  {
    key: 'finish',
    title: 'Finalization',
    desc: 'Wrap up the job once the stages above complete.',
    stages: [{ id: 'finalization', label: 'Finalize job', desc: 'Commit final counts and close the job cleanly.' }],
  },
];

/**
 * Panel and dialogue stages.
 *
 * Kept separate from `STAGE_GROUPS` because they only exist for a comic preset
 * and they work on `panel_crops` / `panel_text_units` rather than `images`.
 * Rendering them inside the base groups would imply that choosing them on a
 * ComfyUI library does something, when the backend would skip them for having
 * no rows.
 */
const PANEL_STAGE_GROUP: StageGroup = {
  key: 'panels',
  title: 'Comic panels & dialogue',
  desc: 'Panel-level units. Each panel is indexed as its own searchable item, linked back to its page.',
  stages: [
    { id: 'panel_registration', label: 'Register panels', desc: 'Honesty check: flag panels whose crop file has disappeared.' },
    { id: 'panel_thumbnails', label: 'Panel thumbnails', desc: 'Render a preview for each panel crop.' },
    { id: 'panel_fts', label: 'Panel text search', desc: 'Index each panel with its page filename and prompt, so a panel is findable by text.' },
    { id: 'panel_text_embeddings', label: 'Panel text vectors', desc: 'Semantic vectors over panel text.', needsModel: true },
    { id: 'panel_image_embeddings', label: 'Panel image vectors', desc: 'Image-content vectors for each panel.', needsModel: true },
    { id: 'dialogue', label: 'Dialogue regions', desc: 'Detect dialogue balloons and group them by fill colour. Detects regions only - no OCR is bundled, so no text is read.' },
  ],
};

const BASE_STAGE_GROUPS = STAGE_GROUPS;

/** Which stages a preset turns on by default. */
function stagesForPreset(presetId: string | null): string[] {
  const base = BASE_STAGE_GROUPS.flatMap((g) => g.stages.map((s) => s.id));
  if (presetId === 'comic+panels') {
    return [...base, ...PANEL_STAGE_GROUP.stages.map((s) => s.id)];
  }
  if (presetId === 'comic') {
    // Page-level only: dialogue is detected on the page, but no panel stage is
    // in scope until the cropper has run and the preset enables panels.
    return [...base, 'dialogue'];
  }
  return base;
}

const stageLabel = (id: string) =>
  [...BASE_STAGE_GROUPS, PANEL_STAGE_GROUP]
    .flatMap((g) => g.stages)
    .find((s) => s.id === id)?.label ?? id;

export function IndexingScreen() {
  const { libraryId, libraries, activeLibrary, refreshLibraries, refreshFacets, settings, selectLibrary, filters } =
    useLibrary();
  const [progress, setProgress] = useState<IndexingProgressEvent | null>(null);
  const [profile, setProfile] = useState<ResourceProfile>('balanced');
  const [stages, setStages] = useState<string[]>(settings?.indexing_stages ?? []);
  const [forceStages, setForceStages] = useState<string[]>([]);
  // Confirmation gate for a forced re-run. A force requeues every item in the
  // library, so it must be an explicit decision rather than a side effect of
  // pressing Start.
  const [confirmForce, setConfirmForce] = useState(false);
  const [presets, setPresets] = useState<IndexingPreset[]>([]);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [presetNote, setPresetNote] = useState<string>('');
  const [skipCompleted, setSkipCompleted] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<Record<string, unknown> | null>(null);
  const [adding, setAdding] = useState(false);
  const [embedReady, setEmbedReady] = useState<boolean | null>(null);
  const [preflight, setPreflight] = useState<IndexingPreflight | null>(null);
  // Explicit folder-scoped scan control: user selects which folder receives indexing.
  const [scanScopeFolder, setScanScopeFolder] = useState<string | null>(null);

  const activeFilterCount =
    filters.kinds.length + filters.checkpoints.length + filters.samplers.length + filters.loras.length;

  const push = (line: string) =>
    setLog((l) => [...l.slice(-199), `${new Date().toLocaleTimeString()} ${line}`]);

  const addLibrary = async () => {
    const dir = await api.openDirectory('Select image library folder');
    if (!dir) return;
    setAdding(true);
    setErr(null);
    try {
      await api.registerLibrary(dir);
      await refreshLibraries();
      push(`registered library ${dir}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => {
    if (settings && settings.indexing_stages.length > 0) {
      setStages(settings.indexing_stages);
    }
  }, [settings]);

  // Load the library's presets, and seed the stage selection from the active
  // one. Without this the stage list is whatever the backend settings say,
  // which is the ComfyUI default - so filename indexing and dialogue are
  // unreachable no matter what the user does.
  useEffect(() => {
    if (!libraryId) return;
    let cancelled = false;
    api
      .listPresets(libraryId)
      .then((res) => {
        if (cancelled) return;
        setPresets(res.presets);
        setPresetId(res.active_preset_id ?? 'comfy');
        setStages(stagesForPreset(res.active_preset_id ?? 'comfy'));
        setPresetNote('');
      })
      .catch((e) => setPresetNote(`Could not load presets: ${String(e)}`));
    return () => {
      cancelled = true;
    };
  }, [libraryId]);

  const changePreset = async (id: string) => {
    if (!libraryId) return;
    setErr(null);
    try {
      await api.setLibraryPreset(libraryId, id);
      setPresetId(id);
      // Selecting a preset resets the stage selection, which is the point:
      // switching to comic+panels adds panel stages, switching back removes
      // them. A leftover panel stage on a ComfyUI library would only produce
      // "0 pending" skips.
      setStages(stagesForPreset(id));
      const chosen = presets.find((p) => p.id === id);
      setPresetNote(
        chosen?.description ??
          `Preset set to ${id}. Stage defaults changed; existing vectors are untouched.`,
      );
    } catch (e) {
      setErr(String(e));
    }
  };

  useEffect(() => {
    const subs = [
      api.onIndexingProgress((p) => {
        setProgress(p);
        setRunning(p.status !== 'completed' && p.status !== 'cancelled');
        setPaused(p.status === 'paused');
      }),
      api.onIndexingFinished((f) => {
        push(`job ${String(f.status)} · timings ${JSON.stringify(f.stage_timings ?? {})}`);
        setRunning(false);
        setFinished(f);
        void refreshLibraries();
        void refreshFacets();
      }),
      api.onIndexingError((e) => {
        push(`ERROR ${e.error}`);
        setErr(e.error);
        setRunning(false);
      }),
    ];
    return () => {
      subs.forEach((p) => p.then((u) => u()).catch(() => undefined));
    };
  }, [refreshLibraries, refreshFacets]);

  useEffect(() => {
    // A job may already be running (or paused) when this screen mounts; sync the
    // run state so Pause/Resume/Stop reflect reality instead of assuming idle.
    let cancelled = false;
    api
      .indexingStatus()
      .then((st) => {
        if (cancelled) return;
        const status = st as { running?: boolean; paused?: boolean };
        setRunning(Boolean(status.running));
        setPaused(Boolean(status.paused));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Embedding stages only produce vectors when the model runtime is up; make
    // that visible instead of letting the stages silently no-op.
    const load = () =>
      api.embeddingStatus().then((s) => setEmbedReady(s.provider_ready)).catch(() => undefined);
    void load();
    const subs = [api.onModelStatus(() => void load()), api.onIndexingFinished(() => void load())];
    return () => {
      subs.forEach((p) => p.then((u) => u()).catch(() => undefined));
    };
  }, []);

  useEffect(() => {
    // Ask the backend whether the selected stages can run before the user starts.
    // A stage that needs discovered rows is NOT silently paired with discovery;
    // instead the backend reports the missing prerequisite and we surface it.
    if (!libraryId || stages.length === 0) {
      setPreflight(null);
      return;
    }
    let cancelled = false;
    api
      .indexPreflight({ libraryId, stages })
      .then((pf) => {
        if (!cancelled) setPreflight(pf);
      })
      .catch(() => {
        if (!cancelled) setPreflight(null);
      });
    return () => {
      cancelled = true;
    };
  }, [libraryId, stages]);

  const start = async (confirmedForce = false) => {
    const root = scanScopeFolder || activeLibrary?.root_path;
    if (!root) {
      setErr('Register and select a library first, or choose a folder scope.');
      return;
    }
    // A force requeues every item in the library, so it is never started by a
    // single stray click: the confirm dialog has to be passed through first.
    const active = forceStages.filter((s) => stages.includes(s));
    if (active.length > 0 && !confirmedForce) {
      setConfirmForce(true);
      return;
    }
    setConfirmForce(false);
    setErr(null);
    setLog([]);
    setFinished(null);
    try {
      const res = await api.startIndexing({
        libraryRoot: root,
        libraryId: activeLibrary?.id,
        stages,
        profile,
        forceStages: active,
        skipCompleted,
      });
      if ((res as IndexingPreflight).status === 'preflight_blocked') {
        const blocked = res as IndexingPreflight;
        setPreflight(blocked);
        setErr(blocked.message || 'The selected stages cannot run yet.');
        return;
      }
      push(`started job on ${root} (profile=${profile})`);
    } catch (e) {
      setErr(String(e));
    }
  };

  const toggleStage = (s: string) =>
    setStages((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const toggleForce = (s: string) =>
    setForceStages((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const visibleGroups: StageGroup[] =
    presetId === 'comic+panels' ? [...BASE_STAGE_GROUPS, PANEL_STAGE_GROUP] : BASE_STAGE_GROUPS;
  const allVisibleStages = visibleGroups.flatMap((g) => g.stages.map((s) => s.id));
  const setAllStages = (on: boolean) => setStages(on ? allVisibleStages : []);

  const counters: Array<[string, number]> = progress
    ? [
        ['Files discovered', progress.discovered_files],
        ['Eligible media', progress.eligible_media],
        ['Metadata extracted', progress.metadata_extracted],
        ['Metadata absent', progress.metadata_absent],
        ['Thumbnails', progress.thumbnails_done],
        ['Text records (FTS)', progress.fts_done],
        ['Text embeddings', progress.text_embeddings_done],
        ['Image embeddings', progress.image_embeddings_done],
        ['Audio embeddings', progress.audio_embeddings_done],
        ['Video embeddings', progress.video_embeddings_done],
        ['Failures', progress.failed],
        ['Pending', progress.pending],
      ]
    : [];

  // Honest bar: total work done across the stages the user actually selected,
  // weighted by item counts. Stages with no reported counters are ignored, so
  // enabling "Text embeddings" doesn't deflate a pending catalog job.
  const pct =
    progress && progress.counters.length > 0
      ? (() => {
          let done = 0;
          let total = 0;
          for (const id of stages) {
            const c = progress.counters.find((x) => x.stage === id);
            if (!c) continue;
            done += c.done;
            total += c.done + c.pending + c.failed;
          }
          return total > 0 ? (done / total) * 100 : null;
        })()
      : null;

  const activeForce = forceStages.filter((s) => stages.includes(s));

  return (
    <>
      <Dialog
        open={confirmForce}
        onClose={() => setConfirmForce(false)}
        title="Force reindex"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmForce(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => void start(false)}>
              Continue without forcing
            </Button>
            <Button onClick={() => void start(true)}>
              Yes, reindex {activeForce.length} stage{activeForce.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <p>
          This re-runs the selected stages over <strong>every item in the library</strong>,
          not just the items that failed. Work that is already complete will be redone.
        </p>
        <ul className="force-confirm-list">
          {activeForce.map((s) => (
            <li key={s}>
              <strong>{s}</strong>
              <span>
                {FORCE_STAGE_NOTES[s] ?? 'No preservation policy is recorded for this stage.'}
              </span>
            </li>
          ))}
        </ul>
        {activeForce.some((s) => !FORCEABLE_STAGES.has(s)) && (
          <p className="warn">
            One of the selected stages is not forceable and will be rejected by the backend.
            Remove it, or the run will fail before doing any work.
          </p>
        )}
      </Dialog>
      <main className="main">
      <section className="controls">
        <div className="toolbar">
          <Select
            aria-label="Library to index"
            value={libraryId ?? ''}
            onChange={(e) => selectLibrary(e.target.value)}
            disabled={libraries.length === 0}
          >
            {libraries.length === 0 && <option value="">No libraries registered</option>}
            {libraries.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Button onClick={() => void start()} disabled={running || stages.length === 0 || !libraryId || (preflight ? !preflight.ok : false)}>
            {forceStages.filter((s) => stages.includes(s)).length > 0
              ? `Force reindex (${forceStages.filter((s) => stages.includes(s)).length})`
              : 'Start indexing'}
          </Button>
          <Button variant="secondary" onClick={addLibrary} disabled={adding || running}>
            {adding ? 'Adding…' : 'Add library folder'}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              const dir = await api.openDirectory('Select scan scope folder');
              if (dir) setScanScopeFolder(dir);
            }}
          >
            {scanScopeFolder ? 'Scope: ' + (scanScopeFolder.split(/[\\/]/).pop() || scanScopeFolder) : 'Select folder scope'}
          </Button>
          {scanScopeFolder && (
            <Button variant="ghost" onClick={() => setScanScopeFolder(null)}>
              Clear scope
            </Button>
          )}
        </div>
        <p className="hint">
          Indexing always processes the whole folder. Narrowing by metadata (ComfyUI vs. normal &
          model/sampler/LoRA) is a catalog view filter, applied on the Library and Search tabs —
          {activeFilterCount > 0 ? ` ${activeFilterCount} filter(s) active now.` : ' none active now.'}
        </p>
        <div className="row">
          <Button
            onClick={() => api.pauseIndexing().catch((e) => setErr(String(e)))}
            disabled={!running || paused}
          >
            Pause
          </Button>
          <Button
            onClick={() =>
              api.resumeIndexing().then(() => setPaused(false)).catch((e) => setErr(String(e)))
            }
            disabled={!paused}
          >
            Resume
          </Button>
          <Button
            onClick={() => api.stopIndexing().catch((e) => setErr(String(e)))}
            disabled={!running}
          >
            Stop safely
          </Button>
          <Button
            onClick={async () => {
              try {
                const r = await api.retryFailures({ libraryId: activeLibrary?.id });
                push(`requeued ${r.reset} failed item(s)`);
              } catch (e) {
                setErr(String(e));
              }
            }}
          >
            Retry failures
          </Button>
        </div>
        <div className="row">
          <label className="inline">
            Resource profile:
            <Select
              value={profile}
              onChange={(e) => setProfile(e.target.value as ResourceProfile)}
            >
              <option value="low_impact">Low impact</option>
              <option value="balanced">Balanced</option>
              <option value="high_throughput">High throughput</option>
            </Select>
          </label>
          <span className="hint">Library: {activeLibrary?.root_path ?? 'none selected'}</span>
        </div>
        <div className="preset-picker">
          <label className="inline">
            Indexing preset:
            <Select
              value={presetId ?? ''}
              onChange={(e) => void changePreset(e.target.value)}
              disabled={!libraryId || running}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          {presetNote && <span className="hint">{presetNote}</span>}
        </div>
        <div className="stages-picker">
          <div className="stage-summary">
            <span className="pill">
              {stages.length} stage{stages.length === 1 ? '' : 's'} selected
            </span>
            <button type="button" className="linklike" onClick={() => setAllStages(true)}>
              All available
            </button>
            <button type="button" className="linklike" onClick={() => setAllStages(false)}>
              None
            </button>
            <Checkbox
              className="inline"
              title="Skip stages with no pending items. Turn off to reprocess every selected stage from scratch."
              checked={skipCompleted}
              onChange={setSkipCompleted}
              label="Skip completed"
            />
          </div>
          {visibleGroups.map((g) => (
            <div className="stage-group" key={g.key}>
              <div className="stage-group-head">
                <span className="stage-group-title">{g.title}</span>
                <span className="stage-group-desc">{g.desc}</span>
              </div>
              <div className="stages">
                {g.stages.map((s) => (
                  <Checkbox
                    key={s.id}
                    className={stages.includes(s.id) ? 'stage on' : 'stage'}
                    title={s.desc}
                    ariaLabel={s.label}
                    checked={stages.includes(s.id)}
                    onChange={() => toggleStage(s.id)}
                  >
                    <span>{s.label}</span>
                    {s.needsModel && <span className="pill pill-muted">model</span>}
                    {stages.includes(s.id) && FORCEABLE_STAGES.has(s.id) && (
                      <button
                        type="button"
                        className={forceStages.includes(s.id) ? 'linklike force-on' : 'linklike'}
                        title="Force this stage to reprocess every item, even items that are already complete. You will be asked to confirm before anything is requeued."
                        onClick={(e) => {
                          e.preventDefault();
                          toggleForce(s.id);
                        }}
                      >
                        {forceStages.includes(s.id) ? 'force ✓' : 'force'}
                      </button>
                    )}
                  </Checkbox>
                ))}
              </div>
            </div>
          ))}
        </div>
        {!libraryId && (
          <p className="hint">Select a registered library to index. Register one on the Library tab first.</p>
        )}
        {stages.some((s) => s.endsWith('_embeddings')) && embedReady === false && (
          <p className="notice">
            Embedding stages are selected, but the model runtime is not running — they will be
            skipped. Start the runtime in Settings (pending items embed automatically) or use
            “Embed pending” there.
          </p>
        )}
        {preflight && !preflight.ok && (
          <p className="notice bad">
            {preflight.message}{' '}
            {preflight.missing_prerequisites.length > 0 && (
              <span>
                Needs:{' '}
                {preflight.missing_prerequisites.map((m) => m.stage).join(', ')}
                {' '}→ run “{preflight.missing_prerequisites[0]?.requires ?? 'discovery'}” first.{' '}
              </span>
            )}
            {preflight.hint}
          </p>
        )}
        {err && <p className="notice bad">{err}</p>}
      </section>

      <section className="counters">
        <h2>Progress</h2>
        {!progress ? (
          <p className="empty">No job has run in this session yet.</p>
        ) : (
          <>
            {pct === null ? (
              <ProgressBar indeterminate label="Indexing progress" />
            ) : (
              <ProgressBar value={pct} label="Indexing progress" />
            )}
            <div className="row chips-row">
              <span className="chip active">stage: {stageLabel(progress.stage)}</span>
              <span className="chip">status: {progress.status}</span>
              <span className="chip">elapsed: {fmtDuration(progress.elapsed_seconds)}</span>
              <span className="chip">rate: {progress.items_per_second.toFixed(2)}/s</span>
              <span className="chip">ETA: {fmtDuration(progress.eta_seconds)}</span>
            </div>
            <div className="counter-grid">
              {counters.map(([k, v]) => (
                <div className="counter" key={k}>
                  <span className="counter-value">{v}</span>
                  <span className="counter-label">{k}</span>
                </div>
              ))}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Done</th>
                  <th>Pending</th>
                  <th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {progress.counters.map((s) => (
                  <tr key={s.stage} className={s.stage === progress.stage ? 'active-row' : undefined}>
                    <td>
                      {stageLabel(s.stage)}
                      {s.stage === progress.stage && <span className="pill pill-ok">now</span>}
                    </td>
                    <td className="ok">{s.done}</td>
                    <td>{s.pending}</td>
                    <td className={s.failed > 0 ? 'bad' : 'ok'}>{s.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {finished && !running && (
        <section className="completion">
          <h2>Indexing complete</h2>
          <p>
            Job {String(finished.status ?? 'finished')} on{' '}
            <span className="mono small">{activeLibrary?.root_path ?? 'library'}</span>. The catalog is now
            searchable — open the Library or Search tab to browse it.
          </p>
        </section>
      )}

      <section className="log-section">
        <h2>Session log</h2>        <pre className="log">{log.length ? log.join('\n') : 'No events yet.'}</pre>
      </section>
    </main>
    </>
  );
}