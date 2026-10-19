import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ExploreItem } from './exploreTypes';
import { PrivacyImage } from '../../components/ui/PrivacyImage';
import {
  cellFor,
  columnWidth,
  metricsFor,
  resizeColumn,
  visibleColumns,
  type ColumnLayout,
  type SortDirection,
  type TableColumn,
  type TableTarget,
} from './tableModel';

/**
 * Table view (`TBL-01`–`TBL-09`).
 *
 * This is a **presentation of the same result sequence** as the grid, not a
 * second feature. It receives the same items, the same selection and the same
 * callbacks, which is what makes `TBL-01` achievable: switching views cannot
 * change the selection, filters, sort or focused item when it never owned them.
 *
 * It is virtualised and paginated exactly like the grid (`TBL-04`, `ARC-06`),
 * and has keyboard parity (`TBL-05`) except that lasso is deliberately grid-only.
 */

export type TableViewProps = {
  target: TableTarget;
  items: ExploreItem[];
  density: 'compact' | 'comfortable' | 'spacious';
  layout: ColumnLayout;
  onLayoutChange: (layout: ColumnLayout) => void;
  sort: SortDirection;
  onSortChange: (sort: SortDirection) => void;
  selectedIds: string[];
  focusedId: string | null;
  onSelect: (item: ExploreItem, modifiers: { shift: boolean; ctrl: boolean }) => void;
  onActivate: (item: ExploreItem) => void;
  /** Scrolls the focused row into view after a view switch (`TBL-01`). */
  pendingRevealId: string | null;
  onRevealHandled: () => void;
  onExportCsv: () => void;
  onOpenColumns: () => void;
};

