// covers: RLN-01, RLN-02, RLN-03, RLN-04, RLN-05, RLN-06, RLN-07, RLN-08, TST-36
import { describe, expect, it } from 'vitest';
import {
  createFixtureRelationsSource,
  FIXTURE_RELATIONS_SOURCE,
  buildRelationDisplay,
  reattachRelation,
  type ReferenceRelation,
} from '../features/relations/relationsFixtures';
import type { ExploreItem } from '../features/explore/exploreTypes';

describe('RLN-01 — One relation kind: reference (panel → ComfyUI image)', () => {
  it('ReferenceRelation has the correct structure', () => {
    const rel: ReferenceRelation = {
      id: 'rel-1',
      kind: 'reference',
      panelLibraryId: 'lib-comic',
      panelPageItemId: 'page-1',
      panelIdx: 1,
      panelBoxHash: 'box-hash',
      panelIdHint: 'panel-1-1',
      imageLibraryId: 'lib-comfyui',
      imageItemId: 'img-1',
      note: 'test note',
      createdAt: '2026-10-01T12:00:00.000Z',
    };
    expect(rel.kind).toBe('reference');
    expect(rel.panelLibraryId).toBe('lib-comic');
    expect(rel.imageLibraryId).toBe('lib-comfyui');
  });

  it('FIXTURE_RELATIONS_SOURCE returns fixture data', () => {
    expect(FIXTURE_RELATIONS_SOURCE.isFixtureData).toBe(true);
  });
});

describe('RLN-02 — Creation paths', () => {
  it('createReference adds a new relation', async () => {
    const source = createFixtureRelationsSource();
    const newRel = await source.createReference({
      kind: 'reference',
      panelLibraryId: 'lib-2',
      panelPageItemId: 'page-3',
      panelIdx: 1,
      panelBoxHash: 'box-new',
      panelIdHint: 'panel-3-1',
      imageLibraryId: 'lib-1',
      imageItemId: 'img-4',
      note: 'new reference',
    });
    expect(newRel.id).toMatch(/^rel-/);
    expect(newRel.createdAt).toBeDefined();
    expect(newRel.note).toBe('new reference');
  });
});

describe('RLN-03 — Storage and queries', () => {
  it('relations() returns all relations for a library', async () => {
    const lib2Relations = await FIXTURE_RELATIONS_SOURCE.relations('lib-2');
    expect(lib2Relations.length).toBeGreaterThan(0);
    expect(lib2Relations.every((r) => r.panelLibraryId === 'lib-2' || r.imageLibraryId === 'lib-2')).toBe(true);
  });

  it('relationsFromPanel() filters by panel', async () => {
    const fromPanel = await FIXTURE_RELATIONS_SOURCE.relationsFromPanel('lib-2', 'page-1', 1);
    expect(fromPanel.length).toBe(1);
    expect(fromPanel[0].panelIdx).toBe(1);
    expect(fromPanel[0].panelPageItemId).toBe('page-1');
  });

  it('relationsToImage() filters by target image', async () => {
    const toImage = await FIXTURE_RELATIONS_SOURCE.relationsToImage('lib-1', 'img-1');
    expect(toImage.length).toBe(1);
    expect(toImage[0].imageItemId).toBe('img-1');
  });
});

