# Phase 1 — Increment 17: Hide, Pick and Reject (design Appendix E.1)

| | |
|---|---|
| **Date** | 2026-10-18 |
| **Policy** | `AGENT.md` §"UI-First Implementation Strategy" — Stage A (complete the UI) |
| **Requirements** | `FLG-01`–`FLG-11`, `FLG-05`'s count text, `NAV-51`'s Undo toast |
| **Follows** | Increment 16 (Table view) — `docs/phase1-increment16-report.md` |

## 1. Three ideas that are easy to conflate

The appendix is eleven rules long because it is careful about the difference
between three things that all look like "getting an item out of the way":

| | Effect on visibility | Effect on processing | Reversible |
|---|---|---|---|
| **Hide** | gone from every result set (`FLG-02`) | **none** — a job still processes it (`FLG-05`) | yes, as one batch |
| **Reject** | still visible, dimmed to 0.45 (`FLG-07`) | none | yes, flag only |
| **Pick** | visible, with a badge (`FLG-08`) | none | yes, flag only |

Treating Reject as Hide would make it destructive, which `FLG-07` explicitly
refuses. Treating Hide as "removed" would silently stop jobs processing the item,
which `FLG-05` forbids. Each rule is therefore pinned by its own test rather than
by a shared code path that could be wrong in one direction only.

## 2. What was built

**The data.** `items.flag` (`none` / `pick` / `reject`) and `items.hidden` moved
onto `ExploreItem`, with the `REL-02` note that no stage, job or reprocessing
writes them. Two new `ExploreSource` methods, `setFlag` and `setHidden`, are the
only write seam, and both return **the ids they actually changed** so `FLG-10`'s
Undo covers exactly those rows.

**`FLG-02` is a query parameter, not a filter.** `ExploreQuery.hidden` is
`'exclude' | 'only'` and has no default, so an implementation cannot forget it —
an omitted filter that "usually" excludes hidden items is exactly how a hidden
item ends up back in the gallery. `passesHiddenFilter` is the single gate every
result path goes through, because `FLG-02` names nine places an item must vanish
from and a per-call-site check is nine chances to miss one.

**`FLG-05`'s count.** The hidden count is reported beside the total
("412 images (6 hidden)") rather than folded into it. A count that silently
dropped from 412 to 406 would leave a user with no way to tell the items are
still there.

**`FLG-07` / `FLG-08` filters.** Rejected and Picks are ordinary facets in the
Filters popover — a radio group, not checkboxes, because `FLG-09` says an item
has exactly one flag and independent toggles would let a user hold two.

**The UI.** Four buttons in the selection bar with the wording `FLG-03` fixes:
**Pick**, **Reject**, **Clear flag**, and **Hide** / **Show again** — the last
swapping on which view you are in. A rejected card dims its *image* to 0.45 and
carries a reject badge; the badge and the hover bar stay at full opacity so a
rejected item is still readable, and "Rejected" appears in the accessible name
because dimming alone is a visual-only signal.

**`NAV-51`'s Undo.** `notify` now takes an optional Undo offer, and the shell
shows it for 8 seconds. It lives in the shell rather than in Explore for the
reason the note line does: one message, one lifetime. A second message means the
newer action's undo can expire while the older one's toast is still on screen.

## 3. Two decisions worth recording

**Undo restores each item's *previous* flag.** `FLG-09` says setting a flag
replaces the previous one, so an undo that cleared the flag would be wrong for
any item that already carried one. `applyFlag` returns the previous value per
item, and `setFlag` reports only the items that actually changed — an item
already carrying the requested flag is not in the undo entry, because it was not
changed and putting it there would make Undo clear a flag the user never set
here.

**`browse.advanceAfterFlag` is a prop, not a registry lookup.** It is a setting,
not an action, and threading it explicitly puts the default (off) at the call
site where a reader can see it.

## 4. Tests

`flags.test.tsx`, **48 tests**:

- `FLG-03` the exact wording, and that no action label says delete or remove.
- `FLG-09` selection before focused item, changed-items-only, mutual exclusion.
- `FLG-02` both modes of the hidden gate.
- `FLG-05` a hidden item is still counted as work; the count text beside the total.
- `FLG-06` a panel reads its page's flag and hidden state, with a fallback when the
  page is not loaded.
- `FLG-07` 0.45, the badge, the batch confirmation's wording and count.
- `FLG-10` / `NAV-51` Undo restoring `pick` after a clear (not "no flag"), and Undo
  of a Pick clearing it.
- The Hidden view: reachable, self-naming, "Show again" instead of Hide, leaving,
  and the reported count.
- The batch hide: present with no selection, counting the whole view, cancellable,
  and undone as one batch.
- The fixture: `exclude` returns no hidden items and reports the count, `only`
  returns only them, `setFlag` sticks, and re-setting the same flag reports
  nothing changed.

## 5. Not included

- **The flag actions are not in the action registry.** Appendix E.9's `Alt+P` /
  `Alt+X` / `Alt+U` depend on `VERIFY` A1, and A1 is unresolved. `Ctrl+Shift+H`
  (Hide) does *not* depend on A1 and is the next increment's shortcut work.
- **`FLG-05`'s "(N hidden)" is on the gallery count**, not yet on the Pipeline
  scope counts — `PIP-*` is Phase 4.
- **`FLG-06`'s panel inheritance is modelled and tested but not displayed**,
  because `GAL-19`'s panel cards are not built.
- **`E.5`'s five settings are not in the registry** (`privacy.*`,
  `browse.advanceAfterFlag`, `table.columns`). `advanceAfterFlag` is honoured as a
  prop; the rest wait for the Settings wiring.