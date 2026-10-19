// covers: SRC-01, SRC-02, SRC-03, SRC-04, SRC-05, SRC-06, SRC-07, SRC-08, SRC-09, SRC-10, SRC-11, SRC-12, SRC-13, SRC-14, SRC-15, TST-38, TST-42, TST-43, TST-44
import type {
  SearchSource,
  SearchQuery,
  SearchResultPage,
  SavedSearch,
  SearchHistoryEntry,
  SearchReference,
  SignalStatus,
  ProgressiveResultState,
} from './SearchTypes';
import type { ExploreItem, ExploreQuery } from '../explore/exploreTypes';
import { EMPTY_FILTERS } from '../explore/exploreTypes';
import { FIXTURE_SOURCE, FIXTURE_LIBRARIES } from '../explore/exploreFixtures';
import type { UnitScope } from '../../types';

/**
 * Search fixtures — deterministic, labelled as fixture data.
 *
 * Every result carries `isFixtureData: true` so the UI can show the fixture
 * banner. The SearchSource interface is the seam: the real backend replaces
 * this file's exports, and no screen code changes.
 */

const FIXTURE_SEARCH_SIGNALS: Record<string, SignalStatus[]> = {
  default: [
    { signal: 'keyword', eligible: true, ran: true, count: 412 },
    { signal: 'semantic', eligible: true, ran: true, count: 210 },
    { signal: 'visual', eligible: false, ran: false, count: 0, reason: 'No visual index' },
    { signal: 'similar', eligible: false, ran: false, count: 0, reason: 'No reference item' },
  ],
  keywordOnly: [
    { signal: 'keyword', eligible: true, ran: true, count: 412 },
    { signal: 'semantic', eligible: false, ran: false, count: 0, reason: 'Runtime stopped' },
    { signal: 'visual', eligible: false, ran: false, count: 0, reason: 'Runtime stopped' },
    { signal: 'similar', eligible: false, ran: false, count: 0, reason: 'No reference item' },
  ],
  noMatches: [
    { signal: 'keyword', eligible: true, ran: true, count: 0 },
    { signal: 'semantic', eligible: true, ran: true, count: 0 },
    { signal: 'visual', eligible: false, ran: false, count: 0, reason: 'No visual index' },
    { signal: 'similar', eligible: false, ran: false, count: 0, reason: 'No reference item' },
  ],
};

function makeSignalLine(signals: SignalStatus[]): string {
  const parts: string[] = [];
  for (const s of signals) {
    if (s.ran) {
      parts.push(`${s.signal} — ${s.count}`);
    } else if (s.eligible) {
      parts.push(`${s.signal} — ${s.count} (pending)`);
    }
  }
  return parts.join(' · ');
}

function makeSuggestions(query: string, mode: string): string[] {
  if (!query) return [];
  const suggestions: string[] = [];
  suggestions.push('Clear filters');
  if (mode !== 'smart') suggestions.push('Switch to Smart');
  suggestions.push('Include panels');
  suggestions.push('Include notes & tags');
  suggestions.push('Search all libraries');
  return suggestions;
}

