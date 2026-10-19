# Phase 1 · Increment 1 — RPC allowlist drift (defect R-1)

| | |
|---|---|
| **Date** | 2026-10-16 |
| **Phase** | 1 — Foundations and safety rails |
| **Increment** | 1 of N |
| **Defects** | R-1 (High, correctness) · R-4 (Medium, robustness) |
| **Status** | Implemented · regression-tested · checks run |
| **Authority** | `design.md` (normative), `implementation-roadmap.md` (order/gates), `agent.md` (continuous policy) |

## 1. Defect (R-1)

`frontend/src/features/library/LibraryScreen.tsx` steps the full-screen viewer
across the boundary of the currently-loaded page by calling
`api.getAdjacentImage(...)` → RPC method `get_adjacent_image`. The Rust shell
(`src-tauri/src/lib.rs`) gates every RPC through `ALLOWED_METHODS`
(`is_method_allowed`); the method was **not** in that list, so the shell rejected
the call **before the worker saw it**.

Result: within-page viewer stepping worked (it uses the in-memory `filtered`
list), but stepping past the loaded page failed and surfaced an error — a live
product bug. It was invisible to the Python suite because
`tests/test_cross_page_navigation.py` calls `SearchEngine.get_adjacent_image`
**directly**, bypassing the Rust gate. `docs/logic-audit.md` therefore recorded
the feature as "Fixed + tested".

`start_folder_ocr` was the second method declared in `frontend/src/api.ts` and
missing from the allowlist (unused by a component at the time, but reachable and
contract-documented in `docs/logic-contracts.md`).

## 2. Root cause

Two independently-maintained lists of the same surface with **no test between
them** (report R-4). The worker reflects on `rpc_<method>` and has no allowlist
of its own, so the only gate is the manually-curated Rust `ALLOWED_METHODS`;
nothing connected it to the frontend API surface.

## 3. Fix

### 3.1 `src-tauri/src/lib.rs`
Added two entries to `ALLOWED_METHODS` (now **52** methods):

```rust
    "get_image_detail",
    "get_adjacent_image",     // added
...
    "set_library_preset",
    "start_folder_ocr",       // added
```

Both methods already exist in the worker (`rpc_get_adjacent_image` at
`backend/worker.py:1549`, `rpc_start_folder_ocr` at `:1787`), are
contract-documented, and `start_folder_ocr` is scope-validated against the
registered library root — it grants no privilege beyond the already-allowlisted
`start_indexing`. Adding them restores the frontend contract without widening
privilege.

### 3.2 Cross-language parity guard — `tests/test_rpc_contract_drift.py`
The guard reads the Rust `ALLOWED_METHODS` **from source** (not from the worker)
precisely because the Python tests bypass the Rust gate — the false reassurance
that hid R-1:

- `_rust_allowed_methods()` — parses the `const ALLOWED_METHODS: &[&str]` block;
  a missing/renamed constant is a hard error, not an empty set.
- `_rpc_methods_in_api()` — balanced-angle scanner over the first string argument
  of every `call(...)` in `frontend/src/api.ts`; excludes `invoke(...)` Tauri
  commands (`rpc_call`, `allow_directory`).
- `_missing_from_allowlist()` — sorted set difference.
- `test_frontend_rpc_methods_are_admitted_by_the_shell` — the parity assertion.
- `test_rpc_method_extraction_finds_the_known_methods` — anti-vacuity: known
  methods must be found and Tauri commands must not be collected.
- `test_missing_method_detection_reports_every_gap` — proves the detector fires.

### 3.3 Frontend regression tests (new)
- `frontend/src/test/adjacentImage.test.ts` — pins the api layer: the RPC name,
  params (`libraryId`, `currentImageId`, `direction`, `sort`, `filters`), the
  default sort, and response passthrough.
- `frontend/src/test/libraryNavigation.test.tsx` — pins `LibraryScreen.navigateViewer`:
  within-page steps issue **no** RPC; a page-edge step issues `get_adjacent_image`
  with the exact params; a boundary response leaves the viewer unchanged; a
  rejection surfaces the error via `.notice`.

## 4. Verification (commands actually run)

| Check | Command | Result |
|---|---|---|
| Guard unit tests | `pytest tests/test_rpc_contract_drift.py -q -p no:randomly` | **5 passed** |
| Focused cross-layer | `pytest tests/test_rpc_contract_drift.py tests/test_worker_protocol.py tests/test_cross_page_navigation.py -q -p no:randomly` | **27 passed** |
| Full backend | `.venv\Scripts\python.exe -m pytest -q -p no:randomly` | **1108 passed, 18 skipped**, exit 0 (325s) |
| Guard demonstration | in-memory: parse allowlist (52) + api methods; simulate pre-fix list | `missing` = `[]`; pre-fix → `['get_adjacent_image']` |
| Rust compile | `cargo check` (in `src-tauri`) | **exit 0** (1 pre-existing warning: `mem::forget(job)` at `lib.rs:464`, unrelated) |
| Frontend build | `npm run build` (tsc -b + vite build) | OK (1953 modules) |
| Frontend lint | `npm run lint` | exit 0 (warnings pre-existing: `dist-harness/`, `IndexingScreen.tsx`) |
| Frontend tests | `npm run test` | **6 files, 126 tests passed**, exit 0 |
| Cropper integrity | `(Get-FileHash panel_folder_cropper_v11.py -Algorithm SHA256).Hash` | `6A120FAF…C62AD0A` (unchanged) |

## 5. Limitations (explicit)

- **The true Tauri boundary is not exercised.** There is no Rust unit test or
  frontend↔Tauri integration test that runs `is_method_allowed` end-to-end; the
  parity guard is a static/contract check plus frontend api-layer tests. Recorded
  as remaining Phase-1 work (`TST-01` exe-parity). The guard is nonetheless the
  mechanism that would have caught R-1 at build time.
- No packaged-exe verification was performed in this environment.

## 6. Repo integrity

- `panel_folder_cropper_v11.py` unchanged (hash above).
- Pre-existing user work preserved: the change to `frontend/src/api.ts`
  (declaring `start_folder_ocr`) and `frontend/src/features/library/LibraryScreen.tsx`
  were **left intact**; this increment only added to `ALLOWED_METHODS` and added
  tests.
- No commit/push performed.

## 7. Next
Increment 2 (documentation drift, defect R-7) completed in the same session; see
`docs/implementation-progress.md`. Next eligible Phase-1 work: design tokens
(themes) and appearance settings.
