// covers: SRC-01, SRC-02, SRC-09, SRC-15
import type { ExploreItem } from '../explore/exploreTypes';
import type { SearchMode, UnitScope } from '../../types';

/**
 * Search's typed data contract (design §6.2 / Appendix E).
 *
 * These types are the seam between the Search page and the backend. The page
 * depends only on `SearchSource`, so the fixture source and a backend source
 * are interchangeable without changing a line in the rendering code.
 */

/** `SRC-03`: parsed query tokens. */
export type SearchToken =
  | { kind: 'word'; value: string }
  | { kind: 'phrase'; value: string }
  | { kind: 'exclude'; value: string }
  | { kind: 'field'; field: string; value: string };

/** `SRC-03`: parsed query. */
export type ParsedQuery = {
  raw: string;
  tokens: SearchToken[];
};

/** `SRC-02`: search signal eligibility. */
export type SearchSignal = 'keyword' | 'semantic' | 'visual' | 'similar';

/** `SRC-07`: honest status of which signals ran. */
export type SignalStatus = {
  signal: SearchSignal;
  eligible: boolean;
  ran: boolean;
  count: number;
  reason?: string;
};

/** `SRC-06`: progressive results state. */
export type ProgressiveResultState = 'keyword' | 'merging' | 'complete';

/** `SRC-06`: re-ranking rule. */
export type RerankState = 'auto' | 'locked' | 'available';

/** `SRC-10`: sort order. */
export type SearchSort = 'relevance' | 'newest' | 'filename';

/** `SRC-14`: which libraries to search. */
export type SearchScope = 'active' | 'all';

/** `SRC-08`: a reference item for similar search. */
export type SearchReference = {
  itemId: string;
  filename: string;
  thumbnailUrl: string | null;
  libraryId: string;
  libraryName: string;
};

/** `SRC-14` / `D-62`: cross-library similar scope. */
export type CrossLibraryScope = 'same' | 'all' | string; // 'same' = same library type, 'all' = all libraries, or specific library ID

/** `SRC-11`: saved search. */
export type SavedSearch = {
  id: string;
  name: string;
  query: string;
  mode: SearchMode;
  scope: UnitScope;
  searchScope: SearchScope;
  libraryId: string;
  filters: Record<string, unknown>;
  sort: SearchSort;
  pinned: boolean;
  allLibraries: boolean;
  createdAt: string;
};

/** `SRC-12`: search history entry. */
export type SearchHistoryEntry = {
  id: string;
  query: string;
  mode: SearchMode;
  libraryId: string;
  createdAt: string;
};

/** `SRC-02`: the search request. */
export type SearchQuery = {
  query: string;
  mode: SearchMode;
  unitScope: UnitScope;
  searchScope: SearchScope;
  libraryId: string;
  libraryIds?: string[];
  sort: SearchSort;
  limit: number;
  cursor: string | null;
  reference?: SearchReference;
  /** `SRC-04`: which sources to search. */
  sources?: string[];
  /** `SRC-04`: similarity threshold (off by default). */
  similarityThreshold?: number;
};

/** `SRC-09`: search results use the shared gallery. */
export type SearchResultPage = {
  items: ExploreItem[];
  total: number;
  cursor: string | null;
  signals: SignalStatus[];
  state: ProgressiveResultState;
  rerankState: RerankState;
  /** `SRC-07`: signal line text. */
  signalLine: string;
  /** `SRC-13`: no matches suggestions. */
  suggestions: string[];
  /** `SRC-14`: skipped libraries. */
  skippedLibraries: Array<{ name: string; reason: string }>;
};

/** The seam: the Search page knows only this interface. */
export type SearchSource = {
  /**
   * True when the items are fixture data rather than a real catalog. The toolbar
   * shows this, so a fixture can never be mistaken for a library's contents.
   */
  isFixtureData?: boolean;
  libraryType(libraryId: string): 'comfyui' | 'comic';
  libraryName(libraryId: string): string;
  /** `SRC-02`: run a search. */
  search(query: SearchQuery): Promise<SearchResultPage>;
  /** `SRC-06`: poll for progressive results. */
  pollProgressive(queryId: string): Promise<SearchResultPage | null>;
  /** `SRC-11`: saved searches. */
  savedSearches(libraryId: string): Promise<SavedSearch[]>;
  saveSearch(search: Omit<SavedSearch, 'id' | 'createdAt'>): Promise<SavedSearch>;
  deleteSavedSearch(id: string): Promise<void>;
  /** `SRC-12`: search history. */
  searchHistory(libraryId: string): Promise<SearchHistoryEntry[]>;
  clearSearchHistory(libraryId: string): Promise<void>;
  /** `SRC-08`: find similar. */
  findSimilar(reference: SearchReference, libraryId: string, scope: UnitScope): Promise<SearchResultPage>;
};