/**
 * Built-in Collections (COL-10..COL-23)
 *
 * Built-in collections are code-defined smart collections that appear in the
 * Collections section of the left tree. They reuse the smart-collection rule
 * engine (COL-01..COL-07) but are provided by the application, not created by
 * the user.
 *
 * `COL-10`: Built-ins are defined in code, not stored as DB rows. They have
 * stable IDs and are always available.
 *
 * `COL-11`: Rule-engine additions required:
 *   - Relative date ("in the last N days") on `catalogued_at` and `last_viewed_at`
 *   - `is set` / `is not set`
 *   - `stage status is any of …` per stage
 *   - `stage incomplete over the applicable stage set` (QFL-03)
 *   - `flag equals`
 *   Every collection and every search implicitly adds `hidden = false` (FLG-02).
 *
 * The 8 built-in collections (`COL-10`):
 *   1. **Recently added** — `catalogued_at` in the last `collections.recentDays`,
 *      `import_batch_kind = discovered` (IMP-02)
 *   2. **Recently viewed** — `last_viewed_at` in the last `collections.recentDays`
 *   3. **Favourites** — `favourite = true`
 *   4. **Picks** — `flag = pick`
 *   5. **Unrated** — `rating = 0`
 *   6. **Needs OCR** — comic only, `ocrStatus = none` or `needsReview`
 *   7. **Not decomposed** — comic only, `panelStatus = not-decomposed`
 *   8. **All images** — no filter (the default view)
 *
 * `COL-19`: Shared sort control — the sort order is the library's default sort
 * (`GAL-13`), but can be changed per collection and the change persists.
 *
 * `COL-20`: Stability — a built-in collection's contents are stable until the
 * user explicitly requests a Refresh (TST-42). No auto-reorder on index writes.
 *
 * `COL-21`: Lazy counts — the tree shows a live count only when the collection
 * is expanded; counts are fetched on demand.
 *
 * `COL-22`: Per library — built-ins exist per library; `All libraries` scope
 * unions them (deduped by ID).
 *
 * `COL-23`: Visibility by type — `Needs OCR` and `Not decomposed` appear only
 * for comic libraries.
 */

import type { ExploreFilters, LibraryType } from './exploreTypes';

/** `COL-10`: the built-in collection IDs, in display order. */
export type BuiltinCollectionId =
  | 'recently-added'
  | 'recently-viewed'
  | 'favourites'
  | 'picks'
  | 'unrated'
  | 'needs-ocr'
  | 'not-decomposed'
  | 'all-images';

export const BUILTIN_COLLECTION_ORDER: BuiltinCollectionId[] = [
  'recently-added',
  'recently-viewed',
  'favourites',
  'picks',
  'unrated',
  'needs-ocr',
  'not-decomposed',
  'all-images',
];

/** `COL-10`: the human-readable labels. */
export const BUILTIN_COLLECTION_LABELS: Record<BuiltinCollectionId, string> = {
  'recently-added': 'Recently added',
  'recently-viewed': 'Recently viewed',
  'favourites': 'Favourites',
  'picks': 'Picks',
  'unrated': 'Unrated',
  'needs-ocr': 'Needs OCR',
  'not-decomposed': 'Not decomposed',
  'all-images': 'All images',
};

/** `COL-23`: which library types a built-in is available for. */
export const BUILTIN_COLLECTION_LIBRARY_TYPES: Record<BuiltinCollectionId, LibraryType[]> = {
  'recently-added': ['comfyui', 'comic'],
  'recently-viewed': ['comfyui', 'comic'],
  'favourites': ['comfyui', 'comic'],
  'picks': ['comfyui', 'comic'],
  'unrated': ['comfyui', 'comic'],
  'needs-ocr': ['comic'],
  'not-decomposed': ['comic'],
  'all-images': ['comfyui', 'comic'],
};

/** `COL-11` / `COL-12`..`COL-18`: the filter predicate for each built-in.
 *
 * Returns an `ExploreFilters` object that represents the collection's query.
 * The calling code merges this with the user's active filters (AND-combination).
 *
 * `recentDays` comes from the `collections.recentDays` setting (default 30).
 */
