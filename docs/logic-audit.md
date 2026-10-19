# ComfyPanel Studio — Logic Audit

## Phase 0 — Current Implementation Audit (Thu Oct 15 2026)

### 1. Gallery / Browse Pipeline

**Frontend**: `LibraryScreen.tsx` uses `api.browse()` with `libraryId`, `limit=200`, `offset`, `sort`, and `filters`. Results stored in `items` state, total in `total`.

**Backend**: `rpc_browse` in `worker.py` → `SearchEngine.browse()` in `search.py`.

Key query in `browse()`:
```sql
SELECT i.id, i.canonical_path, i.filename, i.thumbnail_path, i.width, i.height,
       i.modality, i.metadata_status, i.embedding_status, i.image_embedding_status,
       m.positive_prompt, m.negative_prompt, m.checkpoint, m.sampler, m.seed,
       m.completeness_state
FROM images i
LEFT JOIN image_metadata m ON i.id = m.image_id
WHERE i.missing = 0
  AND i.library_id = ?
  [filter clauses]
ORDER BY i.mtime DESC  -- or other sort
LIMIT ? OFFSET ?;
```

**Count query** in `count()`:
```sql
SELECT COUNT(*) FROM images i
LEFT JOIN image_metadata m ON i.id = m.image_id
WHERE i.missing = 0
  AND i.library_id = ?
  [filter clauses];
```

**Issues identified**:
1. Pagination reset: `LibraryScreen.tsx` has `useEffect` with `[libraryId, filters]` that resets `offset` to 0 — this is correct now.
2. No stale request cancellation: rapid folder changes could return stale results.
3. The `browse` query uses `LIMIT/OFFSET` which is correct for pagination.
4. Frontend `filtered` derives from `items` with client-side filename filter — this is a second filter layer on top of backend filters.

### 2. Library Identity & Indexing Scope

**Library registration**: `rpc_register_library` creates a library with `root_path`.

**Indexing**: `rpc_start_indexing` takes `library_root` (the scan scope) and `library_id`.

**Current flow**:
- User picks a folder in `IndexingScreen.tsx` (`scanScopeFolder`)
- `start()` calls `api.startIndexing({ libraryRoot: scanScopeFolder || activeLibrary?.root_path, ... })`
- Backend validates `library_root` exists and is a directory
- Backend checks if path is within allowed roots, but allows explicit user selection

**Issues identified**:
1. Library identity (stable ID) vs scan scope (selected subfolder) are conflated — the `library_root` passed to indexing can be any subdirectory of the registered library root.
2. No validation that the selected scan scope is within the registered library's root path.
3. If a user selects a folder outside the registered library root, it will still be indexed under that library ID.
4. Scanning a subfolder does not appear to delete catalog records outside the scope — but this needs verification.

### 3. OCR / Dialogue Processing

**Pipeline**: The `dialogue` stage in `indexing_engine.py` runs `detect_and_group()` from `dialogue.py`.

**RPCs**:
- `dialogue_list` — paginated list of dialogue units
- `dialogue_set_text` — stores manual correction, preserves `machine_text`
- `dialogue_set_ink` — ink colour decisions
- `dialogue_set_reviewed` — review flag
- `dialogue_set_group` — accept/split/merge groups

**Current state**:
- OCR runs as part of the `dialogue` indexing stage
- No independent folder-scoped OCR operation exists — the UI only has library-level OCR via the indexing stages
- The `dialogue` stage operates on pages within the library scope

**Issues identified**:
1. No RPC to trigger OCR on a specific folder scope independent of full indexing
2. The `dialogue` stage is part of indexing and not independently invocable with a folder scope
3. Need to add folder-scoped OCR scheduling that:
   - Validates folder is within library root
   - Only processes eligible images in that folder
   - Preserves manual corrections
   - Prevents duplicate processing

### 4. SSD Activity / Performance

**Startup**:
- `BackendWorker.__init__` opens DB, runs `init_database`, calls `engine.recover_interrupted_jobs()`
- No automatic indexing on library registration

**Folder switching**:
- `LibraryScreen` calls `api.browse()` with new `libraryId`
- No thumbnail regeneration (cache key: path, size, mtime)
- No indexing triggered

