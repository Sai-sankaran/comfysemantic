import type { ExploreItem, LibraryType } from './exploreTypes';

/**
 * Table view (design Appendix E.2, `TBL-01`–`TBL-10`).
 *
 * Everything here is pure so the rules can be tested without a DOM. The one
 * thing worth stating up front is why this is a *separate* module rather than
 * more grid code: `TBL-01` demands that switching views keeps the selection,
 * filters, sort and focused item, which only works if both views are
 * presentations of the *same* result sequence rather than two features that
 * happen to look similar.
 */

/** A column as the specification names it. */
export type TableColumnId =
  // shared
  | 'thumbnail'
  | 'name'
  | 'folder'
  | 'dimensions'
  | 'size'
  | 'modified'
  | 'rating'
  | 'favourite'
  | 'flag'
  | 'tags'
  // ComfyUI
  | 'model'
  | 'sampler'
  | 'steps'
  | 'cfg'
  | 'seed'
  | 'loras'
  | 'processing'
  | 'prompt'
  // comic page
  | 'series'
  | 'panels'
  | 'ocr'
  | 'review'
  // comic panel
  | 'page'
  | 'panelIndex'
  | 'text';

export type TableColumn = {
  id: TableColumnId;
  /** The header text. */
  label: string;
  /**
   * `TBL-03`: only columns backed by an index are sortable. Everything else
   * shows the tooltip "This column can't be sorted." rather than silently
   * ignoring the click.
   */
  sortable: boolean;
  /** `TBL-03`: the sort value this column produces, in the gallery's sort vocabulary. */
  sortKey?: SortKey;
  defaultWidth: number;
  /** Off by default: `TBL-02` says the prompt column is. */
  defaultHidden?: boolean;
};

export type SortKey =
  | 'filename_asc'
  | 'mtime_desc'
  | 'size_desc'
  | 'dimensions_desc'
  | 'rating_desc'
  | 'model_asc'
  | 'steps_desc'
  | 'seed_asc'
  | 'page_order';

const SHARED: TableColumn[] = [
  { id: 'thumbnail', label: '', sortable: false, defaultWidth: 56 },
  { id: 'name', label: 'Name', sortable: true, sortKey: 'filename_asc', defaultWidth: 220 },
  { id: 'folder', label: 'Folder', sortable: false, defaultWidth: 180 },
  { id: 'dimensions', label: 'Dimensions', sortable: true, sortKey: 'dimensions_desc', defaultWidth: 110 },
  { id: 'size', label: 'Size', sortable: true, sortKey: 'size_desc', defaultWidth: 90 },
  { id: 'modified', label: 'Modified', sortable: true, sortKey: 'mtime_desc', defaultWidth: 150 },
  { id: 'rating', label: 'Rating', sortable: true, sortKey: 'rating_desc', defaultWidth: 80 },
  { id: 'favourite', label: 'Fav', sortable: false, defaultWidth: 56 },
  { id: 'flag', label: 'Flag', sortable: false, defaultWidth: 80 },
  { id: 'tags', label: 'Tags', sortable: false, defaultWidth: 180 },
];

const COMFYUI: TableColumn[] = [
  ...SHARED,
  { id: 'model', label: 'Model', sortable: true, sortKey: 'model_asc', defaultWidth: 200 },
  { id: 'sampler', label: 'Sampler', sortable: false, defaultWidth: 110 },
  { id: 'steps', label: 'Steps', sortable: true, sortKey: 'steps_desc', defaultWidth: 70 },
  { id: 'cfg', label: 'CFG', sortable: false, defaultWidth: 64 },
  { id: 'seed', label: 'Seed', sortable: true, sortKey: 'seed_asc', defaultWidth: 120 },
  { id: 'loras', label: 'LoRAs', sortable: false, defaultWidth: 180 },
  { id: 'processing', label: 'Processing', sortable: false, defaultWidth: 110 },
  // `TBL-02`: the Prompt column is off by default.
  { id: 'prompt', label: 'Prompt', sortable: false, defaultWidth: 240, defaultHidden: true },
];

