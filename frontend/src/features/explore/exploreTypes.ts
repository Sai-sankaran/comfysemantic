/**
 * Explore's typed data contract (design §7.1).
 *
 * These types are the *only* thing the Explore screen knows about where its items
 * come from. They are deliberately separate from `types.ts`'s `ImageRecord`,
 * which is the backend's current browse row: the design's Explore needs a stable
 * shape (stored dimensions for layout before decode, a dominant colour, badges,
 * a panel scope) that the existing browse endpoint does not return, and inventing
 * optional fields on `ImageRecord` would make every screen tolerate a half-populated
 * item.
 *
 * When the backend grows a matching endpoint, `ExploreSource` is the seam: the
 * screen's rendering, selection and layout code does not change.
 */

/** `GAL-19`: which kinds of item the grid shows. */
export type ExploreScope = 'pages' | 'panels' | 'both';

export type LibraryType = 'comfyui' | 'comic';

/** `GAL-13`: sort is chosen from a list that depends on the library type. */
export type ExploreSort =
  // ComfyUI
  | 'mtime_desc'
  | 'mtime_asc'
  | 'filename_asc'
  | 'filename_desc'
  | 'generated_desc'
  | 'size_desc'
  | 'size_asc'
  | 'dimensions_desc'
  // Comic
  | 'page_order';

/** `GAL-05`: uniform squares, or justified rows that keep the aspect ratio. */
export type GridMode = 'uniform' | 'rows';

/** `GAL-07`: the badge set, in the order the design lists them. */
/**
 * `GAL-07` names six badges. `FLG-07` / `FLG-08` add two more for the flag:
 * a reject badge (the item stays visible, dimmed) and a pick badge.
 */
export type ItemBadge =
  | 'favourite'
  | 'decomposed'
  | 'needsReview'
  | 'stale'
  | 'failed'
  | 'missing'
  | 'reject'
  | 'pick';

export type BadgeTone = 'neutral' | 'accent' | 'warn' | 'danger' | 'ok';

/** One item as Explore needs it. */
/** `FLG-01`: `items.flag` is null, pick or reject; `none` is this layer's null. */
export type FlagValue = 'none' | 'pick' | 'reject';

