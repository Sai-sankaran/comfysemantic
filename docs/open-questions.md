# Open questions — owner decisions this work is blocked on

`design.md` §21.3:

> No new product-preference question is currently required to begin the audit or
> shared UI foundation. A genuinely new issue discovered during implementation
> must be added to this document with: the exact requirement IDs affected,
> evidence, at least two concrete options, the consequence of each option, and a
> recommended default. **A question must not be used to defer work that this
> specification already defines.**

Each entry below follows that format. None of them is being used to defer defined
work: every unblocked task continues, and each blocked feature is left in an
honest, explicitly-unavailable state rather than built wrongly.

**Last updated:** 2026-10-18

---

## Q-1 — Per-library `catalog.db` split or one shared catalog?

**Requirements affected:** O-1 · `§4.2`, `§5.2`, `ONB-10`…`ONB-14`, `D-32`,
`LIB-05`, `REL-03`, and every downstream phase (1b → 7 read the new catalogs).

**Evidence.** `design.md` §4.2 specifies **one `catalog.db` per library** in a
`libraries/` directory, and Appendix D.3's consolidated data additions are all
written against a per-library `catalog.db`. The current code has a different
layout, and Phase 1b exists specifically to build the data-access interface and
new schema without performing the real cutover (which Appendix D.2 keeps in
Phase 6).

**Options**

| | Consequence |
|---|---|
| **A. Per-library, as specified** | Matches the document everywhere. Larger migration effort. `LIB-05` type changes become a catalog migration rather than a table rewrite. |
| B. Keep one shared catalog | Cheaper to build, but every requirement that says "this library's catalog" has to be reinterpreted, and `LIB-05`'s backup-before-migration has no natural boundary. |

**Recommended default: A.** The specification is unambiguous, and Appendix D.3
already committed the data model to it. Choosing B would put the code in
permanent conflict with the document.

**Blocks:** Phase 1b entirely, therefore Phases 2–5a's backend work and Phase 6's
migration.

---

## Q-2 — How is the one-time catalog migration performed?

**Requirements affected:** O-2 · `ONB-10`…`ONB-14`, `D-68`, `REL-03`, `VWH-06`.

**Evidence.** `design.md` §19.2 requires migrating the current catalog, and
`§21.2` item 2 requires the rehearsal to run on a **copy**. Appendix D.2 defers the
real cutover to Phase 6. `REL-03` requires a verified backup before any run over
1,000 items.

**Options**

| | Consequence |
|---|---|
| **A. Build backup/restore and rollback first; rehearse on a copy; cut over only in Phase 6 behind a verified backup** | Safest, and what the roadmap already sequences. Slower to first release. |
| B. Migrate in place with a backup as the only safety net | Faster, but a failed migration with a corrupt backup is unrecoverable, and `REL-03` would be violated in practice if not in letter. |

**Recommended default: A.**

**Pre-condition that must not be skipped:** `VERIFY` #13 (user-corrected OCR and
panel data surviving reprocessing) is **unresolved**. A rehearsal could destroy
the only copy of a user's corrections. This must be covered by tests *before* any
migration runs, not after.

**Blocks:** Phase 1b's rehearsal, Phase 6's cutover.

---

## Q-3 — Accept `panels.csv` as the cropper manifest, or write a new cropper?

**Requirements affected:** O-4 · `CMC-02`, `VERIFY` #3, `§8.2`, `§8.3`, `§8.5`.
**This blocks the Comic/Manhwa Decompose release.**

**Evidence.** The protected script `panel_folder_cropper_v11.py` emits a
**`panels.csv`**; observed as a test artefact at
`pytest-of-sai/…/test_round_trips_a_real_csv0/out/panels.csv`. `design.md`
`CMC-02` specifies a JSON manifest `{page_path, boxes, script_version}`.
`VERIFY` #3 additionally forbids similarity-based matching as the primary mapping
mechanism and requires that every output maps deterministically to a parent page
and coordinates.

**Options**

| | Consequence |
|---|---|
| **A. Accept `panels.csv` as the deterministic manifest**, documenting the shape difference from `CMC-02` | Unblocks Decompose immediately. Requires a recorded spec correction, since `CMC-02`'s stated shape is not what exists. |
| B. Write a **new** cropper version (a new file; the protected script stays untouched) that emits the documented JSON manifest | Matches `CMC-02` exactly. Costs a rewrite and a re-validation of the panel-detection thresholds in `§8.3`. |

**Recommended default: A**, provided the CSV carries the script version and
per-box coordinates — which is exactly what `VERIFY` #3 asks to be proven. If it
does not, the answer becomes B.

**Status of the code today:** neither. Decompose is **not released**, and the UI
says so. `panel_folder_cropper_v11.py` is byte-identical
(SHA-256 `6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A`) and
has not been modified.

---

