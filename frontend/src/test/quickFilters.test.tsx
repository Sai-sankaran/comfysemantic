// covers: QFL-01, QFL-02, QFL-03, QFL-04, QFL-05, QFL-06, QFL-07, QFL-08, QFL-09, QFL-10, TST-43, GAL-04, FLG-02, NAV-51
import { describe, expect, it } from 'vitest';
import {
  ANY_STAGE,
  activeQuickFilterNames,
  clearQuickFilters,
  hasActiveQuickFilters,
  incompleteStageOptions,
  isIncomplete,
  isFailed,
  passesQuickFilters,
  QUICK_FILTER_ORDER,
  quickFilterLabel,
  setIncompleteStage,
  toggleQuickFilter,
} from '../features/explore/quickFiltersModel';
import type { ExploreItem } from '../features/explore/exploreTypes';
import { EMPTY_FILTERS } from '../features/explore/exploreTypes';

function makeItem(over: Partial<ExploreItem> = {}): ExploreItem {
  return {
    id: 'i1',
    kind: 'page',
    filename: 'test.png',
    displayPath: 'D:\\lib\\test.png',
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
    row: {
      seriesLabel: null,
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
      processing: 'ok',
      prompt: null,
      text: null,
    },
    ...over,
  };
}

describe('QFL-01 — chip order and labels', () => {
  it('QUICK_FILTER_ORDER has exactly five chips in the specified order', () => {
    expect(QUICK_FILTER_ORDER).toEqual([
      'favourite',
      'rated4',
      'picks',
      'incomplete',
      'failed',
    ]);
  });

  it('quickFilterLabel returns correct labels for each chip', () => {
    const filters = EMPTY_FILTERS;
    expect(quickFilterLabel('favourite', filters)).toBe('Favourites');
    expect(quickFilterLabel('rated4', filters)).toBe('Rated 4+');
    expect(quickFilterLabel('picks', filters)).toBe('Picks');
    expect(quickFilterLabel('incomplete', filters)).toBe('Incomplete');
    expect(quickFilterLabel('failed', filters)).toBe('Failed');
  });

  it('Incomplete label shows stage name when set', () => {
    const filters = { ...EMPTY_FILTERS, qfIncomplete: { enabled: true, stage: 'Decompose' } };
    expect(quickFilterLabel('incomplete', filters)).toBe('Incomplete: Decompose');
  });
});

describe('QFL-02 — chip semantics', () => {
  it('Favourites matches favourite = true', () => {
    const item = makeItem({ row: { ...makeItem().row!, favourite: true } });
    const filters = { ...EMPTY_FILTERS, qfFavourite: true };
    expect(passesQuickFilters(item, filters)).toBe(true);
    expect(passesQuickFilters({ ...item, row: { ...item.row!, favourite: false } }, filters)).toBe(false);
  });

  it('Rated 4+ matches rating >= 4', () => {
    const item = makeItem({ row: { ...makeItem().row!, rating: 4 } });
    const filters = { ...EMPTY_FILTERS, qfRated4Plus: true };
    expect(passesQuickFilters(item, filters)).toBe(true);
    expect(passesQuickFilters({ ...item, row: { ...item.row!, rating: 3 } }, filters)).toBe(false);
  });

  it('Picks matches flag = pick', () => {
    const item = makeItem({ flag: 'pick' });
    const filters = { ...EMPTY_FILTERS, qfPicks: true };
    expect(passesQuickFilters(item, filters)).toBe(true);
    expect(passesQuickFilters({ ...item, flag: 'reject' }, filters)).toBe(false);
    expect(passesQuickFilters({ ...item, flag: 'none' }, filters)).toBe(false);
  });

  it('Incomplete matches items with incomplete stage', () => {
    const item = makeItem({ badges: ['stale'] });
    const filters = { ...EMPTY_FILTERS, qfIncomplete: { enabled: true, stage: ANY_STAGE } };
    expect(passesQuickFilters(item, filters)).toBe(true);

    const okItem = makeItem({ badges: [] });
    expect(passesQuickFilters(okItem, filters)).toBe(false);
  });

  it('Failed matches items with failed stage', () => {
    const item = makeItem({ badges: ['failed'] });
    const filters = { ...EMPTY_FILTERS, qfFailed: true };
    expect(passesQuickFilters(item, filters)).toBe(true);

    const okItem = makeItem({ badges: [] });
    expect(passesQuickFilters(okItem, filters)).toBe(false);
  });
});

