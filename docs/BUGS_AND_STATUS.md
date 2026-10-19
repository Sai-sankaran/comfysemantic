# Bugs & Status

Living defect log and verification status. Updated per phase; never rewritten
from memory — each entry records what changed, which tests were actually run and
their result.

## Phase 0 — Baseline audit

Environment: Windows 10/11, PowerShell; Python 3.13.14 (`.venv`); pytest 9.1.1.
Run from repo root: `.venv\Scripts\python.exe -m pytest -q`.

Baseline BEFORE fixes:

- Collected 102 tests.
- 5 FAILED + 1 hanging test (timeout at `test_indexing_events_are_streamed`).
- The hang blocked the runner before the remaining tests executed.

### Baseline defects found

1. **`rpc_indexing_status` crashes — `IndexingEngine` had no `is_paused`.**
   - Symptom: `indexing_status` RPC returned
     `AttributeError: 'IndexingEngine' object has no attribute 'is_paused'`,
     breaking the whole register → index → status pipeline test
     (`test_register_browse_and_index_pipeline`).
   - Root cause: `backend/worker.py` read `self.engine.is_paused` but the engine
     only stored a private `threading.Event`.
   - Fix: added `IndexingEngine.is_paused` property (`backend/indexing_engine.py`).

2. **`reset_database` / `restore_database` fail on Windows — file lock.**
   - Symptom: `PermissionError: [WinError 32] ... catalog.db is being used by
     another process` in `test_database_backup_and_reset_endpoints`.
   - Root cause: the engine keeps one long-lived connection open. The worker
     closed only its own `self.conn` before deleting/replacing `catalog.db`, so
     the engine's handle still locked the file (WAL mode) on Windows.
   - Fix: added `IndexingEngine.close()` (also fixes a connection leak in the
     `run_indexing` finally block — the old code dropped the reference to the
     connection without closing it) and call it from
     `rpc_reset_database` / `rpc_restore_database` before the file operation.

3. **Cropper safety check runs in the background — caller gets misleading
   "started".**
   - Symptom: `test_cropper_rejects_output_inside_input` expected the RPC to
     raise immediately; instead the RPC returned and the failure arrived later
     as an async `cropper_error` event.
   - Root cause: `rpc_run_cropper` spawned the worker thread first; all
     validation happened inside `run_panel_cropper`. The upstream contract
     requires an immediate, honest error.
   - Fix: `rpc_run_cropper` now verifies v11 integrity and calls
     `validate_folders` synchronously before spawning the thread
     (`backend/worker.py`).

4. **Search isolation tests failed because the synthetic fixture did not mean
   what the tests assumed.**
   - `test_visual_search_ranks_by_pixels_not_prompts`: every generated image was
     pixel-identical (fixed constant background), so the mock provider produced
     identical image vectors and the test could never observe pixel-based
     ranking.
   - `test_hybrid_uses_rrf_not_blind_addition`: the fixture prompt contained no
     `"moon"`, so the keyword side of `"luminous moon"` matched nothing and
     hybrid fell back to semantic-only results (`hits[0]["match_mode"] ==
     "semantic_metadata"`) instead of RRF.
   - Root cause: `make_synthetic_library` in `tests/fixtures.py` passed a fixed
     seed (identical pixels) and a prompt without the term the tests query for.
   - Fix: fixtures now vary per-image seed (distinct pixels) and include
     `"moon"` in the synthetic prompt. These are synthetic test-only assets;
     no real user images are touched.

5. **`test_indexing_events_are_streamed` hung the suite.**
   - Source: the test `WorkerClient.drain_events` called blocking
     `proc.stdout.readline()` in a loop whose deadline could never be reached
     while the worker was idle — once the worker stopped emitting, the client
     blocked forever waiting for a line that never came.
   - Fix: `WorkerClient` now drains stdout on a reader thread into a queue and
     every wait is a real, bounded `queue.get(timeout=...)`
     (`tests/test_worker_protocol.py`).