## Q-4 — What does "Batch candidates" actually search?

**Requirements affected:** O-5 · `SRC-04`, `VERIFY` #7, `§7.6`.

**Evidence.** `VERIFY` #7 requires tracing exactly what "Batch candidates"
searches and what "Status: read" and "OCR ok ✓" mean. A `batch_recovery`
implementation exists in the repository, but its query semantics have not been
traced. The spec is explicit that synthetic-fixture instrumentation must be moved
to the test harness rather than presented as a production source.

**Options**

| | Consequence |
|---|---|
| **A. Trace it, preserve any real user-facing capability, and move fixture-only labels to the harness** | Keeps `SRC-04` honest. Requires tracing work before Search is finished. |
| B. Reimplement `SRC-04` from the specification and drop the legacy label | Cleaner, but risks silently dropping a real capability, which `D-31` forbids. |

**Recommended default: A.**

**Status of the code today:** Search has a keyword/exact path only. No
"Batch candidates" source is presented, so nothing misleading is shown; the
feature is simply absent and recorded as such.

---

## Q-5 — Portable data directory: what does the shipped build actually do?

**Requirements affected:** O-6 · `VERIFY` #1, `SET-*` `storage.dataDir`, `PRF-20`.

**Evidence.** `src-tauri` resolves the data directory with
`COMFYPANEL_PORTABLE_DIR` taking precedence and passes it to the worker; a code
comment records the reason (an ambient variable would silently override the
portable location). What has **not** been verified is whether the shipped ZIP is
self-contained or still depends on `%LOCALAPPDATA%`.

**Options**

| | Consequence |
|---|---|
| **A. Build and run the packaged ZIP, confirm self-containment, and document it** | Resolves the item properly. Needs an exe build. |
| B. Treat the code path as sufficient evidence | Faster, but `VERIFY` #1 explicitly asks about the shipped artefact. |

**Recommended default: A.** `design.md` says "Do not change the default path
before testing backup and portability implications."

**Status of the code today:** the path exists and is exposed in the Settings
storage category; nothing claims the ZIP has been verified.

---

## Q-6 — Keep the exact Python vector scan, or implement the memory-mapped store?

**Requirements affected:** O-7 · `VERIFY` #6, `§14.5`, budget **B7**.

**Evidence.** `VERIFY` #6 requires measuring the existing vector store against
B7 and checking config/version invalidation before deciding. **B7 cannot be
measured** because no budget harness exists.

**Options**

| | Consequence |
|---|---|
| **A. Measure at 12k and 50k vectors; keep the exact scan if it passes** | The rule the specification already states. Requires the budget harness (Phase 7 tooling). |
| B. Implement the memory-mapped design now | Speculative work against an unmeasured problem. |

**Recommended default: A.**

**Status of the code today:** no ANN was added, per §14.5. Semantic search is
shown as unavailable with `STA-08` ("Semantic search needs the model runtime")
rather than presented as working.

---

## Q-7 — Are the audio/video embedding stages still useful?

**Requirements affected:** O-10 · `ASSUMPTION` #4, `QFL-03`, `PIP-*` presets.

**Evidence.** §21.1 assumption 4 asks that existing functionality be audited and
preserved if currently supported, or that the stage's status be documented if
inert or experimental. The stages exist in the worker; their value is unproven.

**Options**

| | Consequence |
|---|---|
| **A. Verify them on real audio/video in a ComfyUI library, and keep or scope out on evidence** | Answers the assumption as written. |
| B. Document them as experimental now | Permitted by assumption 4, but weaker than verifying. |

**Recommended default: A.**

---

## Not questions — recorded for clarity

These were **resolved** during implementation and are listed only so they are not
re-raised:

| Item | Resolution |
|---|---|
| Stack claims said React 18; the code is React 19 (O-8) | Documents corrected; React 19 kept. Guarded by `tests/test_doc_drift.py`. |
| `VERIFICATION_REPORT.md` claimed no frontend tests (O-9) | Document corrected. Vitest suites exist and run; 24 files / 529 tests. |
| Should the settings registry be built before the rest of the UI? | Not an owner question. The document specifies it as the single source (`SET-01`), so it was built as part of completing the Settings screen. |
| `VERIFY` #8 — the "Synthetic Fixture (2)" label | Resolved: it is fixture instrumentation, moved out of the production path. The Explore source now labels fixture data explicitly in the toolbar. |
| Shortcut conflicts between `Space` in the grid and `Space` in the Reader | Resolved by scoping: the grid's keys live in a new `gallery` action context dispatched by the grid's own handler, not by the window listener. `NAV-32` is satisfied. |

## New questions raised during implementation

None. Every discrepancy found during increments 10–13 was either a defect in the
code (fixed) or an ambiguity resolved by reading `design.md` more carefully
(recorded in the increment reports), not a genuine product-preference question.