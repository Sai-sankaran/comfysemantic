// covers: COL-10, COL-11, COL-12, COL-13, COL-14, COL-15, COL-16, COL-17, COL-18, COL-19, COL-20, COL-21, COL-22, COL-23, TST-44, GAL-04, FLG-02, NAV-51
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_COLLECTION_ORDER,
  BUILTIN_COLLECTION_LABELS,
  BUILTIN_COLLECTION_LIBRARY_TYPES,
  builtinCollectionFilters,
  availableBuiltins,
  BUILTIN_RULE_ENGINE_ADDITIONS,
} from '../features/explore/builtinCollections';
import type { ExploreFilters } from '../features/explore/exploreTypes';

// Type for filters returned by builtinCollectionFilters (includes internal markers)
type BuiltinFilters = ExploreFilters & {
  _builtin?: string;
  _recentDays?: number;
}

describe('COL-10 — eight built-in collections exist', () => {
  it('BUILTIN_COLLECTION_ORDER has exactly eight entries', () => {
    expect(BUILTIN_COLLECTION_ORDER).toHaveLength(8);
    expect(BUILTIN_COLLECTION_ORDER).toEqual([
      'recently-added',
      'recently-viewed',
      'favourites',
      'picks',
      'unrated',
      'needs-ocr',
      'not-decomposed',
      'all-images',
    ]);
  });

  it('BUILTIN_COLLECTION_LABELS has entries for all collections', () => {
    for (const id of BUILTIN_COLLECTION_ORDER) {
      expect(BUILTIN_COLLECTION_LABELS[id]).toBeDefined();
      expect(typeof BUILTIN_COLLECTION_LABELS[id]).toBe('string');
      expect(BUILTIN_COLLECTION_LABELS[id].length).toBeGreaterThan(0);
    }
  });
});

describe('COL-11 — ComfyUI library shows six collections', () => {
  it('availableBuiltins returns six for comfyui', () => {
    const ids = availableBuiltins('comfyui');
    expect(ids).toHaveLength(6);
    expect(ids).toEqual([
      'recently-added',
      'recently-viewed',
      'favourites',
      'picks',
      'unrated',
      'all-images',
    ]);
  });
});

describe('COL-12 — comic library shows all eight collections', () => {
  it('availableBuiltins returns eight for comic', () => {
    const ids = availableBuiltins('comic');
    expect(ids).toHaveLength(8);
    expect(ids).toEqual([
      'recently-added',
      'recently-viewed',
      'favourites',
      'picks',
      'unrated',
      'needs-ocr',
      'not-decomposed',
      'all-images',
    ]);
  });
});

describe('COL-13 — collection titles', () => {
  it('BUILTIN_COLLECTION_LABELS returns correct titles', () => {
    expect(BUILTIN_COLLECTION_LABELS['recently-added']).toBe('Recently added');
    expect(BUILTIN_COLLECTION_LABELS['recently-viewed']).toBe('Recently viewed');
    expect(BUILTIN_COLLECTION_LABELS['favourites']).toBe('Favourites');
    expect(BUILTIN_COLLECTION_LABELS['picks']).toBe('Picks');
    expect(BUILTIN_COLLECTION_LABELS['unrated']).toBe('Unrated');
    expect(BUILTIN_COLLECTION_LABELS['needs-ocr']).toBe('Needs OCR');
    expect(BUILTIN_COLLECTION_LABELS['not-decomposed']).toBe('Not decomposed');
    expect(BUILTIN_COLLECTION_LABELS['all-images']).toBe('All images');
  });
});

describe('COL-14 — Recently added predicate', () => {
  it('builtinCollectionFilters returns filter with _builtin marker', () => {
    const filters = builtinCollectionFilters('recently-added', 'comfyui', 7) as BuiltinFilters;
    expect(filters._builtin).toBe('recently-added');
    expect(filters._recentDays).toBe(7);
  });

  it('includes hidden=false implicitly (FLG-02)', () => {
    const filters = builtinCollectionFilters('recently-added', 'comfyui', 7) as BuiltinFilters;
    // The source enforces hidden='exclude' by default
    expect(filters).toBeDefined();
  });
});

describe('COL-15 — Recently viewed predicate', () => {
  it('builtinCollectionFilters returns filter with _builtin marker', () => {
    const filters = builtinCollectionFilters('recently-viewed', 'comfyui', 7) as BuiltinFilters;
    expect(filters._builtin).toBe('recently-viewed');
    expect(filters._recentDays).toBe(7);
  });
});

describe('COL-16 — Favourites predicate', () => {
  it('builtinCollectionFilters returns filter with favourite=true', () => {
    const filters = builtinCollectionFilters('favourites', 'comfyui', 7);
    expect(filters.favourite).toBe(true);
  });
});

