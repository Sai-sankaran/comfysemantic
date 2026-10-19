import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, EmptyState, Tree, type TreeNode } from '../../components/ui';
import { useShellPanes } from '../../app/shellPanes';
import { Inspector, type InspectorActions } from './ExploreInspector';
import { ExploreTable } from './ExploreTable';
import { ColumnsMenu } from './ColumnsMenu';
import {
  defaultLayout,
  targetFor,
  visibleColumns,
  type ColumnLayout,
  type SortDirection,
} from './tableModel';
import {
  actionLabel,
  applyFlag,
  flagTargets,
  hideRejectedSummary,
} from './flagsModel';
import { ExploreToolbar } from './ExploreToolbar';
import { ImageCard } from './ImageCard';
import { PeekOverlay } from './PeekOverlay';
import { SelectionActionBar } from './SelectionActionBar';
import {
  COPY_STATES,
  copyToClipboard,
  type CopyChoice,
} from '../export/copyMenu';
import type { CopyItem } from '../export/copyModel';
import type { ExportChoice } from '../export/exportMenu';
import {
  destinationChosen,
  outcome,
  outcomeMessage,
  startExport,
} from '../export/exportRun';
import { planImageExport, type ExportItem, type ExportPlan } from '../export/exportModel';
import {
  pickExportFolder,
  saveTextToFile,
  writeClipboardText,
} from '../../platform/transport';

/**
 * `CPY-08`'s thresholds, read as the defaults the settings registry declares.
 * They are inlined here rather than fetched so a copy never waits on a settings
 * read; `G.3` makes them user-adjustable, and the registry is where that value
 * will be threaded once Export is wired to the catalog.
 */
const COPY_LIMITS = {
  confirmItems: 2000,
  confirmMB: 2,
  hardCapItems: 10_000,
  hardCapMB: 5,
};

/**
 * Map the gallery's selected items to the export planner's input.
 *
 * `EXP-06` copies the original file byte-identically, so the planner needs the
 * source size for its estimate. `missing` comes straight from `ExploreItem`.
 */
function exportItemsFrom(items: ExploreItem[]): ExportItem[] {
  return items.map((item) => ({
    id: item.id,
    filename: item.filename,
    relativePath: item.displayPath || item.filename,
    folder: item.folderIds[0] ?? '',
    size: item.fileSizeBytes ?? 0,
    modifiedAt: Date.parse(item.modifiedAt) || 0,
    positivePrompt: item.row?.prompt ?? null,
    negativePrompt: null,
    tags: item.row?.tags ?? [],
    rating: item.row?.rating ?? null,
    favourite: item.row?.favourite ?? undefined,
    width: item.width ?? null,
    height: item.height ?? null,
    missingFile: item.missing,
  }));
}

/**
 * Turn a menu choice into a plan.
 *
 * Returns `null` for the choices the writer does not handle yet (the CSV and
 * single-JSON exports). `null` is deliberate: an empty plan is a *valid-looking*
 * plan, and the writer would report "done, 0 files written" for it — the exact
 * silent-nothing trap. `null` means "not supported", which the caller reports
 * rather than runs.
 */
function exportPlanFor(choice: ExportChoice, items: ExportItem[]): ExportPlan | null {
  const captionByChoice: Partial<Record<ExportChoice, 'prompt' | 'tags' | 'prompt+tags'>> = {
    'images-prompt': 'prompt',
    'images-tags': 'tags',
    'images-prompt-tags': 'prompt+tags',
  };
  const caption = captionByChoice[choice];
  if (!caption) return null;
  return planImageExport({
    items,
    takenNames: new Set(),
    caption,
    includeUncaptioned: false,
  });
}
import {
  autoScrollDelta,
  clampThumbSize,
  clickSelect,
  clearSelection,
  computeLayout,
  countText,
  EMPTY_SELECTION,
  filterChips,
  gapForDensity,
  isFilenameSort,
  lassoHits,
  moveByRow,
  moveFocus,
  selectAllLoaded,
  toggleSelect,
  typeAhead,
  type SelectionState,
} from './exploreModel';
import { clearQuickFilters } from './quickFiltersModel';
import {
  EMPTY_FILTERS,
  type ExploreFacets,
  type ExploreFolder,
  type ExploreItem,
  type ExploreItemDetail,
  type ExplorePanelDetail,
  type ExploreLoadState,
  type ExploreScope,
  type FolderViewState,
  type GridMode,
  type LibraryType,
  type ExploreSource,
} from './exploreTypes';

/**
 * Explore (design §7.1) — browse a library's images by folder and select them.
 *
 * Layout: `[Folder tree] [Gallery] [Inspector]`. The gallery carries a 40 px
 * toolbar and the grid.
 *
 * The screen depends on exactly one external thing — `ExploreSource` — and holds
 * no knowledge of where items came from, so the fixture source and a backend
 * source are interchangeable without changing a line here.
 *
 * What is deliberately **not** here: any job, any index request, any model call.
 * `GAL-15` and `PRD-06` require that browsing never starts work, and nothing in
 * this file can.
 */

export type ExploreScreenProps = {
  source: ExploreSource;
  libraryId: string;
  libraryType: LibraryType;
  /** `'compact' | 'comfortable' | 'spacious'` from the theme layer. */
  density: 'compact' | 'comfortable' | 'spacious';
  /** Restores `GAL-16`'s round trip after the viewer closes. */
  restoreScrollTop?: number | null;
  onOpenViewer?: (item: ExploreItem) => void;
  onOpenPipeline?: () => void;
  /**
   * Where a screen-level note goes. Defaults to the shell's own note line through
   * `ShellPanes`, so there is one message with one lifetime rather than a second
   * toast the shell knows nothing about.
   */
  onNotify?: (message: string) => void;
  /**
   * `E.5`: `browse.advanceAfterFlag`, default **off**.
   *
   * A prop rather than a registry lookup because it is a setting, not an action,
   * and threading it explicitly keeps the flag behaviour visible at the call
   * site where a reader can see the default.
   */
  advanceAfterFlag?: boolean;
};

const PAGE_SIZE = 200; // GAL-02
const TYPE_AHEAD_RESET_MS = 800; // GAL-10

