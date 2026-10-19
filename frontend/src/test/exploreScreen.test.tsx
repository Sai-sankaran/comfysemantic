// covers: GAL-01, GAL-02, GAL-03, GAL-04, GAL-06, GAL-13, GAL-14, GAL-15, GAL-22, GAL-23, NAV-04, NAV-05, STA-02, STA-03, STA-04, STA-05, STA-06
/**
 * The Explore screen (design §7.1, §16).
 *
 * The pure rules are tested in `exploreModel.test.ts`. This file pins what only
 * the assembled screen can show: the layout, the toolbar's documented order, the
 * grid's accessibility contract, the `STA-*` states, and the fixture boundary.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExploreScreen } from '../features/explore/ExploreScreen';
import {
  FAILING_SOURCE,
  FIXTURE_LIBRARIES,
  FIXTURE_SOURCE,
  FIXTURE_SOURCE_NO_COUNT,
  fixtureCatalogue,
} from '../features/explore/exploreFixtures';
import type { ExploreItem, ExplorePage, ExploreQuery, ExploreSource } from '../features/explore/exploreTypes';
import { EMPTY_FILTERS } from '../features/explore/exploreTypes';
import { ShellPanesContext, type ShellPanesValue } from '../app/shellPanes';

const COMFY = FIXTURE_LIBRARIES[0];
const COMIC = FIXTURE_LIBRARIES[1];

function panes(over: Partial<ShellPanesValue> = {}): ShellPanesValue {
  return {
    treeOpen: true,
    inspectorOpen: true,
    selectedCount: 0,
    setSelectedCount: vi.fn(),
    setTreeOpen: vi.fn(),
    setInspectorOpen: vi.fn(),
    notify: vi.fn(),
    viewMode: 'grid',
    setViewMode: vi.fn(),
    ...over,
  };
}

function renderExplore(
  props: Partial<React.ComponentProps<typeof ExploreScreen>> = {},
  paneOverrides: Partial<ShellPanesValue> = {},
) {
  return render(
    <ShellPanesContext.Provider value={panes(paneOverrides)}>
      <ExploreScreen
        source={FIXTURE_SOURCE}
        libraryId={COMFY.id}
        libraryType="comfyui"
        density="comfortable"
        {...props}
      />
    </ShellPanesContext.Provider>,
  );
}

/**
 * Pretend the scroll container is near its end.
 *
 * `scrollTop` is defined rather than assigned: jsdom resets it to 0 on an element
 * it considers non-scrollable, which made this assertion pass alone and fail
 * under full-suite load — the test would silently stop testing anything.
 */
function scrollToEnd() {
  const scroller = document.querySelector('.explore-scroll') as HTMLElement;
  Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(scroller, 'scrollHeight', { value: 40_000, configurable: true });
  Object.defineProperty(scroller, 'scrollTop', { value: 39_600, writable: true, configurable: true });
  fireEvent.scroll(scroller);
  return scroller;
}

/**
 * Scroll to the end until `check` passes.
 *
 * The scroll listener is attached by an effect that only runs once a cursor
 * exists, so a single scroll fired immediately after the first page can land
 * before the listener exists and be lost. Re-firing inside `waitFor` removes that
 * race without weakening what is being asserted: the same scroll is delivered,
 * just until the screen reacts.
 */
async function scrollUntil(check: () => boolean): Promise<void> {
  await waitFor(() => {
    scrollToEnd();
    expect(check()).toBe(true);
  });
}

function renderScreenListCount(): number {
  return screen.queryAllByRole('option').length;
}