export type ExploreItem = {
  id: string;
  /** Which kind of thing this is; a panel card is `panel` (`GAL-19`). */
  kind: 'page' | 'panel';
  filename: string;
  /** The folder's display path, used by the tree and the inspector (`INS-05`). */
  displayPath: string;
  /** Folder ids from the root down, so a folder filter is a prefix match. */
  folderIds: string[];
  /**
   * Stored pixel dimensions. `GAL-05` requires layout to be computed from these
   * so it never waits for decode and never shifts when images load; they are
   * nullable only because a file may be missing (`STA-12`).
   */
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  modifiedAt: string;
  /** `null` for a comic page, which has no generation record. */
  generatedAt: string | null;
  /** `GAL-08`: a solid fill shown until the thumbnail decodes. */
  dominantColor: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  badges: ItemBadge[];
  /** Comic pages only (`GAL-19`/`GAL-20`). */
  panelCount: number | null;
  /** Panel cards only; 1-based reading order. */
  panelIndex: number | null;
  parentPageId: string | null;
  parentSeriesLabel: string | null;
  /** True when the source file is gone (`STA-12`). */
  missing: boolean;
  /**
   * `FLG-01`: `items.flag`. User data protected by `REL-02` — no stage, job or
   * reprocessing writes it. Exactly one of none / pick / reject, and setting one
   * replaces the previous (`FLG-09`).
   */
  flag: 'none' | 'pick' | 'reject';
  /**
   * `FLG-01`: `items.hidden`. Also user data under `REL-02`.
   *
   * `FLG-02` makes this a *view* concern, not a processing one: a hidden item
   * disappears from every result set but a job still processes it (`FLG-05`).
   */
  hidden: boolean;

  // ---------------------------------------------------------------------------
  // Import Batches (IMP-01..IMP-03)
  // ---------------------------------------------------------------------------
  //
  // `IMP-01`: Every operation that creates item rows creates one `import_batches`
  // row: kind `initial` (the first batch of a library), `root_added` (items from
  // a root folder added later), `migrated` (all items brought in by the one-time
  // migration), or `discovered` (items found by a later *Check for new files* and
  // applied by the user). Each new item gets `import_batch_id` and `catalogued_at`
  // (UTC, the time the row was created).
  //
  // `IMP-02`: Only batches of kind `discovered` feed **Recently added** (`COL-12`).
  // This is why a freshly indexed or migrated library does not show every image as
  // "recent".
  //
  // `IMP-03`: For migrated items, `catalogued_at` carries over the old catalog's
  // "added" time if the old schema has one (`VERIFY`), otherwise the migration time;
  // the batch kind is still `migrated`.
  //
  // These fields are nullable because the fixture may not have them for legacy
  // items; a real backend will always populate them.
  importBatchId: string | null;
  importBatchKind: 'initial' | 'root_added' | 'migrated' | 'discovered' | null;
  cataloguedAt: string | null; // ISO 8601 UTC
  /**
   * `TBL-02`: the per-row values the table shows that are not on the card.
   *
   * The table needs a rating, a flag, tags, the generation fields and a
   * processing status for *every* loaded row, while the inspector fetches one
   * detail record at a time. Returning these from the list query is what lets
   * the table render without a request per row; a backend that joined them in
   * would satisfy the same contract.
   *
   * Absent (`undefined`) means "this library type has no such value", and the
   * cell renders empty rather than a placeholder — the same `INS-03` rule the
   * inspector follows.
   */
  row?: ExploreRowValues;
};

/** `LIB-06`: a folder row. */
export type ExploreFolder = {
  id: string;
  label: string;
  parentId: string | null;
  /** `LIB-09`: the library root, then one node per root folder. */
  isRoot: boolean;
  /** Recursive item count; `null` when it could not be computed in time. */
  count: number | null;
  /** `§5.7`. `unchecked` is the design's "Not checked" (`GAL-21`, `STA-03`). */
  status: 'unchecked' | 'partial' | 'done' | 'failed' | 'stale';
  children: ExploreFolder[];
};

/** A facet value with a live count (`GAL-14`). */
export type ExploreFacetValue = { value: string; count: number };

export type ExploreFacets = {
  model: ExploreFacetValue[];
  lora: ExploreFacetValue[];
  sampler: ExploreFacetValue[];
  dimension: ExploreFacetValue[];
  tags: ExploreFacetValue[];
  rating: ExploreFacetValue[];
  /** Comic only: panel state (`GAL-14`). */
  panels?: ExploreFacetValue[];
  /** Comic only: OCR state. */
  text?: ExploreFacetValue[];
};

