import { SETTINGS_REGISTRY, SETTINGS_BY_KEY, validateSetting, type SettingValue } from './registry';
import { BUILT_IN_PROFILE_IDS, type ProcessingProfile } from './profiles';
import type { SettingLayers } from './resolver';

/**
 * Import and export (design `SET-06`).
 *
 * *Export* writes JSON — settings and profiles — and includes machine-specific
 * paths **only** when *Include paths* is ticked, because a settings file is
 * usually shared between machines and an absolute data directory is not.
 *
 * *Import* validates everything against the registry first: unknown keys and
 * invalid values are **listed and ignored**, never applied, and the caller is
 * shown a diff of what will change before anything is written (`SET-06`, and the
 * `STA-29` message). Applying is a separate step, which is also where the design
 * puts the backup of the current settings.
 */

export type SettingsFile = {
  /** File format marker, so a future version can refuse an old one cleanly. */
  format: 'comfypanel-settings';
  version: 1;
  exportedAt?: string;
  /** Only present when the export ticked *Include paths*. */
  includePaths?: boolean;
  settings: Record<string, SettingValue>;
  profiles?: ProcessingProfile[];
};

/**
 * The settings that hold a machine-specific path. `SET-06` excludes these from a
 * shared export unless the user asks for them.
 */
export const PATH_KEYS: readonly string[] = [
  'storage.dataDir',
  'runtime.models.dir',
];

export type ExportOptions = {
  layers: SettingLayers;
  profiles: readonly ProcessingProfile[];
  includePaths: boolean;
  /** Omitted in tests so the output is deterministic. */
  exportedAt?: string;
};

/** Build the exportable document. Only explicitly-set values are written. */
export function buildSettingsFile({
  layers,
  profiles,
  includePaths,
  exportedAt,
}: ExportOptions): SettingsFile {
  const settings: Record<string, SettingValue> = {};
  // Merge most-specific first so a narrower override does not overwrite a wider
  // one; the exported file is a flat map, which is what an import can consume.
  for (const layer of [layers.app, layers.library, layers.folder]) {
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      if (!includePaths && PATH_KEYS.includes(key)) continue;
      settings[key] = value;
    }
  }
  return {
    format: 'comfypanel-settings',
    version: 1,
    ...(exportedAt ? { exportedAt } : {}),
    includePaths,
    settings,
    ...(profiles.length > 0 ? { profiles: [...profiles] } : {}),
  };
}

export function serializeSettingsFile(file: SettingsFile): string {
  return JSON.stringify(file, null, 2);
}

export type ImportDiffRow = {
  key: string;
  label: string;
  category: string;
  from: SettingValue;
  to: SettingValue;
};

export type ImportPlan = {
  /** Values that will be applied. */
  apply: Array<{ key: string; value: SettingValue }>;
  /** Keys the file names that the registry does not know (`SET-06`). */
  unknownKeys: string[];
  /** Keys whose value fails the registry's validation; listed and ignored. */
  invalidValues: Array<{ key: string; reason: string }>;
  /** What each applied value would change, for the diff preview. */
  diff: ImportDiffRow[];
  /** Profiles found in the file that the registry can accept. */
  profiles: ProcessingProfile[];
  /** `STA-29`: how many values will be ignored, or 0. */
  ignoredCount: number;
  /** A file that is not a settings document at all. */
  fatal?: string;
};

export type ImportInput = {
  text: string;
  /** The values in effect now, so the diff can show "from". */
  current: Record<string, SettingValue>;
};

/**
 * Parse and validate an import without applying anything.
 *
 * Nothing is written here on purpose: `SET-06` requires a diff preview and a
 * backup before the current settings are replaced, and a function that only
 * *reads* makes that ordering impossible to get wrong.
 */
export function planImport({ text, current }: ImportInput): ImportPlan {
  const plan: ImportPlan = {
    apply: [],
    unknownKeys: [],
    invalidValues: [],
    diff: [],
    profiles: [],
    ignoredCount: 0,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    plan.fatal = 'That file is not valid JSON.';
    return plan;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    plan.fatal = 'That file does not contain a settings document.';
    return plan;
  }

  const file = parsed as Partial<SettingsFile>;
  if (file.format !== 'comfypanel-settings') {
    plan.fatal = 'That file is not a ComfyPanel Studio settings export.';
    return plan;
  }
  if (file.settings === null || typeof file.settings !== 'object' || Array.isArray(file.settings)) {
    plan.fatal = 'That export has no settings object.';
    return plan;
  }

  for (const [key, raw] of Object.entries(file.settings)) {
    const entry = SETTINGS_BY_KEY.get(key);
    if (!entry) {
      // Unknown keys are listed and ignored, never guessed at.
      plan.unknownKeys.push(key);
      continue;
    }
    const result = validateSetting(entry, raw);
    if (!result.ok) {
      plan.invalidValues.push({ key, reason: result.reason });
      continue;
    }
    plan.apply.push({ key, value: result.value });
    plan.diff.push({
      key,
      label: entry.label,
      category: entry.category,
      from: current[key] ?? entry.default,
      to: result.value,
    });
  }

  if (Array.isArray(file.profiles)) {
    for (const candidate of file.profiles) {
      if (candidate === null || typeof candidate !== 'object') continue;
      const profile = candidate as ProcessingProfile;
      if (typeof profile.id !== 'string' || typeof profile.label !== 'string') {
        plan.unknownKeys.push(`profile:${String(profile.id ?? 'unnamed')}`);
        continue;
      }
      plan.profiles.push({
        id: profile.id,
        label: profile.label,
        effect: typeof profile.effect === 'string' ? profile.effect : 'Imported profile.',
        values: profile.values && typeof profile.values === 'object' ? profile.values : {},
      });
    }
  }

  // `STA-29`: "N values were ignored." Unknown keys and invalid values both
  // count, because both end up not being applied.
  plan.ignoredCount = plan.unknownKeys.length + plan.invalidValues.length;
  return plan;
}

/** Turn applied values into the layer patch the store writes through. */
export function planToValues(
  plan: ImportPlan,
): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const { key, value } of plan.apply) out[key] = value;
  return out;
}

/** The `STA-29` list, in the order the design shows it: ignored values with reasons. */
export function ignoredList(plan: ImportPlan): Array<{ key: string; reason: string }> {
  return [
    ...plan.unknownKeys.map((key) => ({ key, reason: 'not a known setting' })),
    ...plan.invalidValues,
  ];
}

/** A one-line human summary of a value, for the diff preview. */
export function formatValue(value: SettingValue): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** How many keys a document carries, for the export summary. */
export function countExported(file: SettingsFile): number {
  return Object.keys(file.settings).length;
}

/** Every registry key, for a "reset everything" confirmation that can name them. */
export const ALL_SETTING_KEYS: readonly string[] = SETTINGS_REGISTRY.map((e) => e.key);

/**
 * Profiles from an untrusted list, reduced to the ones that may be kept.
 *
 * The built-in ids are **reserved**: `SET-07` makes Balanced, Low power and Max
 * speed read-only, so a file that redefines one is dropped rather than allowed to
 * shadow it. A profile whose id collides with an existing one is dropped too,
 * because applying it would silently replace a profile the user still has.
 */
export function sanitiseProfiles(
  candidates: readonly ProcessingProfile[],
  alreadyHeld: readonly ProcessingProfile[] = [],
): ProcessingProfile[] {
  const taken = new Set([
    ...BUILT_IN_PROFILE_IDS,
    ...alreadyHeld.map((p) => p.id),
  ]);
  return candidates.filter((p) => !taken.has(p.id));
}