export function createFixtureSearchSource(): SearchSource {
  const savedSearches: SavedSearch[] = [];
  const searchHistory: SearchHistoryEntry[] = [];

  return {
    isFixtureData: true,

    libraryType(libraryId: string): 'comfyui' | 'comic' {
      const lib = FIXTURE_LIBRARIES.find((l) => l.id === libraryId);
      return lib?.type ?? 'comfyui';
    },

    libraryName(libraryId: string): string {
      const lib = FIXTURE_LIBRARIES.find((l) => l.id === libraryId);
      return lib?.name ?? 'Unknown';
    },

    async search(query: SearchQuery): Promise<SearchResultPage> {
      const signals = query.query.includes('no-match')
        ? FIXTURE_SEARCH_SIGNALS.noMatches
        : query.query.includes('keyword-only')
        ? FIXTURE_SEARCH_SIGNALS.keywordOnly
        : FIXTURE_SEARCH_SIGNALS.default;

      const total = signals.reduce((sum, s) => sum + (s.ran ? s.count : 0), 0) || 0;
      const effectiveTotal = query.query.includes('no-match') ? 0 : Math.min(total, 412);

      // Fetch items from the explore source
      let items: ExploreItem[] = [];
      if (effectiveTotal > 0) {
        const exploreQuery: ExploreQuery = {
          libraryId: query.libraryId,
          folderId: null,
          includeSubfolders: true,
          scope: query.unitScope === 'panel' ? 'panels' : 'pages',
          sort: 'mtime_desc',
          sortDescending: true,
          filters: EMPTY_FILTERS,
          limit: Math.min(query.limit, 60),
          cursor: null,
          hidden: 'exclude',
          hiddenCount: 0,
        };
        try {
          const page = await FIXTURE_SOURCE.page(exploreQuery);
          items = page.items.slice(0, Math.min(query.limit, page.items.length));
        } catch {
          items = [];
        }
      }

      // Record search history
      if (query.query.trim()) {
        searchHistory.unshift({
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          query: query.query,
          mode: query.mode,
          libraryId: query.libraryId,
          createdAt: new Date().toISOString(),
        });
        // Keep last 50
        if (searchHistory.length > 50) searchHistory.length = 50;
      }

      const state: ProgressiveResultState =
        query.mode === 'hybrid' ? 'merging' : 'complete';

      return {
        items,
        total: effectiveTotal,
        cursor: items.length < effectiveTotal ? `cursor-${items.length}` : null,
        signals,
        state,
        rerankState: 'auto',
        signalLine: makeSignalLine(signals),
        suggestions: effectiveTotal === 0 ? makeSuggestions(query.query, query.mode) : [],
        skippedLibraries: [],
      };
    },

    async pollProgressive(_queryId: string): Promise<SearchResultPage | null> {
      // Simulate progressive merge completing
      return null;
    },

    async savedSearches(libraryId: string): Promise<SavedSearch[]> {
      return savedSearches.filter((s) => s.allLibraries || s.libraryId === libraryId);
    },

    async saveSearch(search: Omit<SavedSearch, 'id' | 'createdAt'>): Promise<SavedSearch> {
      const saved: SavedSearch = {
        ...search,
        id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
      };
      savedSearches.push(saved);
      return saved;
    },

    async deleteSavedSearch(id: string): Promise<void> {
      const idx = savedSearches.findIndex((s) => s.id === id);
      if (idx >= 0) savedSearches.splice(idx, 1);
    },

    async searchHistory(libraryId: string): Promise<SearchHistoryEntry[]> {
      return searchHistory.filter((h) => h.libraryId === libraryId);
    },

    async clearSearchHistory(libraryId: string): Promise<void> {
      const toRemove = searchHistory.filter((h) => h.libraryId === libraryId);
      for (const entry of toRemove) {
        const idx = searchHistory.indexOf(entry);
        if (idx >= 0) searchHistory.splice(idx, 1);
      }
    },

    async findSimilar(reference: SearchReference, libraryId: string, scope: UnitScope): Promise<SearchResultPage> {
      const referenceLibType = FIXTURE_LIBRARIES.find((l) => l.id === reference.libraryId)?.type ?? 'comfyui';
      const targetLibType = FIXTURE_LIBRARIES.find((l) => l.id === libraryId)?.type ?? 'comfyui';

      // `SRC-08` / `D-62`: cross-library similar
      // From a ComfyUI image, choosing a comic library returns that library's panels
      const isCrossLibrary = referenceLibType !== targetLibType;
      const effectiveScope = isCrossLibrary && targetLibType === 'comic' ? 'panels' : scope;

      const signals: SignalStatus[] = [
        { signal: 'similar', eligible: true, ran: true, count: 50 },
      ];
      let items: ExploreItem[] = [];
      try {
        const exploreQuery: ExploreQuery = {
          libraryId,
          folderId: null,
          includeSubfolders: true,
          scope: effectiveScope === 'panel' ? 'panels' : 'pages',
          sort: 'mtime_desc',
          sortDescending: true,
          filters: EMPTY_FILTERS,
          limit: 50,
          cursor: null,
          hidden: 'exclude',
          hiddenCount: 0,
        };
        const page = await FIXTURE_SOURCE.page(exploreQuery);
        items = page.items.slice(0, 50);
      } catch {
        items = [];
      }

      const signalLine = isCrossLibrary
        ? `Similar (cross-library) — ${items.length} ${effectiveScope}`
        : `Similar — ${items.length}`;

      return {
        items,
        total: items.length,
        cursor: null,
        signals,
        state: 'complete',
        rerankState: 'auto',
        signalLine,
        suggestions: [],
        skippedLibraries: [],
      };
    },
  };
}

export const FIXTURE_SEARCH_SOURCE = createFixtureSearchSource();