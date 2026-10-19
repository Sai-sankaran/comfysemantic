# Phase 1 — Increment 10: the Settings screen (`SET-01`–`SET-05`, `SET-08`)

| | |
|---|---|
| **Date** | 2026-10-17 |
| **Policy** | `AGENT.md` §"UI-First Implementation Strategy" — Stage A (complete the UI) |
| **Requirements** | `SET-01` (registry as the single source), `SET-02` (resolution order + origin), `SET-03` (row anatomy), `SET-04` (immediate apply, no Save), `SET-05` (settings search), `SET-08` (reset), `CTL-01`, `CTL-02`, `CTL-04`, `CTL-06`, `TST-24`, `NAV-13` (View menu consumption) |
| **Inventory** | `docs/ui-inventory.md` |

## 1. Scope decision

`§12` splits cleanly across the two stages, and only the screen half is Stage A:

| Part | Layer | Stage |
|---|---|---|
| The screen: categories, search box, row anatomy, scope chip, modified dot, reset | **UI** | **this increment** |
| The registry's *persistence*: app/library/folder scope storage, the Rust validator | **Backend** | Stage D |

So the registry was built as **typed frontend data** — which is what `SET-01` asks
for as the single source the UI generates itself from — while only the three keys
the backend already stores are written through. The screen says so in words
rather than implying a save that does not happen.

## 2. What changed

### The registry (`src/settings/registry.ts`, new)

Every setting of `design.md` §12.2 — **88 entries** across the ten categories of
§12.1 — as pure data with the §12.1 fields: `key`, `type`, `default`,
`allowedScopes`, `category`, `label`, `description`, `keywords`, `constraints`,
`restartRequired`, `profileable`, `visibleWhen`. Plus:

- `validateSetting` — the client half of the validation `SET-01` says the Rust
  validator also does. The backend stays the authority; this exists so the UI can
  refuse a bad value immediately and explain `STA-29`.
- `searchSettings` — `SET-05`: matches label, description, key and keywords, and
  *narrows* with each term rather than widening.
- `optionLabel` — `§10.14` sentence case. Enum values are identifiers
  (`high-contrast`); what the user reads is `High contrast`.
- `categoriesWithEntries` — includes a category that has a hint even with no rows,
  which is how **Shortcuts** survives (see §5).

### Scope resolution (`src/settings/resolver.ts`, new)

`SET-02` in full: folder → library → app → default, with the effective value, its
origin, whether it differs from the default, and which scopes hold an override. It
ignores a scope the entry does not allow, and ignores a stored value that no longer
validates rather than showing something unusable.

### The store (`src/settings/useSettingsStore.ts`, new)

Owns the three layers. A change to `appearance.theme`, `appearance.density` or
`appearance.textScale` is written straight through `updateAppSetting` — genuinely
persisted. Every other key is held for the session, with a banner that says so.
Deliberately **not** `localStorage`: `SET-09` forbids it as the store, and inventing
a second source of truth before the backend one exists would be worse than not
persisting.

### The screen (`features/settings/SettingsScreen.tsx`, rewritten)

§12.1's layout: the ten categories on the left, a **Search settings** box and the
category's rows on the right, **Reset category** with a confirmation, and a
changed-count badge per category.

**`SettingRow` implements the `SET-03` anatomy**: label, description, key, the
control chosen from the entry's type, a scope chip with the current scope *and* its
provenance sentence, a modified dot, **Reset** (disabled until it would do
something), and a **Requires restart** chip. `SET-05`'s Enter-jumps-and-highlights
is wired.

The legacy *Appearance & OCR* block was **removed from the operations screen** and
the operational actions (model validation, embeddings, prompt diagnostics, catalog
maintenance, Diagnostics) moved into the categories that own them
(`SettingsOperations.tsx`, gated by category). `appearance.theme`,
`appearance.density` and `appearance.textScale` would otherwise have had two
controls changing one value.

### Shared controls the screen needed (`components/ui/`)

`Switch`, `Slider`, `Textarea` and `Radio` — all four were missing from the library
while three screens were using raw controls. `CTL-02` violations closed:

| Before | After |
|---|---|
| 5 raw `<input type="radio">` (CatalogFilter ×3, SearchScreen ×2) | one `Radio` |
| 2 raw `<textarea>` (BatchRecovery, DialogueReview) | `Textarea` in BatchRecovery; the Review canvas editor stays, documented (§5) |
| no switch for any boolean setting | `Switch`, `role="switch"` |
| no slider | `Slider` over a native `range` (which `CTL-02` does not ban, and which gives correct `role="slider"` and arrow semantics for free; only the PageUp/PageDown ×5 rule is added) |

All four are now in the component gallery (`CTL-06`) with their states.

