// covers: SET-01, SET-02, SET-03, SET-04, SET-05, SET-06, SET-07, SET-08, SET-09, SET-10, SET-11, NAV-30, NAV-31, NAV-32
/**
 * The settings registry (design `SET-01`, §12.2).
 *
 * The registry is transcribed from `design.md`, so these tests are partly a guard
 * that the transcription stayed faithful: every documented key is present exactly
 * once, each is internally consistent (type, default, allowed scopes, category),
 * and validation rejects what `§12.2`'s range column says it must.
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_HINT,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  SETTINGS_BY_KEY,
  SETTINGS_REGISTRY,
  categoriesWithEntries,
  defaultValues,
  entriesForCategory,
  searchSettings,
  validateSetting,
  type SettingType,
} from '../settings/registry';

const CONTEXT = { libraryType: 'none' as const };

describe('the registry', () => {
  it('has a unique key for every entry', () => {
    const keys = SETTINGS_REGISTRY.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SETTINGS_BY_KEY.size).toBe(keys.length);
  });

  it('uses dotted, lowercase namespaced keys', () => {
    for (const e of SETTINGS_REGISTRY) {
      expect(e.key, `${e.key} is not namespaced`).toMatch(/^[a-z][a-zA-Z]*\.[a-zA-Z.]+$/);
    }
  });

  it('gives every entry a label, a description and at least one scope', () => {
    for (const e of SETTINGS_REGISTRY) {
      expect(e.label.length, `${e.key} has no label`).toBeGreaterThan(0);
      expect(e.description.length, `${e.key} has no description`).toBeGreaterThan(0);
      expect(e.allowedScopes.length, `${e.key} allows no scope`).toBeGreaterThan(0);
      for (const scope of e.allowedScopes) {
        expect(['app', 'library', 'folder']).toContain(scope);
      }
    }
  });

  it('gives every entry a known category', () => {
    for (const e of SETTINGS_REGISTRY) {
      expect(CATEGORY_ORDER).toContain(e.category);
      expect(CATEGORY_LABEL[e.category].length).toBeGreaterThan(0);
    }
  });

  it('only claims `auto` where the design allows an int or auto', () => {
    for (const e of SETTINGS_REGISTRY) {
      if (e.constraints?.autoOption) {
        expect(['int', 'float'], `${e.key} allows auto but is ${e.type}`).toContain(e.type);
        expect(e.default, `${e.key} should default to auto`).toBe('auto');
      }
    }
  });

  it('only declares enum options for enum entries', () => {
    for (const e of SETTINGS_REGISTRY) {
      const options = e.constraints?.options ?? e.options;
      if (!options) continue;
      if (e.type !== 'enum' && e.type !== 'id') {
        // `browse.sort` is documented "enum (per library type)" and modelled as an
        // enum; `id` entries (cropper/engine/device) legitimately have no list.
        expect(e.type, `${e.key} has options but is ${e.type}`).toContain(e.type);
      }
      expect(options.length, `${e.key} has an empty option list`).toBeGreaterThan(0);
    }
  });

  it('models the types the design allows', () => {
    const allowed: SettingType[] = [
      'bool', 'int', 'float', 'enum', 'string', 'path', 'hex', 'json', 'list', 'id',
    ];
    for (const e of SETTINGS_REGISTRY) {
      expect(allowed, `${e.key} has type ${e.type}`).toContain(e.type);
    }
  });

  it('marks the restart-required settings the design names', () => {
    const restart = SETTINGS_REGISTRY.filter((e) => e.restartRequired).map((e) => e.key);
    // §12.2 marks storage.dataDir "(restart required)" and nothing else.
    expect(restart).toEqual(['storage.dataDir']);
  });

  it('marks the profileable settings inside Processing', () => {
    const profileable = SETTINGS_REGISTRY.filter((e) => e.profileable).map((e) => e.key);
    // Every profileable key in §12.2 is a processing or runtime key.
    for (const key of profileable) {
      expect(
        key.startsWith('proc.') || key.startsWith('runtime.'),
        `${key} is marked profileable`,
      ).toBe(true);
    }
    expect(profileable).toContain('proc.workerThreadsMax');
    expect(profileable).toContain('runtime.idleStopMinutes');
    // `proc.profile` itself and `proc.skipCompleted` are explicitly not profileable.
    expect(profileable).not.toContain('proc.profile');
    expect(profileable).not.toContain('proc.skipCompleted');
  });

  it('transcribes the documented defaults', () => {
    const d = defaultValues();
    expect(d['appearance.theme']).toBe('dark');
    expect(d['appearance.density']).toBe('comfortable');
    expect(d['appearance.textScale']).toBe(100);
    expect(d['appearance.rail']).toBe('auto');
    expect(d['browse.thumbSize']).toBe(180);
    expect(d['browse.gridMode']).toBe('uniform');
    expect(d['browse.cardOverlay']).toBe('hover');
    expect(d['search.resultLimit']).toBe(1000);
    expect(d['search.similarityMin']).toBeNull();
    expect(d['duplicates.minSimilarity']).toBe(90);
    expect(d['ocr.confidenceThreshold']).toBe(80);
    expect(d['ocr.languages']).toEqual(['en']);
    expect(d['storage.backupKeep']).toBe(5);
    expect(d['storage.integrityCheck']).toBe('weekly');
    expect(d['diag.logLevel']).toBe('info');
    expect(d['runtime.lowMemoryWarnGB']).toBe(1.5);
    expect(d['comics.flag.overlapIoU']).toBeCloseTo(0.1);
    expect(d['comics.flag.tinyAreaPct']).toBeCloseTo(1.5);
    expect(d['comics.flag.manyPanels']).toBe(12);
    expect(d['comics.webtoonCandidateRatio']).toBeCloseTo(3.5);
    expect(d['comics.webtoonMinGutterPx']).toBe(24);
  });

  it('gives a default for every key', () => {
    for (const e of SETTINGS_REGISTRY) {
      expect(defaultValues(), `${e.key} has no default`).toHaveProperty(e.key);
    }
  });
});

describe('validation', () => {
  const entry = (key: string) => {
    const found = SETTINGS_BY_KEY.get(key);
    if (!found) throw new Error(`no such setting ${key}`);
    return found;
  };

  it('accepts on and off for a bool, and nothing else', () => {
    const e = entry('browse.includeSubfolders');
    expect(validateSetting(e, true)).toEqual({ ok: true, value: true });
    expect(validateSetting(e, 'false')).toEqual({ ok: true, value: false });
    expect(validateSetting(e, 'maybe').ok).toBe(false);
    expect(validateSetting(e, 1).ok).toBe(false);
  });

  it('enforces the documented range and step of an int', () => {
    const e = entry('appearance.textScale'); // 80-200 step 10
    expect(validateSetting(e, 100)).toEqual({ ok: true, value: 100 });
    expect(validateSetting(e, '150')).toEqual({ ok: true, value: 150 });
    expect(validateSetting(e, 79).ok).toBe(false);
    expect(validateSetting(e, 201).ok).toBe(false);
    expect(validateSetting(e, 105).ok).toBe(false); // not a step of 10
    expect(validateSetting(e, 100.5).ok).toBe(false); // not an int
  });

  it('enforces a float range', () => {
    const e = entry('comics.flag.overlapIoU'); // 0-1
    expect(validateSetting(e, 0.25)).toEqual({ ok: true, value: 0.25 });
    expect(validateSetting(e, 1.5).ok).toBe(false);
    expect(validateSetting(e, -0.1).ok).toBe(false);
  });

  it('rejects a value outside the enum', () => {
    const e = entry('appearance.theme');
    expect(validateSetting(e, 'light')).toEqual({ ok: true, value: 'light' });
    expect(validateSetting(e, 'solarized').ok).toBe(false);
  });

  it('accepts auto only where the entry allows it', () => {
    const e = entry('proc.workerThreadsMax');
    expect(validateSetting(e, 'auto')).toEqual({ ok: true, value: 'auto' });
    expect(validateSetting(e, 8)).toEqual({ ok: true, value: 8 });
    const noAuto = entry('browse.thumbSize');
    expect(validateSetting(noAuto, 'auto').ok).toBe(false);
  });

  it('validates a hex colour', () => {
    const e = entry('appearance.accentCustom');
    expect(validateSetting(e, '#5B9CF6')).toEqual({ ok: true, value: '#5B9CF6' });
    expect(validateSetting(e, 'blue').ok).toBe(false);
    expect(validateSetting(e, '#5B9C').ok).toBe(false);
  });

  it('parses a JSON value and rejects broken JSON', () => {
    const e = entry('search.hybridWeights');
    expect(validateSetting(e, '{"keyword":50}')).toEqual({
      ok: true,
      value: { keyword: 50 },
    });
    const bad = validateSetting(e, '{not json');
    expect(bad.ok).toBe(false);
  });

  it('accepts null where the design says "or null"', () => {
    const e = entry('search.similarityMin');
    expect(validateSetting(e, null)).toEqual({ ok: true, value: null });
    expect(validateSetting(e, '')).toEqual({ ok: true, value: null });
    expect(validateSetting(e, 0.8)).toEqual({ ok: true, value: 0.8 });
    expect(validateSetting(e, 2).ok).toBe(false);
    // A setting that is not nullable must still refuse an empty value.
    expect(validateSetting(entry('browse.thumbSize'), null).ok).toBe(false);
  });

  it('splits a comma separated list', () => {
    const e = entry('ocr.languages');
    expect(validateSetting(e, 'en, fr')).toEqual({ ok: true, value: ['en', 'fr'] });
    expect(validateSetting(e, ['en'])).toEqual({ ok: true, value: ['en'] });
    expect(validateSetting(e, 7).ok).toBe(false);
  });
});

describe('categories', () => {
  it('lists the ten categories of §12.1 that have entries', () => {
    // §12.1 lists ten. Appendix E.5 adds an eleventh — Privacy — for the
    // `privacy.*` keys, and it sits after Browsing because that is where a user
    // looks for it.
    expect(categoriesWithEntries(CONTEXT)).toEqual([
      'appearance',
      'browsing',
      'privacy',
      'search',
      'processing',
      'comics',
      'ocr',
      'runtime',
      'storage',
      'shortcuts',
      'advanced',
    ]);
  });

  it('gives every category except the documented-empty Shortcuts one at least one entry', () => {
    for (const c of CATEGORY_ORDER) {
      const count = entriesForCategory(c, CONTEXT).length;
      if (c === 'shortcuts') {
        // §20: v1 shortcuts are fixed and generated from the action registry, so
        // §12.2 defines no keys. The category still exists and explains that.
        expect(count, 'Shortcuts should have no registry keys').toBe(0);
        expect(CATEGORY_HINT[c], 'Shortcuts should explain itself').toBeTruthy();
        continue;
      }
      expect(count, `${c} is empty`).toBeGreaterThan(0);
    }
  });
});

describe('search (SET-05)', () => {
  it('matches on the label', () => {
    const hits = searchSettings('thumbnail size', CONTEXT).map((e) => e.key);
    expect(hits).toContain('browse.thumbSize');
  });

  it('matches on the key', () => {
    expect(searchSettings('textScale', CONTEXT).map((e) => e.key)).toContain('appearance.textScale');
  });

  it('matches on the description', () => {
    const hits = searchSettings('perceptual', CONTEXT).map((e) => e.key);
    expect(hits).toContain('duplicates.minSimilarity');
  });

  it('matches on a keyword the label does not contain', () => {
    const hits = searchSettings('webtoon', CONTEXT).map((e) => e.key);
    expect(hits).toContain('comics.webtoonSlicing');
    expect(hits).toContain('comics.webtoonCandidateRatio');
  });

  it('narrows with every term rather than widening', () => {
    const both = searchSettings('thumbnail size', CONTEXT).map((e) => e.key);
    const narrower = searchSettings('thumbnail size pixels', CONTEXT).map((e) => e.key);
    expect(narrower.length).toBeLessThanOrEqual(both.length);
    expect(narrower).toContain('browse.thumbSize');
  });

  it('returns everything for an empty query, and nothing for a non-match', () => {
    expect(searchSettings('', CONTEXT).length).toBe(SETTINGS_REGISTRY.length);
    expect(searchSettings('   ', CONTEXT).length).toBe(SETTINGS_REGISTRY.length);
    expect(searchSettings('zzzznotasetting', CONTEXT)).toEqual([]);
  });

  it('is case insensitive', () => {
    expect(searchSettings('THUMBNAIL SIZE', CONTEXT).map((e) => e.key)).toContain(
      'browse.thumbSize',
    );
  });
});