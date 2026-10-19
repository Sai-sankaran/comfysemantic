# ComfyPanel Studio — Backend Logic Contracts

This document describes the stable backend RPC interfaces and data contracts for the frontend. It is the authoritative reference for frontend integration.

---

## 1. Gallery / Browse

### `browse` RPC

**Request**:
```typescript
{
  library_id?: string,      // Library to browse, or all if omitted
  limit?: number,           // Page size (default: 200)
  offset?: number,          // Pagination offset (default: 0)
  sort?: 'mtime_desc' | 'mtime_asc' | 'name' | 'size_desc',  // Default: 'mtime_desc'
  filters?: CatalogFilters  // Optional filters
}
```

**Response**:
```typescript
{
  items: ImageRecord[],     // Page of results
  count: number,            // Items in this page (== items.length)
  total: number             // Total matching records (for pagination UI)
}
```

**ImageRecord**:
```typescript
{
  id: string,
  canonical_path: string,
  filename: string,
  thumbnail_path: string | null,
  width: number | null,
  height: number | null,
  modality: string,
  metadata_status: string,
  embedding_status: string,
  image_embedding_status: string,
  positive_prompt: string | null,
  negative_prompt: string | null,
  checkpoint: string | null,
  sampler: string | null,
  seed: number | null,
  completeness_state: string | null,
  match_mode: string,       // 'browse' for this endpoint
  score: null
}
```

**Contract Guarantees**:
- Results ordered by `sort` parameter (stable tie-breaker: `id`)
- `total` reflects all matching records with current filters
- `missing=1` records excluded
- Filters applied consistently between `items` and `total` queries
- No arbitrary sampling or truncation beyond `limit`/`offset`

### `search` RPC

**Request**:
```typescript
{
  mode: 'keyword' | 'semantic' | 'visual' | 'similar' | 'hybrid' | 'comic_text',
  query?: string,
  limit?: number,           // Default: 60
  offset?: number,          // Default: 0
  library_id?: string,
  image_id?: string,        // Required for 'similar' mode
  vector_mode?: 'semantic' | 'visual',  // For 'hybrid' mode
  filters?: CatalogFilters,
  unit_scope?: 'image' | 'panel',       // Default: 'image'
  sources?: string[]        // For keyword: ['prompt','metadata','file','ocr','batch']
}
```

**Response**:
```typescript
{
  items: (ImageRecord | PanelResult)[],
  count: number,
  mode: string,
  unit_scope: 'image' | 'panel',
  total: number             // -1 for vector modes (unknown without full scan)
}
```

**Contract Guarantees (keyword mode)**:
- `total` describes the same source-scoped, de-duplicated set as `items`: the
  count and the result query share one source-spec table and one predicate, and
  the count is a SQL `UNION` (not `UNION ALL`) so a row matching several selected
  sources is counted once. A source-scoped search can no longer return items
  while reporting `total` 0.
- `ocr` reads the image-scope dialogue index (`comic_text_fts.unit_kind='image'`),
  which is rebuilt from `panel_text_units` after OCR and after a manual
  correction, so extracted and hand-corrected dialogue is searchable.
- Metadata (`image_metadata`) filters apply to every selected source; a metadata
  filter cannot silently drop `ocr` / `batch` hits.

**Contract Guarantees (`comic_text` mode)**:
- Image scope reads the page's exact-text entry, rebuilt from `panel_text_units`
  after OCR and after a manual correction (see §4), so extracted and
  hand-corrected dialogue is searchable.
- Panel scope reads the panel's exact-text entry: the page's filename + parent
  prompt **plus** the dialogue read from the panel's own regions.
- A panel whose crop file or parent page is gone is excluded from panel-scope
  results (it is not an indexable panel), and the exclusion is applied in the
  ranking query so it cannot consume a `LIMIT`/`OFFSET` slot.

---

## 2. Library Identity & Scan Scope

### `register_library` RPC