## 3. Four real defects this increment found and fixed

1. **`resolveSetting` resolved backwards.** The layer loop iterated folder → library
   → app and *overwrote* as it went, so the least specific layer (app) won whenever
   more than one was set. Caught by the resolver test's first multi-layer case. Fixed
   with a `break` on the first usable layer.
2. **Reset did not reset persisted values.** `resetCategory`/`reset`/`resetAll`
   cleared only the session layer, so "Reset category to defaults" left the three
   backend-stored keys untouched and their rows still read as changed. They now write
   the default back through `updateAppSetting`.
3. **`search.similarityMin` rejected its own documented value.** §12.2 says
   "float 0–1 **or null**"; an empty value was rejected as "must be a number". Added
   an explicit `nullable` constraint rather than inferring it from the default.
4. **Enum values were shown as labels** — `dark`, `high-contrast`, `ask` — which
   `§10.14`'s sentence case forbids. Fixed by `optionLabel`.

A fifth, in the previous increment's code, was the R-8 `libraryNavigation` flake,
now fixed (see §4).

## 4. Tests

| Suite | New |
|---|---|
| `test/settingsRegistry.test.ts` | **29** — key uniqueness, namespacing, every entry internally consistent, documented defaults transcribed, range/step/enum/hex/json/nullable validation, all ten categories, `SET-05` search semantics |
| `test/settingsResolver.test.ts` | **18** — the `SET-02` order in both directions, disallowed scopes ignored, invalid stored values ignored, structured defaults, origin wording, `canReset`, the backwards-resolution regression |
| `test/settingsScreen.test.tsx` | **25** — categories, row anatomy, the control each type implies, scope chip and its reasons, write-through vs session-only, the pending banner, search + Enter-jump, category reset with confirmation and cancel, the legacy `thumb_fit` row, and **every registry key rendering as a real row** |
| `test/controls.test.tsx` | +15 — Switch, Slider, Textarea, Radio |
| `test/componentGallery.test.tsx` | gallery now renders the four new controls |

Two test-harness problems were fixed rather than papered over: the provider mock
was static, so a write-through change never re-rendered and every write looked
like a no-op (now a real stateful mock); and `vi.fn().mockResolvedValue(...)` lost
its implementation under the suite's mock reset, crashing the operations component
(`vi.fn(async () => …)` is robust).

**Also fixed — R-8:** `libraryNavigation.test.tsx` "leaves the viewer put at a page
boundary" flaked under full-suite load. It waited on the *title*, which updates when
`setViewer` runs, but the component re-binds its capture-phase listener afterwards;
the second keypress could land first. It now waits for the *call*, then the title.
Verified: 5/5 in isolation and two consecutive clean full-suite runs.

## 5. Known gaps, stated in the UI

| Gap | Why |
|---|---|
| Library/folder scope overrides disabled | No scope persistence yet (Stage D). Each row names it: "Library and folder overrides arrive with the settings-registry integration". |
| Settings search `Enter` jump + highlight | Implemented; the 1.5 s timeout is a `window.setTimeout` tested with a class assertion rather than fake timers. |
| `SET-06` import/export, `SET-07` profiles | Next increment; the registry already marks `profileable` and the category hint points at them. |
| Shortcuts category has no rows | §20: v1 shortcuts are fixed and generated from the action registry. The category is kept and says so, rather than silently disappearing. |
| `legacy.thumb_fit` | Not a §12.2 key. Kept and labelled "Not a §12.2 setting; kept so nothing is lost" (`SET-11`) instead of dropped or given an invented key. |
| Review canvas `<textarea>` still raw | A composite region widget whose geometry is under test; migrating it belongs to the Review increment. |
| `appearance.rail` not wired to the shell's rail | The shell keeps the choice per session; the setting row exists and is honest that it is not yet the source. |

## 6. Results

- Frontend: **19 files, 342 tests passed** (16 files / 270 before).
- `npm run build` PASS; `npm run lint` **0 errors**, 14 warnings — all in files this
  increment did not touch (the pre-existing baseline).
- Backend: unchanged this increment (no backend code touched); the full suite was
  last measured at **1157 passed, 18 skipped** and the focused guards at 15 passed.

## 7. Next

**Increment 11 — `SET-06` import/export and `SET-07` profiles.** Both are pure UI
over the registry that now exists: export to JSON (with the *Include paths* option),
import with registry validation, the unknown/invalid-value list and diff preview
(`STA-29`), backup-then-apply; and the Profiles manager with the three built-ins
read-only, user profiles built from the `profileable` rows, and the
"Profile 'Balanced' modified — Save to profile / Save as new / Revert" affordance.

After that: the missing shared controls (Tabs, Tooltip, Tree), then Explore
(`docs/ui-inventory.md` §9 item 2).