# ComfyPanel Studio — UI Inventory (Stage A gate)

| | |
|---|---|
| **Purpose** | Requirement-by-requirement inventory of the **UI** defined by `design.md`, marked against the **actual code** |
| **Policy** | `AGENT.md` §"UI-First Implementation Strategy" — Stage A (complete the UI) → Stage C (UI completeness gate) → Stage D (integrate) |
| **Last updated** | 2026-10-17 — updated after increment 12 (the last three shared controls) |
| **Method** | Read-only inspection of `frontend/src/**`, `frontend/harness/**`, plus the measured baseline below. No file in `panel_folder_cropper_v11.py`, `backend/`, or user data was touched. |
| **Companion** | `docs/implementation-progress.md` (running log), `report.md` (backend/architecture audit) |

## 0. Verified baseline at the time of this inventory

| Check | Command | Result |
|---|---|---|
| Git | `git rev-parse HEAD` / `git status --short` | `e9f4c91`, branch `master`, 102 modified/untracked entries, **nothing committed** |
| Protected cropper | `Get-FileHash panel_folder_cropper_v11.py -Algorithm SHA256` | `6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A` — intact |
| Frontend tests | `npm run test` (in `frontend/`) | **22 files, 437 passed** (13 files / 228 before the UI-first work) |
| Frontend build / lint | `npm run build` / `npm run lint` | PASS / exit 0, no new warnings |
| Backend tests | `.venv\Scripts\python.exe -m pytest -q -p no:randomly` | 1157 passed, 18 skipped |

## 1. Legend

**✅ Complete** — the documented layout, interactions and states are implemented and exercised by a test.
**◑ Partial** — a real implementation exists but the documented behaviour is only partly there.
**✗ Missing** — nothing implementing it exists in the tree.
**⛔ Blocked** — cannot be started without an owner decision or an unavailable prerequisite.

Counts are of the design's requirement groups, not of lines of code.

## 2. First question: is the settings registry UI completion or backend integration?

The previous plan ("Increment 9 — settings registry with scopes") is **both**, and the split matters because the strategy is UI-first.

| Part of `SET-*` | Layer | Stage |
|---|---|---|
| Settings **screen**: category list, Search-settings box, row anatomy (`SET-03`), scope chip menu, modified dot, Reset, "Requires restart" chip, profiles manager (`SET-07`), import/export + diff preview (`SET-06`), import error list (`STA-29`) | **UI** | **Stage A** |
| Settings **registry data model**, `allowedScopes` resolution order folder → library → app → default (`SET-02`), persistence in `app.db` (`SET-09`), the Rust validator | **Backend** | **Stage D** (needs O-1/O-2) |

**Decision.** The screen is UI work and belongs in Stage A; the registry/scopes/persistence is backend work and belongs in Stage D. Doing the registry first would have been **the wrong order** under the UI-first strategy: it is backend plumbing, and it would not have produced a finished screen. It is therefore **not** the next increment. The next increment is the **application shell**, because the shell is the frame every remaining screen lives in and it is currently the single largest structural UI gap.

## 3. Navigation destinations (design §6)