### Baseline AFTER fixes

```
101 passed, 1 skipped in 103.08s (0:01:43)
```

The single skip is `tests/multimodal/test_multimodal_capabilities.py::TestRealRuntimeCapabilityChecks::test_real_model_check_reports_model_identity`
— it is skipped by design when the real model runtime tests are not asked to
validate a specific model identity.

### Files changed (Phase 0)

- `backend/indexing_engine.py` — `is_paused` property; `close()`; no connection leak on job end.
- `backend/worker.py` — synchronous cropper validation; engine connection closed before reset/restore.
- `tests/fixtures.py` — distinct synthetic images; prompt includes `"moon"`.
- `tests/test_worker_protocol.py` — non-blocking stdout reader in test client.
- `docs/BUGS_AND_STATUS.md` — this file.

## Phase 1 — Frontend functional bugs (fixed, pre-redesign)

Small, contract-preserving fixes in the working UI. No visual redesign here.

6. **"similar" search mode could never run — Search button permanently disabled.**
   - Symptom: in Search → *similar* mode the only input is the image-id field,
     but the Search button was disabled on `!query.trim()`, and `query` is never
     used in that mode, so it was always disabled.
   - Fix: `SearchView` now computes `canRun` per mode — image-id required for
     *similar*, non-empty `query` for text modes (`frontend/src/App.tsx`).

7. **Library removal existed in the backend/API but was unreachable from the UI.**
   - `api.removeLibrary` was implemented but never invoked; the Settings page
     even advertised "removing a library unregisters it".
   - Fix: added a hardened `removeLibrary` handler (confirmation in-app, source
     folder never deleted) and a "Remove library" button in the Library toolbar.
   - Also fixed `refreshLibraries`: it now re-validates the current selection
     after any add/remove and falls back to the first remaining library, instead
     of leaving a stale id selected.
   - Settings hint now points to the actual control.

### Verification for Phase 1

- Backend: full suite unchanged green after Phase 0 (`101 passed, 1 skipped`).
- Frontend: `npm run build` (`tsc -b && vite build`) succeeds.
- Rust: `cargo check` (dev profile) succeeds — no Rust changes made.

### Files changed (Phase 1)

- `frontend/src/App.tsx` — similar-mode Search enablement; Remove-library control; selection re-validation.

## Phase 2 — Design system + app shell

Frontend restructure only; backend and detector untouched.

### What changed

- **Single token source.** Added `frontend/src/styles/tokens.css` with the
  canonical token set (bg/surface/raised/inset, borders, text scale, status
  colors, interaction states, layout/space/radius/shadow/type/motion) plus
  legacy aliases (`--bg-primary`, `--fg`, `--line`, `--radius`, `--mono`, …) so
  existing component CSS keeps resolving. Both old `:root` token blocks were
  deleted (`index.css`, `App.css`); token definitions live in exactly one file.
  Import order in `main.tsx` is now `tokens.css → index.css → App.css`.
- **App shell** (`src/app/AppShell.tsx`): left sidebar (collapsible to icon
  rail, persisted for the session) with icon+label nav, top command bar with
  active-library scope, global search (`/` or `Ctrl+K` focus shortcut; Enter
  jumps to the Search tab and runs a keyword search), model/runtime status chip,
  and a status strip that links to Indexing Center while a job is running.
- **Shared context** (`src/app/providers.tsx`): `LibraryProvider`/`useLibrary`
  now owns `libraries`, active `libraryId`, `activeLibrary`, `settings`,
  `ready`, `fatal`, `busy`, init on mount, and `reportFatal` (used for
  `worker_exit`). Screens read context instead of prop-drilling.
- **UI kit** (`src/components/ui/*`): Button, IconButton, Input, Select,
  Checkbox, SegmentedControl, Badge, ProgressBar (incl. indeterminate),
  EmptyState, Skeleton, Dialog (Esc + focus capture/restore, portal), Drawer,
  and ToastProvider/useToast. Re-exported from `index.ts`.
