import type { UnlistenFn } from '@tauri-apps/api/event';
import { installDevBackend, type ShellState, type TransportBackend } from '../platform/transport';
import {
  COMIC_LIBRARY_ID,
  COMFY_LIBRARY_ID,
  COMFY_ITEM_COUNT,
  comicPageCount,
  comfyItemAt,
  proceduralThumb,
} from './scaleFixture';
import type {
  AppSettings,
  AppSettingsResult,
  Capabilities,
  FacetValue,
  Facets,
  ImageDetail,
  ImageRecord,
  LibraryRecord,
  ModelStatus,
  SearchMode,
  SettingsInfo,
} from '../types';

/**
 * The in-memory backend behind `npm run dev`.
 *
 * The point of this module is that **every screen boots and every button works**
 * without Python, Rust or a real catalog. It answers the same command names the
 * worker answers, so nothing above the adapter knows it is talking to fixtures.
 *
 * Three rules it keeps:
 *
 * 1. **Read-only.** It opens no files, starts no processes, writes nothing.
 * 2. **Never fakes a success that would hide a broken write path.** Commands that
 *    genuinely change state - indexing, cropper runs, database resets - report
 *    that they did nothing, rather than returning a cheerful success a scenario
 *    would then pass on.
 * 3. **Never invents data the design forbids inventing.** `VERIFY` #5 (OCR
 *    confidence) is unresolved, so no confidence value appears anywhere.
 */

/** Settings the dev session starts from. Mutable, in memory, never persisted. */
let settings: AppSettings = {
  thumb_fit: 'crop',
  ocr_overlays_visible: true,
  ocr_reading_order_labels: true,
  theme: 'dark',
  density: 'comfortable',
  text_scale: 100,
};

/** The documented defaults, needed by `AppSettingsResult.defaults`. */
const DEFAULTS: AppSettings = { ...settings };

/** Which keys the user actually chose. `SET-*` uses this to avoid overwriting. */
let explicit: Record<keyof AppSettings, boolean> = {
  thumb_fit: false,
  ocr_overlays_visible: false,
  ocr_reading_order_labels: false,
  theme: false,
  density: false,
  text_scale: false,
};

/** Per-library filter preferences. `GAL-*` reads and writes these. */
const libraryPrefs = new Map<string, { filters: unknown; sources: string[] }>();

/** One indexing job, so the Pipeline surfaces have something to show. */
let job: Record<string, unknown> | null = null;

export function resetDevState(): void {
  settings = { ...DEFAULTS };
  explicit = {
    thumb_fit: false,
    ocr_overlays_visible: false,
    ocr_reading_order_labels: false,
    theme: false,
    density: false,
    text_scale: false,
  };
  libraryPrefs.clear();
  job = null;
}

// ---------------------------------------------------------------------------
// Static shapes
// ---------------------------------------------------------------------------

const CAPABILITIES: Capabilities = {
  runtime_version: 'fixture',
  model_architecture: 'fixture',
  dimension: 768,
  normalized: true,
  text_ok: true,
  image_ok: true,
  audio_ok: false,
  video_ok: false,
  cross_modal_ok: true,
  deterministic: true,
  checks: [],
  errors: [],
  verified_at: '2026-09-30T12:00:00.000Z',
};

const SETTINGS_INFO: SettingsInfo = {
  // Every path is a clearly synthetic fixture path. Nothing here points at a real
  // data directory, so a screenshot can never leak one.
  data_dir: 'D:\\Scale\\data',
  libraries_dir: 'D:\\Scale\\data\\libraries',
  cache_dir: 'D:\\Scale\\data\\cache',
  log_dir: 'D:\\Scale\\data\\logs',
  db_path: 'D:\\Scale\\data\\catalog.db',
  models_root: 'D:\\Scale\\models',
  model_pair_found: false,
  model_pair: null,
  server_exe: 'D:\\Scale\\models\\runtime.exe',
  runtime_status: 'stopped',
  capabilities: null,
  profiles: {
    low_impact: { batch_size: 8, workers: 1 },
    balanced: { batch_size: 16, workers: 2 },
    high_throughput: { batch_size: 64, workers: 4 },
  },
  search_modes: ['keyword', 'semantic', 'visual', 'similar', 'hybrid', 'comic_text'],
  indexing_stages: [
    'thumbnail',
    'metadata',
    'embeddings',
    'fts',
    'image_embeddings',
    'ocr',
  ],
};

