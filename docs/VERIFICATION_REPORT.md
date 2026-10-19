# Verification Report — ComfyPanel Studio

> **2026-10-15 correction.** The summary row below previously read
> "519 passed, 15 skipped", quoted from an earlier session's report rather than
> measured here. Measured on the tree as it stands: **916 passed, 16 skipped,
> 932 collected** (`.venv\Scripts\python.exe -m pytest -q -p no:randomly`,
> exit 0; `--collect-only -q` reports 932). Collection and execution reconcile
> exactly. Schema was **v12** at the time of that measurement; it is now v15
> (see below). See
> `reports/checkpoints/phase-3-ocr-workbench-contract-and-stage1.md`.
>
> **2026-10-16 correction (Phase 1).** Two "current state" fields in this
> report are stale. They are superseded here rather than rewritten, so the
> measurement history below stays intact:
> - **Schema is v15, not v12.** `_migrations()` in `backend/database.py` ends
>   at v15 (v13 reattachment state, v14 machine-vs-reviewed prompt provenance,
>   v15 `app_settings`).
> - **Frontend tests exist.** Vitest + Testing Library are installed; the suite
>   runs with `npm run test` in `frontend/` (129 tests across 6 files as of
>   2026-10-16).
>
> See `report.md` (R-7) and `docs/DATABASE_SCHEMA.md`.

## 1. Summary

| Category | Result |
|----------|--------|
| Backend unit/integration tests | **916 passed, 16 skipped** (932 collected, exit 0 — measured 2026-10-15; see `reports/checkpoints/phase-3-ocr-workbench-contract-and-stage1.md`) |
| Frontend build | `tsc -b && vite build` — PASS (exit 0) |
| Frontend lint | oxlint — **0 errors**, 14 pre-existing React-compiler warnings (none from files changed this session) |
| Rust check | `cargo check` — PASS (1 pre-existing `mem::forget` warning) |
| Schema version | **12** (v10 ink colour + OCR provenance, v11 batch-candidate FTS, v12 machine transcript + ink/review provenance) |
| Frontend tests | **None exist.** No test runner is installed; UI is verified by `tsc`, `vite build` and `oxlint` only |
| Portable build | `scripts\build-portable.bat` — produces `ComfyPanelStudio-Portable.zip` |
| Portable launch | Not verified. The existing ZIP predates Phase 2 and all of this work |

> **This report previously claimed things that were not true.** It listed panel
> search as verified and quoted 295 tests. At that point `panel_text_units`,
> `comic_text_fts` and `embeddings.unit_kind` did not exist in any migration, the
> `list_presets` / `set_library_preset` / `dialogue_*` RPCs did not exist, the
> Rust allowlist had no entries for them, and no UI control referenced them.
> Sections below are marked **AUTO** (covered by a test that ran here) or
> **MANUAL** (requires a person with a real library).

## 2. Test Results (Full Suite)

Measured 2026-10-15:

```
916 passed, 16 skipped, 117 warnings in 224.29s
```

916 + 16 = 932, matching `--collect-only` exactly.

The 16 skips are all environment-gated and individually justified (`pytest -rs`):
11 in `tests/test_real_model.py` (no local model/runtime), 1 in
`tests/multimodal/test_multimodal_capabilities.py` (no GGUF files in `runtime/`),
1 in `tests/test_panel_stages.py` (no real crop files on this machine), and 3 in
`tests/unit/test_prompt_resolution.py` (supplied workflow JSON not present).

> The "405 passed, 15 skipped" line this replaced was a real measurement from an
> earlier session, not an error — but it was stale, and the summary quoted a
> figure from a *different* report again. Both are corrected above.

### Comic-feature modules (new)

| Test Module | Passed | Covers |
|-------------|--------|--------|
| `test_dialogue_extraction.py` | 22 | v9 schema; detection; bucketing; grouping; unreadable files |
| `test_comic_search_scope.py` | 15 | `unit_scope` panel search; `comic_text` FTS; demotion; scope refusals |
| `test_preset_dialogue_rpc.py` | 22 | preset RPCs; dialogue list/accept/split/merge/set_text; manual-text durability |
| `test_dialogue_stage_integration.py` | 10 | `dialogue` dispatch; idempotence; preset scopes; failed-vs-ready honesty |

### Pre-existing modules