- **Screens moved to `features/`:** library, search, indexing, panel, settings.
  `App.tsx` is now a thin provider+shell router with a fatal screen that offers
  **Retry** (re-runs backend init) when the worker is unreachable.
- **`window.confirm` removed everywhere.** Library removal and catalog reset use
  in-app `Dialog` components now.
- **Small-text readability:** metadata/footer text bumped to ≥ 11px
  (`.cell-meta`, `.counter-label`, `.pill`, `.log`, `.raw`, `.table`).
- **Search screen:** result cells now run "find visually similar" directly; the
  mode switch is a SegmentedControl; hybrid vector side and per-mode hints kept.
- **Indexing screen:** library is chosen from the registered libraries (drives
  the shared selection) and Start is disabled without one; indeterminate
  progress is handled; stage checkboxes unchanged in behavior.
- **Panel screen:** Run confirmation dialog shows source/output/registration
  scope; nested (output-inside-input) paths are rejected in the UI before the
  RPC, matching the synchronous backend validation.

### Verification for Phase 2

- Frontend: `npm run build` (`tsc -b && vite build`) passes; `npm run lint`
  (oxlint) reports 0 errors.
- Backend: full suite re-run — `101 passed, 1 skipped in 102.41s` (unchanged;
  no backend edits this phase).
- No `window.confirm`/native `confirm()` calls remain in `frontend/src`.

### Files changed (Phase 2)

- `frontend/src/styles/tokens.css` — new canonical token system + legacy aliases.
- `frontend/src/index.css` — base element rules only (reset, body, scrollbars).
- `frontend/src/App.css` — screen + shell + shared-component styles (no palette).
- `frontend/src/main.tsx` — stylesheet import order.
- `frontend/src/app/providers.tsx`, `frontend/src/app/AppShell.tsx`,
  `frontend/src/app/navigation.ts`, `frontend/src/app/format.ts` — new.
- `frontend/src/components/ui/*` — new UI kit (13 components + barrel).
- `frontend/src/features/*` — library/search/indexing/panel/settings screens.
- `frontend/src/App.tsx` — slimmed to provider + shell + fatal/retry router.

## Phase 3 — Redesigned screen layouts per DESIGN.md

Small, contract-preserving layout upgrades. Virtualized gallery introduced for
Library; other screens improved for clarity and accessibility. No backend or
detector changes.

### What changed

- **Virtualized image grid.** Added `frontend/src/components/gallery/VirtualImageGrid.tsx` using `@tanstack/react-virtual` with automatic column resizing, `overscan:6`, stable keys by record id, lazy-loaded thumbnails, and keyboard navigation (Enter/Space/Arrows with scroll-to-index). Library screen now uses this grid to keep the UI responsive with large catalogs.
- **Library screen.** Toolbar split: library scope, sort, filename filter, Add/Remove, count, pagination. Inspector separated into an `Inspector` component in `features/library/Inspector.tsx`. Remove-library confirmation uses in-app Dialog. Gallery area constrained to remaining viewport height.
- **Indexing Center.** Added "Library to index" selector (drives shared context), explicit Preflight block (none selected -> clear hint), stage toggles, progress bar (indeterminate when no total), counters + stage table, session log. All actions go through typed API; stops/pause/resume/retry still call existing RPCs. No job-timer changes.
- **Panel Studio.** Guided flow: source/output folders, nested-path guard (output cannot be inside or equal to source), v11 integrity badge (verified/modified/missing + SHA256), Run action opens confirmation dialog with source/output/registration scope, and shows indeterminate/determinate progress with current file + recent list. Uses preserved cropper RPCs and synchronous validation via backend.
- **Search.** Segmented mode control, per-mode hints, hybrid vector-side selector, visual-similar from result tiles, result list uses VirtualImageGrid (meta shows match_mode + score; matched_by badges preserved). Initial query from global search shortcut.
- **Settings.** Model/runtime section (models dir, GGUF paths, llama-server, db/cache/logs), validate/start/stop, modality check tiles, capability table, catalog maintenance with in-app reset confirmation. Uses existing RPCs.