const COMIC_PAGE: TableColumn[] = [
  ...SHARED,
  { id: 'series', label: 'Series', sortable: false, defaultWidth: 180 },
  { id: 'panels', label: 'Panels', sortable: false, defaultWidth: 100 },
  { id: 'ocr', label: 'OCR', sortable: false, defaultWidth: 90 },
  { id: 'review', label: 'Review', sortable: false, defaultWidth: 90 },
];

const COMIC_PANEL: TableColumn[] = [
  { id: 'thumbnail', label: '', sortable: false, defaultWidth: 56 },
  { id: 'page', label: 'Page', sortable: false, defaultWidth: 200 },
  { id: 'panelIndex', label: 'Panel #', sortable: false, defaultWidth: 80 },
  { id: 'series', label: 'Series', sortable: false, defaultWidth: 160 },
  { id: 'size', label: 'Size', sortable: true, sortKey: 'size_desc', defaultWidth: 90 },
  { id: 'ocr', label: 'OCR', sortable: false, defaultWidth: 90 },
  { id: 'tags', label: 'Tags', sortable: false, defaultWidth: 160 },
  { id: 'text', label: 'Text', sortable: false, defaultWidth: 240 },
];

export type TableTarget = 'comfyui' | 'comic-page' | 'comic-panel';

/** `TBL-02`: the column set for a library type and scope. */
export function columnsFor(target: TableTarget): TableColumn[] {
  if (target === 'comic-panel') return COMIC_PANEL;
  return target === 'comic-page' ? COMIC_PAGE : COMFYUI;
}

export function targetFor(libraryType: LibraryType, scope: 'pages' | 'panels' | 'both'): TableTarget {
  if (libraryType === 'comic' && scope === 'panels') return 'comic-panel';
  return libraryType === 'comic' ? 'comic-page' : 'comfyui';
}

/** `TBL-02`: Name is always shown, whatever the user's column layout says. */
export const ALWAYS_VISIBLE: TableColumnId = 'name';

/** `TBL-04`: row height and thumbnail size follow density. */
export function metricsFor(density: 'compact' | 'comfortable' | 'spacious') {
  if (density === 'compact') return { rowHeight: 28, thumbSize: 24 };
  if (density === 'spacious') return { rowHeight: 40, thumbSize: 36 };
  return { rowHeight: 32, thumbSize: 28 };
}

/** `TBL-06`: the minimum width a column can be dragged to. */
export const MIN_COLUMN_WIDTH = 64;

export type ColumnLayout = {
  /** Every column of the target, in display order, including hidden ones. */
  order: TableColumnId[];
  hidden: TableColumnId[];
  widths: Partial<Record<TableColumnId, number>>;
};

/** `TBL-06`: the default layout for a target, from the column definitions. */
export function defaultLayout(target: TableTarget): ColumnLayout {
  const columns = columnsFor(target);
  return {
    order: columns.map((c) => c.id),
    hidden: columns.filter((c) => c.defaultHidden).map((c) => c.id),
    widths: {},
  };
}

/** The columns actually rendered, in order. */
export function visibleColumns(target: TableTarget, layout: ColumnLayout): TableColumn[] {
  const byId = new Map(columnsFor(target).map((c) => [c.id, c]));
  return layout.order
    .filter((id) => !layout.hidden.includes(id))
    .map((id) => byId.get(id))
    .filter((c): c is TableColumn => c !== undefined);
}

export function columnWidth(column: TableColumn, layout: ColumnLayout): number {
  return layout.widths[column.id] ?? column.defaultWidth;
}

/** `TBL-06`: Name can never be hidden, so the table always names its rows. */
export function toggleColumn(layout: ColumnLayout, id: TableColumnId): ColumnLayout {
  if (id === ALWAYS_VISIBLE) return layout;
  const hidden = layout.hidden.includes(id)
    ? layout.hidden.filter((x) => x !== id)
    : [...layout.hidden, id];
  return { ...layout, hidden };
}