| Test Module | Passed |
|-------------|--------|
| `test_batch_recovery_fk.py` | 4 |
| `test_cropper_progress_contract.py` | 9 |
| `test_filename_indexing.py` | 20 |
| `test_migration_safety.py` | 7 |
| `test_panel_stages.py` | 9 |
| `test_presets_migration.py` | 10 |
| `test_search_keywords.py` | 7 |
| `test_search_total.py` | 4 |
| plus `test_unit`, `test_e2e_indexing`, `test_worker_protocol`, `test_png_*`, `test_scale_simulation`, `test_process_lifetime`, `test_c1_*`, `unit/`, `adversarial/`, `database/`, `recovery/`, `search/`, `security/`, `multimodal/`, `performance/` | remainder |

## 3. Key Functional Verification

| Feature | Status | Method |
|---------|--------|--------|
| Portable ZIP build | **AUTO** | `scripts\build-portable.bat` |
| **v9 present in the FROZEN backend** | **AUTO** | `scripts\verify_v9_rpc.py` drives `comfypanel-backend.exe` over stdio RPC |
| Library registration | **AUTO** | `rpc_register_library` + existing suite |
| Panel cropper run | **MANUAL** | `rpc_run_cropper`; previously 60/60 crops on a real run |
| Panel search (`unit_scope=panel`) | **AUTO** | `test_panel_scope_search_ranks_panels` |
| Panel text search (`comic_text`) | **AUTO** | `test_comic_text_search_returns_panels` |
| Panel embedding stages | **AUTO** | `_panel_embedding_pass` via `_run_stage` |
| Preset selection changes stages | **AUTO** | `stagesForPreset` + `test_set_library_preset_persists` |
| Filename indexing honours the preset | **AUTO** | `test_comic_preset_includes_the_filename` (existing) |
| Dialogue region detection | **AUTO** | `test_detect_finds_flat_light_regions` (synthetic) |
| Dialogue colour grouping | **AUTO** | `test_same_colour_regions_share_a_group` |
| Dialogue grouping survives a bucket edge | **AUTO** | `test_grouping_survives_a_bucket_edge` |
| Dialogue stage terminates on a page with no dialogue | **AUTO** | `test_pages_with_no_balloons_are_marked_failed_not_ready` |
| Manual dialogue text survives re-index | **AUTO** | `test_manual_text_survives_extraction_rerun` |
| Dialogue Review UI renders real groups | **MANUAL** | tab added; needs a person to click it |
| **Dialogue text is read from the image** | **AUTO** (v10) | `test_ocr_real_engine.py` — real RapidOCR on synthetic text; Korean/vertical unvalidated |
| Text-ink colour measured from glyph pixels | **AUTO** (v10) | `test_ink_color.py`, `test_ink_pipeline.py` — synthetic only; real art unvalidated |

## 4. Frozen-binary verification (`scripts/verify_v9_rpc.py`)

A green build log does not prove new code shipped. `--collect-submodules
backend` is exactly the mechanism that can silently miss a module, and a
plain-text search of the exe cannot help because PyInstaller stores bytecode
compressed. So the packaged worker is started and asked directly:

```
PASS  handshake - status=ready
PASS  schema_version == 9 - got 9
PASS  integrity ok
PASS  library registered
PASS  list_presets - comfy,comic,comic+panels
PASS  preset config present
PASS  set_library_preset
PASS  dialogue_list callable
PASS  dialogue units recorded on the page - 2 unit(s)
PASS  dialogue_list returns detections - total=2
PASS  colour grouping produced a group - grp_0A-0A-0A
PASS  set_text stores manual
PASS  comic_text panel scope reachable
PASS  bad unit_scope rejected
```

Detection finding two regions and grouping them is the line that matters: it
means `backend/dialogue.py` is genuinely inside the bundle and NumPy behaves
the same under PyInstaller as it does under the venv.

This check also caught a **stale ZIP**: the first rebuild bundled a
pre-CSS-fix asset (`index-BrI4Isky.css`) and reported success. Comparing the
emitted asset hash against a known-good frontend build is what exposed it. The
delivered ZIP emits `index-CQWX5BWt.css` / `index-hIAKZdXP.js`, matching the
source build exactly.

## 5. Ink-colour and OCR work (v10)

### Source files inspected
`backend/dialogue.py`, `backend/database.py` (v9 migration), `backend/worker.py`
(dialogue RPCs), `backend/indexing_engine.py` (stage dispatch/resumability),
`frontend/src/features/dialogue/DialogueReview.tsx` (review UI + manual text),
`scripts/build_backend.py` (PyInstaller dependency collection), and the existing
synthetic fixtures/tests. Ground truth on what v9's colour fields meant was
established by reading the code, not from their names: `color_signature` /
`color_bucket` are the **region fill** (bubble background), so the ink colour
got new columns rather than overloading them.

