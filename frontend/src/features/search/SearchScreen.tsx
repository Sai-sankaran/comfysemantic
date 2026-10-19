// covers: SRC-01, SRC-02, SRC-03, SRC-04, SRC-05, SRC-06, SRC-07, SRC-08, SRC-09, SRC-10, SRC-11, SRC-12, SRC-13, SRC-14, SRC-15
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, EmptyState, Input, SegmentedControl, Select } from '../../components/ui';
import type { ExploreItem } from '../explore/exploreTypes';
import type {
  SearchSource,
  SearchQuery,
  SearchResultPage,
  SavedSearch,
  SearchHistoryEntry,
  SearchReference,
  SearchScope,
  SearchSort,
} from './SearchTypes';
import type { SearchMode, UnitScope } from '../../types';
import { SearchReferenceChip } from './SearchReferenceChip';

export type SearchScreenProps = {
  source: SearchSource;
  libraryId: string;
  libraryType: 'comfyui' | 'comic';
  density: 'compact' | 'comfortable' | 'spacious';
  restoreScrollTop?: number | null;
  onOpenViewer?: (item: ExploreItem) => void;
  onNotify?: (message: string) => void;
  // Scenario initial state (for dev gallery)
  initialQuery?: string;
  initialMode?: SearchMode;
  initialUnitScope?: UnitScope;
  initialSearchScope?: SearchScope;
  initialReference?: SearchReference | null;
};