| ID | Required | Status | Actual code | Gap |
|---|---|---|---|---|
| `NAV-01` | 5-item rail: Explore, Search, Review, Pipeline; Settings anchored bottom; collapse under it | ✅ | `app/navigation.ts` + `app/Rail.tsx` (inc. 9) | — (the old 7 destinations became workspaces) |
| `NAV-02` | Count badge on Review ("999+" cap); progress ring on Pipeline while a job runs | ◑ | `Rail.tsx` — badge and ring render | The badge is `null` (no badge) until the Review landing supplies `REV-01` counts; `PRD-10` forbids a fake zero |
| `NAV-03` | Rail expanded ≥ 1280 px, collapsed below; manual choice wins | ✅ | `AppShell.tsx` — `railChoice: auto\|expanded\|collapsed` + a resize listener (inc. 9) | The `appearance.rail` *setting* is Stage D; the choice is per session for now |
| `NAV-04` | Folder tree + inspector toggleable with `B`/`I` and the View menu; per-screen state | ✗ | Tree **does not exist**; inspector still inside the Explore/Search screens | Explore increment |
| `NAV-05` | Resizable panes, drag or arrow keys, limits, ≥ 420 px main surface | ✗ | Fixed inspector width | Explore increment |
| `NAV-06` | Breakpoints XS/S/M/L; overlay drawers below 1280 | ◑ | Rail auto-collapse + a compact top bar below 900 px (inc. 9) | Tree/inspector overlay drawers come with Explore |
| `NAV-07` | Bottom tray (28 px / 280 px drawer), job summary + Pause/Stop, "N selected", `Ctrl+J` | ◑ | `app/Tray.tsx` (inc. 9) — measured 28 px collapsed, 280 px drawer, Pause/Stop, "N selected", `Ctrl+J` | `PIP-21`'s stage rows, failures, queue and session log come with Pipeline; the count is 0 until Explore has a selection |
| `NAV-08` | Native title bar, page zoom disabled, text scale replaces it | ◑ | Text scale works (inc. 4–5) | Zoom-disable is a Tauri/exe concern, unverifiable here |
| `NAV-10` | Library switcher (type icon + name + chevron) opening the Library menu | ✅ | `app/LibraryMenu.tsx` (inc. 9) | Health ring (`LIB-01`) needs a backend field; **Manage libraries…** is disabled with its reason |
| `NAV-11` | Clickable breadcrumb, middle collapse | ◑ | `app/Breadcrumb.tsx` (inc. 9) — every segment clickable | Middle-segment collapsing to "…" not done (paths are shallow today) |
| `NAV-12` | Top-bar search; `/` focuses; Enter opens Search with the text | ✅ | `AppShell.tsx` + `nav.focusSearch` | — |
| `NAV-13` | **View** menu: theme, density, text scale, thumb size, grid mode, card overlay, "All settings…" | ◑ | `app/ViewMenu.tsx` (inc. 9) — theme/density/text size live and persisted; carries **every** old Options item from the registry | Thumbnail size, grid mode and card overlay are `browse.*` settings-registry keys → disabled with that reason (Stage D) |
| `NAV-14` | System chip: dot + label (grey/green/amber/red), System popover with 5 rows | ◑ | `app/SystemChip.tsx` + `app/systemState.ts` (inc. 9) — 4 tones with words, all 5 rows, Start/Stop | Worker "Not started vs Idle" and the Caches row need backend calls; Diagnostics link is disabled with its reason |
| `NAV-20` | Back/Forward history (`Alt+←`/`Alt+→`), depth 100 | ✅ | `app/useViewHistory.ts` (inc. 9) | — |
| `NAV-21` | Escape ladder: peek → drawer → dialog → viewer → selection | ◑ | Ad-hoc per component | No ladder; needs the viewer/peek/overlay surfaces |
| `NAV-22` | Restore library/destination/folder/sort/selection/scroll on launch | ✗ | — | Not built (needs snapshot) |
| `NAV-23` | Quick switcher `Ctrl+P` (libraries, pinned folders, saved searches, recents) | ✗ | Registered without a shortcut and disabled with "Not implemented yet (NAV-23)" | Needs pinned folders and recents |
| `NAV-24` | Command palette `Ctrl+K` | ◑ | `features/palette/CommandPalette.tsx` | "plus settings by name" needs the settings registry (Stage D) |
| `NAV-25` | Shortcut overlay `?`, generated from the registry | ✅ | `features/palette/ShortcutOverlay.tsx`; renders every key an action owns | — |
| `NAV-26` | Single-letter keys inert in text fields | ✅ | `actions.ts` `isEditableTarget`, tested | — |
| `NAV-27` | Each destination remembers its own last state | ◑ | Satisfied by the history stack rather than by keeping screens mounted | Per-destination in-session state still to come |
| `NAV-30/31/32` | Action registry drives palette, overlay, menus, tooltips | ✅ | `app/actions.ts` (22 actions, `alsoShortcut`), `app/shellActions.ts`; View menu + palette + overlay + placeholder all read it | Context menus not yet applicable; the `NAV-32` guard is test-enforced, not build-enforced |
| `NAV-40..43` | Context menus from the registry | ✗ | — | No target surfaces exist |
| `NAV-50..52` | Undo/redo stack, undo toasts, undo history | ✗ | — | Not built |

