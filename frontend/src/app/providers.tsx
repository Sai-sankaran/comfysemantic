import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, invoke } from '../api';
import { applyAppearance, cacheAppearance } from './appearance';
import { DEFAULT_SEARCH_SOURCES, EMPTY_FILTERS, SEARCH_SOURCES } from '../types';
import type { AppSettings } from '../types';
import type {
  CatalogFilters,
  Density,
  Facets,
  LibraryRecord,
  SearchSource,
  SettingsInfo,
  Theme,
  ThumbFit,
} from '../types';

type LibraryContextValue = {
  libraries: LibraryRecord[];
  libraryId: string | undefined;
  activeLibrary: LibraryRecord | null;
  settings: SettingsInfo | null;
  ready: boolean;
  fatal: string | null;
  busy: string | null;
  filters: CatalogFilters;
  sources: SearchSource[];
  facets: Facets | null;
  thumbFit: ThumbFit;
  setBusy: (s: string | null) => void;
  setFilters: (f: CatalogFilters) => void;
  setSources: (s: SearchSource[]) => void;
  setThumbFit: (v: ThumbFit) => void;
  /**
   * The canonical application-wide settings, or null until loaded. Every
   * durable preference has exactly one value, shared by Settings and by the
   * per-tab quick controls that read `appSettings` and call
   * `updateAppSetting`.
   */
  appSettings: AppSettings | null;
  updateAppSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => Promise<void>;
  clearFilters: () => void;
  refreshFacets: () => Promise<void>;
  reportFatal: (msg: string) => void;
  selectLibrary: (id: string) => void;
  refreshLibraries: () => Promise<void>;
  reloadSettings: () => Promise<void>;
  init: () => Promise<void>;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

const THUMB_FIT_KEY = 'comfypanel.thumbFit';

/**
 * Read the legacy localStorage thumbnail preference, for one-way adoption.
 *
 * `comfypanel.thumbFit` was the only application-wide durable preference, and
 * it lived in browser storage - unreachable by the backend, not resettable from
 * Settings, and not covered by a catalog backup. It is no longer the owner.
 * The value is read exactly once, handed to the canonical store, and the key is
 * deleted; see `adoptLegacySettings`.
 */
function readLegacyThumbFit(): ThumbFit | null {
  try {
    const raw = localStorage.getItem(THUMB_FIT_KEY);
    if (raw === 'crop' || raw === 'contain' || raw === 'fill') return raw;
  } catch {
    // localStorage may be unavailable; nothing to migrate.
  }
  return null;
}

function clearLegacyThumbFit(): void {
  try {
    localStorage.removeItem(THUMB_FIT_KEY);
  } catch {
    // Non-fatal: the canonical value is already stored.
  }
}

function normalizeSources(raw: unknown): SearchSource[] {
  // Unknown names are dropped rather than forwarded: the backend ignores them,
  // but showing a dead chip in the UI is worse than not showing it. An empty
  // or all-invalid list falls back to the default, because a query with no
  // source selected would silently return nothing.
  if (!Array.isArray(raw)) return [...DEFAULT_SEARCH_SOURCES];
  const valid = SEARCH_SOURCES.filter(
    (s) => (raw as unknown[]).includes(s),
  ) as SearchSource[];
  return valid.length > 0 ? valid : [...DEFAULT_SEARCH_SOURCES];
}

function normalizeFilters(raw: Partial<CatalogFilters> | null | undefined): CatalogFilters {
  // Stale or hand-edited prefs must not break the UI: every list field falls
  // back to [], every scalar to '', and an unknown key is dropped. A saved
  // blob from an older build therefore loads cleanly instead of throwing.
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x !== '') : [];
  const text = (v: unknown): string => (typeof v === 'string' ? v : '');
  return {
    kinds: list(raw?.kinds),
    checkpoints: list(raw?.checkpoints),
    samplers: list(raw?.samplers),
    loras: list(raw?.loras),
    schedulers: list(raw?.schedulers),
    extensions: list(raw?.extensions),
    formats: list(raw?.formats),
    seed: text(raw?.seed),
    steps: text(raw?.steps),
    cfg: text(raw?.cfg),
    denoise: text(raw?.denoise),
    min_width: text(raw?.min_width),
    max_width: text(raw?.max_width),
    min_height: text(raw?.min_height),
    max_height: text(raw?.max_height),
    ink_category: list(raw?.ink_category),
    ocr_status: list(raw?.ocr_status),
    dialogue_status: list(raw?.dialogue_status),
    attribution_state: list(raw?.attribution_state),
    ...(raw?.has_ocr === true || raw?.has_ocr === false ? { has_ocr: raw.has_ocr } : {}),
  };
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsInfo | null>(null);
  const [libraries, setLibraries] = useState<LibraryRecord[]>([]);
  const [libraryId, setLibraryId] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<CatalogFilters>(EMPTY_FILTERS);
  // Which text sources a keyword query draws on. Persisted with the filters
  // because they are the same kind of per-library preference.
  const [sources, setSourcesState] = useState<SearchSource[]>(DEFAULT_SEARCH_SOURCES);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [appSettings, setAppSettingsState] = useState<AppSettings | null>(null);
  /**
   * The thumbnail mode is *derived* from the canonical store rather than
   * mirrored into a second piece of state. Mirroring needed an effect to copy
   * one into the other, which is exactly the kind of synchronisation that lets
   * two copies drift apart.
   */
  const thumbFit: ThumbFit = appSettings?.thumb_fit ?? 'crop';
  const prefsTimer = useRef<number | null>(null);

  /**
   * Load the canonical settings once, adopting any legacy localStorage value
   * that the user had actually chosen.
   *
   * Adoption is guarded by `explicit`: a key the user already set through the
   * canonical store is never overwritten, so this cannot undo a real choice on
   * a machine that happens to still hold a stale localStorage key.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.getAppSettings();
        if (cancelled) return;
        setAppSettingsState(res.settings);

        const legacy = readLegacyThumbFit();
        if (legacy !== null && !res.explicit.thumb_fit) {
          const merged = await api.setAppSettings({ thumb_fit: legacy });
          if (!cancelled) setAppSettingsState(merged.settings);
        }
        // The canonical store now owns the value either way.
        if (legacy !== null) clearLegacyThumbFit();
      } catch {
        // A settings read failure must not block the application; the
        // documented defaults above apply.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setThumbFit = useCallback((v: ThumbFit) => {
    // Optimistic, then confirmed: the UI reflects the choice immediately and
    // the canonical value is the one that survives a restart.
    setAppSettingsState((prev) => ({ ...(prev ?? {
      thumb_fit: 'crop' as ThumbFit,
      ocr_overlays_visible: true,
      ocr_reading_order_labels: true,
      theme: 'dark' as Theme,
      density: 'comfortable' as Density,
      text_scale: 100,
    }), thumb_fit: v }));
    void api.setAppSettings({ thumb_fit: v }).then(
      (res) => setAppSettingsState(res.settings),
      () => { /* the next load reconciles */ },
    );
  }, []);

  /**
   * Update one canonical setting. Every quick control goes through here, which
   * is what keeps them and Settings pointing at the same value.
   */
  const updateAppSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setAppSettingsState((prev) => (prev ? { ...prev, [key]: value } : prev));
      const res = await api.setAppSettings({ [key]: value } as Partial<AppSettings>);
      setAppSettingsState(res.settings);
    },
    [],
  );

  useEffect(() => {
    document.documentElement.dataset.thumbfit = thumbFit;
  }, [thumbFit]);

  useEffect(() => {
    // Apply the canonical appearance to the root element (tokens.css keys off
    // `data-theme`/`data-density` and the `--text-scale` multiplier), then write
    // the cache so the next launch can apply it before first paint (main.tsx).
    //
    // While the settings are loading - or if that read failed - nothing is
    // applied here on purpose. main.tsx has already applied the cached
    // appearance, which is the last *canonical* value and a better guess than
    // forcing the defaults over it. With no cache the root has no attribute, so
    // the :root defaults (dark / comfortable / 100%) apply anyway.
    if (!appSettings) return;
    const next = {
      theme: appSettings.theme,
      density: appSettings.density,
      text_scale: appSettings.text_scale,
    };
    applyAppearance(next);
    cacheAppearance(next);
  }, [appSettings]);

  const refreshLibraries = useCallback(async () => {
    try {
      const res = await api.listLibraries();
      setLibraries(res.libraries);
      // Grant the webview read access to each library root so full-size images
      // (not just cached thumbnails) can be previewed after an app restart.
      for (const l of res.libraries) {
        try {
          console.log('[refreshLibraries] Granting library root:', l.root_path);
          await api.allowDirectory(l.root_path);
          console.log('[refreshLibraries] Library root granted:', l.root_path);
        } catch (e) {
          console.error('[refreshLibraries] Failed to grant library root:', l.root_path, e);
        }
      }
      // Also grant cache directory for thumbnails (handles worker restarts)
      try {
        const settings = await api.getSettings();
        if (settings?.cache_dir) {
          console.log('[refreshLibraries] Granting cache directory:', settings.cache_dir);
          await api.allowDirectory(settings.cache_dir);
          console.log('[refreshLibraries] Cache directory granted successfully');
        }
      } catch (e) {
        console.warn('[refreshLibraries] Failed to grant cache directory:', e);
      }
      // Keep the selection valid. `undefined` means "not chosen yet" (default to
      // the first library); `''` is the explicit "All libraries" scope and must
      // be preserved. A selected library that disappeared falls back to "all".
      setLibraryId((cur) => {
        if (cur === undefined) return res.libraries[0]?.id;
        if (cur === '') return '';
        return res.libraries.some((l) => l.id === cur) ? cur : '';
      });
    } catch (e) {
      setFatal(String(e));
    }
  }, []);

  const reloadSettings = useCallback(async () => {
    try {
      setSettings(await api.getSettings());
    } catch (e) {
      setFatal(String(e));
    }
  }, []);

  const init = useCallback(async () => {
    setFatal(null);
    setReady(false);
    try {
      await api.handshake();
      const s = await api.getSettings();
      setSettings(s);
      // Grant cache directory for thumbnails (portable mode fix)
      if (s?.cache_dir) {
        try {
          console.log('[init] Granting cache directory:', s.cache_dir);
          await invoke('allow_directory', { path: s.cache_dir });
          console.log('[init] Cache directory granted successfully');
        } catch (e) {
          console.error('[init] Failed to grant cache directory:', e);
        }
      } else {
        console.warn('[init] No cache_dir in settings:', s);
      }
      setReady(true);
      await refreshLibraries();
      // A job may already be running when the webview attaches.
      try {
        const st = await api.indexingStatus();
        if (st && (st as { running?: boolean }).running) setBusy('indexing');
      } catch {
        // Non-fatal: the status strip simply stays idle until the first event.
      }
    } catch (e) {
      setFatal(`Backend unavailable: ${String(e)}`);
    }
  }, [refreshLibraries]);

  useEffect(() => {
    void init();
  }, [init]);

  // The shell auto-restarts a crashed backend worker. Re-initialize so the UI
  // recovers without a manual app restart.
  useEffect(() => {
    const sub = api.onWorkerRestarted(() => {
      setFatal(null);
      void init();
    });
    return () => {
      sub.then((u) => u()).catch(() => undefined);
    };
  }, [init]);

  // Load auto-derived facets and the per-library saved filters whenever the
  // active scope changes.
  const loadFacetsAndPrefs = useCallback(async () => {
    const scoped = libraryId && libraryId !== '' ? libraryId : undefined;
    try {
      const f = await api.getFacets(scoped);
      setFacets(f.facets);
    } catch {
      setFacets(null);
    }
    if (scoped) {
      try {
        const prefs = await api.getLibraryPrefs(scoped);
        setFiltersState(normalizeFilters(prefs.filters));
        setSourcesState(normalizeSources(prefs.sources));
        return;
      } catch {
        // fall through to empty
      }
    }
    setFiltersState(EMPTY_FILTERS);
    setSourcesState(DEFAULT_SEARCH_SOURCES);
  }, [libraryId]);

  useEffect(() => {
    if (ready) void loadFacetsAndPrefs();
  }, [ready, loadFacetsAndPrefs]);

  // Filters and sources share one `library_prefs` row, so whichever writer
  // fires must send the *current* value of both. The refs are what make that
  // possible without making the debounced callback depend on `filters`, which
  // would re-arm the timer on every keystroke and never let it settle.
  const filtersRef = useRef(filters);
  const sourcesRef = useRef(sources);
  // Mirrored in an effect rather than during render: writing a ref while
  // rendering is not safe under concurrent rendering, because the render may
  // be thrown away while the write persists.
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  const savePrefs = useCallback(() => {
    const scoped = libraryId && libraryId !== '' ? libraryId : undefined;
    if (!scoped) return;
    // Debounce so rapid checkbox toggles collapse into one write.
    if (prefsTimer.current !== null) window.clearTimeout(prefsTimer.current);
    prefsTimer.current = window.setTimeout(() => {
      void api
        .setLibraryPrefs(scoped, filtersRef.current, sourcesRef.current)
        .catch(() => undefined);
    }, 400);
  }, [libraryId]);

  const setFilters = useCallback(
    (next: CatalogFilters) => {
      const normalized = normalizeFilters(next);
      setFiltersState(normalized);
      filtersRef.current = normalized;
      savePrefs();
    },
    [savePrefs],
  );

  const setSources = useCallback(
    (next: SearchSource[]) => {
      const normalized = normalizeSources(next);
      setSourcesState(normalized);
      sourcesRef.current = normalized;
      savePrefs();
    },
    [savePrefs],
  );

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), [setFilters]);

  const refreshFacets = useCallback(async () => {
    const scoped = libraryId && libraryId !== '' ? libraryId : undefined;
    try {
      const f = await api.getFacets(scoped);
      setFacets(f.facets);
    } catch {
      // ignore
    }
  }, [libraryId]);

  // Own the indexing run-state here so the status strip is correct on every
  // screen and survives navigation away from (and back to) the Indexing Center.
  useEffect(() => {
    const subs = [
      api.onIndexingProgress((p) => {
        const running = p.status !== 'completed' && p.status !== 'cancelled';
        setBusy(running ? 'indexing' : null);
      }),
      api.onIndexingFinished(() => {
        setBusy(null);
        void refreshLibraries();
        void refreshFacets();
      }),
      api.onIndexingError(() => setBusy(null)),
    ];
    return () => {
      subs.forEach((p) => p.then((u) => u()).catch(() => undefined));
    };
  }, [refreshLibraries, refreshFacets]);

  const activeLibrary = useMemo(
    () => libraries.find((l) => l.id === libraryId) ?? null,
    [libraries, libraryId],
  );

  const value = useMemo<LibraryContextValue>(
    () => ({
      libraries,
      libraryId,
      activeLibrary,
      settings,
      ready,
      fatal,
      busy,
      filters,
      sources,
      facets,
      thumbFit,
      setBusy,
      setFilters,
      setSources,
      setThumbFit,
      appSettings,
      updateAppSetting,
      clearFilters,
      refreshFacets,
      reportFatal: setFatal,
      selectLibrary: setLibraryId,
      refreshLibraries,
      reloadSettings,
      init,
    }),
    [
      libraries,
      libraryId,
      activeLibrary,
      settings,
      ready,
      fatal,
      busy,
      filters,
      sources,
      facets,
      thumbFit,
      setFilters,
      setSources,
      setThumbFit,
      appSettings,
      updateAppSetting,
      clearFilters,
      refreshFacets,
      refreshLibraries,
      reloadSettings,
      init,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return ctx;
}