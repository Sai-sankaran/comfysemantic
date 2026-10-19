export type Modality = 'text' | 'image' | 'audio' | 'video';

export type SearchMode =
  | 'keyword'
  | 'semantic'
  | 'visual'
  | 'similar'
  | 'hybrid'
  | 'comic_text';

/**
 * Which id space a search ranks in.
 *
 * Image and panel vectors are not mixed: their scores come from separate
 * corpora and are not on a comparable scale, so fusing them would require
 * inventing a weighting. The user picks a scope instead.
 */
export type UnitScope = 'image' | 'panel';

/**
 * A panel-shaped search result. Panels are crops, so they carry the parent's
 * identity and their position within it - without those, a panel hit is a
 * picture with no context.
 */
export interface PanelResult {
  id: string;
  unit_kind: 'panel';
  canonical_path: string;
  /** URL-friendly path when the backend supplies one; falls back to the file path. */
  crop_url?: string | null;
  parent_image_id: string | null;
  parent_filename: string | null;
  panel_number: number | null;
  filename: string;
  thumbnail_path: string | null;
  width: number | null;
  height: number | null;
  parent_width: number | null;
  parent_height: number | null;
  score: number | null;
  match_mode: string;
  parent_penalised?: boolean;
}

/** One detected dialogue balloon, in its parent unit's pixel coordinates. */
export interface DialogueUnit {
  id: string;
  library_id: string;
  source_image_id: string | null;
  panel_crop_id: string | null;
  scope: 'image' | 'panel';
  unit_index: number;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  color_signature: string | null;
  color_bucket: string | null;
  group_id: string | null;
  group_confidence: number;
  grouping_method: 'exact_color' | 'nearest_color' | 'manual' | 'unusable' | 'none' | 'ink_color';
  text: string;
  text_source: 'ocr' | 'manual' | 'none';
  /** 0..1 confidence in `text`. 1.0 for a manual correction. */
  confidence: number;
  ocr_status: 'not_run' | 'ok' | 'unavailable' | 'error';
  status: 'pending' | 'ready' | 'failed' | 'skipped';
  parent_filename: string | null;
  /** Absolute path of the page this region sits on, for the workbench canvas. */
  parent_path: string | null;
  /** Pixel size of that page. Region coordinates are in these units. */
  parent_width: number | null;
  parent_height: number | null;

  // --- v10: measured text-ink colour -------------------------------------
  // Distinct from color_signature/color_bucket above, which describe the
  // detected REGION FILL (the bubble background), not the lettering.
  /** Measured lettering colour as '#RRGGBB', or null when undetermined. */
  ink_rgb: string | null;
  /** Coarse name. 'unknown' or 'mixed' means the ink could not be separated. */
  ink_category: string;
  /** 0..1 confidence. Below ~0.55 is a best-effort estimate, not a measurement. */
  ink_confidence: number;
  /** True when two or more distinct inks are present and were not separated. */
  ink_multi_colour: boolean;
  /** OCR quadrilateral in original-image coordinates, as a JSON string. */
  ocr_box_json: string | null;
  ocr_engine: string | null;
  ocr_model: string | null;
  ocr_version: string | null;

  // --- v12: what a person decided, kept beside what the machine read -------
  /**
   * The transcript as OCR read it, captured before any manual edit and never
   * written again by one. `text` is the *effective* value (what search reads);
   * this is the original, so the two can be shown side by side and the
   * correction can be reversed.
   */
  machine_text: string | null;
  /**
   * Which colour is authoritative: 'machine' (measured, unconfirmed),
   * 'approved' (the user confirmed the measurement) or 'manual' (the user
   * chose a different colour).
   */
  ink_source: 'machine' | 'approved' | 'manual';
  /** A hand-picked colour, or null when the user has not chosen one. */
  ink_user_rgb: string | null;
  ink_user_category: string | null;
  ink_user_at: string | null;
  /** Review-queue state. 1 means a person has been here. */
  reviewed: number;
  reviewed_at: string | null;

  /**
   * Set when a re-index could not confidently re-identify this region, so the
   * correction or colour decision was preserved but not re-homed:
   *
   *  - `unmatched` - the region is gone, or moved too far to correspond
   *  - `ambiguous`  - two or more candidates were too close to choose between
   *
   * NULL means correspondence was confident (or nothing is pending). A pending
   * value is a request for human attention, never a silent reassignment.
   */
  reattachment: 'unmatched' | 'ambiguous' | null;

