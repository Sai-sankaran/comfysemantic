# ComfyPanel Studio — Implementation Report

Date: Fri Oct 16 2026

This report covers the **logic / backend correctness** workstream. It is
deliberately explicit about what is *fixed and test-verified*, what is
*implemented but not independently verified*, and what remains *unverified,
blocked, or not reproduced*. UI redesign is out of scope (owned by another
agent).

## Baseline

- Branch `master`, HEAD `e9f4c91`.
- Full backend suite (final verification run after every change below):
  **1059 passed, 17 skipped, 0 failed** (~4.6 min).
  (Skips are environmental: real GGUF model, ffmpeg video, real crop files,
  symlinks, optional workflow JSON.)
- Each defect below was reproduced first: the new test was run against the
  unfixed code and confirmed to fail before the fix was applied.
- Frontend: `tsc -b` clean; Vitest 119 passed.
- `panel_folder_cropper_v11.py` SHA256 unchanged:
  `6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A`.

## Fixes (fixed + test-verified)

### 1. Folder-scoped OCR executed nothing — fixed
`rpc_start_folder_ocr` scheduled a job but the folder path never reached the
dialogue pass: the caller fed the dialogue pass the literal stage name
`["dialogue"]` as its `scopes`, which matched neither `"image"` nor `"panel"`
and no-opped. The panel branch additionally referenced a non-existent
`canonical_path` column on `panel_crops`.

Changes:
- `backend/worker.py`: `rpc_start_folder_ocr` derives OCR scopes from the
  library preset via `engine._dialogue_scopes(library_id)`, validates each
  folder (exists, directory, inside resolved library root), dedupes overlapping
  selections to the covering ancestor, refuses a duplicate concurrent job for
  the same scope, records a job row, and reports `processed`.
- `backend/indexing_engine.py`: added `_dialogue_pass_with_folder_scope`
  (selects `images.canonical_path` for image scope and `panel_crops.crop_path`
  for panel scope; places the folder `LIKE` predicate correctly relative to
  `_indexable_panels_where()`), added `_dialogue_scopes()`, and routed
  `_stage_dialogue` through the folder pass when `folder_paths` is supplied.

Tests: `tests/test_folder_ocr_execution.py` (real stage execution with a
deterministic fake recogniser; proves in-scope pages are processed, out-of-scope
pages are untouched, panel scope uses `crop_path`, manual corrections survive,
and the RPC runs end-to-end).

### 2. Maintenance could race a running folder-OCR job — fixed
A folder-OCR job runs on its own throwaway engine. `_quiesce_background_jobs`
(used by `reset_database` / `restore_database`) stopped only the main engine and
joined only the index/cropper threads, so a running folder-OCR pass kept writing
while the catalog connection was closed and the file replaced.

Changes (`backend/worker.py`): folder-OCR engines are now tracked in
`_folder_ocr_engines`; `_quiesce_background_jobs` calls `request_stop()` on each
and joins `_folder_ocr_threads`.

Test: `test_quiesce_stops_running_folder_ocr` (verified to fail without the fix).

### 3. Folder-OCR leaked its catalog connection — fixed
The folder-OCR task opened a connection on its throwaway engine and never closed
it, leaking a catalog handle (and holding the file open) after every job.

Changes (`backend/worker.py`): the task's `finally` block now calls
`temp_engine.close()` and unregisters the engine.

Test: `test_folder_ocr_closes_its_engine_connection` (verified to fail without
the fix).

### 4. Unstable browse/adjacent ordering broke pagination — fixed
`browse()` and `get_adjacent_image()` ordered only by `mtime`/`filename`/`size`.
Many images legitimately share identical values, and SQLite may order ties
differently between the page-N and page-N+1 queries, so `LIMIT/OFFSET` could
repeat or skip rows ("some images never appear").

Changes (`backend/search.py`): appended the stable `i.id` tie-breaker to both
`browse()` and `get_adjacent_image()`.

Tests: `tests/test_browse_ordering.py` (verified to fail for `mtime_asc` without
the tie-breaker).

### 5. Test suite silently wrote to the production catalog — fixed
`BackendWorker` derives its catalog path from `default_data_dir()`, not from its
`scratch_root`. Several tests therefore opened — and wrote to — the developer's
real catalog in `%LOCALAPPDATA%\ComfyPanelStudio`. In the sandbox this could not
be opened at all, so those tests failed for the wrong reason.

