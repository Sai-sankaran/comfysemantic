import {
  DEFAULT_VIEW_STATE,
  EMPTY_FILTERS,
  type ExploreFilters,
  type ExploreItem,
  type ExploreSort,
  type FolderViewState,
  type GridMode,
  type LibraryType,
} from './exploreTypes';
import { graphemes } from './tableModel';

/**
 * Explore's pure logic (design §7.1).
 *
 * Everything here is a function of its arguments with no React and no I/O, which
 * is what makes the rules testable without a DOM and reusable by the screen, the
 * command palette and the tests alike.
 */

// ---------------------------------------------------------------------------
// GAL-04 — count text
// ---------------------------------------------------------------------------

/**
 * The count text.
 *
 * `GAL-04` is precise about four cases and they are genuinely different strings,
 * so they are enumerated rather than composed:
 *   - unfiltered folder: "412 images"
 *   - filtered: "37 of 412"
 *   - library root: "12,043 images"
 *   - Both scope: "30 pages · 118 panels"
 *
 * When the backend cannot return an exact count within 150 ms it shows "1,000+"
 * (capped at 10,000) and swaps in the exact number when it arrives; `exact` being
 * `null` is what selects that branch.
 */
export const COUNT_CAP = 10_000;

export function countText(options: {
  shown: number;
  total: number | null;
  filtered: boolean;
  atRoot: boolean;
  pages?: number;
  panels?: number;
  scope?: 'pages' | 'panels' | 'both';
  noun?: string;
  /**
   * `FLG-02` / `FLG-04`: how many items the Hidden view is showing, or `null` in
   * a normal view where `hiddenCount` says how many were removed.
   */
  hiddenOnly?: boolean;
  hiddenCount?: number;
}): string {
  const noun = options.noun ?? (options.scope === 'panels' ? 'panels' : 'images');
  const number = (n: number) => n.toLocaleString();

  // `FLG-04`: the Hidden view names itself, so a user who hid things can tell
  // they are looking somewhere different rather than having lost items.
  if (options.hiddenOnly) {
    return options.total === null
      ? `${approximateCount(options.shown)} hidden ${noun}`
      : `${number(options.total)} hidden ${noun}`;
  }

  // `GAL-04`: Both scope reports both sides of the split.
  if (options.scope === 'both') {
    const pages = options.pages ?? 0;
    const panels = options.panels ?? 0;
    return `${pages.toLocaleString()} ${pages === 1 ? 'page' : 'pages'} · ${panels.toLocaleString()} ${panels === 1 ? 'panel' : 'panels'}`;
  }

  const hidden = options.hiddenCount ?? 0;
  // `FLG-05`: the hidden count is shown beside the total, never folded into it.
  // A count that silently dropped from 412 to 409 would leave a user with no way
  // to tell that the items they hid are still there.
  const suffix = hidden > 0 ? ` (${number(hidden)} hidden)` : '';

  if (options.total === null) {
    const base = options.filtered
      ? `${number(options.shown)} of ${approximateCount(options.shown)}`
      : `${approximateCount(options.shown)} ${noun}`;
    return `${base}${suffix}`;
  }
  if (options.filtered) {
    return `${number(options.shown)} of ${number(options.total)}${suffix}`;
  }
  return `${number(options.total)} ${noun}${suffix}`;
}

/**
 * `GAL-04`: "1,000+" (capped at 10,000) when the backend cannot count in time.
 *
 * The floor is 1,000 rather than what has loaded: a placeholder reading "200+"
 * would claim a folder holds fewer items than one page.
 */
function approximateCount(value: number): string {
  return `${Math.min(Math.max(value, 1_000), COUNT_CAP).toLocaleString()}+`;
}

// ---------------------------------------------------------------------------
// GAL-13 — sorting
// ---------------------------------------------------------------------------

export type SortOption = { value: ExploreSort; label: string };

/**
 * The sort options for a library type (`GAL-13`).
 *
 * They differ per type: ComfyUI has *Generated date* only when at least one item
 * carries a `generated_at`, and comics have *Page order* as their default.
 */
