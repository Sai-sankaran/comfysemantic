# Phase 1 — Increment 9: the application shell (`NAV-01`–`NAV-14`, `NAV-20`)

| | |
|---|---|
| **Date** | 2026-10-17 |
| **Policy** | `AGENT.md` §"UI-First Implementation Strategy" — Stage A (complete the UI) |
| **Requirements** | `NAV-01`, `NAV-02` (partial), `NAV-03`, `NAV-07` (shell), `NAV-10`, `NAV-11`, `NAV-12` (kept), `NAV-13`, `NAV-14`, `NAV-20`, `NAV-27` (partial), `NAV-30`–`NAV-32` (extended), `CTL-01` (shared Popover) |
| **Inventory** | `docs/ui-inventory.md` |

## 1. Why not the settings registry

The previous plan made "settings registry with scopes" the next increment. Under a
UI-first strategy that is the wrong order, and the split is:

| Part of `SET-*` | Layer | Stage |
|---|---|---|
| The Settings **screen**: category list, Search-settings box, row anatomy `SET-03`, scope chip, modified dot, Reset, restart chip, profiles, import/export | **UI** | Stage A |
| The settings **registry**, scope resolution `SET-02`, persistence `SET-09`, the Rust validator | **Backend** | Stage D |

The screen is UI work and is still to do; the registry is backend work that would
not have produced a finished screen. The shell was the larger and more blocking
gap, so it went first.

## 2. What changed

### Navigation model (`app/navigation.ts`, rewritten)

Seven pipeline-named destinations became the design's five, with the old screens
demoted to **workspaces** inside them — which is where the design puts them
(Panel Studio is Pipeline → Tools, `PIP-12`; Batch Recovery is Review → Failed
items, `REV-03`). Every old screen is still reachable.

`DESTINATIONS` is the single list the rail, breadcrumb, palette and `Ctrl+1…Ctrl+5`
read. `coerceView` guarantees a `ViewState` is always internally consistent, so a
restored snapshot or a stale link falls back to the destination's default instead
of rendering nothing.

### View history (`app/useViewHistory.ts`, new)

`NAV-20`: `Alt+←`/`Alt+→` and the breadcrumb's ◀ ▶, depth 100, forward history
dropped when a new view is pushed after going back, and re-selecting the current
view does not add an entry.

The stack and the cursor are one state object. The first draft kept them in two
`useState` calls with a module-scope ref shared between instances — caught while
writing it, because reading one value inside the other's updater is not safe under
React's render phase. One atomic object removes the whole class of bug.

### Shell components (new)

| File | Requirement | Notes |
|---|---|---|
| `app/Rail.tsx` | `NAV-01`/`02`/`03` | 5 destinations, Settings anchored bottom, collapse under it, 200/56 px, 3 px active bar, Review badge capped "999+", Pipeline progress ring |
| `app/LibraryMenu.tsx` | `NAV-10`, `LIB-01` | type icon + name + chevron, library list with counts, **Add library…** |
| `app/Breadcrumb.tsx` | `NAV-11`, `NAV-20` | `Library › Explore › chapter-07`, every segment clickable, ◀ ▶ back/forward |
| `app/ViewMenu.tsx` | `NAV-13`, `NAV-31` | theme, density, text size (live, persisted) **and every old Options item**, read from the registry |
| `app/SystemChip.tsx` | `NAV-14` | dot + word in four tones; popover rows Library / Model runtime (+Start/Stop) / Worker / Caches / Diagnostics |
| `app/Tray.tsx` | `NAV-07` | 28 px collapsed, job summary with Pause/Stop, "N selected", 280 px drawer on click or `Ctrl+J` |
| `components/ui/Popover.tsx` | `CTL-01` | the shared menu/popover primitive the four popovers use |

### Registry extensions (`app/actions.ts`, `app/shellActions.ts`)

- `alsoShortcut`: an action may own a second key. Appendix A gives Settings both
  `Ctrl+5` (the `Ctrl+1…Ctrl+5` rail range) and `Ctrl+,`; one action with two keys
  beats two actions with one. Conflict detection, the dispatcher and the palette
  and overlay all read every binding.
- `ActionContext.navigate(destination, workspace?)`, plus `back`/`forward`/
  `canBack`/`canForward`, `openLibraryMenu`, `openViewMenu`, `toggleJobDrawer`.
- `ActionContextName` is now `'global' | DestinationId`, so `contexts` can never
  name a screen the navigation model does not have.
- 13 actions → 22. New: the five destinations, Back, Forward, the library menu,
  the job drawer, the View menu, the Review workspace, a Diagnostics entry.
- The five `nav.*` actions are written out rather than generated from
  `DESTINATIONS`, because `tests/test_action_registry_drift.py` parses
  `shellActions.ts` as text and a generated block hides those keys from it.
  `shellActions.test.tsx` asserts instead that each one agrees with
  `DESTINATIONS` (label, icon, key) — the "cannot drift" property moves from codegen
  to a test, and the guard stays a dumb, strict regex.

### AppShell / App

`AppShell` composes rail · top bar · workspace strip · notice · content · tray,
owns the rail auto-collapse rule (`>= 1280 px`), and builds the `ActionContext`.
`App.tsx` owns the history and routes a `ViewState` to its workspace.

### Honest gaps, stated in the UI rather than faked