**Issues identified**:
1. No instrumentation to measure actual operations
2. Need to add lightweight diagnostics to verify no unnecessary work

### 5. Cross-Page Navigation

**Current**: `ImageViewerDialog` navigates via `onPrevious`/`onNext` using `filtered` array (client-side filtered results).

**Issue**: `filtered` only contains currently loaded page (limit 200). Cannot navigate to images on other pages without fetching them.

### 6. Review Persistence

**RPCs**: `dialogue_set_text`, `dialogue_set_group`, `dialogue_set_ink`, `dialogue_set_reviewed`

**Database**: `panel_text_units` table with columns:
- `text` — effective text (manual or machine)
- `machine_text` — original OCR transcript (preserved on first manual edit)
- `text_source` — 'ocr' | 'manual'
- `ink_source` — 'machine' | 'approved' | 'manual'
- `ink_user_rgb`/`ink_user_category` — manual colour
- `reviewed` — boolean flag
- `reattachment` — 'unmatched' | 'ambiguous' | NULL

**Issue**: Need to verify end-to-end persistence and manual-edit survival during re-indexing.

---

## Phase 1 — Gallery Missing Images

### Root Cause Hypothesis

The report states: "opening a folder displayed only approximately 5–7 images and appeared to show an arbitrary selection."

The previous fix added `libraryId` to pagination reset effect, but the underlying gallery query may have issues:
1. SQL limit/offset applied correctly?
2. Result caps or default page sizes?
3. Filter construction consistency between count and result queries?
4. Library identity vs filesystem path confusion?
5. Stable ordering with tie-breakers?
6. Stale requests from rapid folder changes?

### Test Plan

Create regression fixture with:
- Multiple pages of images across at least 2 libraries
- Nested directories
- Duplicate filenames
- Varied filter matches

Verify:
- All eligible images discoverable
- No arbitrary sampling/truncation
- Total counts match paginated results
- Count/result queries use consistent filters
- Ordering is deterministic
- Switching libraries/folders resets pagination
- Rapid changes don't replace results with stale responses
- Missing files handled without discarding unrelated results

---

## Phase 2 — Indexing Scope & Library Identity

### Root Cause Hypothesis

The folder-scope picker passes selected path to indexing, backend validates it exists and is a directory. But:
- No validation that selected folder belongs to intended library
- No enforcement that indexing preserves library identity
- No protection of data outside selected scope

### Required Changes

1. Separate concepts:
   - Stable registered library identity (`library_id`)
   - Configured library root (`libraries.root_path`)
   - User-selected scan scope (subfolder of library root)
   - Indexing options/stages

2. Backend enforcement:
   - Validate target is existing directory
   - Canonical target remains inside canonical library root
   - Windows path casing/separator differences handled
   - Parent traversal/escape attempts rejected
   - Symlink/junction behavior handled safely
   - Unrelated directory cannot be supplied as scan scope
   - Subfolder selection doesn't register new library

3. Verify nested paths, multiple libraries, nonexistent paths, overlapping scopes, path escape, interruption, cancellation, recovery.

---

## Phase 3 — Folder-Scoped OCR

### Current Gap

No independent folder-level OCR exists. The `dialogue` stage runs as part of indexing.

### Required Implementation

1. New RPC: `rpc_start_folder_ocr` (or similar)
2. Accepts: `library_id`, `folder_paths[]`, options
3. Validates each folder is within library root
4. Schedules OCR only for eligible images in those folders
5. Reuses existing worker/scheduler/job model
6. Prevents duplicate processing for same image/scope/config
7. Preserves manual corrections and review status
8. Resumes interrupted work
9. Defines cancellation behavior
10. Reports accurate job status

### Tests Needed
- Single folder
- Nested folders
- Multiple folders
- Overlapping selections
- Repeated requests
- Cancellation/retry
- Interrupted recovery
- Config changes
- Manual correction preservation
- Protection of records outside scope

---

## Phase 4 — SSD Activity Measurement

### Required Diagnostics

