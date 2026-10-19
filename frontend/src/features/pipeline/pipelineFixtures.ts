// covers: PIP-01, PIP-02, PIP-03, PIP-04, PIP-05, PIP-06, PIP-07, PIP-08, PIP-09, PIP-10, PIP-11, PIP-12, PIP-13, PIP-20, PIP-21, PIP-22, PIP-23, PIP-24, TST-34
import type {
  PipelineSource,
  PipelineScope,
  PipelinePresetCard,
  PipelineStage,
  PipelineSummary,
  PipelineResourceProfile,
  PipelineJob,
  PipelineTray,
  MaintenanceAction,
} from './PipelineTypes';
import type { LibraryType } from '../explore/exploreTypes';
import { FIXTURE_LIBRARIES } from '../explore/exploreFixtures';

/**
 * Pipeline fixtures — deterministic, labelled as fixture data.
 *
 * The PipelineSource interface is the seam: the real backend replaces
 * this file's exports, and no screen code changes.
 */

const COMFYUI_PRESETS: PipelinePresetCard[] = [
  {
    id: 'quick',
    label: 'Quick',
    description: 'Thumbnails + metadata + text search (FTS). Fast, no model needed.',
    stages: ['discovery', 'metadata', 'thumbnails', 'fts'],
    needsModel: false,
    estimate: { min: 5, max: 15 },
  },
  {
    id: 'full',
    label: 'Full',
    description: 'Quick + text & image embeddings for semantic/visual search. Needs model runtime.',
    stages: ['discovery', 'metadata', 'thumbnails', 'fts', 'text_embeddings', 'image_embeddings'],
    needsModel: true,
    estimate: { min: 30, max: 120 },
  },
  {
    id: 'thumbnails_only',
    label: 'Thumbnails only',
    description: 'Render preview thumbnails. Safe: output files are disposable.',
    stages: ['thumbnails'],
    needsModel: false,
    estimate: { min: 2, max: 10 },
  },
  {
    id: 'embeddings_only',
    label: 'Embeddings only',
    description: 'Text & image vectors for semantic/visual search. Needs model runtime.',
    stages: ['text_embeddings', 'image_embeddings'],
    needsModel: true,
    estimate: { min: 20, max: 60 },
  },
];

const COMIC_PRESETS: PipelinePresetCard[] = [
  {
    id: 'quick',
    label: 'Quick',
    description: 'Thumbnails + metadata + text search (FTS). Fast, no model needed.',
    stages: ['discovery', 'metadata', 'thumbnails', 'fts'],
    needsModel: false,
    estimate: { min: 5, max: 15 },
  },
  {
    id: 'comic',
    label: 'Comic',
    description: 'Quick + dialogue detection on pages. Fast, no model needed.',
    stages: ['discovery', 'metadata', 'thumbnails', 'fts', 'dialogue'],
    needsModel: false,
    estimate: { min: 10, max: 25 },
  },
  {
    id: 'comic+panels',
    label: 'Comic + Panels',
    description: 'Comic + panel registration, thumbnails, text search, and vectors. Needs model runtime.',
    stages: [
      'discovery',
      'metadata',
      'thumbnails',
      'fts',
      'dialogue',
      'panel_registration',
      'panel_thumbnails',
      'panel_fts',
      'panel_text_embeddings',
      'panel_image_embeddings',
    ],
    needsModel: true,
    estimate: { min: 45, max: 180 },
  },
  {
    id: 'decompose_only',
    label: 'Decompose only',
    description: 'Run panel decomposition on comic pages. Needs cropper script.',
    stages: ['panel_registration'],
    needsModel: false,
    estimate: { min: 15, max: 45 },
  },
  {
    id: 'ocr_only',
    label: 'OCR only',
    description: 'Run OCR on dialogue regions. Needs OCR runtime.',
    stages: ['dialogue'],
    needsModel: true,
    estimate: { min: 20, max: 60 },
  },
  {
    id: 'embeddings_only',
    label: 'Embeddings only',
    description: 'Text & image vectors for panels. Needs model runtime.',
    stages: ['panel_text_embeddings', 'panel_image_embeddings'],
    needsModel: true,
    estimate: { min: 15, max: 45 },
  },
];