Changes:
- `backend/worker.py`: `default_data_dir()` honours an opt-in
  `COMFYPANEL_DATA_DIR` override. When unset — the only production case —
  behaviour is exactly the historical per-user location.
- `tests/conftest.py`: an autouse **function-scoped** fixture points
  `COMFYPANEL_DATA_DIR` at `tmp_path/appdata` per test.

Note: an early session-scoped version of this fixture made every test share one
catalog (because `COMFYPANEL_DATA_DIR` outranks the per-test `LOCALAPPDATA`
redirect that several tests use to isolate themselves). That caused three
order-dependent failures; the function-scoped version fixes them.

### 6. `test_folder_ocr_scope.py` asserted behaviour contrary to its own contract
The contract states overlapping folder selections are deduplicated, but
`test_folder_ocr_overlapping_folders` asserted both the parent and child were
kept. Corrected to assert collapse to the covering ancestor, in both input
orders.

### 7. Shutdown closed the catalog under a live writer — fixed
`BackendWorker.shutdown()` set `_closing`, stopped the main engine, stopped the
runtime and closed `self.conn`, but it did not stop the per-job folder-OCR
engines and did not join *any* background thread. A folder-OCR pass that was
mid-write when the supervisor closed stdin therefore had its connection closed
underneath it (`Cannot operate on a closed database`), and the job's terminal
status could be lost. The engine's own connection was also never closed.

Changes (`backend/worker.py`): extracted `_background_threads()` and
`_request_background_stop()` (shared with the maintenance quiesce); `shutdown()`
now stops every background engine, joins every writer thread (bounded by
`SHUTDOWN_JOIN_TIMEOUT_SECONDS`), and — if a thread outlasts the timeout — leaves
the catalog open for the process exit rather than closing a connection that is
still in use. Only when nothing is still alive does it close the engine, the
folder-OCR engines and `self.conn`.

Tests: `test_shutdown_stops_and_joins_folder_ocr`,
`test_shutdown_keeps_catalog_open_when_writer_outlasts_join` (both verified to
fail without the fix).

### 8. A crashed stage was reported as a *completed* job — fixed
`run_indexing` catches a stage crash, records the error, marks the stage
`failed`, and breaks the stage loop — but then set the job status to
`"completed"` (because `_stop` was not set) and advanced
`libraries.last_scanned_at`. The UI showed a finished, successful scan over a
library that had actually stopped partway through.

Changes (`backend/indexing_engine.py`): track the crashed stage and set the
terminal job status to `"failed"` (precedence: `cancelled` > `failed` >
`completed`); only a clean walk of every stage advances `last_scanned_at`.

Tests: `tests/test_job_lifecycle.py::test_crashed_stage_reports_job_failed`,
`::test_crashed_stage_records_an_error_row` (verified to fail without the fix).

### 9. A partial discovery scan was read as proof of deletion — fixed
`os.walk` silently swallows directory-read errors unless given an `onerror`
handler. The discovery stage then treated every existing row absent from the
walk as deleted: it set `missing=1` and deleted the `image_fts` row. A directory
that was transiently unreadable (permission blip, removed mid-walk, dropped
mount) therefore hid a large, intact slice of the library from browse and search
until a later scan.

Changes (`backend/indexing_engine.py`): the walk collects errors via `onerror`;
when the walk was incomplete the run skips missing-file reconciliation (and the
rename relink) entirely, because an unobserved file is not a deleted file.

Tests: `tests/test_discovery_reconciliation.py` (control: a genuinely deleted
file is still flagged; verified to fail without the guard).

### 10. A non-object JSON line killed the worker — fixed
`handle_request` read `payload.get(...)` before its `try`. A JSON Lines message
that parsed to a non-object (`42`, `"x"`, `[]`, `null`) raised `AttributeError`
straight out of `run_stdio_loop` — the loop only catches `JSONDecodeError` — and
terminated the worker process. Non-dict `params` silently misbehaved.

Changes (`backend/worker.py`): `handle_request` rejects a non-object payload and
non-object `params` with a normal error response instead of crashing.

