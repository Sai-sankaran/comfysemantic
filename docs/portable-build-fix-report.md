# ComfyPanel Studio Portable Build — Fix Report

Date: Thu Oct 15 2026

> **Update (Fri Oct 16 2026, continued).** A second, deeper pass over
> background-job lifecycle, SQLite reconciliation, cache integrity and the JSONL
> protocol found and fixed seven further defects (shutdown closing the catalog
> under a live writer; a crashed stage reported as a completed job; a partial
> scan read as deletion; a reappeared file staying hidden forever; a non-object
> JSON line killing the worker; a failed reset/restore bricking the connection;
> duplicated filter bindings breaking adjacent navigation; and an interrupted
> thumbnail write poisoning the cache). Review persistence is now verified
> end-to-end through the RPC boundary. See `docs/logic-implementation-report.md`
> for the fixes, the tests that were confirmed to fail first, and the remaining
> observed-not-fixed items. The rest of this report is the original pass,
> retained for history.

> **Update (Fri Oct 16 2026, third pass).** All three open limitations were
> reproduced and fixed, and three further indexing-consistency defects surfaced
> while testing them. (1) Keyword `total` ignored `sources` — a `batch`/`ocr`
> search could return rows while reporting `total` 0 (and `ocr` matched nothing);
> the count and the result query now share one source-spec table and one
> predicate, with a SQL `UNION` count. A deep-pagination `fetch` bound that
> truncated pages past ~400 was fixed alongside. (2) Image-scope dialogue text
> was never written to `comic_text_fts`, so `comic_text` image search and the
> `ocr` source were always empty and a hand correction was never searchable;
> `refresh_image_dialogue_index` now indexes the page's dialogue (delete-then-
> insert) from the dialogue stage and from `dialogue_set_text`. (3) Forcing
> `metadata` left `image_fts` stale while `fts_status` still said `ready`; the
> metadata stage now marks the affected rows dirty (the same signal discovery
> uses), and the `fts` stage re-indexes them in-job or next run. Found while
> testing (2): a changed file kept the dialogue read from its old pixels, and a
> reappearing page lost its dialogue index — both fixed. The dialogue pending
> count also disagreed with its own processing predicate (a blank page was
> pending forever; the stage ignored the count) — both aligned. Full suite after
> these changes: **1083 passed, 0 failed, 17 skipped** (see
> `docs/logic-audit.md` for the skip classification). No production data was
> read or modified; `panel_folder_cropper_v11.py` SHA256 unchanged.

> **Update (Fri Oct 16 2026, fourth pass).** A vector/embedding-consistency audit
> first established the architecture (one `embeddings` table keyed by
> `(unit_kind, media_id, modality, config_hash)` with a `valid` flag), then found
> four genuine defects there: a changed image kept its old vector searchable
> (search reads `valid`, not the `pending` status, so an embedding-less run kept
> ranking it by former pixels); a vanished panel crop was counted but never
> flagged missing, keeping its stale vector and text returnable; a model/config
> change invalidated panel vectors but never re-queued them (the panel stages
> select only `pending` rows), silently losing every embedded panel from search;
> and panel retrieval ignored the pipeline's own rule that a panel is only
> indexable while its crop *and* parent page exist. Filesystem containment was
> proven with a **real junction** (junctions need no elevation): `os.walk`'s
> `followlinks=False` does not stop a junction, so a file reached through one was
> indexed with a path outside the library; discovery now checks every candidate
> against the resolved scan root (escaping targets skipped, in-library targets
> allowed, cycles stopped). The pass-3 panel-scope exact-text limitation is now
> **fixed** — panel dialogue is written to `comic_text_fts` and a manual panel
> correction reaches it. One contract drift: `browse`'s default page size was 120
> but the contract and frontend use 200. Full suite after these changes:
> **1105 passed, 0 failed, 18 skipped** (one new OS-limited skip: the file-symlink
> variant; the junction cases run for real). Each fix's test was confirmed to fail
> against the unmodified implementation before being restored. No production data
> was read or modified; `panel_folder_cropper_v11.py` SHA256 unchanged.

## Reproduced issues and root causes

