# Phase 1 · Increment 8 — The action registry

| | |
|---|---|
| **Requirements** | `design.md` `NAV-24`, `NAV-25`, `NAV-26`, `NAV-30`, `NAV-31`, `NAV-32`; Appendix A (shortcut map); `TST-16` |
| **Roadmap** | Phase 1, item 3 — *"one typed action registry; no duplicated action definitions"* |
| **Date** | 2026-10-17 |
| **Result** | Implemented and verified |

## What the specification asked for

`NAV-30` defines one action record — `id`, `label`, `icon`, `shortcut`,
`contexts`, `enabledWhen`, `run` — as the single source of truth. `NAV-31`
requires the command palette, keyboard shortcuts, tooltips, menus and context
menus to read from it and forbids any component hard-coding a shortcut.
`NAV-32` requires the registry to reject two actions declaring the same shortcut
in overlapping contexts, while allowing the same key in genuinely disjoint
contexts. `NAV-24`/`NAV-25` require the palette and the shortcuts overlay to be
generated from it, and `NAV-26` requires single-letter shortcuts to be inert
while focus is in a text field. Appendix A describes itself as *"generated from
the action registry"*.

Before this increment there was no registry: `AppShell` string-compared `'/'`
and `Ctrl+K` by hand in a `window` keydown listener, hard-coded five Options-menu
items, and hard-coded the `/  Ctrl+K` hint in the search placeholder.

## What was built

### The registry (`frontend/src/app/actions.ts`)

- `AppAction` carries the seven documented fields. `contexts` is a closed union
  (`global`, `library`, `search`, `indexing`, `panel`, `recovery`, `dialogue`,
  `settings`), where `global` means "everywhere". One extra optional field,
  `surfaces` (`palette` | `menu` | `overlay`, defaulting to `palette` + `overlay`),
  narrows *where* an action is offered; it does not replace any documented field,
  and it is what keeps the Options menu from listing "focus the search box".
- Shortcut model: `parseShortcut`, `normalizeShortcut` (canonical
  `mod+shift+k`), `formatShortcut` (Windows/Linux and macOS labels), and
  `matchShortcut`. A bare `+` is the plus key, not a separator. Shift is only
  enforced when the spec asks for it or the key is not itself a shifted symbol,
  so `?` (which is `Shift+/` on a US layout) matches its own spec.
- `isEditableTarget` + `isUnmodifiedShortcut` implement `NAV-26`.
- `contextsOverlap` treats `global` as overlapping **every** context — a global
  `Ctrl+K` and a search-only `Ctrl+K` are a conflict, not a coincidence. This was
  a real bug in the first cut of the guard, caught by its own test.
- `ActionRegistry`: `register` (throws on a duplicate id, validates every
  shortcut), `all`, `forContext`, `bySurface`, `conflicts`, `matchShortcut`.
- `availability(action, ctx)` evaluates `enabledWhen`, returning
  `{ enabled, reason }`.

### The actions (`frontend/src/app/shellActions.ts`)

Thirteen actions that exist today. **Only four carry a shortcut**, and each is
exactly what Appendix A defines for an action the app actually has:

| id | label | shortcut | surfaces |
|---|---|---|---|
| `palette.open` | Command palette | `Ctrl+K` (`mod+k`) | overlay |
| `overlay.open` | Keyboard shortcuts | `?` | palette, overlay |
| `nav.focusSearch` | Focus search | `/` | palette, overlay |
| `nav.settings` | Open Settings | `Ctrl+,` (`mod+,`) | palette, menu, overlay |
| `library.addFolder` | Add library folder… | — | palette, menu |
| `tools.startIndexing` | Start indexing | — | palette, menu |
| `tools.panelSeparator` | Run panel separator | — | palette, menu |
| `tools.indexingStatus` | Indexing status | — | menu |
| `tools.recovery` | Batch prompt recovery | — | palette, menu |
| `nav.library` / `nav.search` / `nav.dialogue` | Go to … | — | palette |
| `diagnostics.gallery` | Open component gallery | — | palette (settings context only) |

`library.addFolder` and `tools.startIndexing` are gated by `enabledWhen` (they
are disabled, with the reason "A job is already running", while a job runs).
The Options menu keeps its **original item order**; "Open Settings" is appended,
replacing the old ad-hoc "All settings…" affordance. `SHELL_REGISTRY` is a
module-scope instance, so every surface provably shares one registry.

### The surfaces

