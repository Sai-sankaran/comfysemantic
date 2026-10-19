# Database Schema & Data Integrity — ComfyPanel Studio

## 1. Schema Versioning & Pragmas
- `PRAGMA foreign_keys = ON;`
- `PRAGMA journal_mode = WAL;`
- `PRAGMA synchronous = NORMAL;`
- `PRAGMA busy_timeout = 10000;`

**Current Schema Version: 15**

> **Correction (2026-10-16, Phase 1).** This document previously read "10". The
> code is the source of truth: `backend/database.py` derives
> `CURRENT_SCHEMA_VERSION = max(v for v, _fn, _d in _migrations())`, and
> `_migrations()` currently ends at v15. The Migration History table below has
> been extended to match. See `report.md` (R-7) for the audit that found this.

## 2. Tables

### `libraries`
- `id` TEXT PRIMARY KEY (UUID)
- `name` TEXT NOT NULL
- `root_path` TEXT NOT NULL UNIQUE
- `created_at` TEXT NOT NULL
- `last_scanned_at` TEXT
- `scan_options` TEXT (JSON: recursive, exclusions, etc.)
- `schema_version` INTEGER NOT NULL
- `active_preset_id` TEXT — FK to `indexing_presets.id` (v8+)
- `default_category` TEXT NOT NULL DEFAULT 'unclassified' (v8+)

### `images`
- `id` TEXT PRIMARY KEY (UUID)
- `library_id` TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE
- `canonical_path` TEXT NOT NULL UNIQUE
- `rel_path` TEXT NOT NULL
- `filename` TEXT NOT NULL
- `extension` TEXT NOT NULL
- `file_size` INTEGER NOT NULL
- `mtime` REAL NOT NULL
- `width` INTEGER
- `height` INTEGER
- `format` TEXT
- `discovery_status` TEXT NOT NULL DEFAULT 'discovered'
- `metadata_status` TEXT NOT NULL DEFAULT 'pending'  -- pending, parsed, partial, absent, malformed, error
- `thumbnail_status` TEXT NOT NULL DEFAULT 'pending' -- pending, ready, failed
- `fts_status` TEXT NOT NULL DEFAULT 'pending'       -- pending, ready, failed
- `embedding_status` TEXT NOT NULL DEFAULT 'pending' -- pending, ready, failed, stale
- `audio_embedding_status` TEXT NOT NULL DEFAULT 'pending' -- v2+
- `video_embedding_status` TEXT NOT NULL DEFAULT 'pending' -- v2+
- `thumbnail_path` TEXT
- `content_fingerprint` TEXT
- `last_error` TEXT
- `source_category` TEXT NOT NULL DEFAULT 'unclassified' (v8+) — 'comfy' | 'comic' | 'unclassified'
- `batch_fingerprint` TEXT — for batch prompt recovery (v6+)
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### `image_metadata` (Normalized Searchable Fields)
- `image_id` TEXT PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE
- `positive_prompt` TEXT
- `negative_prompt` TEXT
- `checkpoint` TEXT
- `loras` TEXT (JSON: array of {name, weight})
- `seed` INTEGER
- `sampler` TEXT
- `scheduler` TEXT
- `steps` INTEGER
- `cfg` REAL
- `denoise` REAL
- `extracted_width` INTEGER
- `extracted_height` INTEGER
- `workflow_nodes_summary` TEXT (JSON)
- `completeness_state` TEXT NOT NULL DEFAULT 'full'
- `prompt_candidates_json` TEXT (v7+) — batch prompt recovery
- `prompt_extraction_details_json` TEXT (v7+) — extraction diagnostics
- `dialogue_text` TEXT (v8+) — aggregated dialogue text from panels
- `dialogue_status` TEXT NOT NULL DEFAULT 'not_run' (v8+) — 'not_run', 'pending', 'ready', 'failed'

### `raw_metadata`
- `image_id` TEXT PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE
- `raw_prompt_json` TEXT      -- Unmodified execution graph
- `raw_workflow_json` TEXT    -- Unmodified UI editor graph
- `raw_other_metadata` TEXT  -- Any other EXIF/PNG info keys
- `is_compressed` INTEGER NOT NULL DEFAULT 0

### `image_fts` (Virtual FTS5 Table)
```sql
CREATE VIRTUAL TABLE image_fts USING fts5(
    image_id UNINDEXED,
    filename,
    positive_prompt,
    negative_prompt,
    checkpoint,
    loras,
    sampler,
    scheduler,
    tokenize='unicode61 remove_diacritics 2'
);
```
**Note:** `filename` is always included, so keyword search matches filenames regardless of preset.