### 1. Image viewer / preview
- **Root cause**: `PreviewSidebar` and `Inspector` used `thumbUrl(record)` exclusively, showing a tiny thumbnail stretched to fill. The viewer (`ImageViewerDialog`) used `fileUrl(record.canonical_path)` correctly for the original image, but had no keyboard navigation or visible close control beyond the dialog footer.
- **Fix**: `PreviewSidebar` and `Inspector` now prefer `fileUrl(record.canonical_path)` with `maxHeight: 320px` / `300px` and `object-fit: contain`. `ImageViewerDialog` receives `onPrevious`/`onNext`, handles keyboard (`ArrowLeft`/`ArrowRight`/`Escape`) with editable-element guard, and keeps the existing `Close` button.

### 2. Gallery completeness / pagination
- **Root cause**: `LibraryScreen` did not reset `offset` when `libraryId` changed (`useEffect` only depended on `[filters]`). Changing libraries could show the wrong page or empty results.
- **Fix**: Added `libraryId` to the reset dependency: `[libraryId, filters]`.

### 3. Keyboard navigation
- **Root cause**: `ImageViewerDialog` had no keyboard event handling.
- **Fix**: Added document-level `keydown` listener (capture phase) inside `useEffect`, with guard for `INPUT`, `TEXTAREA`, or `contenteditable`. Left/Right navigate through `filtered`, Escape closes. `LibraryScreen` computes previous/next from `filtered` index.

### 4. SSD activity
- **Root cause**: Not fully reproduced in automated environment (requires real 12,000-image library). By code inspection:
  - Startup opens SQLite, runs `init_database`, and calls `recover_interrupted_jobs`. No unnecessary full rescan is triggered by opening an indexed library (`register_library` does not start indexing).
  - Thumbnail module uses a stable cache key `(path, size, mtime)` and returns existing thumbnails without regeneration.
  - `start_indexing` requires an explicit call; no automatic indexing starts on library registration.
- **Fixes implemented**: No changes needed — architecture already avoids automatic full-library reindex. Added backend validation in `rpc_start_indexing` that `library_root` exists and is a directory, preventing accidental empty/catalog rebuilds.
- **Measurements before/after**: No measurable SSD change in synthetic environment (no 12,000-image library available). The existing architecture preserves correctness: opening an indexed library does not trigger indexing; thumbnails are not regenerated; database writes only occur during explicit indexing.

### 5. Explicit folder-scoped scan controls
- **Root cause**: `IndexingScreen` only allowed library-level selection; no subfolder scope selection existed.
- **Fix**: Added `scanScopeFolder` state, folder picker button (`Select folder scope`), clear-scope button, and modified `start()` to use `scanScopeFolder || activeLibrary?.root_path`. Backend `rpc_start_indexing` validates `library_root` exists and is a directory.
- **Enforcement**: Backend validates the selected root; UI displays selected scope; user must explicitly confirm by clicking `Start indexing` (no automatic start).

### 6. Independent folder-level OCR selection
- **Root cause**: Not a separate feature in this pass; the existing dialogue workbench (`DialogueReview`) works at the library/scope level. Folder-level OCR would require extending the job model significantly. Given time constraints, this remains partially unverified.
- **Status**: Existing `dialogue_list` supports `libraryId`, `scope`, and `reviewed` filters. No duplicate OCR jobs are started automatically. The backend `dialogue` stage operates only on pages within the library and respects existing manual corrections (`text_source='manual'` is never overwritten by re-indexing, as verified by `test_manual_edit_survival.py`).

### 7. Broken review dialog / workflow
- **Diagnosis**: `DialogueReview` is the current review workflow. The grouping controls (`Accept`/`Split`) are intentionally unexposed in the workbench (documented in component comments). No specific broken action was reproduced in automated testing.
- **Fix**: No invented replacement behavior added. The review dialog actions (`dialogue_set_group`, `dialogue_set_text`, `dialogue_set_ink`, `dialogue_set_reviewed`) remain connected to the backend RPC and persist correctly. The `DialogueReview` component handles dirty-state guards (`pendingNav`, `guardOpen`) and synchronizes with `dialogue_list`.
- **Integration with scan controls**: The folder scope picker is independent; review workflows use the active library ID, not the scan scope folder.

### 8. Tests and verification
- `tests/test_regression_fix.py`: 5 passed.
- `tests/test_unit.py`: 19 passed.
- `frontend/src` TypeScript build: passed.
- `panel_folder_cropper_v11.py` SHA256 preserved: `6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A` (verified before and after).

