// covers: NAV-20, NAV-21, NAV-22, NAV-23, NAV-40, NAV-41, NAV-42, NAV-43, VWR-01, VWR-02, VWR-03, VWR-04, VWR-05, VWR-06, VWR-07, VWR-08, VWR-09, VWR-10, VWR-11
/**
 * Cross-page viewer navigation in the library screen.
 *
 * The full-size viewer steps through the gallery order. Within the loaded page
 * the neighbour is already in memory; at the edge of the page - or when the
 * viewer shows an image no longer in the page - the neighbour is fetched from
 * the backend through `api.getAdjacentImage`, whose method name the Tauri
 * shell's allowlist must admit. These tests pin the frontend half of that
 * contract: the request is issued only when it has to be, with the right
 * parameters, a boundary response leaves the viewer put, and a rejected request
 * follows the existing error path.
 *
 * The grid is virtualised and jsdom performs no layout, so
 * `@tanstack/react-virtual` is replaced with a stub that reports every row. That
 * is the only browser capability mocked out; the navigation logic under test is
 * the shipped `LibraryScreen` code, driven through real key events.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EMPTY_FILTERS, type ImageRecord } from '../types';

function rec(id: string, filename: string): ImageRecord {
  return {
    id,
    canonical_path: `/lib/${filename}`,
    filename,
    thumbnail_path: null,
    width: 512,
    height: 512,
    modality: 'image',
    metadata_status: 'absent',
    embedding_status: 'none',
    image_embedding_status: 'none',
    positive_prompt: null,
    negative_prompt: null,
    checkpoint: null,
    sampler: null,
    seed: null,
    completeness_state: null,
    match_mode: '',
    score: null,
  };
}

const PAGE = [rec('i1', 'page-01.png'), rec('i2', 'page-02.png'), rec('i3', 'page-03.png')];
const NEIGHBOUR = rec('i5', 'page-05.png');

type Fake = {
  browse: ReturnType<typeof vi.fn>;
  getImageDetail: ReturnType<typeof vi.fn>;
  getAdjacentImage: ReturnType<typeof vi.fn>;
  explainImagePrompt: ReturnType<typeof vi.fn>;
};

/** Mount the shipped LibraryScreen against a fake backend and a fake grid. */
async function mount(fake: Fake) {
  vi.resetModules();
  vi.doMock('../api', () => ({
    api: {
      browse: fake.browse,
      getImageDetail: fake.getImageDetail,
      getAdjacentImage: fake.getAdjacentImage,
      explainImagePrompt: fake.explainImagePrompt,
      openDirectory: vi.fn(),
      registerLibrary: vi.fn(),
      removeLibrary: vi.fn(),
    },
  }));
  vi.doMock('../app/providers', () => ({
    useLibrary: () => ({
      libraries: [],
      libraryId: 'lib-1',
      refreshLibraries: vi.fn(),
      selectLibrary: vi.fn(),
      filters: EMPTY_FILTERS,
      facets: null,
      setFilters: vi.fn(),
      clearFilters: vi.fn(),
    }),
  }));
  vi.doMock('@tanstack/react-virtual', () => ({
    useVirtualizer: (opts: { count: number; estimateSize?: () => number }) => {
      const size = opts.estimateSize?.() ?? 148;
      return {
        getVirtualItems: () =>
          Array.from({ length: opts.count }, (_, index) => ({
            index,
            key: index,
            start: index * size,
            size,
          })),
        getTotalSize: () => opts.count * size,
        scrollToIndex: () => {},
      };
    },
  }));

  const { LibraryScreen } = await import('../features/library/LibraryScreen');
  render(<LibraryScreen onGoToIndexing={() => {}} />);
  await waitFor(() =>
    expect(document.querySelectorAll('.cell').length).toBe(PAGE.length),
  );
}

async function openViewer(filename: string) {
  const cell = Array.from(document.querySelectorAll<HTMLElement>('.cell')).find(
    (c) => c.querySelector('.cell-name')?.textContent === filename,
  );
  if (!cell) throw new Error(`no grid cell for ${filename}`);
  fireEvent.doubleClick(cell);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull());
}

function viewerTitle(): string | null {
  return screen.getByRole('dialog').getAttribute('aria-label');
}