const USE_FOLDER_POLICIES: PipelinePresetCard = {
  id: 'folder_policies',
  label: 'Use folder policies',
  description: 'Stages computed per folder from folder policies (LIB-10).',
  stages: [],
  needsModel: false,
  estimate: { min: 0, max: 0 },
  fromPolicies: true,
};

const STAGE_DEFS: Record<string, Omit<PipelineStage, 'counts' | 'reRunEvenIfDone'>> = {
  discovery: { id: 'discovery', label: 'Discover files', description: 'Scan the selected folder and enumerate media and text files.', needsModel: false, enables: 'All stages', requires: [] },
  metadata: { id: 'metadata', label: 'Read metadata', description: 'Extract metadata tags (model, sampler, LoRA, etc.) from files.', needsModel: false, enables: 'Model/sampler/LoRA filters', requires: ['discovery'] },
  thumbnails: { id: 'thumbnails', label: 'Thumbnails', description: 'Render preview thumbnails for media files.', needsModel: false, enables: 'Preview in gallery/viewer', requires: ['discovery'] },
  fts: { id: 'fts', label: 'Text search (FTS)', description: 'Index text files into the full-text search engine.', needsModel: false, enables: 'Keyword search', requires: ['discovery'] },
  text_embeddings: { id: 'text_embeddings', label: 'Text embeddings', description: 'Compute semantic vectors for text records.', needsModel: true, enables: 'Semantic search', requires: ['metadata'] },
  image_embeddings: { id: 'image_embeddings', label: 'Image embeddings', description: 'Compute semantic vectors for images.', needsModel: true, enables: 'Visual search', requires: ['metadata'] },
  audio_embeddings: { id: 'audio_embeddings', label: 'Audio embeddings', description: 'Compute semantic vectors for audio files.', needsModel: true, enables: 'Audio semantic search', requires: ['metadata'] },
  video_embeddings: { id: 'video_embeddings', label: 'Video embeddings', description: 'Compute semantic vectors for video files.', needsModel: true, enables: 'Video semantic search', requires: ['metadata'] },
  finalization: { id: 'finalization', label: 'Finalize job', description: 'Commit final counts and close the job cleanly.', needsModel: false, enables: '', requires: [] },
  panel_registration: { id: 'panel_registration', label: 'Register panels', description: 'Honesty check: flag panels whose crop file has disappeared.', needsModel: false, enables: 'Panel scope', requires: ['discovery'] },
  panel_thumbnails: { id: 'panel_thumbnails', label: 'Panel thumbnails', description: 'Render a preview for each panel crop.', needsModel: false, enables: 'Panel preview', requires: ['panel_registration'] },
  panel_fts: { id: 'panel_fts', label: 'Panel text search', description: 'Index each panel with its page filename and prompt, so a panel is findable by text.', needsModel: false, enables: 'Panel keyword search', requires: ['panel_registration'] },
  panel_text_embeddings: { id: 'panel_text_embeddings', label: 'Panel text vectors', description: 'Semantic vectors over panel text.', needsModel: true, enables: 'Panel semantic search', requires: ['panel_registration'] },
  panel_image_embeddings: { id: 'panel_image_embeddings', label: 'Panel image vectors', description: 'Image-content vectors for each panel.', needsModel: true, enables: 'Panel visual search', requires: ['panel_registration'] },
  dialogue: { id: 'dialogue', label: 'Dialogue regions', description: 'Detect dialogue balloons and group them by fill colour. Detects regions only — no OCR is bundled, so no text is read.', needsModel: false, enables: 'Dialogue review', requires: ['discovery'] },
};

