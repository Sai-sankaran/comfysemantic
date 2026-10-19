import {
  SETTINGS_REGISTRY,
  SETTINGS_BY_KEY,
  type SettingValue,
} from './registry';

/**
 * Processing profiles (design `SET-07`, `D-06`, `D-29`).
 *
 * A profile is a named bundle of the settings the registry marks `profileable`
 * — the processing and runtime keys of §12.2, the ones carrying "P". Editing a
 * profile-controlled setting while a profile is active does **not** silently
 * rewrite the profile: the row offers **Save to profile / Save as new / Revert**,
 * which is what this module enables by exposing `profileValuesFor` and the
 * diffing helpers the row needs.
 *
 * The three built-ins are **read-only**, as §12.1 requires. Their values come from
 * the §14.6 throttling table, which is the specification of what each profile
 * means; nothing here starts or stops work.
 */

/** One profile: a name plus the `profileable` keys it overrides. */
export type ProcessingProfile = {
  id: string;
  label: string;
  /** Built-ins cannot be edited, renamed or deleted. */
  builtIn?: boolean;
  /** One line saying what the profile does, shown under the name (`PIP-07`). */
  effect: string;
  values: Record<string, SettingValue>;
};

/** The registry keys a profile may control. */
export const PROFILEABLE_KEYS: readonly string[] = SETTINGS_REGISTRY.filter(
  (e) => e.profileable,
).map((e) => e.key);

export const BUILT_IN_PROFILE_IDS = ['balanced', 'low-power', 'max-speed'] as const;

/**
 * The three built-ins (`SET-07`), read-only.
 *
 * `auto` keeps each setting on the behaviour §14.6 describes rather than pinning
 * a core count, because the core count depends on the machine. "Low power" is the
 * one that pins values: one thread, on the CPU.
 */
export const BUILT_IN_PROFILES: readonly ProcessingProfile[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    builtIn: true,
    effect: 'Up to half the logical cores; pauses between items while you work.',
    values: {
      'proc.workerThreadsMax': 'auto',
      'proc.thumbnailThreads': 'auto',
      'proc.idleOnly': false,
      'proc.idleSeconds': 30,
      'proc.batteryAware': false,
      'runtime.threads': 'auto',
      'runtime.idleStopMinutes': 10,
      'runtime.device': 'auto',
    },
  },
  {
    id: 'low-power',
    label: 'Low power',
    builtIn: true,
    effect: 'One worker thread, CPU only, and never on battery power.',
    values: {
      'proc.workerThreadsMax': 1,
      'proc.thumbnailThreads': 1,
      'proc.idleOnly': false,
      'proc.idleSeconds': 30,
      'proc.batteryAware': true,
      'runtime.threads': 'auto',
      'runtime.idleStopMinutes': 30,
      'runtime.device': 'cpu',
    },
  },
  {
    id: 'max-speed',
    label: 'Max speed',
    builtIn: true,
    effect: 'All cores but one; runs on battery power.',
    values: {
      'proc.workerThreadsMax': 'auto',
      'proc.thumbnailThreads': 'auto',
      'proc.idleOnly': false,
      'proc.idleSeconds': 30,
      'proc.batteryAware': false,
      'runtime.threads': 'auto',
      'runtime.idleStopMinutes': 10,
      'runtime.device': 'auto',
    },
  },
];

export function builtInProfile(id: string): ProcessingProfile | undefined {
  return BUILT_IN_PROFILES.find((p) => p.id === id);
}

/** Every profile: the three built-ins plus the user's own. */
export function allProfiles(userProfiles: readonly ProcessingProfile[]): ProcessingProfile[] {
  return [...BUILT_IN_PROFILES, ...userProfiles];
}

export function findProfile(
  userProfiles: readonly ProcessingProfile[],
  id: string,
): ProcessingProfile | undefined {
  return allProfiles(userProfiles).find((p) => p.id === id);
}

/**
 * Does `profile` control this setting?
 *
 * `SET-07` scopes a profile to the `profileable` keys; a profile that names
 * anything else is ignored rather than honoured, which keeps a hand-edited
 * settings file from making a profile change arbitrary settings.
 */