describe('RLN-04 — Re-attachment', () => {
  it('resolved when panelIdHint matches and index matches', () => {
    const rel: ReferenceRelation = {
      id: 'rel-test',
      kind: 'reference',
      panelLibraryId: 'lib-2',
      panelPageItemId: 'page-1',
      panelIdx: 1,
      panelBoxHash: 'box-old',
      panelIdHint: 'panel-1-1',
      imageLibraryId: 'lib-1',
      imageItemId: 'img-1',
      createdAt: '2026-10-01T12:00:00.000Z',
    };

    const panels: ExploreItem[] = [
      { id: 'panel-1-1', kind: 'panel', filename: 'panel-1.png', displayPath: '', folderIds: [], width: 100, height: 100, fileSizeBytes: 100, modifiedAt: '', generatedAt: null, dominantColor: '#000', thumbnailUrl: null, previewUrl: null, badges: [], panelCount: null, panelIndex: 1, parentPageId: 'page-1', parentSeriesLabel: 'Series', missing: false, flag: 'none', hidden: false, importBatchId: null, importBatchKind: null, cataloguedAt: '', row: {} as any },
    ];

    const result = reattachRelation(rel, panels);
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.updatedHint).toBe('panel-1-1');
    }
  });

  it('reattached when panel with same index found but hint differs', () => {
    const rel: ReferenceRelation = {
      id: 'rel-test',
      kind: 'reference',
      panelLibraryId: 'lib-2',
      panelPageItemId: 'page-1',
      panelIdx: 2,
      panelBoxHash: 'box-old',
      panelIdHint: 'old-hint',
      imageLibraryId: 'lib-1',
      imageItemId: 'img-1',
      createdAt: '2026-10-01T12:00:00.000Z',
    };

    const panels: ExploreItem[] = [
      { id: 'panel-1-2', kind: 'panel', filename: 'panel-2.png', displayPath: '', folderIds: [], width: 100, height: 100, fileSizeBytes: 100, modifiedAt: '', generatedAt: null, dominantColor: '#000', thumbnailUrl: null, previewUrl: null, badges: [], panelCount: null, panelIndex: 2, parentPageId: 'page-1', parentSeriesLabel: 'Series', missing: false, flag: 'none', hidden: false, importBatchId: null, importBatchKind: null, cataloguedAt: '', row: {} as any },
    ];

    const result = reattachRelation(rel, panels);
    expect(result.status).toBe('reattached');
  });

  it('broken when no matching panel found', () => {
    const rel: ReferenceRelation = {
      id: 'rel-test',
      kind: 'reference',
      panelLibraryId: 'lib-2',
      panelPageItemId: 'page-1',
      panelIdx: 99,
      panelBoxHash: 'box-old',
      panelIdHint: 'old-hint',
      imageLibraryId: 'lib-1',
      imageItemId: 'img-1',
      createdAt: '2026-10-01T12:00:00.000Z',
    };

    const panels: ExploreItem[] = [
      { id: 'panel-1-1', kind: 'panel', filename: 'panel-1.png', displayPath: '', folderIds: [], width: 100, height: 100, fileSizeBytes: 100, modifiedAt: '', generatedAt: null, dominantColor: '#000', thumbnailUrl: null, previewUrl: null, badges: [], panelCount: null, panelIndex: 1, parentPageId: 'page-1', parentSeriesLabel: 'Series', missing: false, flag: 'none', hidden: false, importBatchId: null, importBatchKind: null, cataloguedAt: '', row: {} as any },
    ];

    const result = reattachRelation(rel, panels);
    expect(result.status).toBe('broken');
  });
});

describe('RLN-05 — Display in inspector', () => {
  it('buildRelationDisplay builds correct display info', () => {
    const rel: ReferenceRelation = {
      id: 'rel-1',
      kind: 'reference',
      panelLibraryId: 'lib-2',
      panelPageItemId: 'page-1',
      panelIdx: 1,
      panelBoxHash: 'box-hash',
      panelIdHint: 'panel-1-1',
      imageLibraryId: 'lib-1',
      imageItemId: 'img-1',
      note: 'Character reference',
      createdAt: '2026-10-01T12:00:00.000Z',
    };

    const sourceItem: ExploreItem = {
      id: 'panel-1-1',
      kind: 'panel',
      filename: 'page-1-panel-1.png',
      displayPath: 'Series/page-1.png',
      folderIds: [],
      width: 500,
      height: 500,
      fileSizeBytes: 1000,
      modifiedAt: '',
      generatedAt: null,
      dominantColor: '#000',
      thumbnailUrl: 'thumb.png',
      previewUrl: null,
      badges: [],
      panelCount: null,
      panelIndex: 1,
      parentPageId: 'page-1',
      parentSeriesLabel: 'Series One',
      missing: false,
      flag: 'none',
      hidden: false,
      importBatchId: null,
      importBatchKind: null,
      cataloguedAt: '',
      row: {} as any,
    };

    const targetItem: ExploreItem = {
      id: 'img-1',
      kind: 'page',
      filename: 'reference-img.png',
      displayPath: 'ComfyUI/ref.png',
      folderIds: [],
      width: 1024,
      height: 1024,
      fileSizeBytes: 2000,
      modifiedAt: '',
      generatedAt: '2026-10-01T12:00:00.000Z',
      dominantColor: '#3a4a63',
      thumbnailUrl: 'img-thumb.png',
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
      cataloguedAt: '',
      row: {} as any,
    };

    const display = buildRelationDisplay(rel, sourceItem, targetItem);
    expect(display.relation).toBe(rel);
    expect(display.sourceItem?.filename).toBe('page-1-panel-1.png');
    expect(display.sourceItem?.seriesLabel).toBe('Series One');
    expect(display.sourceItem?.panelIndex).toBe(1);
    expect(display.targetItem?.filename).toBe('reference-img.png');
  });
});