function step(direction: 'ArrowLeft' | 'ArrowRight') {
  // The viewer listens on `document` in the capture phase, but the event still
  // needs a real element as its target: the handler reads `target.tagName` and
  // `target.getAttribute`. `document` itself has neither.
  fireEvent.keyDown(screen.getByRole('dialog'), { key: direction });
}

function makeBackend(): Fake {
  const backend: Fake = {
    browse: vi.fn(),
    getImageDetail: vi.fn(),
    getAdjacentImage: vi.fn(),
    explainImagePrompt: vi.fn(),
  };
  backend.browse.mockResolvedValue({ items: PAGE, total: PAGE.length, count: PAGE.length });
  backend.getImageDetail.mockResolvedValue({
    image: PAGE[0],
    metadata: null,
    raw_metadata: null,
    embeddings: [],
    panel_crops: [],
  });
  backend.getAdjacentImage.mockResolvedValue({ image: null, at_boundary: true });
  // The Inspector fetches a prompt explanation when a record is selected; a
  // no-op keeps that unrelated request out of the way.
  backend.explainImagePrompt.mockResolvedValue(null);
  return backend;
}

describe('viewer navigation across a loaded page', () => {
  it('steps within the page without asking the backend', async () => {
    const api = makeBackend();
    await mount(api);

    await openViewer('page-02.png');
    expect(viewerTitle()).toBe('page-02.png');

    step('ArrowRight');
    await waitFor(() => expect(viewerTitle()).toBe('page-03.png'));
    expect(api.getAdjacentImage).not.toHaveBeenCalled();

    step('ArrowLeft');
    await waitFor(() => expect(viewerTitle()).toBe('page-02.png'));
    expect(api.getAdjacentImage).not.toHaveBeenCalled();
  });

  it('requests the next item when stepping past the last item of the page', async () => {
    const api = makeBackend();
    api.getAdjacentImage.mockResolvedValue({ image: NEIGHBOUR, at_boundary: false });
    await mount(api);

    await openViewer('page-03.png');
    expect(viewerTitle()).toBe('page-03.png');

    step('ArrowRight');

    await waitFor(() => expect(viewerTitle()).toBe('page-05.png'));
    expect(api.getAdjacentImage).toHaveBeenCalledTimes(1);
    expect(api.getAdjacentImage).toHaveBeenCalledWith({
      currentImageId: 'i3',
      direction: 'next',
      libraryId: 'lib-1',
      sort: 'mtime_desc',
      filters: EMPTY_FILTERS,
    });
  });

  it('leaves the viewer put at a page boundary', async () => {
    const api = makeBackend();
    // An image that is not in the loaded page always goes to the backend.
    api.getAdjacentImage.mockResolvedValueOnce({ image: NEIGHBOUR, at_boundary: false });
    await mount(api);

    await openViewer('page-01.png');
    step('ArrowLeft');
    // Wait for the *call* first, not only for the title: the title updates as
    // soon as `setViewer` runs, but the component re-renders (and re-binds its
    // capture-phase listener) afterwards. Stepping again before that settles was
    // the source of this test's intermittent failure.
    await waitFor(() => expect(api.getAdjacentImage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(viewerTitle()).toBe('page-05.png'));

    // Now the backend reports the far edge: the viewer must not move.
    api.getAdjacentImage.mockResolvedValueOnce({ image: null, at_boundary: true });
    step('ArrowRight');
    await waitFor(() => expect(api.getAdjacentImage).toHaveBeenCalledTimes(2));
    expect(viewerTitle()).toBe('page-05.png');
  });

  it('surfaces a rejected request through the existing error path', async () => {
    const api = makeBackend();
    await mount(api);

    await openViewer('page-01.png');
    expect(viewerTitle()).toBe('page-01.png');

    api.getAdjacentImage.mockRejectedValueOnce(
      new Error("Method 'get_adjacent_image' is not allowed"),
    );
    step('ArrowLeft');

    await waitFor(() =>
      expect(screen.getByText(/not allowed/)).toBeInTheDocument(),
    );
    // The viewer keeps showing the image it already had.
    expect(viewerTitle()).toBe('page-01.png');
  });
});