**Request**:
```typescript
{
  root_path: string,        // User-selected folder (validated as existing directory)
  name?: string             // Optional display name
}
```

**Response**:
```typescript
{
  library: LibraryRecord,
  note: "registered; indexing must be started explicitly"
}
```

### `list_libraries` RPC

**Response**:
```typescript
{
  libraries: LibraryRecord[]
}
```

**LibraryRecord**:
```typescript
{
  id: string,
  name: string,
  root_path: string,
  created_at: string,
  last_scanned_at: string | null,
  total_files: number,
  missing_files: number,
  image_embeddings: number,
  active_preset_id: string | null
}
```

### `start_indexing` RPC

**Request**:
```typescript
{
  library_root: string,     // Scan scope: MUST be within the library's registered root_path
  library_id?: string,      // Default: 'default'
  stages?: string[],        // Default: DEFAULT_STAGES
  profile?: 'low_impact' | 'balanced' | 'high_throughput',
  batch_size?: number,
  resume_job_id?: string,
  force_stages?: string[],
  skip_completed?: boolean  // Default: true
}
```

**Response** (success):
```typescript
{
  status: 'started',
  library_root: string,
  profile: string,
  stages: string[]
}
```

**Response** (preflight blocked):
```typescript
{
  ok: false,
  status: 'preflight_blocked',
  library_id: string,
  requested_stages: string[],
  image_record_count: number,
  eligible_image_count: number,
  missing_prerequisites: Array<{
    stage: string,
    requires: string,
    reason: string
  }>,
  message: string,
  hint: string
}
```

**Validation Rules (Backend Enforced)**:
1. `library_root` must exist and be a directory
2. `library_root` must be within the registered library's `root_path` (canonical path comparison)
3. Windows path casing and separator differences normalized
4. Parent traversal (`..`) and path escape attempts rejected
5. Symlinks/junctions resolved before validation
6. If `library_id` provided, `library_root` must be within that library's registered root

**Scope containment during the walk**: directory symlinks are not followed, and
the discovery stage additionally checks every candidate file (and every directory
before descending) against the resolved scan root. A file symlink or a Windows
junction whose real target is outside the library is skipped rather than indexed;
one that points back inside is allowed and de-duplicated by real path. A junction
that resolves to an already-visited directory (a cycle) is not re-descended.

**Terminal job status** (surfaced in the `indexing_finished` payload and the
`indexing_jobs.status` column): `completed` only when every requested stage ran
to the end; `failed` when a stage crashed (the stage row is also `failed` and a
`job_errors` row is written); `cancelled` when the job was stopped. Only a
`completed` job advances `libraries.last_scanned_at`.

### `index_preflight` RPC

**Request**:
```typescript
{
  library_id?: string,
  stages?: string[]
}
```

**Response**: Same as preflight-blocked response above, with `ok: true` when all prerequisites met.

---

## 3. Folder-Scoped OCR

### `start_folder_ocr` RPC (implemented)

**Request**:
```typescript
{
  library_id: string,
  folder_paths: string[],   // Each must be within library's root_path
                            // (`folder_path` as a single string is also accepted)
  stages?: string[],        // Default: ['dialogue'] — OCR + grouping
  profile?: 'low_impact' | 'balanced' | 'high_throughput'  // Default: 'balanced'
}
```

**Response** (on scheduling):
```typescript
{
  status: 'started',
  job_id: string,
  library_id: string,
  folders: string[],        // Validated, overlap-deduplicated folders that will run
  stages: string[],
  scopes: string[],         // Dialogue scopes from the library preset ('image'/'panel')
  profile: string,
  note?: string,
  reason?: string           // Present only when a job for the SAME scope is already running
}
```

**Job Events** (via `indexing_progress`): the standard progress event, with
`stage: 'dialogue'`.

**Completion Event** (`indexing_finished`):
```typescript
{
  job_id: string,
  status: 'completed',
  library_id: string,
  folders: string[],
  processed: number
}
```