  /**
   * Derived server-side so the workbench inspector and the search filter can
   * never disagree about what colour a region has:
   * 'manual' -> `ink_user_rgb`; 'approved' -> the measurement; unknown/mixed
   * measurements resolve to null rather than to a guessed colour.
   */
  effective_ink_rgb: string | null;
  effective_ink_category: string | null;
  effective_ink_source: 'machine' | 'approved' | 'manual';
}

/** Per-group summary that drives the accept / merge / split controls. */
export interface DialogueGroup {
  gid: string;
  n: number;
  bucket: string | null;
  method: string;
  confidence: number;
  with_text: number;
}

export interface DialogueListResult {
  units: DialogueUnit[];
  total: number;
  groups: DialogueGroup[];
}

/** An indexing preset: `comfy`, `comic`, or `comic+panels`. */
export interface IndexingPreset {
  id: string;
  name: string;
  builtin: boolean;
  description: string | null;
  config: Record<string, unknown>;
  active: boolean;
}

export type ResourceProfile = 'low_impact' | 'balanced' | 'high_throughput';

export type ThumbFit = 'crop' | 'contain' | 'fill';

/** Application theme (design D-14). `dark` is the default. */
export type Theme = 'dark' | 'light' | 'high-contrast';

/** Interface density (design D-16). `comfortable` is the default. */
export type Density = 'compact' | 'comfortable' | 'spacious';

/**
 * Application-wide durable preferences, owned by the backend (`app_settings`).
 *
 * The key set is duplicated here only so the client can type-check call sites;
 * the backend whitelists and validates every key and is the real authority. A
 * key this file does not know about is ignored rather than sent.
 */
export interface AppSettings {
  thumb_fit: ThumbFit;
  /** Whether the OCR Workbench draws region overlays by default. */
  ocr_overlays_visible: boolean;
  /** Whether overlays show their reading-order number. */
  ocr_reading_order_labels: boolean;
  /** The application theme; applied as `data-theme` on the root element. */
  theme: Theme;
  /** Interface density; applied as `data-density` on the root element. */
  density: Density;
  /** Text scale as a percentage (80–200, step 10); applied as `--text-scale`. */
  text_scale: number;
}

export interface AppSettingsResult {
  settings: AppSettings;
  /** The documented default for each key. */
  defaults: AppSettings;
  /**
   * Which keys the user has actually chosen. `false` means "never set", which
   * is what makes adopting a value migrated from another storage mechanism
   * safe: a value the user picked is never overwritten.
   */
  explicit: Record<keyof AppSettings, boolean>;
}

export const THUMB_FIT_OPTIONS: Array<{ value: ThumbFit; label: string }> = [
  { value: 'crop', label: 'Crop to square' },
  { value: 'contain', label: 'Keep aspect ratio' },
  { value: 'fill', label: 'Stretch to fill' },
];

export const THEME_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'high-contrast', label: 'High contrast' },
];

export const DENSITY_OPTIONS: Array<{ value: Density; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious' },
];

/**
 * The text-scale steps the backend validates (design D-16: 80–200%, step 10).
 * Keeping the same bounds in one place means the <select> and the validator
 * cannot disagree about which values are legal.
 */
export const TEXT_SCALE_VALUES: number[] = Array.from(
  { length: 13 },
  (_, i) => 80 + i * 10,
);

export interface ImageRecord {
  id: string;
  canonical_path: string;
  filename: string;
  thumbnail_path: string | null;
  width: number | null;
  height: number | null;
  modality: string;
  metadata_status: string;
  embedding_status: string;
  image_embedding_status: string;
  positive_prompt: string | null;
  negative_prompt: string | null;
  checkpoint: string | null;
  sampler: string | null;
  seed: number | null;
  completeness_state: string | null;
  match_mode: string;
  score: number | null;
  rrf_score?: number;
  matched_by?: string[];
}

export interface EmbeddingRecord {
  modality: string;
  config_hash: string;
  dimension: number;
  normalization: string;
  preprocessing_version: string;
  api_version: string;
  preprocess_detail: string | null;
  created_at: string;
  valid: number;
}

export interface ImageDetail {
  image: ImageRecord;
  metadata: Record<string, unknown> | null;
  raw_metadata: {
    raw_prompt_json: string | null;
    raw_workflow_json: string | null;
    raw_other: string | null;
  } | null;
  embeddings: EmbeddingRecord[];
  panel_crops: Array<Record<string, unknown>>;
}