describe('QFL-03 — applicable stages', () => {
  it('applicableStages for ComfyUI item returns thumbnail, metadata, embeddings', () => {
    const item = makeItem({ kind: 'page' });
    expect(isIncomplete(item, ANY_STAGE)).toBe(false);
  });

  it('applicableStages for comic page with decomposed panels includes panel stages', () => {
    const item = makeItem({
      kind: 'page',
      row: { ...makeItem().row!, panelStatus: 'decomposed' },
    });
    expect(isIncomplete(item, ANY_STAGE)).toBe(false);
  });

  it('applicableStages for comic page without panels only includes Decompose', () => {
    const item = makeItem({
      kind: 'page',
      row: { ...makeItem().row!, panelStatus: 'not-decomposed' },
    });
    expect(isIncomplete(item, ANY_STAGE)).toBe(false);
  });
});

describe('QFL-04 — Incomplete stage menu', () => {
  it('incompleteStageOptions returns correct stages for ComfyUI', () => {
    const opts = incompleteStageOptions('comfyui');
    expect(opts).toContain(ANY_STAGE);
    expect(opts).toContain('Thumbnail');
    expect(opts).toContain('Metadata');
    expect(opts).toContain('Embeddings');
  });

  it('incompleteStageOptions returns correct stages for comic', () => {
    const opts = incompleteStageOptions('comic');
    expect(opts).toContain(ANY_STAGE);
    expect(opts).toContain('Decompose');
    expect(opts).toContain('Panel thumbnails');
    expect(opts).toContain('OCR');
    expect(opts).toContain('Text index');
  });

  it('setIncompleteStage sets the stage and enables the chip', () => {
    const filters = setIncompleteStage(EMPTY_FILTERS, 'Thumbnail');
    expect(filters.qfIncomplete.enabled).toBe(true);
    expect(filters.qfIncomplete.stage).toBe('Thumbnail');
  });
});

describe('QFL-05 — AND combination', () => {
  it('all active chips are AND-ed', () => {
    const item = makeItem({
      row: { ...makeItem().row!, favourite: true, rating: 5 },
      flag: 'pick',
      badges: ['stale'],
    });
    const filters = {
      ...EMPTY_FILTERS,
      qfFavourite: true,
      qfRated4Plus: true,
      qfPicks: true,
      qfIncomplete: { enabled: true, stage: ANY_STAGE },
    };
    expect(passesQuickFilters(item, filters)).toBe(true);

    const noFav = { ...item, row: { ...item.row!, favourite: false } };
    expect(passesQuickFilters(noFav, filters)).toBe(false);

    const noRating = { ...item, row: { ...item.row!, rating: 3 } };
    expect(passesQuickFilters(noRating, filters)).toBe(false);
  });
});

describe('QFL-06 — session-only (not persisted)', () => {
  it('clearQuickFilters resets all quick filter fields', () => {
    const filters = {
      ...EMPTY_FILTERS,
      qfFavourite: true,
      qfRated4Plus: true,
      qfPicks: true,
      qfIncomplete: { enabled: true, stage: 'Thumbnail' },
      qfFailed: true,
    };
    const cleared = clearQuickFilters(filters);
    expect(cleared.qfFavourite).toBe(false);
    expect(cleared.qfRated4Plus).toBe(false);
    expect(cleared.qfPicks).toBe(false);
    expect(cleared.qfIncomplete.enabled).toBe(false);
    expect(cleared.qfIncomplete.stage).toBe(ANY_STAGE);
    expect(cleared.qfFailed).toBe(false);
  });

  it('hasActiveQuickFilters returns true when any chip is active', () => {
    expect(hasActiveQuickFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveQuickFilters({ ...EMPTY_FILTERS, qfFavourite: true })).toBe(true);
    expect(hasActiveQuickFilters({ ...EMPTY_FILTERS, qfRated4Plus: true })).toBe(true);
    expect(hasActiveQuickFilters({ ...EMPTY_FILTERS, qfPicks: true })).toBe(true);
    expect(hasActiveQuickFilters({ ...EMPTY_FILTERS, qfIncomplete: { enabled: true, stage: ANY_STAGE } })).toBe(true);
    expect(hasActiveQuickFilters({ ...EMPTY_FILTERS, qfFailed: true })).toBe(true);
  });
});