const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: 'hybrid', label: 'Smart' },
  { value: 'keyword', label: 'Exact' },
  { value: 'semantic', label: 'Semantic' },
  { value: 'visual', label: 'Visual' },
  { value: 'similar', label: 'Similar' },
  { value: 'comic_text', label: 'Comic text' },
];
export function SearchScreen({
  source,
  libraryId,
  libraryType: _libraryType,
  density: _density,
  restoreScrollTop: _restoreScrollTop,
  onOpenViewer: _onOpenViewer,
  onNotify: _onNotify,
  initialQuery,
  initialMode,
  initialUnitScope,
  initialSearchScope,
  initialReference,
}: SearchScreenProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [mode, setMode] = useState<SearchMode>(initialMode ?? 'hybrid');
  const [unitScope, setUnitScope] = useState<UnitScope>(initialUnitScope ?? 'image');
  const [searchScope, setSearchScope] = useState<SearchScope>(initialSearchScope ?? 'active');
  const [sort, setSort] = useState<SearchSort>('relevance');
  const [reference, setReference] = useState<SearchReference | null>(initialReference ?? null);
  const [results, setResults] = useState<SearchResultPage | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [showHistory, _setShowHistory] = useState(false);
  const [allLibraries, _setAllLibraries] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved searches and history
  useEffect(() => {
    source.savedSearches(libraryId).then(setSavedSearches).catch(() => {});
    source.searchHistory(libraryId).then(setHistory).catch(() => {});
  }, [source, libraryId]);

  // Run initial search if query provided (for dev gallery scenarios)
  useEffect(() => {
    if (initialQuery !== undefined) {
      if (initialQuery.trim() || initialReference) {
        runSearch(initialQuery, initialMode ?? 'hybrid');
      } else {
        setResults(null);
      }
    }
  }, [initialQuery, initialMode, initialReference]);

  // Handle mode change
  const handleModeChange = useCallback((newMode: SearchMode) => {
    setMode(newMode);
    if (newMode === 'similar' && !reference) {
      // Prompt user to pick a reference
    }
  }, [reference]);

  // Run search
  const runSearch = useCallback(
    async (q: string, m: SearchMode) => {
      if (!q.trim() && !reference) {
        setResults(null);
        return;
      }
      setRunning(true);
      setErr(null);
      try {
        const searchQuery: SearchQuery = {
          query: q,
          mode: m,
          unitScope,
          searchScope: allLibraries ? 'all' : 'active',
          libraryId,
          libraryIds: allLibraries ? [libraryId] : undefined,
          sort,
          limit: 60,
          cursor: null,
          reference: reference ?? undefined,
        };
        const page = await source.search(searchQuery);
        setResults(page);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Search failed');
      } finally {
        setRunning(false);
      }
    },
    [source, libraryId, unitScope, sort, allLibraries, reference],
  );

  // Debounced search for Exact mode
  useEffect(() => {
    if (mode === 'keyword' && query.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        runSearch(query, 'keyword');
      }, 150);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
  }, [query, mode, runSearch]);

  // Enter key triggers Smart search
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (mode === 'hybrid' || mode === 'semantic' || mode === 'visual') {
          runSearch(query, mode);
        }
      }
    },
    [query, mode, runSearch],
  );

  // Removed unused handleFindSimilar - will be added when similar search is fully implemented

  const clearReference = useCallback(() => {
    setReference(null);
    setResults(null);
  }, []);

  // Convert search results to ExploreSource-compatible for the gallery
  // For now, we render results directly
  const hasResults = results && results.items.length > 0;
  const noResults = results && results.items.length === 0 && !running;

  return (
    <div className="search-screen">
      {/* Search bar */}
      <div className="search-bar">
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          aria-label="Search query"
        />
        <SegmentedControl
          value={mode}
          onChange={(v) => handleModeChange(v as SearchMode)}
          options={SEARCH_MODES.map((m) => ({ value: m.value, label: m.label }))}
        />
        <Select
          value={unitScope}
          onChange={(e) => setUnitScope(e.target.value as UnitScope)}
          options={[
            { value: 'image', label: 'Images' },
            { value: 'panel', label: 'Panels' },
          ]}
        />
        <Select
          value={searchScope}
          onChange={(e) => setSearchScope(e.target.value as SearchScope)}
          options={[
            { value: 'active', label: 'This library' },
            { value: 'all', label: 'All libraries' },
          ]}
        />
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as SearchSort)}
          options={[
            { value: 'relevance', label: 'Relevance' },
            { value: 'newest', label: 'Newest' },
            { value: 'filename', label: 'Filename' },
          ]}
        />
      </div>

      {/* Reference chip for similar search */}
      {reference && (
        <SearchReferenceChip reference={reference} onClear={clearReference} />
      )}

      {/* Signal line */}
      {results && (
        <div className="search-signal-line" role="status">
          {results.signalLine}
          {results.state === 'merging' && ' (merging...)'}
        </div>
      )}

      {/* Error */}
      {err && (
        <EmptyState
          title="Search failed"
          body={err}
          action={<Button onClick={() => runSearch(query, mode)}>Retry</Button>}
        />
      )}

      {/* Loading */}
      {running && !results && (
        <EmptyState title="Searching..." body="Running search query" />
      )}

      {/* No results */}
      {noResults && (
        <EmptyState
          title={`No matches for "${query}"`}
          body={`in ${searchScope === 'all' ? 'all libraries' : source.libraryName(libraryId)}`}
          action={
            <div className="search-suggestions">
              {results?.suggestions.map((s) => (
                <Button key={s} variant="ghost">
                  {s}
                </Button>
              ))}
            </div>
          }
        />
      )}

      {/* Results */}
      {hasResults && (
        <div className="search-results">
          {results?.skippedLibraries && results.skippedLibraries.length > 0 && (
            <div className="search-skipped">
              Skipped: {results.skippedLibraries.map((s) => `${s.name} (${s.reason})`).join(', ')}
            </div>
          )}
          {/* For now, render results as a simple list. In a full implementation,
              this would use the shared gallery (ExploreScreen). */}
          <div className="search-results-grid">
            {results?.items.map((item) => (
              <div key={item.id} className="search-result-item">
                <img
                  src={item.thumbnailUrl ?? ''}
                  alt={item.filename}
                  width={item.width ?? 100}
                  height={item.height ?? 100}
                />
                <span>{item.filename}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved searches */}
      {savedSearches.length > 0 && (
        <div className="search-saved">
          <h3>Saved searches</h3>
          {savedSearches.map((s) => (
            <Button
              key={s.id}
              variant="ghost"
              onClick={() => {
                setQuery(s.query);
                setMode(s.mode);
                runSearch(s.query, s.mode);
              }}
            >
              {s.name}
            </Button>
          ))}
        </div>
      )}

      {/* History */}
      {showHistory && history.length > 0 && (
        <div className="search-history">
          <h3>Recent searches</h3>
          {history.map((h) => (
            <Button
              key={h.id}
              variant="ghost"
              onClick={() => {
                setQuery(h.query);
                setMode(h.mode);
                runSearch(h.query, h.mode);
              }}
            >
              {h.query}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}