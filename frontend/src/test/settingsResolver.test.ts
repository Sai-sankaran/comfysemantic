// covers: SET-02, SET-01, SET-03, SET-04, SET-05, SET-06, SET-07, SET-08, SET-09, SET-10, SET-11, TST-15
/**
 * Scope resolution (design `SET-02`).
 *
 * The rule under test is one line — folder → library → app → default — but it is
 * the rule every scope chip, every "Using app default" label and every Reset
 * button depends on, so it is pinned from several directions.
 */
import { describe, expect, it } from 'vitest';
import { SETTINGS_BY_KEY, SETTINGS_REGISTRY, validateSetting } from '../settings/registry';
import {
  canReset,
  originDescription,
  originLabel,
  resolveAll,
  resolveSetting,
  withoutKey,
  type SettingLayers,
} from '../settings/resolver';

const entry = (key: string) => {
  const found = SETTINGS_BY_KEY.get(key);
  if (!found) throw new Error(`no such setting ${key}`);
  return found;
};

const layers = (partial: Partial<SettingLayers> = {}): SettingLayers => ({
  folder: partial.folder ?? {},
  library: partial.library ?? {},
  app: partial.app ?? {},
});

describe('resolveSetting (SET-02)', () => {
  const comfyThumb = entry('browse.thumbSize'); // app + library + folder
  const theme = entry('appearance.theme'); // app only

  it('uses the default when no layer holds the key', () => {
    const r = resolveSetting(comfyThumb, layers());
    expect(r.value).toBe(180);
    expect(r.origin).toBe('default');
    expect(r.modified).toBe(false);
    expect(r.overriddenAt).toEqual([]);
  });

  it('lets the app value win over the default', () => {
    const r = resolveSetting(comfyThumb, layers({ app: { 'browse.thumbSize': 228 } }));
    expect(r.value).toBe(228);
    expect(r.origin).toBe('app');
    expect(r.modified).toBe(true);
  });

  it('lets the library value win over the app value', () => {
    const r = resolveSetting(
      comfyThumb,
      layers({ app: { 'browse.thumbSize': 228 }, library: { 'browse.thumbSize': 204 } }),
    );
    expect(r.value).toBe(204);
    expect(r.origin).toBe('library');
  });

  it('lets the folder value win over everything', () => {
    const r = resolveSetting(
      comfyThumb,
      layers({
        app: { 'browse.thumbSize': 228 },
        library: { 'browse.thumbSize': 204 },
        folder: { 'browse.thumbSize': 300 },
      }),
    );
    expect(r.value).toBe(300);
    expect(r.origin).toBe('folder');
  });

  it('reports every scope that holds an explicit value', () => {
    const r = resolveSetting(
      comfyThumb,
      layers({ app: { 'browse.thumbSize': 228 }, folder: { 'browse.thumbSize': 300 } }),
    );
    expect(r.overriddenAt).toEqual(['folder', 'app']);
  });

  it('ignores a layer the setting does not allow', () => {
    // `appearance.theme` is app-only, so a stale library value must not surface.
    const r = resolveSetting(theme, layers({ library: { 'appearance.theme': 'light' } }));
    expect(r.value).toBe('dark');
    expect(r.origin).toBe('default');
    expect(r.overriddenAt).toEqual([]);
  });

  it('ignores a stored value that no longer validates', () => {
    // thumbSize is 96-320; 9000 cannot come from the UI, but a hand-edited or
    // stale store could hold it, and showing it would be worse than falling back.
    const r = resolveSetting(comfyThumb, layers({ app: { 'browse.thumbSize': 9000 } }));
    expect(r.value).toBe(180);
    expect(r.origin).toBe('default');
  });

  it('rejects a value that is in range but off the step', () => {
    // 220 is inside 96-320 but is not a multiple of 12 from 96, so it is not a
    // legal thumbnail size and must never become the effective value.
    expect(validateSetting(comfyThumb, 228).ok).toBe(true);
    expect(validateSetting(comfyThumb, 220).ok).toBe(false);
    const r = resolveSetting(comfyThumb, layers({ app: { 'browse.thumbSize': 220 } }));
    expect(r.value).toBe(180);
  });

  it('compares a structured default structurally, not by identity', () => {
    const e = entry('search.hybridWeights'); // default { keyword: 40, ... }
    const identical = resolveSetting(e, layers({ app: { 'search.hybridWeights': { keyword: 40, semantic: 30, visual: 30 } } }));
    expect(identical.modified).toBe(false);
    const changed = resolveSetting(e, layers({ app: { 'search.hybridWeights': { keyword: 50, semantic: 30, visual: 30 } } }));
    expect(changed.modified).toBe(true);
  });

  it('treats an explicitly-set default value as unmodified but overridden', () => {
    const r = resolveSetting(theme, layers({ app: { 'appearance.theme': 'dark' } }));
    expect(r.value).toBe('dark');
    expect(r.modified).toBe(false);
    expect(r.overriddenAt).toEqual(['app']);
    // Reset is still meaningful: it removes the explicit override.
    expect(canReset(r)).toBe(true);
  });

  it('reports the allowed scopes for the scope chip', () => {
    expect(resolveSetting(comfyThumb, layers()).overridableScopes).toEqual([
      'app',
      'library',
      'folder',
    ]);
    expect(resolveSetting(theme, layers()).overridableScopes).toEqual(['app']);
    expect(resolveSetting(entry('comics.readingDirection'), layers()).overridableScopes).toEqual([
      'folder',
    ]);
  });
});

