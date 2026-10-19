# Phase 1 — Increment 13: Explore (design §7.1)

| | |
|---|---|
| **Date** | 2026-10-18 |
| **Policy** | `AGENT.md` §"UI-First Implementation Strategy" — Stage A (complete the UI) |
| **Requirements** | `GAL-01`–`GAL-23`, `LIB-06`/`LIB-09`, `NAV-04`/`NAV-05`, `INS-01`/`INS-03`/`INS-12`, `STA-02`–`STA-06` |
| **Inventory** | `docs/ui-inventory.md` §9 item 4 |

## 1. The seam

Everything the screen knows about where its items come from is one interface,
`ExploreSource`. A deterministic fixture implements it today; a backend
implementation swaps in with no component changed. This is the "define clear
typed interfaces for eventual backend integration" instruction taken literally,
and it is also what lets the UI work proceed while `VERIFY` items 3, 5 and 10 stay
open.

Fixture data is **labelled in the UI** — a banner above the toolbar reads
"Fixture data — these items are generated, not from a library" — and the source
sets `isFixtureData`, so a fixture can never be mistaken for a catalog. The
fixture is generated from an integer seed, so the same call always produces the
same filename, dimensions and colour; a gallery that reshuffled between renders
could not be tested for anything.

## 2. What was built

**Layout** — `[Folder tree] [Gallery] [Inspector]`, with the tree and inspector as
*shell-level* surfaces (`NAV-04`/`NAV-05`) rather than parts of the screen.

**Toolbar** in the design's exact order: scope toggle (comic only), Subfolders,
Sort + direction button, filter chips + the Filters popover, then right-aligned
count text, the 96–320 px thumbnail slider, and the Uniform/Rows toggle.

**`SettingRow`-equivalent card** (`GAL-07`) — image only; a 28 px **solid** hover
bar with the middle-truncated filename and dimensions; badges capped at 3 with
"+N", each with an accessible name so colour is never the only signal; a checkbox
that stays visible whenever *any* item is selected, so the affordance does not
move under the pointer.

**Selection** (`GAL-09`/`GAL-10`) — click selects one, `Ctrl+click` toggles,
`Shift+click` ranges, `Ctrl+Shift+click` extends without dropping the earlier
selection, `X` toggles, `Shift`+arrows extends, `Ctrl+A` selects all loaded, `Esc`
clears, and a lasso with 48 px edge auto-scroll at up to 1,200 px/s.

**Peek** (`GAL-11`), the **selection action bar** (`GAL-23`, sticky under the
toolbar with every inapplicable action disabled *and carrying its reason*), and
**per-folder view memory** (`GAL-22`) with the incompatible-saved-filter rule.

**States** — `STA-02` empty folder, `STA-03` not checked, `STA-04` filters hide
everything, `STA-05` failed to load, `STA-06` empty library, plus the skeleton
loading state and `GAL-03`'s inline "Couldn't load more images. [Retry]".

## 3. `NAV-04` / `NAV-05` — the shell-level panes

The tree and inspector belong to the shell, not to Explore: `B` and `I` must work
from inside them, and they must survive the screen underneath being unmounted. So
their state moved to `AppShell` and the screen reads it through a new
`ShellPanesContext`. `AppShell` also owns the selection count, so the tray's
"N selected" and the gallery's selection cannot drift.

`B` and `I` are registered in the action registry with their Appendix A keys,
which **un-defers them** in `tests/test_action_registry_drift.py`.

A new **`gallery` action context** was needed: the grid's own keys (`Space`,
`←→`, `Enter`, `X`, `Ctrl+A`, …) must not be window-level. `Space` that peeked
from anywhere in Explore would be wrong, and it would also collide with `Space` in
the Reader, which `NAV-32` forbids. Those actions are registered so the palette and
the shortcut overlay list them honestly, and the grid dispatches them itself.

## 4. Five defects the tests found

1. **A single click opened the viewer.** `GAL-09` says click *selects* and
   `GAL-12` says double-click opens; opening a modal on every click would make
   browsing impossible. Split into `onActivate` (select) and `onOpenViewer`.
