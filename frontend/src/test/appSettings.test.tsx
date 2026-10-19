/**
 * The canonical settings store, exercised through the real provider.
 *
 * These tests render the actual `LibraryProvider` against a mocked `api`, so
 * what is verified is the shipped adoption and write path - not a restatement
 * of the rule. An earlier version of this file re-implemented the logic inside
 * the test, which would have passed even if the provider were wrong.
 *
 * The behaviour that matters:
 *
 *  - a durable preference is read from the canonical store, not from component
 *    state or a private browser key;
 *  - a value the user had already chosen survives a restart;
 *  - a legacy `localStorage` value is adopted once, and never overwrites a
 *    value the user has since chosen through the canonical store;
 *  - `updateAppSetting` is the single write path the quick controls share.
 *
 * The backend is mocked at the `api` boundary; no catalog is opened.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const DEFAULTS = {
  thumb_fit: 'crop',
  ocr_overlays_visible: true,
  ocr_reading_order_labels: true,
  theme: 'dark',
  density: 'comfortable',
  text_scale: 100,
};

type Backend = {
  store: Record<string, unknown>;
  explicit: Set<string>;
  setCalls: Record<string, unknown>[];
  getAppSettings: ReturnType<typeof vi.fn>;
  setAppSettings: ReturnType<typeof vi.fn>;
  getSettings: ReturnType<typeof vi.fn>;
  listLibraries: ReturnType<typeof vi.fn>;
  getFacets: ReturnType<typeof vi.fn>;
  getLibraryPrefs: ReturnType<typeof vi.fn>;
  setLibraryPrefs: ReturnType<typeof vi.fn>;
  onIndexingFinished: ReturnType<typeof vi.fn>;
  onIndexingError: ReturnType<typeof vi.fn>;
  onIndexingProgress: ReturnType<typeof vi.fn>;
  onWorkerRestarted: ReturnType<typeof vi.fn>;
  handshake: ReturnType<typeof vi.fn>;
  indexingStatus: ReturnType<typeof vi.fn>;
  allowDirectory: ReturnType<typeof vi.fn>;
};

function backend(initial: Record<string, unknown> = {}): Backend {
  const store: Record<string, unknown> = { ...initial };
  const explicit = new Set(Object.keys(initial));
  const setCalls: Record<string, unknown>[] = [];
  const shape = () => ({
    settings: { ...DEFAULTS, ...store },
    defaults: DEFAULTS,
    explicit: Object.fromEntries(
      Object.keys(DEFAULTS).map((k) => [k, explicit.has(k)]),
    ),
  });
  return {
    store,
    explicit,
    setCalls,
    getAppSettings: vi.fn(async () => shape()),
    setAppSettings: vi.fn(async (partial: Record<string, unknown>) => {
      setCalls.push(partial);
      Object.assign(store, partial);
      Object.keys(partial).forEach((k) => explicit.add(k));
      return shape();
    }),
    getSettings: vi.fn(async () => ({ capabilities: null, profiles: {} })),
    listLibraries: vi.fn(async () => ({ libraries: [], presets: [] })),
    getFacets: vi.fn(async () => ({ facets: null })),
    getLibraryPrefs: vi.fn(async () => ({ filters: {}, sources: null })),
    setLibraryPrefs: vi.fn(async () => ({ status: 'saved' })),
    onIndexingFinished: vi.fn(async () => () => {}),
    onIndexingError: vi.fn(async () => () => {}),
    onIndexingProgress: vi.fn(async () => () => {}),
    onWorkerRestarted: vi.fn(async () => () => {}),
    handshake: vi.fn(async () => ({ ok: true })),
    indexingStatus: vi.fn(async () => ({ status: 'idle' })),
    allowDirectory: vi.fn(async () => undefined),
  };
}

const LEGACY_KEY = 'comfypanel.thumbFit';

function stubLocalStorage(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => { data[k] = v; },
      removeItem: (k: string) => { delete data[k]; },
      clear: () => { Object.keys(data).forEach((k) => delete data[k]); },
    },
  });
  return data;
}

let current: Backend;

const { readShellState, writeShellState } = vi.hoisted(() => ({
  readShellState: vi.fn(async () => null),
  writeShellState: vi.fn(async (_state: unknown) => undefined),
}));

vi.mock('../platform/transport', () => ({
  readShellState: () => readShellState(),
  writeShellState: (s: unknown) => writeShellState(s),
}));

async function mountProvider() {
  vi.resetModules();
  vi.doMock('../api', () => ({
    api: {
      getAppSettings: current.getAppSettings,
      setAppSettings: current.setAppSettings,
      getSettings: current.getSettings,
      listLibraries: current.listLibraries,
      getFacets: current.getFacets,
      getLibraryPrefs: current.getLibraryPrefs,
      setLibraryPrefs: current.setLibraryPrefs,
      onIndexingFinished: current.onIndexingFinished,
      onIndexingError: current.onIndexingError,
      onIndexingProgress: current.onIndexingProgress,
      onWorkerRestarted: current.onWorkerRestarted,
      handshake: current.handshake,
      indexingStatus: current.indexingStatus,
      allowDirectory: current.allowDirectory,
    },
  }));
  const { LibraryProvider, useLibrary } = await import('../app/providers');

  function Probe() {
    const { appSettings, thumbFit, updateAppSetting } = useLibrary();
    return (
      <div>
        <span data-testid="thumb">{thumbFit}</span>
        <span data-testid="overlays">{String(appSettings?.ocr_overlays_visible)}</span>
        <span data-testid="theme">{String(appSettings?.theme)}</span>
        <span data-testid="density">{String(appSettings?.density)}</span>
        <span data-testid="textscale">{String(appSettings?.text_scale)}</span>
        <button type="button" onClick={() => void updateAppSetting('ocr_overlays_visible', false)}>
          hide overlays
        </button>
        <button type="button" onClick={() => void updateAppSetting('theme', 'light')}>
          set light theme
        </button>
        <button type="button" onClick={() => void updateAppSetting('density', 'compact')}>
          set compact density
        </button>
        <button type="button" onClick={() => void updateAppSetting('text_scale', 150)}>
          set large text
        </button>
      </div>
    );
  }

  const user = userEvent.setup();
  render(<LibraryProvider><Probe /></LibraryProvider> as ReactNode);
  await waitFor(() => expect(screen.getByTestId('thumb')).toBeInTheDocument());
  return { user };
}

beforeEach(() => {
  vi.restoreAllMocks();
  // The provider writes theme/density/text-scale to the root element; clear
  // them so a test never observes a value left behind by an earlier one.
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.density;
  document.documentElement.style.removeProperty('--text-scale');
});

describe('reading the canonical store', () => {
  it('uses the stored thumbnail mode, not the default', async () => {
    stubLocalStorage();
    current = backend({ thumb_fit: 'fill' });
    await mountProvider();
    await waitFor(() => expect(screen.getByTestId('thumb')).toHaveTextContent('fill'));
  });

  it('falls back to the documented default when nothing is stored', async () => {
    stubLocalStorage();
    current = backend();
    await mountProvider();
    await waitFor(() => expect(screen.getByTestId('thumb')).toHaveTextContent('crop'));
  });

  it('a settings read failure does not take the application down', async () => {
    stubLocalStorage();
    current = backend();
    current.getAppSettings.mockRejectedValueOnce(new Error('catalog locked'));
    await mountProvider();
    // The documented default still applies.
    await waitFor(() => expect(screen.getByTestId('thumb')).toHaveTextContent('crop'));
  });
});

describe('writing through the canonical store', () => {
  it('updateAppSetting persists the value the quick control set', async () => {
    stubLocalStorage();
    current = backend();
    const { user } = await mountProvider();

    await user.click(screen.getByRole('button', { name: 'hide overlays' }));
    await waitFor(() =>
      expect(current.setAppSettings).toHaveBeenCalledWith(
        { ocr_overlays_visible: false }));
    expect(current.store.ocr_overlays_visible).toBe(false);
  });

  it('writing one setting does not disturb another', async () => {
    stubLocalStorage();
    current = backend({ thumb_fit: 'contain' });
    const { user } = await mountProvider();

    await user.click(screen.getByRole('button', { name: 'hide overlays' }));
    await waitFor(() =>
      expect(current.setCalls[0]).toEqual({ ocr_overlays_visible: false }));
    // The backend contract sends only the changed key, so the other survives.
    expect(current.store.thumb_fit).toBe('contain');
  });
});

describe('theme application (D-14)', () => {
  it('applies the stored theme to the root element', async () => {
    stubLocalStorage();
    current = backend({ theme: 'light' });
    await mountProvider();
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('defaults the root element to dark when nothing is stored', async () => {
    stubLocalStorage();
    current = backend();
    await mountProvider();
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('updateAppSetting persists the theme and re-applies it', async () => {
    stubLocalStorage();
    current = backend();
    const { user } = await mountProvider();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));

    await user.click(screen.getByRole('button', { name: 'set light theme' }));
    await waitFor(() =>
      expect(current.setAppSettings).toHaveBeenCalledWith({ theme: 'light' }));
    expect(current.store.theme).toBe('light');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });
});

describe('density and text scale (D-16)', () => {
  it('applies the stored density and text scale to the root element', async () => {
    stubLocalStorage();
    current = backend({ density: 'spacious', text_scale: 150 });
    await mountProvider();
    await waitFor(() => expect(screen.getByTestId('density')).toHaveTextContent('spacious'));
    expect(document.documentElement.dataset.density).toBe('spacious');
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.5');
  });

  it('defaults to comfortable density and 100% text scale', async () => {
    stubLocalStorage();
    current = backend();
    await mountProvider();
    await waitFor(() => expect(screen.getByTestId('density')).toHaveTextContent('comfortable'));
    expect(document.documentElement.dataset.density).toBe('comfortable');
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1');
  });

  it('updateAppSetting persists density and re-applies it', async () => {
    stubLocalStorage();
    current = backend();
    const { user } = await mountProvider();
    await user.click(screen.getByRole('button', { name: 'set compact density' }));
    await waitFor(() =>
      expect(current.setAppSettings).toHaveBeenCalledWith({ density: 'compact' }));
    expect(current.store.density).toBe('compact');
    await waitFor(() => expect(document.documentElement.dataset.density).toBe('compact'));
  });

  it('updateAppSetting persists text scale and re-applies it', async () => {
    stubLocalStorage();
    current = backend();
    const { user } = await mountProvider();
    await user.click(screen.getByRole('button', { name: 'set large text' }));
    await waitFor(() =>
      expect(current.setAppSettings).toHaveBeenCalledWith({ text_scale: 150 }));
    expect(current.store.text_scale).toBe(150);
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.5'));
  });

  it('mirrors the canonical appearance into the shell-state file', async () => {
    stubLocalStorage();
    current = backend({ theme: 'light', density: 'compact', text_scale: 150 });
    await mountProvider();
    await waitFor(() =>
      expect(writeShellState).toHaveBeenCalledWith({
        appearance: { theme: 'light', density: 'compact', text_scale: 150 },
      }),
    );
  });
});

describe('legacy localStorage adoption', () => {
  it('adopts a value the user had chosen, then clears the old key', async () => {
    const storage = stubLocalStorage({ [LEGACY_KEY]: 'contain' });
    current = backend();

    await mountProvider();
    await waitFor(() => expect(screen.getByTestId('thumb')).toHaveTextContent('contain'));
    expect(current.store.thumb_fit).toBe('contain');
    await waitFor(() => expect(storage[LEGACY_KEY]).toBeUndefined());
  });

  it('never overwrites a value the user has since chosen canonically', async () => {
    stubLocalStorage({ [LEGACY_KEY]: 'contain' });
    // The user has since set 'fill' through the canonical store.
    current = backend({ thumb_fit: 'fill' });

    await mountProvider();
    await waitFor(() => expect(screen.getByTestId('thumb')).toHaveTextContent('fill'));
    // The stale browser copy must not win.
    expect(current.setCalls).toHaveLength(0);
  });

  it('does nothing when there is no legacy value', async () => {
    stubLocalStorage();
    current = backend();

    await mountProvider();
    await waitFor(() => expect(screen.getByTestId('thumb')).toHaveTextContent('crop'));
    expect(current.setAppSettings).not.toHaveBeenCalled();
  });

  it('ignores a legacy value that is not a real mode', async () => {
    stubLocalStorage({ [LEGACY_KEY]: 'squash' });
    current = backend();

    await mountProvider();
    await waitFor(() => expect(screen.getByTestId('thumb')).toHaveTextContent('crop'));
    expect(current.store.thumb_fit).toBeUndefined();
  });
});