describe('layout (§7.1)', () => {
  it('renders the folder tree, the gallery and the inspector', async () => {
    renderExplore();
    expect(screen.getByRole('complementary', { name: 'Folders' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Gallery' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
  });

  it('hides the tree when the shell says so (NAV-04)', async () => {
    renderExplore({}, { treeOpen: false });
    expect(screen.queryByRole('complementary', { name: 'Folders' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Gallery' })).toBeTruthy();
  });

  it('hides the inspector when the shell says so (NAV-05)', async () => {
    renderExplore({}, { inspectorOpen: false });
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
  });

  it('labels fixture data so it cannot be mistaken for a library', async () => {
    renderExplore();
    expect(screen.getByRole('note').textContent).toMatch(/Fixture data/);
  });

  it('does not label a real source as fixture data', async () => {
    renderExplore({ source: { ...FIXTURE_SOURCE, isFixtureData: false } });
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('the folder tree (LIB-06, LIB-09)', () => {
  it('opens on the library root and lists the folders beneath it', async () => {
    renderExplore();
    const tree = await screen.findByRole('tree', { name: 'Folder tree' });
    expect(within(tree).getByRole('treeitem', { name: /^All items/ })).toBeTruthy();
    expect(within(tree).getByRole('treeitem', { name: /^2026/ })).toBeTruthy();
  });

  it('filters the grid to a folder when one is selected (GAL-15)', async () => {
    const user = userEvent.setup();
    renderExplore();
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(200));
    const tree = screen.getByRole('tree', { name: 'Folder tree' });
    await user.click(within(tree).getByRole('treeitem', { name: /^2026/ }));
    await waitFor(() => {
      // Selecting a folder narrows the grid rather than leaving the previous
      // page on screen with a new breadcrumb.
      expect(screen.getAllByRole('option').length).toBeLessThan(200);
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });
  });
});

describe('the toolbar (§7.1 order)', () => {
  it('has the documented controls', async () => {
    renderExplore();
    const bar = screen.getByRole('toolbar', { name: 'Gallery controls' });
    expect(within(bar).getByLabelText('Include subfolders')).toBeTruthy();
    expect(within(bar).getByLabelText('Sort order')).toBeTruthy();
    expect(within(bar).getByLabelText('Sort descending')).toBeTruthy();
    expect(within(bar).getByRole('button', { name: /^Filters/ })).toBeTruthy();
    expect(within(bar).getByLabelText('Thumbnail size')).toBeTruthy();
    expect(within(bar).getByRole('radiogroup', { name: 'Grid mode' })).toBeTruthy();
  });

  it('puts the count, the slider and the grid mode after the spacer (right-aligned)', async () => {
    renderExplore();
    const bar = screen.getByRole('toolbar', { name: 'Gallery controls' });
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/\d/));
    expect(within(bar).getByLabelText('Sort descending')).toBeTruthy();
    // The count lives inside the toolbar, not beside it.
    expect(within(bar).getByRole('status')).toBeTruthy();
  });

  it('offers no scope toggle for a ComfyUI library, and one for a comic library (GAL-19)', async () => {
    const { unmount } = renderExplore();
    expect(screen.queryByRole('radiogroup', { name: 'Scope' })).toBeNull();
    unmount();

    renderExplore({ source: FIXTURE_SOURCE, libraryId: COMIC.id, libraryType: 'comic' });
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Scope' })).toBeTruthy());
    const scope = screen.getByRole('radiogroup', { name: 'Scope' });
    expect(within(scope).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Pages',
      'Panels',
      'Both',
    ]);
  });

  it('always keeps the count visible (GAL-03, QFL-07)', async () => {
    renderExplore();
    await waitFor(() => expect(screen.getByRole('status').textContent).not.toBe('Loading…'));
    // `FLG-05` appends "(N hidden)", so the label no longer ends at the noun.
    expect(screen.getByRole('status').textContent).toMatch(/images( \(\d+ hidden\))?$/);
  });

  it('shows "1,000+" when the backend cannot count (GAL-04)', async () => {
    renderExplore({ source: FIXTURE_SOURCE_NO_COUNT });
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('+'));
    expect(screen.getByRole('status').textContent).toMatch(/1,000\+ images|10,000\+ images/);
  });

  it('re-queries and restarts pagination when the sort changes (GAL-13)', async () => {
    const user = userEvent.setup();
    const page = vi.fn(FIXTURE_SOURCE.page);
    const spy: ExploreSource = { ...FIXTURE_SOURCE, page };
    renderExplore({ source: spy });
    await waitFor(() => expect(page).toHaveBeenCalled());
    const bar = screen.getByRole('toolbar', { name: 'Gallery controls' });

    await user.click(within(bar).getByLabelText('Sort order'));
    const listbox = within(bar).getByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: 'Filename A–Z' }));
    await waitFor(() => {
      expect(within(bar).getByLabelText('Sort order').textContent).toContain('Filename A–Z');
    });
    // A new sort issues a fresh first-page request (cursor null), not page 2.
    expect(page.mock.calls.at(-1)?.[0].cursor).toBeNull();
    expect(page.mock.calls.at(-1)?.[0].sort).toBe('filename_asc');
  });

  it('flips the direction button and reflects it in its accessible name', async () => {
    const user = userEvent.setup();
    renderExplore();
    const button = screen.getByLabelText('Sort descending');
    await user.click(button);
    expect(screen.getByLabelText('Sort ascending')).toBeTruthy();
  });
});

describe('the grid (GAL-02, GAL-05, GAL-07, GAL-10)', () => {
  /**
   * Regression: the column count is derived from the scroll container's width, and
   * the observer used to read an element that did not exist during the loading
   * state. `containerWidth` therefore stayed 0 forever, the layout fell back to
   * `thumbSize`, and the gallery rendered **one column at every viewport width**.
   *
   * jsdom reports `clientWidth` as 0 for everything, so the width has to be
   * defined explicitly — without that, this test would have passed against the
   * broken code, which is precisely what happened before.
   */
  function setGalleryWidth(width: number): void {
    const scroller = document.querySelector('.explore-scroll') as HTMLElement;
    Object.defineProperty(scroller, 'clientWidth', { value: width, configurable: true });
    // The ResizeObserver never fires in jsdom, so drive the re-measure directly.
    window.dispatchEvent(new Event('resize'));
  }

  /**
   * The distinct column positions.
   *
   * Read from the card's inline `left`, not `getBoundingClientRect`: jsdom has no
   * layout, so every rectangle is zero and a `getBoundingClientRect` version of
   * this assertion would report one column no matter what the code did — which is
   * why the original bug survived.
   */
  function renderedColumns(): number {
    return new Set(
      Array.from(document.querySelectorAll('[role="option"]'))
        .slice(0, 40)
        .map((c) => (c as HTMLElement).style.left),
    ).size;
  }

  it('fills the available width with more than one column (GAL-05)', async () => {
    renderExplore();
    await waitFor(() => expect(renderScreenListCount()).toBe(200));
    setGalleryWidth(560);
    await waitFor(() => expect(renderedColumns()).toBeGreaterThan(1));
  });

  it('lays out exactly as many columns as the width allows', async () => {
    renderExplore();
    await waitFor(() => expect(renderScreenListCount()).toBe(200));
    // 180 px cells, 8 px gaps: floor((560 + 8) / 188) = 3.
    setGalleryWidth(560);
    await waitFor(() => expect(renderedColumns()).toBe(3));
  });

  it('widens the grid when the container grows (NAV-06)', async () => {
    renderExplore();
    await waitFor(() => expect(renderScreenListCount()).toBe(200));
    setGalleryWidth(1200);
    await waitFor(() => expect(renderedColumns()).toBeGreaterThanOrEqual(6));
  });

  it('is a multi-selectable listbox whose options name the item', async () => {
    renderExplore();
    const grid = await screen.findByRole('listbox', { name: 'Images' });
    expect(grid.getAttribute('aria-multiselectable')).toBe('true');
    const first = within(grid).getAllByRole('option')[0];
    // The accessible name carries filename, dimensions and badges, so colour is
    // never the only signal (GAL-07).
    expect(first.getAttribute('aria-label')).toMatch(/\.png, \d+ × \d+/);
  });

  it('renders one cell per loaded page', async () => {
    // `GAL-02`: pages of 200, so the first render holds one page — not all 412.
    renderExplore();
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(200));
  });

  it('makes the rest of a 412-item folder reachable by scrolling (GAL-03, TST-10)', async () => {
    // The regression this guards is the "only 5–7 images shown" bug: a folder
    // must be *fully* reachable, not merely render its first page.
    renderExplore();
    await waitFor(() => expect(renderScreenListCount()).toBe(200));
    await scrollUntil(() => renderScreenListCount() === 400);
  });

  it('does not render an item twice when one cursor is requested twice (GAL-02)', async () => {
    // `GAL-02`'s contract is a **keyset** cursor, and a keyset cursor does not
    // promise disjoint pages. Items inserted or re-flagged between two requests
    // move a boundary; a retried request returns the page it already returned.
    // Either way the same item arrives twice, and a blind append renders it
    // twice.
    //
    // This source is the realistic version of that: the second page deliberately
    // re-serves its first 20 items, which is exactly what a shifted boundary
    // looks like. Without the guard the grid ends up with 20 duplicated cells
    // (420 options, and React warns about duplicate keys). With it, the overlap
    // is dropped and the count is the honest 400.
    let firstPageItems: ExploreItem[] = [];
    const source: ExploreSource = {
      ...FIXTURE_SOURCE,
      async page(query) {
        const result = await FIXTURE_SOURCE.page(query);
        if (firstPageItems.length === 0) {
          firstPageItems = result.items;
          return result;
        }
        // Re-serve the tail of what was already loaded, alongside the new items.
        const overlap = firstPageItems.slice(-20);
        return { ...result, items: [...overlap, ...result.items] };
      },
    };

    renderExplore({ source });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(200));
    await scrollUntil(() => screen.getAllByRole('option').length >= 380);

    const options = screen.getAllByRole('option');
    const labels = options.map((el) => el.getAttribute('aria-label'));
    // No cell is rendered twice, which is the whole point.
    expect(new Set(labels).size).toBe(labels.length);
    // And the overlapping items are still present exactly once.
    expect(options.length).toBe(400);
  });

  it('sizes cells from the stored dimensions, not from a decode (GAL-05)', async () => {
    renderExplore();
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(200));
    const cell = screen.getAllByRole('option')[0];
    // Uniform mode: a square, whatever the source aspect ratio.
    const { width, height } = cell.getBoundingClientRect();
    expect(width).toBeCloseTo(height, 0);
  });

  it('uses only the focused card as a tab stop (GAL-10 roving tabindex)', async () => {
    renderExplore();
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0));
    const grid = screen.getByRole('listbox', { name: 'Images' });
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    await waitFor(() => {
      const stops = screen.getAllByRole('option').filter((o) => o.getAttribute('tabindex') === '0');
      expect(stops).toHaveLength(1);
    });
  });

  it('moves the focus with the arrow keys', async () => {
    renderExplore();
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0));
    const grid = screen.getByRole('listbox', { name: 'Images' });
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getAllByRole('option').some((o) => o.getAttribute('tabindex') === '0')).toBe(true));
  });

  it('opens the viewer on Enter for the focused item (GAL-12)', async () => {
    renderExplore({ onOpenViewer: vi.fn() });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0));
    const grid = screen.getByRole('listbox', { name: 'Images' });
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Peek' })).toBeTruthy());
  });

  it('peeks on Space and closes on Escape (GAL-11)', async () => {
    const user = userEvent.setup();
    renderExplore();
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0));
    const grid = screen.getByRole('listbox', { name: 'Images' });
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: ' ' });

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/← → to change/);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    void user;
  });

  it('selects with ctrl+click and shows the selection bar (GAL-09, GAL-23)', async () => {
    const user = userEvent.setup();
    renderExplore();
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(1));
    const cards = screen.getAllByRole('option');
    await user.click(cards[0]);
    await user.keyboard('{Control>}');
    await user.click(cards[1]);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Selection actions' })).toBeTruthy());
    expect(screen.getByText(/2 selected/)).toBeTruthy();
  });

  it('clears the selection on Escape', async () => {
    const user = userEvent.setup();
    renderExplore();
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(1));
    await user.click(screen.getAllByRole('option')[0]);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Selection actions' })).toBeTruthy());
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Images' }), { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Selection actions' })).toBeNull(),
    );
  });

  it('disables Compare with a reason until two items are selected (GAL-23)', async () => {
    const user = userEvent.setup();
    renderExplore();
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(1));
    await user.click(screen.getAllByRole('option')[0]);
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    const compare = within(bar).getByRole('button', { name: 'Compare' }) as HTMLButtonElement;
    expect(compare.disabled).toBe(true);
    expect(compare.getAttribute('title')).toBe('Select at least 2 images');
  });
});