## 4. Required screens

| Screen (design) | Status | What exists | What is missing |
|---|---|---|---|
| **Explore** `§7.1`, `GAL-*` | ◑ | `features/library/LibraryScreen.tsx`: toolbar (library, sort, filename box, Filters, Add/Remove library, Prev/Next, "N of M shown"), `VirtualImageGrid`, `CatalogFilter` | The §7.1 toolbar layout and order (scope toggle, Subfolders, sort + direction button, facet chips, count text, thumbnail slider, grid-mode toggle), the shell-level folder tree and inspector panes (`NAV-04`–`06`), rows mode, dominant-colour placeholder (`GAL-08`), full badge set (`GAL-07`), lasso, peek, type-ahead, per-folder view memory, selection action bar (`GAL-23`), count-text rules (`GAL-04`) |
| **Inspector** `§7.2`, `INS-*` | ✅ | `features/explore/ExploreInspector.tsx` + 57 tests. `INS-02` order and toggles, `INS-03` absence (enforced by each section returning `null`), `INS-04` preview with the scaled-thumbnail loading caption, `INS-05`/`05a` file and comic source, `INS-06` generation, `INS-07` workflow JSON fetched only on request, `INS-08` tags/rating/favourite/notes with autosave and `STA-15`, `INS-09` per-stage retry, `INS-10` comic page, `INS-11` comic panel with inherited read-only rating | `INS-11`'s panel selection path — `panelDetail` is a typed seam held at `null` until `GAL-19`'s panel cards exist. Also: flag/hidden on a panel (`FLG-*`), and the Decompose / Edit panels / Edit in Review destinations (Phase 5a) |
| **Viewer** `§7.3`, `VWR-*` | ◑ | `components/gallery/ImageViewerDialog.tsx`: modal dialog, prev/next incl. cross-page (`getAdjacentImage`), Esc/arrows | Main-surface overlay model (`VWR-01`), 40 px viewer bar, zoom model (`VWR-04`), 3-tier loading (`VWR-03`), prefetch (`VWR-06`), info panel (`VWR-08`), copy/fullscreen (`VWR-09`), error states (`VWR-10`), Reader button |
| **Compare** `§7.4`, `CMP-*` | ✗ | — | Whole screen incl. metadata diff |
| **Libraries/folders** `§7.5`, `LIB-*` | ◑/✗ | Register/list/remove; `CatalogFilter` | Library menu + health ring (`LIB-01`), Manage libraries dialog (`LIB-02`), 4-step Add wizard (`LIB-03`), remove confirmation text (`LIB-04`), change type (`LIB-05`), folder tree (`LIB-06..09`), folder policies (`LIB-10`), check-for-new-files report (`LIB-11`), launch banner (`LIB-12`), watch folders (`WCH-*`) |
| **Search** `§7.6`, `SRC-*` | ◑ | `features/search/SearchScreen.tsx`: scope + mode segmented controls, source checkboxes, query/similar inputs, Search, Filters, hybrid vector select, Load more, preview dialog | Screen layout (§7.6: query bar, mode control, scope row, filter chips, **signal line**, result header), Smart default + RRF (`SRC-02`), query-syntax chips (`SRC-03`), Search-settings popover (`SRC-04`), progressive merge (`SRC-06`), reference chip (`SRC-08`), sort + score badge (`SRC-10`), saved searches + history (`SRC-11/12`), no-match suggestions (`SRC-13`), All-libraries merge (`SRC-14`), left panel (saved searches / collections / recent) |
| **Smart collections** `§7.6.1`, `COL-*` | ✗ | — | Entry point, create/edit dialog, rule builder, results, context actions |
| **Pipeline** `§7.7`, `PIP-*` | ◑ | `features/indexing/IndexingScreen.tsx`: library select, Start/Force, folder scope, Pause/Resume/Stop safely/Retry failures, resource profile, preset, All/None, Skip completed, per-stage force, progress, session log | Three-column layout (Scope · What to run · Summary), stepper < 1280, preset **cards**, stage rows with *Enables/Requires/counts* (`PIP-03`), dry-run Summary with Start gating (`PIP-05`), estimates (`PIP-06`), Tools (`PIP-12`), Maintenance (`PIP-13`), queue (`PIP-08`) |
| **Job tray + drawer** `§7.8`, `PIP-20..24` | ◑ | Progress bar + session log on the indexing screen | Global tray, drawer sections, queue, determinate/indeterminate rule, completion toast |
| **Panel editor** `§8.6`, `CMC-20..28` | ✗ | — | Canvas, tools, merge/split/delete, reading order, accept, golden set |
| **Series** `§8.7`, `GAL-18` | ✗ | — | Series grid, series settings |
| **Cropper Lab** `§8.8`, `CMC-40..45` | ✗ | — | Setup, results table, metrics, overlay viewer, actions, registry |
| **Reader** `§8.9`, `CMC-50..55` | ✗ | — | Page/panel/continuous modes, dialogue strip, reader bar |
| **Panel export** `§8.10`, `CMC-60/61` | ✗ | — | Dialog, manifest, refusal inside a library root |
| **Needs Attention** `§9.2`, `REV-01..04` | ◑ | `features/recovery/BatchRecoveryScreen.tsx` (batch prompts) + `DialogueReview` queue | The 9-category landing with live counts and the correct categories; Failed items replacing Batch Recovery (`REV-03`) |
| **Review workspace** `§9.3`, `REV-10..24` | ◑ | `features/dialogue/DialogueReview.tsx` — a large workbench: queue, canvas regions, zoom, overlays, mark reviewed, machine text + restore, lettering ink, save/discard/stay guard, machine/manual separation | Right-panel section order (`REV-11`), editor placement per `REV-12` (currently on-canvas), region tools draw/merge/split/delete/edit-box (`REV-16`), queue strip `Q`, compare-text diff (`REV-21`), page-level "no regions" state (`REV-19`) |
| **Settings** `§12.1`, `SET-*` | ✅ (screen) | **Registry-driven** (inc. 10): all 88 §12.2 entries as typed data, `SET-02` resolution, §12.1 category list, Search-settings box, `SET-03` row anatomy, search + Enter-jump, per-category reset. **`SET-06` import/export and `SET-07` profiles added in inc. 11**: three read-only built-ins from §14.6, user profile CRUD, the drifted-value affordance, and a read-only import plan with a diff preview and the `STA-29` ignored list | Only library/folder scope *persistence* remains, which is Stage D. Export/import currently show/copy the JSON rather than using a native file dialog (a Tauri call) |
| **Diagnostics** `§13`, `DGN-*` | ✗ | — | Startup trace, build/environment + Copy, databases, caches, runtime/worker, perf self-test, recent errors, logs, performance HUD |
| **Onboarding / migration** `§19`, `ONB-*` | ◑/⛔ | `EmptyState` when no library | STA-01 full area + two cards (`ONB-01`), first-run checklist (`ONB-02`), migration screen (`ONB-10..14`) — ⛔ gated on O-1/O-2 |
| **Component gallery** `CTL-06` | ✅ | `features/gallery/ComponentGallery.tsx` + `frontend/harness/gallery.html` | Pixel baselines (`TST-19`) |
| **States catalogue** `§16`, `STA-00..35` | ◑ | A few empty/error states | ~30 of 36 states unimplemented (see §6) |