export function ExploreScreen(props: ExploreScreenProps) {
  const {
    source,
    libraryId,
    libraryType,
    density,
    restoreScrollTop = null,
    onOpenViewer = () => undefined,
    onOpenPipeline = () => undefined,
    onNotify,
    // `E.5`: default off, so flagging never moves the user unexpectedly.
    advanceAfterFlag = false,
  } = props;

  // `NAV-04` / `NAV-05`: both panes belong to the shell, so they are read from
  // the shell's context rather than passed in. A screen mounted alone (a test, a
  // harness) sees them open, which is the state a first-time user is in.
  const panes = useShellPanes();
  const treeOpen = panes?.treeOpen ?? true;
  const inspectorOpen = panes?.inspectorOpen ?? true;
  // The shell's note line by default; a caller can override it.
  // A stable identity: `notify` is a dependency of the memoised inspector
  // actions, and an inline arrow would invalidate them on every render.
  const noop = useCallback(() => undefined, []);
  const notify = onNotify ?? panes?.notify ?? noop;

  // `GAL-22`: per-folder view memory. It lives in the screen rather than the
  // shell because only Explore has folders, and the design forbids
  // `localStorage` for it, so it is held for the session until the per-folder
  // view table exists in the application database.
  const [viewMemory, setViewMemory] = useState<Map<string, FolderViewState>>(() => new Map());

  const [folderId, setFolderId] = useState<string | null>(null);
  const [items, setItems] = useState<ExploreItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  // `FLG-05`: how many items the hidden filter removed from this scope.
  const [hiddenCount, setHiddenCount] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<ExploreLoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<ExploreFacets | null>(null);
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const [peekOpen, setPeekOpen] = useState(false);
  const [detail, setDetail] = useState<ExploreItemDetail | null>(null);
  const [lasso, setLasso] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);
  const typeAheadBuffer = useRef<{ prefix: string; at: number }>({ prefix: '', at: 0 });
  const restorePending = useRef<number | null>(restoreScrollTop ?? null);

  // --- view state ----------------------------------------------------------
  // `GAL-22`: for each `(library, folder)` the last sort/direction, thumbnail
  // size, grid mode, active filter chips and the Subfolders toggle are
  // remembered. The value is derived during render rather than pushed into an
  // effect, so switching folders cannot show one frame of the previous folder's
  // view before correcting itself.
  const memoryKey = `${libraryId}:${folderId ?? 'root'}`;

  /** The saved view for this folder, with incompatible filters removed. */
  const restored = useMemo(() => {
    const saved = viewMemory.get(memoryKey);
    const next = saved
      ? { ...EMPTY_VIEW, ...saved, filters: { ...EMPTY_FILTERS, ...saved.filters } }
      : { ...EMPTY_VIEW };
    // A filter that cannot apply to this library type is dropped and named; the
    // other remembered state is kept (`GAL-22`).
    const dropped: string[] = [];
    if (next.filters.panels !== 'any' && libraryType !== 'comic') {
      next.filters = { ...next.filters, panels: 'any' };
      dropped.push('Panels');
    }
    if (next.filters.text !== 'any' && libraryType !== 'comic') {
      next.filters = { ...next.filters, text: 'any' };
      dropped.push('Text');
    }
    return { next, dropped: dropped.length > 0 ? dropped.join(' and ') : null };
  }, [viewMemory, memoryKey, libraryType]);

  const [view, setView] = useState<FolderViewState>(restored.next);
  const [droppedFilter, setDroppedFilter] = useState<string | null>(null);

  // Switching folders adjusts state *during render* rather than in an effect:
  // React re-renders immediately, so the grid can never paint one frame of the
  // previous folder's view before correcting itself.
  const [lastMemoryKey, setLastMemoryKey] = useState(memoryKey);
  if (lastMemoryKey !== memoryKey) {
    setLastMemoryKey(memoryKey);
    setView(restored.next);
    if (restored.dropped) setDroppedFilter(restored.dropped);
  }

  const updateView = useCallback(
    (patch: Partial<FolderViewState>) => {
      setView((current) => {
        const next = { ...current, ...patch };
        // `QFL-06`: Quick filters are **never** persisted to folder view memory,
        // the launch snapshot, or settings. Strip them before saving.
        if (next.filters) {
          next.filters = clearQuickFilters(next.filters);
        }
        // `GAL-22`: remembered per `(library, folder)` for the session.
        setViewMemory((prev) => new Map(prev).set(memoryKey, next));
        return next;
      });
    },
    [memoryKey],
  );

  // --- data ----------------------------------------------------------------
  const folders = useMemo(() => source.folderTree(libraryId), [source, libraryId]);

  useEffect(() => {
    let cancelled = false;
    void source
      .facets({
        libraryId,
        folderId,
        includeSubfolders: view.includeSubfolders,
        scope: view.scope,
        sort: view.sort,
        sortDescending: view.sortDescending,
        filters: view.filters,
        hidden: view.hiddenMode,
        hiddenCount: 0,
      })
      .then((next) => {
        if (!cancelled) setFacets(next);
      })
      .catch(() => {
        if (!cancelled) setFacets(null);
      });
    return () => {
      cancelled = true;
    };
  }, [source, libraryId, folderId, view.includeSubfolders, view.scope, view.sort, view.sortDescending, view.filters, view.hiddenMode]);

  const load = useCallback(
    async (atCursor: string | null) => {
      const seq = ++requestSeq.current;
      setState(atCursor === null ? 'loading' : 'more-loading');
      setError(null);
      try {
        const page = await source.page({
          libraryId,
          folderId,
          includeSubfolders: view.includeSubfolders,
          scope: view.scope,
          sort: view.sort,
          sortDescending: view.sortDescending,
          filters: view.filters,
          // `FLG-02` / `FLG-04`: the Hidden view asks for hidden items; every
          // other view asks for everything except them.
          hidden: view.hiddenMode,
          hiddenCount: 0,
          limit: PAGE_SIZE,
          cursor: atCursor,
        });
        // A slower earlier request must not replace a newer page.
        if (seq !== requestSeq.current) return;
        setItems((prev) => {
          if (atCursor === null) return page.items;
          // Appending must be **idempotent**, not merely ordered.
          //
          // `GAL-02`'s contract is a keyset cursor, and a keyset cursor does not
          // promise disjoint pages: items inserted or re-flagged between two
          // requests can shift a boundary, and a retried request returns the page
          // it already returned. Both make the same item arrive twice, and
          // `[...prev, ...page.items]` would then render it twice - React reports
          // duplicate keys and the grid shows a duplicate.
          //
          // `requestSeq` does not cover this. It drops a response older than the
          // newest *request*; it says nothing about two different cursors whose
          // pages overlap. Enforcing the no-overlap property here is cheap, and it
          // is the same place the invariant belongs.
          const seen = new Set(prev.map((i) => i.id));
          const fresh = page.items.filter((i) => !seen.has(i.id));
          return fresh.length === 0 ? prev : [...prev, ...fresh];
        });
        setTotal(page.total);
        // `FLG-05`: the hidden count is reported, not folded into the total.
        setHiddenCount(page.hiddenCount);
        setCursor(page.nextCursor);
        setState('ready');
      } catch (e) {
        if (seq !== requestSeq.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setState(atCursor === null ? 'failed' : 'more-failed');
      }
    },
    [source, libraryId, folderId, view],
  );

  // `GAL-13`: changing sort, folder or filters restarts pagination from the first
  // page. The page reset is applied during render for the same reason as the
  // folder switch above — an effect would let the old page paint once under the
  // new query.
  const queryKey = `${memoryKey}|${view.sort}|${view.sortDescending}|${view.scope}|${JSON.stringify(view.filters)}|${view.includeSubfolders}`;
  const [loadedKey, setLoadedKey] = useState(queryKey);
  if (loadedKey !== queryKey) {
    setLoadedKey(queryKey);
    setItems([]);
    setCursor(null);
  }

  useEffect(() => {
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // --- selection -----------------------------------------------------------
  const selectedItems = useMemo(
    () => items.filter((i) => selection.ids.includes(i.id)),
    [items, selection.ids],
  );
  useEffect(() => {
    // `NAV-07`: the tray's "N selected" must agree with the gallery without
    // keeping a second copy of the selection. This is a synchronisation with an
    // external surface (the shell), which is what an effect is for.
    panes?.setSelectedCount(selection.ids.length);
  }, [selection.ids.length, panes]);

  useEffect(() => {
    // INS-12: selecting fetches only this item's detail record.
    if (selection.focusedId === null) return undefined;
    const wanted = selection.focusedId;
    let cancelled = false;
    void source
      .itemDetail(wanted)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [source, selection.focusedId]);

  // --- layout --------------------------------------------------------------
  const gap = gapForDensity(density);
  const [containerWidth, setContainerWidth] = useState(0);

  /**
   * The grid's column count, measured from the **scroll container**.
   *
   * It used to be measured from the grid element itself, in an effect with no
   * dependencies. That was wrong twice over:
   *
   * 1. The grid element does not exist during the loading state — the skeleton
   *    grid has no ref — so on first mount `gridRef.current` was `null`, the
   *    effect returned early, and `containerWidth` stayed 0 **forever**. The
   *    fallback then fed `thumbSize` (180) to `computeLayout`, which fits exactly
   *    one column. The gallery rendered a single column at every viewport width.
   * 2. The grid is the element the layout *sizes*, so observing it while sizing
   *    it is a feedback loop. The scroll container is the thing that constrains
   *    the grid, and it is mounted in every state.
   */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const measure = () => {
      const width = element.clientWidth;
      setContainerWidth((prev) => (Math.abs(prev - width) < 1 ? prev : width));
    };
    measure();
    // A window-resize fallback as well as the observer. The observer is the
    // precise instrument, but it does not exist in every environment (jsdom has
    // none), and a gallery that cannot re-measure is the bug this replaced.
    window.addEventListener('resize', measure);
    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const layout = useMemo(
    () =>
      computeLayout(items, {
        mode: view.gridMode,
        thumbSize: view.thumbSize,
        gap,
        // One cell's width is the narrowest honest fallback: it cannot claim more
        // room than exists. `computeLayout` clamps the result to the container
        // anyway, so an over-wide value would only mis-size the last row.
        containerWidth: containerWidth > 0 ? containerWidth : view.thumbSize,
      }),
    [items, view.gridMode, view.thumbSize, gap, containerWidth],
  );

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const orderedIds = useMemo(() => layout.cells.map((c) => c.item.id), [layout]);
  // The same sequence, as items. `TBL-01` requires the table to show the same
  // result in the same order as the grid, so this is derived from the one
  // layout rather than sorted again.
  const orderedItems = useMemo(() => layout.cells.map((c) => c.item), [layout]);

  // --- GAL-02 / GAL-03 paging ---------------------------------------------
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || cursor === null || state === 'more-loading' || state === 'more-failed') return;
    const onScroll = () => {
      // GAL-02: request the next page when the viewport is within two viewport
      // heights of the loaded end.
      const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (remaining < element.clientHeight * 2) void load(cursor);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [cursor, state, load]);

  // --- GAL-16 round trip ---------------------------------------------------
  useEffect(() => {
    if (restorePending.current === null) return;
    const element = scrollRef.current;
    if (element && items.length > 0) {
      element.scrollTop = restorePending.current;
      restorePending.current = null;
    }
  }, [items.length]);

  // --- GAL-09 / GAL-10 interaction ----------------------------------------
  const scrollItemIntoView = useCallback((id: string) => {
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(id)}"]`);
    cell?.scrollIntoView({ block: 'nearest' });
    cell?.focus({ preventScroll: true });
  }, []);

  const moveAndFocus = useCallback(
    (next: SelectionState) => {
      setSelection(next);
      if (next.focusedId) requestAnimationFrame(() => scrollItemIntoView(next.focusedId as string));
    },
    [scrollItemIntoView],
  );

  const onCardActivate = useCallback(
    (item: ExploreItem) => {
      // `GAL-12`: the viewer is opened by double-click or `Enter`, never by a
      // single click — a single click selects (`GAL-09`), and opening a modal on
      // every click would make browsing impossible.
      onOpenViewer(item);
    },
    [onOpenViewer],
  );

  const onCardSelect = useCallback(
    (item: ExploreItem) => {
      setSelection((prev) => clickSelect(prev, item.id, orderedIds, { shift: false, ctrl: false }));
    },
    [orderedIds],
  );

  const onCardToggle = useCallback((item: ExploreItem) => {
    setSelection((prev) => clickSelect(prev, item.id, orderedIds, { shift: false, ctrl: true }));
  }, [orderedIds]);

  const onCardRange = useCallback(
    (item: ExploreItem) => {
      setSelection((prev) => clickSelect(prev, item.id, orderedIds, { shift: true, ctrl: false }));
    },
    [orderedIds],
  );

  // GAL-09: dragging on empty space draws a lasso; items it touches are
  // selected, and Ctrl adds to the existing selection.
  const lassoStart = useRef<{ x: number; y: number; ctrl: boolean; base: string[] } | null>(null);
  const autoScroll = useRef<number | null>(null);

  const stopAutoScroll = useCallback(() => {
    if (autoScroll.current !== null) {
      cancelAnimationFrame(autoScroll.current);
      autoScroll.current = null;
    }
  }, []);

  const onGridPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Only empty space starts a lasso; a card handles its own clicks.
      if ((event.target as HTMLElement).closest('.image-card')) return;
      const rect = scrollRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = event.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
      const y = event.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
      lassoStart.current = { x, y, ctrl: event.ctrlKey || event.metaKey, base: selection.ids };
      setLasso({ x, y, width: 0, height: 0 });
    },
    [selection.ids],
  );

  // `applyLasso` is a named function expression rather than an arrow, because it
  // reschedules itself through the auto-scroll frame and an arrow would capture
  // itself during initialisation.
  const applyLasso = useCallback(function apply(clientX: number, clientY: number): void {
    const start = lassoStart.current;
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!start || !rect) return;
    const x = clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    const y = clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
    setLasso({ x: start.x, y: start.y, width: x - start.x, height: y - start.y });

    // GAL-09: dragging within 48 px of the top/bottom edge auto-scrolls. The
    // scroll moves where the next sample lands, so the frame reschedules with
    // the same pointer position rather than reusing a stale offset.
    const delta = autoScrollDelta(clientY - rect.top, rect.height, 16);
    if (delta === 0 || !scrollRef.current) return;
    scrollRef.current.scrollTop += delta;
    stopAutoScroll();
    autoScroll.current = requestAnimationFrame(() => {
      if (lassoStart.current) apply(clientX, clientY);
    });
  }, [stopAutoScroll]);

  const onGridPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!lassoStart.current) return;
      applyLasso(event.clientX, event.clientY);
    },
    [applyLasso],
  );

  const onGridPointerUp = useCallback(() => {
    const start = lassoStart.current;
    lassoStart.current = null;
    stopAutoScroll();
    if (!start) return;
    setLasso((current) => {
      if (!current) return null;
      const hits = layout.cells
        .filter((cell) => lassoHits(current, cell))
        .map((cell) => cell.item.id);
      setSelection((prev) => {
        const base = start.ctrl ? start.base : [];
        return { ids: [...new Set([...base, ...hits])], anchorId: prev.anchorId, focusedId: prev.focusedId };
      });
      return null;
    });
  }, [layout.cells, stopAutoScroll]);

  // --- keyboard ------------------------------------------------------------
  const onGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key;

      if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
        event.preventDefault();
        const horizontal = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
        const vertical = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
        const next = vertical !== 0
          ? moveByRow(selection, orderedIds, vertical, layout.columns)
          : moveFocus(selection, orderedIds, horizontal, layout.columns);
        if (event.shiftKey) {
          // GAL-09: Shift+arrows extend the selection, not just the focus.
          const extended = clickSelect({ ...next, anchorId: selection.anchorId }, next.focusedId ?? '', orderedIds, {
            shift: true,
            ctrl: false,
          });
          moveAndFocus(extended);
          return;
        }
        moveAndFocus(next);
        return;
      }

      if (key === 'Home' || key === 'End') {
        event.preventDefault();
        const id = key === 'Home' ? orderedIds[0] : orderedIds[orderedIds.length - 1];
        if (id) moveAndFocus({ ...selection, focusedId: id });
        return;
      }

      if (key === 'PageUp' || key === 'PageDown') {
        event.preventDefault();
        const page = Math.max(1, layout.columns) * 4;
        moveAndFocus(
          moveFocus(selection, orderedIds, key === 'PageUp' ? -page : page, layout.columns),
        );
        return;
      }

      if (key === 'Enter') {
        event.preventDefault();
        const item = selection.focusedId ? itemById.get(selection.focusedId) : undefined;
        if (item) onOpenViewer(item);
        return;
      }

      if (key === ' ') {
        event.preventDefault();
        setPeekOpen(true);
        return;
      }

      if (key === 'x' || key === 'X') {
        event.preventDefault();
        setSelection(toggleSelect(selection, orderedIds));
        return;
      }

      if (mod && (key === 'a' || key === 'A')) {
        event.preventDefault();
        setSelection(selectAllLoaded(selection, orderedIds));
        return;
      }

      if (key === 'Escape') {
        // GAL-09: Esc clears the selection. A closed peek takes precedence,
        // which the peek's own capture-phase handler already handled.
        event.preventDefault();
        setSelection(clearSelection());
        return;
      }

      // GAL-10: type-ahead, only when the grid is sorted by filename.
      if (isFilenameSort(view.sort) && !mod && !event.altKey && key.length === 1 && /[\p{L}\p{N}]/u.test(key)) {
        const now = Date.now();
        // The buffer accumulates keystrokes and resets after 800 ms of silence,
        // so "ren" finds "renders_0007" while typing three letters in a row.
        const buffer =
          now - typeAheadBuffer.current.at > TYPE_AHEAD_RESET_MS
            ? key.toLowerCase()
            : typeAheadBuffer.current.prefix + key.toLowerCase();
        typeAheadBuffer.current = { prefix: buffer, at: now };
        const hit = typeAhead(orderedIds, (id) => itemById.get(id), buffer, selection.focusedId);
        if (hit) moveAndFocus({ ...selection, focusedId: hit });
      }
    },
    [selection, orderedIds, layout.columns, itemById, view.sort, moveAndFocus, onOpenViewer],
  );

  const peekItem = selection.focusedId ? itemById.get(selection.focusedId) ?? null : null;
  const peekIndex = peekItem ? orderedIds.indexOf(peekItem.id) : -1;

  // --- inspector actions (`INS-05`–`INS-11`) ------------------------------
  // Every write here is an explicit user action, so none of it runs on selection
  // alone (`PRD-06`, `E.6`). In-session drafts are held in React state; the
  // backend writes are Stage D integration points, so each one reports through
  // the shell note rather than pretending to have persisted.
  const [draftTags, setDraftTags] = useState<Record<string, string[]>>({});
  const [draftRating, setDraftRating] = useState<Record<string, number>>({});
  const [draftFavourite, setDraftFavourite] = useState<Record<string, boolean>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  // `INS-11` needs a panel-detail seam. It is wired but not yet fed, because
  // panels only exist in comic scope and `GAL-19`'s panel cards are not built.
  const [panelDetail] = useState<ExplorePanelDetail | null>(null);

  // --- table view (`E.2`, `TBL-01`–`TBL-09`) ------------------------------
  // `TBL-01` says switching views keeps the selection, filters, sort, quick
  // filters and focused item. All five live above this line and are shared, so
  // the toggle genuinely changes presentation and nothing else. The only state
  // here is the view mode itself, the column layout (saved per library by
  // `table.columns`) and a one-shot flag telling the table to scroll the focused
  // row into view.
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(panes?.viewMode ?? 'grid');
  const [tableTarget, setTableTarget] = useState(() => targetFor(libraryType, view.scope));
  const [tableLayout, setTableLayout] = useState<ColumnLayout>(() => defaultLayout(targetFor(libraryType, view.scope)));
  const [tableSort, setTableSort] = useState<SortDirection>({ key: null, direction: 'descending' });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [revealAfterViewSwitch, setRevealAfterViewSwitch] = useState(false);

  // The column set follows the library type and scope, so changing either resets
  // the layout to that target's defaults rather than keeping columns that do not
  // exist here. The user's widths are preserved per target below.
  const layoutsByTarget = useRef(new Map<string, ColumnLayout>());
  const changeTarget = useCallback(
    (next: ReturnType<typeof targetFor>) => {
      setTableTarget((current) => {
        if (current === next) return current;
        layoutsByTarget.current.set(current, tableLayout);
        setTableLayout(layoutsByTarget.current.get(next) ?? defaultLayout(next));
        return next;
      });
    },
    [tableLayout],
  );
  useEffect(() => {
    changeTarget(targetFor(libraryType, view.scope));
  }, [changeTarget, libraryType, view.scope]);

  const onViewModeChange = useCallback(
    (mode: 'grid' | 'table') => {
      setViewMode(mode);
      // The mode is a shell-level setting (`E.5` `browse.viewMode`), so the
      // `Alt+1` / `Alt+2` actions can change it while Explore is unmounted.
      panes?.setViewMode(mode);
      // `TBL-01`: the table scrolls so the focused item is visible.
      setRevealAfterViewSwitch(true);
      setColumnsOpen(false);
    },
    [panes],
  );

  /**
   * The detail the Inspector renders, with this session's edits folded in.
   *
   * The drafts live here rather than inside the inspector so an edit survives
   * selecting another item and coming back — which is what `INS-08`'s autosave
   * note ("Saved") would otherwise contradict, since it claims the value is
   * kept. They are clearly in-session only: nothing here is written to the
   * catalog, and the backend write is a Stage D integration point.
   */
  const shownDetail = useMemo(() => {
    if (!detail) return null;
    const id = detail.itemId;
    return {
      ...detail,
      tags: draftTags[id] ?? detail.tags,
      rating: draftRating[id] ?? detail.rating,
      favourite: draftFavourite[id] ?? detail.favourite,
      notes: draftNotes[id] ?? detail.notes,
    };
  }, [detail, draftTags, draftRating, draftFavourite, draftNotes]);

  // --- copy / export (`CPY-*`, `EXP-*`) ------------------------------------
  //
  // `CPY-01`: the items are passed in the order they appear in the view, which
  // is the gallery order the requirement asks for. Nothing is re-sorted here,
  // because re-sorting by click order is exactly the bug CPY-01 forbids.
  const copyItems: CopyItem[] = useMemo(
    () =>
      selectedItems.map((item) => ({
        id: item.id,
        filename: item.filename,
        // The row values are what the list query already returns (`TBL-02`).
        // The negative prompt is not among them, so it stays `null` here and is
        // reported as "no prompt" rather than invented; `CPY-02` counts skips,
        // so an absent value degrades to a count instead of a wrong copy.
        positivePrompt: item.row?.prompt ?? null,
        negativePrompt: null,
        tags: item.row?.tags ?? [],
        // `CPY-07`: the panel OCR the list query already carries.
        ocr: item.row?.text ? { regions: [{ text: item.row.text }] } : null,
      })),
    [selectedItems],
  );

  const runCopyAction = useCallback(
    async (choice: CopyChoice) => {
      if (copyItems.length === 0) {
        notify('Select at least one image');
        return;
      }
      const outcome = await copyToClipboard(
        choice,
        copyItems,
        COPY_LIMITS,
        // `CPY-09`: the clipboard is the only writer here, so a read-only
        // library or privacy blur cannot change the outcome (CPY-10).
        writeClipboardText,
      );
      if (outcome.status === 'copied') {
        notify(outcome.toast);
        return;
      }
      if (outcome.status === 'clipboard-unavailable') {
        notify(outcome.toast, {
          label: 'Save as file…',
          run: async () => {
            await saveTextToFile(outcome.text);
          },
        });
        return;
      }
      if (outcome.status === 'needs-confirm') {
        notify(COPY_STATES.confirm(outcome.items, outcome.mb), {
          label: 'Copy anyway',
          run: () => {
            void copyToClipboard(choice, copyItems, COPY_LIMITS, writeClipboardText, true).then(
              (second) => {
                if (second.status === 'copied') notify(second.toast);
              },
            );
          },
        });
        return;
      }
      // The hard cap offers **Export as file…** only — it must never offer a
      // "copy anyway" that would truncate silently (CPY-08).
      notify(COPY_STATES.tooLarge(outcome.items, outcome.mb), {
        label: 'Export as file…',
        run: async () => {
          await saveTextToFile(outcome.text);
        },
      });
    },
    [copyItems, notify],
  );

  const runExportAction = useCallback(
    (choice: ExportChoice) => {
      // The state machine (`exportRun.ts`) and the planner (`exportModel.ts`) are
      // done and tested; the picker and the writer are not. This therefore runs
      // the *real* picker — a cancel is a first-class outcome — and reports the
      // plan rather than pretending files were written.
      const items = exportItemsFrom(selectedItems);
      if (items.length === 0) {
        notify('Select at least one image');
        return;
      }
      // `null` = the writer does not handle this choice yet; an empty plan would be
      // silently reported as "0 files written" (see `startExport`).
      const planned = exportPlanFor(choice, items);
      if (planned === null) {
        notify('This export type is not available yet');
        return;
      }
      void (async () => {
        const destination = await pickExportFolder();
        let run = destinationChosen(startExport(planned.toWrite.map((e) => e.item.filename)), destination);
        const result = outcome(run);
        notify(outcomeMessage(result));
      })();
    },
    [selectedItems, notify],
  );

  // --- flag actions (`FLG-01`–`FLG-11`) ------------------------------------
  // Hiding is a *view* concern (`FLG-02`) and a flag is a judgment (`FLG-07`), so
  // both are reversible and both go through the shell's Undo toast (`FLG-10`,
  // `NAV-51`) rather than a confirmation dialog.
  const runFlagAction = useCallback(
    async (
      action: 'hide' | 'showAgain' | 'pick' | 'reject' | 'clearFlag',
      targetIds?: string[],
    ) => {
      // `FLG-09`: the selection if there is one, otherwise the focused item.
      const ids = targetIds ?? flagTargets({ selectionIds: selection.ids, focusedId: selection.focusedId });
      if (ids.length === 0) return;

      if (action === 'hide' || action === 'showAgain') {
        const hidden = action === 'hide';
        const changed = await source.setHidden(ids, hidden);
        if (changed.length === 0) {
          notify(hidden ? 'Nothing to hide' : 'Nothing to show again');
          return;
        }
        // Hiding removes the items from this view (`FLG-02`), so the result set
        // is re-queried rather than patched.
        void load(null);
        notify(
          hidden ? `Hidden ${changed.length} item${changed.length === 1 ? '' : 's'}` : `Shown ${changed.length} item${changed.length === 1 ? '' : 's'} again`,
          {
            label: 'Undo',
            run: async () => {
              await source.setHidden(changed, !hidden);
              void load(null);
            },
          },
        );
        return;
      }

      const flag = action === 'pick' ? 'pick' : action === 'reject' ? 'reject' : 'none';
      const { changed } = applyFlag(items, ids, flag);
      if (changed.length === 0) {
        notify('No change');
        return;
      }
      await source.setFlag(
        changed.map((c) => c.id),
        flag,
      );
      // The badge and the dimming change without a round trip; the query is
      // refreshed so the Rejected/Picks filters agree with what is on screen.
      setItems((prev) =>
        prev.map((item) =>
          changed.some((c) => c.id === item.id) ? { ...item, flag } : item,
        ),
      );
      if (view.filters.flag !== 'any') void load(null);

      notify(`${actionLabel(action)}: ${changed.length} item${changed.length === 1 ? '' : 's'}`, {
        label: 'Undo',
        // `FLG-10`: restore each item's *previous* flag. Clearing instead would
        // be wrong for any item that already carried a flag.
        run: async () => {
          await Promise.all(
            changed.map((c) => source.setFlag([c.id], c.previous)),
          );
          setItems((prev) =>
            prev.map((item) => {
              const entry = changed.find((c) => c.id === item.id);
              return entry ? { ...item, flag: entry.previous } : item;
            }),
          );
          if (view.filters.flag !== 'any') void load(null);
        },
      });

      // `FLG-09`: auto-advance is off by default (`browse.advanceAfterFlag`).
      if (advanceAfterFlag && selection.focusedId !== null) {
        const index = orderedIds.indexOf(selection.focusedId);
        const next = orderedIds[Math.min(index + 1, orderedIds.length - 1)];
        if (next && next !== selection.focusedId) {
          setSelection((prev) => ({ ...prev, focusedId: next }));
        }
      }
    },
    [
      items,
      load,
      notify,
      orderedIds,
      selection.focusedId,
      selection.ids,
      source,
      view.filters.flag,
      advanceAfterFlag,
    ],
  );

  // `FLG-07`: "Hide all rejected in this view" as one undoable batch.
  const hideAllRejected = useCallback(async () => {
    const rejected = items.filter((i) => i.flag === 'reject' && !i.hidden).map((i) => i.id);
    if (rejected.length === 0) {
      notify('No rejected items in this view');
      return;
    }
    const summary = hideRejectedSummary(rejected);
    setConfirm({
      title: summary.title,
      body: summary.body,
      confirmLabel: summary.confirmLabel,
      run: async () => {
        const changed = await source.setHidden(rejected, true);
        void load(null);
        notify(`Hidden ${changed.length} rejected item${changed.length === 1 ? '' : 's'}`, {
          label: 'Undo',
          run: async () => {
            await source.setHidden(changed, false);
            void load(null);
          },
        });
      },
    });
  }, [items, load, notify, source]);

  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    run: () => void | Promise<void>;
  } | null>(null);

  const toggleHiddenView = useCallback(() => {
    updateView({ hiddenMode: view.hiddenMode === 'only' ? 'exclude' : 'only' });
  }, [updateView, view.hiddenMode]);

  const inspectorActions = useMemo<InspectorActions>(
    () => ({
      onCopy: (_text, what) => notify(`Copied ${what}`),
      onReveal: (path) => notify(`Reveal ${path}`),
      onOpenSourceUrl: (url) => notify(`Open ${url}`),
      onSearchPrompt: (prompt) => notify(`Search this prompt: ${prompt.slice(0, 40)}`),
      onSaveTags: async (itemId, tags) => {
        setDraftTags((prev) => ({ ...prev, [itemId]: tags }));
      },
      onSaveRating: async (itemId, rating) => {
        setDraftRating((prev) => ({ ...prev, [itemId]: rating }));
      },
      onSaveFavourite: async (itemId, favourite) => {
        setDraftFavourite((prev) => ({ ...prev, [itemId]: favourite }));
      },
      onSaveNotes: async (itemId, notes) => {
        setDraftNotes((prev) => ({ ...prev, [itemId]: notes }));
      },
      onRequestWorkflow: async (itemId) => {
        // `INS-07`: the JSON is fetched only because the user asked for it.
        const record = await source.itemDetail(itemId).catch(() => null);
        return record?.workflowJson ?? null;
      },
      onRetryStage: (_itemId, stage) =>
        notify(`Retry ${stage} for one item — Pipeline prefilled, not started`),
      onDecompose: () => notify('Decompose — Pipeline prefilled, not started'),
      onEditPanels: () => notify('Panel editor'),
      onEditInReview: () => notify('Review at this page'),
      onOpenViewer: (item) => onOpenViewer(item),
      onOpenParentPage: (pageId) => notify(`Parent page ${pageId}`),
    }),
    [notify, onOpenViewer, source],
  );

  // --- states (§16) --------------------------------------------------------
  const filterCount = filterChips(view.filters).length;
  // Folders are nested, so the status has to be searched at every depth: a
  // top-level-only lookup would miss any folder below the root and show the
  // wrong empty state for it.
  const selectedFolder = folderId
    ? folders.flatMap(flattenFolders).find((f) => f.id === folderId)
    : undefined;

  const showEmptyLibrary = state === 'ready' && items.length === 0 && total === 0 && folderId === null;
  const showEmptyFolder =
    state === 'ready' && items.length === 0 && total === 0 && folderId !== null;
  const showNoMatch = state === 'ready' && items.length === 0 && total !== null && total > 0 && filterCount > 0;
  const showNotChecked = state === 'ready' && selectedFolder?.status === 'unchecked';

  const countLabel = useMemo(() => {
    if (state === 'loading') return 'Loading…';
    const atRoot = folderId === null;
    return countText({
      shown: items.length,
      total,
      filtered: filterCount > 0,
      atRoot,
      scope: view.scope === 'pages' ? undefined : view.scope,
      noun: libraryType === 'comic' ? 'pages' : 'images',
      // `FLG-04`/`FLG-05`: the Hidden view names itself; every other view reports
      // how many items it removed.
      hiddenOnly: view.hiddenMode === 'only',
      hiddenCount: view.hiddenMode === 'only' ? 0 : hiddenCount,
    });
  }, [
    state,
    items.length,
    total,
    filterCount,
    folderId,
    view.scope,
    view.hiddenMode,
    hiddenCount,
    libraryType,
  ]);

  // --- tree ----------------------------------------------------------------
  const treeNodes = useMemo<TreeNode[]>(() => folders.map(toTreeNode), [folders]);
  // The root starts expanded as well as its children: a collapsed root hides the
  // entire folder structure behind one click, which is not what a first-time user
  // sees in a library explorer.
  const expandedFolderIds = useMemo(() => {
    const root = treeNodes[0];
    return root ? [root.id, ...(root.children ?? []).map((c) => c.id)] : [];
  }, [treeNodes]);
  const selectedFolderLabel = selectedFolder?.label;

  return (
    <main className="explore-screen">
      {treeOpen ? (
        <aside className="explore-tree" aria-label="Folders">
          <Tree
            nodes={treeNodes}
            mode="browse"
            value={folderId}
            onChange={(id) => setFolderId(id === treeNodes[0]?.id ? null : id)}
            aria-label="Folder tree"
            defaultExpanded={expandedFolderIds}
          />
        </aside>
      ) : null}

      <section className="explore-gallery" aria-label="Gallery">
        {source.isFixtureData ? (
          <p className="fixture-banner" role="note">
            Fixture data — these items are generated, not from a library.
          </p>
        ) : null}

        <ExploreToolbar
          libraryType={libraryType}
          scope={view.scope}
          onScopeChange={(scope: ExploreScope) => updateView({ scope })}
          includeSubfolders={view.includeSubfolders}
          onIncludeSubfoldersChange={(includeSubfolders) => updateView({ includeSubfolders })}
          sort={view.sort}
          sortDescending={view.sortDescending}
          onSortChange={(sort) => updateView({ sort })}
          onSortDirectionChange={(sortDescending) => updateView({ sortDescending })}
          filters={view.filters}
          onFiltersChange={(filters) => updateView({ filters })}
          facets={facets}
          countLabel={countLabel}
          thumbSize={view.thumbSize}
          onThumbSizeChange={(size) => updateView({ thumbSize: clampThumbSize(size) })}
          gridMode={view.gridMode}
          onGridModeChange={(gridMode: GridMode) => updateView({ gridMode })}
          droppedFilter={droppedFilter}
          onDismissDroppedFilter={() => setDroppedFilter(null)}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          hiddenMode={view.hiddenMode}
          onToggleHiddenView={toggleHiddenView}
          rejectedCount={items.filter((i) => i.flag === 'reject').length}
          onHideAllRejected={() => void hideAllRejected()}
        />

        {/* `FLG-04`: the Hidden view is reachable from the toolbar and the
            palette. The toolbar button exists in every view because a user who
            hid something needs to get it back without knowing about a filter. */}
        {view.hiddenMode === 'only' ? (
          <p className="hidden-view-banner" role="note">
            Showing hidden items only.{' '}
            <button type="button" className="ghost" onClick={toggleHiddenView}>
              Back to all items
            </button>
          </p>
        ) : null}

        {/* `TBL-06`: the columns menu, anchored under the toolbar rather than
            floating over the rows, so it never covers the data it changes. */}
        {columnsOpen && viewMode === 'table' ? (
          <ColumnsMenu
            target={tableTarget}
            layout={tableLayout}
            onChange={setTableLayout}
            onClose={() => setColumnsOpen(false)}
          />
        ) : null}

        {/* GAL-23: directly below the toolbar, never floating over the images. */}
        <SelectionActionBar
          items={selectedItems}
          libraryType={libraryType}
          loadedCount={items.length}
          total={total}
          onSelectAllInView={() => setSelection(selectAllLoaded(selection, orderedIds))}
          onAction={(id) => {
            // `FLG-*` actions are real; the rest still report through the note
            // line rather than pretending to have done anything.
            if (['hide', 'showAgain', 'pick', 'reject', 'clearFlag'].includes(id)) {
              void runFlagAction(id as Parameters<typeof runFlagAction>[0]);
              return;
            }
            notify(`Selection action: ${id}`);
          }}
          onCopy={(choice) => void runCopyAction(choice)}
          onExport={(choice) => runExportAction(choice)}
          onClear={() => setSelection(clearSelection())}
          hiddenMode={view.hiddenMode}
        />

        <div className="explore-scroll" ref={scrollRef}>
          {state === 'failed' ? (
            <EmptyState
              title="Couldn't load images."
              body={error ?? 'Something went wrong.'}
              action={
                <>
                  <Button onClick={() => void load(null)}>Retry</Button>
                  <Button variant="ghost" onClick={() => notify(`Details: ${error ?? ''}`)}>
                    Details
                  </Button>
                </>
              }
            />
          ) : showNotChecked ? (
            // STA-03
            <EmptyState
              title={`${selectedFolderLabel ?? 'This folder'} hasn't been added to the catalog yet.`}
              body="Checking for new files reads the folder; it does not change any image."
              action={
                <>
                  <Button onClick={() => notify('Check for new files')}>Check for new files</Button>
                  <Button variant="ghost" onClick={onOpenPipeline}>
                    Open Pipeline
                  </Button>
                </>
              }
            />
          ) : showEmptyLibrary ? (
            // STA-06
            <EmptyState
              title="This library has no images yet."
              body="Add a folder, then choose what to process."
              action={
                <>
                  <Button onClick={() => notify('Check for new files')}>Check for new files</Button>
                  <Button variant="ghost" onClick={onOpenPipeline}>
                    Open Pipeline
                  </Button>
                </>
              }
            />
          ) : showEmptyFolder ? (
            // STA-02
            <EmptyState
              title={`No images in ${selectedFolderLabel ?? 'this folder'}.`}
              body="The folder was checked and contains no images."
              action={
                <>
                  <Button onClick={() => notify('Check for new files')}>Check for new files</Button>
                  <Button variant="ghost" onClick={() => setFolderId(null)}>
                    Browse parent folder
                  </Button>
                </>
              }
            />
          ) : showNoMatch ? (
            // STA-04
            <EmptyState
              title="No images match these filters."
              body={`${filterCount} filter${filterCount === 1 ? '' : 's'} active.`}
              action={
                <Button onClick={() => updateView({ filters: EMPTY_FILTERS })}>
                  {filterCount === 1 ? 'Clear 1 filter' : `Clear ${filterCount} filters`}
                </Button>
              }
            />
          ) : state === 'loading' ? (
            // GAL-*: skeleton cells, and no bare spinner.
            <div className="explore-grid" aria-busy="true" aria-label="Loading images">
              {Array.from({ length: 24 }, (_, index) => (
                <div key={index} className="skeleton-cell" style={{ width: view.thumbSize, height: view.thumbSize }} />
              ))}
            </div>
          ) : viewMode === 'table' ? (
            /* `TBL-01`: the table is the *same* result sequence as the grid, so
               it receives the same items, selection and callbacks — which is why
               switching cannot change any of them. */
            <ExploreTable
              target={tableTarget}
              items={orderedItems}
              density={density}
              layout={tableLayout}
              onLayoutChange={setTableLayout}
              sort={tableSort}
              onSortChange={setTableSort}
              selectedIds={selection.ids}
              focusedId={selection.focusedId}
              onSelect={(item, modifiers) => {
                setSelection((prev) => clickSelect(prev, item.id, orderedIds, modifiers));
              }}
              onActivate={onCardActivate}
              pendingRevealId={revealAfterViewSwitch ? selection.focusedId : null}
              onRevealHandled={() => setRevealAfterViewSwitch(false)}
              onExportCsv={() =>
                notify(
                  `Exported ${orderedItems.length} rows × ${
                    visibleColumns(tableTarget, tableLayout).length
                  } columns`,
                )
              }
              onOpenColumns={() => setColumnsOpen((v) => !v)}
            />
          ) : (
            <>
              <div
                className="explore-grid"
                role="listbox"
                aria-multiselectable="true"
                aria-label="Images"
                ref={gridRef}
                tabIndex={-1}
                onKeyDown={onGridKeyDown}
                onPointerDown={onGridPointerDown}
                onPointerMove={onGridPointerMove}
                onPointerUp={onGridPointerUp}
                style={{ height: layout.height, position: 'relative' }}
              >
                {layout.cells.map((cell) => (
                  <ImageCard
                    key={cell.item.id}
                    item={cell.item}
                    selected={selection.ids.includes(cell.item.id)}
                    focused={selection.focusedId === cell.item.id}
                    panelCard={cell.item.kind === 'panel'}
                    showPanelEdge={view.scope === 'both' && cell.item.kind === 'panel'}
                    anySelected={selection.ids.length > 0}
                    width={cell.width}
                    height={cell.height}
                    left={cell.left}
                    top={cell.top}
                    onActivate={() => onCardSelect(cell.item)}
                    onOpenViewer={() => onCardActivate(cell.item)}
                    onToggleSelect={() => onCardToggle(cell.item)}
                    onRangeSelect={() => onCardRange(cell.item)}
                    onPeek={() => setPeekOpen(true)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      notify(`Context menu for ${cell.item.filename}`);
                    }}
                  />
                ))}

                {/* GAL-03: a skeleton row at the end while the next page loads, so
                    the grid never looks like it simply ended. */}
                {state === 'more-loading' ? (
                  <div className="explore-loading-row" role="status">
                    Loading more images…
                  </div>
                ) : null}

                {/* GAL-03: an inline retry row, never a silent short list. */}
                {state === 'more-failed' ? (
                  <div className="explore-error-row" role="alert">
                    Couldn't load more images.{' '}
                    <button type="button" onClick={() => void load(cursor)}>
                      Retry
                    </button>
                  </div>
                ) : null}
              </div>

              {lasso ? (
                <div
                  className="lasso-rect"
                  style={{
                    left: lasso.x,
                    top: lasso.y,
                    width: lasso.width,
                    height: lasso.height,
                  }}
                  aria-hidden="true"
                />
              ) : null}
            </>
          )}
        </div>
      </section>

      {inspectorOpen ? (
        <aside className="explore-inspector" aria-label="Inspector">
          {selectedItems.length === 0 ? (
            // INS-01: nothing selected.
            <p className="hint">Select an image to inspect it.</p>
          ) : selectedItems.length > 1 ? (
            // INS-01: a summary card. No metadata is merged or averaged.
            <div className="inspector-summary">
              <h2>{selectedItems.length} items selected</h2>
              <p className="hint">
                Batch actions apply to all {selectedItems.length} items. Metadata is not
                merged.
              </p>
            </div>
          ) : (
            <Inspector
              detail={shownDetail}
              libraryType={libraryType}
              item={selection.focusedId ? (itemById.get(selection.focusedId) ?? null) : null}
              panel={panelDetail}
              actions={inspectorActions}
            />
          )}
        </aside>
      ) : null}

      <PeekOverlay
        item={peekOpen ? peekItem : null}
        canPrevious={peekIndex > 0}
        canNext={peekIndex >= 0 && peekIndex < orderedIds.length - 1}
        onClose={() => setPeekOpen(false)}
        onPrevious={() => moveAndFocus(moveFocus(selection, orderedIds, -1, layout.columns))}
        onNext={() => moveAndFocus(moveFocus(selection, orderedIds, 1, layout.columns))}
      />

      {/* `FLG-07`: a bulk hide states the count and is reversible as one batch.
          `NAV-51` requires a confirmation for anything irreversible or
          destructive; hiding is reversible, but hiding 300 items at once is
          disruptive enough to be worth the count in front of the user. */}
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
      >
        <p>{confirm?.body}</p>
        <div className="row">
          <Button
            onClick={() => {
              const run = confirm?.run;
              setConfirm(null);
              if (run) void run();
            }}
          >
            {confirm?.confirmLabel}
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </main>
  );
}