export function sortOptions(type: LibraryType, hasGenerated: boolean): SortOption[] {
  if (type === 'comic') {
    return [
      { value: 'page_order', label: 'Page order' },
      { value: 'mtime_desc', label: 'Newest first' },
      { value: 'filename_asc', label: 'Filename A–Z' },
    ];
  }
  const options: SortOption[] = [
    { value: 'mtime_desc', label: 'Newest first' },
    { value: 'mtime_asc', label: 'Oldest first' },
    { value: 'filename_asc', label: 'Filename A–Z' },
    { value: 'filename_desc', label: 'Filename Z–A' },
  ];
  // "Generated date (only if present)".
  if (hasGenerated) options.push({ value: 'generated_desc', label: 'Generated date' });
  options.push({ value: 'size_desc', label: 'Size' }, { value: 'dimensions_desc', label: 'Dimensions' });
  return options;
}

/** `GAL-13`: the default differs by library type. */
export function defaultSort(type: LibraryType): ExploreSort {
  return type === 'comic' ? 'page_order' : 'mtime_desc';
}

/** `GAL-10`: type-ahead only applies when the grid is sorted by filename. */
export function isFilenameSort(sort: ExploreSort): boolean {
  return sort === 'filename_asc' || sort === 'filename_desc' || sort === 'page_order';
}

/**
 * Natural filename comparison (`GAL-13`'s "natural filename order").
 *
 * `page2` must sort before `page10`; a plain string sort puts it after.
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function compareItems(a: ExploreItem, b: ExploreItem, sort: ExploreSort): number {
  switch (sort) {
    case 'filename_asc':
      return naturalCompare(a.filename, b.filename);
    case 'filename_desc':
      return -naturalCompare(a.filename, b.filename);
    case 'page_order':
      return naturalCompare(a.filename, b.filename);
    case 'mtime_desc':
      return b.modifiedAt.localeCompare(a.modifiedAt);
    case 'mtime_asc':
      return a.modifiedAt.localeCompare(b.modifiedAt);
    case 'generated_desc': {
      // Items with no generation record sort last rather than as "oldest".
      if (a.generatedAt === null && b.generatedAt === null) return 0;
      if (a.generatedAt === null) return 1;
      if (b.generatedAt === null) return -1;
      return b.generatedAt.localeCompare(a.generatedAt);
    }
    case 'size_desc':
      return (b.fileSizeBytes ?? 0) - (a.fileSizeBytes ?? 0);
    case 'size_asc':
      return (a.fileSizeBytes ?? 0) - (b.fileSizeBytes ?? 0);
    case 'dimensions_desc':
      return (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0);
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// GAL-14 — filters
// ---------------------------------------------------------------------------

/** One removable chip: the facet, the value, and how to read it back. */
export type FilterChip = {
  id: string;
  label: string;
  /** The facet this chip belongs to, used by the facet popover to show it on. */
  facet: 'model' | 'lora' | 'sampler' | 'dimensions' | 'workflow' | 'favourite' | 'rating' | 'tag' | 'stage' | 'panels' | 'text' | 'reviewed' | 'flag';
};