/** `TBL-06`: Move left / Move right, so reordering is never drag-only. */
export function moveColumn(layout: ColumnLayout, id: TableColumnId, direction: -1 | 1): ColumnLayout {
  const from = layout.order.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[from], order[to]] = [order[to], order[from]];
  return { ...layout, order };
}

/** `TBL-06`: drag-to-resize, clamped to the documented minimum. */
export function resizeColumn(layout: ColumnLayout, id: TableColumnId, width: number): ColumnLayout {
  return { ...layout, widths: { ...layout.widths, [id]: Math.max(Math.round(width), MIN_COLUMN_WIDTH) } };
}

/** `TBL-06`: Reset columns. */
export function resetLayout(target: TableTarget): ColumnLayout {
  return defaultLayout(target);
}

/** The sort a header click produces, or `null` when the column is not sortable. */
export type SortCycle = 'ascending' | 'descending' | 'default' | null;

/**
 * `TBL-03`: clicking a header cycles ascending → descending → library default.
 *
 * The third stop matters: without it there is no way back to the library's own
 * ordering once a column has been clicked, which is why the cycle has three
 * states rather than two.
 */
export function nextSort(column: TableColumn, current: SortDirection): SortCycle {
  if (!column.sortable) return null;
  const currentDir = current.direction;
  if (current.key !== column.sortKey) return 'ascending';
  return currentDir === 'ascending' ? 'descending' : 'default';
}

/** The gallery's sort direction, in the vocabulary the shared sort control uses. */
export type SortDirection = {
  key: SortKey | null;
  direction: 'ascending' | 'descending';
};

export function sortLabel(column: TableColumn, current: SortDirection): string | null {
  const cycle = nextSort(column, current);
  if (cycle === null) return "This column can't be sorted.";
  if (cycle === 'default') return 'Library default';
  return cycle === 'ascending' ? 'Ascending' : 'Descending';
}

/** How long `TBL-02` shows a prompt or OCR text in a cell before the ellipsis. */
export const PROMPT_CELL_CHARS = 60;
export const TEXT_CELL_CHARS = 80;

export type Cell = {
  /** The rendered text. `''` means the value is absent, and nothing is shown. */
  text: string;
  /** The full value, for the `TBL-07` tooltip. */
  title: string;
  /** `TBL-07`: the cell truncates rather than wrapping or growing. */
  truncated: boolean;
  kind: 'text' | 'image' | 'number' | 'stars' | 'bool' | 'badge';
};

/**
 * `TBL-07`: cells truncate with an ellipsis and carry the full value in a
 * tooltip. `TBL-07` also says long prompts and OCR text are *never* shown
 * unabridged — so the truncation is applied here, once, rather than relying on
 * CSS alone (which would put the whole prompt in the DOM and in a copy).
 *
 * The slice is taken over **grapheme clusters**, not code units and not even code
 * points. `String.slice` cuts a surrogate pair in half; splitting a code point
 * fixes that but still breaks anything the user perceives as one character — a
 * combining accent, a Devanagari conjunct, a flag made of two regional
 * indicators, an emoji with a skin-tone or ZWJ modifier. All of those are
 * ordinary in OCR text and filenames, which is where this runs.
 */
export function clip(text: string, limit: number): { value: string; truncated: boolean } {
  const clusters = graphemes(text);
  if (clusters.length <= limit) return { value: text, truncated: false };
  const room = Math.max(limit - 1, 0);
  return { value: `${clusters.slice(0, room).join('').trimEnd()}…`, truncated: true };
}

/**
 * Splits into user-perceived characters.
 *
 * `Intl.Segmenter` is the correct tool and is present in every browser and
 * runtime this ships to. The `Array.from` fallback is there only so a host
 * without it degrades to code points rather than splitting a surrogate pair —
 * which is the failure that produced a replacement glyph.
 */
const segmenter: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

export function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text);
}