Add counters/timing for:
- Startup and DB init
- Interrupted job recovery
- Worker startup/restarts
- File enumeration/stat calls
- Gallery/folder queries
- Thumbnail cache hits/misses/regenerations
- OCR/embedding scheduling
- DB transaction/write counts
- WAL checkpoints/expensive queries
- Indexing/reconciliation triggers

### Test Scenarios
1. Opening already indexed library
2. Switching between existing folders
3. Opening image and navigating
4. Starting explicit scan
5. Restarting after interrupted job

---

## Phase 5 — Cross-Page Navigation

### Required Implementation

RPC/Service contract for neighboring records:
- Input: current `image_id`, `library_id`, `filters`, `sort`
- Output: previous/next record in filtered sequence
- Preserves: stable ordering, library/filter constraints, unique identity
- Handles: first/last result, deleted/unavailable files, consistency with gallery data, stale responses

### Tests
- Within page
- Across page boundary
- With active filters
- At beginning/end
- After rapid folder changes
- When neighboring image disappears

---

## Phase 6 — Review Persistence

### Pipeline Trace

1. Frontend: `DialogueReview` component
2. RPC: `dialogue_set_text` / `dialogue_set_group` / `dialogue_set_ink` / `dialogue_set_reviewed`
3. Backend: `_set_text_locked`, `_with_effective_ink`, UPDATE statements
4. Database: `panel_text_units` updates
5. Reload: `dialogue_list` fetches updated records

### Tests Needed
- Each supported update end-to-end
- Combinations of edits
- Failure surfacing
- Manual edits not overwritten by automated processing
- Reload persistence

---

## Documents to Maintain

1. `docs/logic-audit.md` — This file, updated with findings
2. `docs/logic-contracts.md` — Backend interfaces for Claude
3. `docs/logic-implementation-report.md` — Fixes, tests, results

---

## Outcome (Fri Oct 16 2026)

Status per phase. See `docs/logic-implementation-report.md` for detail and
verification labels.

- **Phase 1 — Gallery missing images**: the arbitrary-selection symptom traced to
  **unstable tie ordering** in `browse()` (many images share mtime/size/filename).
  Fixed by appending the stable `i.id` tie-breaker; regression-tested
  (`test_browse_ordering.py`). Stale-response cancellation added on the frontend
  via a browse request-generation guard. **Fixed + tested.**
- **Phase 2 — Indexing scope & library identity**: `rpc_start_indexing` already
  enforces resolved containment within the registered library root (rejecting
  `..` traversal and unrelated directories), and `_stage_discovery` only
  reconciles the subfolder scope when scanning a subfolder. **Contained;
  symlink-file case reasoned, not executed here (environment skip).**
- **Phase 3 — Folder-scoped OCR**: implemented and now *executes* (the folder
  predicate reaches the dialogue pass; panel scope uses `crop_path`). Dedupes
  overlap, refuses duplicate concurrent jobs, preserves manual corrections,
  releases its connection, and is quiesced by reset/restore. **Fixed + tested.**
- **Phase 4 — SSD activity measurement**: high-level scheduling invariants are
  tested; physical disk I/O is not measured. **Partially verified.**
- **Phase 5 — Cross-page navigation**: `get_adjacent_image` backed by stable
  ordering; the viewer crosses page boundaries through it. **Fixed + tested.**
- **Phase 6 — Review persistence**: schema + RPCs exist and are exercised, and
  are now verified end-to-end through the RPC boundary with reload-from-a-new-
  connection checks (`test_review_persistence.py`). **Fixed + tested.**

---

## Second pass — lifecycle, integrity & protocol (Fri Oct 16 2026, continued)

A deeper audit of background-job lifecycle, SQLite reconciliation, the JSONL
boundary and cache integrity found and fixed seven further defects. Each was
reproduced by a test that was confirmed to fail first.

- **Background-job lifecycle / shutdown**: `shutdown()` closed `self.conn` with
  folder-OCR engines still running and without joining any writer. Now it stops
  every background engine, joins writers, and refuses to close a connection that
  is still in use. **Fixed + tested.**
- **Job terminal state**: a crashed stage left the *job* reported as
  `completed`. Now `failed`, and `last_scanned_at` advances only on success.
  **Fixed + tested.**