### OCR provider
- **Engine:** `rapidocr-onnxruntime==1.2.3` (`py3-none-any`).
- **Models:** PP-OCRv3 detection + recognition + classifier, **13.71 MB bundled
  inside the wheel**. Verified present and verified that `RapidOCR()` constructs
  with `socket.connect` blocked — no runtime download, ever.
- **Speed:** ~0.66 s detection on a 900x300 synthetic image.
- **Geometry:** OCR box `(32,49)-(377,85)` vs drawn `(30,49,380,84)` — within
  ~2 px, so mapping to original coordinates is reliable.
- **API quirk handled:** RapidOCR returns confidence as a **string**
  (`'0.823'`); the provider normalises to `float`.
- **Interface:** `OcrProvider.recognise() -> RecognitionResult` (text, polygon,
  confidence, reading order, status, diagnostics, engine/model/version). OCR is
  independent of the bubble detector; bubbles are carried as
  `supplementary_regions` only.
- **Limitations:** default model is Chinese + English (`ch_PP-OCRv3`). **Korean
  / vertical manhwa lettering is not covered by the bundled model.** All tests
  are Latin-script synthetic text; Korean transcription accuracy is unvalidated.

### Glyph isolation (ink from pixels, not transcription)
- Foreground = deviation from a small-window local mean, **minus** pixels matching
  the page background (crop border = background gamut). Excluding enclosed
  background (glyph counters) and using a small window are both required; without
  them an outlined glyph reports the page colour.
- Erosion strips the glyph outline; deterministic 2-means (farthest-point init,
  per-channel) finds the dominant ink and detects a second, background-
  unexplainable colour as `mixed`.
- Categorisation by measured CIELAB hue angle into 13 categories; brown split
  from orange by lightness; dark navy kept blue. Colour comes **only** from
  pixels — never from the transcript.

### Colour measurement / grouping
- sRGB→CIELAB (dependency-free) and Lab-distance grouping.
- `ink_group_key` from colour + quantised Lab — stable, order-independent, never
  a uuid. JPEG-like jitter does not split a group.
- Groups are **text-colour groups, not speaker identities** — stated in the UI
  and docs.

### Synthetic quality metrics (all on generated images; no real art)
| Test | Result |
|------|--------|
| `test_ink_color.py` | 54 passed — 16-colour categorisation incl. navy/dark-red, 14 bg×ink combos, outline-prefers-fill, gradient/shadow/JPEG robustness, blank→unknown, grouping/jitter |
| `test_ink_pipeline.py` | 19 passed — geometry mapping, reading order, mixed-line single-unit, honesty cases |
| `test_ocr_provider.py` | 19 passed — score normalisation, unavailable≠error, no-crash, singleton |
| `test_ocr_real_engine.py` | 10 passed — real RapidOCR: transcript, geometry, reading order, offline assets, end-to-end ink |
| Full backend suite | **507 passed, 15 skipped** (was 476 before this work) |

**Difficult cases, honestly recorded:** multiple inks in one box → `mixed`
(not split into invented sub-regions); white-on-cream and low-contrast ink →
lower confidence, not a wrong confident colour; gradient backgrounds are
excluded from the ink via the background-gamut veto; tiny/thin text may measure
`unknown`. Real comic art (gradients, screentone, JPEG noise, hand lettering) is
**not** covered by these tests.

### Database changes
**Migration v10 (additive, no rewrite):** `ocr_box_json`, `ink_rgb`,
`ink_category`, `ink_confidence`, `ink_multi_colour`, `ocr_engine`, `ocr_model`,
`ocr_version` on `panel_text_units` + `idx_ptu_ink`. Verified idempotent and
backward-compatible; un-analysed rows read as `unknown`, not a wrong colour.

### Manual edits survive re-indexing
`text_source='manual'` rows are read out before the stage's DELETE and
reinserted after, so an ordinary re-index cannot destroy reviewer corrections.
Covered by `test_manual_text_survives_extraction_rerun` and
`test_detected_rows_are_replaced_on_rerun`.

**Corrected 2026-10-15 — this description was incomplete in a way that mattered.**
Re-inserting the preserved row and *then* inserting the newly detected row
produced **two rows at identical coordinates** (a fresh `unit_id` is minted per
run, so the ids never collided). One balloon was stored, listed and drawn twice,
and reading order gained a duplicate entry. Reproduced before fixing:

