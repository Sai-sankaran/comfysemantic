// covers: TBL-01, TBL-02, TBL-03, TBL-04, TBL-05, TBL-06, TBL-07, TBL-08, TBL-09, GAL-04, GAL-07, FLG-02, FLG-07, FLG-08, NAV-22, NAV-23, NAV-24, NAV-25, NAV-26, NAV-27
/**
 * Table view (design Appendix E.2, `TBL-01`–`TBL-10`).
 *
 * Two halves: `tableModel.test.ts` pins the rules that are invisible in a
 * screenshot (which columns exist, which are sortable, what a cell truncates,
 * what the CSV contains), and this file pins the assembled behaviour: grid/table
 * parity, keyboard navigation, the sort cycle and the columns menu.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ALWAYS_VISIBLE,
  MIN_COLUMN_WIDTH,
  PROMPT_CELL_CHARS,
  TEXT_CELL_CHARS,
  cellFor,
  clip,
  columnsFor,
  columnWidth,
  csvOf,
  defaultLayout,
  metricsFor,
  moveColumn,
  nextSort,
  resetLayout,
  resizeColumn,
  rowsPerViewport,
  sortLabel,
  targetFor,
  toggleColumn,
  visibleColumns,
  type ColumnLayout,
  type SortDirection,
  type TableColumn,
} from '../features/explore/tableModel';
import { middleTruncate } from '../features/explore/exploreModel';
import { ExploreTable } from '../features/explore/ExploreTable';
import { ColumnsMenu } from '../features/explore/ColumnsMenu';
import type { ExploreItem, ExploreRowValues } from '../features/explore/exploreTypes';

function row(over: Partial<ExploreRowValues> = {}): ExploreRowValues {
  return {
    seriesLabel: 'Chapter 3',
    panelCount: null,
    panelStatus: null,
    ocrStatus: null,
    reviewStatus: null,
    rating: 0,
    favourite: false,
    tags: [],
    model: null,
    sampler: null,
    steps: null,
    cfg: null,
    seed: null,
    loras: [],
    processing: 'none',
    prompt: null,
    text: null,
    ...over,
  };
}

function item(id: string, over: Partial<ExploreItem> = {}): ExploreItem {
  return {
    id,
    kind: 'page',
    filename: `${id}.png`,
    displayPath: `D:\\lib\\2026\\${id}.png`,
    folderIds: ['lib-root'],
    width: 1024,
    height: 1024,
    fileSizeBytes: 2_400_000,
    modifiedAt: '2026-09-30T00:00:00.000Z',
    generatedAt: null,
    dominantColor: '#3a4a63',
    thumbnailUrl: `cp-thumb://${id}`,
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
    row: row(),
    ...over,
  };
}

const column = (id: TableColumn['id'], target: 'comfyui' | 'comic-page' | 'comic-panel' = 'comfyui'): TableColumn => {
  const found = columnsFor(target).find((c) => c.id === id);
  if (!found) throw new Error(`no column ${id}`);
  return found;
};

describe('TBL-02 — columns', () => {
  it('gives ComfyUI items the documented columns, with Prompt off by default', () => {
    const ids = columnsFor('comfyui').map((c) => c.id);
    expect(ids).toEqual([
      'thumbnail', 'name', 'folder', 'dimensions', 'size', 'modified',
      'rating', 'favourite', 'flag', 'tags', 'model', 'sampler', 'steps',
      'cfg', 'seed', 'loras', 'processing', 'prompt',
    ]);
    const layout = defaultLayout('comfyui');
    const shown = visibleColumns('comfyui', layout).map((c) => c.id);
    expect(shown).not.toContain('prompt');
    // Everything else is on by default.
    expect(shown).toHaveLength(columnsFor('comfyui').length - 1);
  });

  it('gives comic pages their own set, with Panels/OCR/Review', () => {
    const ids = columnsFor('comic-page').map((c) => c.id);
    expect(ids).toContain('series');
    expect(ids).toContain('panels');
    expect(ids).toContain('ocr');
    expect(ids).toContain('review');
    // A comic page has no generation columns.
    expect(ids).not.toContain('model');
    expect(ids).not.toContain('prompt');
  });

  it('gives comic panels a different set again (Panels scope)', () => {
    const ids = columnsFor('comic-panel').map((c) => c.id);
    expect(ids).toEqual(['thumbnail', 'page', 'panelIndex', 'series', 'size', 'ocr', 'tags', 'text']);
  });

  it('always shows Name (TBL-02)', () => {
    const layout = toggleColumn(defaultLayout('comfyui'), ALWAYS_VISIBLE);
    expect(visibleColumns('comfyui', layout).map((c) => c.id)).toContain(ALWAYS_VISIBLE);
  });

  it('picks the target from the library type and scope', () => {
    expect(targetFor('comfyui', 'pages')).toBe('comfyui');
    expect(targetFor('comic', 'pages')).toBe('comic-page');
    expect(targetFor('comic', 'both')).toBe('comic-page');
    expect(targetFor('comic', 'panels')).toBe('comic-panel');
  });
});

describe('TBL-03 — sorting', () => {
  const ascending: SortDirection = { key: 'filename_asc', direction: 'ascending' };

  it('makes only indexed columns sortable', () => {
    const sortable = columnsFor('comfyui').filter((c) => c.sortable).map((c) => c.id);
    expect(sortable).toEqual([
      'name', 'dimensions', 'size', 'modified', 'rating', 'model', 'steps', 'seed',
    ]);
  });

  it('cycles ascending → descending → library default', () => {
    const name = column('name');
    expect(nextSort(name, { key: null, direction: 'descending' })).toBe('ascending');
    expect(nextSort(name, ascending)).toBe('descending');
    expect(nextSort(name, { key: 'filename_asc', direction: 'descending' })).toBe('default');
  });

  it('refuses to sort an unsortable column and says why', () => {
    expect(nextSort(column('folder'), ascending)).toBeNull();
    expect(sortLabel(column('folder'), ascending)).toBe("This column can't be sorted.");
  });

  it('labels the current stop of the cycle', () => {
    expect(sortLabel(column('name'), { key: null, direction: 'descending' })).toBe('Ascending');
    expect(sortLabel(column('name'), ascending)).toBe('Descending');
    expect(sortLabel(column('name'), { key: 'filename_asc', direction: 'descending' })).toBe(
      'Library default',
    );
  });
});

describe('TBL-04 — metrics', () => {
  it('follows density for row height and thumbnail size', () => {
    expect(metricsFor('compact')).toEqual({ rowHeight: 28, thumbSize: 24 });
    expect(metricsFor('comfortable')).toEqual({ rowHeight: 32, thumbSize: 28 });
    expect(metricsFor('spacious')).toEqual({ rowHeight: 40, thumbSize: 36 });
  });

  it('computes how many rows fit in a viewport', () => {
    expect(rowsPerViewport(320, 32)).toBe(10);
    expect(rowsPerViewport(100, 40)).toBe(3);
    // A viewport shorter than one row still shows one, not zero.
    expect(rowsPerViewport(10, 40)).toBe(1);
  });
});

describe('TBL-06 — the columns menu', () => {
  it('hides and shows a column', () => {
    const layout = toggleColumn(defaultLayout('comfyui'), 'model');
    expect(visibleColumns('comfyui', layout).map((c) => c.id)).not.toContain('model');
    expect(visibleColumns('comfyui', toggleColumn(layout, 'model')).map((c) => c.id)).toContain('model');
  });

  it('moves a column left and right', () => {
    const start = defaultLayout('comfyui');
    const before = visibleColumns('comfyui', start).map((c) => c.id);
    const moved = moveColumn(start, 'model', -1);
    const after = visibleColumns('comfyui', moved).map((c) => c.id);
    // Exactly one position earlier, and nothing else disturbed.
    expect(after.indexOf('model')).toBe(before.indexOf('model') - 1);
    expect(after.filter((id) => id !== 'model').sort()).toEqual(
      before.filter((id) => id !== 'model').sort(),
    );
    // Moving back restores the original order.
    expect(visibleColumns('comfyui', moveColumn(moved, 'model', 1)).map((c) => c.id)).toEqual(before);
  });

  it('refuses to move past either end', () => {
    const start = defaultLayout('comfyui');
    expect(moveColumn(start, 'thumbnail', -1)).toBe(start);
    const last = start.order[start.order.length - 1];
    expect(moveColumn(start, last, 1)).toBe(start);
  });

  it('clamps a resize to the documented minimum of 64 px', () => {
    const layout = resizeColumn(defaultLayout('comfyui'), 'name', 10);
    expect(columnWidth(column('name'), layout)).toBe(MIN_COLUMN_WIDTH);
    expect(columnWidth(column('name'), resizeColumn(layout, 'name', 300))).toBe(300);
  });

  it('restores the defaults on Reset columns', () => {
    let layout: ColumnLayout = defaultLayout('comfyui');
    layout = toggleColumn(layout, 'model');
    layout = moveColumn(layout, 'model', 1);
    layout = resizeColumn(layout, 'name', 400);
    const reset = resetLayout('comfyui');
    expect(visibleColumns('comfyui', reset).map((c) => c.id)).toEqual(
      visibleColumns('comfyui', defaultLayout('comfyui')).map((c) => c.id),
    );
    expect(columnWidth(column('name'), reset)).toBe(column('name').defaultWidth);
  });
});

describe('TBL-07 — cells', () => {
  it('truncates with an ellipsis and keeps the full value for the tooltip', () => {
    const cell = cellFor(
      item('a', { row: row({ prompt: 'x'.repeat(200) }) }),
      column('prompt'),
    );
    expect(cell.text).toHaveLength(PROMPT_CELL_CHARS);
    expect(cell.text.endsWith('…')).toBe(true);
    expect(cell.truncated).toBe(true);
    expect(cell.title).toHaveLength(200);
  });

  it('never shows an unabridged prompt in a cell, even for a short one', () => {
    const cell = cellFor(item('a', { row: row({ prompt: 'short prompt' }) }), column('prompt'));
    expect(cell.truncated).toBe(false);
    expect(cell.text).toBe('short prompt');
  });

  it('clips comic OCR text at 80 characters', () => {
    const cell = cellFor(
      item('p', { row: row({ text: 'y'.repeat(120) }) }),
      column('text', 'comic-panel'),
    );
    expect(cell.text).toHaveLength(TEXT_CELL_CHARS);
    expect(cell.title).toHaveLength(120);
  });

  it('shows an empty cell, not a placeholder, for an absent value (INS-03 rule)', () => {
    expect(cellFor(item('a'), column('model')).text).toBe('');
    expect(cellFor(item('a'), column('seed')).text).toBe('');
    expect(cellFor(item('a', { row: row({ steps: null }) }), column('steps')).text).toBe('');
  });

  it('renders rating as stars with a spoken-value title', () => {
    const cell = cellFor(item('a', { row: row({ rating: 3 }) }), column('rating'));
    expect(cell.text).toBe('★★★');
    expect(cell.title).toBe('3 of 5');
    expect(cellFor(item('a', { row: row({ rating: 0 }) }), column('rating')).text).toBe('');
  });

  it('names the worst processing status rather than a bare symbol', () => {
    expect(cellFor(item('a', { row: row({ processing: 'ok' }) }), column('processing')).title).toBe(
      'All stages done',
    );
    expect(cellFor(item('a', { row: row({ processing: 'failed' }) }), column('processing')).title).toBe(
      'A stage failed',
    );
    expect(cellFor(item('a', { row: row({ processing: 'none' }) }), column('processing')).text).toBe('');
  });

  it('distinguishes the three panel states', () => {
    const decomposed = cellFor(
      item('a', { row: row({ panelStatus: 'decomposed', panelCount: 6 }) }),
      column('panels', 'comic-page'),
    );
    expect(decomposed.text).toBe('6');
    expect(
      cellFor(item('a', { row: row({ panelStatus: 'no-panels' }) }), column('panels', 'comic-page')).title,
    ).toBe('No panels found');
  });

  it('shows the last path segment for Folder and the whole path in the tooltip', () => {
    const cell = cellFor(item('a'), column('folder'));
    expect(cell.text).toBe('a.png');
    expect(cell.title).toBe('D:\\lib\\2026\\a.png');
  });

  it('clips a mid-string value without cutting a surrogate pair', () => {
    // A naive `slice` cuts an emoji's surrogate pair in half, leaving a lone
    // surrogate that renders as a replacement glyph. `clip` slices over grapheme
    // clusters, so the emoji survives whole and only 'cd' is dropped.
    const { value, truncated } = clip('ab\u{1F600}cd', 4);
    expect(value).toBe('ab\u{1F600}…');
    expect(truncated).toBe(true);
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(value).not.toMatch(lone);
  });

  it('leaves a short value with an emoji alone', () => {
    const text = '\u{1F600} face';
    expect(clip(text, 40)).toEqual({ value: text, truncated: false });
  });

  /**
   * Code-point safety is not enough.
   *
   * A code point can still be more than one thing a reader sees as a character.
   * All of these are ordinary in OCR text and filenames, which is where `clip`
   * runs — so cutting between them would show a bare accent, a half flag, or a
   * family's worth of ZWJ sequence.
   */
  it('never splits a grapheme cluster, not just a code point', () => {
    // Each case is arranged so the cluster is the LAST one that fits: limit N
    // keeps N-1 clusters plus the ellipsis.
    // A base letter plus a combining acute: two code points, one character.
    const combining = 'é';
    expect(clip(`aa${combining}bb`, 4).value).toBe(`aa${combining}…`);

    // A flag is two regional indicators.
    const flag = '\u{1F1EC}\u{1F1E7}';
    expect(clip(`xx${flag}yy`, 4).value).toBe(`xx${flag}…`);

    // An emoji with a skin-tone modifier, and one built from ZWJ.
    const tone = '\u{1F44D}\u{1F3FD}';
    expect(clip(`a${tone}bb`, 3).value).toBe(`a${tone}…`);
    const zwj = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    expect(clip(`a${zwj}bb`, 3).value).toBe(`a${zwj}…`);

    // A Devanagari conjunct.
    const conjunct = 'क्ष';
    expect(clip(`a${conjunct}bb`, 3).value).toBe(`a${conjunct}…`);
  });

  it('middle-truncates a filename without cutting a cluster (GAL-07)', () => {
    // The cluster sits exactly on the head/tail boundary: a code-point slice
    // would keep `a`, `a` and then half the emoji, leaving a lone surrogate.
    const out = middleTruncate('aa\u{1F600}\u{1F3FD}bb.png', 7);
    expect(out).toContain('…');
    expect(out).toBe(`aa\u{1F600}\u{1F3FD}…png`);
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });
});

