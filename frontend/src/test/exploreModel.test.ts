// covers: GAL-04, GAL-07, GAL-09, GAL-10, GAL-11, GAL-12, GAL-13, GAL-22, STA-02, STA-03, STA-04, STA-05, STA-06
/**
 * Explore's pure logic (design §7.1).
 *
 * The rules here are the ones a screenshot cannot prove and a bug report would
 * otherwise have to describe: the exact count text `GAL-04` specifies, natural
 * filename ordering, the three click rules of `GAL-09`, justified-row layout
 * that must not distort the last row, and which selection actions apply to which
 * selection.
 */
import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  autoScrollDelta,
  badgesFor,
  badgeOverflow,
  clearAllLabel,
  clampThumbSize,
  clickSelect,
  compareItems,
  computeLayout,
  countText,
  defaultSort,
  EMPTY_SELECTION,
  filterChips,
  gapForDensity,
  inFolder,
  isFilenameSort,
  lassoHits,
  middleTruncate,
  moveByRow,
  moveFocus,
  naturalCompare,
  objectPositionFor,
  removeChip,
  selectAllInViewLabel,
  selectAllLoaded,
  selectionActions,
  sortOptions,
  toggleFacetValue,
  toggleSelect,
  typeAhead,
  viewStateFor,
  THUMB_MAX,
  THUMB_MIN,
} from '../features/explore/exploreModel';
import { EMPTY_FILTERS, type ExploreItem } from '../features/explore/exploreTypes';

function item(id: string, over: Partial<ExploreItem> = {}): ExploreItem {
  return {
    id,
    kind: 'page',
    filename: `${id}.png`,
    displayPath: `D:\\lib\\${id}.png`,
    folderIds: ['lib-root'],
    width: 1024,
    height: 1024,
    fileSizeBytes: 1000,
    modifiedAt: '2026-09-30T00:00:00.000Z',
    generatedAt: null,
    dominantColor: '#3a4a63',
    thumbnailUrl: null,
    previewUrl: null,
    badges: [],
    panelCount: null,
    panelIndex: null,
    parentPageId: null,
    parentSeriesLabel: null,
    missing: false,
    flag: 'none',
    hidden: false,
    importBatchId: null,
    importBatchKind: null,
    cataloguedAt: '2026-09-30T00:00:00.000Z',
    ...over,
  };
}

describe('GAL-04 — count text', () => {
  it('says "412 images" for an unfiltered folder', () => {
    expect(countText({ shown: 412, total: 412, filtered: false, atRoot: false })).toBe('412 images');
  });

  it('says "37 of 412" when filtered', () => {
    expect(countText({ shown: 37, total: 412, filtered: true, atRoot: false })).toBe('37 of 412');
  });

  it('says "12,043 images" at the library root', () => {
    expect(countText({ shown: 12_043, total: 12_043, filtered: false, atRoot: true })).toBe(
      '12,043 images',
    );
  });

  it('reports both sides in Both scope', () => {
    expect(
      countText({ shown: 148, total: 148, filtered: false, atRoot: false, scope: 'both', pages: 30, panels: 118 }),
    ).toBe('30 pages · 118 panels');
  });

  it('falls back to "1,000+" when the count is not yet known', () => {
    // The exact number replaces it when it arrives; the shape must be right
    // first, and the floor is 1,000 so a placeholder never claims a folder holds
    // fewer items than one page.
    expect(countText({ shown: 200, total: null, filtered: false, atRoot: true })).toBe('1,000+ images');
  });

  it('caps the unknown count at 10,000', () => {
    expect(countText({ shown: 999_999, total: null, filtered: false, atRoot: true })).toBe('10,000+ images');
  });

  it('uses the library noun', () => {
    expect(countText({ shown: 30, total: 30, filtered: false, atRoot: true, noun: 'pages' })).toBe(
      '30 pages',
    );
  });
});

