# System Architecture — ComfyPanel Studio

## 1. Process Supervision & Boundaries
```
+-------------------------------------------------------------+
|                     React 19 UI (Vite)                      |
| (Monochrome design, Virtualized Grid, Detail Inspector,     |
|  Search Modes, Indexing Center, Panel Studio, Settings)     |
+-------------------------------------------------------------+
                               |
                      Tauri IPC Commands &
                      Streaming Listeners
                               |
+-------------------------------------------------------------+
|                      Tauri 2 (Rust)                         |
| - Native windowing & system dialogs                         |
| - Child Process Supervisor: launches & monitors Python      |
| - Bidirectional stdio communication (JSON Lines)            |
| - Protocol correlation (request ID -> response)             |
| - Crash detection, health checks & graceful shutdown        |
+-------------------------------------------------------------+
                               |
                     JSON Lines over Stdio
                     (stdout = protocol only,
                      stderr = diagnostic logs)
                               |
+-------------------------------------------------------------+
|                Persistent Python Worker                     |
| - Message dispatcher & protocol handler                     |
| - Database connection manager (SQLite WAL)                  |
| - Long-running job orchestrator (Worker threadpool)         |
| - Metadata parser & Pillow thumbnail generator              |
| - Embedding model supervisor (manages llama-server)         |
| - Panel Cropper v11 adapter                                 |
+-------------------------------------------------------------+
              |                                    |
              v                                    v
+------------------------+          +---------------------------+
|      SQLite 3 + WAL    |          | llama-server (llama.cpp)  |
| - Catalog & Metadata   |          | - Listens on 127.0.0.1   |
| - FTS5 Full-Text Index |          | - Embedding inference     |
| - Binary Vectors       |          | - Supervised by Python    |
| - Persistent Job State |          +---------------------------+
+------------------------+
```

## 2. Communication Protocol (JSON Lines)
- **Request from Rust to Python**:
  `{"id": "req-1", "method": "method_name", "params": {...}}\n`
- **Response from Python to Rust**:
  `{"id": "req-1", "result": {...}, "error": null}\n`
- **Streaming Event from Python to Rust**:
  `{"event": "indexing_progress", "data": {...}}\n`

Standard output is strictly reserved for JSON protocol lines. All logging from Python goes to `stderr` or rotating log files in `%LOCALAPPDATA%\ComfyPanelStudio\logs`.

## 3. Storage Hierarchy
- User App Data: `%LOCALAPPDATA%\ComfyPanelStudio\`
  - `libraries/`: SQLite databases (`<library_id>.db`)
  - `cache/`: Thumbnails (`<hash>.webp` or `.jpg`)
  - `logs/`: Diagnostic rotation logs
- Models Directory: `%USERPROFILE%\Documents\ComfyPanelStudio\models\`
  - User-supplied GGUF models reside here.
- Portable Mode Override: `<exe_folder>/data/` mirrors the above structure.

## 4. Database Schema Overview (v9)
See `docs/DATABASE_SCHEMA.md` for the full schema and the migration history.

Key tables:
- `libraries` — catalog roots, with `active_preset_id`, `default_category`
- `images` — catalog entries, with `source_category`, `batch_fingerprint`
- `image_metadata` — normalized searchable fields, with `dialogue_text`, `dialogue_status`
- `raw_metadata` — raw prompt/workflow JSON
- `image_fts` — FTS5 over filename, prompts, checkpoint, LoRAs, sampler, scheduler
- `comic_text_fts` (**v9**) — FTS5 over page and panel text
- `embeddings` (**v9**) — generalised with `unit_kind` + `media_id`; the FK to
  `images(id)` was dropped so a panel vector is storable at all
- `indexing_jobs` / `job_stages` / `job_errors` — job lifecycle; `indexing_jobs`
  carries `preset_id` and a `config_json` snapshot
- `panel_crops` — cropped panels with provenance, per-stage status columns, and
  `dialogue_grouping_status`
- `panel_text_units` (**v9**) — detected dialogue regions (image + panel scope)
- `indexing_presets` — `comfy`, `comic`, `comic+panels` built-ins

> v8 declared `comic_text_fts`, `panel_text_units` and `embeddings.unit_kind` in
> this document. None of the three existed in code. They are created by v9.

## 5. Indexing Pipeline

### Default Stages (ComfyUI)
```
discovery → metadata → thumbnails → fts → text_embeddings → image_embeddings → audio_embeddings → video_embeddings → finalization
```

### Comic Pipeline (v9)
```
discovery → metadata → thumbnails → fts → text_embeddings → image_embeddings
  → dialogue                      (comic, comic+panels)
  → panel_registration → panel_thumbnails → panel_fts
  → panel_text_embeddings → panel_image_embeddings   (comic+panels)
  → finalization