Tests: `tests/test_worker_protocol.py::test_non_object_json_request_is_rejected_without_killing_worker`,
`::test_non_object_params_are_rejected_cleanly` (verified to fail without the fix).

### 11. A failed reset/restore bricked the worker — fixed
`rpc_reset_database` / `rpc_restore_database` closed `self.conn` and the engine,
then swapped the catalog. If the swap raised (missing/corrupt backup, a locked
file on Windows), the connection was left closed and **every** later request
failed with `Cannot operate on a closed database` until the process restarted.

Changes (`backend/worker.py`): the reopen + `init_database` now run in a
`finally`, so the worker stays usable whatever the swap does.

Tests: `tests/test_job_lifecycle.py::test_failed_restore_leaves_the_worker_usable`,
`::test_failed_reset_leaves_the_worker_usable` (verified to fail without the fix).

### 12. `get_adjacent_image` duplicated its filter bindings — fixed
The parameter list was extended *inside* the filter-fragment loop
(`for f in frags: ... params.extend(fparams)`), so every fragment re-appended the
whole list. With two or more active filters the query supplied more bindings than
placeholders and raised `sqlite3.ProgrammingError`, breaking next/previous
navigation in any filtered viewer.

Changes (`backend/search.py`): extend the parameters once, after the loop
(`browse()`, `count()`, `_vector_search()` already did this correctly).

Test: `tests/test_cross_page_navigation.py::test_get_adjacent_image_with_multiple_filter_fragments`
(verified to fail: "statement uses 3, and there are 5 supplied").

### 13. An interrupted thumbnail write poisoned the cache — fixed
`generate_thumbnail` returned any existing file whose size was non-zero as a
cache hit, but wrote the WebP straight to that path. A crash/kill mid-save left
a truncated-but-non-empty file that every later run served as a valid thumbnail,
so one interruption broke that image for the life of the cache.

Changes (`backend/thumbnail.py`): render to a unique temporary file and
`os.replace()` it into place; remove the temp file on failure.

Test: `tests/test_thumbnail_cache.py::test_interrupted_write_does_not_poison_the_cache`
(verified to fail: the truncated file was served and failed to decode).

### 14. A reappeared file stayed hidden forever — fixed
The discovery reconciliation built `existing` from `WHERE ... missing=0` only.
When a previously-flagged file came back unchanged it was not found in
`existing`, so it was queued as a *new* row — but `images.canonical_path` is
`UNIQUE`, so the `INSERT OR IGNORE` was silently discarded and the original row
stayed `missing=1` (and unsearchable) permanently. Nothing else cleared the flag
(the rename path only considers rows already in `existing`).

Changes (`backend/indexing_engine.py`): reconciliation now loads already-missing
rows too; a found unchanged row that is `missing=1` is flipped back to
`missing=0` with `fts_status='pending'` (its `image_fts` row had been deleted),
while a still-absent already-missing row is left untouched (no repeated no-op
writes).

Test: `tests/test_discovery_reconciliation.py::test_reappearing_file_is_rediscovered_and_searchable`
(verified to fail: the file stayed `missing=1`).

## Implemented but not independently verified

- **Review persistence**: now verified end-to-end through the RPC boundary.
  `tests/test_review_persistence.py` drives a real `BackendWorker` against a real
  catalog row and reloads from a **new** connection to prove durability:
  `dialogue_set_text` captures `machine_text` on the first edit and preserves it
  on a second edit; `dialogue_set_reviewed` sets and clears `reviewed`/
  `reviewed_at`; `dialogue_set_ink` (manual) preserves the machine measurement;
  and an edit against an unknown unit writes nothing and leaves the original
  row untouched.
- **SSD / performance instrumentation**: `test_performance_diagnostics.py`
  asserts high-level properties (startup does not index; re-opening a library
  does not schedule work; the thumbnail cache skips regeneration). Physical SSD
  I/O is **not** measured; the tests verify no unnecessary work is *scheduled*,
  which is a code-path property, not a disk-measurement.
- **Symlink / junction containment**: scope validation uses `.resolve()`, so a
  folder (or `..` traversal) that resolves outside the library root is rejected,
  and `os.walk` does not follow directory symlinks. A test that creates a real
  symlink is environment-skipped here (symlink creation is unavailable in the
  sandbox), so the *symlink-file* case is covered by reasoning + the resolved
  containment policy, not by an executed test.