describe('GAL-13 — sorting', () => {
  it('offers ComfyUI sorts, adding Generated date only when present', () => {
    const without = sortOptions('comfyui', false).map((o) => o.value);
    const with_ = sortOptions('comfyui', true).map((o) => o.value);
    expect(without).not.toContain('generated_desc');
    expect(with_).toContain('generated_desc');
    // Newest first is the documented ComfyUI default.
    expect(without[0]).toBe('mtime_desc');
  });

  it('offers comic sorts with Page order first', () => {
    const comic = sortOptions('comic', false).map((o) => o.value);
    expect(comic[0]).toBe('page_order');
    expect(comic).not.toContain('size_desc');
  });

  it('defaults per library type', () => {
    expect(defaultSort('comic')).toBe('page_order');
    expect(defaultSort('comfyui')).toBe('mtime_desc');
  });

  it('orders filenames naturally, so page2 precedes page10', () => {
    expect(naturalCompare('page2.png', 'page10.png')).toBeLessThan(0);
  });

  it('sorts items without a generation date last rather than as oldest', () => {
    const withDate = item('a', { generatedAt: '2026-01-01T00:00:00.000Z' });
    const without = item('b');
    // A missing date must not be read as the epoch, which would float an
    // un-generated item to the top of a "newest first" list.
    expect(compareItems(without, withDate, 'generated_desc')).toBeGreaterThan(0);
    expect(compareItems(withDate, without, 'generated_desc')).toBeLessThan(0);
    expect(compareItems(without, item('c'), 'generated_desc')).toBe(0);
  });
});

describe('GAL-05 / GAL-06 — layout', () => {
  const square = (id: string, w = 100, h = 100) => item(id, { width: w, height: h });

  it('makes every uniform cell a square of the container share', () => {
    const items = Array.from({ length: 6 }, (_, i) => square(`i${i}`));
    const layout = computeLayout(items, { mode: 'uniform', thumbSize: 100, gap: 8, containerWidth: 424 });
    expect(layout.columns).toBe(4);
    for (const cell of layout.cells) expect(cell.width).toBeCloseTo(cell.height);
  });

  it('never exceeds the container width', () => {
    const items = Array.from({ length: 40 }, (_, i) => square(`i${i}`));
    const layout = computeLayout(items, { mode: 'uniform', thumbSize: 180, gap: 8, containerWidth: 800 });
    const rightmost = Math.max(...layout.cells.map((c) => c.left + c.width));
    expect(rightmost).toBeLessThanOrEqual(800);
  });

  it('scales a justified row to fill the container', () => {
    const items = Array.from({ length: 8 }, (_, i) => square(`i${i}`));
    const layout = computeLayout(items, { mode: 'rows', thumbSize: 100, gap: 8, containerWidth: 500 });
    const firstRow = layout.cells.filter((c) => c.top === 0);
    const rightmost = Math.max(...firstRow.map((c) => c.left + c.width));
    expect(rightmost).toBeCloseTo(500, 0);
  });

  it('does not stretch the last row, which would distort its cells', () => {
    // Two tall cells cannot fill a wide container; stretching them would change
    // their aspect ratio (GAL-17).
    const items = [square('a', 100, 200), square('b', 100, 200)];
    const layout = computeLayout(items, { mode: 'rows', thumbSize: 100, gap: 8, containerWidth: 900 });
    for (const cell of layout.cells) {
      expect(cell.width / cell.height).toBeCloseTo(0.5);
    }
  });

  it('keeps the stored aspect ratio of a cell', () => {
    const items = [square('a', 400, 100), square('b', 400, 100), square('c', 400, 100), square('d', 400, 100), square('e', 400, 100)];
    const layout = computeLayout(items, { mode: 'rows', thumbSize: 100, gap: 8, containerWidth: 840 });
    for (const cell of layout.cells) {
      expect(cell.width / cell.height).toBeCloseTo(4);
    }
  });

  it('positions cells down the page in reading order', () => {
    const items = Array.from({ length: 9 }, (_, i) => square(`i${i}`));
    const layout = computeLayout(items, { mode: 'uniform', thumbSize: 100, gap: 8, containerWidth: 324 });
    expect(layout.cells[0].row).toBe(0);
    expect(layout.cells[3].row).toBe(1);
    expect(layout.cells[3].column).toBe(0);
  });

  it('uses top alignment for images taller than 1:2.5, centre otherwise', () => {
    expect(objectPositionFor(512, 1408)).toBe('top'); // ratio 2.75
    expect(objectPositionFor(1024, 1024)).toBe('center');
    expect(objectPositionFor(null, null)).toBe('center');
  });

  it('uses the density gap', () => {
    expect(gapForDensity('compact')).toBe(4);
    expect(gapForDensity('comfortable')).toBe(8);
    expect(gapForDensity('spacious')).toBe(12);
  });
});