- `features/palette/CommandPalette.tsx` (`NAV-24`) — a `Dialog` listing the
  registry's palette actions for the current context, disabled ones greyed with
  their reason, filterable by label. With text typed, `Search for "<text>" in
  <library>` is prepended, preserving the old `Ctrl+K` habit. Arrow keys move the
  highlight; Enter runs it and closes; the search box takes focus after the
  dialog's own autofocus. Its highlight index is reset by *deriving during
  render* rather than in an effect. The field is a proper ARIA 1.2 combobox over
  the listbox (`aria-controls` / `aria-activedescendant`), so the highlight is
  announced, not just drawn.
- `features/palette/ShortcutOverlay.tsx` (`NAV-25`) — a read-only, searchable
  list of every registered shortcut, grouped by context (matching on label *or*
  on the formatted keys).
- `app/useActionHotkeys.ts` — one `window` keydown listener that walks the
  registry, applies `NAV-26`, honours the current tab's context, skips disabled
  actions, and runs the first match. `AppShell` disables it while a modal is
  open, so a shortcut cannot fire behind the palette.
- `AppShell` now derives the Options menu, the placeholder hint
  (`Search library…   /  Ctrl+K`) and the shortcut dispatch from the registry.
  The menu item is its own component, `OptionsMenuItem`.

## Verification

| Check | Command | Result |
|---|---|---|
| Registry/shortcut unit tests | `npx vitest run src/test/actions.test.ts` | **26 passed** |
| Surfaces (palette/overlay/dispatch) | `npx vitest run src/test/actionSurfaces.test.tsx` | **22 passed** |
| Shell consumes the registry | `npx vitest run src/test/shellActions.test.tsx` | **12 passed** |
| Appendix A ↔ registry drift | `pytest tests/test_action_registry_drift.py -q` | **7 passed** |
| Frontend suite | `npm run test` | **13 files, 228 passed** |
| Frontend build | `npm run build` | PASS |
| Frontend lint | `npm run lint` | exit 0 (no new warnings) |
| Focused backend guards | `pytest tests/test_action_registry_drift.py tests/unit/test_app_settings_contract.py tests/test_worker_protocol.py tests/test_doc_drift.py tests/test_rpc_contract_drift.py -q` | **91 passed** |
| Full backend suite | `.venv\Scripts\python.exe -m pytest -q -p no:randomly` | **1157 passed, 18 skipped** |
| Rust | not applicable — no Rust file changed | — |

New tests: `actions.test.ts` (26), `actionSurfaces.test.tsx` (22),
`shellActions.test.tsx` (12), `tests/test_action_registry_drift.py` (7).

### The drift guard is not vacuous

`tests/test_action_registry_drift.py` parses **both** sides — Appendix A out of
`design.md`, the shortcut declarations out of `shellActions.ts` — exactly as
`test_rpc_contract_drift.py` reads the Rust allowlist, and requires:

* every registry shortcut to appear in Appendix A (no invented keys),
* every Appendix A shortcut to be either implemented or in an explicit
  `DEFERRED_GROUPS` list with a reason,
* nothing to be both implemented and deferred (a stale deferral),
* a parser self-check (`test_the_parsers_are_not_vacuous`) that fails if either
  side parses as empty, plus fixed spot-checks of the awkward row shapes
  (`` `Ctrl+1` … `Ctrl+5` `` ranges, `` `←→↑↓` `` runs, `` `+` ``, `` `−` ``,
  `Alt+←` / `Alt+→`, and the `Shift+click`/`Ctrl+click` mouse gestures that must
  *not* be treated as keys).

Four mutations were injected to prove each direction fires:

```
baseline: 4 registry shortcuts, 62 deferred
1 ok: registry declares shortcuts absent from Appendix A: ['mod+y']        (invented)
2 ok: deferred/implemented shortcuts that Appendix A no longer defines: ...(stale)
3 ok: Appendix A shortcuts neither implemented nor deferred: ['mod+y']     (missing)
4 ok: shortcuts both implemented and deferred: ['mod+p'] - remove ...      (stale deferral)
```

The self-check also caught a genuine parser bug on the first run: the bare `+`
key was being split into zero parts and silently dropped (the prototype had
masked it with a `except ValueError: continue`).

### Live verification in a real browser

The application itself cannot run here — it needs the Tauri IPC bridge and shows
its "Backend unavailable" screen in a plain browser (a documented Phase 0
limitation), so a backend-free fixture was added, mirroring increment 6's
gallery: `harness/actions.html` + `harness/actions.tsx`, built by
`vite.harness.config.ts` to `dist-harness/harness/actions.html`. It mounts the
real palette, the real overlay and the real `useActionHotkeys` against the real
registry. Probed in a served build:

