import type { UnlistenFn } from '@tauri-apps/api/event';
import { invoke, transportCall, transportListen } from './platform/transport';

// Re-export `invoke` for components that need direct Tauri command access. It
// still goes through the adapter, so a component calling it gets the same
// behaviour as `api.*` rather than bypassing the dev backend.
export { invoke } from './platform/transport';
import type {
  AppSettings,
  AppSettingsResult,
  Capabilities,
  CatalogFilters,
  CropperFinished,
  CropperImageCount,
  CropperIntegrity,
  CropperProgress,
  CropperStarted,
  EmbeddingStatus,
  Facets,
  ImageDetail,
  ImageRecord,
  IndexingPreflight,
  IndexingProgressEvent,
  LibraryRecord,
  ModelStatus,
  PromptExtractionDiagnostics,
  PromptExplanation,
  ResourceProfile,
  SearchMode,
  SettingsInfo,
  UnitScope,
  PanelResult,
  DialogueListResult,
  IndexingPreset,
  BatchRecoveryScanResult,
  BatchPromptPreview,
  BatchRecoveryStatus,
  BatchRecoveryAcceptParams,
  BatchRecoveryAcceptResult,
} from './types';

async function call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return transportCall<T>(method, params);
}

/**
 * Subscribe to a backend event.
 *
 * Routed through the adapter so a screen works unchanged against Tauri and
 * against the dev backend. Every subscription resolves to an unsubscribe
 * function, including when no backend is present - see `transportListen`.
 */
function on<T>(event: string, cb: (payload: T) => void): Promise<UnlistenFn> {
  return transportListen(event, (payload) => cb(payload as T));
}