## Observed / not reproduced / blocked

*(The first three items below were the open limitations at the start of this
pass. All three were subsequently reproduced and fixed — see "Third pass" at the
end of this report. The text is kept as written to preserve history.)*

- **Keyword `total` ignores `sources`**: `count_keyword()` (returned as `total`
  by `rpc_search`) always counts against `image_fts` per-image rows only, while
  `search_keyword(sources=...)` can additionally match the `batch` source
  (`batch_prompt_fts`) and the `ocr` source (`comic_text_fts`). A search scoped
  to those sources can return results while reporting `total` 0. Observed by
  inspection; **not fixed** (a correct fix must reproduce the multi-source
  union's de-duplication, which is a non-trivial change to a working path).
- **Dialogue text is never written to `comic_text_fts` (image scope)**: no code
  path inserts `unit_kind='image'` rows — only `_stage_panel_fts` writes panel
  rows. So `comic_text` image search and the keyword `ocr` source are always
  empty regardless of OCR. `DATABASE_SCHEMA.md` already documents the dialogue
  contribution as always empty, so this is a **known limitation**, not a
  regression; wiring `panel_text_units.text` (including manual corrections) into
  the index would be a feature change touching indexing, deletion cleanup and
  manual edits. Not attempted here.
- **Forcing `metadata` leaves `image_fts` stale until a later `fts` run**: the
  metadata stage rewrites `image_metadata` without resetting `images.fts_status`
  (only a changed file, via discovery, does that). Forcing only `metadata` and
  then running a default (skip-completed) pass therefore skips FTS rebuild and
  leaves search reflecting the previous metadata. Observed by inspection; **not
  fixed** — the current `force` contract is "honoured exactly as requested", so
  changing it is a behaviour decision rather than an isolated fix.
- **Earlier 16 failures**: caused by the sandbox denying access to
  `%LOCALAPPDATA%`/`%TEMP%`. Resolved for tests via `COMFYPANEL_DATA_DIR`. The
  production catalog at
  `%LOCALAPPDATA%\ComfyPanelStudio\libraries\catalog.db` could **not** be opened
  from the sandboxed process (`sqlite3: unable to open database file`); this is
  environment-related and was **not** investigated further. No production data
  was read, rebuilt, or deleted.
- **Visual screenshot audit**: deferred (no fabricated screenshots).

## Key code changes

- `backend/worker.py`: `default_data_dir()` override; folder-OCR scope
  derivation, validation, dedup, duplicate-job refusal, engine tracking,
  connection cleanup; `_quiesce_background_jobs` covers folder OCR; shared
  `_background_threads()` / `_request_background_stop()`; `shutdown()` stops and
  joins writers and refuses to close a connection still in use; `handle_request`
  rejects non-object payload/params; reset/restore reopen in `finally`.
- `backend/indexing_engine.py`: `_dialogue_pass_with_folder_scope`,
  `_dialogue_scopes`, folder-aware `_stage_dialogue`; crashed-stage terminal
  status is `failed` and `last_scanned_at` advances only on success; discovery
  reconciles only from a complete walk and resurrects reappeared files.
- `backend/search.py`: stable `, i.id` tie-breaker in `browse()` and
  `get_adjacent_image()`; single `params.extend(fparams)` in `get_adjacent_image`.
- `backend/thumbnail.py`: atomic temp-file render + `os.replace()`.
- `frontend/src/api.ts`, `frontend/src/features/library/LibraryScreen.tsx`:
  `getAdjacentImage`/`startFolderOcr` client methods; a browse request-generation
  guard against stale responses; viewer navigation across page boundaries.
- `tests/conftest.py`: function-scoped app-data isolation fixture.
- `docs/logic-contracts.md`: `start_folder_ocr` and `get_adjacent_image` marked
  implemented; folder-OCR request/response/event shapes reconciled with the
  implementation.

## Tests added (this workstream)

- `tests/test_folder_ocr_execution.py` (11) — real execution, scope containment,
  panel `crop_path`, manual-edit survival, quiesce, connection cleanup, shutdown
  keeps the catalog open when a writer will not stop.
- `tests/test_browse_ordering.py` (5) — pagination tie-breaker stability.
- `tests/test_cross_page_navigation.py` (8) — including multi-filter binding.
- `tests/test_job_lifecycle.py` (5) — crashed-stage terminal status; failed
  reset/restore leaves the worker usable.
- `tests/test_discovery_reconciliation.py` (3) — complete-scan control, partial
  scan does not delete, reappeared file is rediscovered and searchable.
- `tests/test_thumbnail_cache.py` (2) — cache reuse; interrupted write does not
  poison the cache.
- `tests/test_review_persistence.py` (11) — plus four end-to-end through-RPC
  durability tests.
- `tests/test_worker_protocol.py` (+2) — non-object request/params rejected
  without killing the worker.

## Test-isolation note (important for future runs)

`COMFYPANEL_DATA_DIR` is the sanctioned override for a throwaway catalog. The
suite sets it per test. Any new test that constructs a `BackendWorker` without
redirecting this (or `LOCALAPPDATA`) will otherwise touch the developer's real
catalog.

## Files modified

Backend: `backend/worker.py`, `backend/indexing_engine.py`, `backend/search.py`,
`backend/thumbnail.py`.
Frontend: `frontend/src/api.ts`,
`frontend/src/features/library/LibraryScreen.tsx`.
Tests: `tests/conftest.py`, `tests/test_browse_ordering.py`,
`tests/test_folder_ocr_execution.py`, `tests/test_folder_ocr_scope.py`,
`tests/test_cross_page_navigation.py`, `tests/test_job_lifecycle.py`,
`tests/test_discovery_reconciliation.py`, `tests/test_thumbnail_cache.py`,
`tests/test_review_persistence.py`, `tests/test_worker_protocol.py`.
Docs: `docs/logic-contracts.md`, `docs/logic-audit.md`,
`docs/logic-implementation-report.md`.

---

# Third pass — search consistency, dialogue indexing & progress

All three open limitations from the previous pass were reproduced (a failing
test first) and fixed, and three further indexing-consistency defects surfaced
while testing them. Standard applied per defect: reproduce → confirm the
reproduction fails against the current code → smallest reliable fix → verify
pass → run neighbouring suites → inspect the diff.

## 15. Keyword `total` disagreed with the keyword results — fixed

`count_keyword()` always counted `image_fts` per-image rows. `search_keyword`
with an explicit `sources` list unions other indexes (`batch_prompt_fts`,
`comic_text_fts`), so a search scoped to `batch` or `ocr` could return rows while
`total` reported 0 — and `ocr` returned nothing at all because no image-scope
`comic_text_fts` rows existed (see 16). `count_keyword` did not even accept
`sources`.

Reproduction: `tests/test_keyword_source_count.py` — with one batch candidate the
batch-only search returned 0 items while `only_batch["total"] == 6`; calling
`count_keyword(..., sources=["batch"])` raised `TypeError`.

Changes:
- `backend/search.py`: one shared `_KEYWORD_SOURCE_SPEC` table (per-source FTS
  table, columns, and predicate) plus `_and_like`, used by both the result query
  (`_search_keyword_multi`) and a new `_count_keyword_multi` that counts the same
  predicates via SQL `UNION` → `COUNT(*)` (no Python materialisation; `UNION`,
  not `UNION ALL`, gives the cross-source de-duplication the page already has).
- `LEFT JOIN image_metadata m` added to every source subquery and to
  `_batch_candidate_ids`, so a metadata filter no longer silently drops `ocr` /
  `batch` hits.
- Blank-query fallback uses `self.count(...)` rather than materialising
  `browse(limit=10**9)`.
- `backend/worker.py`: `rpc_search` passes `sources` through to `count_keyword`.
- Deep pagination: the per-source `fetch` bound was `max(limit*8, 400)`, which
  truncated any page past ~400; it is now `max(limit*8, offset+limit, 400)`
  (`offset+limit` suffices because each image's best rank is realised in a single
  source).

## 16. Dialogue text was never indexed for image-scope search — fixed

`panel_text_units` held the OCR / manual transcript, but nothing projected the
image-scope (`unit_kind='image'`) rows into `comic_text_fts`: only
`_stage_panel_fts` wrote panel rows, and `_record_dialogue_status` (the only
writer of `image_metadata.dialogue_text`) was dead code never called. So
`search_comic_text(unit_scope="image")` and the keyword `ocr` source always
returned nothing, and a hand correction was not searchable after it was saved —
the mission's "manual OCR edits becoming searchable after persistence" was met
by no route.

Reproduction: `tests/test_dialogue_text_index.py` — with a deterministic fake
recogniser, `search_comic_text("HELLO")` returned 0, the `ocr` keyword source
returned 0, and `dialogue_text` was NULL.

Changes (`backend/indexing_engine.py`): added module-level
`refresh_image_dialogue_index(conn, library_id, image_id)`, which rebuilds the
page's `comic_text_fts` image row from its image-scope units (delete-then-insert,
so repeated calls cannot duplicate) and refreshes the aggregated
`dialogue_text`; an empty aggregate deletes the row so stale text cannot survive.
Called from the non-folder and folder dialogue passes after writing units, and
from `worker._set_text_locked` (inside the write lock) so a manual correction
replaces the machine words in the index.