export function profileControls(profile: ProcessingProfile | undefined, key: string): boolean {
  if (!profile) return false;
  if (!PROFILEABLE_KEYS.includes(key)) return false;
  return Object.prototype.hasOwnProperty.call(profile.values, key);
}

/** The value a profile would impose on a key, if any. */
export function profileValueFor(
  profile: ProcessingProfile | undefined,
  key: string,
): SettingValue | undefined {
  return profileControls(profile, key) ? profile?.values[key] : undefined;
}

/**
 * Has the effective value drifted away from what the active profile says?
 *
 * This is what makes the row show "Profile 'Balanced' modified — Save to profile
 * / Save as new / Revert": the profile still lists a value, but the setting no
 * longer matches it.
 */
export function profileDiffers(
  profile: ProcessingProfile | undefined,
  key: string,
  effective: SettingValue,
): boolean {
  if (!profileControls(profile, key)) return false;
  return JSON.stringify(profile?.values[key]) !== JSON.stringify(effective);
}

/** The profile's own value, with the effective value folded in where it drifted. */
export function effectiveProfileValue(
  profile: ProcessingProfile | undefined,
  key: string,
  effective: SettingValue,
): SettingValue {
  if (profileControls(profile, key) && !profileDiffers(profile, key, effective)) {
    return profile?.values[key] as SettingValue;
  }
  return effective;
}

/**
 * Write a profile's values into a session layer.
 *
 * Kept here, next to the rule that decides which keys a profile may write, rather
 * than in the hook: the caller passes the profile object it just built, so this
 * also works for a profile that is not in state yet.
 */
export function applyProfileToLayer(
  profile: ProcessingProfile,
  update: (values: Record<string, SettingValue>) => void,
): void {
  update(applyableProfileValues(profile));
}
export function keysInProfile(profile: ProcessingProfile): string[] {
  return PROFILEABLE_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(profile.values, key),
  );
}

/**
 * Build a user profile from the current effective values.
 *
 * `SET-07`: "Users can create from current, duplicate, rename, delete."
 */
export function profileFromCurrent(
  id: string,
  label: string,
  effective: Record<string, SettingValue>,
  copyFrom?: ProcessingProfile,
): ProcessingProfile {
  const values: Record<string, SettingValue> = {};
  for (const key of PROFILEABLE_KEYS) {
    // Prefer what the user has right now; fall back to the source profile when
    // the key is not currently resolved (it should not happen, but silently
    // dropping a key would make a duplicate subtly different).
    if (effective[key] !== undefined) values[key] = effective[key];
    else if (copyFrom && profileControls(copyFrom, key)) values[key] = copyFrom.values[key];
  }
  return { id, label, effect: copyFrom ? `Copy of ${copyFrom.label}.` : 'From your current settings.', values };
}

/** A slug that will not collide with an existing profile id or label. */
export function uniqueProfileId(label: string, existing: readonly ProcessingProfile[]): string {
  const taken = new Set(existing.map((p) => p.id));
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'profile';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** A profile name is required and must not be blank (`SET-07`, 1–80 characters). */
export function validateProfileLabel(label: string, existing: readonly ProcessingProfile[]): string | null {
  const trimmed = label.trim();
  if (trimmed.length === 0) return 'Give the profile a name.';
  if (trimmed.length > 80) return 'A profile name can be at most 80 characters.';
  if (existing.some((p) => p.label.toLowerCase() === trimmed.toLowerCase())) {
    return 'A profile with that name already exists.';
  }
  return null;
}

/**
 * The values a profile may actually write.
 *
 * A key is kept only if the registry knows it **and** the registry marks it
 * `profileable`. The second condition is the important one: applying a profile
 * writes into the app layer, so a hand-edited or imported profile that named, say,
 * `appearance.theme` would otherwise change a setting no profile owns.
 */
export function applyableProfileValues(
  profile: ProcessingProfile,
): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const key of Object.keys(profile.values)) {
    if (SETTINGS_BY_KEY.has(key) && PROFILEABLE_KEYS.includes(key)) out[key] = profile.values[key];
  }
  return out;
}