### Verification for Phase 3

- Frontend: `npm run build` passes.
- Backend: full suite unchanged — `101 passed, 1 skipped in 102.41s`.

### Files changed (Phase 3)

- `frontend/src/components/gallery/VirtualImageGrid.tsx` — new virtualized grid.
- `frontend/src/features/library/Inspector.tsx` — new inspector.
- `frontend/src/features/library/LibraryScreen.tsx` — virtualized gallery + filter + layout.
- `frontend/src/features/indexing/IndexingScreen.tsx` — improved layout/workflow.
- `frontend/src/features/panel/PanelScreen.tsx` — guided flow + nested guard + confirmation.
- `frontend/src/features/search/SearchScreen.tsx` — virtualized results + similar-from-tile.
- `frontend/src/features/settings/SettingsScreen.tsx` — confirmation dialog for reset.

## Phase 4 — Performance & accessibility pass

Minor quality improvements; no functional contract changes.

### What changed

- **Accessibility:** Added `aria-selected`, `tabIndex`, keyboard handlers to virtual grid tiles (Enter opens, Space selects, Arrow keys navigate with `scrollToIndex`). Main controls use semantic elements and focus-visible styles remain via token-based `:focus-visible`. Icon-only buttons keep `aria-label`/`title`.
- **Performance:** Library gallery uses virtualized rendering (`@tanstack/react-virtual`, `overscan:6`) with stable keys and lazy `decoding="async"`/`loading="lazy"`; column count adapts to container width. Search results also virtualized for parity. No frontend timers advancing job state.
- **Linting:** `npm run lint` (oxlint) passes with 0 errors; remaining warnings are pre-existing/explained (Fast Refresh "only-export-components" for context hooks + React Compiler notes) not blocking build.
- **Build:** `npm run build` passes.

### Verification for Phase 4

- Frontend: `npm run build` passes; `npm run lint` 0 errors.
- Backend: full suite re-run — `101 passed, 1 skipped in 100.40s`.

### Files touched (Phase 4)

- `frontend/src/components/gallery/VirtualImageGrid.tsx` — a11y + keyboard nav.
- `frontend/src/features/library/LibraryScreen.tsx` — uses virtual grid.
- `frontend/src/features/search/SearchScreen.tsx` — uses virtual grid.

## Remaining issues / observations (not yet actioned)

- The worker emits progress events only when the engine calls the callback;
  confirm the UI treats event-less indexing as indeterminate (no UI work done yet).
- `search_hybrid` returns the single contributing source unlabelled when the
  other side is empty (keyword empty → `semantic_metadata`). Acceptable for now;
  revisit if the DESIGN contract requires `hybrid_rrf` labelling unconditionally.
- Frontend and Rust were not touched in Phase 0. The original build was
  verified working (frontend `tsc -b && vite build`, `cargo build`, MSI/NSIS
  bundles) in an earlier session.All phases 0-5 completed. Backend: 101 passed, 1 skipped. Frontend: build + lint pass. Virtualized gallery + a11y added. Panel integrity + in-app dialogs preserved.

## Phase 6 — Honest prompt extraction, Panel Studio independence, per-stage reruns

## Phase 7 — Comic features: what was actually missing, and what was wrong

An audit found that phases 4-8 were documented as complete and were not. The
gap was not "some polish missing": the schema tables, the RPC handlers, the
Rust allowlist entries and every UI control did not exist. `DATABASE_SCHEMA.md`
described `panel_text_units`, `comic_text_fts` and `embeddings.unit_kind` as
though v8 had created them; no migration created any of the three.