export interface StageCounter {
  stage: string;
  done: number;
  failed: number;
  pending: number;
}

export interface IndexingProgressEvent {
  job_id: string;
  stage: string;
  status: string;
  total_files: number;
  eligible_media: number;
  discovered_files: number;
  metadata_extracted: number;
  metadata_absent: number;
  thumbnails_done: number;
  fts_done: number;
  text_embeddings_done: number;
  image_embeddings_done: number;
  audio_embeddings_done: number;
  video_embeddings_done: number;
  failed: number;
  pending: number;
  elapsed_seconds: number;
  items_per_second: number;
  eta_seconds: number | null;
  profile: string;
  message: string;
  counters: StageCounter[];
}

export interface CapabilityCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface Capabilities {
  runtime_version: string;
  model_architecture: string;
  dimension: number;
  normalized: boolean;
  text_ok: boolean;
  image_ok: boolean;
  audio_ok: boolean;
  video_ok: boolean;
  cross_modal_ok: boolean;
  deterministic: boolean;
  checks: CapabilityCheck[];
  errors: string[];
  verified_at: string;
}

export interface LibraryRecord {
  id: string;
  name: string;
  root_path: string;
  total_files: number;
  missing_files: number;
  image_embeddings: number;
  last_scanned_at: string | null;
}

export interface SettingsInfo {
  data_dir: string;
  libraries_dir: string;
  cache_dir: string;
  log_dir: string;
  db_path: string;
  models_root: string;
  model_pair_found: boolean;
  model_pair: { model_path: string; mmproj_path: string; directory: string } | null;
  server_exe: string;
  runtime_status: string;
  capabilities: Capabilities | null;
  profiles: Record<ResourceProfile, Record<string, number>>;
  search_modes: SearchMode[];
  indexing_stages: string[];
}

export interface ModelStatus {
  runtime_status: string;
  dimension: number | null;
  config: {
    config_hash: string;
    model_id: string;
    dimension: number;
    normalization: string;
    preprocessing_version: string;
    api_version: string;
  } | null;
  capabilities: Capabilities | null;
}

export interface EmbeddingPendingCounts {
  text: number;
  image: number;
  audio: number;
  video: number;
}

export interface EmbeddingLibraryStatus {
  library_id: string;
  name: string;
  root_path: string;
  pending: EmbeddingPendingCounts;
}

export interface EmbeddingStatus {
  provider_ready: boolean;
  runtime_status: string;
  dimension: number | null;
  config_hash: string | null;
  pending: EmbeddingPendingCounts;
  libraries: EmbeddingLibraryStatus[];
  modalities: string[];
  indexing: { running: boolean; paused: boolean; job_id: string | null };
}

export interface CropperProgress {
  total: number | null;
  processed: number;
  current_file: string;
  recent: string[];
  /** Files the detector has written so far; live progress while stdout is buffered. */
  artifacts?: Record<string, number>;
  elapsed_seconds: number;
  eta_seconds: number | null;
  percent: number | null;
  status: string;
}

export interface CropperIntegrity {
  present: boolean;
  matches_baseline: boolean;
  sha256: string | null;
  expected: string;
  path: string;
  state?: 'verified' | 'modified' | 'missing';
  recovery?: string;
}

export type PromptResolutionState =
  | 'exact'
  | 'resolved_from_connection'
  | 'batch_candidate_set'
  | 'ambiguous'
  | 'absent'
  | 'malformed';

export type PromptContainer =
  | 'execution'
  | 'workflow'
  | 'workflow_title'
  | 'none';

export interface PromptResolutionDetail {
  state: PromptResolutionState;
  value?: string | null;
  candidates?: string[];
  source?: string;
  container?: PromptContainer;
  note?: string;
  trace?: string[];
}

export interface PromptDirectionExplanation {
  state: PromptResolutionState;
  container: PromptContainer;
  exact: boolean;
  ambiguous: boolean;
  path: string[];
  source: string;
  candidate_count: number;
  candidate_keys: string[];
  candidates_preview: string[];
  value_length: number;
  value_preview: string | null;
  value_truncated: boolean;
  note: string;
}

/**
 * The backend returns TWO different shapes under `diagnostic.positive` /
 * `.negative`, depending on whether raw prompt/workflow JSON was available:
 *
 *  - full resolution: a PromptDirectionExplanation (path, exact, ...), or
 *  - `source: "stored_details_only"`: a PromptResolutionDetail, which has no
 *    `path`, `exact`, `ambiguous`, `candidate_count`, `value_length` or
 *    `value_truncated` at all.
 *
 * Typing these as one shape made the Inspector dereference undefined and threw
 * during render on every image whose extraction was absent/error - and with no
 * error boundary that blanks the whole app. Consumers must narrow or normalise.
 */