### `comic_text_fts` (v8 declared, **v9 created**) — Comic Text Search
```sql
CREATE VIRTUAL TABLE comic_text_fts USING fts5(
    unit_kind UNINDEXED,   -- 'image' | 'panel'
    unit_id   UNINDEXED,
    library_id UNINDEXED,
    body,
    tokenize='unicode61 remove_diacritics 2'
);
```

> **Correction.** An earlier version of this document described this table and
> `panel_text_units` as if v8 had created them. It did not — no code created
> either table until v9. They are now real and covered by tests.

Populated by:
- `panel_fts` stage → one `unit_kind='panel'` row per crop (page filename words
  + page prompt).
- `finalization` → deletes rows whose parent image or panel is `missing`, so a
  search cannot return a hit that fails to hydrate.

**What is actually in `body` today:** filenames and prompts. With no OCR engine
bundled, the dialogue contribution is always empty. Searching this table for
words inside a balloon cannot work.

### `embeddings` (v9) — Generalized for Panels
```sql
CREATE TABLE embeddings (
    unit_kind  TEXT NOT NULL DEFAULT 'image',  -- 'image' | 'panel'
    media_id   TEXT NOT NULL,  -- images.id OR panel_crops.id
    modality   TEXT NOT NULL,
    config_hash TEXT NOT NULL,
    vector BLOB NOT NULL, dimension INTEGER NOT NULL,
    normalization TEXT NOT NULL,
    preprocessing_version TEXT NOT NULL,
    api_version TEXT NOT NULL,
    preprocess_detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    valid INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (unit_kind, media_id, modality, config_hash)
);
```
- `unit_kind='image'` references `images.id` (legacy default, backward compatible)
- `unit_kind='panel'` references `panel_crops.id`
- **There is deliberately no foreign key on `media_id`.** v2 had
  `REFERENCES images(id)`, which makes a panel vector impossible to store. v9
  is therefore the one destructive migration: it rebuilds the table without the
  FK and copies every existing row across as `unit_kind='image'`. This is
  verified by `test_embeddings_no_longer_fk_to_images`.
- `store_embedding(conn, media_id, modality, vector, config, unit_kind=...)`
  rejects any `unit_kind` other than `image`/`panel`.

### `embedding_configs`
- `config_hash` TEXT PRIMARY KEY
- `model_id` TEXT NOT NULL
- `dimension` INTEGER NOT NULL
- `normalization` TEXT NOT NULL
- `preprocessing_version` TEXT NOT NULL
- `api_version` TEXT NOT NULL
- `created_at` TEXT NOT NULL DEFAULT (datetime('now'))
- `is_active` INTEGER NOT NULL DEFAULT 0

### `indexing_jobs`
- `id` TEXT PRIMARY KEY (UUID)
- `library_id` TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE
- `job_type` TEXT NOT NULL
- `status` TEXT NOT NULL       -- idle, queued, running, pausing, paused, cancelling, cancelled, completed, failed
- `stage` TEXT NOT NULL        -- discovery, metadata, thumbnails, fts, embeddings, finalization, panel_registration, panel_thumbnails, panel_fts, panel_text_embeddings, panel_image_embeddings
- `total_files` INTEGER NOT NULL DEFAULT 0
- `processed_files` INTEGER NOT NULL DEFAULT 0
- `error_count` INTEGER NOT NULL DEFAULT 0
- `started_at` TEXT
- `finished_at` TEXT
- `checkpoint_data` TEXT (JSON)
- `preset_id` TEXT (v8+) — FK to `indexing_presets.id`
- `config_json` TEXT (v8+) — snapshot of preset config at job start

### `job_stages`
- `job_id` TEXT NOT NULL REFERENCES indexing_jobs(id) ON DELETE CASCADE
- `stage` TEXT NOT NULL
- `status` TEXT NOT NULL DEFAULT 'pending' -- pending, running, skipped, done, failed
- `processed` INTEGER NOT NULL DEFAULT 0
- `failed` INTEGER NOT NULL DEFAULT 0
- `started_at` TEXT
- `finished_at` TEXT
- `message` TEXT
- PRIMARY KEY (job_id, stage)

### `job_errors`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `job_id` TEXT REFERENCES indexing_jobs(id) ON DELETE CASCADE
- `media_id` TEXT
- `stage` TEXT NOT NULL
- `message` TEXT NOT NULL
- `detail` TEXT
- `attempts` INTEGER NOT NULL DEFAULT 1
- `resolved` INTEGER NOT NULL DEFAULT 0
- `created_at` TEXT NOT NULL DEFAULT (datetime('now'))