```

### Stage Dependencies (Enforced)
| Stage | Requires |
|-------|----------|
| `panel_thumbnails` | `thumbnails` |
| `panel_fts` | `panel_registration` |
| `panel_text_embeddings` | `panel_fts` |
| `panel_image_embeddings` | `panel_thumbnails` |

### Stage Execution Rules
- **Drop-not-add:** a panel stage whose prerequisite was not requested is skipped with a reason; never silently added.
- **Parent-first:** panel stages only process crops whose parent image is indexed (`thumbnail_status = 'ready'`).
- **Resume:** per-row status columns allow mid-pipeline restart.
- **Force reset:** clears the correct table (`images` vs `panel_crops`).
- **`dialogue` has no status column.** Its unit of work is "does this page already
  have units recorded", answered by `image_metadata.dialogue_status` /
  `panel_crops.dialogue_grouping_status` plus an `EXISTS` check. It must therefore
  be absent from `PANEL_STAGE_TO_COLUMN`, or pending-counting would query a column
  that does not exist. Completion is marked by the status column precisely so a
  page with *no* dialogue still terminates the loop.

## 6. Embedding System (v9)
- `embeddings` generalised with `unit_kind` ('image' | 'panel') + `media_id`.
  The FK to `images(id)` is gone — it made panel vectors unstorable.
- Same `config_hash` on both, so a model change invalidates images and panels alike.
- Panels get both text and image embeddings via `panel_text_embeddings` and
  `panel_image_embeddings`.
- **Search scope is explicit** (`UNIT_SCOPES`): a query ranks image vectors *or*
  panel vectors, never a mixture. `hybrid` and `similar` raise for panel scope
  because their score scales are not comparable across the two corpora.
- Sibling panels of one page are demoted (`PANEL_PARENT_DEMOTION = 0.85`) after a
  3× over-fetch, so demotion does not silently reduce recall. Demoted hits are
  labelled in the UI.

## 7. Preset System (v8, reachable in v9)
| Preset | Source Category | Filename in Semantic | Panels | Dialogue scopes |
|--------|-----------------|----------------------|--------|-----------------|
| `comfy` | `comfy` | No | Off | `[]` |
| `comic` | `comic` | Yes | Off | `["image"]` |
| `comic+panels` | `comic` | Yes | On | `["image","panel"]` |

- `images.source_category` defaults to `unclassified` (behaves as `comfy`)
- `libraries.active_preset_id` + `indexing_jobs.config_json` snapshot
- `IndexingScreen` preset picker (`rpc_list_presets` / `rpc_set_library_preset`)
  rewrites the stage selection. It does **not** start indexing or invalidate
  vectors — switching preset must never silently re-embed a library.

## 8. Dialogue Detection (`backend/dialogue.py`)
- Balloons are found by **flatness + lightness**, not saturation: comic balloons
  are white or cream, and a saturation test rejects almost all of them.
- Flatness = deviation from a box-filtered local mean (integral image), then
  iterative flood-fill connected components on the mask.
- Region flatness is checked **per channel** against that channel's regional
  median; comparing min/max across a pixel's channels measures saturation.
- Colour signature = per-channel regional median. Bucket width is
  `2 × _COLOR_TOLERANCE` and buckets are centred on multiples, so a
  within-tolerance pair cannot straddle an edge; buckets that still end up
  adjacent are merged by actual RGB distance (`nearest_color`, confidence 0.75).
- Singleton colours stay ungrouped (`unusable`) — a group of one reads as a
  confident speaker identification and carries no information.
- A page with genuinely no text and no bubbles is a **clean empty** result
  (`ready`, zero units), not an error.

### OCR + ink colour (v10)

Three independent stages; each can fail without blocking the next:

1. **Region detection** (this section) — supplementary evidence only.
2. **Recognition** (`backend/ocr.py`) — RapidOCR (ONNXRuntime, fully offline;
   13.7 MB of models bundled in the wheel). Returns a polygon, transcript and
   confidence per line. **Independent of stage 1** — text not inside a detected
   bubble is still read. A small `OcrProvider` interface allows a future
   recogniser, but no speculative model/config layer is built.
3. **Ink colour** (`backend/ink_color.py`) — measures the *lettering* colour
   from glyph pixels inside each OCR polygon. Region fill is never used as ink.

**Ink measurement.** Foreground = deviation from a **small**-window local mean,
minus any pixel matching the page background (the crop border defines the
background gamut). A large window, or ignoring enclosed background, makes an
outlined glyph report the page colour. Erosion strips the glyph outline;
per-channel deterministic 2-means (farthest-point init) finds the dominant ink,
and a second colour the background cannot explain makes the unit `mixed`.
Categorisation is by **CIELAB hue angle** — brown separated from orange by
lightness, dark navy kept blue — using *measured* anchors. Failure yields
`unknown`/`mixed`, never a fabricated colour.

**Grouping.** `ink_group_key` derives from colour + quantised Lab, not row order
or a uuid, so ids are stable across runs. Matching is perceptual (Lab), so
JPEG-like noise does not split a group. These are **text-colour groups, not
speaker identities.**

**Honesty rules.** OCR unavailable/error ⇒ `dialogue_status='failed'` + a
`job_errors` row, so a broken engine never looks like a clean scan. A genuinely
blank page is a clean empty (`ready`, zero units) — not an error, which would
flood the queue. `unknown`/`mixed` ink keeps the transcript rather than
discarding it. Manual text survives re-indexing.

## 9. Security & Integrity
- **44-method RPC allowlist** (`ALLOWED_METHODS`), including `list_presets`,
  `set_library_preset`, `dialogue_list`, `dialogue_set_group`
- `dialogue_list` is in `SLOW_METHODS`: it runs a `GROUP BY` over
  `panel_text_units`, and the supervisor would otherwise abandon it at 60s while
  the worker kept scanning
- **Path validation** — `canonicalize()` + relative-to-root in Rust & Python
- **Cropper integrity** — SHA256 (`6A120FAF...`) verified before exec
- **Embedding limits** — 50MB file, 8192px / 50Mpx, zero-length rejected
- **Loopback-only model server** — `127.0.0.1`
- **CSP** — `img-src 'self' data: blob: asset: http://asset.localhost`
- **Transaction isolation** — SQLite WAL + per-thread depth tracking
- **Worker supervision** — crash detection, graceful shutdown, restart backoff
- **Migration safety** — idempotent DDL, `VACUUM INTO` backup before the two
  destructive migrations (v2 and v9). v9 rebuilds `embeddings` without its FK and
  copies every row across as `unit_kind='image'`.
- **Dialogue unit scope is enforced by CHECK**, not by application discipline:
  exactly one of `source_image_id` / `panel_crop_id` must be set.

## 10. Portable Mode
- Detected structurally: `resources/backend/comfypanel-backend.exe` beside exe
- Anchors all writable paths on exe folder
- `COMFYPANEL_PORTABLE` env not required; double-click works