describe('origin wording (SET-02, SET-03)', () => {
  it('names the layer the value came from', () => {
    expect(originLabel(resolveSetting(entry('browse.thumbSize'), layers()))).toBe('Default');
    expect(
      originLabel(resolveSetting(entry('browse.thumbSize'), layers({ app: { 'browse.thumbSize': 228 } }))),
    ).toBe('App');
    expect(
      originLabel(
        resolveSetting(entry('browse.thumbSize'), layers({ library: { 'browse.thumbSize': 204 } })),
      ),
    ).toBe('This library');
    expect(
      originLabel(
        resolveSetting(entry('browse.thumbSize'), layers({ folder: { 'browse.thumbSize': 300 } })),
      ),
    ).toBe('This folder');
  });

  it('explains the provenance in words, not only in the chip', () => {
    expect(originDescription(resolveSetting(entry('browse.thumbSize'), layers()))).toBe(
      'Using the default.',
    );
    expect(
      originDescription(
        resolveSetting(entry('browse.thumbSize'), layers({ library: { 'browse.thumbSize': 204 } })),
      ),
    ).toBe('Overridden for this library.');
  });
});

describe('canReset (SET-08)', () => {
  it('is false for a setting nobody has touched', () => {
    expect(canReset(resolveSetting(entry('browse.thumbSize'), layers()))).toBe(false);
  });

  it('is true once a value is changed or overridden', () => {
    expect(
      canReset(resolveSetting(entry('browse.thumbSize'), layers({ app: { 'browse.thumbSize': 228 } }))),
    ).toBe(true);
  });
});

describe('withoutKey', () => {
  it('removes one key and leaves the rest', () => {
    const layer = { a: 1, b: 2 };
    expect(withoutKey(layer, 'a')).toEqual({ b: 2 });
    // The original is not mutated.
    expect(layer).toEqual({ a: 1, b: 2 });
  });
});

describe('resolveAll', () => {
  it('resolves every registry entry', () => {
    const all = resolveAll(layers());
    expect(all.length).toBe(SETTINGS_REGISTRY.length);
    for (const r of all) {
      expect(r.entry.key).toBeTruthy();
      expect(['folder', 'library', 'app', 'default']).toContain(r.origin);
    }
  });

  it('reports every setting modified by a library override', () => {
    const all = resolveAll(layers({ library: { 'browse.thumbSize': 204 } }));
    const modified = all.filter((r) => r.modified).map((r) => r.entry.key);
    expect(modified).toEqual(['browse.thumbSize']);
  });
});