### `panel_crops` (v8+)
- `id` TEXT PRIMARY KEY (UUID)
- `source_image_id` TEXT REFERENCES images(id) ON DELETE SET NULL
- `source_file` TEXT NOT NULL
- `crop_path` TEXT NOT NULL
- `global_panel_number` INTEGER
- `source_panel_order` INTEGER
- `detection_method` TEXT
- `x` INTEGER
- `y` INTEGER
- `width` INTEGER
- `height` INTEGER
- `thumbnail_path` TEXT
- `source_width` INTEGER (v8+)
- `source_height` INTEGER (v8+)
- `relative_x` REAL (v8+)
- `relative_y` REAL (v8+)
- `relative_width` REAL (v8+)
- `relative_height` REAL (v8+)
- `panel_preset_id` TEXT (v8+) — preset used for this crop
- `last_error` TEXT (v8+)
- `panel_metadata_status` TEXT NOT NULL DEFAULT 'pending' (v8+)
- `panel_thumbnail_status` TEXT NOT NULL DEFAULT 'pending' (v8+)
- `panel_fts_status` TEXT NOT NULL DEFAULT 'pending' (v8+)
- `panel_embedding_status` TEXT NOT NULL DEFAULT 'pending' (v8+)
- `panel_image_embedding_status` TEXT NOT NULL DEFAULT 'pending' (v8+)
- `panel_missing` INTEGER NOT NULL DEFAULT 0 (v8+)
- `library_id` TEXT (v8+) — denormalised from source_image_id for fast scoping
- `updated_at` TEXT NOT NULL DEFAULT (datetime('now')) (v8+)
- `created_at` TEXT NOT NULL

**Indexes:**
- `idx_panel_crops_library` ON panel_crops(library_id, panel_missing)
- `idx_panel_crops_stages` ON panel_crops(library_id, panel_metadata_status, panel_thumbnail_status, panel_fts_status, panel_embedding_status, panel_image_embedding_status)
- `idx_panel_crops_identity` UNIQUE ON panel_crops(source_image_id, source_panel_order, crop_path)

### `indexing_presets` (v8+)
- `id` TEXT PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE
- `builtin` INTEGER NOT NULL DEFAULT 0
- `description` TEXT
- `config_json` TEXT NOT NULL
- `created_at` TEXT NOT NULL DEFAULT (datetime('now'))
- `updated_at` TEXT NOT NULL DEFAULT (datetime('now'))

**Built-in Presets:**
| id | name | builtin | key config differences |
|---|---|---|---|
| `comfy` | ComfyUI | 1 | `panels.enabled=false`, `dialogue.enabled=false`, `filename_in_semantic_text=false` — **regression guard** |
| `comic` | Comic / Manhwa (page) | 1 | `source_category='comic'`, `filename_in_semantic_text=true`, `dialogue.enabled=true` (image scope) |
| `comic+panels` | Comic / Manhwa (page + panels) | 1 | `comic` + `panels.enabled=true` |

### `app_settings` (v15)
- `key` TEXT PRIMARY KEY
- `value_json` TEXT NOT NULL

Application-wide durable preferences, read/written through
`get_app_settings` / `set_app_settings` / `reset_app_settings`. Keys and their
validation live in `BackendWorker._APP_SETTING_RULES` (the single source of
truth): `thumb_fit` (`crop` | `contain` | `fill`), `ocr_overlays_visible`
(bool), `ocr_reading_order_labels` (bool), `theme`
(`dark` | `light` | `high-contrast`, default `dark`), `density`
(`compact` | `comfortable` | `spacious`, default `comfortable`) and
`text_scale` (integer percent 80–200 step 10, default `100`). An absent key is reported with
`explicit[key] = false`, distinguishing "never chosen" from "chosen the
default".

