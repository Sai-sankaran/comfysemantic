/**
 * The settings registry (design §12, `SET-01`).
 *
 * Every setting is one entry. The design makes this the *single* source for the
 * Settings screen, the View menu, the search box, import/export and the backend
 * validator; this module is that source, transcribed from `design.md` §12.2.
 *
 * Layering follows §12.1 and is deliberately **display-ready before it is
 * persisted**: `resolve()` computes the effective value and its origin from
 * folder → library → app → default, which is the whole of `SET-02`. Only the
 * three keys the backend already stores (`theme`, `density`, `text_scale`) are
 * written through today; the rest are held for the session and the screen says so
 * plainly. Persisting library/folder scopes needs the settings-registry
 * integration stage, and this module is the typed contract that stage will
 * consume — it is deliberately not a second, competing source of truth.
 */

/** Value shapes the design allows (`SET-01`). */
export type SettingType =
  | 'bool'
  | 'int'
  | 'float'
  | 'enum'
  | 'string'
  | 'path'
  | 'hex'
  | 'json'
  | 'list'
  | 'id';

export type SettingValue = string | number | boolean | null | unknown[] | Record<string, unknown>;

/** Scope codes from §12.2: **A** app, **L** library, **F** folder. */
export type SettingScope = 'app' | 'library' | 'folder';

export type SettingCategory =
  | 'appearance'
  | 'browsing'
  // `E.5` introduces the `privacy.*` keys, so the category is new too. It sits
  // after browsing because that is where a user looks for it.
  | 'privacy'
  | 'search'
  | 'processing'
  | 'comics'
  | 'ocr'
  | 'runtime'
  | 'storage'
  | 'shortcuts'
  | 'advanced';

export type SettingConstraints = {
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  /** An int that may also be the literal string `auto` (`proc.workerThreadsMax`). */
  autoOption?: boolean;
  /** A hex colour without the leading `#`. */
  pattern?: RegExp;
  /**
   * The value may be empty (`§12.2`: "float 0–1 **or null**"). An empty value
   * means "off", which is not the same as zero, so it has to be explicit rather
   * than inferred from a default.
   */
  nullable?: boolean;
};

export type SettingEntry = {
  key: string;
  type: SettingType;
  default: SettingValue;
  allowedScopes: readonly SettingScope[];
  category: SettingCategory;
  label: string;
  description: string;
  /** Extra search terms for `SET-05`, beyond key/label/description. */
  keywords?: readonly string[];
  constraints?: SettingConstraints;
  /** Applying it needs a restart (`SET-03` chip). */
  restartRequired?: boolean;
  /** Part of a processing profile (`SET-07`, "P" in §12.2). */
  profileable?: boolean;
  /**
   * `SET-10`: a setting for something that does not exist in this build or
   * library type is *not shown*. The predicate is evaluated against the current
   * library type; returning false hides the row entirely.
   */
  visibleWhen?: (context: { libraryType: 'comfyui' | 'comic' | 'none' }) => boolean;
  /** Shown instead of the raw key on the row. */
  options?: readonly string[];
};

/**
 * `SET-01` lists `visibleWhen` as "for example library type". Library type does
 * not exist in the schema yet (owner decision O-3), so the default is "visible":
 * hiding a row is worse than showing a comic setting in a ComfyUI library, and
 * `SET-10` can be applied properly once the type column exists.
 */
const always = () => true;

/**
 * `PRV-09`, verbatim.
 *
 * This sentence is the reason the feature exists safely: it stops anyone treating
 * a display mask as protection against screenshots, screen sharing or Alt+Tab.
 * It is imported rather than retyped so the Settings row, the category hint and
 * any future surface cannot drift apart.
 */
const PRIVACY_DESCRIPTION =
  "Display mask only. It doesn't encrypt anything and doesn't affect screenshots, screen sharing, Alt+Tab previews or exported files.";

export const CATEGORY_ORDER: readonly SettingCategory[] = [
  'appearance',
  'browsing',
  'privacy',
  'search',
  'processing',
  'comics',
  'ocr',
  'runtime',
  'storage',
  'shortcuts',
  'advanced',
];

export const CATEGORY_LABEL: Record<SettingCategory, string> = {
  appearance: 'Appearance',
  browsing: 'Browsing',
  privacy: 'Privacy',
  search: 'Search',
  processing: 'Processing',
  comics: 'Comics',
  ocr: 'OCR & review',
  runtime: 'Models & runtime',
  storage: 'Storage',
  shortcuts: 'Shortcuts',
  advanced: 'Advanced & diagnostics',
};

/** What each category is for, shown above its rows. */
export const CATEGORY_HINT: Partial<Record<SettingCategory, string>> = {
  // `PRV-09`: the disclaimer is the category hint as well as the row
  // description, so it is the first thing a user reads on the way in.
  privacy: PRIVACY_DESCRIPTION,
  processing: 'Profiles are built from the settings marked profileable below.',
  shortcuts:
    'Shortcuts are fixed in v1 and generated from the action registry, not from this registry. Press ? to see the list.',
  advanced: 'Diagnostics, logging and the performance overlay live here and on the Diagnostics page.',
};