export const api = {
  handshake: () =>
    call<{ protocol_version: string; status: string; pid: number; data_dir: string }>('handshake'),

  // ---- settings & model -------------------------------------------------
  getSettings: (modelsRoot?: string) => call<SettingsInfo>('get_settings', modelsRoot ? { models_root: modelsRoot } : {}),

  validateModel: (params: {
    models_root?: string;
    model_path?: string;
    mmproj_path?: string;
    server_exe?: string;
    port?: number;
  }) =>
    call<{ ok: boolean; errors: string[]; capabilities: Capabilities | null; runtime_config: Record<string, string> | null }>(
      'validate_model',
      params,
    ),

  startModel: (params: { models_root?: string; model_path?: string; mmproj_path?: string; server_exe?: string; port?: number }) =>
    call<{
      status: string;
      dimension: number;
      config: Record<string, unknown>;
      base_url: string;
      embedding?: { status: string; reason?: string; libraries?: string[]; error?: string };
    }>(
      'start_model',
      params,
    ),

  stopModel: () => call<{ status: string }>('stop_model'),

  modelStatus: () => call<ModelStatus>('model_status'),

  embeddingStatus: (libraryId?: string) =>
    call<EmbeddingStatus>('embedding_status', libraryId ? { library_id: libraryId } : {}),

  embedPending: (params: { libraryId?: string; modalities?: string[]; stages?: string[]; profile?: ResourceProfile } = {}) =>
    call<{ status: string; reason?: string; stages?: string[]; libraries?: string[] }>('embed_pending', {
      library_id: params.libraryId,
      modalities: params.modalities,
      stages: params.stages,
      profile: params.profile,
    }),

  embedProbe: (modality: string, value: string) =>
    call<{ modality: string; dimension: number; l2_norm: number; preview: number[] }>('embed_probe', {
      modality,
      value,
    }),

  // ---- libraries --------------------------------------------------------
  registerLibrary: async (rootPath: string, name?: string) => {
    // Grant the webview read access to exactly the folder the user chose.
    try {
      console.log('[registerLibrary] Granting library root:', rootPath);
      await invoke('allow_directory', { path: rootPath });
      console.log('[registerLibrary] Library root granted:', rootPath);
    } catch (e) {
      console.error('[registerLibrary] Failed to grant library root:', rootPath, e);
    }
    // Also grant cache directory for thumbnails (portable mode fix)
    try {
      const settings = await api.getSettings();
      if (settings?.cache_dir) {
        console.log('[registerLibrary] Granting cache directory:', settings.cache_dir);
        await invoke('allow_directory', { path: settings.cache_dir });
        console.log('[registerLibrary] Cache directory granted successfully');
      }
    } catch (e) {
      console.warn('[registerLibrary] Failed to grant cache directory:', e);
    }
    return call<{ library: LibraryRecord; note: string }>('register_library', { root_path: rootPath, name });
  },
  listLibraries: () => call<{ libraries: LibraryRecord[] }>('list_libraries'),
  removeLibrary: (libraryId: string) =>
    call<{ removed: string; root_path: string; note: string }>('remove_library', { library_id: libraryId }),

  // ---- browsing & search -----------------------------------------------
  browse: (params: { libraryId?: string; limit?: number; offset?: number; sort?: string; filters?: CatalogFilters }) =>
    call<{ items: ImageRecord[]; count: number; total: number }>('browse', {
      library_id: params.libraryId,
      limit: params.limit ?? 200,
      offset: params.offset ?? 0,
      sort: params.sort ?? 'mtime_desc',
      filters: params.filters,
    }),

  search: (params: {
    mode: SearchMode;
    query?: string;
    limit?: number;
    offset?: number;
    libraryId?: string;
    imageId?: string;
    vectorMode?: 'semantic' | 'visual';
    filters?: CatalogFilters;
    unitScope?: UnitScope;
    sources?: string[];
  }) =>
    // Panel-scope results are a different shape (parent link + panel number),
    // so the union is explicit rather than typed as ImageRecord and lied about.
    call<{
      items: (ImageRecord | PanelResult)[];
      count: number;
      mode: string;
      unit_scope: UnitScope;
      total: number;
    }>('search', {
      mode: params.mode,
      query: params.query ?? '',
      limit: params.limit ?? 60,
      offset: params.offset ?? 0,
      library_id: params.libraryId,
      image_id: params.imageId,
      vector_mode: params.vectorMode ?? 'semantic',
      sources: params.sources,
      filters: params.filters,
      unit_scope: params.unitScope ?? 'image',
    }),

  getImageDetail: (imageId: string) => call<ImageDetail>('get_image_detail', { image_id: imageId }),

  /**
   * The neighbouring image in the current filtered/sorted sequence, crossing
   * page boundaries. Returns `{ image: null, at_boundary: true }` at the ends
   * rather than an error, so the viewer can simply stop.
   */
  getAdjacentImage: (params: {
    currentImageId: string;
    direction: 'prev' | 'next';
    libraryId?: string;
    sort?: string;
    filters?: CatalogFilters;
  }) =>
    call<{ image: ImageRecord | null; at_boundary: boolean }>('get_adjacent_image', {
      current_image_id: params.currentImageId,
      direction: params.direction,
      library_id: params.libraryId,
      sort: params.sort ?? 'mtime_desc',
      filters: params.filters,
    }),

  /**
   * Schedule dialogue/OCR for explicitly selected folders inside a library.
   * The backend validates every folder against the library root and processes
   * only pages inside the scope.
   */
  startFolderOcr: (params: {
    libraryId: string;
    folderPaths: string[];
    stages?: string[];
    profile?: ResourceProfile;
  }) =>
    call<{
      status: string;
      job_id: string;
      library_id: string;
      folders: string[];
      stages: string[];
      scopes?: string[];
      profile: string;
      reason?: string;
      note?: string;
    }>('start_folder_ocr', {
      library_id: params.libraryId,
      folder_paths: params.folderPaths,
      stages: params.stages,
      profile: params.profile,
    }),

  // ---- catalog facets & saved filters -----------------------------------
  getFacets: (libraryId?: string) =>
    call<{ facets: Facets }>('get_facets', { library_id: libraryId }),
  getLibraryPrefs: (libraryId: string) =>
    call<{ library_id: string; filters: CatalogFilters; sources?: string[] | null }>('get_library_prefs', { library_id: libraryId }),
  setLibraryPrefs: (libraryId: string, filters: CatalogFilters, sources?: string[]) =>
    call<{ status: string }>('set_library_prefs', { library_id: libraryId, filters, sources }),

  // ---- indexing ---------------------------------------------------------
  startIndexing: (params: {
    libraryRoot: string;
    libraryId?: string;
    stages?: string[];
    profile?: ResourceProfile;
    batchSize?: number;
    resumeJobId?: string;
    forceStages?: string[];
    skipCompleted?: boolean;
  }) =>
    call<{ status: string; library_root: string; profile: string; stages: string[] } | IndexingPreflight & { status: string }>('start_indexing', {
      library_root: params.libraryRoot,
      library_id: params.libraryId ?? 'default',
      stages: params.stages,
      profile: params.profile,
      batch_size: params.batchSize,
      resume_job_id: params.resumeJobId,
      force_stages: params.forceStages,
      skip_completed: params.skipCompleted,
    }),

  indexPreflight: (params: { libraryId?: string; stages?: string[] } = {}) =>
    call<IndexingPreflight>('index_preflight', {
      library_id: params.libraryId ?? 'default',
      stages: params.stages,
    }),

  // ---- presets -----------------------------------------------------------
  listPresets: (libraryId?: string) =>
    call<{ presets: IndexingPreset[]; active_preset_id: string | null }>('list_presets', {
      library_id: libraryId,
    }),

  /**
   * Change a library's preset. Affects which stages default to selected on the
   * next run; it does not start indexing and does not invalidate existing
   * vectors, so switching from `comfy` to `comic` never silently re-embeds a
   * whole library behind the user's back.
   */
  setLibraryPreset: (libraryId: string, presetId: string) =>
    call<{ library_id: string; active_preset_id: string }>('set_library_preset', {
      library_id: libraryId,
      preset_id: presetId,
    }),

  // ---- dialogue ----------------------------------------------------------
  dialogueList: (params: {
    libraryId?: string;
    groupId?: string;
    scope?: 'image' | 'panel';
    /** Queue filter. Omit for no filter; false selects "not yet reviewed". */
    reviewed?: boolean;
    limit?: number;
    offset?: number;
  } = {}) =>
    call<DialogueListResult>('dialogue_list', {
      library_id: params.libraryId,
      group_id: params.groupId,
      scope: params.scope,
      reviewed: params.reviewed,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    }),

  /**
   * `action` is one of accept | split | merge | set_text. Manual text is stored
   * with `text_source='manual'` and is never overwritten by a later extraction
   * run, so a reviewer's correction survives re-indexing.
   */
  dialogueSetGroup: (params: {
    libraryId?: string;
    action: 'accept' | 'split' | 'merge' | 'set_text';
    groupId?: string;
    mergeFrom?: string[];
    unitId?: string;
    text?: string;
  }) =>
    call<{ status: string; action: string }>('dialogue_set_group', {
      library_id: params.libraryId,
      action: params.action,
      group_id: params.groupId,
      merge_from: params.mergeFrom,
      unit_id: params.unitId,
      text: params.text,
    }),

  /**
   * Save a hand-corrected transcript. The backend captures the machine reading
   * on the first correction and never overwrites it, so the original stays
   * available to show beside the correction and to restore.
   */
  dialogueSetText: (params: { libraryId: string; unitId: string; text: string }) =>
    call<{ status: string; action: string; text: string }>('dialogue_set_text', {
      library_id: params.libraryId,
      unit_id: params.unitId,
      text: params.text,
    }),

  /**
   * Record a lettering-colour decision.
   *
   * `approve` confirms the measurement and is refused when nothing was reliably
   * measured - approving an unknown colour would assert a colour nobody saw.
   * `manual` stores a chosen colour alongside the measurement rather than over
   * it, so the estimate it replaced is still readable.
   */
  dialogueSetInk: (params: {
    libraryId: string;
    unitId: string;
    inkAction: 'approve' | 'manual' | 'unknown' | 'reset';
    rgb?: string;
  }) =>
    call<{ status: string; action: string }>('dialogue_set_ink', {
      library_id: params.libraryId,
      unit_id: params.unitId,
      ink_action: params.inkAction,
      rgb: params.rgb,
    }),

  dialogueSetReviewed: (params: { libraryId: string; unitId: string; reviewed: boolean }) =>
    call<{ status: string; action: string; reviewed: boolean }>('dialogue_set_reviewed', {
      library_id: params.libraryId,
      unit_id: params.unitId,
      reviewed: params.reviewed,
    }),

  // ---- application-wide settings (the canonical store) ------------------
  //
  // One owner per durable preference. Per-tab quick controls call these
  // same methods, so a toggle in the Workbench and its twin in Settings can
  // never drift apart.
  getAppSettings: () =>
    call<AppSettingsResult>('get_app_settings'),

  /**
   * Write settings. Only the keys present are changed, so two surfaces saving
   * different settings do not clobber each other.
   */
  setAppSettings: (settings: Partial<AppSettings>) =>
    call<AppSettingsResult>('set_app_settings', { settings }),

  /** Reset the named settings to their defaults. Omit `keys` to reset none. */
  resetAppSettings: (keys: string[]) =>
    call<AppSettingsResult>('reset_app_settings', { keys }),

  pauseIndexing: () => call<{ status: string }>('pause_indexing'),
  resumeIndexing: () => call<{ status: string }>('resume_indexing'),
  stopIndexing: () => call<{ status: string }>('stop_indexing'),
  indexingStatus: () => call<Record<string, unknown>>('indexing_status'),
  retryFailures: (params: { jobId?: string; stage?: string; libraryId?: string } = {}) =>
    call<{ reset: number; scope: { job_id: string | null; stage: string | null; library_id: string | null } }>(
      'retry_failures',
      { job_id: params.jobId, stage: params.stage, library_id: params.libraryId },
    ),
  jobDetail: (jobId: string) => call<Record<string, unknown>>('job_detail', { job_id: jobId }),

  // ---- prompt extraction diagnostics ------------------------------------
  promptExtractionDiagnostics: (params: { libraryId?: string; sample?: number } = {}) =>
    call<PromptExtractionDiagnostics>('prompt_extraction_diagnostics', {
      library_id: params.libraryId,
      sample: params.sample,
    }),

  explainImagePrompt: (imageId: string) =>
    call<PromptExplanation>('explain_image_prompt', { image_id: imageId }),

  // ---- storage ----------------------------------------------------------
  databaseInfo: () => call<Record<string, unknown>>('database_info'),
  backupDatabase: (dest?: string) => call<{ backup: string; size_bytes: number }>('backup_database', { dest }),
  restoreDatabase: (src: string) => call<{ restored: string }>('restore_database', { src }),
  resetDatabase: () => call<{ status: string; note: string }>('reset_database', { confirm: true }),

  // ---- panel studio -----------------------------------------------------
  cropperIntegrity: (scriptPath = 'panel_folder_cropper_v11.py') =>
    call<CropperIntegrity>('cropper_integrity', { script_path: scriptPath }),
  runCropper: (
    inputFolder: string,
    outputFolder: string,
    libraryId?: string,
    scriptPath = 'panel_folder_cropper_v11.py',
  ) =>
    call<{ status: string; note: string }>('run_cropper', {
      input_folder: inputFolder,
      output_folder: outputFolder,
      library_id: libraryId,
      script_path: scriptPath,
    }),
  runCropperOnFile: (inputFile: string, outputFolder: string, libraryId?: string, scriptPath = 'panel_folder_cropper_v11.py') =>
    call<{ status: string; note: string }>('run_cropper', {
      input_file: inputFile,
      output_folder: outputFolder,
      library_id: libraryId,
      script_path: scriptPath,
    }),
  countCropperImages: (params: { input_file?: string; input_folder?: string }) =>
    call<CropperImageCount>('count_cropper_images', params),

  // ---- dialogs ----------------------------------------------------------
  openDirectory: async (title = 'Select folder'): Promise<string | null> => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title });
      return typeof selected === 'string' ? selected : null;
    } catch {
      return null;
    }
  },

  allowDirectory: async (path: string): Promise<void> => {
    try {
      await invoke('allow_directory', { path });
    } catch {
      // Non-fatal: the cache directory is already in the asset scope.
    }
  },

  // ---- events -----------------------------------------------------------
  onIndexingProgress: (cb: (e: IndexingProgressEvent) => void): Promise<UnlistenFn> =>
    on<IndexingProgressEvent>('indexing_progress', cb),
  onIndexingFinished: (cb: (e: Record<string, unknown>) => void): Promise<UnlistenFn> =>
    on<Record<string, unknown>>('indexing_finished', cb),
  onIndexingError: (cb: (e: { error: string }) => void): Promise<UnlistenFn> =>
    on<{ error: string }>('indexing_error', cb),
  onCropperProgress: (cb: (e: CropperProgress) => void): Promise<UnlistenFn> =>
    on<CropperProgress>('cropper_progress', cb),
  onCropperStarted: (cb: (e: CropperStarted) => void): Promise<UnlistenFn> =>
    on<CropperStarted>('cropper_started', cb),
  onCropperFinished: (cb: (e: CropperFinished) => void): Promise<UnlistenFn> =>
    on<CropperFinished>('cropper_finished', cb),
  onCropperError: (cb: (e: { error: string }) => void): Promise<UnlistenFn> =>
    on<{ error: string }>('cropper_error', cb),
  onModelCapabilities: (cb: (e: Capabilities) => void): Promise<UnlistenFn> =>
    on<Capabilities>('model_capabilities', cb),
  onModelStatus: (cb: (e: Record<string, unknown>) => void): Promise<UnlistenFn> =>
    on<Record<string, unknown>>('model_status', cb),
  onWorkerExit: (cb: () => void): Promise<UnlistenFn> =>
    transportListen('worker_exit', () => cb()),
  onWorkerRestarted: (cb: () => void): Promise<UnlistenFn> =>
    transportListen('worker_restarted', () => cb()),

  // ---- batch prompt recovery -----------------------------------------------
  batchRecoveryScan: (libraryId?: string) =>
    call<BatchRecoveryScanResult>('batch_recovery_scan', libraryId ? { library_id: libraryId } : {}),
  batchRecoveryPreview: (groupId: string, libraryId?: string) =>
    call<BatchPromptPreview>('batch_recovery_preview', { group_id: groupId, library_id: libraryId }),
  batchRecoveryAccept: (params: BatchRecoveryAcceptParams) =>
    call<BatchRecoveryAcceptResult>('batch_recovery_accept', params as Record<string, unknown>),
  batchRecoveryStatus: (libraryId?: string) =>
    call<BatchRecoveryStatus>('batch_recovery_status', libraryId ? { library_id: libraryId } : {}),
};