/** The value shown in a cell for one column of one item. */
export function cellFor(item: ExploreItem, column: TableColumn): Cell {
  const row = item.row;
  /**
   * The rendered value, and the **full** value for the tooltip.
   *
   * They are separate arguments on purpose. A Folder cell shows only the last
   * path segment, but the tooltip must still carry the whole path — otherwise the
   * one place the user can read the full value is the place it is most truncated.
   */
  const text = (shown: string, title: string, limit = Number.MAX_SAFE_INTEGER): Cell => {
    const { value: clipped, truncated } = clip(shown, limit);
    return { text: clipped, title, truncated, kind: 'text' };
  };
  const bool = (value: boolean, yes: string, no: string): Cell => ({
    text: value ? yes : '',
    title: value ? yes : no,
    truncated: false,
    kind: 'bool',
  });
  const size = (bytes: number | null): Cell =>
    bytes === null || bytes === undefined
      ? { text: '', title: 'Unknown', truncated: false, kind: 'number' }
      : {
          text: `${(bytes / 1_000_000).toFixed(1)} MB`,
          title: `${bytes.toLocaleString()} bytes`,
          truncated: false,
          kind: 'number',
        };

  switch (column.id) {
    case 'thumbnail':
      return {
        text: '',
        title: item.missing ? 'File missing' : item.filename,
        truncated: false,
        kind: 'image',
      };
    case 'name':
      return text(item.filename, item.displayPath);
    case 'folder':
      // The last path segment is what distinguishes two files with the same
      // name; the whole path is in the tooltip.
      return text(
        item.displayPath.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? item.displayPath,
        item.displayPath,
      );
    case 'dimensions':
      return text(`${item.width} × ${item.height}`, `${item.width} × ${item.height} pixels`);
    case 'size':
      return size(item.fileSizeBytes);
    case 'modified':
      return { text: formatShortDate(item.modifiedAt), title: item.modifiedAt, truncated: false, kind: 'text' };
    case 'rating': {
      const rating = row?.rating ?? 0;
      return {
        text: rating > 0 ? '★'.repeat(rating) : '',
        title: rating > 0 ? `${rating} of 5` : 'Not rated',
        truncated: false,
        kind: 'stars',
      };
    }
    case 'favourite':
      return bool(row?.favourite ?? false, '★', 'Not a favourite');
    case 'flag': {
      // `FLG-11`: the flag column reads `items.flag`, not a row value — the
      // flag is item data, so it lives on the item.
      const flag = item.flag;
      return {
        text: flag === 'none' ? '' : flag === 'pick' ? 'Pick' : 'Reject',
        title: flag === 'none' ? 'No flag' : flag === 'pick' ? 'Picked' : 'Rejected',
        truncated: false,
        kind: 'badge',
      };
    }
    case 'tags':
      return text((row?.tags ?? []).join(', '), row?.tags.join(', ') ?? 'No tags');
    case 'model':
      return text(row?.model ?? '', row?.model ?? 'No model');
    case 'sampler':
      return text(row?.sampler ?? '', row?.sampler ?? 'No sampler');
    case 'steps':
      return text(
        row?.steps === null || row?.steps === undefined ? '' : String(row.steps),
        row?.steps === null || row?.steps === undefined ? 'No step count' : `${row.steps} steps`,
      );
    case 'cfg':
      return text(
        row?.cfg === null || row?.cfg === undefined ? '' : row.cfg.toFixed(1),
        row?.cfg === null || row?.cfg === undefined ? 'No CFG' : `CFG ${row.cfg.toFixed(1)}`,
      );
    case 'seed':
      return text(row?.seed ?? '', row?.seed ?? 'No seed');
    case 'loras': {
      const loras = row?.loras ?? [];
      return text(
        loras.map((l) => `${l.name} · ${l.weight.toFixed(2)}`).join(', '),
        loras.length > 0
          ? loras.map((l) => `${l.name} · ${l.weight.toFixed(2)}`).join('\n')
          : 'No LoRAs',
      );
    }
    case 'processing': {
      const status = row?.processing ?? 'none';
      return {
        text: status === 'ok' ? '✓' : status === 'none' ? '' : status === 'stale' ? '↻' : '⚠',
        title: PROCESSING_TEXT[status],
        truncated: false,
        kind: 'badge',
      };
    }
    case 'prompt':
      // `TBL-02` and `TBL-07`: first 60 characters, and never unabridged.
      return text(row?.prompt ?? '', row?.prompt ?? 'No prompt', PROMPT_CELL_CHARS);
    case 'series':
      return text(row?.seriesLabel ?? '', row?.seriesLabel ?? 'No series');
    case 'panels': {
      const status = row?.panelStatus ?? 'not-decomposed';
      const count = row?.panelCount;
      return {
        text: status === 'decomposed' && count !== null && count !== undefined ? String(count) : '',
        title: PANEL_TEXT[status],
        truncated: false,
        kind: 'number',
      };
    }
    case 'ocr': {
      const status = row?.ocrStatus ?? 'none';
      return { text: status === 'done' ? '✓' : status === 'none' ? '' : '⚠', title: OCR_TEXT[status], truncated: false, kind: 'badge' };
    }
    case 'review': {
      const status = row?.reviewStatus ?? 'none';
      return {
        text: status === 'none' ? '' : status === 'reviewed' ? '✓' : '○',
        title: REVIEW_TEXT[status],
        truncated: false,
        kind: 'badge',
      };
    }
    case 'page': {
      const shown = item.parentSeriesLabel ? `${item.parentSeriesLabel} · ${item.parentPageId}` : '';
      return text(shown, shown || 'No parent page');
    }
    case 'panelIndex':
      return text(
        item.panelIndex === null ? '' : String(item.panelIndex),
        item.panelIndex === null ? 'Not a panel' : `Panel ${item.panelIndex}`,
      );
    case 'text':
      // `TBL-02` and `TBL-07`: the first 80 characters, never the whole OCR run.
      return text(row?.text ?? '', row?.text ?? 'No text', TEXT_CELL_CHARS);
    default:
      return { text: '', title: '', truncated: false, kind: 'text' };
  }
}