function entry(e: SettingEntry): SettingEntry {
  return { visibleWhen: always, ...e };
}

export const SETTINGS_REGISTRY: readonly SettingEntry[] = [
  // ---------------------------------------------------------------- Appearance
  entry({
    key: 'appearance.theme',
    type: 'enum',
    default: 'dark',
    allowedScopes: ['app'],
    category: 'appearance',
    label: 'Theme',
    description: 'Colour theme. Windows forced-colours mode overrides tokens when active.',
    keywords: ['dark', 'light', 'contrast', 'colour', 'color'],
    constraints: { options: ['dark', 'light', 'high-contrast'] },
  }),
  entry({
    key: 'appearance.accent',
    type: 'enum',
    default: 'none',
    allowedScopes: ['app'],
    category: 'appearance',
    label: 'Accent colour',
    description: 'Accent colour. Colour appears only where it carries meaning.',
    keywords: ['highlight', 'selection'],
    constraints: { options: ['none', 'blue', 'violet', 'teal', 'pink', 'custom'] },
  }),
  entry({
    key: 'appearance.accentCustom',
    type: 'hex',
    default: '#5B9CF6',
    allowedScopes: ['app'],
    category: 'appearance',
    label: 'Custom accent',
    description: 'Used when the accent is set to custom.',
    keywords: ['colour', 'color', 'hex'],
    constraints: { pattern: /^#[0-9A-Fa-f]{6}$/ },
  }),
  entry({
    key: 'appearance.density',
    type: 'enum',
    default: 'comfortable',
    allowedScopes: ['app'],
    category: 'appearance',
    label: 'Density',
    description: 'Control and row sizes. Never changes the font size.',
    keywords: ['compact', 'spacious', 'spacing'],
    constraints: { options: ['compact', 'comfortable', 'spacious'] },
  }),
  entry({
    key: 'appearance.textScale',
    type: 'int',
    default: 100,
    allowedScopes: ['app'],
    category: 'appearance',
    label: 'Text size',
    description: 'Text size as a percentage. Replaces browser zoom.',
    keywords: ['font', 'zoom', 'scale', 'accessibility'],
    constraints: { min: 80, max: 200, step: 10 },
  }),
  entry({
    key: 'appearance.reduceMotion',
    type: 'enum',
    default: 'system',
    allowedScopes: ['app'],
    category: 'appearance',
    label: 'Reduce motion',
    description: 'Disable animation. System follows the Windows setting.',
    keywords: ['animation', 'accessibility', 'transitions'],
    constraints: { options: ['system', 'on', 'off'] },
  }),
  entry({
    key: 'appearance.rail',
    type: 'enum',
    default: 'auto',
    allowedScopes: ['app'],
    category: 'appearance',
    label: 'Navigation rail',
    description: 'Expanded at 1280 px and wider when set to auto.',
    keywords: ['sidebar', 'collapse'],
    constraints: { options: ['auto', 'expanded', 'collapsed'] },
  }),
  entry({
    key: 'appearance.shortcutsInTooltips',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'appearance',
    label: 'Show shortcuts in tooltips',
    description: 'Append the shortcut to a control\u2019s tooltip, e.g. "Compare (C)".',
    keywords: ['keyboard', 'hint'],
  }),

  // ------------------------------------------------------------------ Privacy
  // `E.5`'s four `privacy.*` keys plus `E.5`'s `table.columns`.
  //
  // `PRV-09`'s description is used **verbatim**. It is the sentence that stops
  // anyone treating this as a security control, so it is not paraphrased.
  entry({
    key: 'privacy.mode',
    type: 'enum',
    default: 'blur',
    allowedScopes: ['app'],
    category: 'privacy',
    label: 'Privacy blur mode',
    description: PRIVACY_DESCRIPTION,
    keywords: ['blur', 'colour', 'mask'],
    constraints: { options: ['blur', 'colour'] },
  }),
  entry({
    key: 'privacy.blurRadius',
    type: 'int',
    default: 24,
    allowedScopes: ['app'],
    category: 'privacy',
    label: 'Blur strength',
    description: 'Radius in pixels.',
    keywords: ['blur', 'strength'],
    constraints: { min: 8, max: 48, step: 1 },
  }),
  entry({
    key: 'privacy.startBlurred',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'privacy',
    label: 'Start every session blurred',
    description: 'Turn privacy blur on at every launch, so the first frame is already masked.',
    keywords: ['launch', 'startup'],
  }),
  entry({
    key: 'privacy.autoBlurOnBlur',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'privacy',
    label: 'Blur when the window loses focus',
    description: 'Turn privacy blur on when the window loses focus or is minimised. It never turns itself off.',
    keywords: ['focus', 'minimise'],
  }),
  entry({
    key: 'privacy.hideText',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'privacy',
    label: 'Also hide text',
    description: 'Mask filenames, folder paths, prompts, OCR text and notes too.',
    keywords: ['text', 'filename', 'mask'],
  }),
  entry({
    // `E.5` / `TBL-06`: the table's visible columns, order and widths, per
    // library. `D-108` places it in **Browsing**, not Privacy: it has nothing to
    // do with masking, and `E.5` lists it beside `browse.*` for that reason.
    key: 'table.columns',
    type: 'json',
    default: null,
    allowedScopes: ['library'],
    category: 'browsing',
    label: 'Table columns',
    description: 'Visible columns, their order and widths, per library.',
    keywords: ['table', 'columns', 'width'],
    constraints: { nullable: true },
  }),

  // ----------------------------------------------------------------- Browsing
  entry({
    // `E.5` / `D-100`: the Grid | Table view mode, scopes A/L/F.
    key: 'browse.viewMode',
    type: 'enum',
    default: 'grid',
    allowedScopes: ['app', 'library', 'folder'],
    category: 'browsing',
    label: 'Gallery view',
    description: 'Cards or a table.',
    keywords: ['table', 'grid', 'view'],
    constraints: { options: ['grid', 'table'] },
  }),
  entry({
    // `E.5`: default off, so flagging never moves the user unexpectedly.
    key: 'browse.advanceAfterFlag',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'browsing',
    label: 'Advance after flagging',
    description: 'Move to the next item after Pick or Reject.',
    keywords: ['pick', 'reject', 'advance'],
  }),
  entry({
    key: 'browse.thumbSize',
    type: 'int',
    default: 180,
    allowedScopes: ['app', 'library', 'folder'],
    category: 'browsing',
    label: 'Thumbnail size',
    description: 'Gallery cell size in pixels.',
    keywords: ['grid', 'zoom', 'cell'],
    constraints: { min: 96, max: 320, step: 12 },
  }),
  entry({
    key: 'browse.gridMode',
    type: 'enum',
    default: 'uniform',
    allowedScopes: ['app', 'library', 'folder'],
    category: 'browsing',
    label: 'Grid mode',
    description: 'Uniform squares, or justified rows that keep the aspect ratio.',
    keywords: ['rows', 'uniform', 'layout'],
    constraints: { options: ['uniform', 'rows'] },
  }),
  entry({
    key: 'browse.sort',
    type: 'enum',
    default: 'newest',
    allowedScopes: ['library', 'folder'],
    category: 'browsing',
    label: 'Default sort',
    description: 'Sort applied when a folder is opened. Depends on the library type.',
    keywords: ['order', 'newest', 'filename'],
    constraints: {
      options: ['newest', 'oldest', 'filename-asc', 'filename-desc', 'generated', 'size', 'dimensions', 'page-order'],
    },
  }),
  entry({
    key: 'browse.includeSubfolders',
    type: 'bool',
    default: true,
    allowedScopes: ['app', 'library', 'folder'],
    category: 'browsing',
    label: 'Include subfolders',
    description: 'Show descendants when browsing a folder.',
    keywords: ['recursive', 'children'],
  }),
  entry({
    key: 'browse.cardOverlay',
    type: 'enum',
    default: 'hover',
    allowedScopes: ['app'],
    category: 'browsing',
    label: 'Card overlay',
    description: 'When the filename bar appears on a gallery card.',
    keywords: ['filename', 'hover', 'bar'],
    constraints: { options: ['hover', 'always', 'never'] },
  }),
  entry({
    key: 'browse.restoreView',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'browsing',
    label: 'Restore last view at launch',
    description: 'Reopen the last folder, sort, filters and selection on launch.',
    keywords: ['snapshot', 'session', 'startup'],
  }),
  entry({
    key: 'browse.openLastFolder',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'browsing',
    label: 'Open last folder at launch',
    description: 'Browse the last folder instead of the library root.',
    keywords: ['startup', 'session'],
  }),
  entry({
    key: 'browse.fitUpscale',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'browsing',
    label: 'Let Fit enlarge small images',
    description: 'When off, Fit never scales a small image beyond 100%.',
    keywords: ['zoom', 'viewer', 'fit'],
  }),
  entry({
    key: 'browse.keepZoomBetweenImages',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'browsing',
    label: 'Keep zoom between images',
    description: 'When off, zoom resets to Fit each time you move to another image.',
    keywords: ['zoom', 'viewer'],
  }),
  entry({
    key: 'browse.viewerPrefetch',
    type: 'int',
    default: 2,
    allowedScopes: ['app'],
    category: 'browsing',
    label: 'Neighbours to prefetch',
    description: 'How many previews on each side the viewer loads ahead.',
    keywords: ['performance', 'viewer', 'cache'],
    constraints: { min: 0, max: 4, step: 1 },
  }),

  // ------------------------------------------------------ Search and matching
  entry({
    key: 'search.rememberMode',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'search',
    label: 'Remember last search mode',
    description: 'Keep the mode you last used across sessions.',
    keywords: ['smart', 'exact', 'similar'],
  }),
  entry({
    key: 'search.advancedModes',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'search',
    label: 'Show advanced modes',
    description: 'Semantic only, visual only, hybrid weights and comic text.',
    keywords: ['semantic', 'visual', 'hybrid'],
  }),
  entry({
    key: 'search.liveExact',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'search',
    label: 'Run Exact searches as you type',
    description: 'When off, Exact search waits for Enter.',
    keywords: ['live', 'debounce', 'typing'],
  }),
  entry({
    key: 'search.resultLimit',
    type: 'int',
    default: 1000,
    allowedScopes: ['app'],
    category: 'search',
    label: 'Maximum results',
    description: 'Results beyond this are not materialised.',
    keywords: ['cap', 'limit'],
    constraints: { min: 100, max: 10000, step: 100 },
  }),
  entry({
    key: 'search.historyEnabled',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'search',
    label: 'Record search history',
    description: 'Keep the last 50 searches per library.',
    keywords: ['recent', 'history'],
  }),
  entry({
    key: 'search.showScores',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'search',
    label: 'Show scores on cards',
    description: 'Show a relevance score when sorting by relevance.',
    keywords: ['relevance', 'score'],
  }),
  entry({
    key: 'search.hybridWeights',
    type: 'json',
    default: { keyword: 40, semantic: 30, visual: 30 },
    allowedScopes: ['app'],
    category: 'search',
    label: 'Hybrid weights',
    description: 'Weights for the keyword, semantic and visual signals.',
    keywords: ['weights', 'rrf', 'fusion'],
  }),
  entry({
    key: 'search.similarityMin',
    type: 'float',
    default: null,
    allowedScopes: ['app'],
    category: 'search',
    label: 'Minimum similarity',
    description: 'Hide results below this similarity. Off when empty.',
    keywords: ['threshold', 'cutoff'],
    constraints: { min: 0, max: 1, nullable: true },
  }),
  entry({
    key: 'search.sources',
    type: 'list',
    default: ['prompt', 'metadata', 'filename', 'ocr', 'notes_tags'],
    allowedScopes: ['app', 'library'],
    category: 'search',
    label: 'Searched sources',
    description: 'Which fields Exact search looks in.',
    keywords: ['prompt', 'metadata', 'filename', 'ocr', 'notes', 'tags'],
  }),
  entry({
    key: 'collections.showSmartCollections',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'search',
    label: 'Show smart collections',
    description: 'Show the smart-collection group in Explore and Search.',
    keywords: ['collection', 'rules', 'dynamic'],
  }),
  entry({
    key: 'duplicates.minSimilarity',
    type: 'int',
    default: 90,
    allowedScopes: ['app', 'library'],
    category: 'search',
    label: 'Minimum near-duplicate match',
    description:
      'Minimum 64-bit perceptual-hash agreement to show a visual near-duplicate candidate. Exact matches are not filtered by this.',
    keywords: ['duplicate', 'perceptual', 'hash'],
    constraints: { min: 80, max: 100, step: 1 },
  }),
  entry({
    key: 'duplicates.includeEmbeddingScore',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'search',
    label: 'Show embedding support for duplicates',
    description:
      'Display a compatible, already-computed image-vector score as supporting evidence. Never starts the runtime for this.',
    keywords: ['duplicate', 'vector', 'score'],
  }),

  // ---------------------------------------------------------------- Processing
  entry({
    key: 'proc.profile',
    type: 'id',
    default: 'balanced',
    allowedScopes: ['app'],
    category: 'processing',
    label: 'Active profile',
    description: 'The processing profile whose values are in effect.',
    keywords: ['balanced', 'low power', 'max speed', 'preset'],
  }),
  entry({
    key: 'proc.workerThreadsMax',
    type: 'int',
    default: 'auto',
    allowedScopes: ['app'],
    category: 'processing',
    label: 'Max worker threads',
    description: 'Leave on auto to follow the resource profile.',
    profileable: true,
    keywords: ['threads', 'cpu', 'concurrency'],
    constraints: { min: 1, max: 64, step: 1, autoOption: true },
  }),
  entry({
    key: 'proc.thumbnailThreads',
    type: 'int',
    default: 'auto',
    allowedScopes: ['app'],
    category: 'processing',
    label: 'Thumbnail generation threads',
    description: 'Leave on auto to follow the resource profile.',
    profileable: true,
    keywords: ['threads', 'thumbnail'],
    constraints: { min: 1, max: 32, step: 1, autoOption: true },
  }),
  entry({
    key: 'proc.idleOnly',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'processing',
    label: 'Run only when idle',
    description: 'Pause background work until the computer has been idle.',
    profileable: true,
    keywords: ['idle', 'battery', 'throttle'],
  }),
  entry({
    key: 'proc.idleSeconds',
    type: 'int',
    default: 30,
    allowedScopes: ['app'],
    category: 'processing',
    label: 'Idle delay',
    description: 'How long the computer must be idle before work resumes.',
    profileable: true,
    keywords: ['idle', 'seconds'],
    constraints: { min: 5, max: 600, step: 5 },
  }),
  entry({
    key: 'proc.batteryAware',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'processing',
    label: 'Pause on battery',
    description: 'Pause background work while on battery power.',
    profileable: true,
    keywords: ['battery', 'power'],
  }),
  entry({
    key: 'proc.skipCompleted',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'processing',
    label: 'Skip completed items',
    description: 'Do not repeat a stage that is already done.',
    keywords: ['force', 'rerun', 'resume'],
  }),
  entry({
    key: 'proc.askOnLaunch',
    type: 'enum',
    default: 'ask',
    allowedScopes: ['app', 'library'],
    category: 'processing',
    label: 'Offer to check for new files',
    description: 'Show the non-blocking banner a few seconds after launch.',
    keywords: ['discover', 'scan', 'banner'],
    constraints: { options: ['ask', 'never'] },
  }),
  entry({
    key: 'proc.estimateFromHistory',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'processing',
    label: 'Estimates from past runs',
    description: 'Base duration estimates on recorded run history.',
    keywords: ['estimate', 'duration', 'history'],
  }),
  entry({
    key: 'policy.decompose',
    type: 'enum',
    default: 'off',
    allowedScopes: ['app', 'library', 'folder'],
    category: 'processing',
    label: 'Folder policy: decompose',
    description: 'Used only by the "Use folder policies" preset. Never starts work by itself.',
    keywords: ['comic', 'panels', 'cropper'],
    constraints: { options: ['on', 'off', 'inherit'] },
  }),
  entry({
    key: 'policy.ocr',
    type: 'enum',
    default: 'off',
    allowedScopes: ['app', 'library', 'folder'],
    category: 'processing',
    label: 'Folder policy: OCR',
    description: 'Used only by the "Use folder policies" preset. Never starts work by itself.',
    keywords: ['text', 'recognition'],
    constraints: { options: ['on', 'off', 'inherit'] },
  }),
  entry({
    key: 'policy.embeddings',
    type: 'enum',
    default: 'off',
    allowedScopes: ['app', 'library', 'folder'],
    category: 'processing',
    label: 'Folder policy: embeddings',
    description: 'Used only by the "Use folder policies" preset. Never starts work by itself.',
    keywords: ['vectors', 'semantic'],
    constraints: { options: ['on', 'off', 'inherit'] },
  }),

  // ------------------------------------------------------------------- Comics
  entry({
    key: 'comics.defaultCropper',
    type: 'id',
    default: 'current',
    allowedScopes: ['app', 'library'],
    category: 'comics',
    label: 'Default cropper',
    description: 'The registered cropper version used by Decompose.',
    keywords: ['panel', 'v11', 'cropper'],
  }),
  entry({
    key: 'comics.previewBeforeAccept',
    type: 'enum',
    default: 'auto',
    allowedScopes: ['app'],
    category: 'comics',
    label: 'Preview before accepting panels',
    description: 'Auto is on for five pages or fewer.',
    keywords: ['preview', 'accept', 'decompose'],
    constraints: { options: ['auto', 'always', 'never'] },
  }),
  entry({
    key: 'comics.flag.overlapIoU',
    type: 'float',
    default: 0.1,
    allowedScopes: ['app'],
    category: 'comics',
    label: 'Flag overlap above IoU',
    description: 'Panels overlapping more than this are flagged for checking.',
    keywords: ['overlap', 'iou', 'flag'],
    constraints: { min: 0, max: 1 },
  }),
  entry({
    key: 'comics.flag.tinyAreaPct',
    type: 'float',
    default: 1.5,
    allowedScopes: ['app'],
    category: 'comics',
    label: 'Flag tiny panels below %',
    description: 'A panel smaller than this share of the page area is flagged.',
    keywords: ['tiny', 'sliver', 'flag'],
    constraints: { min: 0, max: 100 },
  }),
  entry({
    key: 'comics.flag.lowCoveragePct',
    type: 'float',
    default: 40,
    allowedScopes: ['app'],
    category: 'comics',
    label: 'Flag low coverage below %',
    description: 'Panels covering less than this share of the page are flagged.',
    keywords: ['coverage', 'flag'],
    constraints: { min: 0, max: 100 },
  }),
  entry({
    key: 'comics.flag.extremeAspect',
    type: 'float',
    default: 6,
    allowedScopes: ['app'],
    category: 'comics',
    label: 'Flag extreme aspect ratio',
    description: 'A panel wider or taller than this ratio is flagged.',
    keywords: ['aspect', 'ratio', 'flag'],
    constraints: { min: 1, max: 50 },
  }),
  entry({
    key: 'comics.flag.manyPanels',
    type: 'int',
    default: 12,
    allowedScopes: ['app'],
    category: 'comics',
    label: 'Flag pages with many panels',
    description: 'More panels than this on one page is flagged.',
    keywords: ['many', 'flag', 'count'],
    constraints: { min: 2, max: 60, step: 1 },
  }),
  entry({
    key: 'comics.webtoonSlicing',
    type: 'enum',
    default: 'auto',
    allowedScopes: ['app', 'library'],
    category: 'comics',
    label: 'Webtoon strip slicing',
    description: 'Propose gutter-based slicing during an explicit Decompose.',
    keywords: ['long strip', 'webtoon', 'slice', 'gutter'],
    constraints: { options: ['auto', 'off'] },
  }),
  entry({
    key: 'comics.webtoonCandidateRatio',
    type: 'float',
    default: 3.5,
    allowedScopes: ['app', 'library'],
    category: 'comics',
    label: 'Long-strip candidate ratio',
    description: 'Minimum page height / width ratio for a long-strip proposal.',
    keywords: ['webtoon', 'ratio', 'candidate'],
    constraints: { min: 2, max: 8, step: 0.25 },
  }),
  entry({
    key: 'comics.webtoonMinGutterPx',
    type: 'int',
    default: 24,
    allowedScopes: ['app', 'library'],
    category: 'comics',
    label: 'Minimum gutter height',
    description: 'Minimum height, in source pixels, of a candidate horizontal gutter.',
    keywords: ['gutter', 'webtoon', 'pixels'],
    constraints: { min: 8, max: 128, step: 4 },
  }),
  entry({
    key: 'comics.webtoonMaxSegmentRatio',
    type: 'float',
    default: 2.5,
    allowedScopes: ['app', 'library'],
    category: 'comics',
    label: 'Preferred segment ratio',
    description:
      'Preferred maximum segment height / page width. Never invents a boundary to satisfy this.',
    keywords: ['segment', 'ratio', 'webtoon'],
    constraints: { min: 1.5, max: 5, step: 0.25 },
  }),
  entry({
    key: 'comics.spreadDetection',
    type: 'enum',
    default: 'offer',
    allowedScopes: ['app', 'library'],
    category: 'comics',
    label: 'Double-page spread detection',
    description: 'Offer a preview before detecting a likely spread. Off removes proposals, not the manual split.',
    keywords: ['spread', 'double page', 'gutter'],
    constraints: { options: ['offer', 'off'] },
  }),
  entry({
    key: 'comics.readingDirection',
    type: 'enum',
    default: 'ltr',
    allowedScopes: ['folder'],
    category: 'comics',
    label: 'Reading direction',
    description: 'Reading direction for this series.',
    keywords: ['rtl', 'ltr', 'manga', 'manhwa', 'order'],
    constraints: { options: ['ltr', 'rtl'] },
  }),
  entry({
    key: 'reader.defaultMode',
    type: 'enum',
    default: 'page',
    allowedScopes: ['app'],
    category: 'comics',
    label: 'Reader start mode',
    description: 'Whether the Reader opens on a page or a panel.',
    keywords: ['reader', 'panel', 'page'],
    constraints: { options: ['page', 'panel'] },
  }),
  entry({
    key: 'reader.dialogueStrip',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'comics',
    label: 'Show dialogue strip',
    description: 'Show the current text in a bar at the bottom of the Reader.',
    keywords: ['reader', 'text', 'strip'],
  }),

  // ----------------------------------------------------------- OCR and review
  entry({
    key: 'ocr.languages',
    type: 'list',
    default: ['en'],
    allowedScopes: ['app', 'library'],
    category: 'ocr',
    label: 'OCR languages',
    description: 'English only in v1. The list is shaped so more can be added.',
    keywords: ['language', 'text', 'recognition'],
  }),
  entry({
    key: 'ocr.engine',
    type: 'id',
    default: 'current',
    allowedScopes: ['app'],
    category: 'ocr',
    label: 'OCR engine',
    description: 'The engine used for transcription.',
    keywords: ['rapidocr', 'engine'],
  }),
  entry({
    key: 'ocr.confidenceThreshold',
    type: 'int',
    default: 80,
    allowedScopes: ['app', 'library'],
    category: 'ocr',
    label: 'Confidence threshold',
    description: 'Below this a region needs review.',
    keywords: ['confidence', 'review', 'needs attention'],
    constraints: { min: 0, max: 100, step: 1 },
  }),
  entry({
    key: 'ocr.autoAdvance',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'ocr',
    label: 'Advance after saving',
    description: 'Move to the next region after saving or marking reviewed.',
    keywords: ['auto advance', 'next'],
  }),
  entry({
    key: 'ocr.spellcheck',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'ocr',
    label: 'Spellcheck in the editor',
    description: 'Off by default; the editor is for stored correction.',
    keywords: ['spelling', 'editor'],
  }),
  entry({
    key: 'ocr.showTextOnCanvas',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'ocr',
    label: 'Draw text over balloons',
    description: 'Off by default because it overlapped the original lettering.',
    keywords: ['overlay', 'canvas', 'balloon'],
  }),

  // --------------------------------------------------- Models and run runtime
  entry({
    key: 'runtime.autoStart',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'runtime',
    label: 'Start the model when needed',
    description: 'Never at launch \u2014 only when a search or job needs it.',
    keywords: ['model', 'llama', 'runtime', 'auto'],
  }),
  entry({
    key: 'runtime.idleStopMinutes',
    type: 'int',
    default: 10,
    allowedScopes: ['app'],
    category: 'runtime',
    label: 'Stop after idle',
    description: 'Stop the runtime after this many idle minutes. 0 means never.',
    profileable: true,
    keywords: ['idle', 'stop', 'timeout'],
    constraints: { min: 0, max: 120, step: 1 },
  }),
  entry({
    key: 'runtime.device',
    type: 'id',
    default: 'auto',
    allowedScopes: ['app'],
    category: 'runtime',
    label: 'Compute device',
    description: 'Auto uses the fastest device from the stored benchmark; with no benchmark, CPU.',
    profileable: true,
    keywords: ['gpu', 'cpu', 'device', 'benchmark'],
  }),
  entry({
    key: 'runtime.threads',
    type: 'int',
    default: 'auto',
    allowedScopes: ['app'],
    category: 'runtime',
    label: 'Runtime threads',
    description: 'Leave on auto to follow the resource profile.',
    profileable: true,
    keywords: ['threads', 'cores'],
    constraints: { min: 1, max: 64, step: 1, autoOption: true },
  }),
  entry({
    key: 'runtime.lowMemoryWarnGB',
    type: 'float',
    default: 1.5,
    allowedScopes: ['app'],
    category: 'runtime',
    label: 'Low-memory warning',
    description: 'Warn when available memory is below this when starting the model.',
    keywords: ['memory', 'ram', 'warning'],
    constraints: { min: 0.5, max: 16 },
  }),
  entry({
    key: 'runtime.models.dir',
    type: 'path',
    default: '',
    allowedScopes: ['app'],
    category: 'runtime',
    label: 'Model files',
    description: 'Where the text and image embedding models are read from.',
    keywords: ['gguf', 'model', 'path', 'directory'],
  }),

  // ------------------------------------------------------------------ Storage
  entry({
    key: 'storage.dataDir',
    type: 'path',
    default: '',
    allowedScopes: ['app'],
    category: 'storage',
    label: 'Data directory',
    description: 'Where the catalog, caches and logs live. The app restarts after a change.',
    restartRequired: true,
    keywords: ['appdata', 'portable', 'path'],
  }),
  entry({
    key: 'storage.previewCacheMaxGB',
    type: 'float',
    default: 2,
    allowedScopes: ['app'],
    category: 'storage',
    label: 'Preview cache size',
    description: 'Previews above this are evicted down to 90% of the limit.',
    keywords: ['cache', 'preview', 'disk'],
    constraints: { min: 0.5, max: 50 },
  }),
  entry({
    key: 'storage.thumbQuality',
    type: 'int',
    default: 80,
    allowedScopes: ['app'],
    category: 'storage',
    label: 'Thumbnail quality',
    description: 'WebP quality for new thumbnails.',
    keywords: ['webp', 'compression'],
    constraints: { min: 60, max: 95, step: 1 },
  }),
  entry({
    key: 'storage.previewQuality',
    type: 'int',
    default: 85,
    allowedScopes: ['app'],
    category: 'storage',
    label: 'Preview quality',
    description: 'WebP quality for new previews.',
    keywords: ['webp', 'compression'],
    constraints: { min: 60, max: 95, step: 1 },
  }),
  entry({
    key: 'storage.backupKeep',
    type: 'int',
    default: 5,
    allowedScopes: ['app'],
    category: 'storage',
    label: 'Backups to keep',
    description: 'Older automatic backups are removed beyond this number.',
    keywords: ['backup', 'restore'],
    constraints: { min: 1, max: 20, step: 1 },
  }),
  entry({
    key: 'storage.backupBeforeBigJobs',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'storage',
    label: 'Back up before big jobs',
    description: 'Back up before a job over 1,000 items, or containing Decompose or OCR.',
    keywords: ['backup', 'safety'],
  }),
  entry({
    key: 'storage.integrityCheck',
    type: 'enum',
    default: 'weekly',
    allowedScopes: ['app'],
    category: 'storage',
    label: 'Idle integrity check',
    description: 'How often the catalog is checked while the app is idle.',
    keywords: ['integrity', 'check', 'pragma'],
    constraints: { options: ['weekly', 'never'] },
  }),

  // ----------------------------------------------------------------- Advanced
  entry({
    key: 'diag.perfHud',
    type: 'bool',
    default: false,
    allowedScopes: ['app'],
    category: 'advanced',
    label: 'Performance overlay',
    description: 'A small overlay with FPS, query time and cache hit rate.',
    keywords: ['hud', 'fps', 'overlay', 'debug'],
  }),
  entry({
    key: 'diag.logLevel',
    type: 'enum',
    default: 'info',
    allowedScopes: ['app'],
    category: 'advanced',
    label: 'Log detail',
    description: 'How much detail the log files carry.',
    keywords: ['logging', 'debug', 'verbose'],
    constraints: { options: ['info', 'debug'] },
  }),
  entry({
    key: 'diag.startupTrace',
    type: 'bool',
    default: true,
    allowedScopes: ['app'],
    category: 'advanced',
    label: 'Record launch timings',
    description: 'Keep the last ten launch traces for the Diagnostics page.',
    keywords: ['startup', 'trace', 'launch', 'performance'],
  }),
];

export const SETTINGS_BY_KEY: ReadonlyMap<string, SettingEntry> = new Map(
  SETTINGS_REGISTRY.map((e) => [e.key, e]),
);

/**
 * The categories the sidebar lists, in the order §12.1 gives them.
 *
 * A category appears when it has rows **or** carries a hint. The Shortcuts
 * category is the second case: §12.1 lists it, but `design.md` §20 states that v1
 * shortcuts are fixed and generated from the action registry, so §12.2 has no keys
 * for it. Hiding the category would silently drop a documented destination;
 * showing it with the explanation tells the user where the shortcuts actually
 * come from.
 */
export function categoriesWithEntries(
  context: { libraryType: 'comfyui' | 'comic' | 'none' },
): SettingCategory[] {
  const used = new Set(
    SETTINGS_REGISTRY.filter((e) => e.visibleWhen?.(context) ?? true).map((e) => e.category),
  );
  return CATEGORY_ORDER.filter((c) => used.has(c) || CATEGORY_HINT[c]);
}

export function entriesForCategory(
  category: SettingCategory,
  context: { libraryType: 'comfyui' | 'comic' | 'none' },
): SettingEntry[] {
  return SETTINGS_REGISTRY.filter(
    (e) => e.category === category && (e.visibleWhen?.(context) ?? true),
  );
}

/**
 * `SET-05`: settings search matches label, description, key and keywords. The
 * query is matched case-insensitively against all four, and every whitespace-
 * separated term must match somewhere (so "text canvas" narrows rather than widens).
 */
export function searchSettings(
  query: string,
  context: { libraryType: 'comfyui' | 'comic' | 'none' } = { libraryType: 'none' },
): SettingEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = SETTINGS_REGISTRY.filter((e) => e.visibleWhen?.(context) ?? true);
  if (terms.length === 0) return visible;
  return visible.filter((e) => {
    const haystack = [e.key, e.label, e.description, ...(e.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export type ValidationResult =
  | { ok: true; value: SettingValue }
  | { ok: false; reason: string };

/**
 * Validate and coerce one value against its entry.
 *
 * This is the client half of the validation `SET-01` says the Rust validator
 * also performs; the backend remains the authority (the existing `app_settings`
 * validator already rejects out-of-range values), and this exists so the UI can
 * refuse a bad value immediately and explain `STA-29` rather than sending it.
 */
export function validateSetting(entry: SettingEntry, raw: unknown): ValidationResult {
  const c = entry.constraints ?? {};

  switch (entry.type) {
    case 'bool':
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      if (raw === 'true') return { ok: true, value: true };
      if (raw === 'false') return { ok: true, value: false };
      return { ok: false, reason: 'must be on or off' };

    case 'int':
    case 'float': {
      if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
        if (c.autoOption) return { ok: true, value: 'auto' };
        if (c.nullable) return { ok: true, value: null };
        return { ok: false, reason: 'must be a number' };
      }
      if (c.autoOption && raw === 'auto') return { ok: true, value: 'auto' };
      const num = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(num)) return { ok: false, reason: 'must be a number' };
      if (entry.type === 'int' && !Number.isInteger(num)) {
        return { ok: false, reason: 'must be a whole number' };
      }
      if (c.min !== undefined && num < c.min) {
        return { ok: false, reason: `must be ${c.min} or more` };
      }
      if (c.max !== undefined && num > c.max) {
        return { ok: false, reason: `must be ${c.max} or less` };
      }
      if (c.step !== undefined && c.min !== undefined) {
        const offset = num - c.min;
        if (Math.abs(offset / c.step - Math.round(offset / c.step)) > 1e-9) {
          return { ok: false, reason: `must be a multiple of ${c.step}` };
        }
      }
      return { ok: true, value: num };
    }

    case 'enum':
    case 'id': {
      const options = c.options ?? entry.options;
      const text = String(raw);
      if (options && !options.includes(text)) {
        return { ok: false, reason: `must be one of ${options.join(', ')}` };
      }
      return { ok: true, value: text };
    }

    case 'hex': {
      const text = String(raw).trim();
      if (c.pattern && !c.pattern.test(text)) {
        return { ok: false, reason: 'must be a hex colour such as #5B9CF6' };
      }
      return { ok: true, value: text };
    }

    case 'path':
    case 'string':
      return { ok: true, value: String(raw) };

    case 'list':
      if (Array.isArray(raw)) return { ok: true, value: raw };
      if (typeof raw === 'string') {
        const parts = raw
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        return { ok: true, value: parts };
      }
      return { ok: false, reason: 'must be a list' };

    case 'json':
      if (typeof raw !== 'string') {
        if (raw !== null && typeof raw === 'object') {
          return { ok: true, value: raw as SettingValue };
        }
        return { ok: false, reason: 'must be JSON' };
      }
      try {
        return { ok: true, value: JSON.parse(raw) };
      } catch {
        return { ok: false, reason: 'is not valid JSON' };
      }

    default:
      return { ok: false, reason: 'is not a known type' };
  }
}

/**
 * A user-facing label for an enum value.
 *
 * `§12.2` stores values (`dark`, `high-contrast`, `ask`), but `§10.14` requires
 * sentence case in the UI ("High contrast"). Values are identifiers; this is what
 * the user reads, so it is derived once here rather than reworded per control.
 */
export function optionLabel(value: string): string {
  const text = value.replace(/[-_]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The documented default map, which the export and the reset both need. */
export function defaultValues(): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const e of SETTINGS_REGISTRY) out[e.key] = e.default;
  return out;
}