export type PromptDirection = Partial<PromptDirectionExplanation> &
  PromptResolutionDetail;

export interface PromptExplanation {
  image_id: string;
  filename: string;
  positive_prompt: string | null;
  negative_prompt: string | null;
  source: string;
  diagnostic: {
    positive: PromptDirection | null;
    negative: PromptDirection | null;
    containers_present: { execution: boolean; workflow: boolean };
  };
  note: string;
}

export interface IndexingPreflight {
  ok: boolean;
  status?: string;
  library_id: string;
  requested_stages: string[];
  image_record_count: number;
  eligible_image_count: number;
  missing_prerequisites: { stage: string; requires: string; reason: string }[];
  message: string;
  hint: string;
}

export interface PromptExtractionSample {
  image_id: string;
  filename: string;
  positive_prompt: string | null;
  negative_prompt: string | null;
  resolution: {
    positive?: PromptResolutionDetail;
    negative?: PromptResolutionDetail;
  };
  raw_prompt_excerpt: string | null;
  raw_workflow_excerpt: string | null;
}

export interface PromptExtractionDiagnostics {
  total_metadata_rows: number;
  total_resolved_states: number;
  prompt_state_counts: {
    positive: Record<string, number>;
    negative: Record<string, number>;
  };
  ambiguous_or_candidate_sets: {
    positive: number;
    negative: number;
  };
  sample_count: number;
  sample: PromptExtractionSample[];
  note: string;
}

export interface CropperStarted {
  input_folder: string;
  output_folder: string;
  single_file: string | null;
  total: number | null;
}

export interface CropperImageCount {
  count: number;
  single: boolean;
  input: string;
}

export interface CropperFinished {
  status: string;
  panels: number;
  registered: number;
  output_folder: string;
  paths: Record<string, string>;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface Facets {
  kinds: FacetValue[];
  checkpoints: FacetValue[];
  samplers: FacetValue[];
  loras: FacetValue[];
  /**
   * Phase 2 additions. All optional because a catalog indexed by an older
   * build has no stored values for them, and an empty facet list is the honest
   * answer there - not an error and not a fake "all values" entry.
   */
  schedulers?: FacetValue[];
  extensions?: FacetValue[];
  formats?: FacetValue[];
  ocr_statuses?: FacetValue[];
  ink_categories?: FacetValue[];
  dialogue_statuses?: FacetValue[];
  attribution_states?: FacetValue[];
}

/**
 * Advisory observations about a recovered candidate list. Never used to alter
 * the candidates themselves - the recovered text is what ComfyUI executed.
 */
export interface BatchPromptDiagnostic {
  code: string;
  message: string;
  indices: number[];
}

/** Proven, or not, that one execution emits one image per candidate. */
export interface BatchOutputTopology {
  outputs_per_candidate: number | null;
  saver_prefixes: string[];
  sampler_ids: string[];
  established: boolean;
  reason: string;
}

export interface BatchPromptBatch {
  config: {
    prepend: string;
    prompts: string;
    append: string;
    class_type: string;
    node_id: string;
    source_container: string;
    /** True when read from the UI workflow, whose widgets can be stale. */
    low_trust: boolean;
    unsupported_reason: string;
  };
  candidates: Array<{
    index: number;
    text: string;
    source_widget: string;
    /** Source line in the `prompts` widget; -1 for the empty singleton. */
    original_line: number;
  }>;
  warnings: string[];
  diagnostics?: BatchPromptDiagnostic[];
}

export interface BatchPromptGroup {
  group_id: string;
  batch_fingerprint: string;
  library_id: string;
  image_ids: string[];
  common_prefix: string;
  counter_sequence: number[];
  seeds: number[];
  timestamps: number[];
  gaps: number[];
  confidence: number;
  state: string;
  /** False when filenames carried no counter, so no ordering evidence exists. */
  counter_evidence?: boolean;
  output_topology?: BatchOutputTopology | null;
}

export interface BatchPromptAttribution {
  image_id: string;
  /** -1 when the assignment is ambiguous and no index was chosen. */
  prompt_index: number;
  prompt_text: string;
  confidence: number;
  attribution_state: string;
  review_status: string;
  /** Recovery algorithm version, e.g. "v2". */
  recovery_version?: string;
  evidence: Record<string, unknown>;
  assumptions: Record<string, unknown>;
}

export interface BatchPromptPreview {
  group: BatchPromptGroup;
  batch: BatchPromptBatch;
  attributions: BatchPromptAttribution[];
}

export interface BatchRecoveryScanResult {
  batches: Record<string, BatchPromptBatch>;
  groups: BatchPromptGroup[];
  topologies?: Record<string, BatchOutputTopology>;
  total_images: number;
  eligible_batches: number;
}

export interface BatchRecoveryStatus {
  by_attribution_state: Record<string, number>;
  by_review_status: Record<string, number>;
  total_images_with_batch: number;
  attribution_states: string[];
  review_statuses: string[];
}

export interface BatchRecoveryAcceptParams {
  attribution_ids?: string[];
  group_id?: string;
  manual_corrections?: Record<string, string>;
  library_id?: string;
  batch_fingerprint?: string;
  reject?: boolean;
}

export interface BatchRecoveryAcceptResult {
  accepted: number;
  rejected: number;
  search_updated: number;
}

export const ATTRIBUTION_STATES = [
  'exact_metadata',
  'verified_order_inference',
  'high_confidence_inference',
  'ambiguous',
  'unresolved',
  'manually_confirmed',
] as const;

export const REVIEW_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'manual',
] as const;