## 5. Shared components and controls (`CTL-*`, §10.6)

| Control | Status | Note |
|---|---|---|
| Button (4 variants, states) | ✅ | `components/ui/Button.tsx` |
| IconButton | ✅ | |
| Text input | ✅ | |
| Textarea | ✅ | `components/ui/Textarea.tsx` (inc. 10), `resize: vertical`; replaces a raw textarea in Batch Recovery |
| Checkbox | ✅ | One drawn component, used everywhere (inc. 6) |
| **Radio** | ✅ | `components/ui/Radio.tsx` (inc. 10) — replaces 5 raw radio inputs in CatalogFilter and SearchScreen |
| **Switch** | ✅ | `components/ui/Switch.tsx` (inc. 10), `role="switch"`, `CTL-04` |
| **Slider** | ✅ | `components/ui/Slider.tsx` (inc. 10), 4 px track, PageUp/PageDown ×5 |
| Select / dropdown | ✅ | Custom ARIA listbox (inc. 7) |
| Segmented control | ✅ | |
| **Tabs** | ✅ | `components/ui/Tabs.tsx` (inc. 12) — ARIA tabs pattern, roving tabindex, wrap, Home/End, disabled-skip; the shell's workspace strip now uses it |
| Menu / context menu / popover | ◑ | `components/ui/Popover.tsx` (inc. 9) — the shared anchored menu/popover used by the library switcher, View menu and System chip | Right-click context menus (`NAV-40`–`NAV-43`) still absent; the popover is anchored, not portalled |
| Dialog | ✅ | |
| **Tooltip** | ✅ | `components/ui/Tooltip.tsx` (inc. 12) — 600 ms hover, instant on keyboard focus, 280 px max, optional shortcut, `role="tooltip"` | Bare `title` attributes remain on a few controls; the toolbar has not been swept yet |
| Toast | ✅ | `ToastProvider` |
| Badge / chip | ✅ | 5 tones |
| Progress bar | ✅ | Determinate + indeterminate |
| Skeleton | ✅ | |
| Banner | ◑ | `notice-bar` ad hoc, not a component with variants |
| **Slider** | ✅ | `components/ui/Slider.tsx` (inc. 10) — 4 px track, 14 px thumb, PageUp/PageDown ×5 |
| **Tree** | ✅ | `components/ui/Tree.tsx` (inc. 12) — Browse and Select as a discriminated union, tri-state roll-up, recursive checking, pin that never selects, §5.7 status wording |
| List / table row | ◑ | Ad hoc markup |
| Image card | ◑ | See `GAL-07` |
| Status vocabulary `CTL-05` | ✗ | No shared icon+word mapping; `Inspector.tsx:7-21` has a private one |