## 17. Forcing `metadata` marked a stale FTS index as ready — fixed

`_stage_metadata` rewrote the columns `image_fts` is built from but left
`images.fts_status='ready'`. A metadata-only force (no `fts` stage in the job)
therefore left search returning the previous metadata, and because the row still
said `ready` the next `fts` run would not touch it either.

Reproduction: `tests/test_metadata_fts_consistency.py::test_forced_metadata_marks_fts_dirty_then_fts_run_reindexes`
— after a forced metadata run that changed the stored prompt, `fts_status` was
still `ready` and the `fts`-only run was skipped, leaving search returning the
old words.

Change (`backend/indexing_engine.py`): the metadata row write now also sets
`fts_status='pending'` for the rows it processes — the same dirty signal
discovery uses when a file changes. The `fts` stage (which also rebuilds
`batch_prompt_fts`) then re-indexes in-job when selected, or on the next run
otherwise. This is deliberately **marking the dependent stage dirty**, not a
duplicate inline FTS write: the `fts` stage stays the single owner of the index,
and a full run is unchanged (the rows are already pending before `fts`).

## 18. A changed file kept the dialogue read from its old pixels — fixed

Discovery reset `dialogue_status='not_run'` for a changed file, but a page is
pending for the dialogue stage only when it also has *no* units. The old units
kept the page out of the queue, so OCR text read from pixels that no longer
existed stayed indexed.