/** The active filter set, as one removable chip per active facet (`GAL-14`). */
export type ExploreFilters = {
  model: string[];
  lora: string[];
  sampler: string[];
  minWidth: number | null;
  minHeight: number | null;
  hasWorkflow: boolean | null;
  favourite: boolean;
  ratingAtLeast: number;
  tags: string[];
  thumbnailStage: 'any' | 'done' | 'not';
  metadataStage: 'any' | 'done' | 'not';
  embeddingStage: 'any' | 'done' | 'not';
  /** Comic only. */
  panels: 'any' | 'decomposed' | 'not' | 'none-found' | 'stale';
  text: 'any' | 'done' | 'not' | 'needs-review';
  reviewed: 'any' | 'yes' | 'no';
  /**
   * `FLG-07` / `FLG-08`: the Rejected and Picks filters.
   *
   * They are ordinary filters rather than special modes because a rejected item
   * is still *in* the library — `FLG-07` says it stays visible, dimmed. What
   * makes it a filter is that the user wants to see only those, the same as any
   * other facet. (`hidden` is the opposite case: `FLG-02` makes it a mode,
   * because a hidden item is in no result set at all.)
   */
  flag: 'any' | 'pick' | 'reject' | 'none';

  // ---------------------------------------------------------------------------
  // Quick Filters (QFL-01..QFL-10) — session-only chips that AND-combine with
  // other filters. `QFL-06`: they are **never** persisted to folder view memory,
  // the launch snapshot, or settings. They live only in the current session's
  // navigation history (so Back restores them) and reset on app exit or library
  // change.
  // ---------------------------------------------------------------------------
  /** `QFL-01` / `QFL-02`: Favourites chip — `favourite = true`. */
  qfFavourite: boolean;
  /** `QFL-01` / `QFL-02`: Rated 4+ chip — `rating >= 4`. */
  qfRated4Plus: boolean;
  /** `QFL-01` / `QFL-02`: Picks chip — `flag = pick`. */
  qfPicks: boolean;
  /** `QFL-01` / `QFL-02` / `QFL-03` / `QFL-04`: Incomplete chip.
   * `QFL-03`: "Incomplete" means at least one applicable stage has status
   * none, stale, failed, or skipped. `QFL-04`: the chip opens a menu to pick
   * "Any stage" (default) or a specific named stage. */
  qfIncomplete: { enabled: boolean; stage: 'any' | string };
  /** `QFL-01` / `QFL-02`: Failed chip — at least one stage has status failed. */
  qfFailed: boolean;
};

export const EMPTY_FILTERS: ExploreFilters = {
  model: [],
  lora: [],
  sampler: [],
  minWidth: null,
  minHeight: null,
  hasWorkflow: null,
  favourite: false,
  ratingAtLeast: 0,
  tags: [],
  thumbnailStage: 'any',
  metadataStage: 'any',
  embeddingStage: 'any',
  panels: 'any',
  text: 'any',
  reviewed: 'any',
  flag: 'any',
  // Quick Filter defaults (QFL-01..QFL-10) — all off.
  qfFavourite: false,
  qfRated4Plus: false,
  qfPicks: false,
  qfIncomplete: { enabled: false, stage: 'any' },
  qfFailed: false,
};

/** `GAL-22`: everything remembered per `(library, folder)`. */
export type FolderViewState = {
  sort: ExploreSort;
  sortDescending: boolean;
  thumbSize: number;
  gridMode: GridMode;
  includeSubfolders: boolean;
  scope: ExploreScope;
  filters: ExploreFilters;
  /**
   * `FLG-04`: the Hidden view. `exclude` is every normal view; `only` is the
   * Hidden filter from the popover or the palette action.
   *
   * It is part of the remembered view state because leaving the Hidden view and
   * coming back should not silently show the user's regular gallery again.
   */
  hiddenMode: 'exclude' | 'only';
};

export const DEFAULT_VIEW_STATE: FolderViewState = {
  // `GAL-13`: Newest first for ComfyUI, Page order for comics. The library type
  // decides, so this is the ComfyUI default and `viewStateFor` overrides it.
  sort: 'mtime_desc',
  sortDescending: true,
  // `GAL-*`: 96-320, step 12, default 180.
  thumbSize: 180,
  gridMode: 'uniform',
  // `GAL-15`: Subfolders is on by default.
  includeSubfolders: true,
  scope: 'pages',
  filters: EMPTY_FILTERS,
  // `FLG-02`: hidden items are excluded from every view unless the Hidden view
  // is explicitly asked for.
  hiddenMode: 'exclude',
};

/**
 * One page of results.
 *
 * `GAL-02`: pages of 200 by keyset pagination. `nextCursor` is the keyset cursor
 * rather than an offset, which is what makes paging stable while the user
 * scrolls; the fixture honours the same contract so a real backend is a swap.
 */
