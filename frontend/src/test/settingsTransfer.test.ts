// covers: SET-06, STA-29, SET-01, SET-02, SET-03, SET-04, SET-05, SET-07, SET-08, SET-09, SET-10, SET-11
/**
 * Import and export (`SET-06`, `STA-29`).
 *
 * The rules that matter: paths are excluded unless asked for, unknown keys and
 * invalid values are **listed and ignored** rather than applied or guessed at, and
 * parsing never writes anything — the caller gets a plan it can show and then
 * decide on.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_SETTING_KEYS,
  PATH_KEYS,
  buildSettingsFile,
  formatValue,
  ignoredList,
  planImport,
  planToValues,
  sanitiseProfiles,
  serializeSettingsFile,
  type SettingsFile,
} from '../settings/settingsFile';
import { BUILT_IN_PROFILE_IDS } from '../settings/profiles';
import type { SettingLayers } from '../settings/resolver';

const layers: SettingLayers = {
  app: { 'appearance.accent': 'blue', 'storage.dataDir': 'D:/ComfyPanel', 'browse.thumbSize': 204 },
  library: { 'browse.gridMode': 'rows' },
  folder: { 'proc.idleOnly': true },
};

describe('export', () => {
  it('writes the format marker and only the values that were set', () => {
    const file = buildSettingsFile({ layers, profiles: [], includePaths: false });
    expect(file.format).toBe('comfypanel-settings');
    expect(file.version).toBe(1);
    // Defaults are not exported: an export is the user's changes, not the schema.
    expect(Object.keys(file.settings).sort()).toEqual(['appearance.accent', 'browse.gridMode', 'proc.idleOnly', 'browse.thumbSize'].sort());
  });

  it('excludes machine-specific paths by default', () => {
    const file = buildSettingsFile({ layers, profiles: [], includePaths: false });
    for (const key of PATH_KEYS) {
      expect(Object.keys(file.settings), `${key} should be excluded`).not.toContain(key);
    }
    expect(file.includePaths).toBe(false);
  });

  it('includes machine-specific paths when asked', () => {
    const file = buildSettingsFile({ layers, profiles: [], includePaths: true });
    expect(Object.keys(file.settings)).toContain('storage.dataDir');
    expect(file.includePaths).toBe(true);
  });

  it('merges the three scopes, letting the narrower one win', () => {
    const file = buildSettingsFile({ layers, profiles: [], includePaths: false });
    expect(file.settings['browse.gridMode']).toBe('rows');
    expect(file.settings['proc.idleOnly']).toBe(true);
    expect(file.settings['browse.thumbSize']).toBe(204);
  });

  it('writes user profiles, but never the built-ins', () => {
    const file = buildSettingsFile({
      layers,
      profiles: [{ id: 'mine', label: 'Mine', effect: '', values: {} }],
      includePaths: false,
    });
    expect(file.profiles).toEqual([{ id: 'mine', label: 'Mine', effect: '', values: {} }]);
    expect(sanitiseProfiles([{ id: 'balanced', label: 'Fake', effect: '', values: {} }])).toEqual([]);
  });

  it('round-trips through serialisation', () => {
    const file = buildSettingsFile({ layers, profiles: [], includePaths: true, exportedAt: '2026-10-17T00:00:00Z' });
    const parsed = JSON.parse(serializeSettingsFile(file)) as SettingsFile;
    expect(parsed.settings['storage.dataDir']).toBe('D:/ComfyPanel');
    expect(parsed.exportedAt).toBe('2026-10-17T00:00:00Z');
  });
});

describe('import planning', () => {
  const current = { 'appearance.accent': 'none', 'browse.thumbSize': 180 };

  const document = (settings: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      format: 'comfypanel-settings',
      version: 1,
      settings,
      ...extra,
    });

  it('accepts a valid document and previews the diff', () => {
    const plan = planImport({
      text: document({ 'appearance.accent': 'teal', 'browse.thumbSize': 204 }),
      current,
    });
    expect(plan.fatal).toBeUndefined();
    expect(plan.apply).toHaveLength(2);
    expect(plan.ignoredCount).toBe(0);
    const accent = plan.diff.find((d) => d.key === 'appearance.accent');
    expect(accent?.from).toBe('none');
    expect(accent?.to).toBe('teal');
    expect(accent?.label).toBe('Accent colour');
  });

  it('lists an unknown key and ignores it', () => {
    const plan = planImport({ text: document({ 'not.a.setting': 1 }), current });
    expect(plan.unknownKeys).toEqual(['not.a.setting']);
    expect(plan.apply).toEqual([]);
    expect(plan.ignoredCount).toBe(1);
    expect(ignoredList(plan)[0].reason).toMatch(/not a known setting/);
  });

  it('lists an invalid value with its reason and ignores it', () => {
    const plan = planImport({ text: document({ 'appearance.textScale': 500 }), current });
    expect(plan.invalidValues).toEqual([{ key: 'appearance.textScale', reason: 'must be 200 or less' }]);
    expect(plan.apply).toEqual([]);
    expect(plan.ignoredCount).toBe(1);
  });

  it('still applies the valid half of a mixed file', () => {
    const plan = planImport({
      text: document({ 'appearance.accent': 'teal', 'appearance.textScale': 500 }),
      current,
    });
    expect(plan.apply.map((a) => a.key)).toEqual(['appearance.accent']);
    expect(plan.ignoredCount).toBe(1);
  });

  it('rejects a file that is not a settings document', () => {
    expect(planImport({ text: 'not json', current }).fatal).toMatch(/valid JSON/);
    expect(planImport({ text: '[]', current }).fatal).toMatch(/settings document/);
    expect(planImport({ text: '{"hello":1}', current }).fatal).toMatch(/not a ComfyPanel/);
    expect(planImport({ text: '{"format":"comfypanel-settings"}', current }).fatal).toMatch(/no settings/);
  });

  it('writes nothing: planning is read-only', () => {
    // The same text planned twice must give the same plan, and the caller's
    // `current` must not have been touched.
    const before = JSON.stringify(current);
    const text = document({ 'appearance.accent': 'teal' });
    const a = planImport({ text, current });
    const b = planImport({ text, current });
    expect(a.apply).toEqual(b.apply);
    expect(JSON.stringify(current)).toBe(before);
  });

  it('accepts well-formed profiles and flags malformed ones', () => {
    const plan = planImport({
      text: document(
        {},
        {
          profiles: [
            { id: 'mine', label: 'Mine', effect: 'Custom.', values: { 'proc.idleOnly': true } },
            { id: 42 },
          ],
        },
      ),
      current,
    });
    expect(plan.profiles).toHaveLength(1);
    expect(plan.profiles[0].label).toBe('Mine');
    expect(plan.unknownKeys).toEqual(['profile:42']);
  });

  it('turns the plan into the values the store applies', () => {
    const plan = planImport({ text: document({ 'appearance.accent': 'teal', 'bad.key': 1 }), current });
    expect(planToValues(plan)).toEqual({ 'appearance.accent': 'teal' });
  });
});

describe('helpers', () => {
  it('renders values for a human diff', () => {
    expect(formatValue(true)).toBe('On');
    expect(formatValue(false)).toBe('Off');
    expect(formatValue(null)).toBe('—');
    expect(formatValue('auto')).toBe('auto');
    expect(formatValue({ keyword: 40 })).toBe('{"keyword":40}');
  });

  it('exposes every registry key for a "reset everything" confirmation', () => {
    expect(ALL_SETTING_KEYS).toContain('appearance.theme');
    expect(ALL_SETTING_KEYS.length).toBeGreaterThan(50);
  });

  it('reserves the built-in profile ids', () => {
    expect(BUILT_IN_PROFILE_IDS).toEqual(['balanced', 'low-power', 'max-speed']);
  });
});