Reproduction: `tests/test_dialogue_text_index.py::test_changed_source_file_invalidates_indexed_dialogue`
— rewriting the page and re-running discovery left the old units and the old
search hit.

Change (`backend/indexing_engine.py`): on a changed file, discovery now deletes
the page's `text_source != 'manual'` units (a reviewer's corrections are kept,
as everywhere else) and rebuilds its dialogue index entry, which clears it when
nothing remains.

## 19. A reappearing page lost its dialogue index — fixed

Finalization (`_cleanup_comic_text`) drops a missing page's exact-text entry; the
reappearance branch re-queued only `image_fts`, so the dialogue entry was lost
permanently even though the units survived.

Reproduction: `tests/test_dialogue_text_index.py::test_reappearing_page_restores_its_dialogue_index`.

Changes (`backend/indexing_engine.py`): reappearance rebuilds the page's dialogue
entry from its surviving units, and marking a file missing deletes that entry
immediately (not only at finalization), matching the `image_fts` handling.

## 20. The dialogue pending count disagreed with its processing predicate — fixed

`_stage_pending_count('dialogue')` counted "pages with no units" only, while the
processing query also requires the `not_run` completion marker. A page OCR
examined and found blank (marker `ready`, no units) was reported as pending
forever. Separately, `_stage_always_runs('dialogue')` returned True, so the count
was never consulted and the stage ran on every job even with nothing to do.

Reproduction: `tests/test_dialogue_pending_count.py::test_blank_page_does_not_stay_pending_dialogue`
— after the blank page was examined, the count was still 1.

Changes (`backend/indexing_engine.py`): the count now uses the same predicate as
the processing query (status marker + `EXISTS`), and `_stage_always_runs` returns
False for `dialogue` so the (now-correct) count is honoured — matching
`ARCHITECTURE.md`, which describes dialogue pending-counting. Skipping is safe
because the count set and the processable set are identical (a folder-scoped run
is a subset).