## 6. Visual system (`VIS-*`) and visual states (`STA-*`)

| ID | Status | Note |
|---|---|---|
| `VIS-01` tokens only | ◑ | `styles/tokens.css` + `App.css`; no build-time lint rule |
| `VIS-02/03` semantic colour, fonts | ✅ | |
| `VIS-04` type styles | ◑ | Tokenised in inc. 4; `--fs-2xs` (11 px) predates the 13 px floor |
| `VIS-05` spacing grid | ◑ | Partly tokenised |
| `VIS-06` shape/shadows/no gradients | ✅ | |
| `VIS-07/09` density, text scale | ✅ | inc. 4–5 |
| `VIS-08` Lucide icons only | ✅ | |
| `VIS-10` compact layout at large text scales | ✗ | No overflow "⋯" menu |
| `VIS-11` motion, reduced motion | ✗ | Not implemented |
| `VIS-12` focus | ◑ | Browser default focus rings; `:focus-visible` discipline not audited |
| `VIS-13` no decorative chrome | ◑ | Some cards/borders remain |
| `VIS-14` writing style | ◑ | Mostly followed; e.g. "Indexing Center" |
| `VIS-15` contrast guardrail | ✗ | No token-pair test |
| Forced colours | ✗ | Documented gap |
| `STA-01..35` | ◑ | Present: a "no images match" empty, a fatal screen, loading text, error notices. Missing: the 36 normative messages, most skeletons, `STA-20` locked banner, `STA-29` import errors, etc. |

## 7. Test coverage of the UI