export function filterChips(filters: ExploreFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const model of filters.model) {
    chips.push({ id: `model:${model}`, label: `Model: ${model}`, facet: 'model' });
  }
  for (const lora of filters.lora) {
    chips.push({ id: `lora:${lora}`, label: `LoRA: ${lora}`, facet: 'lora' });
  }
  for (const sampler of filters.sampler) {
    chips.push({ id: `sampler:${sampler}`, label: `Sampler: ${sampler}`, facet: 'sampler' });
  }
  if (filters.minWidth !== null || filters.minHeight !== null) {
    const w = filters.minWidth === null ? 'any' : filters.minWidth;
    const h = filters.minHeight === null ? 'any' : filters.minHeight;
    chips.push({ id: 'dimensions', label: `Dimensions: ≥ ${w} × ${h}`, facet: 'dimensions' });
  }
  if (filters.hasWorkflow !== null) {
    chips.push({
      id: 'workflow',
      label: filters.hasWorkflow ? 'Has workflow' : 'No workflow',
      facet: 'workflow',
    });
  }
  if (filters.favourite) {
    chips.push({ id: 'favourite', label: 'Favourite', facet: 'favourite' });
  }
  if (filters.ratingAtLeast > 0) {
    chips.push({ id: 'rating', label: `Rating ≥ ${filters.ratingAtLeast}`, facet: 'rating' });
  }
  for (const tag of filters.tags) {
    chips.push({ id: `tag:${tag}`, label: `Tag: ${tag}`, facet: 'tag' });
  }
  for (const [key, value] of [
    ['thumbnailStage', filters.thumbnailStage],
    ['metadataStage', filters.metadataStage],
    ['embeddingStage', filters.embeddingStage],
  ] as const) {
    if (value !== 'any') {
      const noun = key.replace('Stage', '');
      chips.push({ id: `${key}:${value}`, label: `${noun}: ${value}`, facet: 'stage' });
    }
  }
  if (filters.panels !== 'any') {
    chips.push({ id: `panels:${filters.panels}`, label: `Panels: ${filters.panels.replace('-', ' ')}`, facet: 'panels' });
  }
  if (filters.text !== 'any') {
    chips.push({ id: `text:${filters.text}`, label: `Text: ${filters.text.replace('-', ' ')}`, facet: 'text' });
  }
  if (filters.reviewed !== 'any') {
    chips.push({ id: `reviewed:${filters.reviewed}`, label: `Reviewed: ${filters.reviewed}`, facet: 'reviewed' });
  }
  // `FLG-07` / `FLG-08`: the Rejected and Picks filters, removable like any other.
  if (filters.flag !== 'any') {
    chips.push({
      id: `flag:${filters.flag}`,
      label: filters.flag === 'none' ? 'Flag: none' : filters.flag === 'pick' ? 'Picks' : 'Rejected',
      facet: 'flag',
    });
  }
  return chips;
}

export function activeFilterCount(filters: ExploreFilters): number {
  return filterChips(filters).length;
}

export function hasAnyFilter(filters: ExploreFilters): boolean {
  return activeFilterCount(filters) > 0;
}

/** `GAL-14`: "Clear N filters" is the `STA-04` action. */
export function clearAllLabel(count: number): string {
  return count === 1 ? 'Clear 1 filter' : `Clear ${count} filters`;
}

/** Remove one chip by its id (`GAL-14`: chips are removable). */
export function removeChip(filters: ExploreFilters, chipId: string): ExploreFilters {
  const [facet, ...rest] = chipId.split(':');
  const value = rest.join(':');
  switch (facet) {
    case 'model':
      return { ...filters, model: filters.model.filter((v) => v !== value) };
    case 'lora':
      return { ...filters, lora: filters.lora.filter((v) => v !== value) };
    case 'sampler':
      return { ...filters, sampler: filters.sampler.filter((v) => v !== value) };
    case 'dimensions':
      return { ...filters, minWidth: null, minHeight: null };
    case 'workflow':
      return { ...filters, hasWorkflow: null };
    case 'favourite':
      return { ...filters, favourite: false };
    case 'rating':
      return { ...filters, ratingAtLeast: 0 };
    case 'tag':
      return { ...filters, tags: filters.tags.filter((v) => v !== value) };
    case 'thumbnailStage':
      return { ...filters, thumbnailStage: 'any' };
    case 'metadataStage':
      return { ...filters, metadataStage: 'any' };
    case 'embeddingStage':
      return { ...filters, embeddingStage: 'any' };
    case 'panels':
      return { ...filters, panels: 'any' };
    case 'text':
      return { ...filters, text: 'any' };
    case 'reviewed':
      return { ...filters, reviewed: 'any' };
    case 'flag':
      return { ...filters, flag: 'any' };
    default:
      return filters;
  }
}