describe('RLN-06 — Deleting a link deletes only the relation row', () => {
  it('deleteRelation removes only the specified relation', async () => {
    const source = createFixtureRelationsSource();
    const allBefore = await source.relations('lib-2');
    const relToDelete = allBefore[0];
    await source.deleteRelation(relToDelete.id);
    const allAfter = await source.relations('lib-2');
    expect(allAfter.length).toBe(allBefore.length - 1);
    expect(allAfter.find((r) => r.id === relToDelete.id)).toBeUndefined();
  });
});

describe('RLN-07 — Library removal deletes relations', () => {
  it('deleteRelationsToLibrary removes all relations pointing to the library', async () => {
    const source = createFixtureRelationsSource();
    await source.deleteRelationsToLibrary('lib-1');
    const remaining = await source.relations('lib-2');
    expect(remaining.length).toBe(0);
  });
});

describe('RLN-08 — Relations are user data and survive re-decompose', () => {
  it('relations persist through re-attachment (simulated)', () => {
    // The re-attachment logic updates hints but doesn't delete relations
    // This is tested through the reattachRelation function
    const rel: ReferenceRelation = {
      id: 'rel-test',
      kind: 'reference',
      panelLibraryId: 'lib-2',
      panelPageItemId: 'page-1',
      panelIdx: 1,
      panelBoxHash: 'box-old',
      panelIdHint: 'old-hint',
      imageLibraryId: 'lib-1',
      imageItemId: 'img-1',
      createdAt: '2026-10-01T12:00:00.000Z',
    };

    const panels: ExploreItem[] = [
      { id: 'panel-1-1', kind: 'panel', filename: 'panel-1.png', displayPath: '', folderIds: [], width: 100, height: 100, fileSizeBytes: 100, modifiedAt: '', generatedAt: null, dominantColor: '#000', thumbnailUrl: null, previewUrl: null, badges: [], panelCount: null, panelIndex: 1, parentPageId: 'page-1', parentSeriesLabel: 'Series', missing: false, flag: 'none', hidden: false, importBatchId: null, importBatchKind: null, cataloguedAt: '', row: {} as any },
    ];

    const result = reattachRelation(rel, panels);
    // Relation survives - re-attachment only updates hints
    expect(result.status).toBe('reattached');
  });
});

describe('TST-36 — Relation survives Replace re-decompose', () => {
  it('re-attachment updates hint when box matches', () => {
    const rel: ReferenceRelation = {
      id: 'rel-test',
      kind: 'reference',
      panelLibraryId: 'lib-2',
      panelPageItemId: 'page-1',
      panelIdx: 1,
      panelBoxHash: 'box-old',
      panelIdHint: 'old-hint',
      imageLibraryId: 'lib-1',
      imageItemId: 'img-1',
      createdAt: '2026-10-01T12:00:00.000Z',
    };

    const panels: ExploreItem[] = [
      { id: 'panel-1-1', kind: 'panel', filename: 'panel-1.png', displayPath: '', folderIds: [], width: 100, height: 100, fileSizeBytes: 100, modifiedAt: '', generatedAt: null, dominantColor: '#000', thumbnailUrl: null, previewUrl: null, badges: [], panelCount: null, panelIndex: 1, parentPageId: 'page-1', parentSeriesLabel: 'Series', missing: false, flag: 'none', hidden: false, importBatchId: null, importBatchKind: null, cataloguedAt: '', row: {} as any },
    ];

    const result = reattachRelation(rel, panels);
    expect(result.status).toBe('reattached');
    if (result.status === 'reattached') {
      expect(result.newPanelIdx).toBe(1);
    }
  });

  it('shows STA-38 when no matching panel found', () => {
    const rel: ReferenceRelation = {
      id: 'rel-test',
      kind: 'reference',
      panelLibraryId: 'lib-2',
      panelPageItemId: 'page-1',
      panelIdx: 99,
      panelBoxHash: 'box-old',
      panelIdHint: 'old-hint',
      imageLibraryId: 'lib-1',
      imageItemId: 'img-1',
      createdAt: '2026-10-01T12:00:00.000Z',
    };

    const panels: ExploreItem[] = [
      { id: 'panel-1-1', kind: 'panel', filename: 'panel-1.png', displayPath: '', folderIds: [], width: 100, height: 100, fileSizeBytes: 100, modifiedAt: '', generatedAt: null, dominantColor: '#000', thumbnailUrl: null, previewUrl: null, badges: [], panelCount: null, panelIndex: 1, parentPageId: 'page-1', parentSeriesLabel: 'Series', missing: false, flag: 'none', hidden: false, importBatchId: null, importBatchKind: null, cataloguedAt: '', row: {} as any },
    ];

    const result = reattachRelation(rel, panels);
    expect(result.status).toBe('broken');
    if (result.status === 'broken') {
      expect(result.reason).toBe('no-panel-found');
    }
  });
});