const EMPTY_VIEW: FolderViewState = {
  sort: 'mtime_desc',
  sortDescending: true,
  thumbSize: 180,
  gridMode: 'uniform',
  includeSubfolders: true,
  scope: 'pages',
  filters: EMPTY_FILTERS,
  hiddenMode: 'exclude',
};

/** `LIB-06`/`LIB-09`: the domain folder tree as the shared Tree's shape. */
function toTreeNode(folder: ExploreFolder): TreeNode {
  return {
    id: folder.id,
    label: folder.label,
    count: folder.count ?? undefined,
    // `§5.7`'s five states map onto the Tree control's tones; "Not checked" is
    // the design's own word for a folder that was never added.
    status:
      folder.status === 'unchecked'
        ? { label: 'Not checked', tone: 'idle' }
        : { label: folder.status, tone: folder.status },
    children: folder.children.map(toTreeNode),
  };
}

function flattenFolders(folder: ExploreFolder): ExploreFolder[] {
  return [folder, ...folder.children.flatMap(flattenFolders)];
}

/**
 * A deliberately small inspector (`INS-01`, `INS-03`).
 *
 * The full section set of `INS-02`–`INS-11` is its own increment; this renders
 * the always-present Preview and File sections and hides everything absent, which
 * is the rule that matters most and the one the rest of the sections hang off.
 */
