// covers: PIP-01, PIP-02, PIP-03, PIP-04, PIP-05, PIP-06, PIP-07, PIP-08, PIP-09, PIP-10, PIP-11, PIP-12, PIP-13, PIP-20, PIP-21, PIP-22, PIP-23, PIP-24
import type { LibraryType } from '../explore/exploreTypes';

/**
 * Pipeline types (design §7.7, `PIP-01`..`PIP-24`).
 *
 * The Pipeline feature replaces the old "Indexing Center" and the scope/preset
 * parts of "Panel Studio". It owns the scope tree, preset cards, stage list,
 * summary, job queue, drawer, and maintenance tools.
 */

/** `PIP-01`: Scope uses the tree in Select mode (LIB-07). */
export type PipelineScope = {
  type: 'library' | 'folders';
  libraryId: string;
  folderIds?: string[];
};

/** `PIP-02`: Preset card shown in the "What to run" section. */
export type PipelinePresetCard = {
  id: string;
  label: string;
  description: string;
  stages: string[];
  needsModel: boolean;
  estimate?: { min: number; max: number }; // minutes
  /** `PIP-11`: computed from folder policies. */
  fromPolicies?: boolean;
};

/** `PIP-03`: Stage row in the stage list. */
export type PipelineStage = {
  id: string;
  label: string;
  description: string;
  needsModel: boolean;
  enables?: string;
  requires?: string[];
  counts: { done: number; toDo: number; failed: number; stale: number };
  reRunEvenIfDone: boolean;
};

/** `PIP-05`: Summary (dry run) data. */
export type PipelineSummary = {
  library: { id: string; name: string; rootPath: string };
  scope: PipelineScope;
  presetId: string | null;
  stages: string[];
  counts: { toProcess: number; alreadyDone: number; stale: number; failed: number };
  runtimeNote: string;
  estimate?: { min: number; max: number };
  canStart: boolean;
  cannotStartReason?: string;
};

/** `PIP-07`: Resource profile with user profiles. */
export type PipelineResourceProfile =
  | 'balanced'
  | 'low_impact'
  | 'high_throughput'
  | 'battery_aware'
  | 'idle_only'
  | 'max_speed'
  | { id: string; label: string; effect: string }; // user profile

/** `PIP-10`: Job states. */
export type PipelineJobState =
  | 'queued'
  | 'starting'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'completed'
  | 'completed_with_failures'
  | 'failed';

/** `PIP-10` / `PIP-21`: A job in the queue/drawer. */
export type PipelineJob = {
  id: string;
  libraryId: string;
  libraryName: string;
  scope: PipelineScope;
  presetId: string | null;
  stages: string[];
  profile: string;
  state: PipelineJobState;
  progress: {
    stage: string;
    done: number;
    total: number;
    elapsedSeconds: number;
    itemsPerSecond: number;
    etaSeconds: number | null;
    message: string;
  };
  failures: Array<{ item: string; stage: string; error: string }>;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

/** `PIP-20`: Tray text while a job runs. */
export type PipelineTray = {
  text: string;
  canPause: boolean;
  canStop: boolean;
};

/** `PIP-13`: Maintenance action. */
export type MaintenanceAction = {
  id: string;
  label: string;
  description: string;
  reads: string[];
  mayUpdate: string[];
  startsRuntime: boolean;
  estimate?: { min: number; max: number };
};

/** The seam: the Pipeline screen knows only this interface. */
export type PipelineSource = {
  isFixtureData?: boolean;
  /** `PIP-01`: Get the folder tree in Select mode. */
  folderTreeSelect(libraryId: string): Promise<Array<{ id: string; label: string; parentId: string | null; isRoot: boolean; count: number; status: string }>>;
  /** `PIP-02`: Get available presets for a library type. */
  presets(libraryType: LibraryType): Promise<PipelinePresetCard[]>;
  /** `PIP-03`: Get stage list for a library type and scope. */
  stages(libraryType: LibraryType, scope: PipelineScope): Promise<PipelineStage[]>;
  /** `PIP-05`: Get summary (dry run) for the current selection. */
  summary(summary: Omit<PipelineSummary, 'canStart' | 'cannotStartReason'>): Promise<PipelineSummary>;
  /** `PIP-06`: Get time estimate from run_stats. */
  estimate(libraryId: string, stages: string[], profile: string): Promise<{ min: number; max: number } | null>;
  /** `PIP-07`: Get available resource profiles (including user profiles). */
  resourceProfiles(libraryId: string): Promise<PipelineResourceProfile[]>;
  /** `PIP-08` / `PIP-10` / `PIP-21`: Job queue and drawer. */
  jobs(libraryId: string): Promise<PipelineJob[]>;
  startJob(job: Omit<PipelineJob, 'id' | 'state' | 'progress' | 'failures' | 'createdAt' | 'startedAt' | 'completedAt'>): Promise<PipelineJob>;
  pauseJob(jobId: string): Promise<void>;
  resumeJob(jobId: string): Promise<void>;
  stopJob(jobId: string): Promise<void>;
  retryFailures(jobId: string): Promise<void>;
  cancelQueuedJob(jobId: string): Promise<void>;
  /** `PIP-20`: Tray text. */
  trayText(): Promise<PipelineTray>;
  /** `PIP-13`: Maintenance actions. */
  maintenanceActions(libraryId: string): Promise<MaintenanceAction[]>;
  runMaintenance(libraryId: string, actionId: string): Promise<{ started: boolean }>;
  /** `PIP-11`: Use folder policies. */
  folderPolicies(libraryId: string): Promise<Record<string, { decompose: 'on' | 'off' | 'inherit'; ocr: 'on' | 'off' | 'inherit'; embeddings: 'on' | 'off' | 'inherit' }>>;
  /** `PIP-12`: Panel Studio / Cropper Lab. */
  runCropper(scope: { libraryId: string; folderIds: string[]; addAsLibrary: boolean }): Promise<{ jobId: string }>;
};