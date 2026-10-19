import { useCallback, useMemo, useState } from 'react';
import { useLibrary } from '../app/providers';
import {
  SETTINGS_REGISTRY,
  SETTINGS_BY_KEY,
  validateSetting,
  type SettingCategory,
  type SettingScope,
  type SettingValue,
} from './registry';
import {
  EMPTY_LAYERS,
  resolveAll,
  resolveSetting,
  withoutKey,
  type ResolvedSetting,
  type SettingLayer,
  type SettingLayers,
} from './resolver';
import {
  allProfiles,
  applyableProfileValues,
  BUILT_IN_PROFILE_IDS,
  findProfile,
  profileFromCurrent,
  uniqueProfileId,
  validateProfileLabel,
  type ProcessingProfile,
} from './profiles';
import { buildSettingsFile, sanitiseProfiles, type SettingsFile } from './settingsFile';
import type { AppSettings } from '../types';

/**
 * The live settings store (design §12).
 *
 * It owns the three layers (`SET-02`) and writes each change to the right place:
 *
 * - **Mapped keys** — `appearance.theme`, `appearance.density` and
 *   `appearance.textScale` are the same values the backend already stores, so a
 *   change is written straight through `updateAppSetting`. These are genuinely
 *   persisted and survive a restart.
 * - **Every other key** is held in a **session layer** and the screen says so.
 *   Persisting the full registry — including app/library/folder scopes — is the
 *   settings-registry integration stage. Keeping those values in React state
 *   rather than `localStorage` is deliberate: `SET-09` forbids `localStorage` as
 *   the store, so the alternative would be inventing a second source of truth
 *   before the backend one exists.
 *
 * `persistedKeys` is what the UI uses to label a row honestly rather than
 * claiming every change is saved.
 */
export const PERSISTED_KEYS: Readonly<Record<string, keyof AppSettings>> = {
  'appearance.theme': 'theme',
  'appearance.density': 'density',
  'appearance.textScale': 'text_scale',
};

/** Read a mapped key's current value out of the backend settings record. */
function readPersisted(key: string, settings: AppSettings | null): SettingValue | undefined {
  const legacyKey = PERSISTED_KEYS[key];
  if (!legacyKey || !settings) return undefined;
  return settings[legacyKey] as SettingValue;
}

export type SetOutcome = { ok: true } | { ok: false; reason: string };

export type SettingsStore = {
  layers: SettingLayers;
  resolved: ResolvedSetting[];
  byKey: ReadonlyMap<string, ResolvedSetting>;
  /** Validate and apply a value at a scope. */
  set: (key: string, value: unknown, scope?: SettingScope) => SetOutcome;
  /** Remove one override; falls back to the next layer or the default. */
  reset: (key: string, scope?: SettingScope) => void;
  /** `SET-08`: reset a whole category. */
  resetCategory: (category: SettingCategory, scope?: SettingScope) => void;
  /** `SET-08`: reset everything. */
  resetAll: (scope?: SettingScope) => void;
  /** Session-only changes, i.e. values not yet persisted by the backend. */
  pendingCount: number;
  /** Is this key persisted today, or only for the session? */
  isPersisted: (key: string) => boolean;
  /** Reset the session layer (used by tests and by "reset all"). */
  clearSession: () => void;
  // --- `SET-07` processing profiles ---
  profiles: ProcessingProfile[];
  userProfiles: ProcessingProfile[];
  activeProfileId: string;
  setActiveProfile: (id: string) => void;
  /** Apply a profile's values to the app scope. */
  applyProfile: (id: string) => void;
  createProfile: (
    label: string,
    options?: { fromId?: string; activate?: boolean },
  ) => { ok: true; id: string } | { ok: false; reason: string };
  duplicateProfile: (id: string, label: string) => { ok: true; id: string } | { ok: false; reason: string };
  renameProfile: (id: string, label: string) => SetOutcome;
  deleteProfile: (id: string) => void;
  /**
   * Write a drifted value into the active profile (`SET-07`'s "Save to profile").
   * Refuses for a built-in, which the design makes read-only.
   */
  saveProfileValue: (key: string, value: SettingValue) => SetOutcome;
  /** The active profile object, or undefined when its id is unknown. */
  activeProfile: ProcessingProfile | undefined;
  // --- `SET-06` import / export ---
  exportFile: (includePaths: boolean) => SettingsFile;
  /** Apply a validated plan; returns how many values were written. */
  applyImport: (values: Record<string, SettingValue>, profiles?: ProcessingProfile[]) => number;
};