- the page reports **13 registered actions**, and lists `mod+k → Ctrl+K`,
  `? → ?`, `/ → /`, `mod+, → Ctrl+,`;
- `Ctrl+K` (dispatched as a real keydown) opened the palette; focus landed in
  "Command palette search"; the dialog is portalled into `.overlay`;
- the palette listed 10 rows for the `library` context — `palette.open`
  correctly absent (overlay-only), `tools.indexingStatus` absent (menu-only),
  `diagnostics.gallery` absent (settings-only);
- typing `settings` produced row 0 = `Search for "settings" in Demo Library`,
  row 1 = `Open Settings` with `Ctrl+,`;
- `ArrowDown` + `Enter` ran the action: the harness log recorded
  `navigate(settings)` and the dialog closed;
- `?` opened the overlay, grouped under a `Global` heading with the four
  formatted keys, focus in "Filter shortcuts"; `Escape` closed it;
- ticking the harness's `busy` box made exactly `Add library folder…` and
  `Start indexing` `aria-disabled=true` with the reason "A job is already
  running", and nothing else;
- switching the context to `settings` added `Open component gallery` to the
  palette and nothing else changed;
- the search field is a `combobox` with `aria-controls` pointing at the listbox
  and `aria-activedescendant` pointing at the single `aria-selected` row, and it
  follows the arrow keys.

## Findings outside the increment's scope

1. **`tests/test_worker_protocol.py` was failing on this machine, before and
   independently of this increment.** `WorkerClient` redirected
   `LOCALAPPDATA` for isolation but not `USERPROFILE`, and the worker runs with
   `cwd` = the repo — both feed `_allowed_library_roots()`, so a library under
   the pytest temp dir was rejected as "not within allowed filesystem roots" and
   `start_indexing` failed. It reproduced in isolation (1 failed, 13 passed) and
   is unrelated to the frontend work. Fixed by sandboxing `USERPROFILE` and
   declaring the temp dir through the backend's own `COMFYPANEL_TEST_ROOTS`
   hook; the file now passes 14/14. This is a test-isolation defect, not a
   change to the containment feature.
2. **`src/test/libraryNavigation.test.tsx` flaked once** in a full-suite run:
   `expected "spy" to be called 2 times, but got 1 times` in *"leaves the viewer
   put at a page boundary"*. It passes in isolation and passed on the
   immediately following full run (226/226). It is a passive-effect race in that
   test (the second keydown can land before React re-attaches the viewer's
   document listener), and that test does not import any code from this
   increment — its mocks cover `../api` and `../app/providers` and it mounts only
   `LibraryScreen`. Recorded, not fixed.
3. Two React Compiler lint warnings were introduced by the first cut of this
   work and then removed rather than tolerated: the palette's `setState` in an
   effect (now derived during render) and an unattributable `react(refs)` report
   on the inline menu map (now an `OptionsMenuItem` component). `npm run lint`
   exits 0 with only the pre-existing warnings.

## Limitations and deliberate deferrals

- **Most of Appendix A is still unimplemented**, by design: 62 of the 66
  distinct appendix shortcuts belong to screens that do not exist yet (Explore,
  viewer, reader, review, the five-destination rail, undo/redo, the job drawer,
  the directory tree). They are enumerated with reasons in the drift guard's
  `DEFERRED_GROUPS`, so each is an acknowledged gap rather than a silent one, and
  the test forces the list to shrink as they ship.
- **No context menus.** `NAV-41`–`NAV-43` require right-click on gallery items,
  folders and other targets; none of those surfaces exist yet, so the registry
  has no context-menu surface and no component consumes one. The registry itself
  is context-aware, so this is additive later.
- **`NAV-24`'s "plus settings by name" is not satisfied.** The palette lists
  actions, including "Open Settings", but not individual settings rows. Those
  come from the settings registry with scopes (`SET-*`, the next increment),
  which does not exist yet; adding them is a matter of registering each setting
  as an action.
- **`NAV-31` is only partly satisfied for menus.** The Options menu, the palette
  and the placeholder hint read the registry; the rail items and the shell's
  other buttons have no shortcuts to display, so nothing else needed converting.
- **Single-letter appendices are not registered.** `NAV-26` is implemented and
  tested, but no shipped action currently has a single-letter shortcut, because
  no Appendix A single-letter action (B, I, X, F, C, H, …) exists in the app yet.
- No pixel baselines (`TST-19`); the harness is a fixture, not the `DGN-*`
  Diagnostics surface.