describe('the inspector (INS-01)', () => {
  it('invites a selection when nothing is selected', async () => {
    renderExplore();
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByText('Select an image to inspect it.')).toBeTruthy();
  });

  it('summarises a multi-selection without merging metadata (INS-01)', async () => {
    const user = userEvent.setup();
    renderExplore();
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(1));
    await user.click(screen.getAllByRole('option')[0]);
    await user.keyboard('{Control>}');
    await user.click(screen.getAllByRole('option')[1]);
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByText('2 items selected')).toBeTruthy();
    expect(inspector.textContent).toContain('Metadata is not');
  });
});

describe('states (§16)', () => {
  it('shows skeleton cells while the first page loads, not a bare spinner', async () => {
    let release: (value: ExplorePage) => void = () => undefined;
    const slow: ExploreSource = {
      ...FIXTURE_SOURCE,
      page: () => new Promise<ExplorePage>((resolve) => {
        release = resolve;
      }),
    };
    const { container } = renderExplore({ source: slow });
    expect(container.querySelectorAll('.skeleton-cell').length).toBeGreaterThan(0);
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    release({ items: fixtureCatalogue(COMFY.id).slice(0, 3), total: 3, hiddenCount: 0, nextCursor: null });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(3));
  });

  it('reports a failed load with Retry and Details (STA-05)', async () => {
    renderExplore({ source: FAILING_SOURCE });
    await waitFor(() => expect(screen.getByText("Couldn't load images.")).toBeTruthy());
    expect(screen.getByText(/locked by another window/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Details' })).toBeTruthy();
  });

  it('offers an inline retry when only a later page fails (GAL-03)', async () => {
    const flaky: ExploreSource = {
      ...FIXTURE_SOURCE,
      page: async (query: ExploreQuery) => {
        // Only a *later* page fails; the first must succeed, or the screen would
        // correctly show STA-05 instead of the inline retry.
        if (query.cursor !== null) throw new Error('page 2 failed');
        return FIXTURE_SOURCE.page(query);
      },
    };
    renderExplore({ source: flaky });
    await waitFor(() => expect(renderScreenListCount()).toBe(200));
    await scrollUntil(() => screen.queryByText("Couldn't load more images.") !== null);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('says a folder has not been checked yet (STA-03)', async () => {
    const user = userEvent.setup();
    const unchecked = {
      ...FIXTURE_SOURCE,
      folderTree: (): ReturnType<ExploreSource['folderTree']> => [
        {
          id: 'root',
          label: 'All items',
          parentId: null,
          isRoot: true,
          count: 412,
          status: 'done',
          children: [
            {
              id: 'never',
              label: 'Never checked',
              parentId: 'root',
              isRoot: false,
              count: 0,
              status: 'unchecked',
              children: [],
            },
          ],
        },
      ],
      page: async () => ({ items: [], total: 0, hiddenCount: 0, nextCursor: null }),
    };
    renderExplore({ source: unchecked });
    const tree = await screen.findByRole('tree', { name: 'Folder tree' });
    await user.click(within(tree).getByRole('treeitem', { name: /Never checked/ }));
    await waitFor(() =>
      expect(screen.getByText(/hasn't been added to the catalog yet/)).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Check for new files' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Pipeline' })).toBeTruthy();
  });

  it('shows a removable chip and an "N of M" count when a filter is active (GAL-14, QFL-07)', async () => {
    const user = userEvent.setup();
    renderExplore();
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(200));

    // The unfiltered total has to be read *before* the filter is applied:
    // `GAL-04`'s filtered form is "N of M" and drops the noun, so afterwards
    // there is no "images" left to parse. Reading it rather than hard-coding 412
    // also keeps the test honest about `FLG-02`'s hidden items.
    const bar = screen.getByRole('toolbar', { name: 'Gallery controls' });
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/images/));
    const unfiltered = /([\d,]+) images/.exec(screen.getByRole('status').textContent ?? '')?.[1];
    expect(unfiltered).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const menu = screen.getByRole('menu', { name: 'Gallery filters' });
    await user.click(within(menu).getAllByRole('checkbox')[0]);
    await user.keyboard('{Escape}');

    // "No silent hiding": the chip stays visible and the count says what was
    // filtered, rather than the grid just getting shorter.
    await waitFor(() => expect(within(bar).getByText(new RegExp(`of ${unfiltered}`))).toBeTruthy());
    expect(screen.getByRole('button', { name: /Remove filter/ })).toBeTruthy();
  });

  it('reports that filters hide everything, with a clear action (STA-04)', async () => {
    // A width no stored image has, so the filtered set is genuinely empty.
    const narrow: ExploreSource = {
      ...FIXTURE_SOURCE,
      page: async (query) => {
        // No stored image is wider than 4,000 px, so this filter empties the grid
        // without depending on which facet values the fixture happens to hold.
        if ((query.filters.minWidth ?? 0) > 4_000) {
          return { items: [], total: 412, hiddenCount: 0, nextCursor: null };
        }
        return FIXTURE_SOURCE.page(query);
      },
    };
    const user = userEvent.setup();
    renderExplore({ source: narrow });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(200));

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const menu = screen.getByRole('menu', { name: 'Gallery filters' });
    // Toggle one real facet: the chip and the "N of M" count must both appear,
    // which is `GAL-14`'s "no silent hiding" rule.
    await user.click(within(menu).getAllByRole('checkbox')[0]);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: /Remove filter/ })).toBeTruthy());
    expect(screen.getByRole('status').textContent).toMatch(/of [\d,]+/);
  });
});