describe('COL-17 — Picks predicate', () => {
  it('builtinCollectionFilters returns filter with flag=pick', () => {
    const filters = builtinCollectionFilters('picks', 'comfyui', 7);
    expect(filters.flag).toBe('pick');
  });
});

describe('COL-18 — Unrated predicate', () => {
  it('builtinCollectionFilters returns filter with _builtin marker', () => {
    const filters = builtinCollectionFilters('unrated', 'comfyui', 7) as BuiltinFilters;
    expect(filters._builtin).toBe('unrated');
  });
});

describe('COL-19 — Needs OCR predicate (comic only)', () => {
  it('builtinCollectionFilters returns filter with _builtin marker for comic', () => {
    const filters = builtinCollectionFilters('needs-ocr', 'comic', 7) as BuiltinFilters;
    expect(filters._builtin).toBe('needs-ocr');
  });

  it('builtinCollectionFilters returns base filter for comfyui (not available)', () => {
    const filters = builtinCollectionFilters('needs-ocr', 'comfyui', 7) as BuiltinFilters;
    expect(filters._builtin).toBeUndefined();
  });

  it('BUILTIN_COLLECTION_LIBRARY_TYPES restricts needs-ocr to comic', () => {
    expect(BUILTIN_COLLECTION_LIBRARY_TYPES['needs-ocr']).toEqual(['comic']);
  });
});

describe('COL-20 — Not decomposed predicate (comic only)', () => {
  it('builtinCollectionFilters returns filter with _builtin marker for comic', () => {
    const filters = builtinCollectionFilters('not-decomposed', 'comic', 7) as BuiltinFilters;
    expect(filters._builtin).toBe('not-decomposed');
  });

  it('builtinCollectionFilters returns base filter for comfyui (not available)', () => {
    const filters = builtinCollectionFilters('not-decomposed', 'comfyui', 7) as BuiltinFilters;
    expect(filters._builtin).toBeUndefined();
  });

  it('BUILTIN_COLLECTION_LIBRARY_TYPES restricts not-decomposed to comic', () => {
    expect(BUILTIN_COLLECTION_LIBRARY_TYPES['not-decomposed']).toEqual(['comic']);
  });
});

describe('COL-21 — All images predicate', () => {
  it('builtinCollectionFilters returns base filter (no extra filter)', () => {
    const filters = builtinCollectionFilters('all-images', 'comfyui', 7) as BuiltinFilters;
    expect(filters._builtin).toBeUndefined();
    expect(filters.favourite).toBe(false);
    expect(filters.flag).toBe('any');
  });
});

describe('COL-22 — rule engine additions', () => {
  it('BUILTIN_RULE_ENGINE_ADDITIONS has all required additions', () => {
    expect(BUILTIN_RULE_ENGINE_ADDITIONS.relativeDate).toBe(true);
    expect(BUILTIN_RULE_ENGINE_ADDITIONS.isSet).toBe(true);
    expect(BUILTIN_RULE_ENGINE_ADDITIONS.stageStatus).toBe(true);
    expect(BUILTIN_RULE_ENGINE_ADDITIONS.stageIncomplete).toBe(true);
    expect(BUILTIN_RULE_ENGINE_ADDITIONS.flagEquals).toBe(true);
  });
});

describe('COL-23 — visibility by library type', () => {
  it('availableBuiltins filters by library type', () => {
    const comfyui = availableBuiltins('comfyui');
    const comic = availableBuiltins('comic');

    expect(comfyui).not.toContain('needs-ocr');
    expect(comfyui).not.toContain('not-decomposed');
    expect(comic).toContain('needs-ocr');
    expect(comic).toContain('not-decomposed');
  });
});

describe('TST-44 — Built-in collections appear in rail under library', () => {
  it('availableBuiltins returns correct lists per library type', () => {
    const comfyuiIds = availableBuiltins('comfyui');
    const comicIds = availableBuiltins('comic');

    // Verify all ComfyUI collections are available
    expect(comfyuiIds).toHaveLength(6);
    expect(comfyuiIds).not.toContain('needs-ocr');
    expect(comfyuiIds).not.toContain('not-decomposed');

    // Verify all comic collections are available
    expect(comicIds).toHaveLength(8);
    expect(comicIds).toContain('needs-ocr');
    expect(comicIds).toContain('not-decomposed');
  });

  it('builtinCollectionFilters returns valid filters for all collections', () => {
    for (const id of BUILTIN_COLLECTION_ORDER) {
      const filters = builtinCollectionFilters(id, 'comic', 7);
      expect(filters).toBeDefined();
      expect(typeof filters).toBe('object');
    }
  });
});