### `panel_text_units` (v8 declared, **v9 created**) — Dialogue Units
- `id` TEXT PRIMARY KEY (UUID)
- `library_id` TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE
- `source_image_id` TEXT REFERENCES images(id) ON DELETE CASCADE
- `panel_crop_id` TEXT REFERENCES panel_crops(id) ON DELETE CASCADE
- `scope` TEXT NOT NULL — 'image' | 'panel'
- `unit_index` INTEGER NOT NULL — 1-based reading order
- `x` INTEGER, `y` INTEGER, `width` INTEGER, `height` INTEGER — bbox in unit's pixels
- `color_signature` TEXT — '#RRGGBB' median interior colour
- `color_bucket` TEXT — quantised key, e.g. 'F0-F3-F7'
- `group_id` TEXT — NULL when grouping refused
- `group_confidence` REAL NOT NULL DEFAULT 0.0
- `grouping_method` TEXT — 'exact_color' | 'nearest_color' | 'manual' | 'unusable' | 'none'
- `text` TEXT NOT NULL DEFAULT ''
- `text_source` TEXT NOT NULL DEFAULT 'none' — 'ocr' | 'manual' | 'none'
- `ocr_status` TEXT NOT NULL DEFAULT 'not_run' — 'not_run' | 'ok' | 'unavailable' | 'error'
- `confidence` REAL NOT NULL DEFAULT 0.0
- `extractor_version` TEXT NOT NULL DEFAULT 'v1'
- `status` TEXT NOT NULL DEFAULT 'pending' — 'pending' | 'ready' | 'failed' | 'skipped'
- `last_error` TEXT
- `created_at` TEXT NOT NULL DEFAULT (datetime('now'))
- `updated_at` TEXT NOT NULL DEFAULT (datetime('now'))

**Constraint:** `CHECK ((source_image_id IS NULL) <> (panel_crop_id IS NULL))` and
`CHECK (scope IN ('image','panel'))`

### Ink colour and OCR columns (v10)

`color_signature` / `color_bucket` above are the **region fill** — the bubble
background the v9 detector found. They are unchanged and still correct. The
lettering colour is a *different* measurement and has its own columns, so no
existing row is reinterpreted:

| Column | Meaning |
|--------|---------|
| `ocr_box_json` | OCR quadrilateral in original-image coordinates (JSON) |
| `ink_rgb` | Measured lettering colour `'#RRGGBB'`, or NULL when undetermined |
| `ink_category` | `black\|white\|grey\|red\|orange\|yellow\|green\|cyan\|blue\|purple\|pink\|brown\|mixed\|unknown` |
| `ink_confidence` | 0..1. Below ~0.55 is a best-effort estimate, not a measurement |
| `ink_multi_colour` | 1 when two or more inks are present and were not separated |
| `ocr_engine` / `ocr_model` / `ocr_version` | Provenance of the transcript and colour |

All nullable/defaulted, so v9 databases upgrade in place and an un-analysed row
reads as `unknown` rather than as a wrong colour.

**Index:** `idx_ptu_ink ON panel_text_units(library_id, ink_category, group_id)`.

