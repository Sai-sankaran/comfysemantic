import {
  SETTINGS_REGISTRY,
  validateSetting,
  type SettingEntry,
  type SettingScope,
  type SettingValue,
} from './registry';

/**
 * Scope resolution (design `SET-02`).
 *
 * **Resolution order is folder → library → app → default.** The effective value
 * and where it came from are always available, because `SET-02` requires the row
 * to display the origin ("Using app default" / "Overridden for this library")
 * whether or not a value has been set.
 */

/** One layer of explicitly-set values. Absent keys fall through to the next layer. */
export type SettingLayer = Partial<Record<string, SettingValue>>;

export type SettingLayers = {
  folder: SettingLayer;
  library: SettingLayer;
  app: SettingLayer;
};

export const EMPTY_LAYERS: SettingLayers = { folder: {}, library: {}, app: {} };

/** Which layer supplied the effective value, in resolution order. */
export type SettingOrigin = 'folder' | 'library' | 'app' | 'default';

export type ResolvedSetting = {
  entry: SettingEntry;
  /** The value in effect. */
  value: SettingValue;
  /** Which layer supplied it. */
  origin: SettingOrigin;
  /** Does the effective value differ from the documented default? (`SET-03` dot) */
  modified: boolean;
  /** Scopes this setting may be overridden at (`SET-03` scope chip menu). */
  overridableScopes: readonly SettingScope[];
  /** Scopes that currently hold an explicit value for this key. */
  overriddenAt: SettingScope[];
};

/**
 * Do two setting values mean the same thing?
 *
 * Objects and lists are compared structurally, because the registry's defaults
 * are objects (`search.hybridWeights`) and a fresh literal that equals the default
 * must not read as "modified".
 */
export function sameValue(a: SettingValue, b: SettingValue): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/** `SET-02`: the most specific explicit value wins, then default. */
export function resolveSetting(entry: SettingEntry, layers: SettingLayers): ResolvedSetting {
  const order: Array<[SettingScope, SettingLayer]> = [
    ['folder', layers.folder],
    ['library', layers.library],
    ['app', layers.app],
  ];

  let value = entry.default;
  let origin: SettingOrigin = 'default';

  for (const [scope, layer] of order) {
    // A scope the setting does not allow can never supply its value, even if a
    // stale layer still carries the key.
    if (!entry.allowedScopes.includes(scope)) continue;
    const candidate = layer[entry.key];
    if (candidate === undefined) continue;
    // An invalid stored value is ignored rather than shown: the design wants the
    // effective value, and an unusable one is not it. Falling through to the next
    // *less* specific layer is right; an unusable override must not blank it.
    if (!validateSetting(entry, candidate).ok) continue;
    value = candidate;
    origin = scope;
    // `order` runs most-specific first, so the first usable layer is the answer.
    // Without this break the least specific layer (app) would overwrite it.
    break;
  }

  const overriddenAt = order
    .filter(([scope, layer]) => entry.allowedScopes.includes(scope) && layer[entry.key] !== undefined)
    .map(([scope]) => scope);

  return {
    entry,
    value,
    origin,
    modified: !sameValue(value, entry.default),
    overridableScopes: entry.allowedScopes,
    overriddenAt,
  };
}

export function resolveAll(layers: SettingLayers): ResolvedSetting[] {
  return SETTINGS_REGISTRY.map((entry) => resolveSetting(entry, layers));
}

/** The `SET-03` scope chip's wording for where the value came from. */
export function originLabel(resolved: ResolvedSetting): string {
  switch (resolved.origin) {
    case 'folder':
      return 'This folder';
    case 'library':
      return 'This library';
    case 'app':
      return 'App';
    default:
      return 'Default';
  }
}

/** The `SET-03` provenance sentence shown under the control. */
export function originDescription(resolved: ResolvedSetting): string {
  switch (resolved.origin) {
    case 'folder':
      return 'Overridden for this folder.';
    case 'library':
      return 'Overridden for this library.';
    case 'app':
      return 'Using the app value.';
    default:
      return 'Using the default.';
  }
}

/** Would resetting this setting change anything? Used to disable the Reset button. */
export function canReset(resolved: ResolvedSetting): boolean {
  return resolved.overriddenAt.length > 0 || resolved.modified;
}

/** Drop a key from one layer, restoring the next layer's value (or the default). */
export function withoutKey(layer: SettingLayer, key: string): SettingLayer {
  const next = { ...layer };
  delete next[key];
  return next;
}