```
ROW COUNT: 2
{'id':'AAA', unit_index:1, x:0, y:0, text:'MY OWN WORDS',      text_source':'manual'}
{'id':'BBB', unit_index:1, x:0, y:0, text:'SECOND OCR OUTPUT', text_source':'ocr'}
```

A decision is now layered onto the freshly derived region instead of sitting
beside it — geometry from the machine, text from the person, merged on
reading-order index, retaining the existing row `id`. Separately, the
preserved-row re-insert in the detection path listed **22 of the table's
columns**, so a corrected region kept its typed text and silently lost its
measured ink colour. Both write paths now use named parameters and carry the
full column set. Covered by `tests/unit/test_ocr_workbench_preservation.py`
(12 tests).

### OCR Workbench contract (v12)
**Migration v12 (additive, no rewrite):** `machine_text`, `ink_source`,
`ink_user_rgb`, `ink_user_category`, `ink_user_at`, `reviewed`, `reviewed_at` on
`panel_text_units` + partial index `idx_ptu_reviewed`. Verified by
`scripts/verify_migration_v12.py` (32 checks: fresh init, a real v11→v12
upgrade, idempotence, `integrity_check`, `foreign_key_check`).

Two gaps were closed because the Workbench UI could not otherwise keep its
promises:

1. **The original transcription was being destroyed.** `set_text` overwrote
   `text` in place, so after one correction the machine transcript no longer
   existed — "show the original beside the correction" and "restore machine text"
   were not unimplemented, they were impossible. `machine_text` is now captured
   on the first correction and never written again by a manual edit. `text`
   remains the effective value, so search behaviour is unchanged.
2. **A colour decision had nowhere to live.** `ink_rgb`/`ink_category` are the
   machine measurement; overwriting them to record an approval would destroy the
   estimate the approval was based on. `ink_source` now records
   `machine | approved | manual`, with `ink_user_*` holding a chosen colour
   *beside* the measurement. The backend refuses to approve a colour that was
   never reliably measured.

Covered by `tests/unit/test_ocr_workbench_contract.py` (22 tests).

**Workbench UI (stage 1)** — `frontend/src/features/dialogue/DialogueReview.tsx`
rewritten as queue / canvas / inspector. **Verified by `tsc`, `vite build` and
`oxlint` only — no frontend test runner is installed, and the app was never
launched.** Overlay coordinate correctness, dirty-state behaviour and keyboard
navigation are reviewed, not demonstrated. Treat these as unproven until a UI
test harness exists.

### Packaging verification
`build_backend.py` now collects `rapidocr_onnxruntime` (with its `.onnx` DATA),
`onnxruntime`, `shapely`, `pyclipper`, `cv2`, `yaml`, `six` for the worker.
`scripts/verify_ocr_packaging.py` passes 19/19 static checks (declarations +
local model assets + import resolution + compile). **The frozen exe was NOT
rebuilt this session** (the indexer was running); a real build + RPC smoke test
is still required to prove the models landed in the packaged worker.

### Cropper integrity
`panel_folder_cropper_v11.py` SHA256 re-verified unchanged:
`6A120FAF…C62AD0A`. No cropper edits.

### Not established by the above
- Korean / vertical-text transcription accuracy.
- Ink-colour accuracy on real comic art.
- That a speaker-colour group corresponds to one character.

## 6. Defects found and fixed this session

Twelve, all detailed in `docs/BUGS_AND_STATUS.md` phase 7. The four that
would have been user-visible:

1. **The dialogue stage looped forever** on any page with no detectable
   dialogue, hanging the whole indexing job. Found by a test timing out.
2. **`split` on a dialogue group silently did nothing** — its SQL bound
   `library_id` and `group_id` in swapped order.
3. **Every `comic_text` search raised `ProgrammingError`** — one placeholder
   too many parameters.
4. **Every image-scope dialogue run raised `ProgrammingError`** — `library_id`
   bound twice against a single-placeholder query.

## 6. Known gaps

- **No OCR.** *(Resolved in v10 — RapidOCR is now bundled and reads text.
  See §5.)* What remains: **Korean / vertical manhwa transcription is not
  covered by the bundled Chinese+English model**, and real-art ink accuracy is
  unvalidated.
- **Detection quality is unvalidated on real art.** The detector is a
  flat-colour heuristic tested on synthetic flat regions. Gradients, screentone
  and bright artwork will produce false positives; textured balloons will be
  missed. This needs a corpus.
