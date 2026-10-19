# ComfyPanel Studio — Implementation Roadmap

| | |
|---|---|
| **Companion to** | `design.md` (v1.4, including Appendices D–J) |
| **Version** | 2.0 — phase order revised (Phase 1b, 5a/5b/5c, Expanded), appendix features scheduled, sizing/risk/dependency sections added |
| **Date** | 2026-10-17 |
| **Purpose** | Sequence implementation of the approved product specification without losing requirements or destabilising the existing app. |
| **Authority** | `design.md` is the normative source for product behaviour. This roadmap defines order, gates, and deliverables; it does not override the design. |

## How to use this roadmap

- Treat every requirement ID in `design.md` as a traceable acceptance criterion.
- Do not start a phase until its entry conditions are met.
- Do not remove or silently defer an existing capability. The old-to-new capability inventory in `design.md` §18 is the parity checklist.
- The app remains local-first and strictly read-only with respect to original media: no modification, move, rename, delete, replace, or overwrite. Exported crops/panels/images are new copies outside every registered library root and use collision-safe names.
- Use a strangler migration: the new shell and replacement screens coexist with the old app until each replacement passes its gate.
- Do not perform the real one-time catalog migration (Phase 6) until a verified backup exists and migration/rollback tests pass. Phase 1b only **rehearses** it on a copy.
- Keep the protected cropper script byte-identical. New cropper versions are separate files and must be registered with their version and parameters.
- Performance targets are hypotheses until measured on the target Ryzen 3 7320U machine. Record baseline and test methodology before tuning.
- **Two scope tiers.** *Core v1* is everything in Phases 0–7. *Expanded mode* (Phase X, `design.md` Appendix J) is built only after the Core stability gate and, for comic-text features, the OCR readiness gate. Expanded features stay behind `ui.expandedTools` (default off).
- **Scope control rule.** No feature enters Core v1 without a decision ID in `design.md` §2 and a statement of what it displaces if the schedule slips. The cut order for Expanded work is in `design.md` J.4.

## Phase 0 — Repository audit, baselines, and risk retirement

**Priority:** P0 — blocking foundation  
**Goal:** Establish what actually exists before implementation decisions depend on assumptions.

### Work
1. Audit the current repository, current database schema, data-directory rules, existing settings, Options screen, Batch Recovery, Panel Studio, OCR engine, model runtime, image-serving path, vector store and stage dependencies.
2. Record the old application’s capabilities against `design.md` §18. Every old capability must map to a new destination or be explicitly identified as a contradiction requiring owner resolution.
3. Produce `docs/audit.md` resolving each `VERIFY` item in `design.md` §21.2.
4. Capture cold-start and warm-start traces for both the executable and web development build. Identify what blocks first paint and why the executable reportedly freezes for over 30 seconds.
5. Record web/exe build identifiers, viewport, browser zoom, Windows scaling/device-pixel ratio, theme, density and text scale. Determine whether the mismatch comes from stale builds, zoom, platform branches or separately persisted state.
6. Establish repeatable screenshots for the existing viewport harness and collect the currently missing real-image gallery, inspector, viewer, Settings, Options, Batch Recovery and Panel Studio states where possible.
7. Verify the cropper’s actual outputs. Confirm whether it returns box coordinates, crop files, a manifest, or some combination. Define a deterministic page-to-output mapping before comic decomposition is built.
8. Baseline performance on the target budget machine and record RAM availability, cache behaviour, library size and model used. Validate configurable comic-slicing and duplicate-detection defaults against known fixtures; treat these values as starting heuristics, not as already-proven accuracy claims.