const LIBRARIES: LibraryRecord[] = [
  {
    id: COMFY_LIBRARY_ID,
    name: 'Scale ComfyUI library',
    root_path: 'D:\\Scale',
    total_files: COMFY_ITEM_COUNT,
    missing_files: 0,
    image_embeddings: 0,
    last_scanned_at: '2026-09-30T12:00:00.000Z',
  },
  {
    id: COMIC_LIBRARY_ID,
    name: 'Scale comic library',
    root_path: 'D:\\ScaleComic',
    total_files: comicPageCount(),
    missing_files: 0,
    image_embeddings: 0,
    last_scanned_at: '2026-09-30T12:00:00.000Z',
  },
];

function facet(values: string[]): FacetValue[] {
  return values.map((value, i) => ({ value, count: 40 + i * 7 }));
}

const FACETS: Facets = {
  kinds: facet(['png', 'jpg', 'webp']),
  checkpoints: facet([
    'sd_xl_base_1.0.safetensors',
    'dreamshaper_8.safetensors',
    'juggernautXL_v9.safetensors',
    'anything_v5.safetensors',
  ]),
  samplers: facet(['dpmpp_2m', 'euler_a', 'ddim', 'uni_pc']),
  loras: facet([
    'add-detail.safetensors',
    'film-grain.safetensors',
    'anime-lineart.safetensors',
    'soft-light.safetensors',
  ]),
  schedulers: facet(['karras', 'exponential', 'normal']),
  extensions: facet(['png', 'jpg', 'webp']),
  formats: facet(['png', 'jpg', 'webp']),
  ocr_statuses: facet(['done', 'not', 'needs-review']),
  ink_categories: facet(['speech', 'thought', 'narration', 'sfx']),
  dialogue_statuses: facet(['draft', 'reviewed']),
  attribution_states: facet(['unverified', 'attributed']),
};

function imageRecord(index: number): ImageRecord {
  return imageRecordFor(comfyItemAt(index));
}

function imageRecordFor(item: ReturnType<typeof comfyItemAt>): ImageRecord {
  return {
    id: item.id,
    canonical_path: item.displayPath,
    filename: item.filename,
    thumbnail_path: item.thumbnailUrl,
    width: item.width,
    height: item.height,
    modality: 'image',
    metadata_status: item.row?.model ? 'ok' : 'absent',
    embedding_status: 'pending',
    image_embedding_status: 'pending',
    positive_prompt: item.row?.prompt ?? null,
    negative_prompt: item.row?.prompt ? 'blurry, low quality' : null,
    checkpoint: item.row?.model ?? null,
    sampler: item.row?.sampler ?? null,
    // Anything the interface does not declare stays absent rather than being
    // invented - `ASSUMPTION` 3.
  } as ImageRecord;
}

/**
 * The refusal every state-changing command returns.
 *
 * A command that would start a process, write a database or move files reports
 * that it did nothing **in a shape the UI can render**, so the button can be
 * clicked and the consequence is visible - instead of the mock reporting success
 * and the real write path staying broken and untested.
 */