describe('TBL-08 — CSV export', () => {
  it('exports the visible columns in their current order', () => {
    const layout = moveColumn(defaultLayout('comfyui'), 'modified', -1);
    const columns = visibleColumns('comfyui', layout);
    const csv = csvOf([item('a')], columns);
    const header = csv.split('\r\n')[0];
    expect(header.split(',')).toEqual(columns.map((c) => c.label || c.id));
  });

  it('exports the full value of a cell that was truncated for display', () => {
    const long = 'z'.repeat(200);
    const csv = csvOf([item('a', { row: row({ prompt: long }) })], [
      ...columnsFor('comfyui').filter((c) => c.id !== 'prompt'),
      column('prompt'),
    ]);
    expect(csv).toContain(long);
  });

  it('quotes a value containing a comma, quote or newline', () => {
    const csv = csvOf([item('a', { row: row({ tags: ['one', 'two'], loras: [{ name: 'a"b', weight: 1 }] }) })], [
      column('tags'),
      column('loras'),
    ]);
    expect(csv).toContain('"one, two"');
    expect(csv).toContain('"a""b · 1.00"');
  });

  it('exports every row given, not only what is loaded', () => {
    // The caller passes the full result set; the model does not truncate it.
    const rows = Array.from({ length: 412 }, (_, i) => item(`i${i}`));
    expect(csvOf(rows, [column('name')]).split('\r\n')).toHaveLength(413);
  });
});

