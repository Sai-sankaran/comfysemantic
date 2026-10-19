# Implementation Plan — ComfyPanel Studio

## 1. Project Overview & Vision
ComfyPanel Studio is a local-first Windows desktop application that combines:
1. Fast, searchable local image library for 12,000+ ComfyUI images.
2. ComfyUI metadata archive extracting positive/negative prompts, checkpoints, LoRAs, seeds, samplers, schedulers, steps, CFG, denoise, dimensions, and preserving raw workflow JSON graphs.
3. Local semantic text search powered by a user-supplied GGUF embedding model running via `llama-server`.
4. Panel Studio dedicated workspace integrating the exact, preserved `panel_folder_cropper_v11.py` script.
10. SQLite catalog with FTS5 exact search, binary vector cosine similarity ranking, and a persistent, resumable multi-stage indexing engine (Discovery, Metadata, Thumbnail, FTS, Semantic Embedding, Finalization).
11. **Comic/Manhwa support**: filename-as-text indexing, dialogue *region detection* with colour grouping, dual-level page+panel indexing. Text inside a balloon is **not** read — no OCR engine is bundled.
12. Restrained monochrome, precise, dark/light visual design.

## 2. Strict Boundary Compliance
- Under NO circumstance will any image inside the user's `comfysamples` or supplied images folder be opened, inspected, decoded, parsed, embedded, or analyzed by Antigravity during development.
- All testing and validation are performed using synthetic fixtures:
  - Synthetic PNGs with standard ComfyUI chunk metadata (`prompt` and `workflow` text chunks).
  - Synthetic JPEG/WebP files with/without metadata.
  - Synthetic 12,000-record database simulation for catalog scalability, batching, pause/resume, and crash recovery.
  - A mock embedding provider for headless automated test suites, alongside a managed `llama-server` runner for user-configured GGUF models.

## 2. Strict Boundary Compliance
- Under NO circumstance will any image inside the user's `comfysamples` or supplied images folder be opened, inspected, decoded, parsed, embedded, or analyzed by Antigravity during development.
- All testing and validation are performed using synthetic fixtures:
  - Synthetic PNGs with standard ComfyUI chunk metadata (`prompt` and `workflow` text chunks).
  - Synthetic JPEG/WebP files with/without metadata.
  - Synthetic 12,000-record database simulation for catalog scalability, batching, pause/resume, and crash recovery.
  - A mock embedding provider for headless automated test suites, alongside a managed `llama-server` runner for user-configured GGUF models.

## 3. Technology Stack & Process Model
- **Desktop Application**: Tauri 2 (Rust supervision, IPC, permissions) + React 19 / Vite / TypeScript (strict mode) + Tailwind/CSS custom monochrome design system.
- **Backend Worker**: Persistent Python worker process supervised by Rust over bidirectional JSON Lines (JSON-RPC 2.0 style with correlated request IDs and streaming events).
- **Database**: SQLite 3 with WAL mode, FTS5 full-text search, binary float32 vector storage, persistent job and task queues.
- **Image Processing**: Pillow for format-aware decoding & thumbnails, OpenCV + NumPy for the v11 panel cropper and vector math.
- **Embedding Inference**: `llama-server` in `--embedding` mode managed by Python worker on `127.0.0.1`.

## 4. Work Breakdown & Milestones (Updated)

### Completed Milestones
- **Milestone 1**: Project foundation, docs, and environment verification (Cargo, Python venv, Node/npm).
- **Milestone 2**: Persistent Python backend worker with JSON Lines IPC, protocol handshake, SQLite catalog, FTS5, and schema migrations (v1–v8).
- **Milestone 3**: ComfyUI format-aware metadata extraction and thumbnail generation engine (tested purely on synthetic fixtures).
- **Milestone 4**: Resumable multi-stage indexing engine (Discovery, Metadata, Thumbnails, FTS, Embedding) with checkpointing, pause/resume, and 12,000 synthetic record scalability tests.
- **Milestone 5**: Local GGUF embedding model manager (`llama-server` supervisor, health checks, validation, mock provider, binary vector cosine similarity, hybrid search).
- **Milestone 6**: Panel Studio v11 adapter: unchanged invocation of `panel_folder_cropper_v11.py`, stdout parsing, folder safety, report linking.
- **Milestone 7**: Tauri 2 + React + TypeScript frontend with monochrome design system (Library, Detail Inspector, Search, Indexing Center, Panel Studio, Settings).
- **Milestone 8**: Full end-to-end integration, automated test suite execution, packaging readiness, and comprehensive verification report.

### Comic/Manhwa Milestones (v8 + v9)
> **Status note (v9).** Milestones 9-12 were partially present as scaffolding.
> Milestones 13-15 were documented as complete and were not: the v9 tables, the
> RPC handlers, the Rust allowlist entries and every UI control did not exist.
> See `docs/BUGS_AND_STATUS.md` phase 7 for the audit and the twelve defects it
> found.

- **Milestone 9 (v8)** ✅ — `indexing_presets` table, built-in `comfy`/`comic`/`comic+panels` presets, `images.source_category`, `indexing_jobs.config_json` snapshot.
  - ✅ *Added in v9:* `rpc_list_presets` / `rpc_set_library_preset` + `IndexingScreen` preset picker. Without these the preset was unreachable and `filename_in_semantic_text` was always false.