describe('QFL-07 — count text names active chips', () => {
  it('activeQuickFilterNames returns names of active chips', () => {
    const filters = {
      ...EMPTY_FILTERS,
      qfFavourite: true,
      qfRated4Plus: true,
      qfIncomplete: { enabled: true, stage: 'Decompose' },
    };
    const names = activeQuickFilterNames(filters);
    expect(names).toContain('Favourites');
    expect(names).toContain('Rated 4+');
    expect(names).toContain('Incomplete: Decompose');
    expect(names).not.toContain('Picks');
    expect(names).not.toContain('Failed');
  });
});

describe('QFL-08 — panels scope', () => {
  it('Incomplete/Failed use panel stages for panel items', () => {
    const panelItem = makeItem({ kind: 'panel', badges: ['stale'] });
    const filters = { ...EMPTY_FILTERS, qfIncomplete: { enabled: true, stage: ANY_STAGE } };
    expect(passesQuickFilters(panelItem, filters)).toBe(true);
  });
});

describe('TST-43 — Quick filters AND-combine, absent from snapshot, restored by Back', () => {
  it('passesQuickFilters ANDs all active chips', () => {
    const item = makeItem({
      row: { ...makeItem().row!, favourite: true, rating: 5 },
      flag: 'pick',
      badges: ['stale'],
    });
    const filters = {
      ...EMPTY_FILTERS,
      qfFavourite: true,
      qfRated4Plus: true,
      qfPicks: true,
      qfIncomplete: { enabled: true, stage: ANY_STAGE },
      qfFailed: false,
    };
    expect(passesQuickFilters(item, filters)).toBe(true);

    const filters2 = { ...filters, qfFailed: true };
    expect(passesQuickFilters(item, filters2)).toBe(false);
  });

  it('quick filter state is not in EMPTY_FILTERS (not persisted by default)', () => {
    expect(EMPTY_FILTERS.qfFavourite).toBe(false);
    expect(EMPTY_FILTERS.qfRated4Plus).toBe(false);
    expect(EMPTY_FILTERS.qfPicks).toBe(false);
    expect(EMPTY_FILTERS.qfIncomplete.enabled).toBe(false);
    expect(EMPTY_FILTERS.qfFailed).toBe(false);
  });

  it('toggleQuickFilter toggles each chip', () => {
    let filters = toggleQuickFilter(EMPTY_FILTERS, 'favourite');
    expect(filters.qfFavourite).toBe(true);
    filters = toggleQuickFilter(filters, 'favourite');
    expect(filters.qfFavourite).toBe(false);
  });
});

describe('isIncomplete / isFailed edge cases', () => {
  it('isIncomplete with specific stage returns false for unknown stage', () => {
    const item = makeItem({ badges: ['stale'] });
    expect(isIncomplete(item, 'UnknownStage')).toBe(false);
  });

  it('isIncomplete Thumbnail checks missing', () => {
    const missingItem = makeItem({ missing: true, badges: ['missing'] });
    expect(isIncomplete(missingItem, 'Thumbnail')).toBe(true);

    const okItem = makeItem({ missing: false, badges: [] });
    expect(isIncomplete(okItem, 'Thumbnail')).toBe(false);
  });

  it('isIncomplete Metadata checks processing failed', () => {
    const failedItem = makeItem({ row: { ...makeItem().row!, processing: 'failed' } });
    expect(isIncomplete(failedItem, 'Metadata')).toBe(true);
  });

  it('isIncomplete Embeddings checks stale badge', () => {
    const staleItem = makeItem({ badges: ['stale'] });
    expect(isIncomplete(staleItem, 'Embeddings')).toBe(true);
  });

  it('isFailed checks failed badge and processing failed', () => {
    const badgeFailed = makeItem({ badges: ['failed'] });
    expect(isFailed(badgeFailed)).toBe(true);

    const procFailed = makeItem({ row: { ...makeItem().row!, processing: 'failed' } });
    expect(isFailed(procFailed)).toBe(true);

    const okItem = makeItem();
    expect(isFailed(okItem)).toBe(false);
  });
});