## Implemented but not independently verified (third pass)

- **Panel-scope dialogue exact-text search**: panel dialogue (scope `panel`) is
  not in `comic_text_fts`; it is reachable through panel text-embedding semantic
  search (`_panel_embedding_pass` includes dialogue). Adding it to the exact-text
  index as well was not attempted.
- **Symlink / junction containment**: reasoned from `.resolve()` + `os.walk`
  (`followlinks=False`); the real-symlink test is environment-skipped.

## Tests added (third pass)

- `tests/test_keyword_source_count.py` (8) — per-source counts, cross-source
  de-dup, source-scoped `total` stability across pages, invalid/empty sources,
  deep pagination not truncated.
- `tests/test_dialogue_text_index.py` (8) — OCR text searchable (image scope and
  `ocr` source), aggregate `dialogue_text`, manual correction replaces machine
  words, idempotent refresh, emptied text removes the row, reprocessing replaces
  text, changed file invalidates, reappearance restores.
- `tests/test_metadata_fts_consistency.py` (3) — fresh run indexes and does not
  skip `fts`; forced metadata marks dirty then an `fts` run re-indexes; metadata
  and `fts` in one job leaves search consistent.
- `tests/test_dialogue_pending_count.py` (4) — blank page not pending forever;
  page with a unit not pending; stage skipped when nothing pends; stage runs when
  work pends.

## Files modified (third pass)

Backend: `backend/indexing_engine.py`, `backend/search.py`, `backend/worker.py`.
Tests: `tests/test_keyword_source_count.py`, `tests/test_dialogue_text_index.py`,
`tests/test_metadata_fts_consistency.py`, `tests/test_dialogue_pending_count.py`.
Docs: `docs/logic-audit.md`, `docs/logic-contracts.md`,
`docs/logic-implementation-report.md`, `report.md`.

## Fourth pass — vectors, containment, panel lifecycle & contract defaults

## 21. A changed image kept its old vector searchable — fixed

Discovery reset a changed file's per-modality status to `'pending'` but left the
stored embedding `valid=1`. Vector search (`_vector_search`, `_panel_vector_search`)
filters on `valid`, not on the status column, so a run without an embedding stage
(metadata-only, discovery-only) kept returning the changed image ranked by pixels
it no longer had — indefinitely.

Reproduction: `tests/test_changed_file_vector_invalidation.py` — with two
identical images, changing one and re-running discovery left it returned by
`search_similar_image` (its old vector) with `valid=1`.

Change (`backend/indexing_engine.py`, `_stage_discovery` changed-file branch): the
image's `embeddings` rows are set `valid=0` in the same transaction that records
the change. Re-embedding `INSERT OR REPLACE`s the row back to `valid=1`, so a full
run is unchanged and an embedding-less run no longer serves stale vectors.

## 22. A vanished panel crop was never flagged missing — fixed

`_stage_panel_registration` counted panels whose crop file was gone but its
`UPDATE` only flagged panels with an empty `crop_path`. A crop file that actually
disappeared stayed `panel_missing=0`, so it stayed eligible for every panel stage
and — because panel vector search filters `panel_missing=0` and panel text search
checked nothing — its stale entries stayed returnable. The emitted
"N without a crop file" disagreed with what was recorded.

Reproduction: `tests/test_panel_file_lifecycle.py::test_registration_flags_a_vanished_crop`
— `panel_missing` stayed 0 after deleting the crop file.

Change (`backend/indexing_engine.py`): registration collects the panels it found
missing and flags exactly those, and clears the flag (setting the four derived
status columns `pending`) when a crop returns, so the flag is not a one-way latch.

## 23. A configuration change never re-queued panel embeddings — fixed

`_reconcile_embedding_config` invalidated every vector from a superseded config
(the invalidation is not scoped by `unit_kind`, so panel rows were included) but
only re-queued `images`. An invalidated panel stayed `panel_embedding_status`
`'ready'`, and the panel embedding stages select only `'pending'` rows, so every
already-embedded panel was silently lost from panel search after a model or
preprocessing change — and stayed lost across later panel-enabled runs.

Reproduction: `tests/test_embedding_config_reconcile.py::test_config_change_requeues_panels_and_images`
— after reconcile, the panel vector was `valid=0` but the panel status was still
`ready`; the end-to-end test shows the panel returning to search only once the
status is reset and the stage re-runs.