export function ExploreTable({
  target,
  items,
  density,
  layout,
  onLayoutChange,
  sort,
  onSortChange,
  selectedIds,
  focusedId,
  onSelect,
  onActivate,
  pendingRevealId,
  onRevealHandled,
  onExportCsv,
  onOpenColumns,
}: TableViewProps) {
  const columns = useMemo(() => visibleColumns(target, layout), [target, layout]);
  const { rowHeight, thumbSize } = metricsFor(density);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [resizing, setResizing] = useState<{ id: string; startX: number; startWidth: number } | null>(null);
  const gridId = useId();

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const focusedIndex = items.findIndex((i) => i.id === focusedId);

  // --- pagination parity (`TBL-04`) ---------------------------------------
  // The overscan is in rows rather than pixels, because a row's height is fixed.
  const OVERSCAN_ROWS = 8;
  const rowCount = items.length;
  const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const visibleRows = Math.ceil(viewportHeight / rowHeight) + OVERSCAN_ROWS * 2;
  const lastVisible = Math.min(rowCount, firstVisible + visibleRows);
  const slice = items.slice(firstVisible, lastVisible);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const measure = () => setViewportHeight(element.clientHeight || 600);
    measure();
    element.addEventListener('scroll', () => setScrollTop(element.scrollTop), { passive: true });
    return () => element.removeEventListener('scroll', measure);
  }, []);

  // `TBL-01`: after a view switch the table scrolls so the focused item is
  // visible, rather than starting at the top and losing the user's place.
  useEffect(() => {
    if (pendingRevealId === null || focusedIndex < 0) {
      if (pendingRevealId !== null) onRevealHandled();
      return;
    }
    const top = focusedIndex * rowHeight;
    const bottom = top + rowHeight;
    const element = scrollRef.current;
    if (element && (top < element.scrollTop || bottom > element.scrollTop + viewportHeight)) {
      element.scrollTop = Math.max(0, top - viewportHeight / 3);
      setScrollTop(element.scrollTop);
    }
    onRevealHandled();
    // `viewportHeight` is intentionally not a dependency: re-running on resize
    // would yank the user back to the focused row while they were scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRevealId, focusedIndex, rowHeight]);

  // --- column resize (`TBL-06`) -------------------------------------------
  useEffect(() => {
    if (!resizing) return undefined;
    const onMove = (event: PointerEvent) => {
      onLayoutChange(
        resizeColumn(layout, resizing.id as TableColumn['id'], resizing.startWidth + (event.clientX - resizing.startX)),
      );
    };
    const onUp = () => setResizing(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [resizing, layout, onLayoutChange]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (items.length === 0) return;
      const index = Math.max(0, focusedIndex);
      const perPage = Math.max(1, Math.floor(viewportHeight / rowHeight));
      let next = index;
      switch (event.key) {
        case 'ArrowDown':
          next = index + 1;
          break;
        case 'ArrowUp':
          next = index - 1;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = items.length - 1;
          break;
        case 'PageDown':
          next = index + perPage;
          break;
        case 'PageUp':
          next = index - perPage;
          break;
        default:
          return;
      }
      event.preventDefault();
      const clamped = Math.min(items.length - 1, Math.max(0, next));
      const item = items[clamped];
      if (!item) return;
      // `TBL-05`: keyboard movement carries the same modifiers as a click, so
      // Shift+Arrow still ranges and Ctrl+Arrow still toggles.
      onSelect(item, { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey });
      const element = scrollRef.current;
      const top = clamped * rowHeight;
      if (element && (top < element.scrollTop || top + rowHeight > element.scrollTop + viewportHeight)) {
        element.scrollTop = Math.max(0, top - rowHeight);
      }
    },
    [items, focusedIndex, viewportHeight, rowHeight, onSelect],
  );

  const totalWidth = columns.reduce((sum, c) => sum + columnWidth(c, layout), 0);

  return (
    <div className="explore-table" data-testid="explore-table">
      <div className="table-toolbar">
        <button type="button" className="ghost" onClick={onOpenColumns}>
          Columns
        </button>
        <button type="button" className="ghost" onClick={onExportCsv}>
          Export CSV
        </button>
        <span className="hint">
          {columns.length} columns
        </span>
      </div>

      {/* `TBL-09`: grid semantics, with a header button per column. */}
      <div
        role="grid"
        aria-label="Images"
        aria-multiselectable="true"
        aria-rowcount={items.length}
        className="table-scroll"
        ref={scrollRef}
        style={{ minWidth: `${totalWidth}px` }}
        onKeyDown={onKeyDown}
      >
        <div role="rowgroup" className="table-head" style={{ height: `${rowHeight}px` }}>
          <div role="row" className="table-header-row">
            {columns.map((column) => {
              const width = columnWidth(column, layout);
              const active = sort.key === column.sortKey;
              return (
                <div
                  key={column.id}
                  role="columnheader"
                  aria-sort={active ? (sort.direction === 'ascending' ? 'ascending' : 'descending') : 'none'}
                  className="table-header-cell"
                  style={{ width: `${width}px`, minWidth: `${width}px` }}
                >
                  <HeaderButton
                    column={column}
                    active={active}
                    direction={sort.direction}
                    onSort={() => {
                      // `TBL-03`: ascending -> descending -> library default.
                      const key = column.sortKey;
                      if (!key) return;
                      if (sort.key !== key) onSortChange({ key, direction: 'ascending' });
                      else if (sort.direction === 'ascending') onSortChange({ key, direction: 'descending' });
                      else onSortChange({ key: null, direction: 'descending' });
                    }}
                  />
                  {column.label !== '' ? null : <span className="visually-hidden">Thumbnail</span>}
                  {/* `TBL-06`: a drag handle, because resizing is never the only way
                      to change a column's width. */}
                  <span
                    className="column-resizer"
                    role="separator"
                    aria-label={`Resize ${column.label || 'Thumbnail'} column`}
                    aria-orientation="vertical"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setResizing({ id: column.id, startX: event.clientX, startWidth: width });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div role="rowgroup">
          {slice.map((item, offset) => {
            const index = firstVisible + offset;
            const isSelected = selected.has(item.id);
            const isFocused = item.id === focusedId;
            return (
              <div
                key={item.id}
                role="row"
                aria-rowindex={index + 2}
                aria-selected={isSelected}
                // `TBL-05` / `VIS-12`: the focused row carries the focus ring.
                data-focused={isFocused ? 'true' : undefined}
                className={`table-row${isSelected ? ' selected' : ''}${isFocused ? ' focused' : ''}`}
                style={{ height: `${rowHeight}px` }}
                tabIndex={isFocused ? 0 : -1}
                onClick={(event) =>
                  onSelect(item, { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey })
                }
                onDoubleClick={() => onActivate(item)}
              >
                {columns.map((column) => {
                  const width = columnWidth(column, layout);
                  const cell = cellFor(item, column);
                  return (
                    <div
                      key={column.id}
                      role="gridcell"
                      className={`table-cell cell-${cell.kind}`}
                      style={{ width: `${width}px`, minWidth: `${width}px` }}
                    >
                      {column.id === 'thumbnail' ? (
                        item.thumbnailUrl && !item.missing ? (
                          <PrivacyImage
                            src={item.thumbnailUrl}
                            alt=""
                            itemId={item.id}
                            folderIds={item.folderIds}
                            style={{ objectFit: 'cover', width: thumbSize, height: thumbSize }}
                          />
                        ) : (
                          <span className="thumb-placeholder" aria-hidden="true" />
                        )
                      ) : (
                        // `TBL-07`: the tooltip carries the full value; the cell
                        // itself truncates.
                        <span title={cell.truncated || cell.title ? cell.title : undefined}>
                          {cell.text}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <span className="visually-hidden" id={gridId}>
        Table view. Row {focusedIndex + 1} of {items.length}.
      </span>
    </div>
  );
}

/** `TBL-03`: sortable headers cycle; unsortable ones explain why. */
function HeaderButton({
  column,
  active,
  direction,
  onSort,
}: {
  column: TableColumn;
  active: boolean;
  direction: 'ascending' | 'descending';
  onSort: () => void;
}) {
  if (!column.sortable) {
    return (
      // `TBL-03`: a disabled button with the reason as its tooltip, rather than
      // a header that silently ignores clicks.
      <button
        type="button"
        className="column-header unsortable"
        disabled
        title="This column can't be sorted."
        aria-label={`${column.label || 'Thumbnail'}, can't be sorted`}
      >
        {column.label}
      </button>
    );
  }
  return (
    <button
      type="button"
      className="column-header"
      onClick={onSort}
      aria-label={`Sort by ${column.label}`}
      data-active={active ? 'true' : undefined}
    >
      {column.label}
      <span aria-hidden="true" className="sort-indicator">
        {active ? (direction === 'ascending' ? '▲' : '▼') : ''}
      </span>
    </button>
  );
}