2. **Justified rows distorted every image.** The row scaled width alone while
   pinning the height, stretching each image by the same factor — exactly what
   `GAL-17` ("thumbnails are never stretched or distorted") forbids. Rows now
   scale *both* dimensions, which is what makes "justified" and "never distorted"
   compatible. The chosen thumbnail size is the row height *before* justification.
3. **The unknown-count placeholder floored at 1**, so it read "200+ images" for a
   folder holding more. `GAL-04` specifies a 1,000 floor, capped at 10,000.
4. **The count used the filtered total as its own denominator**, reading "104 of
   104". `ExplorePage.total` is now documented as the **unfiltered** count, so the
   label reads "37 of 412".
5. **The folder-tree root was collapsed**, hiding every folder behind one click —
   found because a test could not find a top-level folder.

Also fixed: seven lint regressions of my own (self-referencing `const` arrows, a
`Set` rebuilt every render, a ref read during render, and four
`set-state-in-effect`). The last two were resolved with React's documented
"adjust state during render" pattern rather than suppressed, so switching folders
cannot paint one frame of the previous folder's view.

## 5. Tests

| Suite | New |
|---|---|
| `exploreModel.test.ts` | **56** — the four `GAL-04` count strings and both approximations, natural ordering, missing-generation-date sorting, uniform and justified layout including the un-stretched last row and aspect preservation, `object-position`, the three click rules, movement clamping, type-ahead, lasso geometry and the 1,200 px/s cap, badges and overflow, chips and the `STA-04` label, `GAL-23` action rules, thumbnail clamping |
| `exploreScreen.test.tsx` | **35** — the three panes and both shell toggles, the fixture label, the folder tree, every toolbar control, the comic-only scope toggle, `GAL-04`'s "1,000+", sort restart, the grid's ARIA contract and roving tabindex, arrows/Enter/Space/Esc, click selection and the action bar's disabled-with-reason, the inspector's three `INS-01` states, and `STA-02`–`STA-06` including `GAL-03`'s inline page retry |

One test was **load-sensitive** and is now deterministic: it relied on jsdom
honouring a `scrollTop` assignment, which it does not always do, so it passed
alone and failed under full-suite load. `scrollTop` is now defined explicitly.

**Results:** frontend **24 files, 529 tests passed**; `npm run build` PASS;
`npm run lint` **0 errors, 14 warnings** — exactly the pre-existing baseline, none
from the new files. No backend code was touched.

## 6. What this does not include

Stated plainly rather than left to be discovered:

- **The Inspector is partial.** `INS-01`'s three states and the always-present
  Preview/File sections ship. `INS-02`–`INS-11` (the section order and toggles,
  the 1280 px preview, Generation, Workflow, tag chips with autosave notes, the
  comic page sections) are not built.
- **`GAL-16`'s cross-frame round trip** is implemented but not verified against a
  real viewer, because the viewer is not yet the specified overlay.
- **`GAL-18`** (comic series grid), **`GAL-19`'s panel cards** (the scope toggle
  switches, but panels are not yet in the data), and **`GAL-20`** (parent chip) are
  not built.
- **Nothing in Appendices E–I** — Table view, Hide/Reject flags, privacy blur,
  relations, viewing history, tag rules, copy-as, re-run presets, export — exists.
  These are Core v1 requirements of Phase 2 and are recorded as ✗ in
  `docs/progress.md`.
- **Context menus** (`NAV-40`–`NAV-43`) are not built; a right-click currently
  reports to the shell's note line.

## 7. Next

Per `docs/progress.md` §4, the remaining Phase 2 work in order:

1. **Table view** (`TBL-01`–`TBL-10`) — the gallery already has the layout and
   selection machinery; the table is a second presentation of the same result
   sequence, and `TBL-01` demands parity.
2. **Hide / Reject / Pick flags** (`FLG-*`) and the Hidden view — needs `hidden`
   and `flag` in the item contract, which is a small typed change.
3. **Privacy blur** (`PRV-*`) — a display mask across every image surface, with the
   `colour` fallback.
4. **Quick filters strip** (`QFL-*`) — session-only, which `GAL-22` explicitly
   excludes from folder view memory.
5. The remaining Inspector sections, then the Viewer (`VWR-*`) and Compare
   (`CMP-*`).