# ComfyPanel Studio — Implementation Progress

| | |
|---|---|
| **Policy** | `agent.md` — Continuous Project Implementation Policy, **UI-First strategy** |
| **Authority** | `design.md` (normative) · `implementation-roadmap.md` (order/gates) |
| **Audit** | `report.md` · **UI inventory** `docs/ui-inventory.md` |
| **Started** | 2026-10-16 |
| **Last updated** | 2026-10-17 |

> **Strategy change (2026-10-17).** The working order is now
> **UI completion → UI audit → integration with existing code → new backend
> capability** (`AGENT.md` §"UI-First Implementation Strategy"). The
> requirement-by-requirement UI inventory is `docs/ui-inventory.md`; the Stage C
> UI-completeness gate is tracked there and re-evaluated as screens land.
> **The settings registry is no longer the planned next increment**: its *screen*
> is UI work (Stage A) and its registry/scopes/persistence is backend work
> (Stage D) — see `docs/ui-inventory.md` §2.

This is the running log the policy requires: what has been implemented, how it was
verified, what was deliberately deferred, and what is next. It is updated after
every increment. Individual substantive increments also get a dated report under
`docs/`.

## Verification baseline (measured on this tree)

| Check | Command | Baseline result |
|---|---|---|
| Backend | `.venv\Scripts\python.exe -m pytest -q -p no:randomly` | 1157 passed, 18 skipped, exit 0 (unchanged this increment; no backend code touched) |
| Frontend build | `npm run build` (in `frontend/`) | PASS |
| Frontend lint | `npm run lint` | exit 0, 14 warnings (all pre-existing files) |
| Frontend tests | `npm run test` | 22 files, 437 tests passed |
| Rust | `cargo check` (in `src-tauri/`) | exit 0 (1 pre-existing warning) — not run this increment; no Rust was changed |
| Cropper SHA-256 | `panel_folder_cropper_v11.py` | `6A120FAF…C62AD0A` |

## Increment log

