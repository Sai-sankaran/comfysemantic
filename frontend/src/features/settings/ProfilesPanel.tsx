import { useState } from 'react';
import { Button, Dialog, Input, Radio, useToast } from '../../components/ui';
import { builtInProfile, keysInProfile } from '../../settings/profiles';
import type { SettingsStore } from '../../settings/useSettingsStore';

/**
 * The Profiles manager (design `SET-07`, `D-06`, `D-29`).
 *
 * Profiles apply only to the settings the registry marks `profileable` — the
 * processing and runtime keys of §12.2. The three built-ins (**Balanced**, **Low
 * power**, **Max speed**) are read-only; a user can create from the current
 * values, duplicate, rename and delete their own.
 *
 * The active profile is the one Pipeline's Summary names (`PIP-05`), so it is
 * shown here as the first thing in the panel rather than buried in a row.
 */
export function ProfilesPanel({ store }: { store: SettingsStore }) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState('');

  const active = store.activeProfile;

  const submitCreate = () => {
    const result = store.createProfile(newLabel, { activate: true });
    if (!result.ok) {
      setProblem(result.reason);
      return;
    }
    setCreating(false);
    setNewLabel('');
    setProblem(null);
    toast({ kind: 'success', title: 'Profile created', message: newLabel.trim() });
  };

  const submitRename = () => {
    if (!renaming) return;
    const result = store.renameProfile(renaming, renameLabel);
    if (!result.ok) {
      setProblem(result.reason);
      return;
    }
    setRenaming(null);
    setProblem(null);
  };

  return (
    <section className="profiles-panel" aria-label="Processing profiles">
      <div className="profiles-head">
        <h3>Profiles</h3>
        <p className="hint">
          A profile bundles the processing and runtime settings listed under it. The
          built-in profiles are read-only.
        </p>
      </div>

      {active ? (
        <p className="profiles-active">
          Active profile: <strong>{active.label}</strong> — {active.effect}
        </p>
      ) : (
        <p className="profiles-active profiles-muted">
          No active profile; the defaults apply.
        </p>
      )}

      <Radio
        name="processing-profile"
        aria-label="Active processing profile"
        value={store.activeProfileId}
        onChange={(id) => store.applyProfile(id)}
        options={store.profiles.map((p) => ({
          value: p.id,
          label: p.label + (p.builtIn ? ' (built-in)' : ''),
          description: p.effect,
        }))}
      />

      <div className="profiles-actions">
        <Button variant="secondary" onClick={() => { setCreating(true); setProblem(null); }}>
          Create from current
        </Button>
      </div>

      {store.userProfiles.length > 0 ? (
        <ul className="profiles-list">
          {store.userProfiles.map((profile) => (
            <li key={profile.id} className="profiles-list-row">
              <span>{profile.label}</span>
              <span className="profiles-list-meta">
                {keysInProfile(profile).length} settings
              </span>
              <span className="profiles-list-buttons">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRenaming(profile.id);
                    setRenameLabel(profile.label);
                    setProblem(null);
                  }}
                >
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const name = `${profile.label} copy`;
                    const result = store.duplicateProfile(profile.id, name);
                    if (!result.ok) setProblem(result.reason);
                  }}
                >
                  Duplicate
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => store.deleteProfile(profile.id)}
                  title={`Delete ${profile.label}`}
                >
                  Delete
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">You have no profiles of your own yet.</p>
      )}

      {active ? (
        <details className="profiles-detail">
          <summary>What “{active.label}” sets</summary>
          <ul className="profiles-keys">
            {keysInProfile(active).map((key) => (
              <li key={key}>
                <code>{key}</code> = <span>{String(active.values[key])}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Create a profile"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" onClick={submitCreate}>
              Create
            </Button>
          </>
        }
      >
        <p>
          The new profile starts from the values in effect right now, so it captures what
          you are using rather than the defaults.
        </p>
        <Input
          aria-label="Profile name"
          value={newLabel}
          placeholder="Evening power"
          onChange={(e) => setNewLabel(e.target.value)}
        />
        {problem ? <p className="setting-row-error">{problem}</p> : null}
      </Dialog>

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename profile"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button variant="primary" onClick={submitRename}>
              Rename
            </Button>
          </>
        }
      >
        <Input
          aria-label="New profile name"
          value={renameLabel}
          onChange={(e) => setRenameLabel(e.target.value)}
        />
        {problem ? <p className="setting-row-error">{problem}</p> : null}
        {renaming && builtInProfile(renaming) ? (
          <p className="hint">Built-in profiles cannot be renamed.</p>
        ) : null}
      </Dialog>
    </section>
  );
}

/**
 * The row-level profile affordance (`SET-07`).
 *
 * Shown when the active profile controls the setting *and* the effective value has
 * drifted from what the profile says. It offers exactly the three actions the
 * design names: save into the profile, save as a new one, or revert to the
 * profile's value.
 */
export function ProfileAffordance({
  store,
  settingKey,
}: {
  store: SettingsStore;
  settingKey: string;
}) {
  const profile = store.activeProfile;
  const resolved = store.byKey.get(settingKey);
  if (!profile || !resolved) return null;

  const profileValue = profile.values[settingKey];
  if (profileValue === undefined) return null;

  const drifted = JSON.stringify(profileValue) !== JSON.stringify(resolved.value);
  if (!drifted) return null;

  return (
    <div className="profile-affordance" role="status">
      <span>
        Profile “{profile.label}” modified — this value is no longer the profile’s.
      </span>
      <span className="profile-affordance-buttons">
        <Button
          variant="ghost"
          onClick={() => store.saveProfileValue(settingKey, resolved.value)}
          disabled={profile.builtIn}
          title={
            profile.builtIn
              ? 'Built-in profiles are read-only; save as a new profile instead'
              : undefined
          }
        >
          Save to profile
        </Button>
        <Button
          variant="ghost"
          onClick={() => store.createProfile(`${profile.label} variant`)}
          title="Create a profile from the current values"
        >
          Save as new
        </Button>
        <Button
          variant="ghost"
          onClick={() => store.set(settingKey, profileValue, 'app')}
          title={`Restore the “${profile.label}” value`}
        >
          Revert
        </Button>
      </span>
    </div>
  );
}