- **Discovery reconciliation**: a partial `os.walk` was read as deletion, and a
  reappeared file could never clear its `missing` flag (unique
  `canonical_path`). Both fixed; a complete walk is now required to reconcile,
  and a reappeared unchanged file is resurrected and re-indexed. **Fixed +
  tested.**
- **Protocol boundary**: a non-object JSON line terminated the worker. Now
  rejected with an error response. **Fixed + tested.**
- **Maintenance error handling**: a failed reset/restore left the worker with a
  closed connection. Now reopened in `finally`. **Fixed + tested.**
- **Adjacent navigation**: `get_adjacent_image` duplicated its filter bindings
  with ≥2 active filters, raising `ProgrammingError`. **Fixed + tested.**
- **Thumbnail cache**: an interrupted write was served as a valid cache hit;
  renders are now atomic. **Fixed + tested.**

Observed but not fixed (see implementation report): keyword `total` ignores
`sources`; dialogue text is never written to `comic_text_fts` image scope
(documented limitation).

---

## Third pass — search consistency, dialogue indexing & progress (Fri Oct 16 2026, continued)

The three previously-documented limitations were reproduced and fixed, and
three further indexing-consistency defects were found while testing them. Each
was reproduced by a test confirmed to fail first, then fixed and guarded by that
test.

- **Limitation A — keyword `total` ignored `sources`** (was observed, now fixed):
  `count_keyword` counted `image_fts` only, while `search_keyword(sources=...)`
  could also match `batch` and `ocr`. A source-scoped search could return rows
  while reporting `total` 0 (and `ocr` returned nothing at all). Result and count
  now build from one shared `_KEYWORD_SOURCE_SPEC` + `_and_like` table, and the
  count is a SQL `UNION` → `COUNT(*)` over the same predicates, so the two cannot
  drift. `LEFT JOIN image_metadata` was added to every source subquery (metadata
  filters no longer drop `ocr`/`batch` hits). A fixed deep-pagination `fetch`
  bound (`max(limit*8, 400)`) that truncated any page past ~400 was corrected to
  `max(limit*8, offset+limit, 400)`. **Fixed + tested**
  (`tests/test_keyword_source_count.py`, 8 tests).
- **Limitation B — dialogue text never reached `comic_text_fts` (image scope)**
  (was observed, now fixed): `panel_text_units` held the OCR/manual transcript,
  but no code path projected the image-scope rows into the exact-text index, so
  `comic_text` image search and the `ocr` keyword source were always empty and a
  hand correction was not findable after it was saved. `refresh_image_dialogue_index()`
  now rebuilds a page's `unit_kind='image'` row (delete-then-insert, so it cannot
  duplicate) and the aggregated `image_metadata.dialogue_text`, and is called
  from the dialogue stage and from `dialogue_set_text`. **Fixed + tested**
  (`tests/test_dialogue_text_index.py`).
- **Limitation C — forcing `metadata` left `image_fts` stale** (was observed, now
  fixed): the metadata stage rewrote the columns `image_fts` is built from
  (`positive_prompt`, `negative_prompt`, `checkpoint`, `loras`, `sampler`,
  `scheduler`) but left `images.fts_status='ready'` — a status lie that a
  metadata-only job (no `fts` stage in the same job) never corrected. It now
  marks the processed rows `fts_status='pending'`, the same dirty signal discovery
  uses when a file changes, so the `fts` stage re-indexes them (in-job when
  selected, otherwise the next run) and the row never claims a fresh index over
  stale data. **Fixed + tested** (`tests/test_metadata_fts_consistency.py`).
- **A changed file kept its stale dialogue** (found while testing B): discovery
  reset `dialogue_status='not_run'` for a changed file, but a page is pending for
  the dialogue stage only when it also has *no* units, so the old units kept it
  out of the queue and OCR text read from deleted pixels stayed indexed.
  Discovery now drops the page's non-manual units (manual corrections kept, as
  everywhere else) and rebuilds the page's dialogue index entry. **Fixed + tested.**