/** Toggle one facet value, which is how the facet popover works (`GAL-14`). */
export function toggleFacetValue(
  filters: ExploreFilters,
  facet: 'model' | 'lora' | 'sampler' | 'tags',
  value: string,
): ExploreFilters {
  const list = filters[facet];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return { ...filters, [facet]: next };
}

/** `GAL-14`: `includeSubfolders` off means only the chosen folder. */
export function inFolder(item: ExploreItem, folderId: string | null, includeSubfolders: boolean): boolean {
  if (folderId === null) return true;
  if (!item.folderIds.includes(folderId)) return false;
  if (includeSubfolders) return true;
  return item.folderIds[item.folderIds.length - 1] === folderId;
}

// ---------------------------------------------------------------------------
// GAL-19 — scope
// ---------------------------------------------------------------------------

/**
 * Split one page of pages into the cards a scope shows.
 *
 * `both` interleaves: each page card is followed by its panel cards, which is
 * what makes a single scroll read as one sequence rather than two lists.
 */
export function scopeCards(
  items: ExploreItem[],
  scope: 'pages' | 'panels' | 'both',
  panelsOf: (pageId: string) => ExploreItem[],
): ExploreItem[] {
  if (scope === 'pages') return items.filter((i) => i.kind === 'page');
  if (scope === 'panels') {
    return items.filter((i) => i.kind === 'page').flatMap((page) => panelsOf(page.id));
  }
  return items.flatMap((page) =>
    page.kind === 'page' ? [page, ...panelsOf(page.id)] : [page],
  );
}

// ---------------------------------------------------------------------------
// GAL-05 — layout
// ---------------------------------------------------------------------------

export type LayoutCell = {
  item: ExploreItem;
  index: number;
  /** Column and row within the flow. */
  column: number;
  row: number;
  /** Uniform: the square. Rows: the justified box, which keeps the aspect. */
  width: number;
  height: number;
  top: number;
  left: number;
};

export type GalleryLayout = {
  cells: LayoutCell[];
  /** Total content height, so the scroll container can size itself. */
  height: number;
  columns: number;
};

/**
 * `GAL-05`: layout is computed from the **stored** `width`/`height`, so it never
 * waits for image decoding and never shifts when images load.
 *
 * Uniform: every cell is a square of the chosen size, `object-fit: cover`.
 * Rows: justified rows of height = chosen size, row width = container width,
 * and **the last row is not stretched** — stretching it would distort the
 * aspect ratios of images the design says are never distorted (`GAL-17`).
 *
 * An item with unknown dimensions (a missing file) falls back to a square rather
 * than dropping out, so a corrupt file does not change the row rhythm.
 */