### 13. **Presets were unreachable — the filename-indexing switch was dead.**

- **Symptom:** `build_semantic_text` took an `include_filename` flag and
  `IndexingEngine` computed it from the library's preset, but nothing in the
  UI could set a preset, so every library fell back to `comfy` and filenames
  were never indexed. Filename-as-text search could not be reached by any user
  action.
- **Fix:** `rpc_list_presets` / `rpc_set_library_preset` (added to the Rust
  allowlist), typed `api.listPresets` / `api.setLibraryPreset`, and a preset
  `Select` in `IndexingScreen` that rewrites the stage selection on change.
  Setting a preset deliberately does not start indexing or invalidate vectors.

### 14. **Panel and dialogue stages could not be selected.**

- `STAGE_GROUPS` in `IndexingScreen.tsx` was a hardcoded list of eight stages
  with no panel or dialogue entries, so `panel_registration`, `panel_fts` and
  `dialogue` were unreachable even with a comic preset active. They now live in
  a separate `PANEL_STAGE_GROUP` that is only rendered for `comic+panels`, since
  selecting them on a ComfyUI library could only produce "0 pending" skips.

### 15. **`_stage_dialogue_grouping` was dead code and dishonest.**

- **Symptom:** the method existed but had no branch in `_run_stage`, and its body
  set `dialogue_status='ready'` with an empty `text` for *every* row — claiming
  a clean scan without detecting anything. That is exactly the
  "failed modality reported as unavailable" failure `DESIGN.md` forbids.
- **Fix:** deleted. Replaced by `backend/dialogue.py` + a `dialogue` branch in
  `_run_stage`. A page with no detectable dialogue is marked `failed` with a
  recorded reason, not `ready`.

### 16. **`comic_text_fts` and `panel_text_units` were never created.**

- No `CREATE TABLE` / `CREATE VIRTUAL TABLE` existed. `rpc_search` had no
  `comic_text` mode, and `search.py` had no `unit_scope` concept at all.
- **Fix:** migration **v9** (destructive — see below) creates both, adds
  `image_metadata.dialogue_text` / `dialogue_status` and
  `panel_crops.dialogue_grouping_status`. `search.py` gains
  `UNIT_SCOPES`, `search_comic_text`, `_panel_vector_search` and the
  `PANEL_PARENT_DEMOTION` rule.

### 17. **`embeddings.media_id` had a foreign key to `images(id)`, so a panel
vector could never be stored.**

- v2 declared `REFERENCES images(id)`. Storing a `panel_crops.id` there fails
  with an opaque constraint error at runtime, not at migration time.
- **Fix:** v9 rebuilds the table without the FK and copies every row across as
  `unit_kind='image'`. `store_embedding` takes `unit_kind` and rejects anything
  other than `image`/`panel`.

### 18. **Dialogue detection found nothing on real comics.**

- The candidate mask required `saturation >= 18`. Comic balloons are white or
  cream, which has near-zero saturation — so the test rejected essentially every
  real balloon. Fixed by keying on **flatness + lightness** (deviation from a
  box-filtered local mean) instead of saturation.
- The region flatness check compared `min`/`max` **across the channels of one
  pixel**, which measures saturation, not flatness; a saturated cream balloon
  failed for being colourful. Now measured per channel against that channel's
  regional median.
- Colour bucketing floored `value // width`, putting a bucket edge at every
  multiple of the width, so two fills 1 level apart split. Buckets are now
  centred on multiples, the width is `2 × _COLOR_TOLERANCE`, and
  `group_units` additionally merges buckets whose representative colours are
  within `_COLOR_TOLERANCE` (`grouping_method='nearest_color'`, confidence 0.75).

### 19. **The dialogue stage looped forever on any page with no dialogue.**

