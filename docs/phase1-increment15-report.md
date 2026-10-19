# Phase 1 — Increment 15: the Inspector, full section set (design §7.2)

| | |
|---|---|
| **Date** | 2026-10-18 |
| **Policy** | `AGENT.md` §"UI-First Implementation Strategy" — Stage A (complete the UI) |
| **Requirements** | `INS-02`–`INS-11`, plus `TAG-01`–`TAG-03` and `STA-15` |
| **Follows** | Increment 13 (Explore) — `docs/phase1-increment13-report.md` |

## 1. The rule that shapes everything: `INS-03`

Increment 13 shipped the inspector as a stub with only Preview and File, because
those two are the only sections that are *always* present. This increment builds
the remaining eight.

The design's rule is `INS-03`: **a field with no value is hidden, and a section
with no visible fields is hidden entirely.** That is easy to state and easy to
violate — the failure mode is a heading above an empty body, or a column of em
dashes for fields an item happens not to have.

It is enforced structurally rather than by convention: every section returns
`null` before rendering when it has nothing to show, so a section cannot produce a
heading without content. A future section that forgets the check fails a test
rather than shipping an empty heading.

## 2. What was built

| Req | Section | Notes |
|---|---|---|
| `INS-02` | Section order | ComfyUI: Preview · File · Generation · Workflow · Tags & notes · Processing. Comic: Preview · File · Panels · Text · Tags & notes · Processing. Both exported so a test asserts the order rather than trusting the file. Each is a heading with a toggle carrying `aria-expanded`. |
| `INS-04` | Preview | `calc(100% - 32px)` wide, up to 60% of the inspector height, `object-fit: contain`. While the 1280 px preview loads the cached thumbnail is shown **scaled up** with a "Loading preview…" caption — never a blank box. Click opens the viewer. Comic pages get the two `Show panels` / `Show text regions` toggles. |
| `INS-05` | File | Name, Folder (copy + reveal), Format, Dimensions, Size in MB to one decimal, Modified, Added — each row conditional on having a value. |
| `INS-05a` | Comic source | Source URL with **copy and a separate explicit Open**; copying never launches a browser. Source site and Artist, comic only. |
| `INS-06` | Generation | Positive prompt clamped to six lines with "Show more"; negative prompt collapsed by default; Model, LoRAs one per line as `name · weight`, Sampler, Scheduler, Steps, CFG, Seed (copyable), Denoise. Label column 96 px. |
| `INS-07` | Workflow | Shown only when the item has one. **Collapsed by default**, shows the node count without the JSON, and the JSON is fetched **only** when the user asks. "View JSON" opens a read-only dialog with in-dialog search. |
| `INS-08` | Tags & notes | Tag chips with `Enter`/comma commit, Backspace-to-remove, autocomplete, and the `TAG-01`–`TAG-03` rules. 0–5 star rating settable by click or by the `0`–`5` keys **when focused**. Favourite toggle. Notes autosave 2 s after typing stops and on blur, with `Saving…` → `Saved`, and on failure `Couldn't save — your text is still here. [Retry]` (`STA-15`). |
| `INS-09` | Processing | One line per stage with an icon, a **text** status (so colour is never the only signal) and a time. A failed stage shows its error and "Retry this stage", which creates a job scoped to that one item — it is never started automatically (`PRD-06`). |
| `INS-10` | Comic page | Panels with a status line that distinguishes *not decomposed* from *no panels found* from *stale*, a panel list, and Decompose / Re-decompose / Edit panels. Text grouped by region with "Edit in Review". |
| `INS-11` | Comic panel | Crop preview, a parent-page chip (`GAL-20`), the box in source pixels with reading order, the panel's text, its tags read-only, and the parent page's rating/favourite shown **read-only** — `FLG-06` and Appendix D.1 finding 9: a panel has no rating of its own. |

## 3. Two decisions worth recording

**In-session drafts live in the screen, not the inspector.** Tags, rating,
favourite and notes are held in `ExploreScreen` and merged into the detail the
inspector receives. This is because `INS-08`'s "Saved" note claims the value is
kept — an edit held only inside the inspector would vanish the moment the user
selected another image and came back, and the note would be lying.

They are explicitly **in-session only**. Nothing is written to the catalog, and
each write is a Stage D integration point. The screen reports through the shell's
note line rather than implying a save that did not happen.

**The workflow JSON is not pre-fetched.** `INS-07` says it is fetched only when
asked, and the detail record therefore carries `workflowJson: string | null` where
`null` means "not requested yet" — which is *not* the same as absent.
`hasWorkflow` is the separate flag that decides whether the section exists at all.
Conflating the two would have made the section disappear for the wrong reason.

## 4. Tests

`exploreInspector.test.tsx`, **55 tests**, organised by requirement:

- `INS-02` the two orders, in document order, plus the toggle's `aria-expanded`.
- `INS-03` six tests that build a record with something deliberately missing and
  assert the row or the whole section is gone.
- `INS-04` `object-fit: contain`, the loading caption, the comic toggles present
  only for a comic page, and `STA-12`'s named missing file.
- `INS-05`/`05a` copy-without-opening, the 2.4 MB formatting, creator comic-only.
- `INS-06` every field, the LoRA line format, the collapsed negative prompt,
  `Show more` only when long, copy and search.
- `INS-07` collapsed by default, **no fetch until asked**, and the read-only
  dialog with working in-dialog search.
- `INS-08` commit rules including the pasted-comma case and `TAG-01`/`TAG-03`
  rejection, rating by click and by key with focus required, autosave timing,
  save-on-blur, `STA-15` keeping the text, and no leakage of the previous item's
  edits after switching.
- `INS-09` text statuses, the per-item retry, and exactly one retry for one
  failed stage.
- `INS-10` the three panel states kept distinct, and text grouping.
- `INS-11` the box, the parent chip, the inherited read-only rating, and the panel
  taking precedence over the page.

Three tests were rewritten during this increment because of test-harness
behaviour, not product defects: `vi.useFakeTimers()` leaked into later
`userEvent.setup()` instances in the same file and made six unrelated tests fail
in-suite while passing alone. The autosave tests use real timers with an explicit
test timeout instead.

## 5. Status

Frontend: **25 files, 584 tests**. `npm run build` PASS. `npm run lint` 0 errors
and the 14-warning pre-existing baseline, with no new warnings from the Explore
or Inspector files.

`panel_folder_cropper_v11.py` untouched (SHA-256 `6A120FAF…C62AD0A`). No backend
code changed.

## 6. What is still not included

- **`INS-11`'s panel selection path is not wired.** `panelDetail` is a typed seam
  held at `null`, because panel cards only exist in comic scope and `GAL-19`'s
  panel cards are not built. The component and its 5 tests are real; what reaches
  it is not.
- **The panel record has no `flag`/`hidden`** — those are `FLG-*`, unbuilt.
- **`Decompose`, `Edit panels` and `Edit in Review` report through the shell
  note.** The buttons and their wording ship; the destinations are Phase 5a.
- **OCR confidence is not shown**, deliberately — `VERIFY` #5 is unresolved and
  `§21.1` assumption 3 forbids fabricating it.