- **Panel vector results are ranked within panels only.** Image and panel
  scores are never fused, because there is no defensible way to compare them.
  Hybrid and similar are refused for panel scope in the backend *and* hidden in
  the picker.
- **Preset switching does not re-embed anything.** Switching `comfy` → `comic`
  changes which stages default to selected on the next run; existing vectors are
  untouched until you re-run with the stage forced.
| Batch FK constraint | ✅ | `library_id` now selected in scan |
| Filename indexing (comic) | ✅ | 12 real naming styles |
| CJK filenames | ✅ | `第01話_復讐.webp` → `第01話 復讐` |
| Cropper integrity | ✅ | SHA256 `6A120FAF...` verified |
| Migration idempotency | ✅ | v2 embeddings rewrite crash recovery |
| Portable build + launch | ✅ | Double-click runs, no env vars |

## 3. Key Bugs Fixed (This Cycle)

| ID | Bug | Fix |
|----|-----|-----|
| 1 | Cropper registered 0 crops | Fixed column names in `register_panel_crops` |
| 2 | 1000+ images slow scroll | Added `idx_images_library_mtime` (64ms → 0.85ms) |
| 3 | Search shows "60 of -1" | Added `count_keyword` returning true total |
| 4 | Two-word search "doesn't work" | FTS5 AND semantics correct; empty state explains it |
| 4 | Scroll broken on Search | `.results` pane now flex column with virtual grid |
| 5 | Thumbnails never load | CSP `img-src http://asset.localhost` added |
| 6 | Preview/double-click backwards | Single→sidebar, double→full viewer |
| 7 | Panel cropper 0 crops | Fixed CSV column mapping |
| 8 | Batch recovery FK crash | `library_id` now selected in scan |
| 9 | Escape closes both dialogs | Dialog stack with top-only Escape |
| 10 | Run button re-enables mid-run | `useCropperLog` sets `running` on progress |
| 11 | Stale "Finished" in new run | `cropperLog.reset()` before start |
| 12 | Stale log on Search | `cropperLog.reset()` before `runSeparator` |
| 13 | `ModalityUnavailable` NameError | Moved to `model_runtime`, re-exported |
| 14 | SettingsScreen crashes on `null` status | Optional chaining + default status |
| 15 | Truncated zlib = "parsed" | `obj.eof` check added |
| 16 | Schema version drift | `CURRENT_SCHEMA_VERSION = max(_migrations())` |

## 7. Outstanding / Known Issues

| ID | Issue | Severity | Plan |
|----|-------|----------|------|
| 1 | `test_real_model.py` requires a manual model | Low | Optional CI |
| 2 | `test_scale_simulation.py` slow | Medium | Run nightly only |
| 3 | `adversarial` tests flaky | Low | Quarantine or fix |
| 4 | **Dialogue text is never read** — no OCR engine is bundled | **High** | `ocr_status` and the `dialogue.ocr` preset flag are in place for when one is added |
| 5 | **Detection quality unvalidated on real comic art** | **High** | Needs a real corpus; the detector is a flat-colour heuristic |
| 6 | Preset switching does not re-embed existing vectors | Low | By design; stated in the UI hint |
| 7 | Panel/image scores are never fused | Low | By design; hybrid and similar are refused for panel scope |
| 8 | `batch_recovery.py` uses the deprecated `datetime.utcnow()` | Low | Cosmetic; 79 warnings in the suite, all from this |

## 7. Performance Baselines (12k catalog)

| Operation | Time |
|-----------|------|
| `browse` limit=120 | 7 ms |
| `browse` limit=500 | 11 ms |
| `browse` offset=11000 | 20 ms |
| `search_keyword` limit=60 | 5 ms |
| `count_keyword` | 5 ms |
| Payload (120 rows) | 68 KB JSON |
| Payload (500 rows) | 284 KB JSON |
| Thumbnail page (120 images) | ~120 HTTP requests |

Not re-measured this session. `dialogue_list` is the new slow path: it runs a
`GROUP BY` over `panel_text_units`, which is why it is in `SLOW_METHODS` in
`src-tauri/src/lib.rs` — omitting it would make the supervisor abandon the
request at 60s while the worker kept scanning.

## 8. Portable Build Artifact

| Artifact | Size |
|----------|------|
| `ComfyPanelStudio-Portable.zip` | ~400 MB (rebuilt each session; size varies with the model folder) |

## 9. Sign-off

```
Verified by: ________________
Date: ________________
Build: (schema v12 · 916 passed, 16 skipped, 932 collected · 0 lint errors · cargo check clean)
```