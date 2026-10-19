// covers: VIS-01, VIS-02, VIS-03, VIS-04, VIS-05, VIS-06, VIS-07, VIS-08, VIS-09, VIS-10, VIS-11, VIS-12, VIS-13, VIS-14, VIS-15, ARC-13
/**
 * The appearance module: applying theme/density/text-scale to the root element
 * and the first-paint cache.
 *
 * The cache now lives in the **shell-state file** (via the platform adapter),
 * not `localStorage`. These tests therefore stub the adapter rather than a
 * storage implementation, so they verify the reading and validation logic and
 * not the file format.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

type ShellState = {
  appearance?: { theme?: string; density?: string; text_scale?: number };
};

const { readShellState, writeShellState } = vi.hoisted(() => ({
  readShellState: vi.fn(),
  writeShellState: vi.fn(),
}));

vi.mock('../../src/platform/transport', () => ({
  readShellState: () => readShellState(),
  writeShellState: (s: ShellState) => writeShellState(s),
}));

import {
  LEGACY_APPEARANCE_CACHE_KEY,
  applyAppearance,
  cacheAppearance,
  loadShellState,
  readCachedAppearance,
} from '../../src/app/appearance';

/** A localStorage stub so the one-time legacy migration can be exercised. */
function stubLocalStorage() {
  const data: Record<string, string> = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => { data[k] = v; },
      removeItem: (k: string) => { delete data[k]; },
    },
  });
  return data;
}

function resetRoot() {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  root.removeAttribute('data-density');
  root.style.removeProperty('--text-scale');
}

beforeEach(() => {
  readShellState.mockReset().mockResolvedValue(null);
  writeShellState.mockReset().mockResolvedValue(undefined);
  resetRoot();
});

describe('applyAppearance', () => {
  it('writes theme, density and text scale to the root element', () => {
    applyAppearance({ theme: 'light', density: 'compact', text_scale: 150 });
    const root = document.documentElement;
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.density).toBe('compact');
    expect(root.style.getPropertyValue('--text-scale')).toBe('1.5');
  });

  it('leaves unknown or absent fields untouched', () => {
    const root = document.documentElement;
    root.dataset.theme = 'dark';
    applyAppearance({ theme: 'neon' as never, density: 'comfortable' });
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.density).toBe('comfortable');
    expect(root.style.getPropertyValue('--text-scale')).toBe('');
  });
});

describe('loadShellState + readCachedAppearance', () => {
  it('returns nothing when no state exists', async () => {
    await loadShellState();
    expect(readCachedAppearance()).toEqual({});
  });

  it('drops illegal fields but keeps legal ones', async () => {
    readShellState.mockResolvedValueOnce({
      appearance: { theme: 'solarized', density: 'spacious', text_scale: 1000 },
    });
    await loadShellState();
    expect(readCachedAppearance()).toEqual({ density: 'spacious' });
  });

  it('migrates a legacy localStorage key once, then deletes it', async () => {
    const data = stubLocalStorage();
    data[LEGACY_APPEARANCE_CACHE_KEY] = JSON.stringify({
      theme: 'light', density: 'compact', text_scale: 120,
    });
    await loadShellState();
    expect(writeShellState).toHaveBeenCalledWith({
      appearance: { theme: 'light', density: 'compact', text_scale: 120 },
    });
    expect(data[LEGACY_APPEARANCE_CACHE_KEY]).toBeUndefined();
  });

  it('ignores a corrupt legacy entry instead of crashing', async () => {
    const data = stubLocalStorage();
    data[LEGACY_APPEARANCE_CACHE_KEY] = '{not json';
    await loadShellState();
    expect(readCachedAppearance()).toEqual({});
  });

  it('applies the loaded appearance before first paint', async () => {
    readShellState.mockResolvedValueOnce({
      appearance: { theme: 'high-contrast', text_scale: 80 },
    });
    await loadShellState();
    applyAppearance(readCachedAppearance());
    const root = document.documentElement;
    expect(root.dataset.theme).toBe('high-contrast');
    expect(root.style.getPropertyValue('--text-scale')).toBe('0.8');
  });
});

describe('cacheAppearance', () => {
  it('writes the appearance into the shell-state file', () => {
    cacheAppearance({ theme: 'light', density: 'spacious', text_scale: 110 });
    expect(writeShellState).toHaveBeenCalledWith({
      appearance: { theme: 'light', density: 'spacious', text_scale: 110 },
    });
  });
});