describe('GAL-09 — selection', () => {
  const ordered = ['a', 'b', 'c', 'd', 'e'];

  it('click selects exactly one', () => {
    const state = clickSelect({ ids: ['a', 'b'], anchorId: 'a', focusedId: 'b' }, 'd', ordered, {
      shift: false,
      ctrl: false,
    });
    expect(state.ids).toEqual(['d']);
    expect(state.anchorId).toBe('d');
  });

  it('ctrl+click toggles without clearing the rest', () => {
    let state = clickSelect(EMPTY_SELECTION, 'a', ordered, { shift: false, ctrl: true });
    state = clickSelect(state, 'c', ordered, { shift: false, ctrl: true });
    expect(state.ids).toEqual(['a', 'c']);
    state = clickSelect(state, 'a', ordered, { shift: false, ctrl: true });
    expect(state.ids).toEqual(['c']);
  });

  it('shift+click selects a range from the anchor', () => {
    const anchored = { ids: ['b'], anchorId: 'b', focusedId: 'b' };
    expect(clickSelect(anchored, 'd', ordered, { shift: true, ctrl: false }).ids).toEqual(['b', 'c', 'd']);
  });

  it('shift+click backwards selects the same range', () => {
    const anchored = { ids: ['d'], anchorId: 'd', focusedId: 'd' };
    expect(clickSelect(anchored, 'b', ordered, { shift: true, ctrl: false }).ids).toEqual(['b', 'c', 'd']);
  });

  it('ctrl+shift+click extends without dropping the earlier selection', () => {
    const state = { ids: ['a', 'e'], anchorId: 'b', focusedId: 'b' };
    expect(clickSelect(state, 'd', ordered, { shift: true, ctrl: true }).ids).toEqual(['a', 'e', 'b', 'c', 'd']);
  });

  it('X toggles the focused item', () => {
    const focused = { ids: ['b'], anchorId: 'b', focusedId: 'b' };
    expect(toggleSelect(focused, ordered).ids).toEqual([]);
    expect(toggleSelect({ ids: [], anchorId: 'b', focusedId: 'b' }, ordered).ids).toEqual(['b']);
  });

  it('ctrl+A selects all loaded, keeping what was already selected', () => {
    const state = { ids: ['z'], anchorId: 'z', focusedId: 'z' };
    expect(selectAllLoaded(state, ordered).ids).toEqual(['z', 'a', 'b', 'c', 'd', 'e']);
  });

  it('clamps movement at both ends rather than wrapping', () => {
    const atStart = { ids: [], anchorId: 'a', focusedId: 'a' };
    expect(moveFocus(atStart, ordered, -1, 5).focusedId).toBe('a');
    const atEnd = { ids: [], anchorId: 'e', focusedId: 'e' };
    expect(moveFocus(atEnd, ordered, 1, 5).focusedId).toBe('e');
  });

  it('moves a whole row up and down', () => {
    const start = { ids: [], anchorId: 'b', focusedId: 'b' };
    // 3 columns, so a row down from index 1 is index 4.
    expect(moveByRow(start, ordered, 1, 3).focusedId).toBe('e');
  });
});

describe('GAL-10 — type-ahead', () => {
  const items = ['alpha', 'beta', 'gamma'].map((n) => item(n, { filename: `${n}.png` }));
  const ordered = items.map((i) => i.id);
  const byId = new Map(items.map((i) => [i.id, i]));

  it('jumps to the first item starting with the typed prefix', () => {
    expect(typeAhead(ordered, (id) => byId.get(id), 'be', null)).toBe('beta');
  });

  it('is case insensitive', () => {
    expect(typeAhead(ordered, (id) => byId.get(id), 'GA', null)).toBe('gamma');
  });

  it('wraps past the focused item so repeated letters advance', () => {
    expect(typeAhead(ordered, (id) => byId.get(id), 'a', 'alpha')).toBe('alpha');
  });

  it('only applies to a filename sort', () => {
    expect(isFilenameSort('filename_asc')).toBe(true);
    expect(isFilenameSort('mtime_desc')).toBe(false);
  });
});