- **A reappearing page lost its dialogue index** (found while testing B):
  finalization drops a missing page's exact-text entry (an orphaned hit hydrates
  nothing); reappearance re-queued only `image_fts`, so the dialogue entry was
  lost permanently even though the units survived. Reappearance now rebuilds it
  from those units, and marking a file missing drops the dialogue entry
  immediately (not only at finalization). **Fixed + tested.**
- **The dialogue pending count disagreed with its own processing predicate**:
  the count omitted the `not_run` completion marker, so a page OCR examined and
  found blank was reported as pending forever, and the dialogue stage always ran
  (`_stage_always_runs` returned True), making the count dead. The count now
  matches the processing query exactly and the dialogue stage honours it (skipped
  when nothing pends, run when work does). **Fixed + tested**
  (`tests/test_dialogue_pending_count.py`, 4 tests).

Contained / reasoning-only:

- **Panel-scope dialogue text is not in the exact-text `comic_text_fts`**: image
  scope was searchable by nothing and is now indexed. Panel dialogue is reachable
  through the panel *text-embedding* semantic path (`_panel_embedding_pass`
  includes dialogue in its document), so it is not left unsearchable; adding it
  to the exact-text index as well was not attempted (a larger change to
  `_stage_panel_fts` with an ordering dependency on the dialogue stage).
- **Symlink / junction containment**: `.resolve()` containment plus
  `os.walk(followlinks=False)` are reasoned from the code; a real-symlink test is
  environment-skipped here.

### Skip classification (17 skips, full suite)

| Module | Count | Reason | Class |
| --- | --- | --- | --- |
| `tests/test_real_model.py` | 11 | `real model/runtime unavailable (model_pair=False, server=True)` | environment / optional model |
| `tests/unit/test_prompt_resolution.py` | 3 | `supplied workflow JSON not present` | optional external data |
| `tests/multimodal/test_multimodal_capabilities.py` | 1 | `No GGUF model files found in runtime/` | environment / optional model |
| `tests/test_panel_stages.py` | 1 | `no real crop files on this machine` | optional external data |
| `tests/test_indexing_scope.py` | 1 | `Symlinks not supported in this environment` | OS limitation |

None is a disabled regression: the portable logic those tests would exercise is
covered by non-skipped tests (prompt resolution topology by the synthetic
fixtures; containment by unrelated-directory/`..` rejection; panel stages by
`test_panel_registration` etc.). The skipped cases add provenance against real
model files, the real supplied workflow JSON, real crop files and a real symlink,
none of which can be created in this sandbox.

---

## Fourth pass — vectors, containment, panel lifecycle & contract defaults (Fri Oct 16 2026)

Priority A (vector/embedding consistency) was audited against twelve failure
conditions after discovering the architecture first: embeddings live in one
`embeddings` table keyed by `(unit_kind, media_id, modality, config_hash)` with a
`valid` flag; `unit_kind='image'` (keyed to `images.id`) and `unit_kind='panel'`
(keyed to `panel_crops.id`) are separate id spaces. Each defect below was
reproduced (a throwaway script and/or a test confirmed to fail on the unmodified
code), then fixed and guarded.