**`text` and `text_source`:** with RapidOCR bundled (v10), OCR-populated units
carry `text_source='ocr'` and real transcripts. A unit whose ink could not be
separated still keeps its transcript and reports `ink_category='unknown'` or
`'mixed'` — the text is never discarded because a colour was unmeasurable.
Text typed on the Dialogue Review screen is stored as `text_source='manual'`
and survives re-indexing (preserved across the stage's DELETE+reinsert).

**Indexes:**
- `idx_ptu_image` ON panel_text_units(source_image_id, unit_index)
- `idx_ptu_panel` ON panel_text_units(panel_crop_id, unit_index)
- `idx_ptu_group` ON panel_text_units(group_id)
- `idx_ptu_status` ON panel_text_units(library_id, status)

### `indexing_presets` (v8+)
- `id` TEXT PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE
- `builtin` INTEGER NOT NULL DEFAULT 0
- `description` TEXT
- `config_json` TEXT NOT NULL
- `created_at` TEXT NOT NULL DEFAULT (datetime('now'))
- `updated_at` TEXT NOT NULL DEFAULT (datetime('now'))

### `schema_version`
- `version` INTEGER PRIMARY KEY
- `applied_at` TEXT NOT NULL DEFAULT (datetime('now'))

---

## 3. Indexes

### `images`
- `idx_images_library` ON images(library_id)
- `idx_images_mtime` ON images(mtime)
- `idx_images_missing` ON images(library_id, missing)
- `idx_images_modality` ON images(library_id, modality) (v2+)
- `idx_images_stages` ON images(library_id, metadata_status, thumbnail_status, fts_status, embedding_status, image_embedding_status, audio_embedding_status, video_embedding_status)
- `idx_images_category` ON images(library_id, source_category) (v8+)
- `idx_images_batch_fingerprint` ON images(batch_fingerprint) (v6+)

### `panel_crops`
- `idx_panel_crops_source` ON panel_crops(source_image_id)
- `idx_panel_crops_library` ON panel_crops(library_id, panel_missing) (v8+)
- `idx_panel_crops_stages` ON panel_crops(library_id, panel_metadata_status, panel_thumbnail_status, panel_fts_status, panel_embedding_status, panel_image_embedding_status) (v8+)
- `idx_panel_crops_identity` UNIQUE ON panel_crops(source_image_id, source_panel_order, crop_path) (v8+)

### `image_fts`
- FTS5 internal indexes

### `comic_text_fts` (v8+)
- FTS5 internal indexes

### `embeddings` (v9+)
- `idx_embeddings_lookup` ON embeddings(modality, config_hash, valid)

### `job_stages`
- `idx_job_errors_open` ON job_errors(job_id, resolved)
- `idx_job_stages_status` ON job_stages(job_id, status)

### `libraries`
- `idx_images_category` ON images(library_id, source_category) (v8+)
- `idx_images_modality` ON images(library_id, modality) (v2+)

---

## 4. Migration History

| Version | Description | Destructive |
|---|---|---|
| 1 | Initial schema (v1) | No |
| 2 | Embeddings rewrite, configs, job stages, errors, modality, missing flag | Yes (embeddings rewrite) |
| 3 | Embedding config table | No |
| 4 | `prompt_extraction_details` column | No |
| 5 | Batch prompt recovery tables | No |
| 6 | `batch_fingerprint` column + index | No |
| 7 | Batch recovery metadata columns | No |
| 8 | Presets, categories, panel provenance, panel stage columns | No |
| 9 | `panel_text_units`, `comic_text_fts`, dialogue status columns, `embeddings.unit_kind` (FK dropped) | **Yes** (embeddings table rebuild) |
| 10 | Text-ink colour + OCR provenance columns on `panel_text_units` | No (additive) |
| 11 | FTS over recovered batch candidate text (`batch_prompt_fts`) | No (additive) |
| 12 | `machine_text` + ink/review provenance columns on `panel_text_units` | No (additive) |
| 13 | Reattachment state for unmatched manual edits | No (additive) |
| 14 | Machine vs reviewed prompt provenance | No (additive) |
| 15 | Canonical application-wide preferences (`app_settings`) | No (additive) |

**Current Version: 15**

### v9 in detail

`_migrate_to_v9` is the only migration after v2 that rewrites existing rows,
because dropping `embeddings`' foreign key requires rebuilding the table. It is
made safe by the same pattern v2 uses:

1. `VACUUM INTO` backup runs first (driven by the `destructive` flag in
   `_migrations()`).
2. The new table is created as `embeddings_v9`, rows are copied with
   `INSERT OR IGNORE ... SELECT`, and only then is the old table dropped and the
   new one renamed. A crash mid-swap leaves the original intact and the next
   open repeats the copy harmlessly.
3. Everything else in v9 (`panel_text_units`, `comic_text_fts`, the
   `dialogue_status` / `dialogue_grouping_status` columns) is additive and uses
   `CREATE ... IF NOT EXISTS` / `_add_column`, so it is independently re-runnable.

Verified by `tests/test_migration_safety.py` and
`tests/test_dialogue_extraction.py::test_v9_is_idempotent_on_reopen`.

---

## 5. Integrity Rules

- **FK cascade rules:** `images.library_id` → `libraries.id` CASCADE DELETE; `image_metadata.image_id` CASCADE DELETE; `raw_metadata.image_id` CASCADE DELETE; `image_fts` virtual table tied to `images`; `embeddings.media_id` references `images.id` (unit_kind='image') or `panel_crops.id` (unit_kind='panel'); `panel_crops.source_image_id` SET NULL on parent delete.
- **Unique constraints:** `libraries.root_path` UNIQUE; `images.canonical_path` UNIQUE; `embeddings` PK on `(unit_kind, media_id, modality, config_hash)`; `panel_crops.identity` UNIQUE on `(source_image_id, source_panel_order, crop_path)`.
- **Check constraints:** `panel_text_units` CHK exactly one of `source_image_id`/`panel_crop_id` set; `images.source_category` validated at app layer.
- **Triggers:** None (application-layer integrity).

---

## 6. Migration Safety Notes

- Every `ALTER TABLE ... ADD COLUMN` is wrapped in `_add_column()` which checks existence first — re-runnable.
- `schema_version` recorded with `INSERT OR IGNORE` so a crash after DDL but before version record doesn't brick on retry.
- v2 embeddings rewrite is the only destructive migration. Split into individually re-runnable steps; branches on what survived; backed up via `VACUUM INTO` before running.
- Pre-migration backup via `VACUUM INTO` before v2 (destructive).
- `init_database` is idempotent — safe to call repeatedly.
- All FKs enforced (`PRAGMA foreign_keys = ON`).