**Failure Event** (`indexing_error`): `{ error: string }`; the job row is set to
`status='failed'`.

**Behavioral Guarantees**:
- Only processes images within `folder_paths` (recursive)
- Validates each folder exists, is a directory, and is within the library's
  registered `root_path` (resolved, so `..` traversal and symlink escapes fail)
- Overlapping selections are deduplicated to the covering ancestor (a parent
  already covers its descendants recursively, so the same page is not processed
  twice)
- Re-issuing a request for the same folder set while that job is still running
  returns the running job instead of scheduling a duplicate
- Idempotent: pages whose `dialogue_status`/`dialogue_grouping_status` is no
  longer `not_run` are skipped, so re-running does not reprocess completed pages
- Preserves `text_source='manual'` records — never overwritten
- Preserves `reviewed=1` flag
- Runs on a dedicated engine, so it does not disturb an in-flight full-index job
  and releases its catalog connection when done
- Cancellation/maintenance: `reset_database`/`restore_database` stop and join the
  folder-OCR engine and thread before touching the catalog

**Not yet implemented**: `force` (reprocess regardless of status) and per-folder
`results[]` accounting in the completion event; the event reports an aggregate
`processed` count.

### `dialogue_list` RPC

**Request**:
```typescript
{
  library_id?: string,
  group_id?: string,
  scope?: 'image' | 'panel',
  reviewed?: boolean,       // Omit for no filter; false = not yet reviewed
  limit?: number,           // Default: 100, max: 500
  offset?: number           // Default: 0
}
```

**Response**:
```typescript
{
  units: DialogueUnit[],
  total: number,
  groups: DialogueGroupSummary[]
}
```

**DialogueUnit** (with effective ink):
```typescript
{
  id: string,
  library_id: string,
  source_image_id: string | null,
  panel_crop_id: string | null,
  scope: 'image' | 'panel',
  unit_index: number,
  x: number | null, y: number | null, width: number | null, height: number | null,
  color_signature: string | null,
  color_bucket: string | null,
  group_id: string | null,
  group_confidence: number,
  grouping_method: string,
  text: string,
  text_source: 'none' | 'ocr' | 'manual',
  ocr_status: string,
  confidence: number,
  extractor_version: string,
  status: string,
  last_error: string | null,
  created_at: string,
  updated_at: string,
  // v12+ provenance:
  machine_text: string | null,      // Original OCR transcript
  ink_source: 'machine' | 'approved' | 'manual',
  ink_user_rgb: string | null,
  ink_user_category: string | null,
  ink_user_at: string | null,
  reviewed: 0 | 1,
  reviewed_at: string | null,
  reattachment: 'unmatched' | 'ambiguous' | null,
  // Derived for UI:
  effective_ink_rgb: string | null,
  effective_ink_category: string,
  effective_ink_source: string
}
```

---

## 4. Review Operations

### `dialogue_set_text` RPC

**Request**:
```typescript
{
  library_id: string,
  unit_id: string,
  text: string
}
```

**Response**:
```typescript
{
  status: 'ok',
  action: 'set_text',
  text: string,
  machine_text: string | null    // Captured original transcript
}
```

**Guarantees**:
- On first manual edit: `machine_text` set to current `text` (the OCR transcript)
- Subsequent edits: `machine_text` unchanged
- `text_source` set to `'manual'`
- `confidence` set to `1.0`
- `updated_at` set to now
- The corrected text replaces the machine words in the image-scope dialogue
  index (`comic_text_fts`) and in `image_metadata.dialogue_text`, in the same
  write, so a correction is searchable immediately and the replaced text is not

### `dialogue_set_text` indexing note