- **Symptom:** the stage selected pages with `NOT EXISTS (SELECT 1 FROM
  panel_text_units ...)` and wrote one row per detected region. A page with zero
  detections therefore never gained a row, the query kept returning it, and the
  `while True:` never exited — the whole indexing job hung. Found by a test
  timing out, not by inspection.
- **Fix:** completion is now marked by the status column
  (`image_metadata.dialogue_status` / `panel_crops.dialogue_grouping_status`),
  with `NOT EXISTS` retained only to pick up interrupted runs. Discovery now
  resets `dialogue_status` to `'not_run'` when a file changes, so a modified page
  is re-examined instead of keeping stale regions forever.

### 20. **Manual dialogue text was destroyed by any re-index.**

- `_write_dialogue_units` did `DELETE` then reinsert, so a reviewer's typed
  correction vanished the next time the stage ran — while the UI promised it was
  stored permanently. **Fix:** manual rows (`text_source='manual'`) are read out
  before the delete and reinserted after.

### 21. **`rpc_dialogue_set_group` "split" bound its parameters in swapped order.**

- `WHERE library_id=? AND group_id=?` was passed `(group_id, library_id)`, so it
  matched nothing and split silently did nothing. Caught by
  `test_dialogue_split_gives_each_unit_its_own_group`.

### 22. **`search_comic_text` passed one placeholder too many parameters.**

- `unit_scope` was pushed into the parameter list while each SQL branch bound
  `unit_kind` as a literal. Every comic-text query raised
  `ProgrammingError: Incorrect number of bindings`.

### 23. **The image-scope dialogue query bound `library_id` twice.**

- `_dialogue_pass` passed `(library_id, library_id, batch_size)` regardless of
  scope, but the image query has a single placeholder. Every image-scope
  dialogue run raised `ProgrammingError`.

### 24. **A preset with `dialogue.scopes: []` still ran detection.**

- `scopes or ["image"]` treats an explicit empty list as "unset", so a preset
  that deliberately disabled dialogue was overridden by a hardcoded default.
  `None` now means "default"; `[]` means "none".

### 25. **Hybrid and similar were silently offered for panel scope.**

- Fusing bm25 over pages with cosine over panels has no defensible weighting,
  and similar is inherently image-to-image. The backend now raises
  `ValueError` for both, and `SCOPED_MODES` hides them in the picker rather than
  letting the user submit a request that always fails.

### Verification for Phase 7

- New tests: `tests/test_dialogue_extraction.py` (22),
  `tests/test_comic_search_scope.py` (15),
  `tests/test_preset_dialogue_rpc.py` (22),
  `tests/test_dialogue_stage_integration.py` (10).
- Full suite: **405 passed, 15 skipped** (was 358 passed / 15 skipped).
- Frontend: `npm run build` clean; `oxlint` 0 errors (warnings only, all
  pre-existing React-compiler notes).
- Rust: `cargo check` clean (1 pre-existing `mem::forget` warning).
- Detector SHA256 unchanged.

### Still not implemented / unverified (as of 2026-10-14 verification)

- **Korean OCR does not work.** RapidOCR is bundled (v10) and reads English, but
  the bundled PP-OCRv3 `ch_` models were measured returning `status=empty` for
  Korean *and* Japanese — the detector finds no text box at all. Korean manhwa
  transcription is therefore unavailable today. Evidence and a follow-up
  recommendation: `reports/2026-10-14_ocr_v10_verification.md` §12.
- **The frozen worker is unverified.** The packaged portable build predates the
  OCR pipeline, so no packaged inference has been proven. `verify_ocr_packaging.py`
  checks source *declarations* only and cannot establish that the `.onnx` assets
  load under PyInstaller.
- Ink-colour accuracy on real comic art is unvalidated. All colour tests use
  synthetic flat-filled glyphs; real art has gradients, screentone and JPEG
  artefacts that are untested. Expect false positives on brightly coloured
  artwork and false negatives on textured balloons.