export type ExplorePage = {
  items: ExploreItem[];
  /**
   * `GAL-04`: the count of items in the scope **before** filters were applied.
   *
   * The denominator, not the result size — the label reads "37 of 412", so a
   * source that returned the filtered count here would render "104 of 104" and
   * tell the user nothing about what they excluded. `null` means the backend
   * could not count within 150 ms, and the UI shows "1,000+" until the exact
   * number arrives.
   */
  total: number | null;
  /**
   * `FLG-05`: how many items in this scope were removed by the hidden filter.
   *
   * Reported rather than folded into `total` so the count text can say
   * "412 images (3 hidden)" instead of silently showing 409 — a user who hid
   * three items yesterday would otherwise have no way to tell that they are
   * still there.
   */
  hiddenCount: number;
  nextCursor: string | null;
};

export type ExploreQuery = {
  libraryId: string;
  /** `null` is the library root. */
  folderId: string | null;
  includeSubfolders: boolean;
  scope: ExploreScope;
  sort: ExploreSort;
  sortDescending: boolean;
  filters: ExploreFilters;
  limit: number;
  cursor: string | null;
  /**
   * `FLG-02` / `FLG-04`: hidden items are excluded from every result set by
   * default, and the Hidden view asks for exactly them.
   *
   * This is a parameter rather than a filter because it is not optional: an
   * implementation that "forgot" it would show hidden items in the gallery,
   * which is the whole bug `FLG-02` exists to prevent.
   */
  hidden: 'exclude' | 'only';
  /**
   * `FLG-02`: the item count **before** hidden items are removed, so the count
   * text can say "412 images (3 hidden)". `FLG-05` requires the number to stay
   * visible rather than silently shrinking.
   */
  hiddenCount: number;
};

/**
 * The seam the screen depends on.
 *
 * Everything the screen needs from "somewhere else" is on this one interface, so
 * replacing the fixture with the backend is a matter of providing a second
 * implementation — no component changes.
 */
export type ExploreSource = {
  /**
   * True when the items are fixture data rather than a real catalog. The toolbar
   * shows this, so a fixture can never be mistaken for a library's contents.
   */
  isFixtureData?: boolean;
  libraryType(libraryId: string): LibraryType;
  libraryName(libraryId: string): string;
  folderTree(libraryId: string): ExploreFolder[];
  /** `GAL-14`: live facet counts. */
  facets(query: Omit<ExploreQuery, 'limit' | 'cursor'>): Promise<ExploreFacets>;
  page(query: ExploreQuery): Promise<ExplorePage>;
  /**
   * `INS-12`: selecting an item fetches **only** that item's detail. It must
   * never trigger generation of anything else (`PRD-06`).
   */
  itemDetail(itemId: string): Promise<ExploreItemDetail>;
  /**
   * `FLG-01` / `FLG-09`: set the flag on a set of items.
   *
   * Returns the item ids it changed, so `FLG-10`'s Undo can restore exactly
   * those — including the items whose flag did not actually change, which must
   * not appear in the undo entry.
   */
  setFlag(itemIds: string[], flag: 'none' | 'pick' | 'reject'): Promise<string[]>;
  /** `FLG-01` / `FLG-03`: hide, or show again. Never deletes a file. */
  setHidden(itemIds: string[], hidden: boolean): Promise<string[]>;
};