| # | Increment | Defects | Status | Report |
|---|---|---|---|---|
| 1 | RPC allowlist drift: allowlist `get_adjacent_image` + `start_folder_ocr`; cross-language parity guard; frontend tests | R-1, R-4 | **Done, verified** | `docs/phase1-increment1-report.md` |
| 2 | Documentation drift: schema v15, migration history, `app_settings`, React 19; doc-drift guard | R-7 | **Done, verified** | this file §Increment 2 |
| 3 | Appearance: theme setting dark/light/high-contrast (persisted + applied) | D-14 | **Done, verified** | `docs/phase1-increment3-report.md` |
| 4 | Appearance: typography/dimension tokenisation + persisted density + text scale | D-16 | **Done, verified** | `docs/phase1-increment4-report.md` |
| 5 | Appearance: first-paint sync (apply cached theme/density/scale before React renders) | D-14, D-16 | **Done, verified** | `docs/phase1-increment5-report.md` |
| 6 | Shared controls: one drawn `Checkbox`, migrate all hand-rolled ones; component gallery (`CTL-06`) | CTL-01/02/06, VIS-06 | **Done, verified** | `docs/phase1-increment6-report.md` |
| 7 | Shared controls: replace native `<select>` with a custom ARIA listbox | CTL-02 | **Done, verified** | `docs/phase1-increment7-report.md` |
| 8 | Action registry: one typed source for the palette, shortcuts, overlay and menus; NAV-32 conflict guard; Appendix A drift guard | NAV-24/25/26/30/31/32, TST-16 | **Done, verified** | `docs/phase1-increment8-report.md` |
| 9 | **Application shell**: five-destination rail, top bar (library switcher, breadcrumb, View menu, System chip + popover), tray + job drawer, view history; shared Popover | NAV-01/02/03/07/10/11/12/13/14/20, CTL-01 | **Done, verified** | `docs/phase1-increment9-report.md` |
| 10 | **Settings screen**: settings registry transcribed from `design.md` §12.2 (88 entries), scope resolution, row anatomy, search, reset; four missing shared controls (`Switch`, `Slider`, `Textarea`, `Radio`) | SET-01/02/03/04/05/08, CTL-01/02/04/06, TST-24 | **Done, verified** | `docs/phase1-increment10-report.md` |
| 11 | **Settings profiles and import/export**: three read-only built-ins from the §14.6 table, user profile CRUD, the drifted-value affordance, read-only import planning with a diff preview and the `STA-29` ignored list | SET-06, SET-07, STA-29 | **Done, verified** | `docs/phase1-increment11-report.md` |
| 12 | **Last three shared controls**: `Tabs` (ARIA tabs pattern; now also the shell's workspace strip), `Tooltip` (600 ms hover, instant focus, `NAV-43`), `Tree` (Browse/Select modes, tri-state, pin, §5.7 status) | CTL-01, LIB-06/07/08, NAV-43 | **Done, verified** | `docs/phase1-increment12-report.md` |
| 13 | **Explore**: `[Folder tree][Gallery][Inspector]`, toolbar in §7.1 order, uniform + justified rows, badges, peek, lasso, selection action bar, per-folder view memory, `STA-*` states; `NAV-04`/`05` `B`/`I` via a new shell-panes context | GAL-01…GAL-23, LIB-06/09, NAV-04/05, STA-02…06 | **Done, verified** | `docs/phase1-increment13-report.md` |
| 14 | **Audit against `design.md` v1.4 Appendices D–J**: `docs/progress.md` (status by phase and requirement), `docs/audit.md` (all 14 `VERIFY` items + assumptions A1–A6), `docs/open-questions.md` (owner decisions) | Phase 0 | **Done** | these files |
| 15 | **Inspector, full section set**: `INS-02` order, `INS-03` absence, `INS-04` preview, `INS-05`/`05a` file, `INS-06` generation, `INS-07` workflow JSON on demand, `INS-08` tags/rating/favourite/notes autosave, `INS-09` processing, `INS-10` comic page, `INS-11` comic panel | INS-02…INS-11 | **Done, verified** | `docs/phase1-increment15-report.md` |
| 16 | **Table view** (Appendix E.2): Grid\|Table toggle, three column sets, three-stop sort cycle, density metrics, virtualised rows, keyboard parity, columns menu with Move left/right and Reset, truncation + tooltips, CSV of visible columns, `role="grid"` | TBL-01…TBL-10, FLG-11 | **Done except `TBL-10`** (needs budget B5) | `docs/phase1-increment16-report.md` |
| 17 | **Hide, Pick, Reject** (Appendix E.1): `items.flag`/`items.hidden`, `setFlag`/`setHidden` source seam, hidden exclusion as a query mode, "(N hidden)" count, Rejected/Picks filters, dimmed rejected cards, Hidden view, batch hide-all-rejected, `NAV-51` Undo toast | FLG-01…FLG-11 | **Done** | `docs/phase1-increment17-report.md` |
| 18 | **Privacy blur** (Appendix E.3): provider + hook, `PrivacyImage` (the one masked surface), `MaskedText`, `Ctrl+Shift+B`, tray chip, `PRV-06` reveal, `PRV-08` sensitive folders, `E.5`'s six new settings in a new `privacy` category | PRV-01…PRV-10 | **Done** (three surfaces wired of eleven) | `docs/phase1-increment18-report.md` |

### Increment 1 — RPC allowlist drift (R-1, R-4)

Cross-page viewer navigation was broken because `get_adjacent_image` was declared
in `frontend/src/api.ts` and called by `LibraryScreen.tsx` but absent from the
Rust `ALLOWED_METHODS`, so the shell rejected it before the worker. Python tests
bypassed the shell and passed, which is why the audit's `logic-audit.md` claim
was wrong. `start_folder_ocr` had the same gap.

- Fix: added both to `ALLOWED_METHODS` (52 entries) — `src-tauri/src/lib.rs`.
- Guard: `tests/test_rpc_contract_drift.py` now extracts `api.ts`'s RPC methods
  and asserts the Rust list admits them (reads the Rust source, not the worker).
- Frontend: `frontend/src/test/adjacentImage.test.ts`,
  `frontend/src/test/libraryNavigation.test.tsx`.
- Verified: focused 27 passed; full backend 1108 passed; `cargo check` exit 0;
  frontend build/lint/test pass; cropper hash unchanged.
- Full detail: `docs/phase1-increment1-report.md`.

**Limitation.** No end-to-end Rust/Tauri integration test exists; the guard is a
static/contract check plus api-layer frontend tests (`TST-01` exe-parity still
outstanding).

### Increment 2 — Documentation drift (R-7)

The audit found the documents contradicted the code. Corrected without erasing
their measurement history:

- `docs/DATABASE_SCHEMA.md`: header + footer now **v15**; Migration History table
  extended with v11–v15; added the missing `app_settings` (v15) table section.
- `docs/VERIFICATION_REPORT.md`: dated 2026-10-16 correction block stating the
  current schema (v15) and that frontend tests now exist; the historical pass
  counts are left intact and marked historical.
- `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`: React 18 → **19**.
- Guard: `tests/test_doc_drift.py` (new, 3 tests) pins the schema version
  (header + footer), requires every migration to have a history row, and requires
  the architecture docs to name the installed React major — all derived from
  `backend/database.py` and `frontend/package.json`, so a future migration or
  React bump fails the test until the prose is updated.

Verified: `pytest tests/test_doc_drift.py -q -p no:randomly` → 3 passed; full
backend 1108 passed; guard demonstrated non-vacuous (stale "v10" → mismatch).

### Increment 3 — Appearance: theme (D-14)

Added a persisted **theme** setting and the **light** and **high-contrast**
palettes, replacing the single dark palette.

- Backend: `theme` key in `_APP_SETTING_RULES` (`dark` | `light` |
  `high-contrast`, default `dark`) — reuses the existing `app_settings` store and
  its validation/persistence/reset.
- Frontend: `Theme` type + `AppSettings.theme` + `THEME_OPTIONS`; `providers.tsx`
  applies `document.documentElement.dataset.theme`; `tokens.css` gains
  `:root[data-theme='light']` / `[data-theme='high-contrast']` token blocks
  (palette-only overrides); the one stray hard-coded colour in `App.css` moved to
  `var(--border-hover)`; a Theme `SegmentedControl` in Settings.
- Tests: backend `tests/unit/test_app_settings_contract.py` (default, each value
  accepted, invalid values rejected, restart survival); frontend
  `appSettings.test.tsx` (root element receives stored/default theme; update
  persists and re-applies).
- Verified: focused backend **58 passed**; frontend **129 passed**; build + lint
  pass; all three palettes rendered and screenshotted (legible in each).
- Limit: no first-paint sync yet (theme applies after the async settings read);
  density/text-scale deferred (§ Remaining 2). Both were subsequently addressed:
  density/text-scale in increment 4, first-paint sync in increment 5. Full detail:
  `docs/phase1-increment3-report.md`.

### Increment 4 — Appearance: tokenisation, density and text scale (D-16)

The prerequisite for a *real* (not partial) density/text-scale feature was
migrating the hard-coded sizes so a setting reaches every value. Split into a
pure refactor (4a) and the settings (4b), both appearance-preserving at the
defaults.

**4a — tokenise (no behaviour change at defaults).**

- `tokens.css`: added `--text-scale: 1` and rebuilt the type scale on it —
  `--fs-2xs` (new, 11px), `--fs-xs`/`--fs-sm`/`--fs-md`/`--fs-lg`/`--fs-xl` are
  now `calc(<px> * var(--text-scale))`. Added density tokens
  (`--control-pad-y`, `--control-h`, `--row-pad-y`, `--row-pad-y-tight`,
  `--row-gap`) whose `:root` values equal the previous literals, plus
  `[data-density='compact'|'spacious']` override blocks (no font-size change).
- `App.css`: 24× `font-size: 11px` → `var(--fs-2xs)`, 3× `12px` → `--fs-xs`,
  `13px` → `--fs-sm`, `18px` → `--fs-lg`, the notice-bar dismiss glyph
  `16px` → `calc(16px * var(--text-scale))`; control padding/height and the
  table / diag-table / kv-row paddings and `.row`/`.toolbar` gaps moved to the
  density tokens. `index.css` body `14px` → `var(--fs-md)`. `workbench.css`
  fixed `line-height: 18px` → `calc(18px * var(--text-scale))`. Its type was
  already tokenised.
- Result: `grep 'font-size:\s*[0-9]'` over `frontend/src/**/*.css` → no matches.

**4b — settings.**

- Backend: `density` (`compact`|`comfortable`|`spacious`, default
  `comfortable`) and `text_scale` (int, 80–200, step 10, default `100`) in
  `_APP_SETTING_RULES`; `_validate_app_setting` gained an `int` branch that
  rejects `bool`/float/string and enforces min/max/step.
- Frontend: `Density` type, `AppSettings.density`/`text_scale`, `DENSITY_OPTIONS`,
  `TEXT_SCALE_VALUES` (single source shared with the backend bounds by value);
  `providers.tsx` applies `data-density` and `--text-scale`; Settings gains a
  Density `SegmentedControl` and a Text scale `<select>` (80–200%); both added
  to the scoped reset.
- Tests: `test_app_settings_contract.py` (+26: defaults, each valid value,
  invalid values incl. `bool`/float/out-of-range/off-step, restart survival);
  `appSettings.test.tsx` (+4); fixtures updated.
- Verified: focused backend **84 passed**; frontend **140 passed**; build + lint
  pass; a served preview rendered all three themes × compact/comfortable/spacious
  × 80–150% and every frame was legible (screenshot). Full detail:
  `docs/phase1-increment4-report.md`.

### Increment 5 — First-paint appearance sync (D-14, D-16)

Removed the flash a light / high-contrast / scaled-up user saw while the catalog
settings load.

- New `frontend/src/app/appearance.ts`: `applyAppearance` (validated write of
  `data-theme`/`data-density`/`--text-scale`), `cacheAppearance` and
  `readCachedAppearance` (both validate against the same allowlists, so a
  hand-edited/corrupt cache entry is ignored, never trusted).
- `main.tsx` applies the cached appearance **before** `createRoot(...).render`.
  CSP is `script-src 'self'`, so an inline `<script>` in `index.html` is not
  available — the module bundle is the only pre-paint hook.
- `providers.tsx` reconciles with the canonical values once settings load and
  refreshes the cache; while loading (or after a failed read) it applies
  *nothing*, so the cache — the last canonical value — is not clobbered by the
  defaults. With no cache the `:root` defaults (dark/comfortable/100%) apply.
- Tests: `appearance.test.ts` (apply / ignore illegal / corrupt-JSON / partial /
  round-trip) and a provider test that the cache is written from canonical values.
- Verified in a real browser (served `dist`): planted cache → reload →
  `data-theme=light`, `data-density=spacious`, `--text-scale=1.5` on the root
  while the RPC read failed (proving no clobber); no cache → attributes unset;
  `--fs-md` computed `14px` at 100% and `21px` at 150%. Full detail:
  `docs/phase1-increment5-report.md`.

**Limitation.** The cache is refreshed only after a *successful* settings load,
so the very first launch of a light-theme user still shows one dark frame (no
cache exists yet). That is inherent to an async canonical store; a synchronous
settings file is the roadmap's eventual answer (Phase 1 item 10).

### Increment 6 — Shared controls and the component gallery (CTL-01/02/06)

Roadmap Phase 1 item 2. The acceptance gate names the gallery: *"Every shared
control is represented in the component gallery across themes, densities, focus,
disabled, loading and error states."*

- **One checkbox control (CTL-01/02).** `Checkbox.tsx` rewritten: still a real
  `<input type="checkbox">` (native keyboard/label semantics) but **drawn** —
  `appearance: none` plus a token-coloured tick — so it is not the browser
  default. New props `ariaLabel`, `className`, `title`, `children` (composite
  rows) and `indeterminate` (the partial "select all" dash). Inline raw-px styles
  removed; wrapper is a `.checkbox` class. `VIS-06`'s 3 px corner is a new
  `--radius-checkbox` token. All six hand-rolled checkboxes (Search chips,
  Indexing "Skip completed" + stage rows, Batch Recovery select-all / header /
  rows) now use it.
- **Component gallery (CTL-06).** New `features/gallery/ComponentGallery.tsx`
  renders every control family in every state, plus the **theme, density and
  text-scale matrices on one page**. To allow that, the theme/density selectors
  in `tokens.css` were generalised from `:root[data-…]` to `[data-…]`. Reached at
  **Settings → Diagnostics → Component gallery** (a hidden `gallery` destination,
  not a rail item). A standalone no-backend fixture
  (`harness/gallery.html` → `dist-harness/gallery.html`) is the artefact for
  visual regression (TST-19).
- Tests: new `controls.test.tsx` (11) and `componentGallery.test.tsx` (7) — the
  first tests of the primitives themselves. Frontend **9 files, 158 passed**;
  build/lint pass.
- Verified in a served build: density heights 24/28/32 px, text-scale control
  font 9.6/12/18/24 px, three distinct palettes, checkbox radius 3 px with a
  legible drawn tick; screenshot captured. Full detail:
  `docs/phase1-increment6-report.md`.

**Limitation.** `<Select>` still wraps a native `<select>` — `CTL-02`'s remaining
gap; replacing it touches all 11 call sites and needs its own keyboard/ARIA test
pass. **Subsequently addressed in increment 7.** No pixel baselines yet
(`TST-19`). The gallery is a fixture, not the full `DGN-*` Diagnostics surface.

### Increment 7 — Custom `<Select>` listbox (CTL-02)

- `components/ui/Select.tsx` rewritten as an ARIA 1.2 **select-only combobox**:
  a `<button role="combobox">` trigger and a `role="listbox"` popup of
  `role="option"` items. Arrow keys (open at the selection, then move, skipping
  disabled), Home/End, Enter/Space, Escape, Tab and type-ahead; outside
  pointer-down closes; focus returns to the trigger after a commit. The selected
  option carries a check mark, not just colour.
- **Drop-in API**: the change handler still receives `{ target: { value } }`, so
  all **11 call sites compiled unchanged**. Options come from an `options` prop
  or, for compatibility, `<option>` children.
- Styling on tokens + density, so it follows every theme/density/text scale.
- Tests: new `select.test.tsx` (11); `workbenchEditing.test.tsx`'s two
  `selectOptions` interactions updated to click the trigger + option. Frontend
  **10 files, 168 passed**; build/lint pass; `grep '<select'` finds only
  comments; verified in a served build (0 native selects, click/keyboard/outside-click
  all behave, theme panes recolour the listbox). Full detail:
  `docs/phase1-increment7-report.md`.

**Limitation.** No portal/flip (a menu at the very bottom of a scroll container
could clip); single-select only; no pixel baselines yet (`TST-19`).

### Increment 8 — Action registry (NAV-24/25/26/30/31/32)

Roadmap Phase 1 item 3. Before this there was no registry at all: `AppShell`
string-compared `'/'` and `Ctrl+K` by hand, hard-coded five Options-menu items,
and hard-coded `/  Ctrl+K` into the search placeholder — so a shortcut existed in
three unreconciled places and Appendix A ("generated from the action registry")
had no generator.

- **Registry** (`src/app/actions.ts`): the seven documented `NAV-30` fields
  (`id`, `label`, `icon`, `shortcut`, `contexts`, `enabledWhen`, `run`) plus one
  optional narrowing field, `surfaces`. Shortcut parsing/normalisation/formatting
  and event matching; `isEditableTarget` + `isUnmodifiedShortcut` implement
  `NAV-26`; `findShortcutConflicts` implements `NAV-32` and treats `global` as
  overlapping every context; `ActionRegistry` throws on a duplicate id.
- **Actions** (`src/app/shellActions.ts`): 13 actions, **only the four that
  Appendix A defines for actions that actually exist** carry a shortcut
  (`mod+k`, `?`, `/`, `mod+,`). `SHELL_REGISTRY` is a module-scope instance, so
  every surface shares one registry.
- **Surfaces:** new `CommandPalette` (`NAV-24`, with `Search for "…" in <library>`
  prepended, disabled rows greyed with their reason) and `ShortcutOverlay`
  (`NAV-25`, grouped and searchable); `useActionHotkeys` is a single registry-driven
  keydown dispatcher; `AppShell` now derives its menu, its placeholder hint and
  its shortcut handling from the registry.
- Tests: `actions.test.ts` (26), `actionSurfaces.test.tsx` (22),
  `shellActions.test.tsx` (12), and `tests/test_action_registry_drift.py` (7).
  Frontend **13 files, 228 passed**; build + lint exit 0 with no new warnings;
  focused backend **91 passed**.
- **Appendix A drift guard (`TST-16`).** Parses Appendix A out of `design.md` and
  the shortcut declarations out of `shellActions.ts`, and requires them to agree:
  no invented key, every design shortcut implemented or explicitly deferred with
  a reason, no stale deferral. 62 of the 66 appendix shortcuts are deferred
  (their screens do not exist yet) with named reasons, so the gap is bounded and
  the guard forces it to shrink. A parser self-check failed loudly on the first
  run and caught a real bug (the bare `+` key was silently dropped); four
  injected mutations proved each direction of the guard fires.
- Verified live in a browser via a new backend-free fixture
  (`harness/actions.html` → `dist-harness/harness/actions.html`), since the real
  app needs Tauri: Ctrl+K/`?` dispatch, focus, context filtering, the typed-text
  search row, Enter running an action, and `enabledWhen` greying exactly two
  rows.

**Limitations.** Most of Appendix A is still unimplemented by design (Explore,
viewer, reader, review and the five-destination rail do not exist), and is
enumerated in the drift guard rather than silently ignored. No context menus yet
(`NAV-41`–`NAV-43` need targets that do not exist). `NAV-24`'s "plus settings by
name" needs the settings registry (`SET-*`, next increment). Full detail:
`docs/phase1-increment8-report.md`.

## UI-first strategy (from increment 9)

The required order is **UI completion → UI audit → integration → new backend
capability**. `docs/ui-inventory.md` is the requirement-by-requirement inventory,
marked against the real code, and is the authority for "what is left of the UI".

The previously planned next increment — "settings registry with scopes" — was
**rejected as the next task**: `SET-01`/`SET-02`/`SET-09` are backend work for
Stage D, while the Settings *screen* is Stage A UI work and is still outstanding.
Increment 9 therefore built the shell instead, the frame every remaining screen
lives in.

### Increment 9 — Application shell (`NAV-01`–`NAV-14`, `NAV-20`)

- **Navigation model** (`app/navigation.ts`, rewritten): the design's five
  destinations, with the old seven screens demoted to *workspaces* inside them
  (Panel Studio → Pipeline → Tools `PIP-12`; Batch Recovery → Review → Failed items
  `REV-03`). Every old screen is still reachable. `coerceView` keeps a view
  internally consistent so a stale restore never renders nothing.
- **View history** (`app/useViewHistory.ts`, new): `NAV-20`, depth 100, forward
  history dropped on a new push, no entry for the current view.
- **Shell components** (new): `Rail`, `LibraryMenu`, `Breadcrumb`, `ViewMenu`,
  `SystemChip`, `Tray`, and `components/ui/Popover.tsx` — the shared menu/popover
  primitive (`CTL-01`) the four popovers use.
- **Registry**: `alsoShortcut` so one action can own two keys (Settings is
  `Ctrl+5` **and** `Ctrl+,`); `ActionContextName` is now `'global' | DestinationId`;
  13 actions → 22.
- **Parity rule**: the five `nav.*` actions are written out, not generated, because
  the Appendix A drift guard parses `shellActions.ts` as text; a new test asserts
  they agree with `DESTINATIONS` instead.
- Tests: `navigation.test.ts` (9), `viewHistory.test.ts` (9), `popover.test.tsx`
  (7), `shellActions.test.tsx` rewritten (25). Frontend **16 files, 269 passed**;
  focused backend guards **15 passed**; build PASS; lint 0 errors and no new
  warnings.
- **Browser-verified** via a new backend-free harness
  (`harness/shell.html` → `dist-harness/harness/shell.html`), with labelled fixture
  data. Measured rail 200 px, top bar 44 px, tray 28 px, the documented breadcrumb,
  all three popovers, and no console errors.
- **Defect found and fixed by that verification:** the page body scrolled
  horizontally because the top bar's children had fixed minimum widths.
  `TST-17`/`NAV-06` forbid that; the search box now shrinks, the breadcrumb can
  collapse, and below the 900 px supported minimum secondary labels become icons.
  Re-measured clean at 742 px.
- Gaps are stated in the UI rather than faked: the library health ring, **Manage
  libraries…**, the three `browse.*` View-menu rows, the worker-state and cache
  rows, the Review badge and the tray's selection count are all disabled or empty
  **with the reason shown**; the quick switcher and Diagnostics page are registered
  without a shortcut so the palette names the gap.
- Deferred Appendix A shortcuts shrank **62 → 54**: `Ctrl+1…Ctrl+5`,
  `Ctrl+Shift+L`, `Ctrl+J`, `Alt+←`, `Alt+→` now ship.
- Full detail: `docs/phase1-increment9-report.md`.

### Increment 10 — Settings screen (`SET-01`–`SET-05`, `SET-08`)

The remaining item in the first group of the UI order. The registry was built as
**typed frontend data** (`src/settings/registry.ts`, 88 entries transcribed from
`design.md` §12.2) because `SET-01` makes it the single source the UI generates
itself from; only the three keys the backend already stores are written through,
and the screen says in words when a change is session-only rather than implying a
save.

- **Scope resolution** (`src/settings/resolver.ts`): `SET-02` in full —
  folder → library → app → default, with the effective value, its origin, and the
  provenance sentence the row displays.
- **Screen**: §12.1's ten categories, the Search-settings box with Enter-jumps-and-
  highlights, the `SET-03` row anatomy (label, description, key, type-appropriate
  control, scope chip with its menu, modified dot, Reset, Requires-restart chip),
  per-category changed counts, and reset with confirmation.
- **Four shared controls** that the library was missing while three screens used raw
  ones: `Switch` (`role="switch"`, `CTL-04`), `Slider` (4 px track, PageUp/PageDown
  ×5), `Textarea`, `Radio`. Five raw radio inputs and one raw textarea are now the
  shared components (`CTL-02`). All four are in the component gallery (`CTL-06`).
- The legacy *Appearance & OCR* block was removed from the operations screen and
  the operational actions moved into the categories that own them, so
  theme/density/text-scale cannot have two controls changing one value.
- **Four real defects found and fixed**, each by a test written first:
  `resolveSetting` resolved *backwards* (the app layer overwrote the more specific
  one); reset did not reset *persisted* values; `search.similarityMin` rejected its
  own documented `null`; enum values were shown as labels instead of sentence case.
- Tests: `settingsRegistry.test.ts` (29), `settingsResolver.test.ts` (18),
  `settingsScreen.test.tsx` (25, including "every registry key renders as a real
  row"), `controls.test.tsx` (+15). Frontend **19 files, 357 passed**; build PASS;
  lint 0 errors and no new warnings.
- **Browser-verified** through the component gallery: the switch measures exactly
  32 × 18 px with `aria-checked`, the slider track 4 px, the textarea
  `resize: vertical`, the radios a single `radiogroup` with a round dot, and no
  horizontal overflow. That last measurement caught the shared `input` padding
  forcing a 12 px slider track, which is fixed.
- Full detail: `docs/phase1-increment10-report.md`.

### Increment 11 — Profiles and import/export (`SET-06`, `SET-07`, `STA-29`)

Both are UI over the registry increment 10 introduced, so neither needed a backend
change.

- **Profiles** (`src/settings/profiles.ts`): the three read-only built-ins
  (Balanced / Low power / Max speed) with values from the §14.6 throttling table;
  `profileable` keys derived from the registry rather than restated; user profiles
  with create-from-current, duplicate, rename, delete and unique naming; and the
  drift detection that makes a row offer **Save to profile / Save as new / Revert**.
- **Import/export** (`src/settings/settingsFile.ts`): export writes the values that
  were actually set and excludes machine-specific paths unless *Include paths* is
  ticked; import is **parse → preview → apply**, and `planImport` is read-only, so a
  bad file cannot half-apply. Unknown keys and invalid values are listed and
  ignored with the `STA-29` count; the diff table shows every change first.
- **UI**: `ProfilesPanel` under Processing (§12.1), the row-level
  `ProfileAffordance`, and one `SettingsTransfer` dialog with Export and Import.
- **Two real defects fixed**: applying a just-created profile silently did nothing
  (the caller's closure held the pre-create list, so the id lookup missed);
  `applyableProfileValues` let a rogue profile write a *non-profileable* setting.
- Tests: `settingsProfiles.test.ts` (27), `settingsTransfer.test.ts` (17),
  `settingsScreen.test.tsx` (+16 → 41). Frontend **21 files, 417 passed**; build
  PASS; lint 0 errors and no new warnings.
- Full detail: `docs/phase1-increment11-report.md`.

### Increment 12 — The last three shared controls (`CTL-01`, `LIB-06`–`08`)

The three controls `docs/ui-inventory.md` §9 listed as missing. Built here because
they are prerequisites for the next screens, not speculatively.

- **`Tabs`** (`components/ui/Tabs.tsx`): the ARIA tabs pattern with roving tabindex,
  arrow movement with wrap, `Home`/`End`, and disabled-skip. **The shell's workspace
  strip now uses it** instead of hand-written buttons and 30 lines of CSS — the
  `CTL-01` point applied to markup as well as widgets.
- **`Tooltip`** (`components/ui/Tooltip.tsx`): 600 ms hover delay, instant on keyboard
  focus, 280 px maximum, optional shortcut (`NAV-43`), `role="tooltip"` via
  `aria-describedby` so it describes rather than renames, `Escape` dismisses. It
  calls the child's own handlers alongside its own, so wrapping is additive.
- **`Tree`** (`components/ui/Tree.tsx`): `LIB-06`/`07`/`08` in one component, with
  Browse and Select as a **discriminated props union** so no call site can pass the
  wrong shape. Tri-state roll-up, recursive checking, pin that never changes the
  selection, and §5.7 status wording instead of a colour alone.
- **Three defects fixed**: tabs moved the selection without moving focus (caught by
  the two-press wrap test); `Tree`'s loose union `onChange` forced casts; and three
  lint regressions of my own (self-referencing `const` arrows, a `Set` rebuilt every
  render inside `useCallback`, a ref read during render).
- **Browser-verified** in the component gallery: `tablist` with exactly one
  `aria-selected` and the rest `tabindex="-1"`; both trees with the right
  `aria-multiselectable`; 32 px row height; selected row `--bg-3` with the 2 px inset
  accent bar; 16 px-per-level indent; tooltip `role="tooltip"` at a 280 px
  max-width after the 600 ms delay; no horizontal overflow.
- **Honest limit**: the tooltip's *keyboard-focus* path could not be exercised in the
  browser pane (`document.hasFocus()` is `false` there, so a programmatic `focus()`
  fires nothing). It is covered by `fireEvent.focus` in the test suite instead, and
  is not claimed as a browser check.
- Tests: `navigationControls.test.tsx` (19). Frontend **22 files, 437 passed**;
  build PASS; lint 0 errors and no new warnings.
- Full detail: `docs/phase1-increment12-report.md`.

## Remaining Phase 1 work (non-blocked subset)

Ordered by dependency; each is a candidate next increment:

1. ~~**Appearance: theme**~~ — **done (increment 3).**
2. ~~**Appearance: density + text scale**~~ — **done (increment 4)**, after the
   prerequisite tokenisation of `App.css`/`workbench.css`.
3. ~~**First-paint appearance sync**~~ — **done (increment 5).**
4. ~~**Shared control library + component gallery**~~ — **done (increments 6–7).**
   Remaining niceties: pixel baselines (`TST-19`), a portal-based menu/popover,
   shared status vocabulary (`CTL-05`), Tooltip/Slider/Tree/Textarea/Radio/Switch.
5. ~~**Action registry**~~ — **done (increment 8).** Remaining: context menus
   (`NAV-41`–`NAV-43`) once their targets exist.
6. ~~**Shell/navigation skeleton**~~ — **done (increment 9)** for the frame:
   rail, top bar, tray, history. The folder tree, the shell-level inspector,
   resizing and overlay drawers (`NAV-04`/`05`/`06`) come with Explore.
7. **Explore screen** (`§7.1`, `GAL-*`, `INS-*`) — the largest remaining required
   screen; supplies the tree, the inspector, peek, and the selection count the
   shell already has a place for.
8. **Settings registry** — the *screen* is **done (increments 10–11)**: registry,
   resolution order, row anatomy, search, reset, profiles and import/export. Still
   outstanding: library/folder scope persistence, which is Stage D (needs O-1/O-2).

Remaining Phase 0 `MANUAL` items (cannot be run in this environment; need a
packaged exe): startup-freeze trace; web/exe parity capture. Documented as
environment-blocked, not skipped.

## Owner decisions still pending (from `report.md` §9)

O-1 per-library `catalog.db` split · O-2 one-time catalog migration · O-3
`library type` column · O-4 accept `panels.csv` manifest · O-5 trace "Batch
candidates" semantics · O-6 data-dir/portable default · O-7 vector backend ·
O-8/O-9 doc corrections · O-10 audio/video stages.

Phase 6 depends on O-1/O-2 and remains gated. Phase 1 does not require any of
these for the increments above.

## Checkpoint (for resumption)

- Completed and verified: increments 1–8 (backend-first order), then 9 and 10 under
  the **UI-first** order.
- **Next task: increment 13 — Explore.** The shared-control library is now complete
  (every control §10.6 names exists), so nothing blocks this. The folder tree and
  shell-level inspector panes
  (`NAV-04`/`05`/`06`, which also un-defers the `B`/`I` shortcuts in the drift
  guard), the §7.1 toolbar in its documented order, uniform *and* rows modes, the
  dominant-colour placeholder, the full badge set, peek, and the sticky selection
  action bar (`GAL-23`) that feeds the tray's "N selected".
- Repo state: branch `feature/ui-first-implementation`, pushed. `master` untouched
  at `e9f4c91` — never merge without explicit authorisation.
- **Tooling hazard learned the hard way (increment 12):** do not rewrite these
  documents with PowerShell `Set-Content` / `[IO.File]::WriteAllText`. Reading a
  UTF-8 document as text and writing it back through the console code page
  silently replaces every em dash and arrow with `?`, and it can do so *and*
  still report a plausible length. It hit `report.md`,
  `docs/implementation-progress.md`, `docs/ui-inventory.md` and the increment-10
  and -11 reports before it was caught; all were restored with `git checkout`
  (nothing was committed). **Use the `edit` tool for these files, and verify with
  `git diff --numstat` — a diff of hundreds of changed lines where three were
  intended is the tell.**
- Protected file intact: `panel_folder_cropper_v11.py` =
  `6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A`.
- Environment notes: `vite preview` is unusable with the browser tool; serve
  `dist/` and `dist-harness/` with `python -m http.server` on 127.0.0.1. The
  browser pane here is 742 px wide and cannot be resized, so the `TST-17` viewport
  matrix still needs a real window.
- Two harness lessons worth keeping: an **async `vi.mock` factory cannot alias a
  relative import** (Vite produced `../../C:\…`), so the shell harness composes the
  shell's components rather than mounting `AppShell`; and `vi.fn().mockResolvedValue()`
  can lose its implementation under the suite's mock reset — `vi.fn(async () => …)`
  does not.