export function computeLayout(
  items: ExploreItem[],
  options: {
    mode: GridMode;
    thumbSize: number;
    gap: number;
    containerWidth: number;
  },
): GalleryLayout {
  const { mode, thumbSize, gap, containerWidth } = options;
  const cells: LayoutCell[] = [];
  if (items.length === 0) return { cells, height: 0, columns: 0 };

  if (mode === 'uniform') {
    const usable = Math.max(containerWidth, thumbSize);
    // GAL-06: the gap is between cells; the first cell starts at 0.
    const columns = Math.max(1, Math.floor((usable + gap) / (thumbSize + gap)));
    const actualWidth = (usable - gap * (columns - 1)) / columns;
    items.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      cells.push({
        item,
        index,
        column,
        row,
        width: actualWidth,
        height: actualWidth,
        left: column * (actualWidth + gap),
        top: row * (actualWidth + gap),
      });
    });
    const rows = Math.ceil(items.length / columns);
    return { cells, height: rows * actualWidth + (rows - 1) * gap, columns };
  }

  // Rows mode: a justified row packs images until the next one would not fit,
  // then scales the whole row — width *and* height together — so it fills the
  // container exactly.
  //
  // Scaling both dimensions is what makes "justified" and "never distorted"
  // (`GAL-17`) compatible. Scaling width alone while pinning the height would
  // make every image in the row wider than it is tall by the same factor, which
  // is precisely the distortion `GAL-17` forbids. The chosen thumbnail size is
  // therefore the row height *before* justification, and each row's actual height
  // varies by its content — which is what a justified layout is.
  const baseHeight = thumbSize;
  let y = 0;
  let pending: Array<{ item: ExploreItem; index: number; ratio: number }> = [];
  const rowTop = () => y;
  const flush = (
    rowIndices: Array<{ item: ExploreItem; index: number; ratio: number }>,
    stretch: boolean,
  ) => {
    const natural = rowIndices.reduce((sum, r) => sum + r.ratio * baseHeight, 0);
    const target = stretch
      ? Math.max(containerWidth - gap * (rowIndices.length - 1), 1)
      : natural;
    const scale = target / natural;
    const rowHeight = baseHeight * scale;
    let left = 0;
    rowIndices.forEach((entry, column) => {
      const width = entry.ratio * rowHeight;
      cells.push({
        item: entry.item,
        index: entry.index,
        column,
        row: 0,
        width,
        height: rowHeight,
        left,
        top: rowTop(),
      });
      left += width + gap;
    });
    y = rowTop() + rowHeight + gap;
  };

  items.forEach((item, index) => {
    const ratio = item.width && item.height ? item.width / item.height : 1;
    pending.push({ item, index, ratio });
    const used = pending.reduce((sum, r) => sum + r.ratio * baseHeight, 0);
    const needed = used + gap * (pending.length - 1);
    if (needed >= containerWidth) {
      flush(pending, true);
      pending = [];
    }
  });
  if (pending.length > 0) {
    // The last row is not stretched: scaling it to fill would leave a band of
    // empty space and change how the row reads.
    flush(pending, false);
    y -= gap;
  }
  return { cells, height: Math.max(y, baseHeight), columns: 0 };
}

/**
 * `GAL-05`: uniform cells use `object-position: top` for images taller than
 * 1:2.5, and `center` otherwise. Computed rather than left to CSS because the
 * rule is about the stored aspect ratio, not about what has decoded.
 */
export function objectPositionFor(width: number | null, height: number | null): 'center' | 'top' {
  if (!width || !height) return 'center';
  return height / width > 2.5 ? 'top' : 'center';
}

// ---------------------------------------------------------------------------
// GAL-09 — selection
// ---------------------------------------------------------------------------

export type SelectionState = {
  /** Every selected id, in selection order. */
  ids: string[];
  /** The anchor `Shift`-ranges extend from. */
  anchorId: string | null;
  /** The item the keyboard acts on; also the roving tabindex stop (`GAL-10`). */
  focusedId: string | null;
};

export const EMPTY_SELECTION: SelectionState = { ids: [], anchorId: null, focusedId: null };

function without(state: SelectionState, id: string): string[] {
  return state.ids.filter((x) => x !== id);
}

/**
 * `GAL-09`'s click rules, in the design's own order: click selects one,
 * `Ctrl+click` toggles, `Shift+click` selects a range.
 *
 * `Ctrl+Shift+click` is the combination people actually use to *extend* a
 * selection, so it extends from the anchor rather than replacing — a rule the
 * design does not spell out but that its three sentences imply.
 */