/** The `INS-*` detail record. Kept separate from the grid item on purpose. */
export type ExploreItemDetail = {
  itemId: string;
  fileName: string;
  displayPath: string;
  format: string | null;
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  modifiedAt: string;
  addedAt: string | null;
  positivePrompt: string | null;
  negativePrompt: string | null;
  model: string | null;
  loras: Array<{ name: string; weight: number }>;
  sampler: string | null;
  scheduler: string | null;
  steps: number | null;
  cfg: number | null;
  seed: string | null;
  denoise: number | null;
  hasWorkflow: boolean;
  /**
   * The embedded workflow, fetched **only** when the user asks (`INS-07`).
   * `null` means it has not been requested yet, which is not the same as absent.
   */
  workflowJson: string | null;
  /** `INS-06`/`INS-07` node count, shown without loading the JSON. */
  workflowNodeCount: number | null;
  /** Existing tag names, for the autocomplete (`INS-08`). */
  existingTags: string[];
  tags: string[];
  rating: number;
  favourite: boolean;
  notes: string | null;
  /** Comic only (`INS-05a`), user-entered: the app performs no online lookup. */
  sourceUrl: string | null;
  sourceSite: string | null;
  creator: string | null;
  /** `INS-09`: one entry per stage with `§5.7` wording. */
  stages: Array<{ name: string; status: string; at: string | null; error?: string }>;
  /** Comic only (`INS-10`). */
  panelStatus: 'not-decomposed' | 'decomposed' | 'no-panels' | 'stale' | null;
  panels: Array<{ id: string; index: number; width: number; height: number; thumbnailUrl: string | null }>;
  /** Comic only: effective OCR text, grouped by panel then page-level. */
  text: Array<{ region: string; text: string }>;
};

/** `TBL-02`: the per-row columns Table view needs beyond the card's fields. */
export type ExploreRowValues = {
  seriesLabel: string | null;
  panelCount: number | null;
  panelStatus: 'decomposed' | 'not-decomposed' | 'no-panels' | 'stale' | null;
  ocrStatus: 'done' | 'none' | 'failed' | 'needsReview' | null;
  reviewStatus: 'none' | 'pending' | 'reviewed' | null;
  rating: number;
  favourite: boolean;
  tags: string[];
  model: string | null;
  sampler: string | null;
  steps: number | null;
  cfg: number | null;
  seed: string | null;
  loras: Array<{ name: string; weight: number }>;
  /** The **worst** stage status, per `TBL-02`. */
  processing: 'ok' | 'stale' | 'failed' | 'none';
  prompt: string | null;
  /** Comic panel OCR text, clipped by the table. */
  text: string | null;
};

/** `INS-11`: a selected comic panel's own record. */
export type ExplorePanelDetail = {
  id: string;
  index: number;
  /** `INS-11`: the crop box in source pixels. */
  box: { x: number; y: number; width: number; height: number };
  parentPageId: string;
  parentSeriesLabel: string;
  parentFilename: string;
  /** `FLG-06`: a panel inherits its page's rating/favourite/flag for display. */
  parentRating: number;
  parentFavourite: boolean;
  tags: string[];
  text: Array<{ region: string; text: string }>;
  thumbnailUrl: string | null;
};

/** `NAV-22`: the states the gallery grid itself can be in. */
export type ExploreLoadState = 'loading' | 'ready' | 'more-loading' | 'more-failed' | 'failed';

// ---------------------------------------------------------------------------
// Import Batches (IMP-01..IMP-03)
// ---------------------------------------------------------------------------

/** `IMP-01`: the kind of import batch. */
export type ImportBatchKind = 'initial' | 'root_added' | 'migrated' | 'discovered';

/** `IMP-01`: human-readable labels for batch kinds. */
export const BATCH_KIND_LABELS: Record<ImportBatchKind, string> = {
  initial: 'Initial import',
  root_added: 'Root folder added',
  migrated: 'Migrated',
  discovered: 'Discovered',
};

/** `IMP-01`: generates a unique import batch ID. */
export function createImportBatchId(): string {
  return `imp_${Math.random().toString(36).substring(2, 10)}`;
}

/** `IMP-02`: gets the label for a batch kind. */
export function getBatchLabel(kind: ImportBatchKind): string {
  return BATCH_KIND_LABELS[kind];
}

/** `IMP-02`: validates an import batch ID format. */
export function isValidImportBatchId(id: string): boolean {
  return /^imp_[a-z0-9]{8,}$/.test(id);
}