const PROCESSING_TEXT: Record<string, string> = {
  ok: 'All stages done',
  stale: 'Stale — needs a re-run',
  failed: 'A stage failed',
  none: 'Not processed',
};

const PANEL_TEXT: Record<string, string> = {
  decomposed: 'Decomposed',
  'not-decomposed': 'Not decomposed',
  'no-panels': 'No panels found',
  stale: 'Stale',
};

const OCR_TEXT: Record<string, string> = {
  done: 'OCR done',
  none: 'No OCR',
  failed: 'OCR failed',
  needsReview: 'OCR needs review',
};

const REVIEW_TEXT: Record<string, string> = {
  none: 'Not in the review queue',
  reviewed: 'Reviewed',
  pending: 'Needs review',
};

/**
 * `TBL-08`: CSV of the **visible columns in their current order**.
 *
 * Only the visible columns, because a CSV is an export of what the user can
 * see; and the current order, because the header row is what makes a CSV
 * readable. Quoting follows RFC 4180, and a cell that had to be truncated for
 * display is exported in full.
 */
export function csvOf(items: ExploreItem[], columns: TableColumn[]): string {
  const escape = (value: string): string =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const header = columns.map((c) => escape(c.label || c.id)).join(',');
  const lines = items.map((item) =>
    columns.map((c) => escape(cellFor(item, c).title)).join(','),
  );
  return [header, ...lines].join('\r\n');
}

/** `TBL-04`: the number of rows that fits in one viewport height. */
export function rowsPerViewport(viewportHeight: number, rowHeight: number): number {
  return Math.max(1, Math.ceil(viewportHeight / rowHeight));
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { dateStyle: 'short' }) +
    ' ' +
    date.toLocaleTimeString(undefined, { timeStyle: 'short' });
}