Change (`backend/worker.py`): added `PANEL_EMBEDDING_STATUS_COLUMNS` (text →
`panel_embedding_status`, image → `panel_image_embedding_status`) and reconcile
walks them too. The image re-queue subquery was additionally scoped to
`unit_kind='image'` for symmetry.

## 24. Panel retrieval ignored the pipeline's definition of an indexable panel — fixed

`_indexable_panels_where` requires the crop present *and* the parent page present,
but `search_comic_text(unit_scope='panel')` checked neither and panel vector search
checked only the crop. A result could reference a panel with no crop file or a
parent page that no longer exists.

Reproduction: inserting a panel with `panel_missing=1` and a panel whose parent
`missing=1` returned both from `search_comic_text(..., unit_scope='panel')`.

Changes (`backend/search.py`, `backend/indexing_engine.py`): the panel
`comic_text` ranking query adds an `EXISTS` filter (in the query, not post-rank, so
a vanished panel cannot consume a `LIMIT`/`OFFSET` slot), panel vector search adds
`i.missing=0`, and `_cleanup_comic_text` drops panel rows whose crop *or* parent
page is gone.

## 25. Discovery indexed files outside the selected scope via symlinks/junctions — fixed

`os.walk(followlinks=False)` prunes directory symlinks, but a file symlink is
still listed and a Windows junction is not a symlink to `os.path.islink`, so a
junction is descended. `Path.resolve()` then maps the entry outside the library,
and discovery indexed (and later read, thumbnailed and embedded) content the user
never selected.

Reproduction: `tests/test_filesystem_containment.py::test_junction_escaping_the_library_is_not_indexed`
— a file under a junction was indexed with a `canonical_path` outside the library.

Change (`backend/indexing_engine.py`, `_stage_discovery`): a `_within_root` check
compares every candidate file and every directory (before descending) to the
resolved scan root; escaping entries are skipped and logged, in-library targets are
allowed and de-duplicated by real path, and a resolved-directory visited set stops
a junction cycle. Verified with a real junction; the file-symlink variant is the OS
skip.

## 26. `browse` default page size drifted from the contract — fixed

`rpc_browse` defaulted to 120 while the contract and the frontend both use 200
(`api.ts`: `limit: params.limit ?? 200`). A caller omitting `limit` received a
different page than documented.

Change (`backend/worker.py`): default is now 200.
Reproduction: `tests/test_rpc_contract_drift.py::test_browse_default_page_size_matches_contract`.

## 27. Panel-scope dialogue is now exact-text searchable — fixed

The pass-3 "implemented but not verified" item is resolved. A panel's
`comic_text_fts` body was the page filename + parent prompt only; dialogue read
from the panel's own regions was reachable only through the panel text embedding.

Change (`backend/indexing_engine.py`): shared `_panel_fts_body` and
`refresh_panel_dialogue_index` (the panel counterpart of the image refresh) rebuild
the panel row whole from page words + parent prompt + dialogue, called from both
dialogue passes and from `worker._set_text_locked` for panel-scope units.

Reproduction/tests: `tests/test_panel_dialogue_text_index.py` (4) — panel dialogue
searchable at panel scope, page words survive the refresh, a manual panel
correction is searchable and replaces the machine words, emptied text removes the
row.

## Tests added (fourth pass)

- `tests/test_changed_file_vector_invalidation.py` (4)
- `tests/test_panel_file_lifecycle.py` (6)
- `tests/test_embedding_config_reconcile.py` (3)
- `tests/test_filesystem_containment.py` (4; 1 OS-skipped)
- `tests/test_panel_dialogue_text_index.py` (4)
- `tests/test_rpc_contract_drift.py` (2)

Each was confirmed to fail against the unmodified implementation (fixes disabled
individually) before the fix was restored.

## Files modified (fourth pass)

Backend: `backend/indexing_engine.py`, `backend/search.py`, `backend/worker.py`.
Tests: the six files above.
Docs: `docs/logic-audit.md`, `docs/logic-contracts.md`,
`docs/logic-implementation-report.md`, `report.md`.
Protected `panel_folder_cropper_v11.py` unchanged (hash re-verified).

