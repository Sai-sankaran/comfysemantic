# Packaging & Release (Windows)

## Overview

The application is a Tauri 2 shell (`src-tauri`) that launches a Python backend
worker (`python -m backend.worker`, JSON Lines over stdio). For distribution the
Python backend is **frozen with PyInstaller** and bundled as Tauri resources so
no system Python is required.

Resource tree bundled into the installer (`<install>/resources`):

```
resources/
  backend/           comfypanel-backend.exe + _internal/   (PyInstaller onedir)
  cropper/           comfypanel-cropper.exe + _internal/   (PyInstaller onedir)
  panel_folder_cropper_v11.py                              (preserved detector)
  runtime/llama.cpp/ llama-server.exe + *.dll              (embedding runtime)
```

At runtime the Rust supervisor sets `COMFYPANEL_RESOURCE_DIR` and
`COMFYPANEL_CROPPER_EXE`, and prefers `resources/backend/comfypanel-backend.exe`;
when that file is absent (development) it falls back to the virtualenv
interpreter running `-m backend.worker`.

## Prerequisites

- Python virtualenv at `.venv` with `PyInstaller`, `numpy`, `opencv-python`,
  `pillow`, `psutil`.
- Rust toolchain (`cargo`) on `PATH`.
- Tauri CLI (`tauri.cmd`, v2).
- The llama.cpp runtime available at `runtime/llama.cpp/llama-server.exe` with
  its DLLs.

## 1. Build the frozen backend + resources

From the repository root, using the virtualenv interpreter:

```powershell
.venv\Scripts\python.exe scripts\build_backend.py
```

This runs PyInstaller twice (worker and cropper) and assembles
`src-tauri/resources` (see `scripts/build_backend.py`). It overwrites any prior
`src-tauri/resources`. Output is ~280 MB on disk (mostly the cropper's OpenCV
bundle).

## 2. Build the installer

One command (does step 1 + the frontend build + the Tauri build):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_all.ps1
```

Or run the parts by hand:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
tauri.cmd build --bundles nsis
```

Artifacts:

- `src-tauri/target/release/app.exe` — the application binary.
- `src-tauri/target/release/bundle/nsis/comfypanel-studio_0.1.0_x64-setup.exe`
  — the installer (~80 MiB compressed).

`beforeBuildCommand` runs `npm run build` inside `frontend/` (TSC + Vite).

## 3. Portable ZIP Build

```powershell
scripts\build-portable.bat
```

Produces `ComfyPanelStudio-Portable.zip` (~380 MB) with the executable,
bundled resources, empty `data/`, `models/`, and an empty `libraries/` folder
structure. Extract anywhere and double-click `ComfyPanelStudio.exe` — no
environment variables or launcher required.

## 3. Silent install & smoke test

```powershell
$setup = "src-tauri\target\release\bundle\nsis\comfypanel-studio_0.1.0_x64-setup.exe"
Start-Process $setup -ArgumentList "/S","/D=C:\Temp\cpinstall" -Wait
Start-Process "C:\Temp\cpinstall\app.exe"
```

Expected observations:

- `<install>\resources\backend\comfypanel-backend.exe` and the other resources
  exist.
- A `comfypanel-backend.exe` child process appears, launched from the install
  directory.
- The window titled `ComfyPanelStudio` opens with no fatal-error screen.
- The embedding model starts on demand via the bundled
  `resources\runtime\llama.cpp\llama-server.exe` (resolved through
  `get_settings` → `server_exe`).

## 4. Artifact Checklist

| Artifact | Size | Notes |
|----------|------|-------|
| `src-tauri\target\release\app.exe` | ~10 MB | App binary |
| `src-tauri\target\release\bundle\nsis\...setup.exe` | ~80 MB | NSIS installer |
| `ComfyPanelStudio-Portable.zip` | ~380 MB | Portable build |

## 5. Notes

- Build outputs (`build/`, `src-tauri/resources/`, `src-tauri/target/`,
  `frontend/dist/`) are git-ignored and must be regenerated per release.
- The bundled installer is unsigned; SmartScreen may warn on first run.
- Only `llama-server.exe` and its `*.dll` are shipped from `runtime/llama.cpp`;
  the remainder of the llama.cpp toolkit is intentionally excluded.
- The cropper script `panel_folder_cropper_v11.py` is SHA256-verified
  (`6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A`)
  before every run — a modified detector will never execute.