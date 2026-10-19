// covers: SET-07, D-06, D-29, SET-01, SET-02, SET-03, SET-04, SET-05, SET-06, SET-08, SET-09, SET-10, SET-11
/**
 * Processing profiles (`SET-07`, `D-06`, `D-29`).
 *
 * A profile may only control the keys the registry marks `profileable`, the three
 * built-ins are read-only, and a user's profile can be created from the current
 * values, duplicated, renamed and deleted. Those are the rules this pins.
 */
import { describe, expect, it } from 'vitest';
import { SETTINGS_REGISTRY } from '../settings/registry';
import {
  BUILT_IN_PROFILES,
  PROFILEABLE_KEYS,
  applyableProfileValues,
  builtInProfile,
  effectiveProfileValue,
  findProfile,
  keysInProfile,
  profileControls,
  profileDiffers,
  profileFromCurrent,
  profileValueFor,
  uniqueProfileId,
  validateProfileLabel,
  type ProcessingProfile,
} from '../settings/profiles';

describe('the built-in profiles', () => {
  it('are the three §12.1 names, and are read-only', () => {
    expect(BUILT_IN_PROFILES.map((p) => p.id)).toEqual(['balanced', 'low-power', 'max-speed']);
    for (const p of BUILT_IN_PROFILES) {
      expect(p.builtIn).toBe(true);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.effect.length, `${p.id} has no effect line`).toBeGreaterThan(0);
    }
  });

  it('match the registry default of `proc.profile`', () => {
    expect(builtInProfile('balanced')?.id).toBe('balanced');
  });

  it('only name profileable keys', () => {
    for (const p of BUILT_IN_PROFILES) {
      for (const key of Object.keys(p.values)) {
        expect(PROFILEABLE_KEYS, `${p.id} sets the non-profileable ${key}`).toContain(key);
      }
    }
  });

  it('describe §14.6: low power is one thread, CPU only, and pauses on battery', () => {
    const low = builtInProfile('low-power');
    expect(low?.values['proc.workerThreadsMax']).toBe(1);
    expect(low?.values['runtime.device']).toBe('cpu');
    expect(low?.values['proc.batteryAware']).toBe(true);
  });

  it('describe §14.6: balanced leaves concurrency on auto so it follows the machine', () => {
    const balanced = builtInProfile('balanced');
    expect(balanced?.values['proc.workerThreadsMax']).toBe('auto');
    expect(balanced?.values['proc.batteryAware']).toBe(false);
  });
});

describe('profileable keys', () => {
  it('are exactly the registry entries marked profileable', () => {
    const fromRegistry = SETTINGS_REGISTRY.filter((e) => e.profileable).map((e) => e.key);
    expect([...PROFILEABLE_KEYS].sort()).toEqual([...fromRegistry].sort());
  });

  it('never include a setting the design leaves un-profileable', () => {
    expect(PROFILEABLE_KEYS).not.toContain('proc.profile');
    expect(PROFILEABLE_KEYS).not.toContain('proc.skipCompleted');
  });
});

describe('profileControls', () => {
  const profile = BUILT_IN_PROFILES[0];

  it('is true for a key the profile names', () => {
    expect(profileControls(profile, 'proc.workerThreadsMax')).toBe(true);
  });

  it('is false for a key the profile does not name', () => {
    expect(profileControls(profile, 'appearance.theme')).toBe(false);
  });

  it('is false when there is no profile', () => {
    expect(profileControls(undefined, 'proc.workerThreadsMax')).toBe(false);
  });

  it('ignores a profile that names a non-profileable key', () => {
    // A hand-edited settings file must not make a profile change arbitrary settings.
    const rogue: ProcessingProfile = {
      id: 'rogue',
      label: 'Rogue',
      effect: '',
      values: { 'appearance.theme': 'light' },
    };
    expect(profileControls(rogue, 'appearance.theme')).toBe(false);
    expect(profileValueFor(rogue, 'appearance.theme')).toBeUndefined();
    expect(keysInProfile(rogue)).toEqual([]);
  });
});