9. Resolve the new `VERIFY` items in `design.md` D.5: **A1** (do Alt-based shortcuts misbehave in the exe's WebView2 window?), **A5** (can thumbnails and metadata run without the Python worker?), **A6** (which ComfyUI chunks does the current parser store?).
10. Measure, on the budget machine, whether privacy blur holds budget B5 with blur on, and record the exact-scan time for 12,000 vectors and the thumbnail-encode throughput for WebP at quality 80. Record the numbers; do not tune yet.

### Deliverables
- `docs/audit.md`
- Existing-feature parity matrix linked to `design.md` §18
- Startup trace and a documented root cause (or a bounded list of remaining hypotheses with next measurements)
- Web/exe parity baseline and viewport screenshot set
- Cropper integration contract and a decision on the manifest/mapping mechanism
- Baseline performance report

### Exit gate
No unresolved ambiguity may remain around catalog migration, data-directory location, cropper-to-page mapping, or the launch freeze’s blocking operation. If the cause is not yet known, implementation may proceed only on isolated UI foundations that do not depend on the unresolved behaviour.

## Phase 1 — Foundations and safety rails

**Priority:** P0  
**Goal:** Build the shared design, navigation, settings, storage, and reliability foundations before replacing screens.

### Work
1. Implement design tokens for dark, light and high-contrast themes, three density levels, 80–200% text scale, spacing, type, radii, focus, motion and semantic status colours.
2. Build shared controls and the component gallery. Checkboxes, menus, dialogs, tabs, inputs, segmented controls, status indicators and progress components must look and behave consistently.
3. Establish the action registry as the single source for command palette actions, shortcuts, menus and context menus.
4. Implement the shell: native title bar, left rail, top bar, persistent collapsible folder tree, toggleable inspector, toggleable queue, bottom job tray, System popover, breadcrumbs and history.
5. Implement settings scopes (app, library, folder), effective-value display, reset behaviour, settings search, named processing profiles, and JSON import/export. Validate settings on the backend; do not use localStorage as the authoritative settings store.
6. Add the single-instance guard and read-only fallback for locked catalogs. Make errors actionable and preserve drafts when writes fail.
7. Add rotating logs, build/platform information, startup trace, and a Diagnostics surface.
8. Establish the database connection model and migration/backup framework. Create automatic backups before migrations and large jobs, retain the last five, and test restoration.
9. Implement the custom image-serving protocol and validate path containment against registered library roots.
10. Implement snapshot persistence and instant shell/last-view restoration. Do not start the Python worker or model runtime on launch.

11. Implement the `ui.expandedTools` setting (default off) and the Expanded gating helper now, so later features can be gated from the first line.
12. Implement the small synchronous shell-state file (theme, density, text scale, privacy flag) read at launch step 2 (`PRF-20`, `PRV-04`).

### Acceptance gate
- The shell paints before optional workers/runtime start.
- No image bytes are passed through JSON/base64 IPC or `file://`.
- Locked catalogs open read-only with a clear banner and disabled write actions.
- Every shared control is represented in the component gallery across themes, densities, focus, disabled, loading and error states.
- Web and executable use the same shared UI code and design tokens.
- Settings persist through the backend and display their effective scope.
- Backup/restore and single-instance behaviour are tested.

## Phase 1b — Startup repair, two-database data layer, migration rehearsal, walking skeleton

**Priority:** P0 — blocking for every feature screen  
**Goal:** Remove the launch freeze, put the new catalog layout behind a stable interface, and prove the end-to-end path before screens multiply.

### Work
1. **Repair the launch freeze.** Using the Phase 0 root cause, remove the blocking operation (for example a synchronous command, a launch-time scan, eager worker/runtime start, or loading the whole catalog). Add the startup trace as a regression test. If the root cause is a bounded list of hypotheses, fix them in measured order and record each measurement.
2. Define a **data-access interface** (list/page items by folder and filters, counts, item detail, thumbnails, settings) that the UI uses exclusively. Provide an adapter over the existing database so Phases 2–5 can be developed immediately, and a native implementation over the new schema.
3. Implement the **new logical schema** (`design.md` §5 and Appendix D.3): `app.db`, per-library `catalog.db`, `thumbs.db`, `vectors/`, `previews/`, `import_batches`, flags/hidden/`last_viewed_at`/`catalogued_at`/`search_text_hash`/`stale_reason`, `folders.sensitive`, the tag-name constraints, and the partial indexes. Do not create the reserved Expanded tables.
4. Implement the **packed thumbnail store and preview cache** behind the image protocol (320 px WebP q80; 1280 px WebP q85; LRU cap; ETag/immutable), with request cancellation.
5. **Rehearse the migration on a copy** of the real catalog: run the migration tool end to end, verify per-table counts, TAG-04 sanitising report, `import_batches` kind `migrated`, backup creation, and an injected-failure rollback. The real cutover stays in Phase 6.
6. Build the **walking skeleton (milestone M0)**: the executable launches, paints the shell, restores the snapshot, and shows the last view of the 12,000-image library through the data-access interface with thumbnails served by the protocol, scrolling smoothly, with no worker and no runtime started, and the startup trace visible in Diagnostics.

### Acceptance gate
- Budgets **B1, B2, B3 and B11** pass on the budget machine with the real library.
- No Tauri command blocks the main thread for more than 16 ms (`ARC-05`); a test enforces it.
- The migration rehearsal passes on a copy, and the injected failure restores the backup.
- M0 is demonstrated on the executable and on the web build with identical results.
- Neither the worker nor the model runtime starts at launch (`TST-13`).

## Phase 2 — Explore, gallery, inspector, viewer, view modes and organisation

**Priority:** P0  
**Goal:** Make browsing a large library feel immediate and dependable, and add the approved organisation tools.

### Work
1. Implement library registry and folder browsing with separate concepts for active library and selected operation scope.
2. Implement the virtualised gallery with keyset pagination, sorting, filters, uniform square crop by default, optional aspect-preserving rows, three densities and a default thumbnail around 180 px.
3. Add single-click selection, double-click viewer, Space peek, keyboard navigation, lasso selection, selection tray and batch actions.
4. Add the docked, resizable, collapsible inspector with a genuinely useful preview and metadata sections. Preview must not be limited to the low-resolution thumbnail. Implement the tag input with the tag-name rules (`TAG-01`–`TAG-04`).
5. Implement the full viewer with preview-first loading, original resolution when needed, zoom buttons/keys, pan, previous/next, collapsible metadata, and reliable return to the same gallery/search context.
6. Implement Compare mode (two-up to four-up) with synchronised zoom and the metadata-diff table (Core scope only; other modes are Expanded).
7. Add right-click context actions: copy prompt, copy workflow JSON, copy path, reveal in Explorer, find similar, tag/rate/favourite, and applicable comic actions.
8. Implement the sticky selection action bar and multi-item batch operations; include Copy prompts for compatible ComfyUI selections, Add to Pipeline scope, and an **OCR…** action that opens a prefilled job composer but never starts it.
9. Persist per-folder view memory (sort, direction, thumbnail size, grid mode, active filters and Subfolders state) through the backend; restore it across folder switches and restarts. Quick filters are **not** part of it (`QFL-06`).
10. Keep selection, scroll position, sort, filters and inspector state stable during background updates.
11. Implement missing-file states and Retry/Reveal actions without modifying originals.
12. **Table view** (`Alt+1` / `Alt+2`): columns menu with move buttons, sortable-column set, CSV hook for Phase 4, grid-parity keyboard and selection (`TBL-01`–`TBL-10`, `TST-34`).
13. **Privacy blur**: toggle, tray chip, all image surfaces, `colour` mode fallback, `startBlurred`, no first-frame flash, sensitive folders, optional text masking (`PRV-01`–`PRV-10`, `TST-35`).
14. **Hide and Reject flags**, Hidden view, pick/reject/clear actions with undo, panel inheritance (`FLG-01`–`FLG-11`, `TST-32`, `TST-33`).
15. **Viewing history**: dwell-based `last_viewed_at`, coalesced writes, privacy/sensitive/read-only exclusions, Clear viewing history (`VWH-01`–`VWH-06`, `TST-39`–`TST-41`).
16. **Copy-as utilities** (`CPY-01`–`CPY-10`, `TST-45`–`TST-49`): submenu, limits and confirmations, verbatim workflow/API JSON.

### Acceptance gate
- The gallery handles 50,000-item design-ceiling fixtures without rendering every item at once.
- Switching folders does not initiate indexing or OCR; browsing writes only the items listed in `design.md` E.6.
- Double-click reliably opens the viewer; closing it restores gallery context.
- Inspector previews are not thumbnail-resolution substitutes.
- Previous/next navigation follows the active result sequence, including search results.
- Lasso and batch selection are available without making drag the only way to select.
- Grid and Table behave identically for selection, keyboard, sorting, filters and scroll anchoring.
- Hidden items are absent everywhere except the Hidden view; flags are never written by automation.
- Privacy blur covers every image surface and holds budget B5 (or the `colour` fallback is shipped as the default).
- All actions are reachable from keyboard and mouse.

## Phase 3 — Search, collections, quick filters and relations

**Priority:** P0  
**Goal:** Provide a unified, understandable search workflow, durable retrieval aids, and the panel-to-image reference link.

### Work
1. Implement the dedicated Search page and shared gallery result surface.
2. Make Smart the default mode. Keep the active mode visible and explain the sources used without exposing unnecessary engine complexity.
3. Implement exact/keyword metadata search and the supported semantic, visual, similar-image and hybrid modes according to the current backend capability audit.
4. Show keyword results progressively, then merge semantic results as they arrive (re-rank rule `SRC-06`); cancel stale requests and debounce typing.
5. Add scope controls for active library versus All libraries, with library-type-appropriate filters and metadata fields.
6. Add saved searches, search history, query restoration, filters, sort, result counts, and context-preserving navigation to the viewer.
7. Implement **smart collections** as dynamic named rule sets distinct from saved searches: Match all/Match any rule builder, type-aware fields (`§7.6.1`), open/rename/duplicate/pin/delete/undo, and stable results with an explicit Refresh notice. Add the rule-engine additions (`COL-11`) and **import batches** (`IMP-01`–`IMP-03`), then the **built-in collections** (`COL-10`–`COL-23`).
8. Implement the **Quick filters strip** (`QFL-01`–`QFL-10`): session-only, AND-combined, always visible, with the exact Incomplete/Failed predicates.
9. Implement **cross-library similarity**: from a ComfyUI image to compatible comic panels, and similar panels to a ComfyUI image. Verify model ID, configuration hash and vector dimensions before merging; when a library's signal is unavailable, skip only that signal and name the reason in the signal line.
10. Similar-image search takes its reference from an item already in a library; do not add file drop/paste.
11. Implement **Relations (comic panel → ComfyUI image)** (`RLN-01`–`RLN-08`): the *Use as reference for…* action, **Add reference…**, the References and Used-as-reference sections, IoU-based re-attachment, library-removal handling, and `STA-37`–`STA-39`.

### Acceptance gate
- Keyword results can appear before semantic results finish; the list does not reorder after user interaction.
- Changing the query cancels or invalidates stale results.
- Opening an item and returning restores query, mode, filters, sort and result position.
- Search mode and scope are visible and unambiguous.
- Unavailable model/runtime states explain the missing capability and provide a next action.
- Built-in collection predicates pass `TST-38` and `TST-44`; Quick filters pass `TST-43`; open collections never reorder without a user-requested Refresh (`TST-42`).
- Relations survive a Replace re-decompose when a matching box exists and show `STA-38` otherwise (`TST-36`).

## Phase 4 — Pipeline, jobs, indexing, and cache management

**Priority:** P0  
**Goal:** Make all processing explicit, scoped, resumable and observable.

### Work
1. Build Pipeline preset cards: Quick, Full and Comic, plus Customize and single-task actions.
2. Implement a job composer that previews the target library, folders, eligible item counts, stages, dependencies, already-completed work, estimated duration and expected resource use before Start.
3. Keep browsing, opening folders, selecting images and opening Review free of implicit processing.
4. Implement per-folder processing policies and explicit new-file scan policy (“ask each time” with a non-blocking banner by default).
5. Implement one Pause/Resume control plus Stop, with honest per-stage and per-item states.
6. Implement bottom job tray and detail drawer. Job history is session-only; per-item stage status persists.
7. Start the Python worker only when a job needs it. Start model runtime only when needed; stop after the configured idle period.
8. Implement Balanced background throttling by default, plus Idle-only and battery-aware options.
9. Implement cache controls, clear-cache/health tools, integrity check, missing-file verification and text-index rebuild.
10. Add estimates from past runs, labelled as estimates and updated from observed history.
11. Implement the explicit near-duplicate scan (exact matches and perceptual candidates) and Review → Near duplicates workflow. It must not start the model runtime merely to score duplicates and must not expose source-file deletion or replacement.
12. Make interactive browsing and viewer work take priority over background thumbnail, embedding and OCR work.

13. Implement the **re-run presets** *Re-read metadata* and *Regenerate thumbnails*: Pipeline cards, the **Re-run ▸** menu, the quick confirm, the exact stage sets, the invalidation matrix, compute-then-swap safety, the sample preview for large forced re-reads, and the stale-reason vocabulary (`RRN-01`–`RRN-11`, `TST-50`–`TST-54`).
14. Implement **core export** on the export job engine: Prompts CSV, Images + captions (three templates, byte-identical copies), Save workflow as .json, table CSV export, the optional OCR caption for panel export, dry-run summary, disk-space check, never-overwrite and outside-library rules (`EXP-01`–`EXP-10`, `TST-55`–`TST-58`).

### Acceptance gate
- Every job shows its exact scope and stages before it starts.
- Pause/resume/stop state reflects backend acknowledgement.
- Interrupted work can resume without corrupting completed per-item stages.
- Browsing stays responsive while jobs run.
- Failure states identify affected stage/items and offer Retry, Skip where safe, Copy error and relevant navigation.
- No “ready”, “saved” or “complete” state is shown without backend confirmation.
- Re-run presets never overwrite manual data, keep the previous result on failure, and mark exactly the stale items listed in the invalidation matrix.
- Exports never write inside a library root, never overwrite, and copy images byte-identically.


## Phase 5a — Comics: decomposition, panel editor and page/panel gallery

**Priority:** P0 for the comic library  
**Goal:** Make pages and panels durable, linked data.  
**Entry condition:** Phase 0 has proved the cropper's output contract (`design.md` `CMC-03`); if no deterministic manifest exists, a new manifest-writing cropper version is the first task of this phase.

### Work
1. Implement comic library data and page-parent/panel-child relationships, pixel-coordinate boxes, reading order and panel thumbnails.
2. Integrate the protected cropper through a deterministic adapter. Never modify the protected script in place; record `cropper_version_id`, script hash and parameters with every result.
3. Add explicit Decompose actions for a page, selection or folder (with the Decompose dialog) and the Comic preset stage.
4. Show a preview to accept or adjust panel boxes. Batch processing may skip per-page confirmation when explicitly configured; flagged pages become `proposed`.
5. Flag no-panel pages, overlaps, tiny slivers, suspicious aspect ratios, low coverage, stale decompositions and other cropper anomalies. Do not silently turn no-panel pages into whole-page panels; the owner chose to leave them undecomposed and flagged.
6. Implement panel editing: select, draw, resize, move, merge and split; store corrected boxes separately from detector outputs; mark golden-set examples.
7. Implement the Pages / Panels / Both gallery scope, parent chips, series grouping, panel tags, and the comic-library series grid.
8. Design the page-source abstraction so future CBZ support does not require the UI to assume all pages are ordinary filesystem paths.
9. Preserve `panel_folder_cropper_v11.py` byte-identically; record its verified SHA-256 and register every modified/new cropper as a separate version file.

### Acceptance gate
- Decomposition runs only for explicit selected scopes.
- Page and panel data remain linked, and panels are searchable through their parent.
- Every transition of the panel-set state machine is tested; staleness never auto-queues (`TST-21`).
- No-panel pages are flagged and available as cropper test cases.
- Manual panel edits survive restart and a *Replace* re-decompose that does not opt in to replacing them.

## Phase 5b — Comics: OCR, review and OCR quality report

**Priority:** P0 for the comic library  
**Goal:** Make extracted text durable, correctable and searchable.

### Work
1. Implement English OCR only in v1, on explicitly selected folders. OCR panels first and roll results up to the page; use page-level fallback when no panels exist (`OCR-01`–`OCR-08`).
2. Store machine transcription and manual correction separately. Preserve manual corrections, review flags and manual ink colours across OCR reprocessing, including orphaned-correction handling.
3. Implement Needs Attention categories and the file-order queue, with region text editing in the right panel (never a floating canvas popover).
4. Implement the unsaved-change guard, save-failure draft retention, machine-text restore, mark-reviewed, configurable auto-advance, merge/split/draw regions and the measured/manual lettering-ink controls.
5. Implement the machine-versus-manual comparison view (D-93) while keeping both values independent.
6. Implement the **OCR quality report** in Diagnostics (`XPD-04`, `TST-60`); it measures the OCR readiness gate and runs no OCR.
7. Implement the *Failed items* category as the replacement for Batch Recovery after the Phase 0 audit has mapped every old capability.

### Acceptance gate
- OCR runs only for explicit selected scopes; opening Review never starts OCR (`REV-22`).
- Manual corrections survive restart and reprocessing (`TST-12`).
- Failed saves retain the draft; the editor never clips off-screen or covers adjacent regions.
- Review queue open/closed states work at 1100×680 and 1366×768, including banners and zoom/pan.
- The OCR quality report reproduces hand-computed metrics on a fixture.

## Phase 5c — Comics: reader, Cropper Lab, long strips, spreads and panel export

**Priority:** P0 for the comic library  
**Goal:** Complete the comic workflow and its quality loop.

### Work
1. Implement the reading view with page mode, panel stepping, dialogue strip, continuous mode and reading-direction handling (`CMC-50`–`CMC-55`).
2. Implement Cropper Lab A/B comparisons against user-corrected golden-set boxes, failure-type grouping and exportable regression fixtures.
3. Implement **double-page-spread detection and user-controlled split preview** as a v1 capability (`CMC-33`–`CMC-34`). It must not create additional source page records or modify source files.
4. Implement **webtoon/long-strip candidate detection, gutter proposal preview, user boundary adjustment, and reversible coordinate mapping** as a v1 capability (`CMC-30`–`CMC-35`). Never invent a cut solely to satisfy a target segment length; if a deterministic boundary transform is unavailable, offer unsliced cropper execution and record the reason.
5. Implement copy-based panel export (`CMC-60`, `EXP-07`).

### Acceptance gate
- Long-strip and spread fixtures pass the v1 preview, boundary-edit, coordinate-mapping, discard, and source-immutability tests; these are not deferred tasks.
- Cropper version comparisons can be repeated against the same golden set.
- Near-duplicate review never mutates or removes source files; watch notifications never write to the catalog or queue jobs without the user's explicit approval.

## Phase 6 — Settings, diagnostics, onboarding, and migration hardening

**Priority:** P1, but required before release  
**Goal:** Make the app maintainable for long daily sessions and safe to upgrade.

### Work
1. Complete the settings registry and all documented controls, with app/library/folder scope, descriptions, effective-value provenance, reset-to-default, modified markers and restart-required labels.
2. Add processing profiles (Low power, Max speed and user-defined), JSON import/export, and safe validation of imported values.
3. Finish first-run onboarding: add folder, choose library type, choose a processing preset, explain local storage and read-only originals, then show first results.
4. Implement migration preview, automatic backup, one-time catalog migration, post-migration verification and rollback instructions.
5. Add Diagnostics for startup trace, build hash, platform, viewport/DPI, worker/runtime state, database state, cache statistics and logs.
6. Ensure the new-file scan banner is non-blocking and honours the user’s selected policy. A launch prompt asks whether to run a discovery report; it does not walk the tree until the user clicks **Check now**.
7. Implement opt-in, default-off watch-folder notifications while the app is open. Events are debounced and notification-only; **Review changes** opens the same LIB-11 dry-run report and catalog state changes only after explicit approval. No hidden service or background auto-processing is permitted.
8. Verify app shutdown waits safely for active writes and records resumable job state.

9. Perform the **real catalog cutover** using the migration rehearsed in Phase 1b, with a fresh verified backup, the tag-sanitising report, `import_batches` kind `migrated`, and carry-over of any old flag/hidden equivalents.
10. Complete the settings registry including every key introduced in `design.md` Appendices E–J (except the `assist.*` keys), each with a control, default, scope and description (`TST-24`).

### Acceptance gate
- A fresh install can create a library without undocumented steps.
- Migration failures leave the previous catalog recoverable.
- Settings import rejects invalid values without partially corrupting configuration.
- Diagnostics provide enough evidence to troubleshoot startup, web/exe parity and processing failures.

## Phase 7 — Performance, parity, regression, and release

**Priority:** P0 release gate  
**Goal:** Prove the design works on the target machine and across all supported viewports.

### Work
1. Run the performance budgets from `design.md` §14 on the target Ryzen 3 7320U baseline and a scale-up GPU configuration when available.
2. Benchmark cold/warm launch, first paint, first thumbnails, cached folder switch, keyword search, warm semantic search, viewer opening, scrolling at 12k and 50k items, OCR throughput and embedding throughput.
3. Run the viewport matrix at 900×600, 1100×680, 1366×768 and 1920×1080.
4. Test dark, light and high-contrast themes; all three densities; 80%, 100%, 125%, 150% and 200% text scale; reduced motion; keyboard-only use; and native executable plus browser test target.
5. Run screenshot diffs for the gallery, inspector, viewer, search, Pipeline, Review, Settings, dialog, queue open/closed, unsaved guard, failed save, missing-file state and locked catalog.
6. Run automated tests for performance budgets, migration/backup recovery, source immutability, settings scope, manual correction persistence, stale query cancellation, single-instance behaviour and worker/runtime lifecycle.
7. Verify portable ZIP behaviour and ensure the app writes only to the configured data directory and user-selected export destinations.
8. Confirm every requirement in `design.md` §18 has a destination and a passing test or documented verification.

9. Run the tests `TST-32`–`TST-58` that apply to Core, and `TST-59` to prove Expanded features are invisible while `ui.expandedTools` is off.
10. Re-run the performance budgets with Table view active, with privacy blur on, and with the Quick filters strip active.

### Acceptance gate
- No release-blocking `VERIFY` item remains unresolved.
- The original v11 cropper hash matches the Phase 0 baseline exactly; any new cropper is registered as a different file/version.
- Every requirement ID, including smart collections, near duplicates, pinned folders, watch notifications, folder-view memory, batch selection, manual-vs-machine text comparison, and v1 comic strip/spread handling, has an implementation destination and a passing acceptance test or an explicitly approved blocker.
- No layout clipping or overlapping controls in the viewport matrix.
- No unexplained web/exe visual differences.
- No launch-time worker/model startup unless a user-triggered operation explicitly requires it.
- Performance budgets pass or are revised with measured evidence and owner approval.
- Originals remain untouched in every workflow.
- Migration and backup restore are tested from a real copy of the current catalog.
- No Expanded feature is enabled by default; `ui.expandedTools` is off in a fresh install.
- Appendices D–I requirements each have an implementation destination and a passing test or an explicitly approved blocker.


## Phase X — Expanded mode (after the Core stability gate)

**Priority:** P2 — never blocks a Core release  
**Entry conditions:** the **Core stability gate** (`XPD-02`) has passed; for comic-text features also the **OCR readiness gate** (`XPD-03`).  
**Scope:** frozen in `design.md` Appendix J.3. Each feature below gets its own detailed design appendix and tests before its implementation begins, and is gated by `ui.expandedTools`.

### Work (in this order; cut from the bottom — `design.md` J.4)
1. Comic text intelligence: region types, page types, text utilities (then speaker tags after the assist runtime exists).
2. Compare modes (blink, overlay, difference) and study tools.
3. Verbose export branch.
4. Relation kinds beyond *reference*.
5. Annotation layer.
6. Search Lab.
7. Visual clusters.
8. Assist runtime and suggestion queue (`XPD-05`) and the features that depend on it.

### Acceptance gate (per feature)
- Invisible while `ui.expandedTools` is off; no change to Core behaviour or budgets (`XPD-06`).
- Own requirements, tests and states written and passing before enablement.
- Any schema added by a forward-only migration with backup first.

## Cross-phase rules

### Requirement traceability
Every implementation task should cite one or more requirement IDs from `design.md`. Every defect report should include the ID, reproduction steps, library type, theme, density, text scale, viewport and whether it occurs in web, executable or both.

### Definition of done
A feature is not complete until:
1. Its behaviour matches `design.md`.
2. Loading, empty, error, disabled, partial and success states are handled.
3. Keyboard and mouse paths both work.
4. Its UI is built from shared tokens and controls.
5. Tests cover normal and important edge cases.
6. The feature does not initiate unrelated background work.
7. It has been checked in the viewport matrix and in both UI targets where applicable.
8. Any deviation has a documented reason and the relevant design decision is updated in the same change.

## Phase overview

| Phase | Priority | Size | Main outcome | Must precede |
|---|---|---|---|---|
| 0. Audit and baselines | P0 | M | Verified facts, startup root cause, cropper contract | All implementation beyond isolated prototypes |
| 1. Foundations | P0 | L | Shell, design system, settings, storage, safety | All feature screens |
| 1b. Startup repair, data layer, migration rehearsal, walking skeleton | P0 | L | Freeze fixed, new catalog behind an interface, M0 | Phases 2–5c |
| 2. Explore, viewing, view modes, organisation | P0 | XL | Fast gallery, inspector, viewer, compare, table, privacy blur, flags, copy-as | Search surface and daily browsing |
| 3. Search, collections, quick filters, relations | P0 | L | Progressive retrieval, built-in collections, panel→image references | Cross-library release |
| 4. Pipeline, re-run, export | P0 | L | Explicit scoped jobs, re-run presets, core export | Full indexing/OCR rollout |
| 5a. Decompose and panels | P0 (comic) | L | Panels as durable linked data | 5b, 5c |
| 5b. OCR and review | P0 (comic) | L | Correctable, searchable text, OCR quality report | Comic-text Expanded features |
| 5c. Reader, Lab, strips, spreads | P0 (comic) | L | Complete comic workflow | Comic release |
| 6. Settings, diagnostics, onboarding, cutover | P1/release-required | M | Safe setup and the real migration | General release |
| 7. Verification and release | P0 | M | Measured performance and parity | Release |
| X. Expanded mode | P2 | S–L each | Appendix J features | – |

**Sizes are planning guesses to be recalibrated after M0:** S ≈ 1–2 focused work sessions; M ≈ 3–6; L ≈ 7–15; XL ≈ 15 or more. They include writing tests but not waiting time for measurements.

## Milestone M0 — walking skeleton

The end of Phase 1b. The executable launches; the shell paints within B1; the snapshot restores the last view; the grid shows the last folder of the 12,000-image library from the data-access interface with thumbnails served through the protocol and smooth scrolling (B5); neither the worker nor the runtime has started; the startup trace is visible in Diagnostics; the same build behaves identically in the web target. Every later phase builds on M0 rather than on a mockup.

## Dependency graph

```
P0 ─► P1 ─► P1b ─► P2 ─► P3 ──────────────┐
              │      └──► P4 ─► P5a ─► P5b ─┤
              │                  └──► P5c ──┤
              └────────────────────────────►├─► P6 ─► P7 ─► Core release
                                            │
Core stability gate (14 days) ─► Phase X ───┘   (OCR readiness gate ─► comic-text Expanded features)
```

Hard dependencies: **5a depends on the Phase 0 cropper contract** (`CMC-03`); **Phase 3 relations depend on 5a** only for panel data (they can be built against fixtures earlier); **budgets B1–B3 depend on Phase 1b**; **P6 cutover depends on the Phase 1b rehearsal**.

## Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner phase |
|---|---|---|---|---|---|
| R1 | The protected cropper emits no box coordinates (`CMC-03`) | Medium | High (blocks 5a) | Prove in Phase 0; if absent, create a new manifest-writing cropper version first; never infer boxes by image matching | 0 / 5a |
| R2 | The launch freeze has more than one cause or an expensive fix | Medium | High | Startup trace first; fix in measured order; B1/B2/B3/B11 gate in 1b | 0 / 1b |
| R3 | Web and exe still differ | Medium | Medium | Platform adapter (`ARC-12`), no localStorage (`ARC-13`), parity screenshots in every phase | 1 |
| R4 | Migration loses or corrupts data | Low | Very high | Backup first, rehearsal on a copy, count verification, injected-failure rollback, real cutover only in Phase 6 | 1b / 6 |
| R5 | Embeddings are too slow on the 7320U | High | Medium | Background, resumable, throttled, browsed-folder-first (`PRF-51`); honest estimates; GPU scale-up path | 4 |
| R6 | OCR accuracy never reaches the readiness gate | Medium | Medium | Gate is measured, thresholds calibrated; Expanded text features simply wait | 5b / X |
| R7 | Scope creep | High | High | Decision-ID rule, frozen Appendix J, cut order, Expanded behind a flag | all |
| R8 | Alt-based shortcuts misbehave in WebView2 (A1) | Medium | Low | Fallback shortcuts defined in E.9; test in Phase 1 | 0 / 1 |
| R9 | Virtualised grid or privacy blur drops below B5 on the iGPU | Medium | Medium | `colour` mode fallback; decoded-image budget (`PRF-15`); measure in Phase 0 | 0 / 2 |
| R10 | SQLite writer starves readers during jobs | Medium | Medium | Read pool, 500-row / 100 ms write batches (`PRF-30`–`PRF-32`) | 1b / 4 |
| R11 | The existing vector store cannot meet B7 with an exact scan | Low | Medium | Wrap behind the vector interface; flat float16 file fallback (`PRF-40`) | 0 / 1b |
| R12 | Thumbnail encoding or pack size is too slow/large for 12k–50k images | Low | Medium | Measure in Phase 0; quality and size are settings; lazy regeneration | 0 / 1b |
| R13 | Future CBZ support is blocked by a path assumption slipping into the UI | Low | Medium | `DAT-04`–`DAT-07`; test that the UI uses `display_path` only | 5a |

## Task packet template

Use this for every task handed to a coding agent so context is never implied:

```
Task:            <one sentence>
Phase / ID:      <phase> / <requirement IDs from design.md>
Context to read: <design.md sections and appendix letters; files in the repo>
Do:              <numbered, testable steps>
Do NOT touch:    protected cropper script; original media; <other files>
Acceptance:      <test IDs that must pass; budgets that must hold>
Evidence:        <screenshots / traces / numbers to attach>
Out of scope:    <anything tempting but not part of this task>
```

## Explicitly deferred or extension-only

- **CBZ/CBR/archive reading:** future extension; keep the source abstraction archive-ready but do not advertise it as implemented.
- **Pop-out viewer window:** deferred; keep the viewer sequence model self-contained enough to support it later.
- **Automatic indexing/OCR/decomposition from watch events:** not permitted. Watchers only notify; all catalog updates and jobs require explicit user approval.
- **Model-assisted panel tags:** optional future feature; manual tags are v1.
- **Additional OCR languages:** English only in v1.
- **ANN vector index:** not needed below the agreed approximate 100,000-vector threshold unless measurement disproves exact search performance.
- **External/cloud services:** not part of the product.
- **Expanded-mode features** (`design.md` Appendix J): comic region/page types, speaker tags, extra compare modes, study tools, annotations, verbose export, extra relation kinds, Search Lab and visual clusters — Phase X only, behind `ui.expandedTools`.
- **Model-assisted anything** (suggestions, auto-labels): requires the off-by-default assist runtime (`XPD-05`); never auto-applied.