| Suite | Covers |
|---|---|
| `controls.test.tsx`, `select.test.tsx`, `componentGallery.test.tsx` | primitives |
| `appearance.test.ts`, `appSettings.test.tsx` | theme/density/text-scale persistence and application |
| `actions.test.ts`, `actionSurfaces.test.tsx`, `shellActions.test.tsx` | registry, palette, overlay, menu |
| `libraryNavigation.test.tsx`, `adjacentImage.test.ts` | gallery selection + cross-page stepping |
| `navigation.test.ts`, `viewHistory.test.ts`, `popover.test.tsx`, `shellActions.test.tsx` | the shell frame, the destination model, history, the shared popover |
| `settingsRegistry.test.ts`, `settingsResolver.test.ts`, `settingsProfiles.test.ts`, `settingsTransfer.test.ts`, `settingsScreen.test.tsx` | the settings registry, `SET-02` resolution, `SET-06` import/export, `SET-07` profiles, and the screen's layout/anatomy/search/reset |
| `navigationControls.test.tsx` | `Tabs`, `Tooltip`, `Tree` |
| `workbenchEditing.test.tsx`, `workbenchGeometry.test.tsx`, `editorPlacement.test.ts` | the Review workbench |
| Backend drift guards | `test_rpc_contract_drift.py`, `test_doc_drift.py`, `test_action_registry_drift.py` |

Not covered by any test: every screen listed as ✗/◑ above except the Review workbench and Settings; the tooltip's keyboard-focus path is tested with `fireEvent` rather than in a browser (the pane cannot take focus); no layout/`TST-17`, contrast/`VIS-15`, visual-regression/`TST-19`, exe-parity/`TST-01` suite.

## 8. Totals

| Area | ✅ | ◑ | ✗ | ⛔ |
|---|---|---|---|---|
| Navigation destinations (`NAV-*`) | 9 | 9 | 9 | 0 |
| Screens | 2 | 9 | 9 | 1 |
| Shared controls | 16 | 4 | 1 | 0 |
| Visual system / states | 3 | 8 | 6 | 0 |

## 9. Highest-priority missing UI, in dependency order

1. ~~**Application shell**~~ — **done (increment 9)**: rail, top bar (library
   switcher, breadcrumb, View menu, System chip + popover), tray and drawer,
   history. The folder tree, shell-level inspector, resizing and overlay drawers
   moved to item 2, because they only exist for the screens that use them.
2. **Settings screen** — **done (increments 10–11)**: registry, resolution, row
   anatomy, search, reset, profiles, import/export. Only the library/folder scope
   *persistence* remains, which is Stage D.
3. ~~**Missing shared controls**: Tabs, Tooltip, Tree.~~ — **all built in increment
   12**; every control §10.6 names now exists in `components/ui/`.
4. **Explore** — folder tree + inspector panes (`NAV-04`/`05`/`06`), the §7.1
   toolbar in its documented order, uniform *and* rows modes, dominant-colour
   placeholder, the full badge set, peek, and the sticky selection action bar.
5. **Search screen** layout with the signal line; **Pipeline** three-column
   layout; **Review** Needs-Attention landing.
6. **Viewer overlay + zoom**, **Compare**, **Reader**, **Panel editor**, **Cropper
   Lab**, export, collections, onboarding, Diagnostics, quick switcher, undo/redo.
7. **State coverage** — implement the `STA-*` catalogue as each screen lands, then
   the `TST-17` layout, `VIS-15` contrast and `TST-19` visual-regression suites.

## 10. Stage C gate (UI completeness) — result

**NOT PASSED** (as of increment 12). Five of the design's screens still do not
exist, ~30 documented states are unimplemented, and the viewport matrix has no
automated check. What the last four increments moved: navigation destinations from
3 ✅ / 8 ◑ / 16 ✗ to **9 ✅ / 9 ◑ / 9 ✗**, shared controls from 9 ✅ / 4 ◑ / 8 ✗ to
**16 ✅ / 4 ◑ / 1 ✗** (the library is complete — every control §10.6 names exists),
and screens from 1 ✅ / 10 ◑ to **2 ✅ / 9 ◑** (Settings is complete as a screen). The
gate is re-evaluated as each item in §9 lands; progress per increment is recorded in
`docs/implementation-progress.md`.