- **A changed image kept its old vector searchable** (Priority A #1): discovery
  reset the per-modality status to `'pending'` for a changed file but left the
  stored vector `valid=1`. Vector search reads `valid`, not the status, so a
  metadata-only or discovery-only run - which contains no embedding stage - kept
  returning the changed image ranked by pixels (or metadata) that no longer
  existed, indefinitely. Discovery now marks the image's `embeddings` rows
  `valid=0` in the same transaction that records the change; re-embedding
  `INSERT OR REPLACE`s the row back to `valid=1`. **Fixed + tested**
  (`tests/test_changed_file_vector_invalidation.py`, 4 tests).
- **A vanished panel crop was never flagged missing** (Priority A #3/#12): the
  panel-registration stage *counted* panels whose crop file was gone but only
  flagged panels with an empty `crop_path`. A crop file that actually disappeared
  stayed `panel_missing=0`, so it remained eligible for every panel stage, its
  stale vector stayed returnable (panel vector search filters `panel_missing=0`),
  and its text stayed in `comic_text_fts`. The reported "N without a crop file"
  disagreed with what was recorded. Registration now flags the panels it actually
  found missing, and clears the flag (re-queueing the derived stages) when a crop
  returns, so the state is not a one-way latch. **Fixed + tested**
  (`tests/test_panel_file_lifecycle.py`).
- **A configuration change never re-queued panel embeddings** (Priority A #5):
  `_reconcile_embedding_config` invalidated *every* vector from a superseded
  config (panel rows included, since the invalidation is not scoped by
  `unit_kind`) but only re-queued `images`. An invalidated panel stayed
  `panel_embedding_status='ready'`, and the panel embedding stages select only
  `'pending'` rows - so after a model/preprocessing change every already-embedded
  panel was silently lost from panel text/image search, even on a later
  panel-enabled indexing pass. Reconcile now also walks the panel status columns.
  **Fixed + tested** (`tests/test_embedding_config_reconcile.py`, 3 tests).
- **Panel retrieval disagreed with the pipeline's own definition of an indexable
  panel** (Priority A #12): `_indexable_panels_where` requires the crop present
  *and* the parent page present, but `search_comic_text(unit_scope='panel')`
  checked neither and panel vector search checked only the crop. A result could
  therefore reference a panel that cannot be shown or a parent page that no
  longer exists. Panel text search now filters in the ranking query (not after
  ranking, so a vanished panel cannot consume a `LIMIT` slot), panel vector
  search requires `i.missing=0`, and finalization's `_cleanup_comic_text` drops
  text rows for panels whose crop *or* parent page is gone. **Fixed + tested.**

Priority B (filesystem containment): `os.walk(followlinks=False)` prunes
directory *symlinks*, but a file symlink is still listed, and a Windows junction
is not a symlink to `os.path.islink`, so a junction **is** descended. In both
cases `Path.resolve()` maps the entry outside the selected library, and discovery
indexed that target. The walk now checks every candidate (and every directory
before descending) against the resolved scan root: an escaping junction,
directory symlink or file symlink is skipped, while one that points back *inside*
the library is allowed and de-duplicated by real path; a resolved-directory
visited set stops a junction cycle from recursing forever. **Fixed + tested with
a real junction** (`tests/test_filesystem_containment.py`: escape blocked, inside
junction allowed, cycle terminates). The *file-symlink* case is covered by the
same check but is environment-skipped here (no `SeCreateSymbolicLinkPrivilege`);
it is not claimed as independently reproduced.

Priority C (panel-scope exact-text): the pass-3 limitation is now resolved.
Panel dialogue is written to `panel_text_units` (keyed by `panel_crop_id`) and was
reachable only through the panel text embedding. A shared `_panel_fts_body`
builds a panel's `comic_text_fts` body from page words + parent prompt +
dialogue, and `refresh_panel_dialogue_index` (the panel counterpart of
`refresh_image_dialogue_index`) rebuilds it whole, so adding dialogue cannot drop
the page words. It is called from both dialogue passes and from
`dialogue_set_text` for panel-scope units. **Fixed + tested**
(`tests/test_panel_dialogue_text_index.py`, 4 tests).

Priority D (RPC contract drift): `browse` is documented and called by the
frontend with a default page size of 200, but `rpc_browse` defaulted to 120 - a
caller that omitted `limit` (the exact case the default exists for) received a
different page than the contract promised. Aligned to 200. **Fixed + tested**
(`tests/test_rpc_contract_drift.py`). `dialogue_list` (default 100, max 500),
the keyword `sources` vocabulary and `start_folder_ocr`'s response shape were
checked and already matched the contract.

Priorities E/F: the config-change re-queue and change-invalidation fixes were
exercised across the image *and* panel subsystems together (reconcile → re-embed
→ search returns the panel again), and `_clear_model_state`/`_start_model_from_config`
were re-read to confirm a failed start never leaves a dead provider wired into
search. No new defect was found there beyond the re-queue gap above.

### Skip classification (18 skips, full suite)

Adds one OS-limited row to the pass-3 table:

| Module | Count | Reason | Class |
| --- | --- | --- | --- |
| `tests/test_filesystem_containment.py` | 1 | `file symlinks are not permitted in this environment` | OS limitation |

The junction cases in that module run for real (junctions need no elevation).