export function builtinCollectionFilters(
  id: BuiltinCollectionId,
  libraryType: LibraryType,
  recentDays: number,
): ExploreFilters {
  const base: ExploreFilters = {
    model: [],
    lora: [],
    sampler: [],
    minWidth: null,
    minHeight: null,
    hasWorkflow: null,
    favourite: false,
    ratingAtLeast: 0,
    tags: [],
    thumbnailStage: 'any',
    metadataStage: 'any',
    embeddingStage: 'any',
    panels: 'any',
    text: 'any',
    reviewed: 'any',
    flag: 'any',
    // Quick Filters off — built-ins don't carry QFL state
    qfFavourite: false,
    qfRated4Plus: false,
    qfPicks: false,
    qfIncomplete: { enabled: false, stage: 'any' },
    qfFailed: false,
  };

  // Every collection implicitly adds `hidden = false` (FLG-02).
  // This is enforced by the source's `hidden: 'exclude'` default.

  switch (id) {
    case 'recently-added': {
      // `COL-12` / `IMP-02`: `catalogued_at` in the last N days AND
      // `import_batch_kind = discovered`.
      // The fixture encodes this as: importBatchKind === 'discovered' AND
      // cataloguedAt within the window.
      // A real backend would translate this to a WHERE clause.
      // For the fixture, we return a special marker that the source understands.
      return {
        ...base,
        // Mark this as a "recently-added" built-in so the source applies the
        // correct date + batch kind filter. The source's `items` method checks
        // for this.
        _builtin: 'recently-added',
        _recentDays: recentDays,
      } as ExploreFilters & { _builtin: string; _recentDays: number };
    }

    case 'recently-viewed': {
      // `COL-13`: `last_viewed_at` in the last N days.
      // The fixture doesn't track last_viewed_at, so this returns a marker.
      return {
        ...base,
        _builtin: 'recently-viewed',
        _recentDays: recentDays,
      } as ExploreFilters & { _builtin: string; _recentDays: number };
    }

    case 'favourites': {
      // `COL-14`: `favourite = true`
      return { ...base, favourite: true };
    }

    case 'picks': {
      // `COL-15`: `flag = pick`
      return { ...base, flag: 'pick' };
    }

    case 'unrated': {
      // `COL-16`: `rating = 0` — this is `ratingAtLeast: 1` inverted.
      // We use `ratingAtLeast: 0` (which is the default) and the source
      // interprets a special marker.
      return {
        ...base,
        _builtin: 'unrated',
      } as ExploreFilters & { _builtin: string };
    }

    case 'needs-ocr': {
      // `COL-17`: comic only, `ocrStatus = none` or `needsReview`
      if (libraryType !== 'comic') return base;
      return {
        ...base,
        _builtin: 'needs-ocr',
      } as ExploreFilters & { _builtin: string };
    }

    case 'not-decomposed': {
      // `COL-18`: comic only, `panelStatus = not-decomposed`
      if (libraryType !== 'comic') return base;
      return {
        ...base,
        _builtin: 'not-decomposed',
      } as ExploreFilters & { _builtin: string };
    }

    case 'all-images': {
      // `COL-10`: no filter — the default view
      return base;
    }
  }
}

/** `COL-23`: filter the built-in list by library type. */
export function availableBuiltins(libraryType: LibraryType): BuiltinCollectionId[] {
  return BUILTIN_COLLECTION_ORDER.filter((id) =>
    BUILTIN_COLLECTION_LIBRARY_TYPES[id].includes(libraryType),
  );
}

/** `COL-11`: the rule-engine additions that built-ins rely on. */
export const BUILTIN_RULE_ENGINE_ADDITIONS = {
  // Relative date on `catalogued_at` and `last_viewed_at`
  relativeDate: true,
  // `is set` / `is not set`
  isSet: true,
  // `stage status is any of …` per stage
  stageStatus: true,
  // `stage incomplete over the applicable stage set` (QFL-03)
  stageIncomplete: true,
  // `flag equals`
  flagEquals: true,
} as const;