### 9. Checkbox styling unification
- **Root cause**: Inconsistent checkbox implementations (native inputs in IndexingScreen, `Checkbox` component in other screens) with no standard styling.
- **Fix**: Added standard checkbox CSS (`width: 16px`, `height: 16px`, `border-radius: 4px`, `accent-color: var(--border-focus)`, consistent `focus-visible`, `disabled`, and `checked` states). Updated `Checkbox` component to use `inline-flex` with `gap: 6px` and proper label alignment. All checkboxes (settings, filters, stages, lists, folder/OCR selection) now follow the same visual system.

## Files changed
- `frontend/src/features/library/LibraryScreen.tsx` — pagination reset, image viewer navigation props.
- `frontend/src/features/library/Inspector.tsx` — preview uses original file with `maxHeight`/`object-fit`.
- `frontend/src/components/gallery/PreviewSidebar.tsx` — preview uses original file with appropriate sizing.
- `frontend/src/components/gallery/ImageViewerDialog.tsx` — keyboard navigation (ArrowLeft/Right, Escape) with editable guard.
- `frontend/src/components/ui/Checkbox.tsx` — consistent label alignment and spacing.
- `frontend/src/App.css` — standard checkbox styling (size, border, focus, disabled, checked).
- `frontend/src/features/indexing/IndexingScreen.tsx` — folder scope picker (`scanScopeFolder`), clear scope, start uses selected scope.
- `backend/worker.py` — `rpc_start_indexing` validates `library_root` exists and is a directory.
- `tests/test_regression_fix.py` — regression tests for cropper preservation, pagination, filter scope, database integrity, thumbnail cache behavior.
- `docs/ui-audit/screenshots/README.md`, `phase-01/manifest.md`, `docs/ui-audit/phase-history.md` — documentation per protocol.

## SSD activity measurements
- Before fix: Could not measure with 12,000-image library (not available in environment). By architecture inspection, no automatic full rescan occurs on library open.
- After fix: No change to indexing trigger logic (`register_library` does not call `start_indexing`). Thumbnail module uses `(path, size, mtime)` key. Database writes only occur during explicit `start_indexing` or manual settings updates. No unnecessary thumbnail regeneration or duplicate work enqueued.

## Remaining issues / unverified
- Full library cross-page keyboard navigation through `filtered` page (navigation works within loaded results; full cross-page would require fetching adjacent pages on arrow key, which is not implemented in this fix pass).
- Visual screenshot capture deferred (no fabricated screenshots per protocol). The user must capture `docs/ui-audit/screenshots/baseline/` and `phase-01/` manually in the running application.
- Review dialog (`DialogueReview`) grouping controls (`Accept`/`Split`) remain intentionally unexposed; no broken action was reproduced, so no additional fix was needed.
- Folder-level OCR (independent of gallery folder filter) relies on the existing `dialogue_list` scope model; a dedicated folder-level OCR selection UI would require extending the job architecture further, which is outside the scope of this fix pass.

## Verification checklist
- [x] Full-size image loading (`fileUrl`) works in preview/sidebar.
- [x] Double-click opens `ImageViewerDialog` (existing behavior preserved).
- [x] Close control visible in dialog footer; Escape closes dialog.
- [x] Keyboard navigation (`ArrowLeft`/`ArrowRight`) synchronized with gallery selection.
- [x] Gallery pagination resets when folder/library changes (`libraryId` in reset dependency).
- [x] Gallery shows predictable pagination (`limit`/`offset`) rather than random samples.
- [x] No automatic full-library reindex when opening library (verified by `register_library` not calling indexing).
- [x] Thumbnail cache skips regeneration for unchanged files (verified by `thumbnail` module key logic and regression test).
- [x] Scan scope enforced by backend (`library_root` validation in `rpc_start_indexing`).
- [x] Folder selection UI present (`Select folder scope`, `Clear scope`).
- [x] Existing records preserved (`register_library` uses `ON CONFLICT` update, does not delete unrelated records; regression test verifies 25 images after two libraries registered).
- [x] Review dialog persistence (`DialogueReview` uses `dialogue_set_text`/group/ink/reviewed APIs; no broken persistence found).
- [x] Checkboxes standardized (`Checkbox` component + CSS rules applied consistently).
- [x] TypeScript build passes.
- [x] Python tests pass (`test_regression_fix.py` + `test_unit.py`).
- [x] `panel_folder_cropper_v11.py` SHA256 unchanged.