describe('GAL-09 — lasso', () => {
  it('selects a cell the rectangle touches', () => {
    expect(lassoHits({ x: 0, y: 0, width: 100, height: 100 }, { left: 50, top: 50, width: 100, height: 100 })).toBe(true);
  });

  it('misses a cell outside it', () => {
    expect(lassoHits({ x: 0, y: 0, width: 10, height: 10 }, { left: 200, top: 200, width: 100, height: 100 })).toBe(false);
  });

  it('handles a drag up and to the left', () => {
    // A negative extent is normalised before testing, so it still selects.
    expect(lassoHits({ x: 100, y: 100, width: -80, height: -80 }, { left: 30, top: 30, width: 40, height: 40 })).toBe(true);
  });

  it('auto-scrolls near the top and bottom edges, and not in the middle', () => {
    expect(autoScrollDelta(10, 600, 16)).toBeLessThan(0);
    expect(autoScrollDelta(590, 600, 16)).toBeGreaterThan(0);
    expect(autoScrollDelta(300, 600, 16)).toBe(0);
  });

  it('auto-scrolls faster the deeper into the edge, up to the budget', () => {
    // The design caps it at 1,200 px/s; a 16 ms frame at full depth is ~19 px.
    expect(autoScrollDelta(0, 600, 16)).toBeCloseTo(-(1200 * 0.016), 3);
  });
});

describe('GAL-14 — filters and chips', () => {
  it('describes every active filter as a removable chip', () => {
    const chips = filterChips({
      ...EMPTY_FILTERS,
      model: ['sdxl'],
      minWidth: 1024,
      favourite: true,
      ratingAtLeast: 4,
    });
    expect(chips.map((c) => c.label)).toEqual([
      'Model: sdxl',
      'Dimensions: ≥ 1024 × any',
      'Favourite',
      'Rating ≥ 4',
    ]);
  });

  it('reports the count STA-04 needs', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, favourite: true })).toBe(1);
    expect(clearAllLabel(1)).toBe('Clear 1 filter');
    expect(clearAllLabel(3)).toBe('Clear 3 filters');
  });

  it('removes one facet value without disturbing the others', () => {
    const next = removeChip({ ...EMPTY_FILTERS, model: ['a', 'b'], favourite: true }, 'model:b');
    expect(next.model).toEqual(['a']);
    expect(next.favourite).toBe(true);
  });

  it('removes a scalar filter with no value', () => {
    expect(removeChip({ ...EMPTY_FILTERS, minWidth: 1024 }, 'dimensions').minWidth).toBeNull();
    expect(removeChip({ ...EMPTY_FILTERS, ratingAtLeast: 3 }, 'rating').ratingAtLeast).toBe(0);
  });

  it('toggles a facet value on and off', () => {
    const on = toggleFacetValue(EMPTY_FILTERS, 'model', 'sdxl');
    expect(on.model).toEqual(['sdxl']);
    expect(toggleFacetValue(on, 'model', 'sdxl').model).toEqual([]);
  });

  it('finds items in the chosen folder, and descendants only with Subfolders on', () => {
    const deep = item('deep', { folderIds: ['root', 'a', 'b'] });
    expect(inFolder(deep, 'a', false)).toBe(false);
    expect(inFolder(deep, 'a', true)).toBe(true);
    // The library root shows everything.
    expect(inFolder(deep, null, false)).toBe(true);
  });
});

describe('GAL-07 — badges', () => {
  it('shows at most three and reports the overflow', () => {
    const many = ['favourite', 'decomposed', 'needsReview', 'stale', 'failed'] as const;
    const list = badgesFor([...many]);
    expect(list).toHaveLength(3);
    expect(badgeOverflow([...many])).toBe(2);
  });

  it('puts the panel badge first for a panel card', () => {
    const list = badgesFor(['favourite'], true);
    expect(list[0].key).toBe('panel');
    expect(badgeOverflow(['favourite', 'stale'], true)).toBe(0);
  });

  it('gives every badge an accessible name, so colour is never the only signal', () => {
    for (const badge of badgesFor(['favourite', 'failed', 'missing'])) {
      expect(badge.label.length).toBeGreaterThan(0);
    }
  });
});