export function createFixturePipelineSource(): PipelineSource {
  let jobCounter = 0;
  const jobs: PipelineJob[] = [];

  function makeJobId(): string {
    return `job-${Date.now()}-${++jobCounter}`;
  }

  return {
    isFixtureData: true,

    async folderTreeSelect(libraryId: string) {
      const lib = FIXTURE_LIBRARIES.find((l) => l.id === libraryId);
      // Return a mock folder tree
      return [
        { id: libraryId, label: lib?.name ?? 'Library', parentId: null, isRoot: true, count: 1000, status: 'done', children: [
          { id: 'folder-1', label: 'Folder A', parentId: libraryId, isRoot: false, count: 300, status: 'done', children: [] },
          { id: 'folder-2', label: 'Folder B', parentId: libraryId, isRoot: false, count: 700, status: 'done', children: [] },
        ]},
      ];
    },

    async presets(libraryType: LibraryType): Promise<PipelinePresetCard[]> {
      if (libraryType === 'comic') {
        return [...COMIC_PRESETS, USE_FOLDER_POLICIES];
      }
      return [...COMFYUI_PRESETS, USE_FOLDER_POLICIES];
    },

    async stages(_libraryType: LibraryType, _scope: PipelineScope): Promise<PipelineStage[]> {
      // Determine which preset's stages to show based on scope
      // For fixture, just return all stages
      return Object.entries(STAGE_DEFS).map(([_id, def]) => ({
        ...def,
        counts: {
          done: Math.floor(Math.random() * 5000),
          toDo: Math.floor(Math.random() * 1000),
          failed: Math.floor(Math.random() * 10),
          stale: Math.floor(Math.random() * 50),
        },
        reRunEvenIfDone: false,
      }));
    },

    async summary(input: Omit<PipelineSummary, 'canStart' | 'cannotStartReason'>): Promise<PipelineSummary> {
      const toProcess = input.counts?.toProcess ?? 0;
      const alreadyDone = input.counts?.alreadyDone ?? 0;
      const stale = input.counts?.stale ?? 0;
      const failed = input.counts?.failed ?? 0;

      return {
        ...input,
        counts: { toProcess, alreadyDone, stale, failed },
        runtimeNote: input.stages.some((s) => STAGE_DEFS[s]?.needsModel)
          ? 'Needs the model runtime — it will start automatically'
          : 'Model runtime is not needed for these stages',
        estimate: { min: 10, max: 45 },
        canStart: toProcess > 0,
        cannotStartReason: toProcess === 0
          ? 'Everything in this scope is already processed. Enable "Re-run even if done" to repeat.'
          : undefined,
      };
    },

    async estimate(_libraryId: string, stages: string[], _profile: string): Promise<{ min: number; max: number } | null> {
      // Simulate estimate based on stages
      if (stages.length === 0) return null;
      const base = stages.length * 5;
      return { min: base * 0.75, max: base * 1.25 };
    },

    async resourceProfiles(_libraryId: string): Promise<PipelineResourceProfile[]> {
      return [
        'balanced',
        'low_impact',
        'high_throughput',
        'battery_aware',
        'idle_only',
        'max_speed',
        { id: 'user-1', label: 'My Profile', effect: 'Balanced with GPU acceleration' },
      ];
    },

    async jobs(libraryId: string): Promise<PipelineJob[]> {
      return jobs.filter((j) => j.libraryId === libraryId);
    },

    async startJob(jobInput: Omit<PipelineJob, 'id' | 'state' | 'progress' | 'failures' | 'createdAt' | 'startedAt' | 'completedAt'>): Promise<PipelineJob> {
      const job: PipelineJob = {
        ...jobInput,
        id: makeJobId(),
        state: 'running',
        progress: {
          stage: 'discovery',
          done: 0,
          total: 1000,
          elapsedSeconds: 0,
          itemsPerSecond: 10,
          etaSeconds: 100,
          message: 'Scanning folder...',
        },
        failures: [],
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
      };
      jobs.push(job);
      return job;
    },

    async pauseJob(jobId: string): Promise<void> {
      const job = jobs.find((j) => j.id === jobId);
      if (job && job.state === 'running') {
        job.state = 'paused';
      }
    },

    async resumeJob(jobId: string): Promise<void> {
      const job = jobs.find((j) => j.id === jobId);
      if (job && job.state === 'paused') {
        job.state = 'running';
      }
    },

    async stopJob(jobId: string): Promise<void> {
      const job = jobs.find((j) => j.id === jobId);
      if (job && (job.state === 'running' || job.state === 'paused')) {
        job.state = 'stopping';
        setTimeout(() => {
          job.state = 'completed_with_failures';
          job.completedAt = new Date().toISOString();
        }, 500);
      }
    },

    async retryFailures(jobId: string): Promise<void> {
      const job = jobs.find((j) => j.id === jobId);
      if (job) {
        job.failures = [];
      }
    },

    async cancelQueuedJob(jobId: string): Promise<void> {
      const idx = jobs.findIndex((j) => j.id === jobId);
      if (idx >= 0 && jobs[idx].state === 'queued') {
        jobs.splice(idx, 1);
      }
    },

    async trayText(): Promise<PipelineTray> {
      const runningJob = jobs.find((j) => j.state === 'running' || j.state === 'paused');
      if (!runningJob) return { text: 'Ready', canPause: false, canStop: false };
      return {
        text: `Indexing — ${runningJob.progress.stage} ${runningJob.progress.done} / ${runningJob.progress.total} — ${runningJob.progress.etaSeconds ? `${Math.round(runningJob.progress.etaSeconds / 60)} min left` : 'calculating...'}`,
        canPause: runningJob.state === 'running',
        canStop: runningJob.state === 'running' || runningJob.state === 'paused',
      };
    },

    async maintenanceActions(_libraryId: string): Promise<MaintenanceAction[]> {
      return [
        {
          id: 'check_new',
          label: 'Check for new files',
          description: 'Compare directory mtimes against catalog; produce a report of new/changed/missing files.',
          reads: ['filesystem mtimes', 'catalog'],
          mayUpdate: ['catalog (user choice)'],
          startsRuntime: false,
          estimate: { min: 1, max: 5 },
        },
        {
          id: 'verify_files',
          label: 'Verify files (find missing)',
          description: 'Mark catalog items whose source file is gone as missing.',
          reads: ['catalog', 'filesystem'],
          mayUpdate: ['items.missing'],
          startsRuntime: false,
          estimate: { min: 2, max: 10 },
        },
        {
          id: 'integrity_check',
          label: 'Integrity check',
          description: 'Verify all catalog items have valid thumbnails/previews and readable source files.',
          reads: ['catalog', 'thumbnails', 'previews', 'filesystem'],
          mayUpdate: ['catalog.missing', 'thumbnails', 'previews'],
          startsRuntime: false,
          estimate: { min: 5, max: 30 },
        },
        {
          id: 'verify_cached',
          label: 'Verify cached assets / find orphan thumbnails',
          description: 'Find thumbnail/preview files that no longer have a catalog item.',
          reads: ['catalog', 'thumbnail cache', 'preview cache'],
          mayUpdate: ['thumbnails', 'previews (orphan removal)'],
          startsRuntime: false,
          estimate: { min: 2, max: 15 },
        },
        {
          id: 'rebuild_text_index',
          label: 'Rebuild text index',
          description: 'Recreate the FTS index from stored metadata and OCR text.',
          reads: ['catalog.metadata', 'catalog.text'],
          mayUpdate: ['FTS index'],
          startsRuntime: false,
          estimate: { min: 5, max: 20 },
        },
        {
          id: 'find_duplicates',
          label: 'Find near duplicates',
          description: 'Compare perceptual hashes; flag near-duplicate groups for review.',
          reads: ['catalog.phash'],
          mayUpdate: ['duplicate groups (user review)'],
          startsRuntime: false,
          estimate: { min: 10, max: 60 },
        },
        {
          id: 'clear_caches',
          label: 'Clear caches',
          description: 'Remove app-owned derivatives (thumbnails, previews, crops). Originals are never included.',
          reads: ['thumbnails', 'previews', 'panel crops'],
          mayUpdate: ['thumbnails', 'previews', 'panel crops (cache only)'],
          startsRuntime: false,
          estimate: { min: 1, max: 5 },
        },
      ];
    },

    async runMaintenance(_libraryId: string, _actionId: string): Promise<{ started: boolean }> {
      return { started: true };
    },

    async folderPolicies(_libraryId: string): Promise<Record<string, { decompose: 'on' | 'off' | 'inherit'; ocr: 'on' | 'off' | 'inherit'; embeddings: 'on' | 'off' | 'inherit' }>> {
      return {};
    },

    async runCropper(_scope: { libraryId: string; folderIds: string[]; addAsLibrary: boolean }): Promise<{ jobId: string }> {
      return { jobId: makeJobId() };
    },
  };
}

export const FIXTURE_PIPELINE_SOURCE = createFixturePipelineSource();
export { STAGE_DEFS };