- **Milestone 10 (v8)** ✅ — `panel_crops` gains `library_id`, `panel_missing`, per-stage status columns, relative geometry, three indexes. `PANEL_STAGE_TO_COLUMN` isolated from `STAGE_TO_COLUMN`.
- **Milestone 11 (v8)** ✅ — `clean_filename_for_index` handles dots, underscores, hyphens, en/em dashes, plus, tilde, brackets, doubled extensions and CJK; `filename_in_semantic_text` preset flag.
- **Milestone 12 (v8)** ✅ — `panel_registration`, `panel_thumbnails`, `panel_fts` stages; `_indexable_panels_where` scopes to indexed parents only; `panel_fts` now writes real `comic_text_fts` rows.
  - ✅ *Added in v9:* `panel_text_embeddings` and `panel_image_embeddings` stages (were declared in `PANEL_STAGE_TO_COLUMN` with no implementation).
- **Milestone 13 (v9)** ✅ — **Migration v9**: `panel_text_units` and `comic_text_fts` created (both were documented as v8 but never existed); `embeddings.unit_kind` added and the `REFERENCES images(id)` FK dropped so panel vectors are storable; `unit_scope` in `search.py`; panel-shaped results carrying `parent_image_id` / `panel_number`; `PANEL_PARENT_DEMOTION = 0.85` with a 3× over-fetch so demotion does not starve recall.
- **Milestone 14 (v9)** ✅ — `backend/dialogue.py`: balloon detection by flatness + lightness (integral-image box mean), iterative flood-fill connected components, per-channel-median colour signatures, centred colour bucketing, cross-bucket merging by `_COLOR_TOLERANCE`. `dialogue` stage with image and panel scopes, status columns, and manual-row preservation.
  - ❌ **OCR is not implemented.** No engine is bundled; `text` is always empty. The UI states this on the Dialogue Review screen and in the `comic_text` help text rather than implying dialogue search works.
- **Milestone 15 (v9)** ✅ — Dialogue Review tab (`frontend/src/features/dialogue/DialogueReview.tsx`): group list with swatches, accept / split / merge, per-unit text entry, `grouping_method` and `group_confidence` shown. Manual text (`text_source='manual'`) survives re-detection.
  - ❌ **OCR backend (RapidOCR via onnxruntime)** is not implemented. `ocr_status` exists on every unit for when it is.

### Remaining work

- **OCR.** The single largest gap. Everything around it is in place — units,
  colour groups, review UI, a durable manual-text path, and a gated
  `dialogue.ocr` preset flag — so adding an engine is a new stage rather than a
  redesign.
- **Detection quality.** `backend/dialogue.py` is a flat-colour heuristic
  tested on synthetic flat regions. Real comic art has gradients, screentone and
  colour that will produce false positives. This needs a corpus.

## 5. Technology Stack & Process Model
- **Desktop Application**: Tauri 2 (Rust supervision, IPC, permissions) + React 19 / Vite / TypeScript (strict mode) + Tailwind/CSS custom monochrome design system.
- **Backend Worker**: Persistent Python worker process supervised by Rust over bidirectional JSON Lines (JSON-RPC 2.0 style with correlated request IDs and streaming events).
- **Database**: SQLite 3 with WAL mode, FTS5 full-text search, binary float32 vector storage, persistent job and task queues.
- **Image Processing**: Pillow for format-aware decoding & thumbnails, OpenCV + NumPy for the v11 panel cropper and vector math.
- **Embedding Inference**: `llama-server` in `--embedding` mode managed by Python worker on `127.0.0.1`.

## 6. Technology Stack & Process Model
- **Desktop Application**: Tauri 2 (Rust supervision, IPC, permissions) + React 19 / Vite / TypeScript (strict mode) + Tailwind/CSS custom monochrome design system.
- **Backend Worker**: Persistent Python worker process supervised by Rust over bidirectional JSON Lines (JSON-RPC 2.0 style with correlated request IDs and streaming events).
- **Database**: SQLite 3 with WAL mode, FTS5 full-text search, binary float32 vector storage, persistent job and task queues.
- **Image Processing**: Pillow for format-aware decoding & thumbnails, OpenCV + NumPy for the v11 panel cropper and vector math.
- **Embedding Inference**: `llama-server` in `--embedding` mode managed by Python worker on `127.0.0.1`.

## 7. Security & Integrity (Architecture-Level)
- **40-method allowlist** in Rust (`ALLOWED_METHODS`); any unknown method rejected.
- **Path traversal prevention** — `canonicalize()` + relative-to-root check in Rust (`allow_directory`) and Python (`_validate_path_within_roots`).
- **Cropper baseline verification** — SHA256 (`6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A`) verified before execution; modified detector never runs.
- **Embedding limits** — max file 50MB, max image 8192px / 50Mpx; zero-length vectors rejected.
- **Loopback-only model server** — `host=127.0.0.1`; never exposed to LAN.
- **CSP** — restrictive policy; `unsafe-eval` and external scripts blocked.
- **Transaction isolation** — SQLite WAL + per-thread transaction depth tracking prevents cross-thread deadlocks.
- **Worker supervision** — crash detection, graceful shutdown (`SIGTERM` → 20s grace → kill), restart backoff (`1200ms` → `30000ms` cap, max `10` restarts).
- **Migration safety** — every DDL step individually re-runnable; `v2` embeddings rewrite crash-recoverable; pre-migration backup via `VACUUM INTO` before destructive migration.