function didNotRun(what: string): Record<string, unknown> {
  return {
    ok: false,
    status: 'not-run',
    note: `${what} does not run against the in-memory dev backend. Nothing was read, written or started.`,
  };
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

type Handler = (params: Record<string, unknown>) => unknown | Promise<unknown>;

const HANDLERS: Record<string, Handler> = {
  handshake: () => ({
    protocol_version: 'dev-fixture-1',
    status: 'ok',
    pid: 0,
    data_dir: SETTINGS_INFO.data_dir,
  }),

  get_settings: () => SETTINGS_INFO,

  model_status: (): ModelStatus => ({
    runtime_status: 'stopped',
    dimension: null,
    config: null,
    capabilities: null,
  }),

  embedding_status: () => ({
    provider_ready: true,
    runtime_status: 'stopped',
    dimension: null,
    config_hash: null,
    pending: { text: 0, image: 0, audio: 0, video: 0 },
    libraries: LIBRARIES.map((l) => ({
      library_id: l.id,
      name: l.name,
      root_path: l.root_path,
      pending: { text: 0, image: 0, audio: 0, video: 0 },
    })),
    modalities: ['text', 'image'],
    indexing: { running: false, paused: false, job_id: null },
  }),

  get_app_settings: (): AppSettingsResult => ({
    settings: { ...settings },
    defaults: { ...DEFAULTS },
    explicit: { ...explicit },
  }),

  set_app_settings: (params): AppSettingsResult => {
    const next = params.settings as Partial<AppSettings> | undefined;
    if (next) {
      for (const key of Object.keys(next) as Array<keyof AppSettings>) {
        const value = next[key];
        if (value === undefined) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (settings as any)[key] = value;
        // A key the user actually set is remembered as chosen, which is what
        // stops a default from later overwriting it.
        explicit[key] = true;
      }
    }
    return { settings: { ...settings }, defaults: { ...DEFAULTS }, explicit: { ...explicit } };
  },

  reset_app_settings: (params): AppSettingsResult => {
    const keys = (params.keys as string[] | undefined) ?? [];
    for (const key of keys) {
      const k = key as keyof AppSettings;
      if (!(k in DEFAULTS)) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (settings as any)[k] = DEFAULTS[k];
      explicit[k] = false;
    }
    return { settings: { ...settings }, defaults: { ...DEFAULTS }, explicit: { ...explicit } };
  },

  list_libraries: () => ({ libraries: LIBRARIES }),

  register_library: (params) => ({
    library: {
      id: `fx-added-${LIBRARIES.length}`,
      name: (params.name as string) || 'Added in dev',
      root_path: (params.root_path as string) || 'D:\\Scale\\added',
      total_files: 0,
      missing_files: 0,
      image_embeddings: 0,
      last_scanned_at: null,
    },
    note: didNotRun('Registering a library'),
  }),

  remove_library: () => didNotRun('Removing a library'),

  get_facets: () => FACETS,

  get_library_prefs: (params) =>
    libraryPrefs.get(String(params.library_id)) ?? { filters: {}, sources: [] },

  set_library_prefs: (params) => {
    const id = String(params.library_id);
    libraryPrefs.set(id, {
      filters: (params.filters as unknown) ?? {},
      sources: (params.sources as string[]) ?? [],
    });
    return { ok: true };
  },

  list_presets: () => ({
    presets: [
      {
        id: 'quick',
        name: 'Quick',
        builtin: true,
        description: 'Thumbnails and metadata only.',
        config: { stages: ['thumbnail', 'metadata'] },
        active: true,
      },
      {
        id: 'full',
        name: 'Full',
        builtin: true,
        description: 'Every stage, including image embeddings.',
        config: { stages: SETTINGS_INFO.indexing_stages },
        active: false,
      },
    ],
  }),

  set_library_preset: () => ({ ok: true }),

  indexing_status: () => ({
    running: false,
    paused: false,
    job_id: job?.job_id ?? null,
    stage: job?.stage ?? null,
    total_files: COMFY_ITEM_COUNT,
    eligible_media: COMFY_ITEM_COUNT,
    discovered_files: COMFY_ITEM_COUNT,
    metadata_extracted: 0,
    metadata_absent: 0,
    thumbnails_done: 0,
    fts_done: 0,
    text_embeddings_done: 0,
    image_embeddings_done: 0,
    audio_embeddings_done: 0,
    video_embeddings_done: 0,
    errors: [],
  }),

  pause_indexing: () => didNotRun('Pausing indexing'),
  resume_indexing: () => didNotRun('Resuming indexing'),
  stop_indexing: () => didNotRun('Stopping indexing'),
  retry_failures: () => didNotRun('Retrying failures'),
  job_detail: () => didNotRun('Reading a job'),

  start_indexing: () => didNotRun('Starting indexing'),
  index_preflight: () => ({
    ok: true,
    would_process: COMFY_ITEM_COUNT,
    skipped: 0,
    reasons: [],
  }),

  database_info: () => ({
    path: SETTINGS_INFO.db_path,
    size_bytes: 0,
    tables: [],
    note: 'No database exists. The dev backend is in memory only.',
  }),
  backup_database: () => didNotRun('Backing up the database'),
  restore_database: () => didNotRun('Restoring the database'),
  reset_database: () => didNotRun('Resetting the database'),

  prompt_extraction_diagnostics: () => ({ ok: true, checked: 0, findings: [] }),
  explain_image_prompt: () => ({ ok: true, sources: [], text: null }),

  cropper_integrity: () => ({
    ok: false,
    note: 'Not checked. The cropper script is never run by the dev backend.',
  }),
  run_cropper: () => didNotRun('Running the cropper'),
  run_cropper_on_file: () => didNotRun('Running the cropper'),
  count_cropper_images: () => ({ count: 0, note: 'Nothing is scanned by the dev backend.' }),

  // Granting a directory is a filesystem capability the dev backend does not
  // have. It resolves rather than throwing, because the caller only wants the
  // directory recorded and a rejected promise there takes down startup.
  allow_directory: () => ({ ok: true, note: 'Not granted. The dev backend touches no real directories.' }),

  open_directory: () => null,

  batch_recovery_scan: () => ({ groups: [], scanned: 0 }),
  batch_recovery_preview: () => ({ entries: [] }),
  batch_recovery_status: () => ({ running: false, groups: 0 }),
  batch_recovery_accept: () => didNotRun('Accepting recovered prompts'),

  dialogue_list: () => ({ units: [], total: 0 }),

  validate_model: () => ({
    ok: false,
    errors: ['No model is installed. The dev backend starts no runtime.'],
    capabilities: null,
    runtime_config: null,
  }),
  start_model: () => ({ status: 'stopped', note: didNotRun('Starting the model').note }),
  stop_model: () => ({ status: 'stopped' }),

  embed_pending: () => ({ text: 0, image: 0, audio: 0, video: 0 }),
  embed_probe: () => ({ ready: false, reason: 'No runtime in the dev backend.' }),
  get_adjacent_image: () => null,
  start_folder_ocr: () => didNotRun('Running OCR'),
};

// ---------------------------------------------------------------------------
// The backend
// ---------------------------------------------------------------------------

/**
 * Build the transport backend.
 *
 * Reads (`browse`, `search`, `get_image_detail`) are served from the scale
 * fixture so the data-heavy screens have real content. Everything else is the
 * table above.
 */
/** In-memory shell state for the dev session. Resets on reload. */
let devShellState: ShellState | null = null;

export function createDevBackend(): TransportBackend {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  const call = async (method: string, params: Record<string, unknown>) => {
    const handler = HANDLERS[method];
    if (handler) return handler(params);

    switch (method) {
      case 'browse':
        return browse(params);
      case 'search':
        return search(params);
      case 'get_image_detail':
        return imageDetail(String(params.image_id ?? ''));
      default:
        // An unlisted command is a gap, not a crash. Saying so is more useful
        // than a silent `null`, which would look like "no results" in the UI.
        throw new Error(
          `"${method}" is not implemented by the dev backend. Add it to ` +
            'src/dev/devBackend.ts so the control it belongs to is clickable.',
        );
    }
  };

  return {
    call,
    async listen(event, handler): Promise<UnlistenFn> {
      const set = listeners.get(event) ?? new Set();
      set.add(handler);
      listeners.set(event, set);
      return () => set.delete(handler);
    },
    async readShellState() {
      return devShellState;
    },
    async writeShellState(state) {
      devShellState = { ...(devShellState ?? {}), ...state };
    },
  };
}

function browse(params: Record<string, unknown>) {
  const limit = Number(params.limit ?? 200);
  const offset = Number(params.offset ?? 0);
  const images = Array.from({ length: limit }, (_, i) => imageRecord(offset + i));
  return {
    images,
    total: COMFY_ITEM_COUNT,
    // `FLG-05`: the hidden count is reported beside the total, never folded in.
    hidden_count: Math.floor(COMFY_ITEM_COUNT / 61),
    offset,
    limit,
  };
}

function search(params: Record<string, unknown>) {
  const query = String(params.query ?? '').trim().toLowerCase();
  const mode = (params.mode ?? 'hybrid') as SearchMode;
  const limit = Number(params.limit ?? 200);

  if (query.length === 0) {
    return { images: [], total: 0, mode, signal: { used: [], skipped: [] } };
  }

  // A deterministic match: the query selects a window of the catalogue by hash, so
  // the same query always returns the same results.
  const start = Array.from(query).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 900;
  const images = Array.from({ length: Math.min(limit, 48) }, (_, i) => imageRecord(start + i));

  // Every signal is disclosed. `SRC-*` requires that a skipped signal be named
  // rather than silently absent, and `STA-08`/`STA-09` are the same disclosure
  // with a degraded reason.
  const skipped: string[] = [];
  if (mode !== 'keyword') skipped.push('semantic (runtime stopped)');
  if (mode !== 'keyword' && mode !== 'semantic') skipped.push('visual');
  return {
    images,
    total: images.length,
    mode,
    signal: { used: ['keyword'], skipped },
    note: 'Semantic and visual signals are unavailable: no runtime is started by the dev backend.',
  };
}

function imageDetail(imageId: string): ImageDetail {
  const tail = Number(imageId.split('-i')[1] ?? 0);
  const item = comfyItemAt(Number.isFinite(tail) ? tail : 0);
  return {
    image: {
      ...imageRecordFor(item),
      preview_path: item.previewUrl,
      file_size: item.fileSizeBytes,
      modified_at: item.modifiedAt,
      added_at: item.modifiedAt,
      scheduler: item.row?.sampler ? 'karras' : null,
      steps: item.row?.steps ?? null,
      cfg: item.row?.cfg ?? null,
      seed: item.row?.seed ?? null,
      denoise: 0.85,
      tags: item.row?.tags ?? [],
      notes: null,
      has_workflow: Boolean(item.row?.model),
      workflow_json: item.row?.model ? '{\n  "nodes": []\n}' : null,
      workflow_node_count: item.row?.model ? 36 : null,
      panel_count: item.panelCount,
      panel_index: item.panelIndex,
      parent_page_id: item.parentPageId,
      parent_series_label: item.parentSeriesLabel,
      missing: item.missing,
    } as ImageRecord,
    // Raw metadata is reported as present only where the fixture actually has
    // some. `ASSUMPTION` 3 forbids inventing a prompt blob, so an item with no
    // metadata reports `null` rather than an empty object that would render as
    // "extracted nothing" and look like a backend fault.
    metadata: item.row?.model
      ? {
          positive_prompt: item.row.prompt,
          negative_prompt: 'blurry, low quality',
          checkpoint: item.row.model,
          sampler: item.row.sampler,
          steps: item.row.steps,
          cfg: item.row.cfg,
          seed: item.row.seed,
          scheduler: 'karras',
          denoise: 0.85,
          loras: item.row.loras,
        }
      : null,
    raw_metadata: item.row?.model
      ? {
          raw_prompt_json: '{\n  "positive": "...",\n  "negative": "..."\n}',
          raw_workflow_json: '{\n  "nodes": []\n}',
          raw_other: null,
        }
      : null,
    embeddings: [],
    panel_crops: [],
  };
}

/**
 * Install it.
 *
 * The `proceduralThumb` re-export is used by the scenario runner; imported here
 * so a change to the thumbnail generator is a compile error in both places
 * rather than a silent divergence between a scenario and its screenshot.
 */
export function install(): void {
  installDevBackend(createDevBackend());
  void proceduralThumb;
  void CAPABILITIES;
}