For an image-scope unit the write also refreshes that page's exact-text index
entry (`refresh_image_dialogue_index`): the page's `comic_text_fts`
`unit_kind='image'` row and `image_metadata.dialogue_text` are rebuilt from the
page's image-scope units, delete-then-insert. For a panel-scope unit the
equivalent `refresh_panel_dialogue_index` rebuilds the panel's
`unit_kind='panel'` row from the page's filename + parent prompt **plus** the
panel's own dialogue units (whole rebuild, so the page words are never dropped).
A search therefore reflects the correction at once, and the machine words that
were replaced stop matching.

### `dialogue_set_ink` RPC

**Request**:
```typescript
{
  library_id: string,
  unit_id: string,
  ink_action: 'approve' | 'manual' | 'unknown' | 'reset',
  rgb?: string                // Required for 'manual', must match '#RRGGBB'
}
```

**Response**:
```typescript
{ status: 'ok', action: 'ink_approve' | 'ink_manual' | 'ink_unknown' | 'ink_reset' }
```

**Guarantees**:
- `approve`: Confirms measured ink; refused if measurement unreliable (unknown/mixed)
- `manual`: Stores chosen colour in `ink_user_*` alongside measurement
- `unknown`: Clears user colour, reverts to machine measurement (rendered as unknown)
- `reset`: Same as `unknown`
- Measured `ink_rgb`/`ink_category` never overwritten

### `dialogue_set_reviewed` RPC

**Request**:
```typescript
{
  library_id: string,
  unit_id: string,
  reviewed: boolean
}
```

**Response**:
```typescript
{ status: 'ok', action: 'set_reviewed', reviewed: boolean }
```

**Guarantees**:
- Sets `reviewed` flag and `reviewed_at` timestamp
- Independent of text/ink corrections

### `dialogue_set_group` RPC

**Request**:
```typescript
{
  library_id: string,
  action: 'accept' | 'split' | 'merge' | 'set_text',
  group_id?: string,
  merge_from?: string[],
  unit_id?: string,        // For 'set_text'
  text?: string            // For 'set_text'
}
```

**Response**:
```typescript
{ status: 'ok', action: string }
```

**Guarantees**:
- Manual grouping (`grouping_method='manual'`, `group_confidence=1.0`)
- `set_text` delegates to `dialogue_set_text` logic
- Manual text/ink/group never overwritten by re-indexing

---

## 5. Cross-Page Navigation (implemented)

### `get_adjacent_image` RPC

**Request**:
```typescript
{
  library_id: string,
  current_image_id: string,
  direction: 'prev' | 'next',
  filters?: CatalogFilters,
  sort?: 'mtime_desc' | 'mtime_asc' | 'name' | 'size_desc'
}
```

**Response**:
```typescript
{
  image: ImageRecord | null,    // Null if at beginning/end
  at_boundary: boolean          // True if no adjacent record exists
}
```

**Contract Guarantees**:
- Uses same filter/sort as gallery browse
- Stable ordering with `id` tie-breaker
- Skips `missing=1` records
- Returns `null` at boundaries (not an error)
- Consistent with gallery data at time of request
- Note: the gallery's client-side filename substring box is **not** part of the
  backend filter set, so cross-page `prev`/`next` follows the backend filters
  only. Within a loaded page the client box still applies.

---

## 6. Processing Status & Errors

### `indexing_status` RPC

**Response**:
```typescript
{
  running: boolean,
  job_id: string | null,
  paused: boolean,
  profile: string,
  counters: Record<string, number>,
  jobs: JobSummary[]
}
```

### `embedding_status` RPC

**Response**:
```typescript
{
  provider_ready: boolean,
  runtime_status: string,
  dimension: number | null,
  config_hash: string | null,
  pending: Record<string, number>,     // Per modality totals
  libraries: LibraryPending[],
  modalities: string[],
  indexing: { running: boolean, paused: boolean, job_id: string | null }
}
```

---

## 7. Error Responses

All RPCs return errors in standard format:
```typescript
{ error: string }    // e.g., "ValueError: library_root must be within registered library root"
```

