# Phase 1 — Increment 16: Table view (design Appendix E.2)

| | |
|---|---|
| **Date** | 2026-10-18 |
| **Policy** | `AGENT.md` §"UI-First Implementation Strategy" — Stage A (complete the UI) |
| **Requirements** | `TBL-01`–`TBL-10`, plus `FLG-11`'s column and `STA-11` reuse |
| **Follows** | Increment 15 (Inspector) — `docs/phase1-increment15-report.md` |

## 1. The one decision that makes the rest easy

`TBL-01` requires that switching views keeps the selection, filters, sort, quick
filters and focused item. That is only true if the table and the grid are two
**presentations of one result sequence** rather than two features that look
similar.

So `ExploreTable` receives `items`, `selectedIds`, `focusedId` and callbacks as
props and owns **none** of them. The grid's layout, the selection and the view
mode all live above it in `ExploreScreen`, and the only new state that crosses
into it is the column layout. Switching the toggle therefore cannot change the
selection — there is nothing for it to change.

The layout toggle is a **new** control rather than a third option on the existing
Grid mode control, because they answer different questions: "table or cards?"
and "which card layout?". The card-layout control is hidden while the table is
showing rather than left active and inert.

## 2. What was built

| Req | Implementation |
|---|---|
| `TBL-01` | Parity by construction, plus a one-shot reveal flag so the table scrolls the focused row into view. `browse.viewMode` is owned by the shell (scopes A/L/F), so `Alt+1`/`Alt+2` reach it from any destination. |
| `TBL-02` | Three column sets: ComfyUI (18 columns), comic page (14) and comic panel (8). Name is always shown; Prompt is off by default. A new `ExploreRowValues` on `ExploreItem` carries the per-row values — a backend would join them into the list query, which is why the table needs no request per row. |
| `TBL-03` | Only the eight indexed ComfyUI columns are sortable. The cycle is ascending → descending → **library default**, and the third stop exists because without it there is no way back to the library's own ordering. Unsortable headers are disabled with the exact tooltip `This column can't be sorted.` |
| `TBL-04` | Row height 28/32/40 and thumbnails 24/28/36 by density. Virtualised with 8 rows of overscan and the same 200-item keyset pagination as the grid. |
| `TBL-05` | Full keyboard parity — arrows, Home/End, PageUp/PageDown, modifiers carried through, Enter to open, click-select with Shift/Ctrl, double-click to open. Lasso is deliberately absent and a test asserts it stays absent. |
| `TBL-06` | Columns menu with show/hide, **Move left / Move right** per column (never drag-only), drag-to-resize clamped at 64 px, and Reset columns. Name's checkbox is locked with the reason "Always shown" beside it. |
| `TBL-07` | Cells truncate with an ellipsis and carry the full value in the tooltip. Prompt clips at 60 characters, OCR text at 80 — and the *tooltip* holds the untruncated value, because `TBL-07`'s point is that the full value is reachable. |
| `TBL-08` | CSV of the visible columns in their current order, RFC 4180 quoting, all rows of the result rather than the loaded page. |
| `TBL-09` | `role="grid"`, `aria-multiselectable`, `aria-rowcount`, `aria-rowindex`, `aria-selected` per row, `aria-sort` per header, and a focus ring that is an outline rather than a colour change. |

`TBL-10` (12,000 rows within budget **B5**) is **not** verified — there is no
budget harness, the same gap that blocks `VERIFY` #6. Virtualisation is
implemented and tested; the frame budget is not measurable here.

## 3. Two defects the tests found

1. **`clip` cut surrogate pairs in half.** `String.slice` operates on code units,
   so a prompt or an OCR line containing an emoji or CJK produced a lone
   surrogate that renders as a replacement glyph. Clipping is now over code
   points. This is not hypothetical for a comic library — OCR text is exactly
   where CJK lives.
2. **The tooltip carried the truncated value, not the full one.** The Folder cell
   shows only the last path segment, but the cell's `title` was built from that
   same segment, so the one place the full path could be read was the place it was
   most truncated. The rendered value and the tooltip value are now separate
   arguments to `cellFor`.

## 4. A `NAV-31` regression the tests caught

Registering `view.gridMode` / `view.tableMode` on the `menu` surface put two new
entries in the View menu. `NAV-31` requires that menu to carry the old Options
items **in their original order**, and it is a list, not a set. Both existing
tests failed on the exact expected array, which is the guard working.

Fixed by registering them on the palette and shortcut surfaces only — which is
what `E.2` actually says ("plus palette actions"). A test now asserts they are
*absent* from the View menu, so the regression cannot come back.

## 5. The Appendix A drift this increment found

`tests/test_action_registry_drift.py` compares the registry against Appendix A
and reported `alt+1`, `alt+2`, `alt+p`, `alt+x`, `alt+u`, `mod+shift+b`,
`mod+shift+h` as shortcuts the code declares that Appendix A does not define.

The guard was right and the document is behind itself: Appendix E.9's heading says
*"Shortcuts introduced here (added to Appendix A)"*, but Appendix A has not been
regenerated to list them. The parser now reads Appendix E.9's table as part of
the normative map.

Only the **table** is read. The `VERIFY` paragraph after it lists fallbacks that
*replace* the Alt keys depending on how A1 resolves; parsing it would assert both
bindings exist at once, which the design explicitly denies. This is also why the
two actions bind `alt+1` / `alt+2` alone rather than both — the switch to
`Ctrl+Shift+1` / `Ctrl+Shift+2` happens when A1 resolves, and Appendix A is
regenerated then.

`design.md` itself was not edited. It is the authority, and Appendix A being a
revision behind is recorded here rather than patched.

## 6. Tests

`tableView.test.tsx`, **47 tests**:

- `TBL-02` the three column sets, Prompt off by default, Name always present.
- `TBL-03` the sortable set, the three-stop cycle, and the exact refusal tooltip.
- `TBL-04` density metrics and viewport maths.
- `TBL-06` hide/show, move both ways with nothing else disturbed, the end clamps,
  the 64 px minimum, and Reset.
- `TBL-07` truncation at 60/80, the full value in the tooltip, empty rather than a
  placeholder for absent values, the three panel states, and the surrogate-pair
  case.
- `TBL-08` header order, full values in the CSV, RFC 4180 quoting, and all 412
  rows rather than the loaded page.
- The assembled table: grid semantics, `aria-sort`, per-row selection, bounded
  DOM for 2,000 rows, modifier-carrying clicks, double-click to open, arrow-key
  movement with Shift, clamping, no lasso.

**Results:** frontend **26 files, 635 tests passed**. `npm run build` PASS.
`npm run lint` **0 errors, 14 warnings** — the pre-existing baseline, none from
the new files. Backend **1157 passed, 18 skipped**; the action-registry drift
guard is 7/7.

`panel_folder_cropper_v11.py` untouched. No backend code changed.

## 7. What is not included

- **`TBL-10` / budget B5** is unverified: no budget harness exists.
- **`TBL-08` reports through the shell note** rather than writing a file. The CSV
  content is built and tested; choosing an export folder needs Appendix I's export
  engine, which is not built.
- **The column layout is in-memory.** `TBL-06` says it is saved per library in
  `table.columns`; the layouts are kept per target for the session, and the
  persistence is the `SET-04` write that is not wired.
- **The flag column is always "No flag."** `FLG-11` requires the column to exist
  before `FLG-04`–`FLG-09` add the actions, and the fixture says so rather than
  showing flags that cannot be set.
- **Comic panel rows need `GAL-19`**'s panel cards, which are not built, so the
  panel column set has tests but no reachable rows yet.