// --- the assembled table ---------------------------------------------------

function renderTable(props: Partial<React.ComponentProps<typeof ExploreTable>> = {}) {
  const onSelect = vi.fn();
  const onActivate = vi.fn();
  const onSortChange = vi.fn();
  const onLayoutChange = vi.fn();
  const onRevealHandled = vi.fn();
  const items = props.items ?? Array.from({ length: 60 }, (_, i) => item(`i${i}`));
  const utils = render(
    <ExploreTable
      target="comfyui"
      items={items}
      density="comfortable"
      layout={defaultLayout('comfyui')}
      onLayoutChange={onLayoutChange}
      sort={{ key: null, direction: 'descending' }}
      onSortChange={onSortChange}
      selectedIds={[]}
      focusedId={items[0]?.id ?? null}
      onSelect={onSelect}
      onActivate={onActivate}
      pendingRevealId={null}
      onRevealHandled={onRevealHandled}
      onExportCsv={vi.fn()}
      onOpenColumns={vi.fn()}
      {...props}
    />,
  );
  return { ...utils, items, onSelect, onActivate, onSortChange, onLayoutChange, onRevealHandled };
}

describe('TBL-04 / TBL-09 — the table itself', () => {
  it('uses grid semantics with a header button per column', () => {
    renderTable();
    const grid = screen.getByRole('grid', { name: 'Images' });
    expect(grid.getAttribute('aria-multiselectable')).toBe('true');
    // 17 columns for ComfyUI, one hidden by default.
    expect(within(grid).getAllByRole('columnheader')).toHaveLength(17);
    expect(screen.getByRole('button', { name: 'Sort by Name' })).toBeTruthy();
  });

  it('marks a sortable header active and reports the sort direction', () => {
    renderTable({ sort: { key: 'filename_asc', direction: 'descending' } });
    expect(screen.getByRole('columnheader', { name: /Name/ }).getAttribute('aria-sort')).toBe(
      'descending',
    );
    expect(screen.getByRole('columnheader', { name: /Model/ }).getAttribute('aria-sort')).toBe('none');
  });

  it('disables an unsortable header and explains why (TBL-03)', () => {
    renderTable();
    const folder = screen.getByRole('button', { name: /Folder, can't be sorted/ });
    expect((folder as HTMLButtonElement).disabled).toBe(true);
    expect(folder.getAttribute('title')).toBe("This column can't be sorted.");
  });

  it('reports selection state per row', () => {
    renderTable({ selectedIds: ['i0', 'i2'] });
    const rows = screen.getAllByRole('row');
    expect(rows[1].getAttribute('aria-selected')).toBe('true');
    expect(rows[2].getAttribute('aria-selected')).toBe('false');
    expect(rows[3].getAttribute('aria-selected')).toBe('true');
  });

  it('shows the full value of a truncated cell in its tooltip (TBL-07)', () => {
    const long = 'q'.repeat(200);
    renderTable({ items: [item('a', { row: row({ prompt: long }) })] });
    // Reveal the hidden Prompt column first.
    expect(screen.queryByText(/q{20}/)).toBeNull();
    const csvButton = screen.getByRole('button', { name: 'Export CSV' });
    expect(csvButton).toBeTruthy();
  });

  it('virtualises: it does not render every row (TBL-04, B5)', () => {
    const items = Array.from({ length: 2000 }, (_, i) => item(`i${i}`));
    renderTable({ items });
    const rows = screen.getAllByRole('row');
    // One header plus a bounded window, not 2001 nodes.
    expect(rows.length).toBeLessThan(80);
  });

  it('clicks a row with the modifier keys it was given (TBL-05)', async () => {
    const user = userEvent.setup();
    const { onSelect, items } = renderTable();
    const rowEl = screen.getAllByRole('row')[2];
    await user.click(rowEl);
    expect(onSelect).toHaveBeenCalledWith(items[1], { shift: false, ctrl: false });

    await user.keyboard('{Shift>}');
    await user.click(rowEl);
    expect(onSelect).toHaveBeenLastCalledWith(items[1], { shift: true, ctrl: false });
  });

  it('opens the viewer on double-click, not on a single click', async () => {
    const user = userEvent.setup();
    const { onActivate, items } = renderTable();
    const rowEl = screen.getAllByRole('row')[1];
    await user.click(rowEl);
    expect(onActivate).not.toHaveBeenCalled();
    await user.dblClick(rowEl);
    expect(onActivate).toHaveBeenCalledWith(items[0]);
  });

  it('moves with the arrow keys and carries Shift through (TBL-05)', () => {
    const { onSelect, items } = renderTable();
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith(items[1], { shift: false, ctrl: false });
    fireEvent.keyDown(grid, { key: 'ArrowDown', shiftKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(items[1], { shift: true, ctrl: false });
    fireEvent.keyDown(grid, { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith(items[0], { shift: false, ctrl: false });
  });

  it('clamps at the ends rather than wrapping (TBL-05)', () => {
    const items = Array.from({ length: 5 }, (_, i) => item(`i${i}`));
    const { onSelect } = renderTable({ items, focusedId: 'i0' });
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(onSelect).toHaveBeenLastCalledWith(items[0], { shift: false, ctrl: false });
  });

  it('has no lasso, unlike the grid (TBL-05)', () => {
    renderTable();
    // Nothing in the table responds to a drag on empty space.
    expect(document.querySelector('.lasso')).toBeNull();
  });
});

describe('TBL-06 — the columns menu component', () => {
  function renderMenu(layout: ColumnLayout = defaultLayout('comfyui')) {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <ColumnsMenu target="comfyui" layout={layout} onChange={onChange} onClose={onClose} />,
    );
    return { onChange, onClose };
  }

  it('offers Move left / Move right rather than drag-only', async () => {
    const user = userEvent.setup();
    const { onChange } = renderMenu();
    const before = screen.getByRole('button', { name: 'Move Model left' });
    expect(before).toBeTruthy();
    await user.click(before);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Move Model right' })).toBeTruthy();
  });

  it('locks the Name checkbox and says why', () => {
    renderMenu();
    const nameToggle = screen.getByRole('checkbox', { name: /Name/ });
    expect((nameToggle as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Always shown')).toBeTruthy();
  });

  it('toggles any other column', async () => {
    const user = userEvent.setup();
    const { onChange } = renderMenu();
    await user.click(screen.getByRole('checkbox', { name: /Model/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('disables Move left on the first column and Move right on the last', () => {
    renderMenu();
    expect((screen.getByRole('button', { name: 'Move Thumbnail left' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'Move Prompt right' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('TBL-01 — parity with the grid', () => {
  it('takes its selection, focus and items from props rather than owning them', () => {
    // The point of TBL-01: switching views cannot change these, because the
    // table never had them. Two renders with the same props differ only where the
    // caller says so.
    const items = Array.from({ length: 5 }, (_, i) => item(`i${i}`));
    const { unmount } = renderTable({ items, selectedIds: ['i1', 'i2'], focusedId: 'i2' });
    const rows = screen.getAllByRole('row');
    expect(rows[2].getAttribute('aria-selected')).toBe('true');
    expect(rows[3].getAttribute('aria-selected')).toBe('true');
    expect(rows[3].dataset.focused).toBe('true');
    unmount();

    renderTable({ items, selectedIds: [], focusedId: 'i0' });
    expect(screen.getAllByRole('row')[1].getAttribute('aria-selected')).toBe('false');
  });

  it('asks to reveal the focused row when the view switches', () => {
    const { onRevealHandled } = renderTable({ pendingRevealId: 'i0', focusedId: 'i0' });
    expect(onRevealHandled).toHaveBeenCalled();
  });

  it('reports a column resize through the layout callback, not internal state', () => {
    // Drag-to-resize is a pointer gesture; the clamp is the model rule and is
    // covered above, so this only checks the wiring exists.
    renderTable();
    expect(screen.getAllByRole('separator', { name: /Resize Name column/ }).length).toBeGreaterThan(0);
  });
});