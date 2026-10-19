/**
 * Appearance preferences (theme, density, text scale): the one place that
 * turns the stored values into root-element state, plus a write-through cache
 * for first paint.
 *
 * The catalog (`app_settings`) owns these values. But the catalog is read
 * asynchronously, so applying them only from `LibraryProvider` would show a
 * dark, default-size frame to a light / high-contrast / scaled-up user before
 * the read resolves. `main.tsx` therefore applies this module's cached copy
 * *before* the first React render, and the provider reconciles with the
 * canonical values once they load.
 *
 * The cache lives in the **shell-state file** (a small JSON file read by the
 * platform adapter), not in `localStorage`. `ARC-13` / `SET-09` forbid
 * `localStorage` outright, and a web build and an exe build must behave
 * identically. `localStorage` is referenced **once**, below, to migrate a value
 * written by an older build; after that migration it is empty and never read
 * again.
 */
import type { Density, Theme } from '../types';
import { DENSITY_OPTIONS, TEXT_SCALE_VALUES, THEME_OPTIONS } from '../types';
import { readShellState, writeShellState } from '../platform/transport';

export type Appearance = {
  theme: Theme;
  density: Density;
  text_scale: number;
};

/** localStorage key used by builds older than the shell-state migration. */
export const LEGACY_APPEARANCE_CACHE_KEY = 'comfypanel.appearance';

const THEMES = THEME_OPTIONS.map((o) => o.value);
const DENSITIES = DENSITY_OPTIONS.map((o) => o.value);

function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as string[]).includes(v);
}

function isDensity(v: unknown): v is Density {
  return typeof v === 'string' && (DENSITIES as string[]).includes(v);
}

function isTextScale(v: unknown): v is number {
  return typeof v === 'number' && TEXT_SCALE_VALUES.includes(v);
}

/** In-memory copy of the cached appearance, populated by `loadShellState`. */
let cached: Partial<Appearance> = {};

/**
 * Apply appearance values to the root element. Only known-good values are
 * applied; `undefined` fields are left as they are, so a partial call never
 * clobbers the rest.
 */
export function applyAppearance(part: Partial<Appearance>): void {
  const root = document.documentElement;
  if (isTheme(part.theme)) root.dataset.theme = part.theme;
  if (isDensity(part.density)) root.dataset.density = part.density;
  if (isTextScale(part.text_scale)) {
    root.style.setProperty('--text-scale', String(part.text_scale / 100));
  }
}

/** Mirror the appearance into the shell-state file for the next launch. */
export function cacheAppearance(a: Appearance): void {
  cached = { ...a };
  void writeShellState({ appearance: { ...a } });
}

/** Read the cached appearance. Returns `{}` (apply nothing) when absent. */
export function readCachedAppearance(): Partial<Appearance> {
  return cached;
}

/**
 * Load the shell state once, before the first render, and migrate any value
 * written by an older build that used `localStorage`.
 *
 * Migration runs **once**: the legacy key is read, copied into the shell-state
 * file, and removed. After that the key is empty and this branch never fires
 * again, so a value the user picked is preserved exactly and nothing changes
 * visibly. `ARC-13` forbids `localStorage` in new code; this single read is the
 * sanctioned exception and is annotated below.
 */
export async function loadShellState(): Promise<void> {
  // ---- one-time migration from the legacy localStorage cache ----------------
  // eslint-disable-next-line no-restricted-globals
  let legacyRaw: string | null = null;
  try {
    // eslint-disable-next-line no-restricted-globals
    legacyRaw = localStorage.getItem(LEGACY_APPEARANCE_CACHE_KEY);
  } catch {
    legacyRaw = null;
  }
  if (legacyRaw) {
    try {
      const parsed = JSON.parse(legacyRaw) as Partial<Appearance>;
      const migrated: Partial<Appearance> = {};
      if (isTheme(parsed?.theme)) migrated.theme = parsed.theme;
      if (isDensity(parsed?.density)) migrated.density = parsed.density;
      if (isTextScale(parsed?.text_scale)) migrated.text_scale = parsed.text_scale;
      if (Object.keys(migrated).length > 0) {
        await writeShellState({ appearance: migrated });
      }
    } catch {
      // A corrupt legacy entry is dropped, not propagated.
    }
    try {
      // eslint-disable-next-line no-restricted-globals
      localStorage.removeItem(LEGACY_APPEARANCE_CACHE_KEY);
    } catch {
      // Best effort: the migration is idempotent if it cannot remove the key.
    }
  }

  // ---- read the canonical cache --------------------------------------------
  try {
    const state = await readShellState();
    const a = state?.appearance;
    const out: Partial<Appearance> = {};
    if (a && typeof a === 'object') {
      if (isTheme(a.theme)) out.theme = a.theme as Theme;
      if (isDensity(a.density)) out.density = a.density as Density;
      if (isTextScale(a.text_scale)) out.text_scale = a.text_scale as number;
    }
    // Always assigned: a missing or unreadable state must clear a stale cache
    // rather than keep the previous launch's values, or an empty shell-state
    // file would still show the old theme after the user reset it.
    cached = out;
  } catch {
    // A failed read leaves the cache empty. Defaults apply; nothing crashes.
    cached = {};
  }
}