export interface CatalogFilters {
  kinds: string[];
  checkpoints: string[];
  samplers: string[];
  loras: string[];
  schedulers?: string[];
  extensions?: string[];
  formats?: string[];
  /** Exact numeric matches. Empty / non-numeric is ignored by the backend. */
  seed?: string;
  steps?: string;
  cfg?: string;
  denoise?: string;
  min_width?: string;
  max_width?: string;
  min_height?: string;
  max_height?: string;
  /** v10 lettering-ink category, NOT the v9 bubble-fill colour. */
  ink_category?: string[];
  ocr_status?: string[];
  /** `true` = has text, `false` = no text, undefined = don't care. */
  has_ocr?: boolean;
  dialogue_status?: string[];
  attribution_state?: string[];
}

export const EMPTY_FILTERS: CatalogFilters = {
  kinds: [],
  checkpoints: [],
  samplers: [],
  loras: [],
  schedulers: [],
  extensions: [],
  formats: [],
  seed: '',
  steps: '',
  cfg: '',
  denoise: '',
  min_width: '',
  max_width: '',
  min_height: '',
  max_height: '',
  ink_category: [],
  ocr_status: [],
  dialogue_status: [],
  attribution_state: [],
};

/**
 * Keyword search sources. Each maps to a real backend query path.
 * `batch` is a recovered candidate list, never a confirmed prompt.
 */
export const SEARCH_SOURCES = [
  'prompt',
  'metadata',
  'file',
  'ocr',
  'batch',
] as const;

export type SearchSource = (typeof SEARCH_SOURCES)[number];

export const SEARCH_SOURCE_LABELS: Record<SearchSource, string> = {
  prompt: 'Prompt',
  metadata: 'Model/metadata',
  file: 'Filename',
  ocr: 'OCR text',
  batch: 'Batch candidates',
};

export const DEFAULT_SEARCH_SOURCES: SearchSource[] = [
  'prompt',
  'metadata',
  'file',
];

/**
 * Filter keys whose value is a list of chosen strings.
 *
 * Written as an explicit union rather than a mapped type over `keyof`:
 * with optional members the mapped form widened to include `undefined`,
 * which then failed as an index type at every use site.
 */
export type ListFilterKey =
  | 'kinds'
  | 'checkpoints'
  | 'samplers'
  | 'loras'
  | 'schedulers'
  | 'extensions'
  | 'formats'
  | 'ink_category'
  | 'ocr_status'
  | 'dialogue_status'
  | 'attribution_state';

export const LIST_FILTER_KEYS: ListFilterKey[] = [
  'kinds',
  'checkpoints',
  'samplers',
  'loras',
  'schedulers',
  'extensions',
  'formats',
  'ink_category',
  'ocr_status',
  'dialogue_status',
  'attribution_state',
];

export function hasActiveFilters(f: CatalogFilters | null | undefined): boolean {
  if (!f) return false;
  const nonEmpty = (v: unknown) =>
    Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v === true;
  return Object.entries(f).some(([k, v]) => k !== 'has_ocr' && nonEmpty(v))
    || f.has_ocr === true
    || f.has_ocr === false;
}