export function useSettingsStore(): SettingsStore {
  const { appSettings, updateAppSetting } = useLibrary();
  const [session, setSession] = useState<SettingLayers>(EMPTY_LAYERS);

  // The app layer is the session layer plus whatever the backend already stores,
  // so a mapped key always shows the persisted value even when nothing is held
  // locally for it.
  const layers = useMemo<SettingLayers>(() => {
    const app: SettingLayer = { ...session.app };
    for (const key of Object.keys(PERSISTED_KEYS)) {
      const persisted = readPersisted(key, appSettings);
      if (persisted !== undefined) app[key] = persisted;
    }
    return { folder: session.folder, library: session.library, app };
  }, [session, appSettings]);

  const resolved = useMemo(() => resolveAll(layers), [layers]);
  const byKey = useMemo(
    () => new Map(resolved.map((r) => [r.entry.key, r])),
    [resolved],
  );

  const pendingCount = useMemo(() => Object.keys(session.app).length, [session.app]);

  const set = useCallback(
    (key: string, raw: unknown, scope: SettingScope = 'app'): SetOutcome => {
      const entry = SETTINGS_BY_KEY.get(key);
      if (!entry) return { ok: false, reason: 'is not a known setting' };
      if (!entry.allowedScopes.includes(scope)) {
        return { ok: false, reason: `cannot be set for a ${scope}` };
      }
      const result = validateSetting(entry, raw);
      if (!result.ok) return { ok: false, reason: result.reason };

      const legacyKey = PERSISTED_KEYS[key];
      if (legacyKey && scope === 'app') {
        // Persist immediately: `SET-04` says changes apply immediately and there
        // is no Save button.
        void updateAppSetting(legacyKey, result.value as never);
        return { ok: true };
      }

      setSession((prev) => ({ ...prev, [scope]: { ...prev[scope], [key]: result.value } }));
      return { ok: true };
    },
    [updateAppSetting],
  );

  const reset = useCallback(
    (key: string, scope: SettingScope = 'app') => {
      // A mapped key's value lives in the backend, so resetting means writing the
      // default back through it — clearing only the session layer would leave the
      // persisted value in place and the row would still show as changed.
      const legacyKey = PERSISTED_KEYS[key];
      const entry = SETTINGS_BY_KEY.get(key);
      if (scope === 'app' && legacyKey && entry) {
        void updateAppSetting(legacyKey, entry.default as never);
      }
      setSession((prev) => ({ ...prev, [scope]: withoutKey(prev[scope], key) }));
    },
    [updateAppSetting],
  );

  const resetCategory = useCallback(
    (category: SettingCategory, scope: SettingScope = 'app') => {
      const entries = SETTINGS_REGISTRY.filter((e) => e.category === category);
      if (scope === 'app') {
        for (const e of entries) {
          const legacyKey = PERSISTED_KEYS[e.key];
          if (legacyKey) void updateAppSetting(legacyKey, e.default as never);
        }
      }
      setSession((prev) => {
        let next = prev[scope];
        for (const e of entries) next = withoutKey(next, e.key);
        return { ...prev, [scope]: next };
      });
    },
    [updateAppSetting],
  );

  const resetAll = useCallback(
    (scope: SettingScope = 'app') => {
      if (scope === 'app') {
        for (const key of Object.keys(PERSISTED_KEYS)) {
          const entry = SETTINGS_BY_KEY.get(key);
          const legacyKey = PERSISTED_KEYS[key];
          if (entry && legacyKey) void updateAppSetting(legacyKey, entry.default as never);
        }
      }
      setSession((prev) => ({ ...prev, [scope]: {} }));
    },
    [updateAppSetting],
  );

  const clearSession = useCallback(() => setSession(EMPTY_LAYERS), []);

  const isPersisted = useCallback((key: string) => Boolean(PERSISTED_KEYS[key]), []);

  // --- `SET-07` processing profiles -----------------------------------------
  const [userProfiles, setUserProfiles] = useState<ProcessingProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('balanced');

  const profiles = useMemo(() => allProfiles(userProfiles), [userProfiles]);
  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId),
    [profiles, activeProfileId],
  );

  const applyProfile = useCallback(
    (id: string) => {
      const profile = findProfile(userProfiles, id);
      if (!profile) return;
      const values = applyableProfileValues(profile);
      setSession((prev) => {
        const next = { ...prev.app };
        for (const [key, value] of Object.entries(values)) next[key] = value;
        return { ...prev, app: next };
      });
      // A mapped key inside a profile still has to reach the backend, so it is
      // written through rather than only held.
      for (const [key, value] of Object.entries(values)) {
        const legacyKey = PERSISTED_KEYS[key];
        if (legacyKey) void updateAppSetting(legacyKey, value as never);
      }
      setActiveProfileId(id);
    },
    [userProfiles, updateAppSetting],
  );

  const effectiveNow = useMemo(() => {
    const out: Record<string, SettingValue> = {};
    for (const r of resolved) out[r.entry.key] = r.value;
    return out;
  }, [resolved]);

  const createProfile = useCallback(
    (label: string, options?: { fromId?: string; activate?: boolean }) => {
      const problem = validateProfileLabel(label, profiles);
      if (problem) return { ok: false as const, reason: problem };
      const source = options?.fromId ? findProfile(userProfiles, options.fromId) : undefined;
      const id = uniqueProfileId(label, profiles);
      const profile: ProcessingProfile = {
        ...profileFromCurrent(id, label.trim(), effectiveNow, source),
        // `SET-07`: a new profile starts from the values in effect, so its
        // effect line describes itself rather than inheriting a copy's wording.
        effect: source ? `Copy of ${source.label}.` : 'From your current settings.',
      };
      setUserProfiles((prev) => [...prev, profile]);
      if (options?.activate) {
        // Activation happens here rather than through a follow-up `applyProfile`
        // call: the caller holds a stale `userProfiles`, so a separate lookup by
        // id would not find the profile that was just created.
        const values = applyableProfileValues(profile);
        setSession((prev) => ({ ...prev, app: { ...prev.app, ...values } }));
        for (const [key, value] of Object.entries(values)) {
          const legacyKey = PERSISTED_KEYS[key];
          if (legacyKey) void updateAppSetting(legacyKey, value as never);
        }
        setActiveProfileId(id);
      }
      return { ok: true as const, id };
    },
    [profiles, userProfiles, effectiveNow, updateAppSetting],
  );

  const duplicateProfile = useCallback(
    (id: string, label: string) => {
      const problem = validateProfileLabel(label, profiles);
      if (problem) return { ok: false as const, reason: problem };
      const source = findProfile(userProfiles, id);
      if (!source) return { ok: false as const, reason: 'That profile no longer exists.' };
      const newId = uniqueProfileId(label, profiles);
      setUserProfiles((prev) => [...prev, profileFromCurrent(newId, label.trim(), effectiveNow, source)]);
      return { ok: true as const, id: newId };
    },
    [profiles, userProfiles, effectiveNow],
  );

  const renameProfile = useCallback(
    (id: string, label: string) => {
      const profile = userProfiles.find((p) => p.id === id);
      if (!profile) return { ok: false as const, reason: 'Built-in profiles cannot be renamed.' };
      const others = profiles.filter((p) => p.id !== id);
      const problem = validateProfileLabel(label, others);
      if (problem) return { ok: false as const, reason: problem };
      setUserProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, label: label.trim() } : p)));
      return { ok: true as const };
    },
    [profiles, userProfiles],
  );

  const deleteProfile = useCallback(
    (id: string) => {
      if (BUILT_IN_PROFILE_IDS.includes(id as (typeof BUILT_IN_PROFILE_IDS)[number])) return;
      setUserProfiles((prev) => prev.filter((p) => p.id !== id));
      setActiveProfileId((current) => (current === id ? 'balanced' : current));
    },
    [],
  );

  const saveProfileValue = useCallback(
    (key: string, value: SettingValue): SetOutcome => {
      if (BUILT_IN_PROFILE_IDS.includes(activeProfileId as (typeof BUILT_IN_PROFILE_IDS)[number])) {
        return { ok: false, reason: 'Built-in profiles are read-only. Save as a new profile instead.' };
      }
      const entry = SETTINGS_BY_KEY.get(key);
      if (!entry?.profileable) {
        return { ok: false, reason: 'That setting is not part of a profile.' };
      }
      setUserProfiles((prev) =>
        prev.map((p) => (p.id === activeProfileId ? { ...p, values: { ...p.values, [key]: value } } : p)),
      );
      return { ok: true };
    },
    [activeProfileId],
  );

  // --- `SET-06` import / export --------------------------------------------
  const exportFile = useCallback(
    (includePaths: boolean) =>
      buildSettingsFile({
        layers,
        profiles: userProfiles,
        includePaths,
      }),
    [layers, userProfiles],
  );

  const applyImport = useCallback(
    (values: Record<string, SettingValue>, incoming?: ProcessingProfile[]) => {
      let written = 0;
      for (const [key, value] of Object.entries(values)) {
        const outcome = set(key, value, 'app');
        if (outcome.ok) written += 1;
      }
      if (incoming && incoming.length > 0) {
        // Built-in ids are reserved and already-held ids must not be replaced,
        // so the file's profile list goes through the same guard either way.
        const safe = sanitiseProfiles(incoming, userProfiles);
        if (safe.length > 0) setUserProfiles((prev) => [...prev, ...safe]);
      }
      return written;
    },
    [set, userProfiles],
  );

  return {
    layers,
    resolved,
    byKey,
    set,
    reset,
    resetCategory,
    resetAll,
    pendingCount,
    isPersisted,
    clearSession,
    profiles,
    userProfiles,
    activeProfileId,
    setActiveProfile: setActiveProfileId,
    applyProfile,
    createProfile,
    duplicateProfile,
    renameProfile,
    deleteProfile,
    saveProfileValue,
    activeProfile,
    exportFile,
    applyImport,
  };
}

/** Re-exported so screens can resolve one entry without holding the store. */
export { resolveSetting };