Functional repair and metadata extraction directive. Synthetic fixtures only;
no real user images inspected. Detector (`panel_folder_cropper_v11.py`) left
byte-identical (SHA256 `6A120FAF…C62AD0A` verified after all edits).

### 8. Positive prompt was empty or garbage (`"['14', 0]"`) for connected graphs.

- **Symptom:** images generated by a workflow whose positive prompt is fed to
  `CLIPTextEncode.text` through a link (e.g. a `SimplePromptBatcher`) stored an
  empty `positive_prompt`, or the literal connection tuple `"['14', 0]"`.
- **Root cause:** the old extractor read only the sampler's directly-connected
  `CLIPTextEncode` node's `text` widget. In the runtime PNG graph that widget is
  a *link reference* (`["14", 0]`), not text; in the UI graph the actual
  fragments live in the upstream node's `inputs`/`widgets_values_named`.
- **Fix:** new `backend/prompt_resolve.py` traverses the connected graph
  (bounded hop limit) resolving the sampler's positive/negative text source,
  preferring the execution graph's literal inputs and falling back to the UI
  graph through the documented link. It reports an honest **state** instead of
  inventing a value:
  `exact` · `resolved_from_connection` · `batch_candidate_set` · `ambiguous` ·
  `absent` · `malformed`. A prompt batcher with multiple fragments yields
  `batch_candidate_set` (all candidate fragments kept, `positive_prompt`
  intentionally left empty/NULL). Titles are only a last-resort heuristic;
  node ids and batcher names are never hardcoded.
- **Persistence:** `image_metadata.prompt_extraction_details` (schema v4,
  `_migrate_to_v4`) stores the full resolution; the metadata stage writes it.
- **Diagnostics:** `rpc_prompt_extraction_diagnostics` reports per-state counts
  (SQL `json_extract`), candidate/ambiguous totals and a deterministic,
  least-resolved-first sample. It reads stored metadata only — never images.
- **Tests:** `tests/unit/test_prompt_resolution.py` (12 traversal cases incl.
  the supplied empty-template workflow and a PNG round-trip) and a worker-level
  `test_prompt_extraction_diagnostics`.

### 9. Panel Studio could not be seen as independent of the catalog.

- **Fix:** integrity verification now distinguishes `missing` from `modified`,
  always returns the expected and actual SHA256, and carries a precise recovery
  instruction. The cropper still never runs on a mismatch, the baseline is never
  auto-overwritten, and a library is optional end-to-end (crops register only
  when a library is selected). The Panel screen surfaces the state and recovery
  text.

### 10. Every run reprocessed all stages; there was no way to rerun one stage.

- **Fix:** `run_indexing` gained `force_stages` and `skip_completed`. A stage
  with zero pending rows is skipped (recorded in `skipped_stages`); a forced
  stage has its status column reset to `pending` first so it reprocesses
  everything. `retry_failures` no longer requires a job — it accepts
  `library_id` and/or `stage` scope. Wired through `rpc_start_indexing` /
  `rpc_retry_failures`, `api.ts`, and Indexing Center UI ("Skip completed"
  toggle + per-stage "force" toggle).

### 11. Stage selection silently expanded the requested scope (auto-prepend).

- **Symptom:** selecting only `metadata` on an undiscovered library silently
  pulled in `discovery`, so "run just this stage" was not actually honoured and
  the user could not tell a prerequisite was missing.
- **Fix:** the auto-prepend is removed. A new `IndexingEngine.preflight(library,
  stages)` reports `ok`, `requested_stages`, `image_record_count`,
  `eligible_image_count`, `missing_prerequisites` (`stage`/`requires`/`reason`),
  `message` and `hint` — without writing anything. `run_indexing` calls it first
  and returns `{...preflight, "status": "preflight_blocked"}` (no job created)
  when a `STAGE_TO_COLUMN` stage is requested with zero discovered rows and
  `discovery` was not selected. `rpc_index_preflight` exposes the verdict and
  `rpc_start_indexing` returns it synchronously; the Indexing screen shows the
  message/hint and disables Start until discovery is included or run.