describe('profileDiffers', () => {
  const profile = builtInProfile('balanced');

  it('is false while the value still matches the profile', () => {
    expect(profileDiffers(profile, 'proc.workerThreadsMax', 'auto')).toBe(false);
    expect(profileDiffers(profile, 'proc.idleOnly', false)).toBe(false);
  });

  it('is true once the value has drifted from the profile', () => {
    // This is what makes the row offer Save to profile / Save as new / Revert.
    expect(profileDiffers(profile, 'proc.idleOnly', true)).toBe(true);
  });

  it('is false for a setting the profile does not control', () => {
    expect(profileDiffers(profile, 'appearance.theme', 'light')).toBe(false);
  });
});

describe('effectiveProfileValue', () => {
  it('uses the profile value when the profile matches', () => {
    expect(effectiveProfileValue(builtInProfile('low-power'), 'proc.workerThreadsMax', 1)).toBe(1);
  });

  it('keeps the drifted value rather than hiding it behind the profile', () => {
    expect(effectiveProfileValue(builtInProfile('low-power'), 'proc.workerThreadsMax', 8)).toBe(8);
  });
});

describe('creating and naming profiles', () => {
  const effective = {
    'proc.workerThreadsMax': 4,
    'proc.idleOnly': true,
    'proc.batteryAware': true,
    'appearance.theme': 'light',
  };

  it('captures the current values, not the defaults', () => {
    const created = profileFromCurrent('evening', 'Evening', effective);
    expect(created.values['proc.workerThreadsMax']).toBe(4);
    expect(created.values['proc.idleOnly']).toBe(true);
    // A non-profileable setting is never captured.
    expect(created.values['appearance.theme']).toBeUndefined();
  });

  it('says where a copy came from', () => {
    const copy = profileFromCurrent('copy', 'Balanced copy', effective, builtInProfile('balanced'));
    expect(copy.effect).toContain('Balanced');
  });

  it('falls back to the source profile for a key that is not resolved', () => {
    const copy = profileFromCurrent('copy', 'Copy', {}, builtInProfile('low-power'));
    expect(copy.values['proc.workerThreadsMax']).toBe(1);
  });

  it('makes an id that does not collide', () => {
    const existing = BUILT_IN_PROFILES;
    expect(uniqueProfileId('Evening', existing)).toBe('evening');
    const second = profileFromCurrent(uniqueProfileId('Evening', existing), 'Evening', effective);
    expect(uniqueProfileId('Evening', [...existing, second])).toBe('evening-2');
  });

  it('falls back to a usable id for an empty or punctuation-only name', () => {
    expect(uniqueProfileId('   ', [])).toBe('profile');
    expect(uniqueProfileId('***', [])).toBe('profile');
  });
});

describe('validateProfileLabel', () => {
  it('requires a name', () => {
    expect(validateProfileLabel('', [])).toMatch(/name/);
    expect(validateProfileLabel('   ', [])).toMatch(/name/);
  });

  it('caps the length at the documented 80 characters', () => {
    expect(validateProfileLabel('x'.repeat(80), [])).toBeNull();
    expect(validateProfileLabel('x'.repeat(81), [])).toMatch(/80/);
  });

  it('refuses a duplicate name, ignoring case', () => {
    const existing = [builtInProfile('balanced') as ProcessingProfile];
    expect(validateProfileLabel('Balanced', existing)).toMatch(/already exists/);
    expect(validateProfileLabel('  balanced ', existing)).toMatch(/already exists/);
    expect(validateProfileLabel('Low power', existing)).toBeNull();
  });
});

describe('findProfile and applyableProfileValues', () => {
  const mine: ProcessingProfile = {
    id: 'mine',
    label: 'Mine',
    effect: '',
    values: { 'proc.idleOnly': true, 'appearance.theme': 'light' },
  };

  it('finds a built-in and a user profile by id', () => {
    expect(findProfile([mine], 'balanced')?.label).toBe('Balanced');
    expect(findProfile([mine], 'mine')?.label).toBe('Mine');
    expect(findProfile([mine], 'nope')).toBeUndefined();
  });

  it('drops a key no profile may control when applying', () => {
    // Applying writes into the app layer, so a rogue profile naming
    // `appearance.theme` must not be able to change it.
    const applied = applyableProfileValues(mine);
    expect(applied).toEqual({ 'proc.idleOnly': true });
  });

  it('drops a key the registry does not know at all', () => {
    const future: ProcessingProfile = {
      id: 'future',
      label: 'Future',
      effect: '',
      values: { 'proc.idleOnly': true, 'some.future.key': 1 },
    };
    expect(applyableProfileValues(future)).toEqual({ 'proc.idleOnly': true });
  });
});