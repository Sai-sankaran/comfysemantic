# Phase 1 — Increment 12: the last three shared controls (`CTL-01`, `LIB-06`, `LIB-07`)

| | |
|---|---|
| **Date** | 2026-10-17 |
| **Policy** | `AGENT.md` §"UI-First Implementation Strategy" — Stage A (complete the UI) |
| **Requirements** | `CTL-01` (no control outside the library), §10.6 (Tabs, Tooltip, Tree), `LIB-06`, `LIB-07`, `LIB-08`, `NAV-43` |
| **Inventory** | `docs/ui-inventory.md` §9 item 3 |

## 1. Scope

`docs/ui-inventory.md` §9 listed exactly three controls as missing: **Tabs**,
**Tooltip** and **Tree**. They were built here because they are prerequisites for
the next two screens — Explore needs the tree, and Pipeline needs tabs and
tooltips — so there is nothing speculative in this increment.

## 2. What changed

### `components/ui/Tabs.tsx` (new)

Underline style per §10.6: 2 px accent underline on the selected tab, `--bg-2` on
hover. It is the **ARIA tabs pattern** rather than a row of buttons: the list owns
`←→` movement with wrap-around, `Home`/`End` jump to the ends, a disabled tab is
skipped, and only the selected tab is in the tab order (roving `tabindex`). Focus
**follows** the selection — without that, a second arrow press arrives from the tab
the user has already left. This was not a theoretical concern: the test for two
successive arrow presses failed and the component was wrong.

**The shell's workspace strip now uses this control** (`app/AppShell.tsx`). The
strip previously had hand-written buttons, `aria-current` and its own `.workspace-tab`
CSS. It is now a `Tabs` with `role="tablist"`, which is both the correct semantics
and 30 lines of CSS deleted — the `CTL-01` point that the library is the only source
of controls applies to markup as much as to widgets.

### `components/ui/Tooltip.tsx` (new)

600 ms hover delay, **instant on keyboard focus**, 280 px maximum width, and a label
that may carry a shortcut (`Compare (C)`, `NAV-43`). The bubble is a real
`role="tooltip"` wired through `aria-describedby`, so it *describes* the control
rather than replacing its name, and `Escape` dismisses it.

It clones its child and calls the child's own handlers alongside its own, so
wrapping a control adds the tooltip without discarding behaviour the control
already had.

### `components/ui/Tree.tsx` (new)

`LIB-06`/`LIB-07`/`LIB-08`: density-driven row height, 16 px indent per level, a
selected row in `--bg-3` with a 2 px accent bar at its left edge, the recursive item
count, a pin affordance, and a status icon whose tooltip uses the shared §5.7
wording rather than a colour alone.

The two modes are load-bearing and are enforced by the type, not by convention: the
props are a discriminated union, so Browse mode takes a `string` selection and
Select mode a `readonly string[]`, and neither call site can pass the wrong shape.

| | Browse | Select |
|---|---|---|
| Used by | Explore, Search | Pipeline scope, Folder policies |
| Selection | single | tri-state checkboxes |
| Checking a folder | — | checks every descendant |
| Partially checked parent | — | shows the mixed dash |
| Pin | a shortcut, never a selection | a shortcut, never a selection |

Pinning never changes the selection or the scope, which is what `LIB-06` means by
"pinned does not become the selection".

## 3. Defects this increment found and fixed

1. **Tabs did not move focus with the selection.** `←` advanced the selection but
   left focus behind, so a second `←` moved from the wrong tab. Fixed, and the
   wrap-around test now proves it with two successive presses.
2. **`Tree`'s `onChange` was a loose union** (`(next: string | string[]) => void`),
   which forced every call site to cast. Replaced with a discriminated props union
   so the mode decides the shape.
3. **Three lint regressions of my own** were fixed rather than accepted: recursive
   helpers declared as `const` arrows captured themselves during initialisation (now
   named function expressions), `checked` was rebuilt every render inside a
   `useCallback`, and the tooltip read a ref during render.

`shellActions.test.tsx`'s workspace-strip test was updated to the new semantics
(it asserted `role="navigation"`, which was the weaker choice).

## 4. Browser verification

Through the component gallery, with the real stylesheets:

| Check | Result |
|---|---|
| Tabs are a `tablist` named "Example tabs" | ✅ |
| Exactly one tab has `aria-selected="true"`; the rest are `tabindex="-1"` | ✅ |
| The disabled tab is `disabled` and is skipped by arrow movement | ✅ |
| Two trees render, named "Tree, browse mode" and "Tree, select mode" | ✅ |
| Browse tree reports `aria-multiselectable="false"` | ✅ |
| Tree row height | 32 px (comfortable density) |
| Selected row | `--bg-3` with `2px 0 0 0 inset` — the §10.6 accent bar |
| Nesting | level 2 indented 24 px = 16 px per level + the 8 px base |
| 12 tree items and 6 checkboxes across the two modes | ✅ |
| Tooltip appears after hover and is `role="tooltip"` with the 600 ms delay | ✅ |
| Tooltip max-width | 280 px, as specified |
| Horizontal overflow on both harnesses | none |

The tooltip's **keyboard-focus** path could not be exercised in the browser pane
here — the pane is not the focused tab (`document.hasFocus()` is `false`), so a
programmatic `focus()` fires no focus event. The hover path is verified above; the
focus path is covered by `fireEvent.focus` in `navigationControls.test.tsx`. This is
recorded rather than glossed: it is an environment limit, not a passing check.

## 5. Tests

`src/test/navigationControls.test.tsx` — **19 tests**: tabs (roving tabindex, click,
arrow wrap, Home/End, disabled-skip, panel wiring) and tooltip (the 600 ms delay
with fake timers, instant focus, described-not-named, Escape, blur, disabled) and
tree (counts and §5.7 status wording, single-select Browse, tri-state Select,
recursive check, uncheck, Browse/Select independence, collapse, indent, pin without
selection).

**Results**: frontend **22 files, 437 tests passed**; `npm run build` PASS;
`npm run lint` **0 errors**, 14 warnings — the pre-existing baseline, with none
from this increment's files; harness build PASS.

## 6. What this leaves

The shared-control library now covers every control §10.6 names. The remaining
Stage A work, in the order `docs/ui-inventory.md` §9 gives it:

1. **Explore** — folder tree and shell-level inspector panes (`NAV-04`/`05`/`06`,
   which also un-defers the `B`/`I` shortcuts in the drift guard), the §7.1 toolbar
   in its documented order, uniform *and* rows modes, dominant-colour placeholder,
   the full badge set, peek, and the sticky selection action bar (`GAL-23`).
2. Search layout and signal line; Pipeline three-column layout; Review
   Needs-Attention landing; Viewer overlay and zoom; Compare; Reader; panel editor;
   Cropper Lab; onboarding; Diagnostics; export; collections.
3. The `STA-*` catalogue per screen, then the `TST-17` layout, `VIS-15` contrast and
   `TST-19` visual-regression suites, which the Stage C gate requires.