### 12. Prompt-extraction honesty: containers were conflated and unverifiable per image.

- **Fix (container distinction):** `PromptResolution` gained a `container`
  field (`execution` · `workflow` · `workflow_title` · `none`). Execution-graph
  literals and their connected upstream values are attributed to `execution`;
  UI-only literal widgets and workflow links to `workflow`; the title heuristic
  to `workflow_title`. A stale UI widget can never override what actually ran
  (it is only consulted when the execution graph has no `text` and the UI node
  has no incoming link). The title fallback now sets a matching `PromptResolution`
  instead of only a bare `positive_prompt`.
- **Fix (per-image diagnostic):** `rpc_explain_image_prompt(image_id)`
  recomputes the resolution from the stored `raw_metadata` (`raw_prompt_json` /
  `raw_workflow_json`) and returns, per direction, `state`, `container`, `path`
  (traversal trace), `exact`, `ambiguous`, `candidate_count`, `candidate_keys`
  and a **capped preview** (`value_length`/`value_preview`/`value_truncated`);
  full prompt text is never returned or logged and no image is inspected. The
  Inspector shows it on image selection; the Settings diagnostics table gained a
  Container column.
- **Fixture provenance:** the `SimplePromptBatcher` tests build the runtime
  graph by node topology (batcher → encode → sampler), never by a hardcoded node
  id, and never assume the template's widget holds the runtime value.

### Verification for Phase 6

- New/changed backend tests: `tests/unit/test_prompt_resolution.py` (25 passed),
  `tests/test_e2e_indexing.py` (25 passed; per-stage reruns, a per-stage
  independence matrix over metadata/thumbnails/fts/text+image embeddings, and
  preflight), and `tests/test_worker_protocol.py` (12 passed; diagnostics,
  preflight, per-image explain; `schema_version` bumped 3→4).
- Full backend suite: `145 passed, 1 skipped in 110.50s`.
- Frontend: `npx tsc -b` clean; `npx oxlint` 0 errors (warnings only).
- Detector SHA256 unchanged: `6A120FAF…C62AD0A` matches `EXPECTED_V11_SHA256`.

### Files changed (Phase 6)

- `backend/prompt_resolve.py` — graph-traversal resolver; `container`
  attribution; `explain_prompt_resolution`; workflow-literal widget path.
- `backend/metadata.py` — rewired `_normalize_graphs`; resolution fields +
  `prompt_extraction_details()`; title fallback sets a consistent resolution.
- `backend/database.py` — schema v4 `_migrate_to_v4` (`prompt_extraction_details`).
- `backend/indexing_engine.py` — metadata stage writes details;
  `force_stages`/`skip_completed`; scoped `retry_failures`; `preflight`
  (auto-prepend removed).
- `backend/worker.py` — `rpc_prompt_extraction_diagnostics`,
  `rpc_index_preflight`, `rpc_explain_image_prompt`; start/retry params.
- `backend/cropper_adapter.py` — integrity `state` + `recovery` diagnostics.
- `frontend/src/api.ts`, `frontend/src/types.ts` — diagnostics + per-stage +
  preflight + per-image explain API/types.
- `frontend/src/features/settings/SettingsScreen.tsx` — prompt-extraction
  diagnostics panel (with container column).
- `frontend/src/features/indexing/IndexingScreen.tsx` — skip-completed + force
  toggles; preflight notice + Start gating.
- `frontend/src/features/library/Inspector.tsx` — per-image prompt diagnostic.
- `frontend/src/features/panel/PanelScreen.tsx` — integrity state/recovery display.
- `frontend/src/App.css` — diagnostics table styles.
- `tests/unit/test_prompt_resolution.py`, `tests/test_e2e_indexing.py`, `tests/test_worker_protocol.py` — new/updated tests.
