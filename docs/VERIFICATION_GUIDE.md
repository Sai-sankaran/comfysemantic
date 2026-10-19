# Verification Guide — ComfyPanel Studio

## 1. Environment Checklist
- Windows 10/11
- Rust 1.90+ (edition 2024) — `rustup default stable`
- Node.js 20+ — `node -v`
- Python 3.11+ — `python --version`
- Tauri CLI v2 — `cargo install tauri-cli@2`
- WebView2 (usually present)
- GGUF embedding model + projector — place in `%USERPROFILE%\Documents\ComfyPanelStudio\models\`

## 2. Quick Setup
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt 2>$null || echo "Install manually: pillow numpy opencv-python"
npm --prefix frontend install
```

## 3. Build & Run
```powershell
# Development
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
tauri dev

# Production portable ZIP
scripts\build-portable.bat

# Installers
# src-tauri\target\release\bundle\msi\...
# src-tauri\target\release\bundle\nsis\...
```

## 4. Test Suite
```bash
# Full suite (excludes adversarial/performance/real-model)
pytest tests/ -q --ignore=tests/adversarial --ignore=tests/performance --ignore=tests/test_real_model.py

# Specific modules
pytest tests/test_filename_indexing.py -q
pytest tests/test_panel_stages.py -q
pytest tests/test_batch_recovery_fk.py -q
pytest tests/test_migration_safety.py -q

# Full suite
pytest tests/ -q --ignore=tests/adversarial --ignore=tests/performance --ignore=tests/test_real_model.py

# Linting
cd frontend && npm run lint
```

## 3. Manual Verification Checklist

### Backend
- [ ] `.\.venv\Scripts\python.exe -m pytest tests/ -q --ignore=tests/adversarial --ignore=tests/performance --ignore=tests/test_real_model.py` — all green
- [ ] `.\.venv\Scripts\python.exe scripts\verify_portable_rpc.py` — frozen backend RPC works
- [ ] `.\.venv\Scripts\python.exe scripts\verify_cropper_progress.py` — cropper progress stream
- [ ] `.\.venv\Scripts\python.exe scripts\verify_frozen_reaping.py` — orphan reaping
- [ ] `.\.venv\Scripts\python.exe scripts\check_sql_columns.py` — no schema drift
- [ ] `.\.venv\Scripts\python.exe scripts\verify_frozen_reaping.py` — orphan reaping

### Frontend
- [ ] `npm --prefix frontend run build` — `tsc -b && vite build` passes
- [ ] `npm --prefix frontend run lint` — oxlint 0 errors
- [ ] `tauri dev` — app launches, no console errors

### Portable Build
```powershell
scripts\build-portable.bat
```
- [ ] Produces `ComfyPanelStudio-Portable.zip`
- [ ] Extract anywhere, double-click `ComfyPanelStudio.exe` — launches
- [ ] Register a library, index, search — no errors
- [ ] Crop a panel, verify crops register and appear in search
- [ ] Switch to `comic` preset, re-index, verify filename in results
- [ ] Run `panel_registration` on a library with cropper output — honesty check passes

## 4. Functional Smoke Tests

### Library Management
- [ ] Add library via folder picker — catalog created, `catalog.db` appears
- [ ] Remove library — in-app dialog, catalog unregistered, source folder untouched

### Indexing
- [ ] Select library, pick stages, start — job starts
- [ ] Pause/resume/stop — job pauses, resumes, stops
- [ ] Skip completed — re-run skips completed stages
- [ ] Force stage — stage re-runs even if complete
- [ ] Preflight — selecting stages without discovery shows warning
- [ ] Resume after crash — job resumes from last committed item

### Search
- [ ] Keyword search — exact match over FTS5
- [ ] Semantic search — meaning-based ranking
- [ ] Visual search — image-content ranking
- [ ] Similar — image-to-image from result tile
- [ ] Hybrid — RRF fusion, correct `match_mode`
- [ ] Multi-word — AND semantics (all terms required)
- [ ] Pagination — "Load more" loads next page, shows total

### Panel Studio
- [ ] Source/output folders selected, nested guard (output inside source = blocked)
- [ ] v11 integrity badge — shows verified/modified/missing + SHA256
- [ ] Run cropper — progress events stream, thumbnails generated
- [ ] Crops appear in search — `unit_kind=panel`, `panel_number`, `crop_path` correct
- [ ] `panels.csv` / `processing_report.csv` / `contact_sheets/` / `detection_overlays/` / `panels/` created

### Batch Prompt Recovery
- [ ] Scan — finds generation groups
- [ ] Preview — shows proposed attributions
- [ ] Accept — promotes prompts, links to catalog, updates `batch_prompt_attribution`
- [ ] Review states — pending/accepted/rejected/manual tracked

### Portable Build
```powershell
scripts\build-portable.bat
```
- [ ] `ComfyPanelStudio-Portable.zip` created
- [ ] Extract anywhere, double-click `ComfyPanelStudio.exe` — launches
- [ ] `data/`, `models/`, `resources/` present
- [ ] Re-register library, re-index — works

### Batch Prompt Recovery
- [ ] Scan → Preview → Accept → Prompts promoted, catalog linked

## 4. Regression Checks
- [ ] Detector SHA256: `6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A` (verify with `Get-FileHash panel_folder_cropper_v11.py -Algorithm SHA256`)
- [ ] No `window.confirm` in `frontend/src`
- [ ] `npm run lint` — 0 errors
- [ ] `cargo check` — dev profile succeeds
- [ ] `npm run build` — `tsc -b && vite build` passes
- [ ] Full test suite: `pytest tests/ -q --ignore=tests/adversarial --ignore=tests/performance --ignore=tests/test_real_model.py` — 280+ passed

## 5. Known Acceptable Warnings
- `npm run lint`: oxlint warnings for Fast Refresh "only-export-components" on context hooks (React Compiler limitation) — acceptable
- `pytest`: pytest-asyncio deprecation warnings — acceptable
- `tsc -b`: unused variable warnings in generated code — acceptable

## 5. Sign-off
```
Verified by: ________________
Date: ________________
Build: ________________
```