| Control | Why it is disabled with a visible reason |
|---|---|
| Library health ring (`LIB-01`) | needs a per-stage health field from `list_libraries`; a made-up ring would break `PRD-10` |
| **Manage libraries…** (`LIB-02`) | not built |
| Thumbnail size / grid mode / card overlay (`NAV-13`) | are `browse.*` settings-registry keys → Stage D |
| Worker "Not started" vs "Idle" (`NAV-14`) | needs a worker-state call |
| Caches row (`NAV-14`) | needs cache stats (`DGN-02`) |
| Review badge (`NAV-02`), tray "N selected" | need the Review landing counts and Explore's selection model |
| Quick switcher, Diagnostics page | registered **without** a shortcut and disabled with their reason, so the palette names the gap instead of a dead key |

## 3. Tests

| Suite | New |
|---|---|
| `test/navigation.test.ts` (new) | 9 — destination order, rail grouping, `Ctrl+1…5`, workspace ownership, `coerceView` consistency, `sameView` |
| `test/viewHistory.test.ts` (new) | 9 — push, no-op, back/forward, both ends, forward truncation, depth cap, `goTo`, repair |
| `test/popover.test.tsx` (new) | 7 — open/closed, outside pointer-down, Escape, inside pointer-down, run, disabled-visible-with-reason |
| `test/shellActions.test.tsx` (rewritten) | 25 — rail order/active/collapse, registry↔rail consistency, workspace strip, View menu contents and live settings, library switcher, tray, `Ctrl+1…5`, `Ctrl+,`, `Ctrl+J`, palette |
| `test/actions.test.ts` | +1 (`alsoShortcut` conflict) |
| `test/actionSurfaces.test.tsx` | updated for the new action set |
| `tests/test_action_registry_drift.py` | parser now reads `alsoShortcut`; deferred shrank |

**Results**: frontend **16 files, 269 tests passed**; focused backend guards
(`test_action_registry_drift`, `test_rpc_contract_drift`, `test_doc_drift`)
**15 passed**; `npm run build` PASS; `npm run lint` **0 errors**, 14 warnings, all
in files this increment did not touch (unchanged baseline).

The deferred-shortcut list shrank from 62 to 54: `Ctrl+1…Ctrl+5`, `Ctrl+Shift+L`,
`Ctrl+J`, `Alt+←` and `Alt+→` now ship.

## 4. Verified in a real browser

New backend-free harness `harness/shell.tsx` → `dist-harness/harness/shell.html`,
built by `vite.harness.config.ts`. Fixture values are labelled
("Sample library (fixture)") so a screenshot can never be mistaken for catalog
output. Measured with DOM/computed-style probes:

- rail 200 px; destinations exactly `explore, search, review, pipeline, settings`;
  top bar **44 px**; tray **28 px**.
- breadcrumb renders `Sample library (fixture) › Explore › chapter-07`.
- View menu: 3 theme radios, 3 density radios, 13 text-scale radios (current values
  checked), the six legacy Options actions in registry order, three disabled
  `browse.*` rows each carrying its reason.
- Library menu: "All libraries", both fixture libraries with counts, the active one
  marked, **Add library…** enabled, **Manage libraries…** disabled with its reason.
- System popover: headings Library / Model runtime / Worker / Caches in the
  documented order; runtime row shows the state and Start/Stop.
- **No console messages.**

### A real defect this found

The first load reported `documentElement.scrollWidth > clientWidth` — the page body
scrolled horizontally, which `NAV-06`/`TST-17` forbid. The top bar's children had a
fixed minimum width and could not shrink. Fixed: the search box is `flex: 0 1 34%`
with `min-width: 0`, the breadcrumb can shrink, and below the 900 px supported
minimum the secondary labels collapse to icons. Re-measured at a 742 px viewport:
`overflowX: false`, `scrollWidth === clientWidth`.

(The first re-measure after the fix still failed — it was a stale cached
stylesheet, not a second bug. Re-verified against a cache-busted load.)

## 5. Known limitations

- **`NAV-04`/`05`/`06` panes are not built.** The folder tree, the shell-level
  inspector, resizing and overlay drawers belong to the Explore increment. The rail
  collapse rule (`NAV-03`) and the compact top bar are in place.
- `NAV-02`'s Review badge renders nothing (`null`, not a fake zero) until the
  Review landing supplies counts.
- `NAV-07`'s drawer is a shell: the stage rows, failure list, queue and session log
  of `PIP-21` come with Pipeline.
- `NAV-27` is satisfied by the history stack, not by keeping screens mounted.
- The **View menu pops over the workspace strip**, because the popover is anchored
  rather than portalled — the same known limitation `<Select>` has.
- The harness renders the shell's *components*; `AppShell` itself needs the app
  context, so its composition is covered in jsdom, not in the browser page.
- Viewport matrix (900/1100/1366/1920) and themes/densities at real widths were not
  re-verified: the browser pane available here is 742 px wide and cannot be
  resized. Layout was verified at that width and by reading computed styles.

## 6. Next

**Increment 10 — Explore.** The largest remaining required screen: the folder tree
and shell-level inspector panes (`NAV-04`/`05`/`06`, the `B`/`I` toggles that are
still deferred in the drift guard), the §7.1 toolbar in its documented order
(scope toggle, Subfolders, sort + direction, filter chips, count text, thumbnail
slider, grid-mode toggle), uniform *and* rows modes, the dominant-colour
placeholder, the full badge set, peek, and the sticky selection action bar
(`GAL-23`) that also supplies the tray's "N selected".