describe('GAL-07 — the hover bar filename', () => {
  it('leaves a short name alone', () => {
    expect(middleTruncate('a.png', 10)).toBe('a.png');
  });

  it('keeps the tail, which is what identifies a file', () => {
    const out = middleTruncate('a-very-long-generated-name-0007.png', 12);
    expect(out).toHaveLength(12);
    expect(out).toContain('…');
    expect(out.endsWith('.png')).toBe(true);
  });
});

describe('GAL-23 — the selection action bar', () => {
  it('enables Compare for 2 to 4 compatible items', () => {
    const for2 = selectionActions({ count: 2, libraryType: 'comfyui', mixedKinds: false });
    expect(for2.find((a) => a.id === 'compare')?.enabled).toBe(true);
  });

  it('gives the reason Compare is unavailable rather than hiding it', () => {
    expect(selectionActions({ count: 1, libraryType: 'comfyui', mixedKinds: false }).find((a) => a.id === 'compare')?.reason)
      .toBe('Select at least 2 images');
    expect(selectionActions({ count: 5, libraryType: 'comfyui', mixedKinds: false }).find((a) => a.id === 'compare')?.reason)
      .toBe('Select 2–4 images');
    expect(selectionActions({ count: 2, libraryType: 'comfyui', mixedKinds: true }).find((a) => a.id === 'compare')?.reason)
      .toBe('Compare needs items of the same kind');
  });

  it('restricts comic-only and ComfyUI-only actions by library type', () => {
    const comic = selectionActions({ count: 1, libraryType: 'comic', mixedKinds: false });
    expect(comic.find((a) => a.id === 'runOcr')?.enabled).toBe(true);
    expect(comic.find((a) => a.id === 'exportPanels')?.enabled).toBe(true);
    expect(comic.find((a) => a.id === 'copyPrompts')?.reason).toBe('ComfyUI libraries only');

    const comfy = selectionActions({ count: 1, libraryType: 'comfyui', mixedKinds: false });
    expect(comfy.find((a) => a.id === 'copyPrompts')?.enabled).toBe(true);
    expect(comfy.find((a) => a.id === 'runOcr')?.reason).toBe('Comic libraries only');
  });

  it('offers "Select all N in this view" only when more items exist', () => {
    expect(selectAllInViewLabel(200, 412)).toBe('Select all 412 in this view');
    expect(selectAllInViewLabel(412, 412)).toBeNull();
    expect(selectAllInViewLabel(200, null)).toBeNull();
  });
});

describe('GAL-22 — per-folder view memory', () => {
  it('starts a folder with the defaults for its library type', () => {
    expect(viewStateFor(undefined, 'comfyui').sort).toBe('mtime_desc');
    expect(viewStateFor(undefined, 'comic').sort).toBe('page_order');
  });

  it('restores a saved view for the folder', () => {
    const saved = viewStateFor(
      {
        sort: 'filename_asc',
        sortDescending: false,
        thumbSize: 240,
        gridMode: 'rows',
        includeSubfolders: false,
        scope: 'pages',
        filters: EMPTY_FILTERS,
        hiddenMode: 'exclude',
      },
      'comfyui',
    );
    expect(saved.sort).toBe('filename_asc');
    expect(saved.gridMode).toBe('rows');
    expect(saved.thumbSize).toBe(240);
  });

  it('clamps and snaps a restored thumbnail size that is out of range or off step', () => {
    const base = viewStateFor(undefined, 'comfyui');
    expect(clampThumbSize(9999)).toBe(THUMB_MAX);
    expect(clampThumbSize(1)).toBe(THUMB_MIN);
    expect(clampThumbSize(181)).toBe(180);
    expect(viewStateFor({ ...base, thumbSize: 9999 }, 'comfyui').thumbSize).toBe(THUMB_MAX);
  });
});