Common error types:
- `ValueError` — Invalid parameters, validation failures
- `KeyError` — Unknown library/image/unit ID
- `RuntimeError` — Job already running, invalid state
- `ModalityUnavailable` — Required model/runtime not available
- `ModelRuntimeError` — Model startup/validation failures

**Malformed frames are answered, never fatal.** A line that is valid JSON but
not an object (a number, string, list or `null`) gets
`{ id: null, error: "request must be a JSON object" }`, and `params` that is not
an object is rejected with `{ id, error: "params must be a JSON object" }`.
Invalid JSON gets `{ id: null, error: "invalid JSON: ..." }`. In every case the
worker keeps running; a malformed frame is never allowed to terminate the stdio
loop.

---

## 8. CatalogFilters Type

```typescript
type CatalogFilters = {
  kinds?: string[],              // 'comfy' | 'normal'
  checkpoints?: string[],
  samplers?: string[],
  loras?: string[],
  schedulers?: string[],
  seed?: number,
  min_seed?: number, max_seed?: number,
  steps?: number,
  min_steps?: number, max_steps?: number,
  cfg?: number,
  min_cfg?: number, max_cfg?: number,
  denoise?: number,
  min_denoise?: number, max_denoise?: number,
  min_width?: number, max_width?: number,
  min_height?: number, max_height?: number,
  extensions?: string[],
  formats?: string[],
  ocr_status?: string[],
  has_ocr?: boolean,
  dialogue_status?: string[],
  ink_category?: string[],
  attribution_state?: string[]
}
```

---

## 9. Implementation Status

| Interface | Status | Notes |
|-----------|--------|-------|
| `browse` | ✅ Implemented | Pagination, filters, total count |
| `search` | ✅ Implemented | All modes; multi-source keyword `total` is source-aware and de-duplicated |
| `register_library` | ✅ Implemented | Path validation, no auto-index |
| `list_libraries` | ✅ Implemented | With counts |
| `start_indexing` | ✅ Implemented | Preflight, folder scope validation |
| `index_preflight` | ✅ Implemented | Prerequisite checking |
| `start_folder_ocr` | ✅ Implemented | Validates scope, dedupes overlap, executes dialogue with folder filter; extracted text indexed for image and panel scope |
| `dialogue_list` | ✅ Implemented | Pagination, grouping, effective ink |
| `dialogue_set_text` | ✅ Implemented | Machine text preservation; correction made searchable (image and panel scope) |
| `dialogue_set_ink` | ✅ Implemented | Provenance-preserving |
| `dialogue_set_reviewed` | ✅ Implemented | Simple flag |
| `dialogue_set_group` | ✅ Implemented | Accept/split/merge/set_text |
| `get_adjacent_image` | ✅ Implemented | Cross-page prev/next with stable tie-breaker |
| `indexing_status` | ✅ Implemented | Job tracking |
| `embedding_status` | ✅ Implemented | Per-library pending counts |

**Stage-consistency guarantee** (metadata → FTS): re-deriving metadata marks the
affected rows `fts_status='pending'` (the same dirty signal discovery uses when a
file changes), because `image_fts` is built from metadata columns. A metadata-only
run therefore never leaves the index claiming to be `ready` over stale data; the
`fts` stage re-indexes the rows in the same job when selected, otherwise the next
run. The dialogue stage is skippable, counted by the same predicate it processes
(`not_run` marker + no units), per `ARCHITECTURE.md`.

---

## 10. Frontend Coordination Notes

- **Claude** owns: Screen layouts, dialogs, component styling, visual presentation, UX flows
- **This agent** owns: RPC contracts, database correctness, job scheduling, data integrity
- **Shared files**: `LibraryScreen.tsx`, `IndexingScreen.tsx` — coordinate changes
- **Do not modify**: Visual design, screen layouts, component presentation
- **Do modify**: RPC calls, data flow logic, state management for backend contracts