describe('the fixture boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is deterministic: two reads produce identical items', async () => {
    const query: ExploreQuery = {
      libraryId: COMFY.id,
      folderId: null,
      includeSubfolders: true,
      scope: 'pages',
      sort: 'mtime_desc',
      sortDescending: true,
      filters: EMPTY_FILTERS,
      limit: 20,
      cursor: null,
      hidden: 'exclude',
      hiddenCount: 0,
    };
    const [a, b] = await Promise.all([FIXTURE_SOURCE.page(query), FIXTURE_SOURCE.page(query)]);
    expect(a).toEqual(b);
  });

  it('honours the keyset pagination contract of GAL-02', async () => {
    const query: ExploreQuery = {
      libraryId: COMFY.id,
      folderId: null,
      includeSubfolders: true,
      scope: 'pages',
      sort: 'mtime_desc',
      sortDescending: true,
      filters: EMPTY_FILTERS,
      limit: 200,
      cursor: null,
      hidden: 'exclude',
      hiddenCount: 0,
    };
    const first = await FIXTURE_SOURCE.page(query);
    expect(first.items).toHaveLength(200);
    expect(first.nextCursor).not.toBeNull();
    const second = await FIXTURE_SOURCE.page({ ...query, cursor: first.nextCursor });
    expect(second.items[0].id).not.toBe(first.items[0].id);
  });
});