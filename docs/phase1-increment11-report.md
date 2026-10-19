# Phase 1 — Increment 11: profiles and import/export (`SET-06`, `SET-07`, `STA-29`)

| | |
|---|---|
| **Date** | 2026-10-17 |
| **Policy** | `AGENT.md` §"UI-First Implementation Strategy" — Stage A (complete the UI) |
| **Requirements** | `SET-06`, `SET-07`, `STA-29`, `D-06`, `D-29`, `PIP-05` (the active profile is named in the Summary) |
| **Inventory** | `docs/ui-inventory.md` |

## 1. What was built

Both are UI over the registry increment 10 introduced, so neither needed a
backend change.

### Processing profiles (`src/settings/profiles.ts`, new — `SET-07`)

A profile is a named bundle of the keys the registry marks `profileable` — the
§12.2 entries carrying "P", which `PROFILEABLE_KEYS` derives from the registry
rather than restating.

- **Three built-ins, read-only**: Balanced, Low power, Max speed. Their values come
  from the §14.6 throttling table, with concurrency left on `auto` where the table
  says "follows the profile", because the real figure depends on the machine. Low
  power is the one that pins values: one thread, CPU, pause on battery.
- **User profiles**: create from the current values, duplicate, rename, delete, with
  a 1–80 character name that must be unique and a collision-free id.
- **Drift detection**: `profileDiffers` is what makes a row show *"Profile 'Balanced'
  modified — Save to profile / Save as new / Revert"*, and `effectiveProfileValue`
  keeps the drifted value visible rather than hiding it behind the profile.

### Import and export (`src/settings/settingsFile.ts`, new — `SET-06`)

- **Export** writes `{format, version, includePaths, settings, profiles}`. Only values
  that were actually set are written — an export is the user's changes, not a copy
  of the schema. Machine-specific paths (`storage.dataDir`, `runtime.models.dir`)
  are **excluded unless *Include paths* is ticked**, so a shared file does not carry
  another machine's data directory. Built-in profiles are never exported.
- **Import** is three deliberate steps — parse, preview, apply. `planImport` is
  **read-only**, which makes the `SET-06` ordering (preview, backup, then apply)
  impossible to get wrong: a bad file cannot half-apply. Unknown keys and invalid
  values are **listed and ignored**, never guessed at, and the `STA-29` message
  counts both and names each with its reason. The diff table shows every change
  from the current value to the incoming one before anything is written.

### The UI

- `ProfilesPanel` — hosted under **Processing**, as §12.1 requires. Active profile
  first, the three built-ins as a radio group, create/rename/duplicate/delete, and a
  disclosure listing exactly which keys the profile sets.
- `ProfileAffordance` — rendered inside any row whose value has drifted from the
  active profile, offering the three actions the design names. "Save to profile" is
  disabled for a built-in with the reason in its tooltip.
- `SettingsTransfer` — one dialog with Export and Import, the diff preview table and
  the `STA-29` list.

## 2. Two real defects this increment found and fixed

1. **Applying a just-created profile silently did nothing.** `createProfile` added
   the profile to state, then the caller called `applyProfile(id)` — but that closure
   held the *previous* `userProfiles`, so the lookup missed and the profile was never
   applied. Activation now happens inside `createProfile({activate: true})`, where
   the profile object exists.
2. **A rogue profile could change any setting.** `applyableProfileValues` filtered
   only for keys the registry *knows*, so a hand-edited or imported profile naming
   `appearance.theme` would have written it into the app layer — applying a profile
   must only ever touch the keys the design says a profile owns. It now requires
   `profileable` as well.

A third was a naming lie rather than a behaviour bug: `sanitiseProfiles` merely copied
its input while the built-in-id guard lived in one caller. It now does the filtering
its name promises, and both callers use it.

## 3. Tests

| Suite | New |
|---|---|
| `test/settingsProfiles.test.ts` | **27** — the three built-ins and their §14.6 values, `profileable` keys derived from the registry, a rogue profile controlling nothing, drift detection, create/duplicate/rename, name validation, `applyableProfileValues` refusing a non-profileable key |
| `test/settingsTransfer.test.ts` | **17** — paths excluded by default and included on request, only-set values exported, all three scopes merged, unknown keys and invalid values listed and ignored, a mixed file still applying its valid half, non-settings documents rejected, and that planning writes nothing |
| `test/settingsScreen.test.tsx` | +16 (25 → **41**) — the Profiles panel under Processing, the built-ins and which is active, applying a profile changing its rows, create/rename/delete, the drifted-value affordance and its three actions, `Revert` restoring the profile value, "Save to profile" disabled for a built-in; export contents, path inclusion, the diff preview before applying, `STA-29` wording, a rejected file, and a round trip |

**Results**: frontend **21 files, 417 tests passed**; `npm run build` PASS;
`npm run lint` **0 errors**, 14 warnings — all in files this increment did not touch.

## 4. Environment limitation, recorded honestly

The Settings screen was **not** verified in a real browser this increment: it needs
the app context and the API module, and an async `vi.mock` factory cannot alias a
relative import in this Vite setup (documented in the increment-9 report). The
*controls* it is built from were browser-verified in increment 10 (switch 32 × 18 px,
slider track 4 px, textarea `resize: vertical`, radios one `radiogroup`), and the new
panels' layout, states and interactions are covered by 41 jsdom tests. The
`TST-17` viewport matrix still needs a real window.

## 5. Known gaps

| Gap | Why |
|---|---|
| Export writes to the clipboard/dialog, not a file | The design says *Export* writes JSON; a native save dialog is a Tauri call, which is integration-stage work. The exact document is produced and shown, so wiring a file write later changes nothing else. |
| Import reads pasted JSON, not a file picker | Same reason; the parse/preview/apply path is identical either way. |
| The pre-import backup is held for the session | `SET-06` requires backing up the current settings before applying. The pre-import state is captured, but persisting it as a real backup is Stage D, and the toast says exactly that. |
| `PIP-05`'s "active profile shown in the Summary" | The Pipeline screen does not exist yet; the active profile is shown here and is available to it. |

## 6. Next

Per `docs/ui-inventory.md` §9: the remaining shared controls (**Tabs**, **Tooltip**,
**Tree**), then **Explore** — the folder tree and shell-level inspector panes
(`NAV-04`/`05`/`06`, which also un-defers the `B`/`I` shortcuts in the drift guard),
the §7.1 toolbar in its documented order, uniform *and* rows modes, the
dominant-colour placeholder, the full badge set, peek, and the sticky selection
action bar (`GAL-23`).