export function clickSelect(
  state: SelectionState,
  id: string,
  ordered: string[],
  modifiers: { shift: boolean; ctrl: boolean },
): SelectionState {
  if (modifiers.shift) {
    const anchor = state.anchorId ?? id;
    const from = ordered.indexOf(anchor);
    const to = ordered.indexOf(id);
    if (from < 0 || to < 0) return { ...state, ids: [id], anchorId: id, focusedId: id };
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    // Shift-extend replaces the range from the anchor; `Ctrl+Shift` adds to it.
    const kept = modifiers.ctrl ? without(state, anchor) : [];
    const range = ordered.slice(lo, hi + 1);
    return { ids: dedupe([...kept, ...range]), anchorId: anchor, focusedId: id };
  }
  if (modifiers.ctrl) {
    const ids = state.ids.includes(id) ? without(state, id) : [...state.ids, id];
    return { ids, anchorId: id, focusedId: id };
  }
  return { ids: [id], anchorId: id, focusedId: id };
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** `GAL-09`: `X` toggles the focused item. */
export function toggleSelect(state: SelectionState, _ordered: string[]): SelectionState {
  if (!state.focusedId) return state;
  const ids = state.ids.includes(state.focusedId)
    ? without(state, state.focusedId)
    : [...state.ids, state.focusedId];
  return { ...state, ids };
}

/**
 * `GAL-09`: `Ctrl+A` selects all **loaded** items, and the action bar then offers
 * "Select all N in this view" when more exist. `loadedTotal` is what decides
 * whether that second action appears.
 */
export function selectAllLoaded(state: SelectionState, loaded: string[]): SelectionState {
  return {
    ids: dedupe([...state.ids, ...loaded]),
    anchorId: state.anchorId ?? loaded[0] ?? null,
    focusedId: state.focusedId ?? loaded[0] ?? null,
  };
}

/** `GAL-09`: `Esc` clears the selection. */
export function clearSelection(): SelectionState {
  return EMPTY_SELECTION;
}

/**
 * Move the focus by `delta` cells in the current visual order.
 *
 * `columns` is 0 in Rows mode, where there is no fixed grid to step by — the
 * fallback steps one item, which is the only honest behaviour when the rows are
 * variable-width.
 */
export function moveFocus(
  state: SelectionState,
  ordered: string[],
  delta: number,
  _columns: number,
): SelectionState {
  if (ordered.length === 0) return EMPTY_SELECTION;
  const current = state.focusedId ? ordered.indexOf(state.focusedId) : -1;
  const next = Math.min(Math.max(current + delta, 0), ordered.length - 1);
  return { ...state, focusedId: ordered[next], anchorId: state.anchorId ?? ordered[next] };
}

/** `GAL-10`: `↑↓` move by a whole row. */
export function moveByRow(state: SelectionState, ordered: string[], rows: number, columns: number): SelectionState {
  return moveFocus(state, ordered, rows * Math.max(columns, 1), columns);
}

/**
 * `GAL-10`: type-ahead. Only active when the grid is sorted by filename, and the
 * buffer resets after 800 ms — the caller owns the timer.
 */
export function typeAhead(
  ordered: string[],
  byId: (id: string) => ExploreItem | undefined,
  prefix: string,
  from: string | null,
): string | null {
  const lower = prefix.toLowerCase();
  const start = from ? ordered.indexOf(from) + 1 : 0;
  const pool = [...ordered.slice(start), ...ordered.slice(0, start)];
  for (const id of pool) {
    const item = byId(id);
    if (item && item.filename.toLowerCase().startsWith(lower)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GAL-09 — lasso
// ---------------------------------------------------------------------------

export type Rect = { left: number; top: number; right: number; bottom: number };

export type LassoRect = { x: number; y: number; width: number; height: number };

export function lassoHits(
  rect: LassoRect,
  cell: { left: number; top: number; width: number; height: number },
): boolean {
  // A drag may go up/left as well as down/right, so the rectangle is normalised
  // before testing rather than assumed to have a positive extent.
  const left = Math.min(rect.x, rect.x + rect.width);
  const right = Math.max(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  return (
    cell.left < right &&
    cell.left + cell.width > left &&
    cell.top < bottom &&
    cell.top + cell.height > top
  );
}

/**
 * `GAL-09`: dragging within 48 px of the top or bottom edge auto-scrolls, at up
 * to 1,200 px/s. Returns the per-frame delta for a frame of `ms`.
 */
export function autoScrollDelta(pointerY: number, viewportHeight: number, ms: number): number {
  const EDGE = 48;
  const MAX_SPEED = 1200; // px per second
  if (pointerY < EDGE) {
    const depth = Math.min(EDGE - pointerY, EDGE);
    return -((depth / EDGE) ** 2) * MAX_SPEED * (ms / 1000);
  }
  const fromBottom = viewportHeight - pointerY;
  if (fromBottom < EDGE) {
    const depth = Math.min(EDGE - fromBottom, EDGE);
    return ((depth / EDGE) ** 2) * MAX_SPEED * (ms / 1000);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// GAL-22 — per-folder view memory
// ---------------------------------------------------------------------------

/**
 * The view state to start a folder with.
 *
 * `saved` is what `GAL-22` persisted for this `(library, folder)`. When it is
 * absent the folder gets the documented defaults for its library type — Newest
 * first for ComfyUI, Page order for comics (`GAL-13`).
 */
export function viewStateFor(
  saved: FolderViewState | undefined,
  libraryType: LibraryType,
): FolderViewState {
  if (saved) {
    // Thumbnail size is clamped even on a saved value: a stale memory from a
    // different display must not be able to produce an unusable cell size.
    return {
      ...DEFAULT_VIEW_STATE,
      ...saved,
      thumbSize: clampThumbSize(saved.thumbSize),
      filters: { ...EMPTY_FILTERS, ...saved.filters },
    };
  }
  return { ...DEFAULT_VIEW_STATE, sort: defaultSort(libraryType) };
}

/** `GAL-*`: 96-320 px, step 12. */
export const THUMB_MIN = 96;
export const THUMB_MAX = 320;
export const THUMB_STEP = 12;

export function clampThumbSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VIEW_STATE.thumbSize;
  const clamped = Math.min(Math.max(value, THUMB_MIN), THUMB_MAX);
  // Snap to the step, measured from the minimum, so a restored 181 becomes 180.
  const steps = Math.round((clamped - THUMB_MIN) / THUMB_STEP);
  return Math.min(THUMB_MIN + steps * THUMB_STEP, THUMB_MAX);
}

/** `GAL-06`: the gap between cells follows density. */
export function gapForDensity(density: 'compact' | 'comfortable' | 'spacious'): number {
  return density === 'compact' ? 4 : density === 'spacious' ? 12 : 8;
}

// ---------------------------------------------------------------------------
// GAL-07 — badges
// ---------------------------------------------------------------------------

export type BadgeInfo = {
  key: string;
  /** Accessible name; colour is never the only signal (`GAL-07`). */
  label: string;
  glyph: string;
  tone: 'neutral' | 'accent' | 'warn' | 'danger' | 'ok';
};

/** The order `GAL-07` lists them in, and the max-3 + "+N" rule. */
export function badgesFor(badges: ExploreItem['badges'], panelIsFirst = false): BadgeInfo[] {
  const table: Record<string, BadgeInfo> = {
    favourite: { key: 'favourite', label: 'Favourite', glyph: '★', tone: 'warn' },
    decomposed: { key: 'decomposed', label: 'Decomposed', glyph: '▦', tone: 'accent' },
    needsReview: { key: 'needsReview', label: 'Needs review', glyph: '⚑', tone: 'warn' },
    stale: { key: 'stale', label: 'Stale', glyph: '◷', tone: 'warn' },
    failed: { key: 'failed', label: 'Failed', glyph: '⚠', tone: 'danger' },
    missing: { key: 'missing', label: 'File missing', glyph: '⊘', tone: 'danger' },
    // `FLG-07` / `FLG-08`: the flag badges. A rejected item stays visible, so its
    // badge and the card's dimming are how the judgment is communicated.
    reject: { key: 'reject', label: 'Rejected', glyph: '⊗', tone: 'danger' },
    pick: { key: 'pick', label: 'Picked', glyph: '⚑', tone: 'ok' },
  };
  const list = badges.map((b) => table[b]).filter(Boolean);
  // `GAL-19`: a panel badge is the first top-right badge in Panels and Both scope.
  if (panelIsFirst) {
    list.unshift({ key: 'panel', label: 'Panel', glyph: '◧', tone: 'neutral' });
  }
  return list.slice(0, 3);
}

/** `GAL-07`: "max 3, overflow shown as +N". */
export function badgeOverflow(badges: ExploreItem['badges'], panelIsFirst = false): number {
  const total = badges.length + (panelIsFirst ? 1 : 0);
  return Math.max(0, total - 3);
}

// ---------------------------------------------------------------------------
// GAL-07 — the hover bar filename
// ---------------------------------------------------------------------------

/**
 * Middle-truncate the filename for the 28 px hover bar.
 *
 * The tail is what identifies a file, so the head is what gets sacrificed; a
 * generated name is long at the front and short at the end.
 *
 * Split over grapheme clusters, not code units. A filename with a combining
 * accent or an emoji would otherwise be cut mid-character and render as a
 * replacement glyph in the one place the user reads the filename.
 */
export function middleTruncate(text: string, max: number): string {
  const clusters = graphemes(text);
  if (clusters.length <= max) return text;
  const keepEnd = Math.ceil((max - 1) / 2);
  const keepStart = max - 1 - keepEnd;
  const head = clusters.slice(0, keepStart).join('');
  const tail = clusters.slice(clusters.length - keepEnd).join('');
  return `${head}…${tail}`;
}

// ---------------------------------------------------------------------------
// GAL-23 — the selection action bar
// ---------------------------------------------------------------------------

export type SelectionActionId =
  | 'tag'
  | 'rate'
  | 'favourite'
  | 'copyPaths'
  | 'addToScope'
  | 'compare'
  | 'exportPanels'
  | 'copyPrompts'
  | 'runOcr'
  | 'clear';

export type SelectionActionSpec = {
  id: SelectionActionId;
  label: string;
  enabled: boolean;
  /** `GAL-23`: "Actions that cannot apply to the current selection remain disabled with a reason." */
  reason?: string;
};

/**
 * Which actions apply to a selection.
 *
 * `GAL-23` gives the shape and the rules: Compare needs 2–4 *compatible* items,
 * Export panels and Run OCR are comic-only, Copy prompts is ComfyUI-only, and
 * everything that cannot apply is disabled **with a reason** rather than hidden —
 * a hidden button is indistinguishable from one that does not exist yet.
 */
export function selectionActions(options: {
  count: number;
  libraryType: LibraryType;
  /** Panels can only be compared with items of the same kind (`GAL-19`). */
  mixedKinds: boolean;
}): SelectionActionSpec[] {
  const { count, libraryType, mixedKinds } = options;
  const comic = libraryType === 'comic';
  const comparable = count >= 2 && count <= 4 && !mixedKinds;

  const specs: SelectionActionSpec[] = [
    { id: 'tag', label: 'Tag…', enabled: count > 0 },
    { id: 'rate', label: 'Rate', enabled: count > 0 },
    { id: 'favourite', label: 'Favourite', enabled: count > 0 },
    { id: 'copyPaths', label: 'Copy paths', enabled: count > 0 },
    { id: 'addToScope', label: 'Add to Pipeline scope', enabled: count > 0 },
  ];

  specs.push({
    id: 'compare',
    label: 'Compare',
    enabled: comparable,
    reason: mixedKinds
      ? 'Compare needs items of the same kind'
      : count < 2
        ? 'Select at least 2 images'
        : count > 4
          ? 'Select 2–4 images'
          : undefined,
  });

  specs.push({
    id: 'exportPanels',
    label: 'Export panels…',
    enabled: comic,
    reason: comic ? undefined : 'Comic libraries only',
  });
  specs.push({
    id: 'copyPrompts',
    label: 'Copy prompts',
    enabled: !comic,
    reason: comic ? 'ComfyUI libraries only' : undefined,
  });
  specs.push({
    id: 'runOcr',
    label: 'Run OCR…',
    enabled: comic,
    reason: comic ? undefined : 'Comic libraries only',
  });
  specs.push({ id: 'clear', label: 'Clear selection', enabled: count > 0 });

  return specs;
}

/** `GAL-09`: "Select all 12,043 in this view" appears only when more exist. */
export function selectAllInViewLabel(loaded: number, total: number | null): string | null {
  if (total === null || total <= loaded) return null;
  return `Select all ${total.toLocaleString()} in this view`;
}