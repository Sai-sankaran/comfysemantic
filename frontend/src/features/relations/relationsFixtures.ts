// covers: RLN-01, RLN-02, RLN-03, RLN-04, RLN-05, RLN-06, RLN-07, RLN-08, TST-36
import type {
  RelationsSource,
  ReferenceRelation,
  RelationDisplay,
  ReattachmentResult,
} from './RelationsTypes';
import type { ExploreItem } from '../explore/exploreTypes';
import { FIXTURE_LIBRARIES } from '../explore/exploreFixtures';

/**
 * Relations fixtures — deterministic, labelled as fixture data.
 *
 * The RelationsSource interface is the seam: the real backend replaces
 * this file's exports, and no screen code changes.
 */

function makeBoxHash(pageId: string, idx: number): string {
  // Deterministic "hash" for fixture purposes
  return `box-${pageId}-${idx}`;
}

const FIXTURE_RELATIONS: ReferenceRelation[] = [
  {
    id: 'rel-1',
    kind: 'reference',
    panelLibraryId: 'lib-2', // comic library
    panelPageItemId: 'page-1',
    panelIdx: 1,
    panelBoxHash: makeBoxHash('page-1', 1),
    panelIdHint: 'panel-1-1',
    imageLibraryId: 'lib-1', // comfyui library
    imageItemId: 'img-1',
    note: 'Character reference for main protagonist',
    createdAt: '2026-10-01T12:00:00.000Z',
  },
  {
    id: 'rel-2',
    kind: 'reference',
    panelLibraryId: 'lib-2',
    panelPageItemId: 'page-1',
    panelIdx: 2,
    panelBoxHash: makeBoxHash('page-1', 2),
    panelIdHint: 'panel-1-2',
    imageLibraryId: 'lib-1',
    imageItemId: 'img-2',
    note: 'Background reference',
    createdAt: '2026-10-02T12:00:00.000Z',
  },
  {
    id: 'rel-3',
    kind: 'reference',
    panelLibraryId: 'lib-2',
    panelPageItemId: 'page-2',
    panelIdx: 1,
    panelBoxHash: makeBoxHash('page-2', 1),
    panelIdHint: 'panel-2-1',
    imageLibraryId: 'lib-1',
    imageItemId: 'img-3',
    createdAt: '2026-10-03T12:00:00.000Z',
  },
];

export function createFixtureRelationsSource(): RelationsSource {
  let relations = [...FIXTURE_RELATIONS];

  return {
    isFixtureData: true,

    async relations(libraryId: string): Promise<ReferenceRelation[]> {
      return relations.filter((r) => r.panelLibraryId === libraryId || r.imageLibraryId === libraryId);
    },

    async relationsFromPanel(panelLibraryId: string, panelPageItemId: string, panelIdx: number): Promise<ReferenceRelation[]> {
      return relations.filter(
        (r) => r.panelLibraryId === panelLibraryId && r.panelPageItemId === panelPageItemId && r.panelIdx === panelIdx,
      );
    },

    async relationsToImage(imageLibraryId: string, imageItemId: string): Promise<ReferenceRelation[]> {
      return relations.filter((r) => r.imageLibraryId === imageLibraryId && r.imageItemId === imageItemId);
    },

    async createReference(relation: Omit<ReferenceRelation, 'id' | 'createdAt'>): Promise<ReferenceRelation> {
      const newRel: ReferenceRelation = {
        ...relation,
        id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
      };
      relations.push(newRel);
      return newRel;
    },

    async deleteRelation(id: string): Promise<void> {
      const idx = relations.findIndex((r) => r.id === id);
      if (idx >= 0) relations.splice(idx, 1);
    },

    async deleteRelationsToLibrary(libraryId: string): Promise<void> {
      relations = relations.filter((r) => r.imageLibraryId !== libraryId && r.panelLibraryId !== libraryId);
    },
  };
}

export const FIXTURE_RELATIONS_SOURCE = createFixtureRelationsSource();
export type { ReattachmentResult, ReferenceRelation };

export function buildRelationDisplay(
  relation: ReferenceRelation,
  sourceItem: ExploreItem | null,
  targetItem: ExploreItem | null,
): RelationDisplay {
  const sourceLib = FIXTURE_LIBRARIES.find((l) => l.id === relation.panelLibraryId);
  const targetLib = FIXTURE_LIBRARIES.find((l) => l.id === relation.imageLibraryId);

  return {
    relation,
    sourceItem: sourceItem
      ? {
          filename: sourceItem.filename,
          thumbnailUrl: sourceItem.thumbnailUrl,
          seriesLabel: sourceItem.parentSeriesLabel,
          panelIndex: sourceItem.panelIndex ?? 0,
          libraryName: sourceLib?.name ?? relation.panelLibraryId,
        }
      : undefined,
    targetItem: targetItem
      ? {
          filename: targetItem.filename,
          thumbnailUrl: targetItem.thumbnailUrl,
          libraryName: targetLib?.name ?? relation.imageLibraryId,
        }
      : undefined,
  };
}

// `RLN-04`: re-attachment logic for fixture
export function reattachRelation(
  relation: ReferenceRelation,
  panels: ExploreItem[], // panels for the page
): ReattachmentResult {
  // First try by panelIdHint
  if (relation.panelIdHint) {
    const exactMatch = panels.find((p) => p.id === relation.panelIdHint);
    if (exactMatch && exactMatch.panelIndex === relation.panelIdx) {
      return { status: 'resolved', updatedHint: relation.panelIdHint };
    }
  }

  // Then try by IoU >= 0.8
  // For fixture, we just check if a panel with the same index exists
  const panelMatch = panels.find((p) => p.kind === 'panel' && p.panelIndex === relation.panelIdx);
  if (panelMatch) {
    return { status: 'reattached', newPanelIdx: panelMatch.panelIndex!, newBoxHash: makeBoxHash(relation.panelPageItemId, panelMatch.panelIndex!) };
  }

  return { status: 'broken', reason: 'no-panel-found' };
}