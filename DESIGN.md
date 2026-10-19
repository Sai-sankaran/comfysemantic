# ComfyPanel Studio — Design Specification

| | |
|---|---|
| **Document** | `design.md` (companion: `implementation-roadmap.md`) |
| **Version** | 1.4.1 — Appendices D–J added: errata applied, Core v1 additions, Expanded mode |
| **Date** | 2026-10-17 |
| **Owner** | Sai |
| **Status** | Consolidated from the supplied design draft, the complete exported planning conversation, and the owner’s later corrections in that conversation. Planning rounds 1–5 are reconciled; duplicate requirement IDs and contradictory phase statements are corrected in this revision. Every `VERIFY` item is an evidence check against the real repository, not an invitation to reopen an already answered product question. |
| **Scope** | Product behaviour, information architecture, every screen, visual system, settings, performance and caching rules, reliability rules, testing rules. |
| **Out of scope** | Source code, exact file/module layout, and library-level implementation choices not stated here. |

---

# 0. How to read and use this document

## 0.1 Normative words
- **MUST / MUST NOT** — mandatory. A build that violates it is defective.
- **SHOULD / SHOULD NOT** — expected unless there is a written reason, recorded in the PR, to deviate.
- **MAY** — optional.

## 0.2 Requirement IDs
Every testable rule has an ID such as `NAV-07`. Tests, PR descriptions and bug reports MUST cite IDs. IDs are never reused. Prefixes:

| Prefix | Area | Prefix | Area |
|---|---|---|---|
| `PRD` | Product principles | `ARC` | Process architecture and IPC |
| `DAT` | Logical data model | `NAV` | Shell and navigation |
| `GAL` | Explore/gallery | `INS` | Inspector |
| `VWR` | Viewer and image navigation | `CMP` | Compare |
| `LIB` | Libraries, folders and change discovery | `SRC` | Search and saved retrieval |
| `COL` | Smart collections | `DUP` | Near-duplicate discovery and review |
| `WCH` | Opt-in watch-folder notifications | `PIP` | Pipeline, jobs and maintenance |
| `CMC` | Comics, decomposition, panels, reader and Cropper Lab | `OCR` | OCR processing and text provenance |
| `REV` | Review and Needs Attention | `RUN` | Model runtime and compute |
| `SET` | Settings registry | `DGN` | Diagnostics |
| `PRF` | Performance, caching and launch | `REL` | Reliability and safety |
| `STA` | User-visible state catalogue | `TST` | Testing and quality gates |
| `ONB` | Onboarding and migration | `VIS` | Visual system |
| `CTL` | Shared controls |  |  |

## 0.3 Tags
- `VERIFY` — a statement about the existing application that has **not** been confirmed (this document was written from screenshots and a product brief, not from the repository). The implementer MUST confirm or correct it in Phase 0 and record the result in `docs/audit.md`.
- `ASSUMPTION` — a decision made without a direct answer from the owner. Listed again in §21.
- `DEFERRED` — designed for, not built in v1.
- `OBSERVED` — seen in a real screenshot of the current app.

## 0.4 Rules for ambiguity
1. Numbers beat adjectives. Where this document says "fast", it gives a budget in §14.
2. If this document is silent, the implementer MUST NOT guess on user-visible behaviour. Add the question to `docs/open-questions.md` and ask the owner.
3. If this document conflicts with the older product brief, **this document wins**.
4. Changing a locked decision requires an edit to this document in the same PR, with the decision ID noted.

## 0.5 Evidence levels: current state, reported behaviour, and target behaviour

This document uses three separate evidence categories. They must not be blended:

- **Screenshot-reported current state:** the Claude export refers to screenshots of Library, Search, Indexing Center, and Dialogue Review, including eight Dialogue Review states. The export contains Markdown links to the image assets, not local image files. The layout problems explicitly described in the export are recorded in §0.6. This document does not claim that every screenshot pixel was independently re-inspected during this consolidation.
- **Owner-reported behaviour:** the executable shows a visible but frozen window for more than 30 seconds on an SSD; the browser build and packaged executable have sometimes rendered differently; the gallery reportedly showed only around five to seven images unexpectedly; the inspector preview was too low-resolution; and double-click viewing was broken. These are defects to diagnose or regress-test, not desired behaviour.
- **Repository-dependent facts:** the real gallery with a production-sized library, inspector, viewer, Settings, Options, Batch Recovery, Panel Studio, database schema, OCR engine/version, cropper output contract, and startup blocking operation were not established by the supplied local files. They remain `VERIFY` items. Do not infer that a screen or function is correct merely because its name appears in the existing UI.

The export mentions a separate `startup-profiling-prompt.md` download, but that prompt's contents were not included as a local attachment in this handoff. The requirements below specify the diagnostic evidence needed and do not claim that a profiling run or root-cause report already exists.


## 0.6 Screenshot-derived UX defects from the exported review

The supplied Claude export references eight Dialogue Review screenshots and four additional application screenshots. The image URLs are embedded in the export rather than supplied as local image files, so this section records the observations explicitly described in that export; it does not claim a fresh pixel-by-pixel inspection of the remote images. The four additional screenshots are not individually described in sufficient detail in the export to make further visual claims about them.

The following reported defects are requirements for the redesign, not intended behaviour:

1. **Floating dialogue editor clips at the canvas edge.** At 100% zoom it can be clipped at the bottom; at low zoom it can overlap neighbouring regions. The new editor belongs in the fixed right-hand details panel (`REV-12`), never in a canvas popover.
2. **Controls wrap and waste vertical space.** Toolbar controls and page-navigation buttons wrap at smaller viewports. Keep primary controls on one compact row where possible; when the viewport cannot fit them, use a deliberate overflow menu or a second, stable toolbar row rather than accidental wrapping.
3. **Banners change canvas geometry without re-fitting content.** Unsaved-change and save-error banners reduce available canvas height while the page/editor remain positioned for the old size. Reserve space for persistent status/guard bars or recompute the canvas viewport whenever its available bounds change. The bar must never cover the canvas or clip Save, Discard, or Cancel.
4. **Keyboard hints collide with editor controls.** `Ctrl+Enter to save` must live in a dedicated helper-text area and must not collide with the editor boundary or action buttons.
5. **Text overlays reduce legibility.** OCR text painted over existing lettering is difficult to read at low zoom. Keep “Show text on canvas” off by default and expose it as an explicit toggle (`REV-17`).
6. **Queue presentation must not destabilise the canvas.** Opening the queue at 1100×680 should use the specified bottom strip/drawer behaviour without pushing essential controls off-screen or making the canvas unusable (`REV-10`, `REV-20`).
7. **Unsaved edits and failed saves must preserve the draft.** The exported review reports that the unsaved-navigation guard and failed-save draft retention behaved correctly. Preserve that safety behaviour while fixing layout: navigation must wait for Save, Discard, or Stay; on failure, retain the exact draft and expose Retry and Copy text (`REV-13`).
8. **The old lock error must be translated into a safe product state.** A “catalog is locked by another process” error must lead to a clear read-only fallback with a non-modal explanation, not an unexplained raw error or a frozen screen (`ARC-15`, `STA-20`).

These defects must be covered by the viewport and interaction tests in §17 at 1100×680 and 1366×768, including 100% zoom, zoomed/panned editing, queue open/closed, unsaved guard, failed save, and text scaling. A layout passes only if all controls remain reachable and visible, the canvas recalculates correctly, and drafts remain intact.

## 0.7 Launch freeze and web/executable parity

The owner reported that the executable can lock up for more than 30 seconds on launch and that the browser build and executable sometimes look different. These are release-blocking reliability/usability problems, not acceptable startup characteristics.

- The UI shell and last-view snapshot must paint before nonessential work; Python and the model runtime must not start just because the app launches (`ARC-01`, `ARC-02`, §14.3).
- The cause of the reported freeze is not established by the supplied design materials. Phase 0 must collect a startup trace and identify the blocking operation; do not guess at a fix (`DGN` and `VERIFY` list).
- Web and executable builds must share the same product UI code and design tokens. Platform-specific operations go through an adapter; platform differences are limited to capabilities that genuinely require them.
- The browser development build is not a separately supported product (`D-02`). It is nevertheless a test target and must use fixtures/adapters that make visual and interaction parity testable.
- Screenshot comparisons must record build identifier, viewport, zoom, device-pixel ratio, theme, density and text scale. Compare equivalent builds and settings; do not treat differences caused by browser zoom or stale packaged assets as proof of a layout defect.


## 0.8 Consolidated planning decisions and scope lock

This section explains how the exported conversation was resolved into this specification. It is intended to prevent a future implementer from reopening decisions that the owner already made or mistaking a missing repository fact for a product-design question.

### Locked product decisions

1. **Library types are ComfyUI and Comic/Manhwa.** In the planning conversation, “reference” was clarified to mean comic/manhwa pages and panels. Do not introduce a third generic `Reference` library type. A Comic library can hold locally sourced pages, including pages downloaded from the internet, but it uses the Comic data model: page records, optional panel children, OCR text, tags, notes, rating/favourite, and optional source details.
2. **Each library has one type and its own catalog database.** The type applies to every root folder registered in that library. Mixed ComfyUI and Comic roots must be separated into libraries of the appropriate type. There is no per-image automatic type detection. A requested type change is an explicit catalog operation described by `LIB-05`, not an automatic classification feature.
3. **Search remains its own rail destination.** Explore is for browsing; Search is for query building and retrieval. Both use the same result-grid, inspector, viewer, selection, and previous/next sequence behaviours.
4. **The executable is the product; the browser build is a development/test target.** It must nevertheless share the same UI implementation, tokens, fixtures, and interaction tests. A difference is permitted only when a capability genuinely requires a platform adapter and that difference is listed in the parity allow-list.
5. **Accessibility means effortless navigation and comfort, not a formal certification project.** Keyboard access, useful focus, legible scaling, predictable Escape/back behaviour, and consistent control behaviour are required because they make the app easier to operate. WCAG certification is not a release goal. Do not add a separate accessibility feature suite at the expense of the core navigation and performance work.
6. **Original image files are immutable.** Database annotations and app-owned cached derivatives can change. Panel Studio outputs and panel exports are newly created copies in a user-selected destination outside every registered library root; they are not edits to the input. No routine action may move, rename, overwrite, replace, or delete an original. Export naming must avoid overwriting an existing destination file.
7. **The old cropper is protected.** `panel_folder_cropper_v11.py` is the known-good baseline and MUST remain byte-identical; Phase 0 records its SHA-256 in `docs/audit.md`. The app calls a registered cropper version through an adapter. Any change to detection behaviour is a new version file (for example, a separate v12), never an edit to v11; the app records the script hash, version label and settings used for each result. Pages with no detected panels remain undecomposed and flagged so they can be used as cropper test cases.
8. **All suggestions accepted by the owner are part of the intended product unless an explicit later answer defers them.** This includes saved searches and smart collections, favourites/ratings/tags/notes, live facet counts, lasso selection and batch actions, compare mode, near-duplicate discovery, panel and dialogue correction tools, machine/manual text comparison, undo history, diagnostics/performance HUD, cache/database health tools, and opt-in watch-folder notifications. The detailed requirements are in the relevant sections below.

### Explicit deferrals

Only the following items are deferred from v1 by the source conversation or by an explicit scope choice:

- **CBZ/CBR archive ingestion:** future extension. The v1 page-source abstraction must be archive-ready, but v1 accepts folders, not archives.
- **Pop-out viewer window:** deferred. The in-app viewer and Comic Reader are in v1; a separate Tauri window is not.
- **Model-assisted panel tags:** deferred; panel tags are manual in v1.
- **Additional OCR languages:** deferred; v1 exposes English only.
- **Approximate-nearest-neighbour vector index:** not used merely because it is fashionable. Exact vector search is the default below the agreed approximate 100,000-vector threshold; benchmark before changing this.
- **Remappable shortcuts:** deferred. v1 uses a fixed, documented shortcut map generated from the action registry.
- **Additional library types:** deferred. v1 ships only ComfyUI and Comic/Manhwa.

**Webtoon/long-strip handling is not omitted:** the Comic library and Decompose flow must support gutter-based slicing proposals in v1. **Double-page-spread detection and an offer to split are also v1 requirements.** They may be disabled per library, but they must not be silently postponed as unspecified future work.

### Unknown implementation facts are not open product choices

The owner has already asked for the two Markdown deliverables and approved proceeding with the complete specification. The remaining `VERIFY` markers are factual checks against the repository, not invitations to ask the owner to repeat design answers. An implementer must inspect the code/data and record the finding in `docs/audit.md`; if evidence is unavailable, the affected capability must remain visibly unverified and must not be described as working.


---

# 1. Product definition

## 1.1 Statement
ComfyPanel Studio is a **local-first Windows desktop application that treats source image files as read-only** while allowing catalog metadata edits and user-requested derivative exports. It is for browsing, searching, inspecting and processing two kinds of image collections:

1. **ComfyUI libraries** — AI-generated images whose files carry generation metadata (prompt, negative prompt, workflow, model, LoRAs, sampler, and so on).
2. **Comic/Manhwa libraries** — locally available comic or manhwa pages, including pages sourced from the internet. “Reference library” in the planning conversation meant this Comic/Manhwa type; it is not a third library type. Each page can be decomposed into **panels**; OCR text from page regions and panels is first-class searchable metadata. Optional source URL/site and artist/series information can be stored locally as descriptive metadata; the app does not fetch those details from the internet.

## 1.2 Who and how
- Single user (the owner). No accounts, no sharing, no cloud, no telemetry. (`PRD-01`)
- Daily-driver tool, used for long sessions. (`PRD-02`)
- The Windows `.exe` (Tauri 2) is **the product**. The web build (Vite dev server in a browser) exists only for development and testing. (`PRD-03`)

## 1.3 Scale the design must handle
| Item | Number |
|---|---|
| ComfyUI library, today | ≈ 12,000 images |
| ComfyUI library, planned | tens of thousands (design ceiling for v1 budgets: 50,000) |
| Comic library | one folder per comic; a one-shot comic ≈ 30 pages; library of ≈ 100 comics (≈ 3,000 pages, ≈ 20,000 panels) |
| Libraries open at once | 1 active; others are switchable |

## 1.4 Target hardware and platform
- **Budget machine (all budgets in §14 are measured here):** AMD Ryzen 3 7320U (4 cores / 8 threads, low-power), integrated Radeon graphics, SSD. RAM amount was not supplied and remains an `ASSUMPTION` (8–16 GB for initial sizing only). Windows 11 and WebView2 are also deployment assumptions to verify. The design must scale to a later dedicated GPU without changing user workflows.
- **Scale-up path:** a dedicated GPU later. The model runtime MUST expose a compute-device choice (§11) so the same build uses it without UI changes.
- Minimum supported window: **900 × 600 px**. Layouts MUST be verified at 900×600, 1100×680, 1366×768 and 1920×1080 (§17).

## 1.5 Principles
| ID | Principle | What it means concretely |
|---|---|---|
| `PRD-04` | **Organise around tasks** | Navigation names user goals (Explore, Search, Review, Pipeline), not pipeline internals. |
| `PRD-05` | **Images first** | In Explore and Search, the image grid is the dominant surface; chrome is quiet. |
| `PRD-06` | **Browsing never causes work** | Opening a library, switching folders, selecting an image or opening the inspector MUST NOT start indexing, OCR, decomposition, embedding or any write to the catalog other than the bookkeeping writes enumerated in Appendix E.6 (last opened, search history, launch snapshot, viewing history). |
| `PRD-07` | **Work is explicit and scoped** | Every job shows its library, folders and stages before it starts, and affects only those. |
| `PRD-08` | **User corrections are sacred** | Manual text, manual panel boxes, tags, notes, ratings and manual ink colours are never overwritten by automation (§9, §15). |
| `PRD-09` | **Originals are read-only** | The app never modifies, moves, renames, deletes, replaces, or overwrites a source file. User-requested exports create new copies outside all registered library roots and refuse an existing destination unless the user explicitly chooses a new, non-colliding name; there is no overwrite option in v1 (§15). |
| `PRD-10` | **Honest status** | The UI never says "ready", "indexed", "saved" or "running" unless the backend reported it. Three states are always distinguishable: working, not started, failed. |
| `PRD-11` | **One design system** | Every control comes from one component library and one token set (§10). No local one-off styling. |
| `PRD-12` | **Fast by construction** | Budgets in §14 are tests, not hopes. |
| `PRD-13` | **Keyboard-first, mouse-friendly** | Every action is reachable by keyboard and by the command palette. Every shortcut is listed in Appendix A. |
| `PRD-14` | **No dead ends** | Every empty, error and unavailable state says what happened and offers a next action (§16). |
| `PRD-15` | **Suggestions accepted are requirements** | Features accepted in the planning conversation are listed in the decisions register and mapped to screen requirements/tests; they are not silently downgraded to “nice to have”. Only explicitly deferred items belong in §20. |

## 1.6 Non-goals (v1)
- No file management: no move, rename, delete or edit of images. (Exports are **copies** to a folder the user chooses.)
- No cloud features, sync, multi-user, or online lookups.
- No image generation or ComfyUI control.
- No formal accessibility certification. The owner's definition of accessibility is **ease of navigation**; the design still includes visible focus, keyboard reachability, text scaling, a high-contrast theme and reduced motion because they improve navigation for everyone.
- No CBZ/CBR/archive support in v1 — but the data model MUST allow it (§5.6).
- No pop-out viewer window in v1 (`DEFERRED`).

## 1.7 Technology constraints (from the brief)
React 19 + TypeScript + Vite (UI); Tauri 2 with a Rust shell; a long-lived Python worker speaking JSONL; SQLite (WAL, FTS5); a llama.cpp-compatible local inference runtime. The redesign MUST NOT change this stack except where this document says so (custom image protocol, Rust-side vector scan, split databases).

---

# 2. Decisions register

Every decision below was made by the owner (**O**) or by Claude on the owner's instruction (**C**). "Round" refers to the planning conversation.

| ID | Decision | By | Round |
|---|---|---|---|
| D-01 | Audience is the owner only. | O | 1 |
| D-02 | The exe is the product; the web build is dev/test only. | O | 1 |
| D-03 | "Accessibility" means ease of navigation, not formal standards. | O | 1 |
| D-04 | Settings have three scopes: app, library, folder. | O | 1 |
| D-05 | One Settings page plus quick toggles in context. | O | 1 |
| D-06 | Processing profiles ("Low power", "Max speed", user-defined) and settings import/export. | O | 1,2 |
| D-07 | Navigation structure chosen by Claude: left rail, five items (Explore, Search, Review, Pipeline, Settings). | C | 1,2 |
| D-08 | Folder tree is a persistent, collapsible side panel. | O | 1 |
| D-09 | Inspector and queue are both toggleable panels. | O | 1 |
| D-10 | Panel Studio lives under Pipeline → Tools. | O | 1 |
| D-11 | The app never modifies image files. | O | 1 |
| D-12 | Ratings, favourites, tags and notes stored in the database. | O | 1 |
| D-13 | New-file scanning on launch: "ask each time" (non-blocking banner). | O | 1 |
| D-14 | Themes: dark (default), light, high-contrast. | O | 1 |
| D-15 | Monochrome UI; colour only for status; accent colour chosen in Settings, none by default. | O | 1 |
| D-16 | Three densities and 80–200% text scale. | O | 1 |
| D-17 | Grid: uniform square crop by default, aspect-preserving rows as a toggle. | O | 1 |
| D-18 | Shortcuts are fixed and documented (not remappable in v1). | O | 1 |
| D-19 | Rebuild from scratch where needed; no existing screen is sacred. | O | 1 |
| D-20 | Gallery opens the last-used folder at launch. | O | 2 |
| D-21 | Click selects; double-click opens viewer; Space peeks. | O | 2 |
| D-22 | Gallery cards show the image only; details on hover. | O | 2 |
| D-23 | Viewer has a collapsible metadata side panel; zoom by buttons (and keyboard), not scroll wheel. | O | 2 |
| D-24 | Dedicated Search page; Smart is the default mode; results appear in the shared gallery. | O | 2 |
| D-25 | Pipeline presets as cards plus "Customize". | O | 2 |
| D-26 | Job progress in a bottom tray with a detail drawer. | O | 2 |
| D-27 | Review layout: image left, editor/details right, toggleable queue strip. | O | 2 |
| D-28 | Auto-advance after save (setting, default on). | O | 2 |
| D-29 | Profiles apply to processing settings only. | O | 2 |
| D-30 | Built-in Diagnostics page including a startup trace. | O | 2 |
| D-31 | All requested features are kept; nothing is omitted. | O | 2 |
| D-32 | Two library types only: ComfyUI and Comic/Manhwa; each library has one type and its own catalog database. “Reference” in the discussion meant Comic/Manhwa, not a third type. | O | 3 |
| D-33 | The library type decides metadata fields, inspector sections, filters and pipeline stages; every root in a library inherits that library type. No per-image type detection. | O | 3 |
| D-34 | A library type can be changed later through an explicit Change type workflow with backup and type-specific re-index. If only one root folder needs a different type, it must be moved/re-registered under a library of that type; a library cannot mix types. Originals are never moved or modified by the type change. | O | 3 |
| D-35 | Default search scope is the active library; "All libraries" is a toggle. | O | 3 |
| D-36 | Embeddings are stored per library. | O | 3 |
| D-37 | OCR text is the primary metadata of comic pages and panels. | O | 2,3 |
| D-38 | OCR language is English in v1; engine is whatever the app uses today. | O | 3 |
| D-39 | OCR text is searchable by keyword and semantic search. | O | 3 |
| D-40 | OCR works at region/panel level and whole-image level. | O | 3 |
| D-41 | OCR runs only on folders the user selects. | O | 3 |
| D-42 | "Needs review" confidence threshold is 80%, adjustable. | O | 3 |
| D-43 | Review queue is in file order. | O | 3 |
| D-44 | Users can merge, split and draw regions. | O | 3 |
| D-45 | Manual corrections already survive reprocessing; "Mark reviewed" adds no extra protection. | O | 3 |
| D-46 | Similar-image search takes its reference from the library only (no file drop or paste in v1). | O | 3 |
| D-47 | Saved searches and search history are in v1. | O | 3 |
| D-48 | Per-folder processing policies are stored in the database. | O | 3 |
| D-49 | Time estimates on presets come from the user's past runs. | O | 3 |
| D-50 | Job history is session-only; per-item status is permanent. | O | 3 |
| D-51 | A comic page is a parent; panels are children stored as boxes in the page plus cached thumbnails. | O | 3,4 |
| D-52 | Decompose runs only when asked (or via the Comic preset), with a preview to accept/adjust. | O | 4 |
| D-53 | Pages where no panels are found stay undecomposed and are flagged, to serve as a cropper test set. | O | 4 |
| D-54 | Changed pages or cropper versions are marked stale, never auto-redone. | O | 4 |
| D-55 | OCR runs per panel first, rolled up to the page; page-level fallback. | O | 4 |
| D-56 | Panel boxes are editable (merge, split, draw). | O | 4 |
| D-57 | Gallery scope toggle: Pages · Panels · Both, with a parent chip. | O | 4 |
| D-58 | Folders are series/chapters automatically. | O | 4 |
| D-59 | A reading view with panel-by-panel stepping is in v1. | O | 4 |
| D-60 | Panels can be exported (copied) to a chosen folder. | O | 4 |
| D-61 | Panel tags: manual in v1; model-assisted tags optional later. | O | 4 |
| D-62 | Cross-library "similar panels to this ComfyUI image" is in v1. | O | 4 |
| D-63 | One Pause/Resume toggle plus Stop. | O | 4 |
| D-64 | Font: Segoe UI Variable (UI) + Cascadia Mono (paths/hashes). | C | 4 |
| D-65 | Icons: Lucide. Corners: 4 px. Native Windows title bar. Default thumbnail ≈ 180 px. Minimal motion (≤ 120 ms). | O | 4 |
| D-66 | Build by strangler: new shell beside the old; retire old screens when replaced. | O | 5 |
| D-67 | Build order chosen by Claude (see roadmap). | C | 5 |
| D-68 | One-time migration of the existing catalog into the two new databases, with automatic backup first. | O | 5 |
| D-69 | Thumbnails: packed store, 320 px WebP (q80), in its own file per library. | C | 5 |
| D-70 | Previews: 1280 px WebP (q85) generated on first view, LRU cache (default 2 GB), neighbours prefetched. | C | 5 |
| D-71 | Images are served through a custom Tauri protocol streamed from disk. | C | 5 |
| D-72 | Vectors: exact brute-force scan over a memory-mapped flat file in Rust; no ANN below 100,000 vectors. | C | 5 |
| D-73 | Progressive search: keyword results first, semantic results merged as they arrive. | O | 5 |
| D-74 | Model runtime starts on demand and stops after idle (default 10 min). | O | 5 |
| D-75 | Single-instance guard with read-only fallback when the catalog is locked. | O | 5 |
| D-76 | Automatic database backup before migrations and big jobs; keep the last 5. | O | 5 |
| D-77 | Background throttling: Balanced by default; idle-only and battery-aware options. | O | 5 |
| D-78 | Cropper versions are separate files; the app records version and parameters per result. | O | 5 |
| D-79 | Cropper Lab (A/B compare against corrected boxes) is in v1. | O | 5 |
| D-80 | Webtoon/long-strip support is required in v1: during an explicitly requested Decompose operation, detect likely tall strips and offer gutter-based slicing before panel detection; never change the source file. | O | 5 |
| D-81 | Double-page spreads: detect likely spreads and offer a preview of splitting at the gutter before panel detection; do not split or alter the source automatically. | O | 5 |
| D-82 | Right-click context menus everywhere, from one action registry. | O | 5 |
| D-83 | Lasso (drag) selection in the gallery. | O | 5 |
| D-84 | Compare mode (2-up / 4-up). | O | 5 |
| D-85 | Performance budgets are enforced as automated tests. | O | 5 |
| D-86 | CBZ support is a future extension; v1 designs for it. | O | 5 |
| D-87 | Pop-out viewer window is deferred. | O | 5 |
| D-88 | Deliverables: `design.md` + a separate `implementation-roadmap.md`. | O (approved) | 5 |
| D-89 | Smart collections are included in v1 in addition to query-based saved searches; they are dynamic named rule sets, not copied images. | O (accepted recommendation) | 2,5 |
| D-90 | Near-duplicate discovery is included in v1; results are review-only and never delete or modify source images. | O (accepted recommendation) | 2,5 |
| D-91 | Folders can be pinned for quick access without creating additional top-level navigation destinations. | O (accepted recommendation) | 2,5 |
| D-92 | Opt-in watch-folder notifications are included in v1; they can announce filesystem changes but never ingest or process files automatically. | O (accepted recommendation) | 2,5 |
| D-93 | Review includes a machine-versus-manual text comparison view while preserving machine and manual values independently. | O (accepted recommendation) | 2,5 |
| D-94 | The Review canvas zoom uses buttons and keys only (same as the viewer); the old Ctrl+wheel zoom is removed for consistency with D-23. | O (accepted default) | Appendix round |
| D-95 | Core v1 for comic text is the editable text overlay in Review (`§9`); region types, page types, speaker tags and text suggestions are Expanded features, built only after the OCR readiness gate. | O | Appendix round |
| D-96 | Expanded features are built after the Core stability gate and are hidden behind `ui.expandedTools` (default off). | O | Appendix round |
| D-97 | Core v1 compare is side-by-side with linked zoom and the metadata-diff table; blink, overlay, difference, study tools and annotations are Expanded. | O | Appendix round |
| D-98 | Core v1 export is: copy prompts, prompts CSV, images plus caption files from three fixed templates (byte-identical copies), table-view CSV, and the existing panel export; the verbose export branch is Expanded. | O | Appendix round |
| D-99 | Relations in v1 exist only between a comic panel (reference) and a ComfyUI image. | O | Appendix round |
| D-100 | Table view (`Alt+1` / `Alt+2`) is included in v1. | O | Appendix round |
| D-101 | Privacy blur is included in v1. | O | Appendix round |
| D-102 | Hide and Reject flags are included in v1 as minimal database flags; files are never touched. | O (not vetoed) | Appendix round |
| D-103 | Built-in smart collections and a session-only Quick filters strip are included in v1 (Appendix F). | O | Appendix round |
| D-104 | Copy-as utilities (prompts, tags, workflow JSON, comic OCR text) are included in v1 (Appendix G). | O | Appendix round |
| D-105 | Re-run presets (Re-read metadata, Regenerate thumbnails) are included in v1 (Appendix H). | O | Appendix round |
| D-106 | Search Lab and visual clusters are Expanded (v1.1 at the earliest); no schema is created for them in v1. | O | Appendix round |
| D-107 | Model-assisted suggestions use a separate, off-by-default assist runtime; suggestions are always labelled, reviewable and never auto-applied. | O | Appendix round |
| D-108 | Settings has an eleventh category, **Privacy**, holding the `privacy.*` keys (Appendix E.5); `browse.*` and `table.*` keys stay in Browsing. | C (spec gap found during implementation) | Implementation |

---

# 3. Glossary

| Term | Definition |
|---|---|
| **Library** | A named collection with exactly one **type** (ComfyUI or Comic/Manhwa), one or more root folders of that same type, and its own `catalog.db`, thumbnail store, vector files and preview cache. Different types never share one library catalog. |
| **Library type** | `comfyui` or `comic`. Decides metadata fields, filters, inspector sections, available presets and pipeline stages. The planning word “reference” refers to the `comic` type. |
| **Folder** | A directory inside a library root. In Comic libraries, a top-level folder is a **series** and nested folders are treated as chapters/subfolders for navigation; type is inherited from the containing library. |
| **Item** | One indexed file: an image, or (ComfyUI libraries only, if present) an audio/video file. In comic libraries an item is a **page**. |
| **Page** | An item in a comic library. Parent of panels and regions. |
| **Panel** | A rectangular region of a page, stored as a box in the page's pixel coordinates, with a reading order, its own thumbnail, and (after OCR) its own text. |
| **Region** | A rectangle of text on a page (typically one speech balloon), with machine text, optional manual text, confidence, and ink colour data. A region may belong to a panel. |
| **Decompose** | Run the cropper on pages and store the resulting panel boxes. |
| **Cropper** | The existing protected panel-cropping script, and later versions of it. Never edited in place. |
| **Stage** | One step of processing (for example Thumbnails). Each stage keeps a per-item status. |
| **Preset** | A named set of stages (Quick, Full, Comic) plus single-task shortcuts. |
| **Job** | One execution of chosen stages over a chosen scope. Session-only. |
| **Scope** | The set of folders (and library) a job affects, shown before it starts. |
| **Runtime** | The local inference process (llama.cpp-compatible) that produces embeddings. |
| **Worker** | The long-lived Python process that does indexing, OCR and decomposition. |
| **Smart search** | The default text-query mode. It fuses the available keyword, text-semantic and text-to-image retrieval signals; a missing or incompatible signal is skipped and disclosed. It is distinct from **Similar**, which requires an image already in the library as its reference. |
| **Needs Attention** | The Review inbox of items that require a human decision. |
| **Golden set** | Pages with user-corrected panel boxes, usable as ground truth for the cropper. |
| **Snapshot** | A small file recording the last view (library, folder, sort, first page of item ids, scroll position) used to paint instantly at launch. |

---

# 4. Architecture (as it affects UX)

## 4.1 Processes
| Process | Role | Starts | Stops |
|---|---|---|---|
| **Tauri shell (Rust)** | Window, IPC, image protocol, database access (read pool + one writer), vector scan, thumbnail/preview generation pool, single-instance lock. | At launch | At exit |
| **WebView2 UI (React)** | All screens. Holds no catalog in memory beyond the visible window of results. | At launch | At exit |
| **Python worker** | Indexing stages, OCR, cropper adapter. | **On first need** (a job, OCR, decompose) — never at launch (`ARC-01`) | After 10 min idle (setting) or at exit |
| **Model runtime** | Embeddings for text and images. | **On demand** (§11) — never at launch (`ARC-02`) | After idle timeout (default 10 min) or at exit |

## 4.2 Storage layout
All paths are relative to the **data directory** (setting `storage.dataDir`). Default = the location the current app already uses (`VERIFY`: confirm; the owner ships a portable build). The new app MUST NOT write anywhere else except export folders the user chooses.

```
<dataDir>/
  app.db                      settings, library registry, saved searches, smart collections,
                              pinned folders, search history, cropper registry, run statistics
  snapshot/last-view.json     launch snapshot (§14.3)
  backups/                    automatic database backups (keep last 5)
  logs/                       rotating log files, 10 MB × 5
  libraries/<library_id>/
    catalog.db (+ -wal, -shm) items, folders, metadata, FTS, tags, stage state, comics tables
    thumbs.db                 packed thumbnails (320 px WebP)
    vectors/<kind>.f16        flat float16 vector files (+ ids and manifest)
    previews/                 1280 px WebP preview cache (files, LRU)
    lab.db                    Cropper Lab runs (comic libraries only)
```

## 4.3 Custom protocols (image serving)
The UI MUST load every image through these URLs. It MUST NOT pass image bytes through JSON IPC, base64, or `file://` (`ARC-03`).

| URL | Returns | Cache headers |
|---|---|---|
| `cp-thumb://<library_id>/<item_id>` | 320 px WebP thumbnail from `thumbs.db`; for panels `cp-thumb://<library_id>/p/<panel_id>` | `ETag: <fingerprint>`, `Cache-Control: immutable` |
| `cp-prev://<library_id>/<item_id>` | 1280 px WebP preview (generated on first request, then cached) | same |
| `cp-prev://<library_id>/p/<panel_id>?w=1280` | Panel crop rendered from the original using the stored box | same |
| `cp-orig://<library_id>/<item_id>` | The original file streamed from disk, with HTTP Range support | `ETag: <fingerprint>` |

Security rules (`ARC-04`): the protocol handler resolves `item_id` → path through the catalog; it MUST NOT accept raw paths; it MUST verify the resolved path lies inside a registered library root; it MUST return `404` with a machine-readable reason (`missing_file`, `unreadable`, `outside_root`) when it cannot serve.

## 4.4 IPC rules
| ID | Rule |
|---|---|
| `ARC-05` | Every Tauri command is `async` or runs on a blocking thread pool. No command may block the main/UI thread for more than 16 ms. |
| `ARC-06` | List endpoints use **keyset pagination** with a page size of 200 and return only the fields needed to draw cards (id, folder_id, name, width, height, dominant_color, badges, sort key). No "get all" endpoint exists. |
| `ARC-07` | One IPC response MUST be ≤ 1 MB. |
| `ARC-08` | Long operations return a job/request id immediately and report progress as events at ≤ 10 Hz. |
| `ARC-09` | Every request that can be superseded (search, folder load, preview) accepts a cancellation token; the UI cancels on navigation. |
| `ARC-10` | Errors use one schema: `{ code, user_message, technical_message, retryable, details }`. The UI shows `user_message`; Diagnostics shows the rest. |
| `ARC-11` | The IPC contract is versioned (`contract_version`). The UI refuses to start against a backend with a different major version and says so on screen. |
| `ARC-12` | A **platform adapter** (`native.ts`) is the only module that touches Tauri APIs. The web build supplies a fallback implementation of the same interface. UI code MUST NOT test for `window.__TAURI__`. This removes web/exe divergence by construction. |
| `ARC-13` | UI state that must persist (sidebar collapsed, panel widths, last view) is stored through the settings store or the snapshot file, **never `localStorage`**, so the web and exe builds behave identically. |

## 4.5 Single instance and locking
- `ARC-14` The app MUST allow one running instance per data directory (a lock file plus a named mutex). Launching a second instance focuses the first window and exits.
- `ARC-15` If a catalog is locked by another process (the earlier harness screenshot showed `catalog is locked by another process`), the app MUST open that library **read-only**, show a non-modal banner (§16, `STA-20`), and disable every action that writes. It MUST NOT show the raw error as the only message.

---

# 5. Data model (logical)

This is the **logical** model the UI and backend agree on. The implementer maps it to the existing schema (`VERIFY`: audit the current schema in Phase 0) and provides a migration (§19). Column names are normative for IPC field names; physical storage may differ.

**Additions from Appendices D–J** (columns, tables and constraints introduced after the first release of this model) are consolidated in **Appendix D.3** and are part of this data model.

## 5.1 `app.db`
| Table | Columns |
|---|---|
| `libraries` | `id`, `type` (`comfyui`\|`comic`), `name`, `created_at`, `last_opened_at`, `ask_on_launch` (`ask`\|`never`), `data_subdir` |
| `library_roots` | `library_id`, `path`, `excluded_globs_json`, `watch_enabled` (bool, default false; notification-only while the app is open) |
| `settings` | `key`, `scope_type` (`app`\|`library`\|`folder`), `scope_id` (null for app), `value_json`, `updated_at` — primary key (`key`, `scope_type`, `scope_id`) |
| `profiles` | `id`, `name`, `builtin` (bool), `values_json` (processing settings only, §12) |
| `saved_searches` | `id`, `library_id` (null = all libraries), `name`, `query`, `mode`, `scope` (`pages`\|`panels`\|`both`\|null), `sources_json`, `filters_json`, `sort`, `pinned`, `created_at` |
| `smart_collections` | `id`, `library_id` (null = all libraries), `name`, `rules_json`, `sort`, `pinned`, `created_at`, `updated_at`; stores dynamic filter rules, not result IDs |
| `pinned_folders` | `library_id`, `root_path`, `rel_path`, `position`, `pinned_at`; ordered shortcuts shown in the folder tree and `Ctrl+P` |
| `folder_view_state` | `library_id`, `folder_id`, `sort_json`, `filters_json`, `thumbnail_size`, `grid_mode`, `include_subfolders`, `updated_at`; restores the last browsing presentation for each folder (GAL-22) |
| `search_history` | `id`, `library_id`, `query`, `mode`, `ts` — capped at 50 per library |
| `cropper_versions` | `id`, `label`, `script_path`, `version_string`, `script_sha256`, `params_json`, `is_default` |
| `run_stats` | `stage_id`, `library_type`, `device`, `items`, `seconds`, `ts` — used for time estimates (D-49) |

## 5.2 Common catalog schema (one separate `catalog.db` per library)
| Table | Columns / meaning |
|---|---|
| `folders` | `id`, `parent_id`, `root_id`, `rel_path`, `name`, `count_direct`, `count_recursive`, `dir_mtime_ns`, `last_checked_at`, `policy_decompose` (`on`\|`off`\|`inherit`), `policy_ocr` (…), `policy_embeddings` (…) |
| `items` | `id`, `folder_id`, `container_id` (null in v1; reserved for archives, §5.6), `entry_name`, `rel_path`, `kind` (`image` for the committed v1 image-library workflow; preserve `video`/`audio` only if Phase 0 proves those are working existing capabilities that must be retained), `format`, `bytes`, `width`, `height`, `mtime_ns`, `fingerprint` (size+mtime+first-64KB hash, cheap), `content_hash` (nullable, computed lazily in background), `dominant_color` (3 bytes), `added_at`, `missing` (bool), `rating` (0–5), `favourite` (bool), `notes` (text), optional `source_url`, `source_site`, `artist`, and nullable `perceptual_hash` (64-bit; generated only by an explicit duplicate scan) |
| `tags`, `item_tags` | Free-form tags on items (and on panels via `panel_tags`). |
| `stage_state` | `item_id`, `stage_id`, `status` (`done`\|`failed`\|`skipped`\|`stale`), `stage_version`, `finished_at`, `error_code`, `error_message`. Drives "skip completed" and folder status badges. |
| `search_text` (FTS5) | Indexed text per item: filename, tags, notes, plus type-specific text (below). Tokenizer `unicode61 remove_diacritics 2`; prefix indexes `2 3`. |
| `vector_sets` | `kind` (`text`\|`image`\|`audio`\|`video`\|`panel_text`\|`panel_image`), `model_id`, `config_hash`, `dim`, `dtype` (`f16`), `count`, `file`. A set whose `model_id`/`config_hash` differs from the current runtime is **incompatible** and counts as 0% coverage (`DAT-01`). |
| `duplicate_pairs` | `item_a_id`, `item_b_id` (canonical order), `method` (`exact`\|`perceptual`\|`embedding`), `score`, `review_state` (`unreviewed`\|`not_duplicate`\|`confirmed_related`), `updated_at`; review state never triggers file operations |

## 5.3 `catalog.db` — ComfyUI library tables
| Table | Columns / meaning |
|---|---|
| `comfy_meta` | `item_id`, `positive_prompt`, `negative_prompt`, `model`, `loras_json` (name+weight list), `sampler`, `scheduler`, `steps`, `cfg`, `seed`, `denoise`, `gen_width`, `gen_height`, `generated_at` (if present), `has_workflow` (bool). Fields that are absent in the file are **NULL** and never rendered (`INS-03`). |
| `comfy_workflow` | `item_id`, `workflow_json_zstd` — stored separately so list/detail queries never load it. |

`search_text` for ComfyUI: positive prompt, negative prompt (lower weight), model, LoRA names, sampler, filename, tags, notes.

## 5.4 `catalog.db` — Comic library tables
| Table | Columns / meaning |
|---|---|
| `series` | `folder_id`, `title`, `reading_direction` (`ltr`\|`rtl`, default `ltr`), `notes`, `cover_item_id` (default = first page) |
| `panel_sets` | One row per page: `page_item_id`, `status`, `cropper_version_id`, `params_hash`, `page_fingerprint` (at decomposition time), `flags_json`, `user_edited` (bool), `accepted_at`, `include_in_golden_set` (bool), `spread_split_x` (nullable int, page px), `slice_json` (nullable; webtoon slice boundaries), `order_manual` (bool) |
| `panels` | `id`, `page_item_id`, `idx`, `x`, `y`, `w`, `h` (page pixels), `reading_order`, `source` (`cropper`\|`manual`\|`whole_page`), `detected_box_json` (the cropper's original box, never changed), `edited` (bool) |
| `panel_tags` | tags on panels |
| `regions` | `id`, `page_item_id`, `panel_id` (nullable), `x`,`y`,`w`,`h` (page pixels), `order_idx`, `machine_text`, `machine_conf` (0–100), `manual_text` (nullable), `manual_at`, `reviewed` (bool), `reviewed_at`, `ink_measured_hex`, `ink_measured_reliability` (0–4), `ink_manual_hex` (nullable), `ink_approved` (bool), `ocr_engine`, `ocr_version`, `orphaned` (bool) |

`panel_sets.status` values (state machine in §8.3): `none`, `queued`, `running`, `proposed`, `accepted`, `no_panels_found`, `stale`, `failed`.

`search_text` for comics: filename, series title, tags, notes, and **the effective text of every region** on the page (effective text = `manual_text` if present, else `machine_text`), reading-ordered. A second FTS table `panel_search_text` indexes the same per panel. (`DAT-02`)

## 5.5 `lab.db` (comic libraries)
`lab_runs(id, created_at, name, cropper_a, cropper_b, page_source, note)`, `lab_results(run_id, page_item_id, version_tag, boxes_json, metrics_json)`. Nothing in `lab.db` ever changes `panels` or `panel_sets` (`DAT-03`).

## 5.6 Page-source abstraction (CBZ-ready)
- `DAT-04` An item is identified by `(library_id, container_rel_path | null, entry_name)`. In v1 `container_rel_path` is always null.
- `DAT-05` The backend exposes a `PageSource` interface with `list()`, `open(entry) → stream`, `fingerprint(entry)`. v1 ships `FolderSource` only.
- `DAT-06` The UI MUST display `item.display_path` (supplied by the backend) and never assume it is a filesystem path. "Reveal in Explorer" calls the backend, which reveals the file or, for a future archive item, the archive.
- `DAT-07` (`DEFERRED`) `ArchiveSource` for `.cbz` (zip). Random access by entry; thumbnails/previews/panels work unchanged because they go through `PageSource`.

## 5.7 Statuses shown in the UI
Per item, per stage, the UI shows exactly one of: **Not processed** (no `stage_state` row), **Done**, **Failed**, **Skipped**, **Stale**. A folder's badge (`LIB-06`) is derived: **Not processed** (0% done), **Partial** (>0% and <100%), **Done** (100%), **Has failures** (≥1 failed). Never display "complete" for a partial folder.

---

# 6. Application shell and navigation

## 6.1 Layout (all screens)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ native Windows title bar                                                      │
├──────┬───────────────────────────────────────────────────────────────────────┤
│ RAIL │ TOP BAR (44 px): [Library ▾] [breadcrumb…] ····· [search /] [View ▾] [System ●] │
│ 56 / ├────────────┬───────────────────────────────────────────┬──────────────┤
│ 200  │ FOLDER TREE│ MAIN SURFACE                              │ INSPECTOR    │
│ px   │ 260 (200–  │ (gallery / search / viewer / review /     │ 360 (300–    │
│      │ 420)       │  pipeline / settings)                     │ 560)         │
│      │ toggle: B  │                                           │ toggle: I    │
│      ├────────────┴───────────────────────────────────────────┴──────────────┤
│      │ TRAY (28 px collapsed; 280 px expanded): status · job progress · selection │
└──────┴───────────────────────────────────────────────────────────────────────┘
```

| ID | Rule |
|---|---|
| `NAV-01` | The **rail** has five destinations in this order: **Explore**, **Search**, **Review**, **Pipeline**; then, anchored at the bottom, **Settings**. A collapse button sits under Settings. Expanded width 200 px (icon + label); collapsed width 56 px (icon + tooltip). |
| `NAV-02` | The rail shows a **count badge** on Review (items in Needs Attention, capped display "999+") and a **progress ring** on Pipeline while a job runs. No other badges. |
| `NAV-03` | Rail default state: expanded when window width ≥ 1280 px, collapsed below. A user's manual choice overrides this (setting `appearance.rail`: `auto`\|`expanded`\|`collapsed`). |
| `NAV-04` | The **folder tree** and **inspector** are toggleable with `B` and `I` (when focus is not in a text field) and via the View menu. Each remembers its width and open/closed state **per screen type** (Explore, Search, Review). |
| `NAV-05` | Panels are resizable: drag the 4-px handle; or focus the handle and press ←/→ (16 px steps; Shift = 64 px); double-click resets to default. Limits: tree 200–420 px, inspector 300–560 px. The main surface MUST keep ≥ 420 px; if not, the inspector (then the tree) turns into an overlay drawer (see `NAV-06`). |
| `NAV-06` | **Responsive breakpoints** (window inner width): **XS** < 900 (not supported; app enforces 900 minimum), **S** 900–1279: rail collapsed; tree and inspector are **overlay drawers** (slide over the main surface, close on Esc or outside click); **M** 1280–1679: tree and inspector docked, but only one docked by default (inspector); **L** ≥ 1680: both docked by default. Layout MUST NOT overflow, clip controls, or scroll the page body at 900×600, 1100×680, 1366×768, 1920×1080. |
| `NAV-07` | The **tray** (bottom, 28 px) shows, left to right: system state text ("Ready", or the running job's one-line summary with Pause/Stop buttons), then, right-aligned, "N selected" when a selection exists. Clicking the tray or pressing `Ctrl+J` expands the **job drawer** (§7.9) to 280 px height; Esc collapses it. |
| `NAV-08` | The native Windows title bar is used (D-65). Browser zoom is disabled in the exe (`Ctrl+wheel` and `Ctrl+±` do not zoom the page); the **text scale** setting replaces it (`VIS-09`). |

## 6.2 Top bar
| ID | Element | Behaviour |
|---|---|---|
| `NAV-10` | **Library switcher** (left) | Shows library type icon + name + chevron. Opens the Library menu (§7.5): list of libraries, "Add library…", "Manage libraries…". Shortcut `Ctrl+Shift+L`. |
| `NAV-11` | **Breadcrumb** | `Library › Folder › Subfolder` in Explore; `Library › Search "query"` in Search; `Library › … › filename` in Viewer; each segment is clickable. Long paths collapse middle segments to "…" with a menu. |
| `NAV-12` | **Search field** (right) | Placeholder "Search library…  /". `/` focuses it (when not in a text field). Enter opens the Search page with that text in the library's default search mode. It does not search inline. |
| `NAV-13` | **View menu** (replaces the old "Options" button — `VERIFY` what the old button contained and carry every item over) | Popover with: theme, density, text scale, thumbnail size, grid mode (uniform/rows), card overlay (hover/always/never), and "All settings…". Changes here are **app-scope** unless the current folder/library already overrides them, in which case the popover shows "Overridden for this folder — Reset". |
| `NAV-14` | **System chip** (far right) | A dot + label. Dot meanings: grey = idle/not started, green = ready or running normally, amber = degraded (read-only, runtime stopped but needed), red = error. Click opens the System popover (§6.5). The chip replaces the old "model: stopped" pill **and** the old "Ready/stopped" footer. |

## 6.3 History, restore and state
| ID | Rule |
|---|---|
| `NAV-20` | **Back/Forward**: `Alt+←` / `Alt+→`, mouse back/forward buttons, and ◀ ▶ buttons at the left of the breadcrumb. A history entry is pushed when the **view** changes: library, destination (Explore/Search/Review/Pipeline/Settings), folder, search query/mode/scope, viewer open (item), review item. Selection and scroll position are **saved inside** each entry and restored on Back; they are not entries. History depth: 100. |
| `NAV-21` | `Esc` closes the deepest safe transient layer in this order: peek → overlay drawer → clean dialog → viewer → selection. It never navigates between destinations. **Safety guards outrank generic Escape behaviour:** if a Review editor has unsaved changes, `Esc` chooses **Stay** and leaves the draft unchanged; it does not discard the draft or bypass the Save / Discard / Stay guard. A dialog with unsaved input must ask before closing. Escape behaviour in a focused text field is defined by that screen's requirements and must not be hard-coded differently by individual components. |
| `NAV-22` | **Restore on launch**: library, destination, folder, sort, filters, thumbnail size, panel open/closed states, selection (last selected item only) and scroll position are restored from the snapshot (§14.3). If the last folder no longer exists, open the library root and show toast "Folder not found: <name>". |
| `NAV-23` | **Quick switcher** `Ctrl+P`: a palette containing libraries, pinned folders, folders of the active library, saved searches, smart collections, and the 10 most recent views. Typing filters with fuzzy match; Enter navigates. Pinned folders are shortcuts only; pinning never changes scope or starts work. |
| `NAV-24` | **Command palette** `Ctrl+K` (D-82): lists every action in the action registry (§6.4) that is enabled in the current context, plus settings by name, plus "Search for “<text>” in <library>" as the first result when text is typed (this preserves the old app's `Ctrl+K` = search habit). Disabled actions are shown greyed with the reason ("Select an image first"). |
| `NAV-25` | **Shortcuts overlay**: `?` (outside text fields) opens a read-only, searchable list generated from the action registry (never hand-written). |
| `NAV-26` | **Single-letter shortcuts** (`B`, `I`, `F`, `C`, `X`, `R`, `H`, `P`, `Q`, `D`, `M`, `S`) are active only when keyboard focus is not in a text input, textarea, select, or contenteditable. |
| `NAV-27` | Every destination remembers its own last state while the app runs: switching Explore → Pipeline → Explore returns to the same folder, scroll position and selection. |

## 6.4 Action registry
- `NAV-30` Every user-invocable action is registered once with: `id`, `label`, `icon`, `shortcut` (optional), `contexts` (where it is available), `enabledWhen(state) → {enabled, reason}`, `run(ctx)`.
- `NAV-31` The command palette, shortcut overlay, menu bars, buttons with shortcuts, tooltips ("Compare (C)") and right-click menus MUST all read from the registry. No component may hard-code a shortcut.
- `NAV-32` A lint/test rule fails the build when two actions share a shortcut in overlapping contexts.

## 6.5 System popover (`NAV-14`)
Rows, in order:
1. **Library** — "Open" / "Read-only (locked by another process)" / "Updating…".
2. **Model runtime** — state (`Stopped`, `Starting`, `Ready`, `Busy`, `Stopping`, `Error`), device ("CPU", "Radeon Graphics (iGPU)", or a named GPU), button **Start** / **Stop**.
3. **Worker** — `Not started` / `Idle` / `Busy` (with current stage name).
4. **Caches** — "Thumbnails 213 MB · Previews 1.2 GB of 2 GB".
5. Link: **Open Diagnostics**.

## 6.6 Context menus (D-82)
- `NAV-40` Right-click (and the Menu key) on a gallery item, a selection, a panel, a region, a folder in the tree, or a saved search opens a context menu generated from the registry for that target.
- `NAV-41` Standard items for a **gallery item or selection**: Open · Peek · Find similar · Compare (2–4 selected) · Copy image · Copy path · Copy prompt (ComfyUI, if present) · Copy workflow JSON (ComfyUI, if present) · Reveal in Explorer · Tag… · Rate · Favourite · (comic) Decompose · Run OCR · Show parent page · Export panels….
- `NAV-42` Standard items for a **folder**: Browse · Pin/Unpin · Select for Pipeline… · Check for new files · Folder policies… · Watch for changes (toggle; notifications only) · Copy path · Reveal in Explorer.
- `NAV-43` Context menus MUST show the shortcut next to each item and MUST be fully operable by keyboard.

## 6.7 Undo (D-12, D-44)
- `NAV-50` A global undo/redo stack (`Ctrl+Z` / `Ctrl+Shift+Z`, 100 entries) covers: tag add/remove, rating, favourite, notes edit, region create/delete/merge/split/move/resize, region text edit **after save**, panel create/delete/merge/split/move/resize, panel reorder, mark reviewed. It does **not** cover jobs.
- `NAV-51` Reversible actions never show a confirmation dialog; they show a toast with **Undo** for 8 seconds. Irreversible or destructive actions (remove library, clear caches, replace manual boxes during re-decompose) show a confirmation dialog stating exactly what will and will not happen.
- `NAV-52` An **Undo history** list is available in the palette ("Show undo history") for the current session.

---

# 7. Screens

Every screen below lists: purpose, layout, rules (with IDs), and its states (the full catalogue of messages is in §16).

## 7.1 Explore (gallery)

**Purpose:** browse a library's images by folder, and select them for inspection, viewing, comparison or processing.

**Layout:** `[Folder tree] [Gallery] [Inspector]` (§6.1). The gallery has a 40 px **toolbar** and the **grid**.

**Toolbar, left to right:**
1. *(comic libraries only)* **Scope toggle** `Pages | Panels | Both` (GAL-19).
2. **Subfolders** toggle (default on).
3. **Sort** dropdown + direction button.
4. **Filter chips** and a **Filters** button (facet popover).
5. *(right-aligned)* **Count text**, **Thumbnail size** slider (96–320 px, step 12, default 180), **Grid mode** toggle (Uniform | Rows).

| ID | Rule |
|---|---|
| `GAL-01` | On launch Explore opens the **last-used folder** (D-20). If there is none, it opens the library root. |
| `GAL-02` | The grid is **virtualised**: it renders only the cells within the viewport plus **2 viewport heights** of overscan above and below. Items are fetched in pages of **200** by keyset pagination (`ARC-06`); the next page is requested when the viewport is within **2 viewport heights** of the loaded end. |
| `GAL-03` | The grid MUST NOT silently show a partial list. The count text is always visible; while the next page loads, a skeleton row appears at the end; if a page fails, an inline row says "Couldn't load more images. [Retry]". The original bug (only 5–7 images shown) is a regression test: a folder of 412 items MUST be fully reachable by scrolling or `End` (`TST-10`). |
| `GAL-04` | **Count text:** unfiltered folder: "412 images" (exact). With filters: "37 of 412". Library root: "12,043 images". If the backend cannot return an exact count in 150 ms, show "1,000+" (cap 10,000) and replace it with the exact number when ready. In Both scope: "30 pages · 118 panels". |
| `GAL-05` | **Uniform mode:** every cell is a square of the chosen size; image `object-fit: cover`; `object-position: center`, except images with aspect ratio taller than 1:2.5 use `top`. **Rows mode:** justified rows with row height = chosen size, row width = container width; the last row is not stretched. Both modes compute layout from stored `width`/`height`, so layout never waits for image decoding and never shifts when images load. |
| `GAL-06` | Gap between cells: compact 4 px, comfortable 8 px, spacious 12 px. |
| `GAL-07` | **Card content (D-22):** image only. On hover or keyboard focus, a 28 px **solid** bar (`rgba(0,0,0,0.72)`, no gradient) appears at the bottom with the filename (middle-truncated) and dimensions. **Badges** (16 px icons, top-right, always visible when applicable, max 3, overflow shown as "+N"): favourite ★; comic page decomposed (panels icon + count); needs review (flag); stale (clock); failed (alert); file missing (file-x). **Checkbox** (top-left) appears on hover/focus or whenever any selection exists. Badges always have an accessible name and a tooltip; colour is never the only signal. |
| `GAL-08` | Before its thumbnail decodes, a cell shows a solid fill of the item's `dominant_color`; the thumbnail then fades in over 120 ms. |
| `GAL-09` | **Selection (D-21, D-83):** click selects one; `Ctrl+click` toggles; `Shift+click` selects a range; `X` toggles the focused item; `Shift+←→↑↓` extends; `Ctrl+A` selects all **loaded** items and shows an action "Select all 12,043 in this view" when more exist; `Esc` clears. **Lasso:** press and drag on empty space (gap, margin or below the last row) to draw a rectangle; items it touches are selected; `Ctrl` adds to the existing selection; dragging within 48 px of the top/bottom edge auto-scrolls at up to 1,200 px/s. Dragging a card does nothing in v1. |
| `GAL-10` | **Keyboard:** the grid is a single Tab stop (roving tabindex). `←→` move by one cell; `↑↓` by one row; `Home`/`End` first/last loaded item; `PageUp`/`PageDown` by one viewport; `Enter` opens the viewer; `Space` peeks (GAL-11). When sort is by filename, typing letters jumps to the first item whose name starts with the typed prefix (buffer resets after 800 ms). |
| `GAL-11` | **Peek:** `Space` opens a centred overlay (70% of the main surface) showing the 1280 px preview and the filename. `←/→` change the selected item and update the peek. `Space` or `Esc` closes it. No zoom in peek. |
| `GAL-12` | Double-click or `Enter` opens the viewer (§7.3). Opening MUST NOT change the sequence: the viewer's previous/next walk the same result list (folder, filters, sort) the gallery shows. |
| `GAL-13` | **Sort options.** ComfyUI: *Newest first* (default, file modified), *Oldest first*, *Filename A–Z*, *Filename Z–A*, *Generated date* (only if present), *Size*, *Dimensions*. Comic pages: *Page order* (natural filename order; default), *Newest first*, *Filename*. Sort is stored at **folder scope** (D-04). Changing sort restarts pagination, keeps the selection, and scrolls to the selected item if it is in the new result. |
| `GAL-14` | **Filters (facets), ComfyUI:** Model, LoRA, Sampler, Date (file modified range), Dimensions (min width/height), Has workflow, Favourite, Rating ≥, Tag, Processing status (thumbnails / metadata / embeddings: done or not). **Comic:** Series, Panels (decomposed / not decomposed / no panels found / stale), Text (OCR done / not done / needs review), Reviewed, Tag, Rating, Favourite. Each facet lists values with live counts; counts that cannot be computed within 150 ms are omitted rather than shown wrong. Active filters appear as removable chips under the toolbar; a **Clear all** button appears when ≥ 1 filter is active. |
| `GAL-15` | Selecting a folder in the tree sets the folder filter. **Subfolders** on (default) includes descendants. Selecting the library root ("All items") shows everything. Folder selection is **browse only**; it never starts work (PRD-06). |
| `GAL-16` | **Round trip:** after opening the viewer and returning, scroll position, selection and keyboard focus are restored within one frame. |
| `GAL-17` | **Resize:** cell size stays constant; the number of columns changes; the first visible item stays in view (scroll anchoring). Thumbnails are never stretched or distorted. |
| `GAL-18` | **Comic library root = Series grid.** One card per top-level folder: cover (first page unless changed), title, "30 pages", and a status line: *Not decomposed* / *Decomposed 30/30* / *OCR 30/30* / *N need review*. Click opens that series' pages (breadcrumb `Library › Series`). Context menu: Open in reader, Decompose series, Run OCR, Series settings (title, reading direction, cover), Reveal in Explorer. |
| `GAL-19` | **Scope toggle (D-57):** *Pages* (default), *Panels*, *Both*. **Panels:** each panel is a card using `cp-thumb://…/p/<id>`, ordered by page then reading order; hover bar shows `p12 · #3`; a "panel" badge is the first top-right badge. **Both:** each page card is followed by its panel cards; panel cards carry a 2 px left edge line (accent colour if set, else white) and the panel badge. Counts follow GAL-04. |
| `GAL-20` | **Parent chip:** on panel cards (hover bar), in the panel inspector, and in the viewer bar, a chip "Page 12 · Series" links to the parent. Click (or `Alt+↑`) switches scope to Pages, scrolls to that page, selects it, and highlights the panel in the inspector's Panels list. |
| `GAL-21` | **Folder status badges** in the tree follow §5.7. A folder that has never been checked shows "Not checked" and, in the grid, the empty state STA-03. |
| `GAL-22` | **Per-folder view memory:** for each `(library_id, folder_id)`, persist the last sort/direction, thumbnail size, grid mode, active filter chips and Subfolders toggle. Restore these when returning to that folder, including after an app restart. Store this state through the application database/backend, never `localStorage`. When a saved filter is not available for the current library type, retain the other state, drop only the incompatible filter, and show a one-time message naming the removed filter. This memory is view state, not a processing policy. |
| `GAL-23` | **Selection action bar:** while one or more items are selected, show a compact, sticky bar directly below the gallery toolbar (not a floating overlay over image content): `N selected`, **Tag…**, **Rate**, **Favourite**, **Copy paths**, **Add to Pipeline scope**, **Compare** (enabled only for 2–4 compatible selections), **Export panels…** (Comic only), **Copy prompts** (ComfyUI-only selection), **Run OCR…** (Comic only; opens Pipeline prefilled and never starts a job), and **Clear selection**. Actions that cannot apply to the current selection remain disabled with a reason. The inspector's multi-selection summary mirrors the applicable actions; it is not a second implementation of the action logic. |

**States:** loading (skeleton cells, no spinner for the first 200 ms), empty library (STA-01), empty folder (STA-02), folder not checked (STA-03), filters hide everything (STA-04), error loading (STA-05), file missing (STA-12). See §16.

## 7.2 Inspector

**Purpose:** explain the selected item without leaving the gallery. Docked right (toggle `I`) or an overlay drawer on narrow windows (NAV-06).

| ID | Rule |
|---|---|
| `INS-01` | One selected item → full inspector. **Multiple** selected → a summary card "N items selected" with batch actions: Tag…, Rate, Favourite, Compare (if 2–4), Add to Pipeline scope, Copy paths, Export panels… (comic). No metadata is merged or averaged. **Nothing selected** → "Select an image to inspect it." |
| `INS-02` | **Section order, ComfyUI item:** Preview · File · Generation · Workflow · Tags & notes · Processing. Each section is a heading with a toggle button; open/closed state is remembered. |
| `INS-03` | **Absent data is never shown.** A field with no value is hidden; a section with no visible fields is hidden. Only Preview and File are always shown. |
| `INS-04` | **Preview:** width = inspector width − 32 px; height up to 60% of the inspector height; `object-fit: contain`; source `cp-prev` (1280 px). While loading it shows the already-cached thumbnail scaled up with a "Loading preview…" caption (never a blank box). Click opens the viewer. |
| `INS-05` | **File:** Name (copy), Folder (`display_path`; copy; reveal), Format, Dimensions (`w × h`), Size (MB, one decimal), Modified, Added to library. |
| `INS-05a` | **Comic source details:** when present, show Source URL (clicking opens the system browser only after an explicit click), Source site, and Artist/creator. These fields are optional and user-entered/imported from local metadata; ComfyPanel Studio performs no online lookup and does not fetch page contents. Missing values are hidden. URL text can be copied without opening it. |
| `INS-06` | **Generation:** Positive prompt (6 lines then "Show more"; wraps; **Copy**; **Search this prompt**), Negative prompt (collapsed by default; same controls), Model, LoRAs (one per line "name · weight"), Sampler, Scheduler, Steps, CFG, Seed (copy), Denoise. Two-column label/value layout; label column 96 px. |
| `INS-07` | **Workflow** (only when `has_workflow`): collapsed by default; shows node count; **Copy workflow JSON**; **View JSON** (read-only dialog with in-dialog search). The JSON is fetched from `comfy_workflow` only when the user asks. |
| `INS-08` | **Tags & notes:** tag chips (type + `Enter`; autocomplete from existing tags; `Backspace` removes the last chip), Rating (0–5 stars; keys `0`–`5` when the rating control is focused), Favourite toggle, Notes textarea with autosave 2 s after typing stops and on blur, showing "Saving…" → "Saved" or "Couldn't save — [Retry]" (the text stays in the field). |
| `INS-09` | **Processing:** one line per stage with icon + text status (Done / Failed / Skipped / Stale / Not processed) and time. A failed stage shows the error and **Retry this stage**, which creates a job scoped to that one item. |
| `INS-10` | **Comic page sections:** Preview (with toggles **Show panels** `H` and **Show text regions**) · File · Panels · Text · Tags & notes · Processing. *Panels:* status line (e.g. "Decomposed — 6 panels", "No panels found", "Stale"), a list of panel rows (thumbnail, `#idx`, size), and buttons **Decompose** / **Re-decompose** / **Edit panels**. *Text:* effective text grouped by panel in reading order, then page-level regions; **Edit in Review** opens Review at this page. |
| `INS-11` | **Comic panel selected (Panels scope):** Preview (crop), parent chip (GAL-20), Box (x, y, w, h, reading order), Text (regions inside the panel), Tags, and the parent page’s rating, favourite and flag (read-only here; panels have tags but no rating of their own). |
| `INS-12` | Selecting an item MUST only fetch the item detail record and its preview. It MUST NOT trigger generation of anything else (PRD-06). |
| `INS-13` | If the preview cannot be produced: placeholder with the reason (STA-12/STA-13) and **Retry** / **Reveal in Explorer**. |

## 7.3 Viewer

**Purpose:** look at one image properly, step through a result set, and keep your place.

| ID | Rule |
|---|---|
| `VWR-01` | Opened by double-click, `Enter`, or "Open". It is a full **main-surface overlay** (covers tree and inspector; rail, top bar and tray stay) and a history entry: Back/`Esc` closes it. |
| `VWR-02` | **Viewer bar** (40 px): `◀ Prev`, `▶ Next`, position "37 of 412" ("37 of 1,000+" while total unknown), filename, spacer, **Zoom** `[−] [Fit] [100%] [+]` with a live percentage, **Info** toggle `I`, **Close** `Esc`. For comic panels the parent chip is shown after the filename. |
| `VWR-03` | **Loading order:** (1) the cached 1280 px preview, or the thumbnail scaled up with a "Loading…" caption if the preview is not cached; (2) the **original** (`cp-orig`) is requested when the zoom exceeds Fit **or** the canvas needs more device pixels than the preview provides on its long side. The original is decoded off-screen and swapped in within one frame, with no flicker or position jump. While loading, the bar shows "Loading full resolution…". |
| `VWR-04` | **Zoom (D-23):** discrete levels 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400, 800%. Controlled by the buttons and by the keys `+`, `−`, `0` (Fit), `1` (100%). **There is no mouse-wheel, Ctrl+wheel, pinch or double-click zoom.** **Fit** scales to contain and never upscales beyond 100% (setting `browse.fitUpscale`, default off). When zoomed in, the mouse wheel scrolls vertically (`Shift+wheel` horizontally) and dragging with the primary button pans. Zoom resets to Fit when moving to another image (setting `browse.keepZoomBetweenImages`, default off). |
| `VWR-05` | **Previous/next:** `←` `→` (also `PageUp`/`PageDown`); `Home`/`End` jump to the first/last **loaded** item. The sequence is the current result list including filters and sort, **across page boundaries**: when the next item is beyond the loaded page, the viewer requests the next page, shows a spinner in the bar, and queues at most one pending move. At the true end, Next is disabled with the tooltip "Last image". |
| `VWR-06` | **Prefetch:** after displaying item N, request previews for N±2 at low priority; cancel requests that are > 2 away. Originals are never prefetched. |
| `VWR-07` | **Synchronisation:** moving in the viewer changes the selection (and the inspector). Closing returns to the gallery with that item selected and scrolled into view (centred if it was off-screen). |
| `VWR-08` | **Info panel:** the inspector content for the current item minus its Preview section; width 360 px; toggle `I`; remembered per screen type. |
| `VWR-09` | `Ctrl+C` copies the image to the clipboard; `Ctrl+Shift+C` copies the path. `F11` toggles full-screen; in full-screen the viewer bar auto-hides after 2 s of no pointer/keyboard activity and reappears on movement. |
| `VWR-10` | **Errors:** original missing → canvas shows "File not found: <display_path>" with **Reveal folder** and **Retry**; if a preview or thumbnail is cached it is still shown with a banner "Showing cached preview — the original file is missing." The viewer never shows an indefinite blank or a stale image from another item. |
| `VWR-11` | **Comic pages:** a **Reader** button (and `P`) switches to the reading view (§8.9). |

## 7.4 Compare

| ID | Rule |
|---|---|
| `CMP-01` | `C` (or "Compare" in menus) with **2–4** selected items opens Compare as a history entry. Layout: 2 → side by side; 3 → three columns; 4 → 2 × 2. With > 4 selected, the action is disabled with the reason "Select 2–4 images". |
| `CMP-02` | Each pane shows the 1280 px preview at Fit, the filename, and a ✕ that removes it from the comparison (minimum 2 remain). **Link zoom/pan** (`L`, default on) keeps all panes at the same zoom and offset. Zoom controls and keys match VWR-04. Originals load per VWR-03. |
| `CMP-03` | **Metadata diff** (toggle `D`, default open): a table below the panes. ComfyUI rows: positive prompt, negative prompt, model, LoRAs, sampler, scheduler, steps, CFG, seed, generated size. A cell that differs from pane 1 is marked with a **≠ icon and bold text** (never colour alone). Identical rows collapse under "Same in all (N)". Prompt cells show a word-level diff: removed words struck through, added words underlined. |
| `CMP-04` | For comic pages or panels, Compare shows images only plus status fields (decomposed state, OCR state). |
| `CMP-05` | `Esc` returns to the previous view with the selection intact. |

## 7.5 Libraries and folders

| ID | Rule |
|---|---|
| `LIB-01` | **Library menu** (top-left): each library shows type icon, name, item count and a **health ring**. The ring is exactly the percentage of catalogued image/page items with both metadata and thumbnail stages `done`; missing items and failures are separately shown in the row and are not counted as complete. Comic libraries additionally show Panels % and OCR % in Manage libraries. Footer: **Add library…**, **Manage libraries…**. |
| `LIB-02` | **Manage libraries** dialog (min 720 × 480): table with Name, Type, Roots, Items, Health (Thumbnails %, Metadata %, Embeddings %; comic adds Panels % and OCR %), Last opened. Row actions: **Open, Rename, Add/remove root folder, Exclusions, Change type, Remove**. |
| `LIB-03` | **Add library wizard**, four steps. (1) *Folder(s):* native picker; multiple roots allowed; shows a shallow file count capped at 10,000 and 2 s ("10,000+"). (2) *Type:* **ComfyUI images** or **Comic / manhwa pages**, each with a one-line description; **no default is preselected** (D-33). (3) *Name:* defaults to the folder name; must be unique. (4) *First processing:* radio — **Just add it, I'll process later** (default) · **Quick** · **Full** (ComfyUI) or **Comic** (comic). Summary text states exactly what will happen. **Create** makes the database files; **no scanning happens unless a preset was chosen in step 4.** |
| `LIB-04` | **Remove library** confirmation text: "Remove “<name>” from ComfyPanel Studio? This deletes its catalog, thumbnails, previews and vectors (about <N> MB). **Your image files are not touched.** Your tags, ratings, notes, text corrections and panel edits in this library will also be deleted." Links: **Export corrections…** (JSON). Buttons: **Cancel** (default focus), **Remove**. |
| `LIB-05` | **Change type** is a catalog migration, never a file operation. It first shows the current type, target type, root folders affected, data that will be retained, data that will be regenerated, and type-specific data that cannot map. It makes a verified backup before enabling **Start now**. For Comic → ComfyUI, panel sets, panels, regions, OCR corrections and lettering annotations are exported in a recovery bundle and then removed from the new-type catalog only after explicit confirmation; they are never silently discarded. For a single root changing type, the wizard instead offers **Move this root to another/new library** and leaves the source library data intact until the user separately removes it. Re-index starts only after **Start now**; **Later** records the requested type change as pending and keeps the old type active until the user resumes. Original files are never moved. (D-34) |
| `LIB-06` | **Folder tree rows:** chevron, folder icon, name, recursive item count, and a status icon + tooltip (Not processed / Partial / Done / Has failures; §5.7). Keyboard: `↑↓` move, `→` expand, `←` collapse, `Enter` select, type-ahead by name. A star/fill affordance and context action pin/unpin a folder into quick access; pin state is not the same as selection or processing scope. |
| `LIB-07` | The tree component has two modes: **Browse** (single-select; Explore, Search) and **Select** (tri-state checkboxes; Pipeline scope, Folder policies). Checking a folder checks all descendants; partially checked parents show the mixed state. |
| `LIB-08` | **Browse selection and Pipeline selection are separate state.** Changing one never changes the other, and neither changes the active library (the brief's requirement that OCR scope be independent of the folder being browsed). Pipeline offers a **Selected in Explore** shortcut button that *copies* the browse selection once. |
| `LIB-09` | Tree top level: **All items** (library root); with several roots, each root is a top-level node beneath it. |
| `LIB-10` | **Folder policies** dialog (right-click → "Folder policies…"): per folder — *Decompose* (comic), *OCR*, *Embeddings*: `On` / `Off` / `Inherit`; "Inherit" shows the effective value and where it comes from ("from library"). Policies never start work by themselves; they are used only by the **Use folder policies** preset (PIP-11). |
| `LIB-11` | **Check for new files** (D-13) is a job of kind `discover` started by the user (banner, tree context menu, tray, palette). It compares directory/file modification times against the catalog and produces a **report**: *N new, N changed, N missing*. The catalog is **not** modified until the user chooses: **Add & process…** (opens Pipeline with scope = affected folders and a preset picker), **Add to catalog only** (new items get thumbnails/metadata stages marked "Not processed"), **Mark missing** (sets `missing`), or **Dismiss**. Changed files become **Stale** only when the user applies the report. |
| `LIB-12` | **Launch banner:** 3 s after first paint, if the library's `ask_on_launch` is `ask` and no check has run this session, a non-modal banner appears under the top bar: "Check for new files in “<name>”?  **[Check now]  [Not now]  [Never ask for this library]**". It appears at most once per library per session, never auto-dismisses, and never blocks input. It does not walk the disk until the user clicks **Check now**. |
| `WCH-01` | **Watch for changes** is an opt-in toggle on a library root (`watch_enabled`, default off). While the app is open, a watcher can report that files were added, modified or removed under that root. It must debounce event bursts and show one non-modal notification per affected root, not one notification per file. The watcher does not add items to the catalog, mark items missing, generate thumbnails, OCR, decompose panels, or create embeddings. |
| `WCH-02` | Notification text is explicit: **“Changes detected in <folder>. Review the file changes?”** Actions: **Review changes** (runs the same dry-run report as LIB-11), **Later** (keeps a badge in the folder tree), **Turn off watching**. The user must approve the LIB-11 report before catalog state changes. |
| `WCH-03` | Watchers run only while the main application is open. There is no hidden service, startup daemon, or network listener. Closing the app stops watchers. The existing launch policy `ask` remains independently available; disabling launch prompts does not imply that filesystem watching is enabled. |

## 7.6 Search

**Purpose:** find images by words, meaning, appearance or likeness, and keep the result set navigable.

**Layout (top to bottom):**
1. **Query bar** (44 px, 16 px text) with **Search settings** (gear) and **Save search** (bookmark) at its right.
2. **Mode control:** `Smart | Exact | Similar`.
3. **Scope row:** library scope `This library ▾ | All libraries`; comic libraries add `Pages | Panels | Both`.
4. **Filter chips** + **Filters** button.
5. **Signal line** (SRC-07).
6. **Result header** (count, sort) and the **shared gallery** (all GAL, INS, VWR, CMP rules apply).

The left panel (toggle `B`) shows **Saved searches**, **Smart collections**, and **Recent searches** instead of the physical folder tree while Search is active.

| ID | Rule |
|---|---|
| `SRC-01` | Default mode is **Smart** (D-24). The previously used mode is *not* remembered across sessions unless `search.rememberMode` is on (default off). |
| `SRC-02` | **Smart** fuses available signals with reciprocal-rank fusion (RRF, `k = 60`): keyword/metadata (FTS5), semantic text embedding, and visual text→image embedding. The visual signal is a text-query-to-image-vector search; it does not imply that an arbitrary image has been selected. **Exact** = FTS only. **Similar** = nearest neighbours of an explicit reference item already in a library. A signal is eligible only if the library has compatible indexed data and the required runtime/query encoder is available. Missing, incompatible or unsupported signals are skipped and named in the signal line; they are never silently reported as complete. |
| `SRC-03` | **Query syntax** (Smart and Exact): bare words are AND-ed; `"quoted phrase"`; `-word` excludes; field tokens `model:` `lora:` `sampler:` `tag:` `folder:` `rating:>=3` `fav:yes` (ComfyUI) and `series:` `text:` `reviewed:no` (comic). Tokens become chips after `Enter`. An unknown field shows inline: "Unknown field “modl”. Did you mean model:?" |
| `SRC-04` | **Search settings** popover: *Sources* are type-aware. In a **ComfyUI** library show Prompt, Model/metadata, Filename and Notes & tags; do not show OCR text because the v1 ComfyUI pipeline has no OCR stage. In a **Comic/Manhwa** library show Filename, OCR text and Notes & tags; hide Prompt and Model/metadata because they do not apply to that library type. In **All libraries**, show common sources plus clearly labelled type-specific sources (`ComfyUI only` or `Comic only`); apply each only to compatible libraries and disclose per-library coverage in the signal line. **Batch candidates** is a legacy source control whose exact current query semantics are unknown from the supplied documents. Phase 0 MUST trace its UI control, request parameters, backend query and result meaning. Preserve the same semantics once found; until then, do not silently remove it or invent replacement behaviour, and do not mark the old search-source parity item complete. Also show *Result limit* (default 1,000) and *Similarity threshold* (off by default). When `search.advancedModes` is on, expose **Semantic only**, **Visual only (text → image)**, **Hybrid weights** (keyword / semantic / visual sliders, default 40 / 30 / 30) and **Comic text**. These modes preserve the old keyword, semantic, visual, similar, hybrid and `comic_text` capabilities (D-31). |
| `SRC-05` | **When searches run:** **Exact** runs live, 150 ms after the last keystroke. **Smart** runs on `Enter` only (semantic embedding costs CPU on the budget machine). **Similar** runs when the reference is set. |
| `SRC-06` | **Progressive results (D-73):** keyword results render first (budget B6). Semantic/visual results are merged when they arrive. **Re-ranking rule:** the list may re-rank silently only until the earlier of (a) the user's first interaction with the result list (hover > 300 ms, click, key press, scroll > 1 viewport) or (b) 1,500 ms after first render. After that, a chip above the grid reads "Better results available — **Update**"; clicking it applies the new order and scrolls to the top. Items the user has already selected never move. |
| `SRC-07` | **Signal line (honest status):** e.g. "Keyword ✓ 12,043 · Semantic 4,210 / 12,043 · Visual 4,210 / 12,043". If the runtime is stopped and needed: with `runtime.autoStart` on, the chip shows "Starting model… showing keyword results"; with it off: "Semantic search needs the model runtime. **[Start model]**". If coverage < 100%: "Semantic results cover 35% of this library. **[Index the rest…]**" which opens Pipeline pre-filled with *Embeddings only* and this library. |
| `SRC-08` | **Similar:** entered with `F` or "Find similar" on a selected item. The query bar becomes a **reference chip** (32 px thumbnail, filename, ✕). The reference can come only from the library (D-46): no file drop, no paste. Scope dropdown lists each library by name. **Cross-library (D-62):** from a ComfyUI image, choosing a comic library returns that library's panels (user can switch Pages/Panels/Both). |
| `SRC-09` | Results use the shared gallery: selection, inspector, viewer, compare and keyboard behave exactly as in Explore. The viewer's previous/next walk the **result order**. Back returns to Search with query, mode, scope, filters, scroll and selection intact (NAV-20). |
| `SRC-10` | Sort: **Relevance** (default), **Newest**, **Filename**. A score badge on cards appears only when sort = Relevance and `search.showScores` is on (default off). |
| `SRC-11` | **Saved searches (D-47):** **Save** opens a dialog: name (default = query text), checkbox *Pin to the left panel*, checkbox *Apply to all libraries*. A saved search stores query, mode, scope, filters and sort — not results. Click runs it; right-click: Rename, Duplicate, Delete (undo toast), Pin/Unpin. |
| `SRC-12` | **History:** last 50 searches per library, shown as a dropdown when the empty query bar is focused and in the left panel under *Recent*; ✕ removes one; **Clear history** removes all. `search.historyEnabled` off stops recording and hides both lists. |
| `SRC-13` | **No matches:** "No matches for “<query>” in <scope>." followed by only the applicable suggestions: **Clear N filters**, **Switch to Smart** (when in Exact), **Include panels** (when scope = Pages), **Include notes & tags**, **Search all libraries**. |
| `SRC-14` | **All libraries:** the query runs in each library's own database in parallel and results are merged by RRF. Each card gets a small library-type icon. Libraries that cannot be opened are listed under the header: "Skipped: <name> (<reason>)". A library that is read-only (locked) is still searched. |
| `SRC-16` | **Saved search vs smart collection:** a saved search stores query, mode, source selection, scope, filters and sort; it runs that same query when opened. A smart collection stores only rule-builder criteria and dynamically resolves matching items. The UI must label these separately and never silently convert one type to the other. |
| `SRC-15` | Search never starts indexing, embedding or OCR (PRD-06). The only side effect permitted is writing to `search_history` (when enabled) and, if `runtime.autoStart` is on, starting the model runtime. |

## 7.6.1 Smart collections (Explore and Search)

Smart collections are dynamic named views that sit alongside pinned folders and saved searches. They are not a separate top-level rail destination and do not duplicate or move files. They answer “show me every item that currently matches these rules”; saved searches answer “run this query and restore its search mode and parameters.”

| ID | Rule |
|---|---|
| `COL-01` | **Entry points:** Explore's left tree has a collapsible **Smart collections** group below pinned folders and above the physical folder tree. `Ctrl+P` can open any collection. Search's **Save search** is not relabelled as a smart collection; the user chooses **Save search** or **Create smart collection from filters** explicitly. |
| `COL-02` | **Create/edit dialog:** required name (1–80 characters, trimmed, unique within the current library scope); scope `This library` (default) or `All libraries`; a rule builder; sort order; **Pin in quick access** checkbox (default off). All-libraries collections may only use fields common to both types (filename, tags, notes, rating, favourite, date added, missing state); type-specific fields are disabled with an explanation. |
| `COL-03` | **Rule builder:** v1 supports one flat rule group with an explicit **Match all** (AND) or **Match any** (OR) selector. Each rule selects a supported field, operator, and value. Supported rules include favourite, rating, tag, filename contains, date added range, processing stage state, missing file, Comic OCR/decomposition/review state, and ComfyUI model/LoRA/sampler/workflow presence. Nested groups and arbitrary user expressions are not supported in v1. |
| `COL-04` | A collection stores its rule definition, not the matching item IDs. Its count and results are recalculated from the catalog when opened and after a relevant committed catalog change. A background index job does not reorder the currently visible result list mid-session; it shows **Collection changed — Refresh** so the view remains stable. |
| `COL-05` | Opening a collection uses the shared gallery, inspector, viewer, selection, compare and back/forward behaviour. The breadcrumb reads `Library › Smart collections › <name>` or `All libraries › Smart collections › <name>`. Back restores the prior folder/search and scroll position. |
| `COL-06` | Context actions: **Open**, **Edit rules**, **Duplicate**, **Pin/Unpin**, **Rename**, **Delete**. Delete removes only the collection definition, never catalog items or folders. It has an Undo toast for 8 seconds. |
| `COL-07` | Empty results show the active rules and actions **Edit rules** and **Clear temporary filters**. They must not say that the library is empty. A collection error offers **Retry** and **Details**. |

## 7.7 Pipeline

**Purpose:** choose a scope, choose what to run, see what will happen, run it, and watch it. Pipeline replaces the old **Indexing Center** and the scope/preset parts of **Panel Studio**.

**Layout (≥ 1280 px):** three columns **Scope** (320 px) · **What to run** (flexible) · **Summary** (320 px). Below 1280 px they become a 3-step stepper. A header names the library and its type.

| ID | Rule |
|---|---|
| `PIP-01` | **Scope** uses the tree in **Select** mode (LIB-07). Buttons: **Selected in Explore** (copies once, LIB-08), **Entire library**, **Clear**. Under the tree: "N folders · M items" (computed within 150 ms or shown as "10,000+"). |
| `PIP-02` | **What to run** shows preset cards. **ComfyUI library:** *Quick*, *Full*. **Comic library:** *Quick*, *Comic*. **Both:** *Use folder policies*. **Single-task cards** — ComfyUI: *Thumbnails only*, *Embeddings only*. Comic: *Decompose only*, *OCR only*, *Embeddings only*. Each card: title, one sentence in user language, the stage list in small text, a chip **Needs model runtime** when applicable, and the time estimate (PIP-06). The selected card has a 2 px accent border and a check icon. Below the cards: **Customize stages ▾**. |
| `PIP-03` | **Stage list** (Appendix C lists every stage): grouped; each row has a checkbox, name, an *Enables:* line ("Enables: keyword search"), a *Requires:* line, counts for the current scope ("done 11,000 · to do 1,043 · failed 0 · stale 2"), and a **Re-run even if done** toggle (the old per-stage `force`). Checking a stage auto-checks the stages it requires and shows a notice; unchecking a stage that selected stages depend on asks for confirmation before unchecking those too. |
| `PIP-04` | **Skip completed** toggle (default on; `proc.skipCompleted`) — carried over from the old UI. |
| `PIP-05` | **Summary (dry run)** shows: library, scope (first three folders + "+N more"), stages, and counts "To process X · Already done Y · Stale Z · Previously failed W"; runtime note ("Needs the model runtime — it will start automatically" / "Model runtime is off and auto-start is disabled"); the estimate; and the primary **Start** button (or **Add to queue** when a job is already running). **Start is disabled with a visible reason** when the scope is empty, when nothing needs doing ("Everything in this scope is already processed. Enable ‘Re-run even if done’ to repeat."), or when the library is read-only. |
| `PIP-06` | **Estimates (D-49):** from `run_stats` for the same stage and compute device: "≈ 38 min (based on your last 3 runs)", shown as a ±25% range text in the card tooltip. With no history: "No estimate yet — the first run will measure." A running job shows a measured ETA after 5% progress. |
| `PIP-07` | **Resource profile** dropdown (old "Resource profile") lives in the Summary: *Balanced* (default), *Idle-only*, *Battery-aware*, *Max speed*, plus user profiles (D-06, D-29), each with a one-line effect (§14.6). |
| `PIP-08` | One job runs at a time; further jobs queue FIFO; queued jobs can be cancelled; reordering is not supported in v1. |
| `PIP-09` | **Controls (D-63):** a running job shows **Pause** (toggles to **Resume**) and **Stop**. Stop means *stop safely*: the current item finishes, then the job ends (tooltip says so). **Retry failures** appears on the job summary and under Review → Failed. There is no hard-kill in the UI. |
| `PIP-10` | **Job states:** Queued · Starting · Running · Paused · Stopping · Stopped · Completed · Completed with failures · Failed. Stop, crash and power loss MUST leave the catalog consistent: every item's stage state is either `done` or unchanged (`REL-06`). |
| `PIP-11` | **Use folder policies** computes stages per folder from LIB-10 policies; the Summary shows a collapsible per-folder table. |
| `PIP-12` | **Tools** section (collapsed by default; D-10): **Panel Studio** — standalone cropper runner for folders that are not in a library. `VERIFY`: record the existing inputs, outputs and parameters; the new UI MUST expose all of them. New option: **After running, add the output folder as a comic library.** |
| `PIP-13` | **Maintenance** (inside Tools): *Check for new files*, *Verify files (find missing)*, *Integrity check*, *Verify cached assets / find orphan thumbnails*, *Rebuild text index*, *Find near duplicates*, and *Clear caches*. Each action states exactly which records/files it reads, which records it may update, whether it starts the worker/runtime, and an estimate or **No estimate yet**. Cache cleanup is restricted to app-owned derivatives; originals are never included. |

## 7.8 Job drawer and tray

| ID | Rule |
|---|---|
| `PIP-20` | **Tray text while a job runs:** "Indexing · Embeddings 4,210 / 12,043 · ≈ 38 min left" with **Pause** and **Stop** buttons at its right. With no job: "Ready". Clicking the tray text, or `Ctrl+J`, toggles the drawer. |
| `PIP-21` | **Drawer (280 px high):** header (job name, state, elapsed). *Stages:* one row each with a progress bar, counts, rate (items/s) and ETA. *Current item:* filename in the mono font. *Failures:* count and list (item, stage, error message; per-row **Retry** and **Copy error**; **Retry all failures**). *Queue:* queued jobs with **Cancel**. *Session log:* last 500 events, newest at the bottom, **Auto-scroll** toggle, **Copy log**, **Open log folder**. *This session:* completed jobs with their outcome. |
| `PIP-22` | Progress bars are **determinate only when the denominator is known**. Otherwise they are indeterminate with the text "Counting…" (static, striped when reduced motion is on). |
| `PIP-23` | On completion: toast "Indexing finished — 12,043 done, 3 failed. **[View]**". The tray returns to "Ready". Completed jobs stay in *This session* until the app exits (D-50). |
| `PIP-24` | If a job needs the runtime and it cannot start: runtime-dependent stages are marked **Skipped — runtime unavailable**; other stages complete; the job ends as *Completed with failures*; the drawer shows "Model runtime could not start: <reason>" with **Open System**. |

---

# 8. Comics: decompose, panels, reader, Cropper Lab

## 8.1 Model in one paragraph
A comic **page** is the parent record. Its **panels** are child records stored as boxes in the page's pixel coordinates, each with a reading order, a cached 320 px thumbnail, and (after OCR) its own text regions. **Decompose** runs the cropper once per page, ingests the boxes, and stores them; it is not repeated unless the user asks. Panel images are rendered on demand from the original using the stored box (`cp-prev://…/p/<id>`), so no crop files are kept (D-51, `CMC-01`).

## 8.2 Cropper integration contract
| ID | Rule |
|---|---|
| `CMC-01` | The existing cropper script is **protected**. The app and any coding agent MUST NOT edit, rename, move or delete it. Every improvement is a **new file** registered in `cropper_versions` (D-78). |
| `CMC-02` | **The adapter** (in the Python worker) runs a registered cropper as a subprocess on batches of 10 pages, passing the page file paths and `params_json`. It reads a **manifest** the cropper writes: per page `{ page_path, boxes: [{x, y, w, h}], script_version }`. Coordinates are in **page pixels** of the original file. |
| `CMC-03` | **`VERIFY` (blocks the Comic/Manhwa Decompose release):** does the current script write box coordinates? If it only writes cropped image files, a **new cropper version** MUST be created that also writes the manifest. Matching crops back to pages by image similarity is **not** acceptable as the primary method. Until a manifest-writing cropper or equivalent deterministic, documented box manifest exists, **Comic/Manhwa Decompose cannot ship**. Other independent shell/gallery work may proceed, but a release must not claim the Comic/Manhwa workflow is complete. |
| `CMC-04` | The adapter writes into a per-run temp folder `libraries/<id>/tmp/decompose/<run_id>/`, ingests the manifests, then deletes the folder. Crop image files are not retained. |
| `CMC-05` | A failure on one page is recorded for that page (`status = failed`, message) and does not fail its batch or job. |
| `CMC-06` | Every result records `cropper_version_id`, `script_sha256` (computed at run time) and `params_hash` (`panel_sets`). If the script's hash differs from the registered hash, the run proceeds and shows the notice "Script changed since it was registered". |

## 8.3 Panel-set state machine (`panel_sets.status`)
| From | Event | To |
|---|---|---|
| `none` | Decompose requested | `queued` |
| `queued` | Worker starts the page | `running` |
| `running` | Boxes found, no flags, auto-accept (batch mode) | `accepted` |
| `running` | Boxes found, preview required **or** page flagged | `proposed` |
| `running` | Cropper returned 0 boxes | `no_panels_found` |
| `running` | Error | `failed` |
| `proposed` | User accepts (with or without edits) | `accepted` |
| `proposed` | User discards | `none` |
| `no_panels_found` | User draws panels, marks "whole page is one panel", or marks "no panels (splash)" | `accepted` |
| `accepted` | Page fingerprint changed | `stale` |
| `accepted` / `stale` | Re-decompose confirmed | `queued` |
| `failed` | Retry | `queued` |

**Rule `CMC-07` (D-53):** a page in `no_panels_found` is **left undecomposed** (no `panels` rows), flagged in Needs Attention, and offered for the golden set. **Rule `CMC-08` (D-54):** nothing becomes `queued` on its own because of staleness or because the default cropper version changed; the UI only *reports* ("14 pages decomposed with an older cropper") and offers **Re-decompose**.

### Webtoon strips and double-page spreads (v1; no source-file modification)

| ID | Rule |
|---|---|
| `CMC-30` | **Webtoon/long-strip candidate detection:** only during an explicit Decompose request, inspect the page's stored width and height. With `comics.webtoonSlicing = auto`, a page with `height / width ≥ 3.5` is a candidate by default. The ratio is controlled by `comics.webtoonCandidateRatio` (default 3.5, range 2.0–8.0, step 0.25). A candidate banner proposes reviewing slices; it does not start slicing or processing by itself. A page below the threshold may still be sliced manually from the preview. |
| `CMC-31` | **Gutter proposals:** the preview shows each proposed horizontal boundary over the source page and a numbered segment list. The default detector treats a horizontal band at least 24 source pixels tall with near-constant background as a candidate gutter; this 24 px minimum is configurable as `comics.webtoonMinGutterPx` (range 8–128, step 4). The detector may prefer segments no taller than 2.5× the page width, controlled by `comics.webtoonMaxSegmentRatio` (range 1.5–5.0, step 0.25), **but it must not invent a boundary to satisfy that target**: if no valid gutter is found, it leaves that interval unsliced and tells the user. In preview the user can **Accept all**, move a boundary, add/remove a boundary, or choose **Do not slice**. Any manually added boundary is visibly distinguished from a detector proposal until accepted. |
| `CMC-32` | **Coordinate mapping:** approved segments are temporary cropper inputs. Every detected box is transformed from segment-local pixels back into the original parent page's pixel coordinates before it is persisted. The cropper result is never attached to a guessed parent: the adapter must provide a deterministic source-page mapping and reversible transform, otherwise the user is offered **Run cropper without slicing** and the mapping-failure reason is recorded. For normal pages, reading order is computed by CMC-23. For a spread split into two processing halves, the first half follows the series reading direction (left half first for LTR; right half first for RTL), then the second half. Temporary segments/manifests are app-owned files under the data directory and are removed after commit or discard. The original page is never rewritten. |
| `CMC-33` | **Double-page-spread detection:** only during explicit Decompose, consider a spread when `width / height ≥ 1.2` and the detector finds a near-vertical low-variation gutter within the central 20% of the image. The detector's variance and minimum-continuity thresholds must be exposed in the registered algorithm configuration and tested against the comic fixture; they must not be represented as validated until Phase 0/5 measures them. If the configured detector returns a candidate, show **Possible double-page spread** with an overlay of proposed left/right halves. Actions: **Split for detection**, **Keep as one page**, **Adjust split**. User approval is mandatory. Accepting the split changes only the temporary cropper input and coordinate mapping; it does not create, delete, rename or reorder source files and does not silently insert extra page records. `comics.spreadDetection = off` disables proposals but does not remove the manual split action. |
| `CMC-34` | **Review and stale state:** if slicing/spread boundaries or their algorithm version change after panels have been accepted, the page becomes `stale`. Existing manual boxes remain recoverable and are never overwritten without the existing re-decompose confirmation. Each panel set records slice boundaries, split coordinate, algorithm version and cropper parameters used. |
| `CMC-35` | If the slicing adapter cannot provide deterministic boundaries and a reversible coordinate transform for a candidate page, the UI offers **Run cropper without slicing** and records that choice. It must not guess how to map boxes back to the original. |


## 8.4 Flags (suspicious results)
After a run, each page gets `flags_json` from these rules. Every threshold is a setting (`comics.flag.*`) and will be tuned with the golden set (§8.8).

| Flag | Default rule |
|---|---|
| `no_panels` | 0 boxes returned |
| `overlap` | any two boxes have IoU > 0.10 |
| `tiny_panel` | any box area < 1.5% of page area |
| `low_coverage` | union of boxes covers < 40% of page area |
| `extreme_aspect` | any box with width/height > 6 or < 1/6 (not applied to webtoon slices) |
| `many_panels` | more than 12 boxes |

In **batch mode** a flagged page becomes `proposed` (needs a human look); an unflagged page becomes `accepted`.

## 8.5 Entry points and the Decompose dialog
| ID | Rule |
|---|---|
| `CMC-10` | Decompose is available from: the page inspector button; the context menu on a selection; the series card menu; Pipeline (*Comic* or *Decompose only*). It is never started by browsing (PRD-06). |
| `CMC-11` | **Decompose dialog** (for the first three entry points): title "Decompose N pages"; **Cropper version** dropdown (default from `comics.defaultCropper`); parameter summary (read-only link to Settings); **Preview before saving** checkbox (default **on** when N ≤ 5, **off** when N > 5; D-52); if some pages are already `accepted`: radio *Skip pages already decomposed* (default) / *Replace* — and with *Replace*, a second checkbox **Also replace pages with my manual edits** (default off; when on, a confirmation lists how many manual edits will be lost). Primary button **Start**. |
| `CMC-12` | From Pipeline, decomposition always runs in batch mode (no per-page preview); flagged pages become `proposed` and appear in Needs Attention → *Panels to check*. |

## 8.6 Panel editor (preview, accept, adjust)
A full main-surface workspace, like the viewer. Opened by **Edit panels**, by choosing an item in *Panels to check* / *No panels found*, or automatically after a previewed decompose.

**Layout:** canvas (page with numbered boxes) · right panel (panel list + page info) · optional queue strip `Q`.

| ID | Rule |
|---|---|
| `CMC-20` | **Tools:** Select `V`, Draw panel `D`, Merge `M`, Split `S`, Delete `Del`, Edit-box mode `E`, plus buttons **Whole page is one panel**, **No panels (splash page)**, **Reset to detected**. Zoom buttons and keys as VWR-04; overlay toggle `H`. |
| `CMC-21` | **Box edits:** drag handles to resize, drag inside to move; in Edit-box mode (`E`) arrow keys nudge 1 px and `Shift`+arrow 10 px (at any zoom, in page pixels). Minimum panel size 32 × 32 px; boxes are clamped to the page. |
| `CMC-22` | **Merge:** select ≥ 2 panels → one panel whose box is their union; its order = the lowest of the merged orders. **Split:** choose **Horizontal** or **Vertical** in the Split tool's segmented option (no `H` or `V` keyboard shortcut is assigned because `H` toggles overlays and `V` selects the Select tool), then click a position inside the panel → two panels; they take consecutive orders and later panels renumber. **Delete** removes a panel; all are undoable (NAV-50). |
| `CMC-23` | **Reading order:** computed by rows — panels whose vertical extents overlap ≥ 50% of the smaller height form a row; rows are ordered top to bottom; within a row, left to right for LTR series and right to left for RTL. Dragging rows in the panel list, or `[` / `]`, reorders manually; any manual reorder sets `order_manual` for that page, after which order is never recomputed automatically. |
| `CMC-24` | Any edit sets `panels.edited` and `panel_sets.user_edited`; `detected_box_json` is never modified. |
| `CMC-25` | **Accept** (`Enter`) sets `accepted` and moves to the next page in the queue; **Accept all unflagged remaining** is offered when the queue has > 5 items; **Skip** leaves the page `proposed`. |
| `CMC-26` | **Golden set:** a page whose boxes the user changed is automatically marked `include_in_golden_set`; the checkbox "Use as cropper test example" is visible and can be unticked. A page set to *No panels (splash)* or *Whole page* is also eligible (ticked by default) because it records the correct answer. |
| `CMC-27` | **v1 scope anchor — double-page spreads:** this feature is required in v1 (D-81), not a Phase 9/future task. Its single normative detection and review contract is `CMC-33`; this row adds no separate algorithm or alternate threshold. |
| `CMC-28` | **v1 scope anchor — webtoon/long strips:** user-controlled gutter-based slicing is required in v1 (D-80), not a future task. Its single normative candidate, boundary-review and coordinate-mapping contract is `CMC-30`–`CMC-35`; this row adds no separate algorithm or alternate threshold. |

## 8.7 Series
- `CMC-62` Each top-level folder of a comic library is a **series** (D-58): title (default = folder name), reading direction (default `ltr`), cover (default first page), and notes. Edit these in **Series settings**; persist them in the `series` table.
- `CMC-63` Subfolders of a series appear as grouped sections (for example, **Chapter 2**) in the page gallery. Within a folder, pages use natural filename order. If pages are spread across chapter folders, the series-wide order follows natural folder order, then natural filename order; the UI shows each page's chapter so this ordering is understandable.

## 8.8 Cropper Lab (D-79)
**Purpose:** decide whether a new cropper version is better than the current one, using your own corrections as the answer key.

**Entry:** Pipeline → Tools → **Cropper Lab**, or Needs Attention → *No panels found* → **Open in Cropper Lab**. Available in comic libraries only.

**Layout:** setup (left, 300 px) · results table (centre) · overlay viewer (right, 40%).

| ID | Rule |
|---|---|
| `CMC-40` | **Setup:** *Cropper A* and *Cropper B* (from the registry), *Pages* source — **Flagged pages** \| **Pages with my corrections** (golden set) \| **Current selection** — and *Limit* (default 50 pages). **Run** executes both versions on the same pages through the adapter, **into `lab.db` only** (DAT-03). |
| `CMC-41` | **Results table:** page thumbnail, panels found A / B / truth, per-page score A / B, **Verdict**: *A better*, *B better*, *Tie*, *Both wrong*, *No truth*. Pages without ground truth (no corrected boxes) show counts only. |
| `CMC-42` | **Metrics (exact definitions):** *Ground truth* = the page's accepted boxes when `user_edited` is true. *Matching* = greedy one-to-one by IoU ≥ 0.5, highest IoU first. *Precision* = matched / predicted; *Recall* = matched / truth; *F1* = 2PR/(P+R); *Mean IoU* = average IoU of matched pairs; *Count match rate* = pages where predicted count equals truth count. Shown for A and B over all pages with truth, and broken down by flag category (§8.4). |
| `CMC-43` | **Overlay viewer:** the page with A boxes (dashed), B boxes (solid) and truth boxes (thick) — distinguished by **line style and a legend, not colour alone**; toggles per set. |
| `CMC-44` | **Actions:** **Set B as default cropper** (changes `comics.defaultCropper`; nothing becomes stale or re-runs, CMC-08), **Export golden set…** (copies pages plus a JSON of boxes to a folder outside any library), **Export results (CSV)**. |
| `CMC-45` | **Registry (Settings → Comics → Cropper versions):** list with label, script path, version string (typed by the user, e.g. "v11"), SHA-256 (first 12 chars), parameters JSON (validated), default radio, **Add**, **Remove** (removes the registry entry only; never deletes the file). |

## 8.9 Reader (D-59)
**Entry:** viewer **Reader** button or `P`; series card → **Open in reader**.

| ID | Rule |
|---|---|
| `CMC-50` | **Page mode (default):** one page fit to the window. `Space` or `PageDown` = **next** (always); `Shift+Space` or `PageUp` = **previous** (always). `→` means visually right: it goes **next** in an LTR series and **previous** in an RTL series; `←` is the opposite. `Home`/`End` first/last page of the series. |
| `CMC-51` | **Panel mode** (`P` toggles): the current panel is centred and scaled to fill 90% of the canvas. `Space`/`→`-equivalent moves to the next panel; after the last panel it moves to the first panel of the next page. If the page is not decomposed, panel mode is disabled with the tooltip "Decompose this page to read panel by panel", and `Space` falls back to next page. Transitions take 120 ms (none under reduced motion). |
| `CMC-52` | **Dialogue strip** (`T`): shows the effective text of the current panel (or page) in a bar at the bottom, max 3 lines, scrollable. |
| `CMC-53` | **Continuous mode** (`W`): vertical scroll through all pages of the series (virtualised), intended for webtoons. Panel mode is unavailable in it. |
| `CMC-54` | **Reader bar:** "Page 12 / 30 · Panel 3 / 6", reading-direction toggle (writes `series.reading_direction`), zoom buttons (as VWR-04), strip toggle, Close. The last position per series is remembered (folder-scope setting `reader.position`). |
| `CMC-55` | Prefetch: next two pages' 1280 px previews (and, in panel mode, next two panel renders) at low priority. |

## 8.10 Panel export (D-60)
| ID | Rule |
|---|---|
| `CMC-60` | **Export panels…** is available for a page, a selection of pages or panels, or a series. Dialog: destination folder (native picker), format (**PNG lossless crop** \| **JPEG q92** \| **WebP q90**), name template (default `{series}_p{page:03}_{panel:02}`), checkbox **Write manifest.json** (default on: boxes, text, source file names). |
| `CMC-61` | Exports are **copies**. Existing files are never overwritten (a numeric suffix is added). Choosing a folder inside any library root is refused with "Choose a folder outside your libraries so exports don't get indexed." Export runs as a job of kind `export` (progress in the drawer). |

---

# 9. OCR and review

## 9.1 OCR rules
| ID | Rule |
|---|---|
| `OCR-01` | V1 OCR applies to **Comic/Manhwa libraries only**. It runs only as a stage in a job whose scope the user chose (D-41), or for a single region when the user clicks **Read text** (`REV-16`), or for a page via **Run OCR…**. No code path starts OCR from browsing, launching, opening Review, or selecting an item. ComfyUI libraries do not show OCR controls in v1. |
| `OCR-02` | Engine: the OCR engine the app uses today (D-38; `VERIFY` name and version). Language setting `ocr.languages` = `["en"]`; the list UI offers only English in v1 but the setting exists so languages can be added. Every region records `ocr_engine` and `ocr_version`. |
| `OCR-03` | **Units (D-40, D-55):** if the page has `accepted` panels, OCR runs **per panel** on a crop rendered from the original; region boxes are mapped back to page pixels and `panel_id` is set. Otherwise OCR runs on the whole page and `panel_id` is null. If a page is decomposed *after* page-level OCR, existing regions are **kept** and each gets the `panel_id` of the panel containing ≥ 50% of its area (else null); machine text is not re-run unless the user asks. |
| `OCR-04` | **Roll-up:** a page's text = effective text of its regions ordered by (panel reading order, then `order_idx`), joined by newlines, with a blank line between panels. A panel's text = effective text of regions with its `panel_id`. Both are indexed (DAT-02). Effective text = `manual_text` if not null, else `machine_text`. |
| `OCR-05` | **Machine vs manual separation (observed in the current UI; keep):** `machine_text` and `manual_text` are separate columns. Editing writes `manual_text` only. **Restore machine text** sets `manual_text` to null. |
| `OCR-06` | **Reprocessing (OCR again) never touches** `manual_text`, `manual_at`, `reviewed`, manual ink fields, or the boxes of user-edited regions. New machine regions overlapping an existing region (IoU ≥ 0.5) update that region's `machine_text`/`machine_conf`. Old regions with no match **and** with manual data become `orphaned` (kept, flagged in Needs Attention); old regions with no match and no manual data are removed; unmatched new regions are added. |
| `OCR-07` | **Needs review:** a region needs review when `reviewed = false` **and** `manual_text` is null **and** `machine_conf` < `ocr.confidenceThreshold` (default **80**, D-42; library-scope overridable). |
| `OCR-08` | **Valid result:** an OCR result is valid while the page fingerprint, OCR engine version and the panel box it was read from are unchanged. A valid result is not repeated unless **Re-run even if done** is set. Editing a panel box marks that panel's OCR **stale**; existing manual corrections are kept (OCR-06). |

## 9.2 Needs Attention (Review landing)
Opened from the rail's **Review**. Left: categories with live counts; right: the list for the selected category.

| Category | Contains | Primary action |
|---|---|---|
| **Low-confidence text** | Regions that need review (OCR-07) | Review |
| **Edited, not reviewed** | Regions with `manual_text` and `reviewed = false` (hidden unless chosen) | Review |
| **Panels to check** | Pages in `proposed` | Open in panel editor |
| **No panels found** | Pages in `no_panels_found` | Open in panel editor / Cropper Lab |
| **Stale decompositions** | Pages in `stale` | Re-decompose… |
| **Orphaned corrections** | Regions flagged `orphaned` (OCR-06) | Review |
| **Failed items** | Any failed stage (index, OCR, decompose, export) | Retry / Skip |
| **Missing files** | Items with `missing = true` | Re-check / Ignore / Remove |
| **Near duplicates** | Candidate image/page pairs from an explicitly started duplicate scan | Compare / mark relationship / dismiss pair |

- `DUP-01` **Scope and trigger:** near-duplicate scanning is an explicit action from Pipeline → Tools → Find near duplicates, the library context menu, or the command palette. It never runs because a library opens, a folder is browsed, a viewer opens, or an item is selected. v1 scans the active library; the user repeats the action for another library if needed.
- `DUP-02` **Candidate generation:** byte-identical items use the existing strong content fingerprint when available. Visually similar candidates use a 64-bit perceptual hash computed from the image thumbnail/preview. If compatible image embeddings already exist, the UI may show their cosine score as an additional signal; duplicate scanning must not start the model runtime or build embeddings merely to produce a result. Default perceptual threshold is 90% hash agreement and is adjustable from Settings → Search & matching.
- `DUP-03` **Results:** one pair per row with both thumbnails, filenames, dimensions, file sizes, folder breadcrumbs, match method and score. Exact matches are labelled **Exact match**; perceptual candidates are **Visually similar**; embedding support is displayed separately and never represented as proof that two files are identical.
- `DUP-04` **Review actions:** **Open Compare**, **Mark not duplicate**, **Mark related**, and **Dismiss pair**. A decision affects only the pair's catalog review state. There is no **Delete**, **Move**, **Replace**, or **Keep one and delete the other** action. Source files remain untouched.
- `DUP-05` Re-running a scan updates pair scores and candidate state but retains prior user decisions unless the underlying fingerprints change. If the item fingerprint changes, the prior pair decision becomes **Needs recheck** instead of being silently reused.
- `DUP-06` Duplicate candidates are listed in Review under a separate **Near duplicates** category but do not inflate the primary urgent Review badge. They are an organisation aid, not a processing failure. The category count is the number of unique unreviewed pairs, not the number of images in those pairs.
- `DUP-07` Completion produces a summary: items examined, exact pairs found, visual candidates found, skipped/unreadable items, elapsed time. Every failed item is actionable via Retry and Copy error.

- `REV-01` The Review rail badge = total of **Low-confidence text + Panels to check + No panels found + Orphaned corrections + Failed items**. (Stale decompositions, Edited-not-reviewed and Missing files are listed but not counted in the badge.)
- `REV-02` Each list shows: thumbnail, series/folder, page (and panel), reason text, and detail (e.g. "confidence 61%"). Order is **file order** (natural folder order, then filename; D-43). Filters: **Scope** `All | Pages | Panels` (maps to the old "Scope: Pages and panels"), and **Show** `Needs review | Edited, not reviewed | Reviewed | All` (maps to the old "Queue: Needs review").
- `REV-03` **Failed items** replaces the old **Batch Recovery** screen. `VERIFY`: audit Batch Recovery and map every capability into this category or into Pipeline; none may be dropped (D-31). Minimum actions: *Retry selected*, *Retry all*, *Skip*, *Copy error*, *Reveal in Explorer*.
- `REV-04` **Missing files:** *Re-check* (stats the file again), *Ignore*, *Remove from catalog* (deletes the catalog rows for the item; if it has manual corrections the confirmation says how many will be lost). Image files are never touched (PRD-09).

## 9.3 Review workspace

**Layout:** canvas (page or panel with overlays) · right panel (editor + details) · optional **queue strip** (filmstrip along the bottom, toggle `Q`, D-27).

**Canvas toolbar:** Fit · 100% · − · + (VWR-04 rules) · **Overlays** `H` · **Show text on canvas** (default off) · tools **Select** `V`, **Draw region** `D`, **Merge** `M`, **Split** `S`, **Delete** `Del`, **Edit-box** `E`.

| ID | Rule |
|---|---|
| `REV-10` | **Navigation:** with canvas focus, `←`/`→` = previous/next region on the page (buttons **◀ Region** / **Region ▶** also exist); `PageUp`/`PageDown` = previous/next page (buttons **◀ Page** / **Page ▶**). The queue strip and `Ctrl+↑`/`Ctrl+↓` move between queue items. In the text field these keys behave as in any text field. |
| `REV-11` | **Right panel, in this order** (all carried from the current Dialogue Review; `VERIFY` each field's meaning): (a) **Header** "Region 2 of 4 · Page 3 of 30" and **Mark reviewed** `R`. (b) **Region** — cropped image of the balloon. (c) **Dialogue text** — the editor (REV-12). (d) **Machine transcription** — read-only text, confidence %, **Restore machine text**, and the note "This correction is stored separately from the transcription and is kept across reprocessing." (e) **Lettering ink** (REV-14). (f) **Details** — Reading order, Status, OCR (engine · mode), Position (`x, y · w × h`), Panel (`#n` or "—"). |
| `REV-12` | **Editing happens in the right panel, never in a floating popover on the canvas.** (The old on-canvas editor clipped and collided with neighbouring regions; it is removed, D-19.) The textarea auto-sizes from 3 to 12 lines then scrolls; spellcheck is off by default (`ocr.spellcheck`). The canvas highlights the selected region with a 2 px outline. A badge beside the textarea reads **Manual correction** or **Machine**; when the text differs from the saved value it reads "edited, not saved" and the field gets a 2 px left border. `Ctrl+Enter` saves; **Save** and **Discard** buttons mirror it. |
| `REV-13` | **Unsaved-changes guard:** navigating away (region, page, queue item, destination) while dirty shows an **inline bar at the top of the right panel** — "Unsaved changes in region 3. **[Save]  [Discard]  [Stay]**" — and holds the navigation until a button is pressed; `Esc` = **Stay**. The bar never covers the canvas. **Save failure** (for example a locked catalog) shows the error in the right panel with **Retry** and **Copy text**; the draft is **never cleared** on failure. |
| `REV-14` | **Lettering ink** (carried over): swatch + colour name; source badge **Measured** / **Estimated** / **Manual**; hex value; reliability shown as dots (●●○○) **plus the words** "low reliability" etc.; when manual: "You chose this colour. The measurement it replaced was #101010."; **Approve** (disabled with tooltip when nothing was reliably measured); hex input; **Set colour** (stores `ink_manual_hex`, keeps the measurement beside it); help text "Setting a colour keeps the measurement beside it. Approving is unavailable when nothing was reliably measured." |
| `REV-15` | **Mark reviewed** (`R`) sets `reviewed`. With `ocr.autoAdvance` on (default, D-28) the workspace then moves to the next region on the page, and after the last region to the next item in the queue. Saving text with `Ctrl+Enter` also advances when auto-advance is on; `Ctrl+Shift+Enter` saves and stays. Both are undoable (NAV-50). Marking reviewed adds no extra protection beyond OCR-06 (D-45). |
| `REV-16` | **Region tools (D-44):** *Draw* (`D`): drag a rectangle → a new region (empty text, `source = manual`) with a **Read text** button that OCRs just that box (OCR-01 permits it because the user asked). *Merge* (`M`): select ≥ 2 regions (`Shift+click` on canvas or list) → one region with the union box; text = effective texts joined by a space in reading order; the result counts as manual if any input was manual. *Split* (`S`): choose horizontal/vertical, click a position → two regions; the text is cut at the textarea caret (text before the caret stays in the first region; with no caret, the first keeps all and the second is empty). *Delete* (`Del`). *Edit-box* (`E`): handles to resize/move; arrows nudge 1 px, `Shift`+arrow 10 px. All undoable. |
| `REV-17` | **Overlays (`H`):** region boxes with their numbers and a `manual` tag on manually corrected regions (observed). Text drawn on top of the balloons ("Show text on canvas") is **off by default** because it overlapped the original lettering at small sizes. |
| `REV-18` | **Zoom:** the same buttons and keys as the viewer (VWR-04). The old **Ctrl+wheel zoom** is intentionally removed for consistency (decision D-94). Dragging pans. |
| `REV-21` | **Machine/manual comparison:** a collapsible **Compare text** section shows machine transcription and current manual correction side by side; when both exist, it also offers an inline word-level diff. Added text is underlined and removed text is struck through, with labels so colour is not the only signal. This view is read-only and does not write either field. If there is no manual correction, it says **No manual correction yet** and offers **Edit text**. The original OCR result remains available via **Restore machine text**. |
| `REV-22` | **Saving and reprocessing:** saving a correction updates `manual_text` only. OCR reprocessing can update `machine_text` but must not overwrite `manual_text`, review state, manual ink, or user-edited region geometry (OCR-06). The comparison panel must update only after backend acknowledgement; on save failure it continues to show the unsaved draft and a clearly labelled last-saved value. |
| `REV-19` | **Page with no regions:** "No text regions on this page. **[Draw a region]** `D`  **[Run OCR on this page…]**". The second opens the Pipeline job composer pre-set to *OCR only* and this page (it does not start by itself). |
| `REV-20` | **Panels to check / No panels found** items open the **Panel editor** (§8.6) as the workspace, with the same queue strip. |
| `REV-23` | **Persistence:** corrections, review flags, manual ink and panel edits survive restart and OCR reprocessing (OCR-06). A regression test verifies this (`TST-12`). |
| `REV-24` | **No implicit processing:** opening Review or any item in it MUST NOT start OCR, decomposition or any job (OCR-01, PRD-06). |

---

# 10. Visual system and shared controls

**Direction (D-14, D-15, D-65):** restrained black / white / grey, desktop-dense but comfortable, images first. Structure comes from alignment, whitespace, dividers and type hierarchy — **not** from putting every section in a card. Colour carries meaning only (status, and one user-chosen accent).

## 10.1 Rules

The visual and interaction system optimises for effortless navigation and comfort, not formal certification. Keyboard reachability, visible focus, predictable panel behaviour, legible text scaling, non-colour-only status, and stable layouts remain mandatory product-quality requirements. Do not claim WCAG conformance unless a separate audit has actually been performed.
| ID | Rule |
|---|---|
| `VIS-01` | **Tokens only.** Colours, spacing, radii, type sizes, durations and shadows come from the token files. A lint rule fails the build on raw hex colours, raw `px` spacing, or raw font sizes outside token files. |
| `VIS-02` | **Colour is semantic.** The UI is monochrome. Colour appears only as (a) status colours (§10.2), (b) the accent colour in the places listed in §10.3. Never use colour as the only carrier of meaning: every status pairs an icon and text. |
| `VIS-03` | **Fonts (D-64):** UI `"Segoe UI Variable", "Segoe UI", system-ui, sans-serif`; mono `"Cascadia Mono", Consolas, monospace` for file paths, hashes, seeds, hex values and logs only. No web fonts are downloaded. Counts and times use `font-variant-numeric: tabular-nums`. |
| `VIS-04` | **Type styles** (sizes at text scale 100%; all in `rem`): see §10.4. Body text is never smaller than 13 px; 12 px is allowed only for captions, overlines and badges. |
| `VIS-05` | **Spacing** uses a 4 px grid with the scale 2, 4, 8, 12, 16, 24, 32, 48. No other values. |
| `VIS-06` | **Shape:** corner radius 4 px for controls, cards, thumbnails and inputs; 6 px for dialogs, popovers and menus; 3 px for checkboxes; 0 for full-bleed panes. Borders are 1 px. **Shadows only on floating layers** (menus, popovers, dialogs, toasts): `0 8px 24px rgba(0,0,0,0.5)` dark / `0 8px 24px rgba(0,0,0,0.15)` light. Panes are separated by 1 px `--border-subtle` lines, not shadows. **No gradients anywhere.** |
| `VIS-07` | **Density (D-16):** *Compact*, *Comfortable* (default), *Spacious*. Density changes control height, row height and gaps only — never font size (§10.5). |
| `VIS-08` | **Icons (D-65):** Lucide only. 16 px in controls and rows (stroke 1.75), 20 px in the rail, 32 px in empty states. Icon-only buttons have an accessible name and a tooltip. |
| `VIS-09` | **Text scale (D-16):** 80%–200% in steps of 10, set in Settings or the View menu; implemented by scaling the root font size (`14 px × scale`). Browser/page zoom is disabled in the exe (NAV-08). Thumbnails and image areas do **not** scale with text. |
| `VIS-10` | **Compact layout at large scales:** layout breakpoints (NAV-06) are evaluated on the *effective width* = window inner width ÷ text scale. When effective width < 900, the app switches to the **compact layout**: rail collapsed, tree and inspector as overlay drawers, toolbars move secondary controls into a "⋯" overflow menu. Nothing may overflow, clip or overlap at any text scale between 80% and 200% on windows ≥ 900 × 600. |
| `VIS-11` | **Motion (D-65):** overlays and panels open/close with a 120 ms fade; hover colour changes take 80 ms; thumbnails fade in over 120 ms; progress-bar width changes take 200 ms linear. Nothing else animates. With reduced motion (`appearance.reduceMotion` = on, or system preference), every duration becomes 0 and indeterminate progress is a static striped bar. Skeletons never shimmer. |
| `VIS-12` | **Focus:** every interactive element shows a 2 px outline with 2 px offset on keyboard focus (`:focus-visible`), in the focus colour (§10.2). Focus is never removed without replacement. Focus order follows reading order. |
| `VIS-13` | **No decorative chrome:** no section cards, no oversized headings, no illustrations except 32 px empty-state icons, no coloured backgrounds on large areas. |
| `VIS-14` | **Writing style:** sentence case everywhere ("Add library", not "Add Library"); buttons start with a verb; an ellipsis "…" is added only when the action opens a dialog that needs more input; **Cancel** abandons a task, **Close** dismisses information; numbers use locale thousands separators; dates are "16 Oct 2026, 14:32" (24-hour), with relative time ("3 min ago") shown only with the absolute time in a tooltip. |

## 10.2 Colour tokens

### Dark (default)
| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#0B0B0C` | app background, canvas behind images |
| `--bg-1` | `#111113` | rail, panels, dialogs |
| `--bg-2` | `#18181B` | inputs, hover |
| `--bg-3` | `#222226` | selected, pressed |
| `--border-subtle` | `#232327` | pane dividers |
| `--border` | `#2E2E33` | inputs, buttons, menus |
| `--border-strong` | `#4A4A52` | unchecked checkbox border, emphasised divider |
| `--text-1` | `#EDEDEF` | primary text |
| `--text-2` | `#B4B4BC` | secondary text |
| `--text-3` | `#8A8A93` | tertiary text, placeholders (use only on `--bg-0` / `--bg-1`) |
| `--text-disabled` | `#5C5C64` | disabled |
| `--success` | `#4ADE80` | done |
| `--warning` | `#FBBF24` | stale, degraded, read-only |
| `--error` | `#F87171` | failed |
| `--scrim` | `rgba(0,0,0,0.60)` | behind dialogs |

### Light
`--bg-0 #F7F7F8` · `--bg-1 #FFFFFF` · `--bg-2 #F0F0F2` · `--bg-3 #E4E4E8` · `--border-subtle #E7E7EA` · `--border #D4D4D8` · `--border-strong #A1A1AA` · `--text-1 #18181B` · `--text-2 #52525B` · `--text-3 #71717A` (only on `--bg-0`/`--bg-1`) · `--text-disabled #A1A1AA` · `--success #15803D` · `--warning #B45309` · `--error #B91C1C` · `--scrim rgba(0,0,0,0.35)`.

### High-contrast
`--bg-0/1/2/3 #000000` · all borders `#FFFFFF` (1 px, and 2 px on focus-adjacent controls) · `--text-1/2/3 #FFFFFF` · `--text-disabled #A0A0A0` · focus ring `#FFFF00` 3 px · selected = inverted (white background, black text) · `--success #00FF66` · `--warning #FFD400` · `--error #FF6B6B`. Under Windows forced-colours (`@media (forced-colors: active)`) the app uses system colour keywords (`Canvas`, `CanvasText`, `Highlight`, `ButtonText`, `GrayText`) and keeps every border.

**Contrast guardrail (`VIS-15`):** at the default 100% text scale, normal enabled text pairs must meet 4.5:1 and large/bold text plus meaningful control boundaries must meet 3:1. Disabled/inactive text is explicitly exempt from enabled-text contrast because it is not an available action, but it must remain distinguishable from the background and must never be the only carrier of a status. A unit test checks the defined enabled-token pairs; high-contrast mode is tested separately. This is a visual consistency and legibility guardrail, not a claim of WCAG certification.

## 10.3 Accent (D-15)
- `appearance.accent` = `none` (default), `blue`, `violet`, `teal`, `pink`, or `custom` (`appearance.accentCustom`, a hex value).
- `none` means the accent equals `--text-1` (white in dark, near-black in light), and text on accent fills uses `--bg-0`.
- Presets (dark / light): Blue `#5B9CF6` / `#1D4ED8` · Violet `#9B8CFF` / `#6D28D9` · Teal `#2DD4BF` / `#0F766E` · Pink `#F472B6` / `#BE185D`.
- A custom hex whose contrast against `--bg-1` is < 3 : 1 shows "Low contrast against this theme" and offers **Use adjusted shade** (nearest passing shade).
- **The accent is used only for:** the focus ring (except in high-contrast), selection outlines, the primary button fill, checked checkboxes/radios/switches, progress-bar fill, links, the active rail indicator (a 3 px bar), the panel-card edge line in *Both* scope, and the selected tab underline. Nothing else.
- In high-contrast the accent is forced to white/yellow as specified in §10.2.

## 10.4 Type styles
At the default 100% text scale, the smallest base style is 13 px; the old 11 px / 12 px microcopy look is not used. The user-controlled 80–200% text-scale setting proportionally scales these styles, so a user explicitly choosing 80% may see smaller text; layout must still avoid clipping at every scale.

| Style | Size / weight / line height | Used for |
|---|---|---|
| Display | 28 / 600 / 1.2 | empty-state headline only |
| Title | 18 / 600 / 1.3 | dialog titles, screen headers |
| Heading | 14 / 600 / 1.4 | section headings, inspector sections |
| Body | 14 / 400 / 1.45 | default text |
| Body small | 13 / 400 / 1.45 | descriptions, table cells |
| Caption | 13 / 400 / 1.4 | helper text, badges |
| Overline | 13 / 500 / 1.4, uppercase, +0.04 em | small section labels |
| Mono | 13 / 400 / 1.4 | paths, hashes, seeds, logs |

## 10.5 Density tokens
| Token | Compact | Comfortable (default) | Spacious |
|---|---|---|---|
| Control height (buttons, inputs, selects) | 28 px | 32 px | 40 px |
| Row height (tree, lists, tables, menus) | 28 px | 32 px | 40 px |
| Gallery gap | 4 px | 8 px | 12 px |
| Pane padding | 8 px | 12 px | 16 px |
| Minimum hit target | 28 px | 32 px | 40 px (never below 24 px in any density) |

## 10.6 Shared controls
All controls live in one component library. A control that is not in the library MUST NOT be used (`CTL-01`). Native `<select>` and browser-default checkboxes are not used (`CTL-02`).

| Control | Specification |
|---|---|
| **Button** | Variants: **Primary** (accent fill; at most **one** per view or dialog), **Secondary** (`--bg-2`, 1 px `--border`), **Ghost** (no fill until hover), **Destructive** (secondary with `--error` text and icon). Padding 12 px horizontal. States: default, hover (`--bg-3`), pressed (`--bg-3` + `--border-strong`), focus ring, disabled (`--text-disabled`, no hover), loading (spinner replaces the icon, label and width unchanged). Disabled buttons that need an explanation use `aria-disabled` plus a tooltip stating the reason (never a silently dead button). Icon-only buttons are square (control height) with a tooltip and accessible name. |
| **Checkbox** | 16 px box, 3 px radius, 1 px `--border-strong` when unchecked, accent fill with a 12 px check (2 px stroke) when checked, accent fill with a dash when indeterminate. Hover: border `--text-2`. Disabled: `--border-subtle` border, `--bg-2` fill. Label sits 8 px right of the box, wraps naturally, is part of the click target, and the box aligns to the first line of text. Focus ring around the whole row. The **same** component is used for settings, search sources, pipeline stages, tree selection and filters (`CTL-03`). |
| **Radio** | As checkbox, circular, 8 px inner dot. |
| **Switch** | 32 × 18 px; off: `--bg-3` track; on: accent track; 14 px knob. Used for settings that apply **immediately**. **Checkboxes are for choosing items inside a form; switches are for on/off settings** (`CTL-04`). |
| **Text input** | Control height; `--bg-2`; 1 px `--border`; 4 px radius; focus: accent border + focus ring; placeholder `--text-3`; error: `--error` border + icon + message below; helper text in Caption. Search inputs have a ✕ clear button. |
| **Textarea** | As text input, vertically resizable only. |
| **Select / dropdown** | Shared Select component with the same popover as menus; keyboard `↑↓`, `Enter`, `Esc`, type-ahead; shows the selected value and a chevron. |
| **Segmented control** | Equal-height buttons in one 1 px frame, min 64 px wide each; the selected segment has `--bg-3` and a 2 px accent underline; `←→` move, `Enter`/`Space` select; semantics of a radio group. |
| **Tabs** | Underline style; selected tab has a 2 px accent underline and `--text-1`; hover `--bg-2`. |
| **Menu, context menu, popover** | `--bg-1`, 1 px `--border`, 6 px radius, floating shadow, 4 px padding; item height = row height; 16 px icon + label + right-aligned shortcut in `--text-3`; separators; disabled items stay visible and show the reason in a tooltip; one submenu level maximum. |
| **Dialog** | Centred; widths 400 / 560 / 720 px; Title style; body; footer right-aligned with **Cancel** (secondary) then the primary action. Destructive confirmations use a Destructive button and focus **Cancel** by default. `Esc` closes unless the dialog has unsaved input (then it asks). Focus is trapped inside and returns to the opener on close. Scrim `--scrim`. |
| **Toast** | Bottom-left above the tray, max 3 stacked; icon + text; auto-dismiss after 5 s (8 s when it has **Undo**); error toasts persist until dismissed; never block input. |
| **Tooltip** | 600 ms hover delay, instant on keyboard focus; label plus shortcut ("Compare  C"); max width 280 px. |
| **Badge / chip** | 20 px high, 4 px radius, Caption text, 1 px border. Status chips = status icon + text in the status colour. Tag chips are neutral and removable. |
| **Progress bar** | 4 px high, `--bg-3` track, accent fill, 2 px radius; determinate or indeterminate per PIP-22. |
| **Skeleton** | Static `--bg-2` blocks matching the final layout. |
| **Banner** | Full-width under the top bar; icon + text + actions + dismiss; variants neutral / warning / error. |
| **Slider** | 4 px track, 14 px thumb, value readout; `←→` step, `PageUp/PageDown` ×5. |
| **Tree** | Row height per density; 16 px indent; chevron; selected row `--bg-3` with a 2 px accent bar at its left edge. |
| **List / table row** | Row height per density; hover `--bg-2`; selected `--bg-3`; header in Overline style; no zebra stripes. |
| **Image card** | GAL-07. |

**Status vocabulary (`CTL-05`)** — one icon and wording per state, used everywhere:

| State | Icon | Colour | Text |
|---|---|---|---|
| Not processed | `circle-dashed` | `--text-3` | Not processed |
| Partial | `circle-dot` | `--text-2` | Partial |
| Done | `circle-check` | `--success` | Done |
| Failed | `circle-x` | `--error` | Failed |
| Stale | `clock-alert` | `--warning` | Stale |
| Running | `loader` (static under reduced motion) | `--text-1` | Running |
| Paused | `circle-pause` | `--text-2` | Paused |
| Skipped | `circle-minus` | `--text-3` | Skipped |
| Read-only | `lock` | `--warning` | Read-only |

**Component gallery (`CTL-06`)**: a built-in page (Settings → Diagnostics → Component gallery) renders every component in every state, theme, density and text scale. It is the fixture for visual-regression tests (§17).

---

# 11. Model runtime and compute

| ID | Rule |
|---|---|
| `RUN-01` | **States:** `Stopped`, `Starting`, `Ready`, `Busy`, `Stopping`, `Error`. The System chip and the System popover show the real state; nothing else may claim the runtime is ready (PRD-10). |
| `RUN-02` | **Start triggers (D-74):** (a) a Smart search needs the semantic/visual signal and `runtime.autoStart` is on; (b) a job containing runtime-dependent stages starts; (c) the user presses **Start** in the System popover. **Never at app launch.** |
| `RUN-03` | **Stop triggers:** idle timeout (`runtime.idleStopMinutes`, default 10; 0 = never); **Stop** button; app exit. It does not stop while a job is running or a search is in flight. |
| `RUN-04` | **While starting,** the UI says "Starting model… (usually about N s)", where N is the median of the last five starts recorded in `run_stats` ("up to a minute" before any history). Keyword results remain usable. |
| `RUN-05` | **Compute device (`runtime.device`):** `auto` \| `cpu` \| `gpu:<id>` for each detected GPU. `auto` uses the fastest device from the stored **benchmark** (a 50-text + 20-image sample run, results in `run_stats`); with no benchmark it uses CPU. Settings → Models has **Run benchmark**. If a chosen device fails to initialise the runtime falls back to CPU and shows the banner "GPU unavailable — using CPU. [Details]" — never silently. A dedicated GPU added later is detected automatically at the next runtime start. |
| `RUN-06` | **Threads:** `runtime.threads` = `auto` → (physical cores − 1) under *Balanced*, all cores under *Max speed*, physical cores ÷ 2 under *Low power*. |
| `RUN-07` | **Models:** Settings → Models lists each model with role (text embedding, image embedding), path, size, status (**Found** / **Missing**) and `embedding_config_hash`. A missing model disables the stages that need it with the reason "Model file not found" and a **Locate model…** button. |
| `RUN-08` | **Model change** makes existing vectors incompatible (DAT-01): coverage shows 0% for the new model and Pipeline offers *Embeddings only* with **Re-run even if done** pre-ticked and an explanation. Old vectors are **not** deleted automatically; **Remove outdated vectors** is a button in Settings → Storage. |
| `RUN-09` | **Memory guard:** if available RAM is below `runtime.lowMemoryWarnGB` (default 1.5) when starting, show "Low memory — starting the model may slow your computer. **[Start anyway]  [Cancel]**". |
| `RUN-10` | **Priority:** an interactive query (search embedding) pre-empts background embedding between items. Added latency to the query is at most the duration of one in-flight item (budget B7). |

---

# 12. Settings

## 12.1 Screen
- Left: category list — **Appearance, Browsing, Privacy, Search, Processing, Comics, OCR & review, Models & runtime, Storage, Shortcuts, Advanced & diagnostics**.
- Top of the right pane: a **Search settings** box (`Ctrl+F` when on this screen).
- Right: the category's settings, in the row anatomy of SET-03.
- Processing also hosts the **Profiles** manager.

| ID | Rule |
|---|---|
| `SET-01` | **Registry-driven.** Each setting is one registry entry: `key`, `type` (`bool`, `int`, `float`, `enum`, `string`, `path`, `hex`, `json`), `default`, `allowedScopes`, `category`, `label`, `description`, `keywords`, `constraints` (min/max/step/enum), `restartRequired`, `profileable`, `visibleWhen` (for example library type). The Settings UI, the View menu, the Search-settings popover, import/export and the Rust validator are all generated from this one registry. |
| `SET-02` | **Resolution order:** folder → library → app → default. The effective value and its origin ("Using app default" / "Overridden for this library") are always displayed. |
| `SET-03` | **Row anatomy:** label (Body, weight 500), description (Body small, `--text-2`), control right-aligned at widths ≥ 640 px (below that, under the text), a scope chip showing the current scope with a menu **Override for this library…** / **Override for this folder…** (only for allowed scopes), a **modified dot** when the value differs from its default, a **Reset** button, and a **Requires restart** chip when applicable. |
| `SET-04` | Changes apply immediately unless `restartRequired`. There is no Save button. Writes are flushed within 500 ms. A reset shows an Undo toast. |
| `SET-05` | **Settings search** matches label, description, key and keywords; results show the category path; `Enter` jumps to the setting and highlights it for 1.5 s. |
| `SET-06` | **Import/export:** *Export* writes JSON (settings and profiles; machine-specific paths only when **Include paths** is ticked). *Import* validates against the registry (unknown keys and invalid values are listed and ignored), shows a diff preview, backs up the current settings, then applies. |
| `SET-07` | **Profiles (D-06, D-29):** apply to settings marked `profileable` (processing and runtime keys). Built-in: **Balanced**, **Low power**, **Max speed** (read-only). Users can create from current, duplicate, rename, delete. The active profile is shown in Pipeline's Summary. Editing a profile-controlled setting shows "Profile ‘Balanced’ modified — **Save to profile / Save as new / Revert**". |
| `SET-08` | **Reset:** per setting, per category ("Reset category to defaults"), and all (confirmation dialog). |
| `SET-09` | Settings persist in `app.db` (ARC-13). `localStorage` is never used. |
| `SET-10` | A setting for a feature that does not exist in the current build or library type is **not shown** (PRD-10). |
| `SET-11` | `VERIFY` (Phase 0): inventory every setting in the current app, including those behind the old **Options** button and the old **Settings** screen. Each MUST appear in this registry or be recorded in `docs/audit.md` with a reason (D-31). |

## 12.2 Registry (initial)

Settings introduced by Appendices E–J are listed in those appendices (tables headed *Settings*) and are part of this registry; `SET-01` and `TST-24` apply to them.
Scope codes: **A** app, **L** library, **F** folder. **P** = profileable.

### Appearance
| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `appearance.theme` | enum `dark`,`light`,`high-contrast` | `dark` | A | Colour theme; Windows forced-colours mode overrides tokens when active |
| `appearance.accent` | enum `none`,`blue`,`violet`,`teal`,`pink`,`custom` | `none` | A | Accent colour |
| `appearance.accentCustom` | hex | `#5B9CF6` | A | Used when accent = custom |
| `appearance.density` | enum `compact`,`comfortable`,`spacious` | `comfortable` | A | Control and row sizes |
| `appearance.textScale` | int 80–200 step 10 | 100 | A | Text size in percent |
| `appearance.reduceMotion` | enum `system`,`on`,`off` | `system` | A | Disable animation |
| `appearance.rail` | enum `auto`,`expanded`,`collapsed` | `auto` | A | Navigation rail |
| `appearance.shortcutsInTooltips` | bool | true | A | Show shortcuts in tooltips |

### Browsing
| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `browse.thumbSize` | int 96–320 step 12 | 180 | A,L,F | Thumbnail size (px) |
| `browse.gridMode` | enum `uniform`,`rows` | `uniform` | A,L,F | Grid style |
| `browse.sort` | enum (per library type) | comfy: newest; comic: page order | L,F | Default sort |
| `browse.includeSubfolders` | bool | true | A,L,F | Include subfolders |
| `browse.cardOverlay` | enum `hover`,`always`,`never` | `hover` | A | Filename bar on cards |
| `browse.restoreView` | bool | true | A | Restore last view at launch |
| `browse.openLastFolder` | bool | true | A | Open last folder at launch |
| `browse.fitUpscale` | bool | false | A | Let Fit enlarge small images |
| `browse.keepZoomBetweenImages` | bool | false | A | Keep zoom when moving to the next image |
| `browse.viewerPrefetch` | int 0–4 | 2 | A | Neighbours to prefetch |

### Search
| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `search.rememberMode` | bool | false | A | Remember last mode |
| `search.advancedModes` | bool | false | A | Show Semantic-only, Visual-only, Hybrid weights, Comic text |
| `search.liveExact` | bool | true | A | Run Exact searches as you type |
| `search.resultLimit` | int 100–10,000 | 1,000 | A | Maximum results |
| `search.historyEnabled` | bool | true | A | Record search history |
| `search.showScores` | bool | false | A | Show scores on cards |
| `search.hybridWeights` | json | `{keyword:40,semantic:30,visual:30}` | A | Advanced weights |
| `search.similarityMin` | float 0–1 or null | null | A | Minimum similarity |
| `search.sources` | json list | prompt, metadata, filename, ocr, notes_tags | A,L | Searched sources |

### Collections and duplicate matching
| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `collections.showSmartCollections` | bool | true | A | Show the smart-collection group in Explore and Search |
| `duplicates.minSimilarity` | int 80–100 step 1 | 90 | A,L | Minimum 64-bit perceptual-hash agreement to show a visual near-duplicate candidate; exact matches are not filtered by this threshold |
| `duplicates.includeEmbeddingScore` | bool | true | A | Display a compatible, already-computed image-vector score as supporting evidence; never start runtime or embeddings just for this value |

### Processing (P = profileable)
| Key | Type / range | Default | Scopes | P | Description |
|---|---|---|---|---|---|
| `proc.profile` | id | `balanced` | A | – | Active profile |
| `proc.workerThreadsMax` | int or `auto` | `auto` | A | P | Max worker threads |
| `proc.thumbnailThreads` | int or `auto` | `auto` | A | P | Thumbnail generation threads |
| `proc.idleOnly` | bool | false | A | P | Run only when idle |
| `proc.idleSeconds` | int 5–600 | 30 | A | P | Idle delay |
| `proc.batteryAware` | bool | false | A | P | Pause on battery |
| `proc.skipCompleted` | bool | true | A | – | Skip completed items |
| `proc.askOnLaunch` | enum `ask`,`never` | `ask` | A,L | – | Offer to check for new files |
| `proc.estimateFromHistory` | bool | true | A | – | Time estimates from past runs |
| `policy.decompose` | enum `on`,`off`,`inherit` | `off` (app); `inherit` below | A,L,F | – | Folder policy |
| `policy.ocr` | enum `on`,`off`,`inherit` | `off` (app); `inherit` below | A,L,F | – | Folder policy |
| `policy.embeddings` | enum `on`,`off`,`inherit` | `off` (app); `inherit` below | A,L,F | – | Folder policy |

### Comics
| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `comics.defaultCropper` | id | the registered current cropper | A,L | Cropper used by Decompose |
| `comics.previewBeforeAccept` | enum `auto`,`always`,`never` | `auto` (on for ≤ 5 pages) | A | Preview step |
| `comics.flag.overlapIoU` | float | 0.10 | A | Overlap flag |
| `comics.flag.tinyAreaPct` | float | 1.5 | A | Tiny-panel flag |
| `comics.flag.lowCoveragePct` | float | 40 | A | Low-coverage flag |
| `comics.flag.extremeAspect` | float | 6 | A | Extreme-aspect flag |
| `comics.flag.manyPanels` | int | 12 | A | Many-panels flag |
| `comics.webtoonSlicing` | enum `auto`,`off` | `auto` | A,L | Propose gutter-based slicing during explicit Decompose; accepting the proposal is always user-controlled |
| `comics.webtoonCandidateRatio` | float 2.0–8.0 step 0.25 | 3.5 | A,L | Minimum page height / width ratio for a long-strip proposal |
| `comics.webtoonMinGutterPx` | int 8–128 step 4 | 24 | A,L | Minimum height, in source pixels, of a candidate horizontal gutter |
| `comics.webtoonMaxSegmentRatio` | float 1.5–5.0 step 0.25 | 2.5 | A,L | Preferred maximum segment height / page width; never authorizes inventing a boundary without a gutter |
| `comics.spreadDetection` | enum `offer`,`off` | `offer` | A,L | Detect likely double-page spreads and offer a preview before detection |
| `comics.readingDirection` | enum `ltr`,`rtl` | `ltr` | F (series) | Reading direction |
| `reader.defaultMode` | enum `page`,`panel` | `page` | A | Reader start mode |
| `reader.dialogueStrip` | bool | false | A | Show dialogue strip |

### OCR and review
| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `ocr.languages` | list | `["en"]` | A,L | OCR languages |
| `ocr.engine` | enum | the current engine (`VERIFY`) | A | OCR engine |
| `ocr.confidenceThreshold` | int 0–100 | 80 | A,L | Below this a region needs review |
| `ocr.autoAdvance` | bool | true | A | Advance after saving or marking reviewed |
| `ocr.spellcheck` | bool | false | A | Spellcheck in the editor |
| `ocr.showTextOnCanvas` | bool | false | A | Draw text over balloons |

### Models and runtime
| Key | Type / range | Default | Scopes | P | Description |
|---|---|---|---|---|---|
| `runtime.autoStart` | bool | true | A | – | Start the model when needed |
| `runtime.idleStopMinutes` | int 0–120 | 10 | A | P | Stop after idle (0 = never) |
| `runtime.device` | enum `auto`,`cpu`,`gpu:<id>` | `auto` | A | P | Compute device |
| `runtime.threads` | int or `auto` | `auto` | A | P | Runtime threads |
| `runtime.lowMemoryWarnGB` | float | 1.5 | A | – | Low-memory warning |
| `runtime.models.*` | path | detected | A | – | Model files |

### Storage
| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `storage.dataDir` | path | current data location (`VERIFY`) | A | Data directory (restart required) |
| `storage.previewCacheMaxGB` | float 0.5–50 | 2 | A | Preview cache size |
| `storage.thumbQuality` | int 60–95 | 80 | A | WebP quality for new thumbnails |
| `storage.previewQuality` | int 60–95 | 85 | A | WebP quality for new previews |
| `storage.backupKeep` | int 1–20 | 5 | A | Backups to keep |
| `storage.backupBeforeBigJobs` | bool | true | A | Back up before jobs > 1,000 items |
| `storage.integrityCheck` | enum `weekly`,`never` | `weekly` | A | Idle integrity check |

### Advanced
| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `diag.perfHud` | bool | false | A | Performance overlay |
| `diag.logLevel` | enum `info`,`debug` | `info` | A | Log detail |
| `diag.startupTrace` | bool | true | A | Record launch timings |

---

# 13. Diagnostics

| ID | Rule |
|---|---|
| `DGN-01` | Diagnostics is a page under **Settings → Advanced & diagnostics**, not a rail item (D-30). |
| `DGN-02` | **Sections:** *Startup trace* (phases with milliseconds and the budget they are compared with; last 10 launches kept); *Build & environment* (app version, git hash, build date, `contract_version`, target `web`/`exe`, OS and display scaling %, WebView2 version, `devicePixelRatio`, viewport, text scale, theme) with **Copy environment**; *Databases* (file sizes, WAL size, row counts, schema version, last backup, last integrity check; **Run integrity check**, **Back up now**); *Caches* (thumbnail and preview size and count, cache limit, orphaned-cache count; **Verify cached assets**, **Clear previews**, **Clear thumbnails** with confirmation); *Runtime and worker* (state, device, memory, last start duration); *Performance self-test* (**Run** measures folder switch, scroll, search, inspector-preview and viewer-step latency against the budgets in §14 and shows pass/fail per row); *Recent errors* (last 100, **Copy**); *Logs* (**Open log folder**, **Export diagnostics bundle**); *Component gallery* link. |
| `DGN-03` | **Startup phases recorded:** process start → window created → shell painted → snapshot loaded → first IPC sent → first page of items returned → first thumbnails visible → idle. |
| `DGN-04` | **Performance HUD** (`Ctrl+Shift+D` or `diag.perfHud`): a small overlay (bottom-right) with FPS, last query time, in-flight IPC count, thumbnail-cache hit rate and disk read MB/s. It is off by default, can be toggled without restarting, and its readings are diagnostic estimates rather than proof of a root cause. |
| `DGN-05` | The diagnostics bundle (zip) contains logs, the startup trace and environment. It MUST NOT contain image content, prompts, OCR text or catalog files. |
| `DGN-06` | **Parity:** *Copy environment* output is what the owner pastes when the web and exe builds look different; the build hash makes a stale exe obvious. |

---

# 14. Performance and caching

All numbers are **initial targets** measured on the budget machine (§1.4) with a 12,000-image ComfyUI library, warm OS file cache unless stated, p95 over 10 runs. They are acceptance targets, not a claim about the current build. Phase 0 must measure the baseline; Phase 7 must report measured results on the target Ryzen 3 7320U. A target that cannot be met must be changed only with evidence, a documented bottleneck and explicit owner approval; never silently (`PRF-01`).

## 14.1 Budgets
| ID | Measurement | Budget |
|---|---|---|
| `B1` | Process start → window visible with the shell painted | ≤ 700 ms |
| `B2` | Process start → first page of last-view thumbnails visible (cold launch) | ≤ 2.0 s |
| `B3` | Longest main-thread task during launch and browsing; input-to-response latency | task ≤ 100 ms; latency ≤ 100 ms |
| `B4` | Folder switch: first thumbnails visible (cached listing / uncached) | ≤ 250 ms / ≤ 600 ms |
| `B5` | Scrolling a 12,000-item grid at default size for 10 s (thumbnails cached) | ≥ 55 fps average; no frame > 50 ms |
| `B6` | Exact search: first results after the 150 ms debounce ends; Smart: keyword results after `Enter` | ≤ 80 ms |
| `B7` | Smart search, model runtime warm: semantic results merged after `Enter` | ≤ 600 ms |
| `B8` | Select an item → inspector preview visible (cached / generated from a ≤ 4 MP PNG) | ≤ 150 ms / ≤ 700 ms |
| `B9` | Viewer next/previous with prefetched preview | ≤ 100 ms |
| `B10` | Memory: UI process working set while browsing 12,000 items; whole app idle without the runtime | ≤ 600 MB; ≤ 900 MB |
| `B11` | Launch I/O: bytes read excluding thumbnail/preview cache reads; bytes written | ≤ 50 MB read; ≤ 5 MB written |
| `B12` | Idle (no job, no interaction) CPU and disk | < 2% CPU; ≈ 0 disk |
| `B13` | Time to open the Review workspace on an item (preview + regions visible) | ≤ 500 ms |
| `B14` | Decompose, per page, excluding model-free cropper time | UI stays within B3 throughout |

`PRF-02` A change that makes any budget worse by more than **20%** fails the automated check (D-85, §17).

## 14.2 Image pipeline
| ID | Rule |
|---|---|
| `PRF-10` | **Three tiers (D-69–D-71):** thumbnail (grid), preview (inspector, viewer first paint, peek, compare), original (viewer/compare only when needed, VWR-03). A tier is never substituted for another except as the temporary placeholder specified in INS-04 and VWR-03. |
| `PRF-11` | **Thumbnails:** longest side **320 px**, WebP quality **80** (encoder method 4), EXIF stripped, aspect ratio preserved. Stored in `thumbs.db` (`item_id`, `kind` `item`\|`panel`, `w`, `h`, `fingerprint`, `bytes`). Written in transactions of 200. Decoded for JPEG sources with reduced-size decoding (draft/DCT scaling) where available. |
| `PRF-12` | **Dominant colour** (3 bytes) and original `width`/`height` are recorded during the Thumbnails stage so the grid can lay out and paint placeholders without loading images (GAL-05, GAL-08). |
| `PRF-13` | **Previews:** longest side **1280 px**, WebP quality **85**, generated on first request in the Rust thread pool (max 3 threads, never more than cores − 1), stored as files `previews/<xx>/<item_id>_<fingerprint>.webp`. **LRU** eviction by last access: when the cache exceeds `storage.previewCacheMaxGB` (default 2 GB), evict to 90% of the limit. Concurrent requests for the same preview are coalesced. |
| `PRF-14` | **Request control:** the UI cancels thumbnail and preview requests for cells/items that leave the overscan window or are no longer selected (ARC-09). Interactive requests (selected item, viewer neighbours) run before background generation. |
| `PRF-15` | **Decoded-image budget in the UI:** images outside the overscan window MUST be released (element removed or `src` cleared). The grid keeps at most ~**3 viewports** of decoded thumbnails alive. `<img>` elements use `decoding="async"`. |
| `PRF-16` | **Browser cache:** thumbnails and previews are served with `ETag = fingerprint` and `Cache-Control: immutable`, so repeat views never touch the disk. |
| `PRF-17` | **Panel renders:** `cp-prev://…/p/<id>` crops from the original (or from the 1280 px preview when the box fits within it at ≥ 1:1) and is cached as a preview file keyed by (`panel_id`, box hash). |
| `PRF-18` | **Missing or unreadable file:** the protocol returns `404` with a reason; the UI shows STA-12/STA-13; a failure is cached for 60 s to avoid retry storms. |

## 14.3 Launch sequence
The launch sequence below is **normative** (`PRF-20`). Steps 1–6 must finish within B1/B2.

| # | Step | Rule |
|---|---|---|
| 1 | Process starts | Acquire the single-instance lock (ARC-14). **No database work on the main thread.** |
| 2 | Window created | Show the window immediately with the static shell (rail, top bar, tray) from the last theme/density/text-scale (stored in a small file read synchronously, < 4 KB). |
| 3 | Snapshot | Read `snapshot/last-view.json` (library id, folder id, sort, filters, first-page item ids with width, height, dominant colour, scroll offset). Paint the skeleton grid and, via the image protocol, thumbnails for those items. |
| 4 | Backend open | In a background task: open `app.db`, open the active library's catalog with the **read pool**, check schema version. If a migration is needed, show the blocking **Update** screen (ONB-10) — nothing else. |
| 5 | Revalidate | Query the first page of the last view. If the result differs from the snapshot, patch the grid in place **unless the user has already interacted with it**, in which case show the chip "Library changed — **Refresh**". |
| 6 | Idle | Report `idle` to the startup trace. |
| 7 | Deferred | After first paint + 3 s: the *check for new files* banner (LIB-12). After 60 s of user idle: the weekly integrity check (REL-12). |
| – | **Never at launch** | Start the Python worker; start the model runtime; scan folders; hash files; generate thumbnails or previews that are not on screen; rebuild FTS; run `PRAGMA integrity_check`; checkpoint the WAL beyond SQLite's automatic behaviour. |

**Snapshot writing (`PRF-21`):** written at most every 5 s while the view changes and on exit, atomically (write temp file then rename). A corrupt or missing snapshot is ignored; the app opens the library root.

## 14.4 Database rules
| ID | Rule |
|---|---|
| `PRF-30` | **Connections:** one writer connection and a pool of **3** read connections per catalog. UI queries use the read pool; jobs use the writer. |
| `PRF-31` | **Pragmas:** `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `mmap_size=134217728` (128 MB), `cache_size=-32768` (32 MB per connection), `temp_store=MEMORY`. `PRAGMA optimize` runs on close, not on open. |
| `PRF-32` | **Write batching:** a write transaction contains at most **500 rows** or runs at most **100 ms**, then commits so readers and the UI are never starved. |
| `PRF-33` | **Pagination:** keyset (`ORDER BY sort_key, id` with `WHERE (sort_key, id) > (?, ?)`), never `OFFSET`. |
| `PRF-34` | **Indexes:** covering indexes for every gallery sort in §GAL-13 with `folder_id`; an index on `stage_state(stage_id, status)`; FTS5 with `prefix='2 3'`. Phase 0 runs `EXPLAIN QUERY PLAN` for every launch and gallery query on a copy of the real catalog and records any full-table scan. |
| `PRF-35` | **Counts:** per-folder `count_direct`/`count_recursive` are maintained incrementally and read from `folders`; they are not computed with `COUNT(*)` at query time on large sets. |

## 14.5 Vector search
| ID | Rule |
|---|---|
| `PRF-40` | **Storage (D-72):** one flat float16 file per vector kind per library (`vectors/<kind>.f16`) with a companion id file and a manifest (`model_id`, `config_hash`, `dim`, `count`). The files are **memory-mapped**; nothing is read until the first search needs it. `VERIFY`: if the existing vector store can meet B7 with an exact scan, it MAY be kept and wrapped behind the same interface. |
| `PRF-41` | **Search:** exact cosine similarity by brute-force scan in Rust with SIMD, returning the top 200 (configurable by `search.resultLimit`). 12,000 × 768-dimension vectors are ≈ 18 MB in float16. An approximate-nearest-neighbour index is added only when a single vector file exceeds **100,000** vectors. |
| `PRF-42` | **Writes:** new vectors are appended to the file and the id file, with the manifest updated last, so a crash leaves a consistent prefix. |
| `PRF-43` | **Cross-library search (SRC-14):** each library is scanned in parallel; results are merged by reciprocal-rank fusion. |

## 14.6 Background work and throttling (D-77)
| Profile | Worker threads | When it runs | Battery |
|---|---|---|---|
| **Balanced** (default) | up to 50% of logical cores (4 on the budget machine) | any time; pauses between items when the UI reports interaction in the last 2 s | runs |
| **Low power** | 1 thread | any time | pauses on battery |
| **Idle-only** | up to 50% | only after `proc.idleSeconds` (30) without input; pauses on input | runs |
| **Max speed** | logical cores − 1 | any time | runs |

- `PRF-50` The scheduler has two priorities: **interactive** (search embedding, selected-item preview, single-item retry, single-region OCR) and **background** (jobs). Interactive work pre-empts background work between items.
- `PRF-51` **Embedding order:** within a job, items in the folder currently browsed (if inside the scope) are processed first, then the rest in folder order. This makes browsing-relevant results appear sooner.
- `PRF-52` **Progress events** are throttled to 10 Hz (ARC-08); log lines are batched.
- `PRF-53` **Long CPU jobs on the budget machine** (embeddings for 12,000 images may take hours): the UI states this in the Summary ("Embeddings are the slow stage on this computer") when the estimate exceeds 30 minutes, and the job is resumable at item granularity.

## 14.7 Memory guards
- `PRF-60` The UI never holds more than the current virtual window of result rows (≈ 3 pages of 200) in memory.
- `PRF-61` Search results beyond the cap (`search.resultLimit`) are not materialised.
- `PRF-62` The workflow JSON, full prompts of other items, and original images are never prefetched.

---

# 15. Reliability and safety

| ID | Rule |
|---|---|
| `REL-01` | **Read-only originals (D-11):** no code path writes to, renames, moves, deletes, replaces, or overwrites any file inside a registered library root. The only media-file writes are user-initiated **exports** (CMC-60) to a folder outside every registered library root. Export creation uses a collision-safe name and MUST fail closed rather than overwrite an existing destination; v1 exposes no overwrite-existing action. App-owned databases, logs, thumbnails, previews, vectors, snapshots and backups are writable only under the configured app data directory. A test scans backend file-system write calls and fails on any write target outside this explicit allow-list. |
| `REL-02` | **Manual work is never overwritten (PRD-08):** automated stages MUST NOT write to `manual_text`, `manual_at`, `reviewed`, `ink_manual_hex`, `ink_approved`, `panels` with `edited = true`, tags, notes, ratings or favourites. Enforced in the data-access layer, not in the UI. A test runs every stage against a database containing manual data and asserts it is unchanged. |
| `REL-03` | **Backups (D-76):** an automatic backup of `app.db` and the affected `catalog.db` is made **before** any migration, before a type change (LIB-05), and before a job larger than 1,000 items or containing Decompose or OCR stages (`storage.backupBeforeBigJobs`). Backups use SQLite's online backup API, are stored in `backups/`, and the last **5** are kept (`storage.backupKeep`). **Back up now** is in Diagnostics. |
| `REL-04` | **Restore:** Diagnostics lists backups with date and size and a **Restore…** action that explains what will be replaced, makes a backup of the current state first, and restarts the app. |
| `REL-05` | **Single instance (D-75):** ARC-14 and ARC-15. |
| `REL-06` | **Crash/Stop safety:** a job writes `stage_state` per item **after** the item's result is committed. Stop, crash, power loss and runtime failure leave each item either `done` or unchanged. On the next launch there is no "recovery" step; interrupted work simply shows as not done. |
| `REL-07` | **Locked catalog:** read-only mode per ARC-15; the banner offers **Retry** (re-attempts the writer lock) and **Details** (which process holds it, if known). |
| `REL-08` | **Migration safety:** migrations run only after a backup, in one transaction per database, and report progress. A failed migration restores from the backup automatically and shows the error (ONB-11). |
| `REL-09` | **Error messages** follow ARC-10: `user_message` explains what happened and what to do; technical detail is one click away. No raw stack traces or SQL in the main UI. |
| `REL-10` | **Missing files** are detected lazily (when viewed, or by *Verify files*) and surfaced per STA-12 — never by scanning everything at launch. |
| `REL-11` | **Disk full / permission errors** during cache or database writes stop the affected job with a clear message and leave the catalog consistent. |
| `REL-12` | **Weekly integrity check:** `PRAGMA quick_check` runs at most once per 7 days, only after 60 s of user idle, never during a job; a failure shows a banner "Library check found a problem — **View details**" and recommends restoring a backup. |
| `REL-13` | **Privacy:** no network access is made by the app itself; logs and diagnostics bundles contain no image content, prompts or OCR text (DGN-05). |
| `REL-14` | **Watchers are notification-only** (`WCH-01..03`). A filesystem event cannot directly write catalog state or enqueue processing. The only catalogue-changing route is the explicit, user-approved LIB-11 report. |
| `REL-15` | **Duplicate review is non-destructive** (`DUP-01..07`). A duplicate pair decision only updates the pair review record. It cannot delete, rename, move, replace, or overwrite an image. |
| `REL-16` | **Cache cleanup is app-owned-only.** The orphan-cache verifier may report or remove orphaned thumbnail/preview/vector cache data after a preview of exact affected cache entries. It must never infer that an original file is orphaned and delete it. |

---

# 16. States catalogue

States introduced by Appendices E–I (`STA-36` to `STA-49`) are part of this catalogue and of `TST-04`.

Every state below has a defined message and next action (`STA-00`: no screen may render a blank area, a bare spinner for > 400 ms without text, or a raw error). Text is normative; `<…>` are values.

| ID | State | Where | Message | Actions |
|---|---|---|---|---|
| `STA-01` | No library yet | App | "Add your first library" + two cards (ComfyUI images / Comic or manhwa pages); line: "ComfyPanel Studio only reads your images. It never changes them." | **Add library…** |
| `STA-02` | Folder has no items (checked) | Explore | "No images in <folder>." | **Check for new files**, **Browse parent folder** |
| `STA-03` | Folder not checked | Explore | "<folder> hasn't been added to the catalog yet." | **Check for new files**, **Open Pipeline** |
| `STA-04` | Filters hide everything | Explore/Search | "No images match these filters." | **Clear N filters** |
| `STA-05` | Failed to load list | Explore/Search | "Couldn't load images. <user_message>" | **Retry**, **Details** |
| `STA-06` | Library empty (no items at all) | Explore | "This library has no images yet." | **Check for new files**, **Open Pipeline** |
| `STA-07` | Search: no matches | Search | per SRC-13 | per SRC-13 |
| `STA-08` | Semantic unavailable (runtime off) | Search | "Semantic search needs the model runtime." | **Start model** |
| `STA-09` | Semantic partial coverage | Search | "Semantic results cover <N>% of this library." | **Index the rest…** |
| `STA-10` | Model missing | Settings/Pipeline | "Model file not found: <role>." | **Locate model…** |
| `STA-11` | Job cannot start | Pipeline | "Nothing to do" / "Select a folder first" / "Library is read-only" | per PIP-05 |
| `STA-12` | Original missing | Viewer/Inspector | "File not found: <display_path>" | **Reveal folder**, **Retry**, **Remove from catalog…** (removes catalog records only; never deletes or moves the file or its containing folder) |
| `STA-13` | Unreadable/corrupt image | Viewer/Inspector | "This file couldn't be opened (<reason>)." | **Open with default app**, **Retry** |
| `STA-14` | Preview generation failed | Inspector | "Couldn't create a preview." | **Retry**, **Open original** |
| `STA-15` | Save failed (notes, tags, text) | Inspector/Review | "Couldn't save. Your text is still here." | **Retry**, **Copy text** |
| `STA-16` | Unsaved changes | Review | per REV-13 | **Save**, **Discard**, **Stay** |
| `STA-17` | Runtime failed to start | System/Pipeline | "Model runtime could not start: <reason>" | **Open System**, **Retry** |
| `STA-18` | GPU unavailable | System | "GPU unavailable — using CPU." | **Details** |
| `STA-19` | Low memory | Runtime start | per RUN-09 | **Start anyway**, **Cancel** |
| `STA-20` | Catalog locked | Top banner | "This library is open in another ComfyPanel window or process, so it's read-only." | **Retry**, **Details** |
| `STA-21` | Migration needed | App | "Your library data needs updating." | per ONB-10 |
| `STA-22` | Migration failed | App | "Update failed. Your library was restored from backup." | **Details**, **Copy diagnostics** |
| `STA-23` | Pages have no panels | Comics | "No panels found on <N> pages." | **Open in panel editor**, **Open Cropper Lab** |
| `STA-24` | Decomposition stale | Comics | "<N> pages changed since they were decomposed." | **Re-decompose…** |
| `STA-25` | Page not decomposed (panel scope) | Comics | "Decompose this page to see its panels." | **Decompose** |
| `STA-26` | Export folder invalid | Export | "Choose a folder outside your libraries so exports don't get indexed." | **Choose folder…** |
| `STA-27` | Folder not found at launch | Launch toast | "Folder not found: <name>. Showing the library root." | – |
| `STA-28` | Library cannot be opened | Library menu | "<name> can't be opened: <reason>" | **Locate folder…**, **Remove from list** |
| `STA-29` | Import settings errors | Settings | "<N> values were ignored." + list | **Apply the rest**, **Cancel** |
| `STA-30` | Unknown search field | Search | per SRC-03 | – |
| `STA-31` | Smart collection has no matches | Explore/Search | "No items match this collection yet." | **Edit rules**, **Clear temporary filters** |
| `STA-32` | Smart collection failed | Explore/Search | "Couldn't load this collection. <reason>" | **Retry**, **Details** |
| `STA-33` | Duplicate scan running | Pipeline/Review | "Checking for visually similar images… <progress>" | **Pause** (if supported by worker stage), **Stop** |
| `STA-34` | Duplicate scan completed with skipped items | Pipeline/Review | "Scan finished. <N> pairs found; <M> items could not be checked." | **View pairs**, **View skipped items** |
| `STA-35` | Watch-folder changes detected | Explore/Top bar | "Changes detected in <folder>. Review the file changes?" | **Review changes**, **Later**, **Turn off watching** |

---

# 17. Testing and quality gates

Tests introduced by Appendices E–I (`TST-32` onward) are part of this section and of the Definition of done (§17.4).

## 17.1 Environments
- `TST-01` Every UI test runs against **both** the web build and the exe (Tauri webview), on the same fixtures. Any difference fails unless allow-listed with a written reason in `tests/parity-allowlist.md`.
- `TST-02` The existing **viewport harness** (iframe viewport + synthetic fixture + "Reset synthetic fixture") is kept and extended; it remains the fixture source for screenshot tests.
- `TST-03` **Fixtures:** (a) *Small synthetic* — 4 pages, 5 regions (as today); (b) *Large ComfyUI* — 12,000 generated thumbnails-only records and real small PNGs with embedded prompt/workflow metadata for 500 of them; (c) *Comic* — 5 series × 30 pages with known panel boxes, some pages with no panels, one spread, one long strip.

## 17.2 Matrices
| Matrix | Viewports | Themes | Text scale | Density |
|---|---|---|---|---|
| **Core (every PR)** | 1100×680, 1366×768 | dark | 100 | comfortable |
| **Full (nightly)** | 900×600, 1100×680, 1366×768, 1920×1080 | dark, light, high-contrast | 100, 150, 200 | compact, comfortable, spacious |

Every screen and every state in §16 has a named harness scenario; the scenario list is generated from the STA table so a new state cannot be added without one (`TST-04`).

## 17.3 Test types
| ID | Test | Rule |
|---|---|---|
| `TST-10` | **Gallery completeness** | A folder of 412 items is fully reachable by scrolling and by `End`; the count text equals 412; changing folders resets pagination; returning to the folder restores the view (GAL-03, GAL-16). |
| `TST-11` | **Viewer sequence** | `→` from the last item of loaded page 1 loads page 2 and shows item 201; with filters active, the sequence matches the filtered result (VWR-05). |
| `TST-12` | **Correction persistence** | Save a correction, mark reviewed, set a manual ink colour, edit a panel box; restart; run OCR again and Decompose with *Replace* (without "also replace manual edits"); all manual data is unchanged (REL-02, OCR-06). |
| `TST-13` | **No work on browse** | Browsing, selecting, opening inspector/viewer/Review, switching libraries and launching start **zero** jobs and write **zero** catalog rows (except the bookkeeping writes enumerated in Appendix E.6: `last_opened_at`, search history, snapshot, `last_viewed_at`). A spy on the worker/runtime process spawn asserts neither starts (PRD-06, ARC-01/02). |
| `TST-14` | **Read-only originals** | File-system write allow-list test (REL-01); a checksum of the fixture folder is identical before and after a full job. |
| `TST-15` | **Budgets** | Automated measurement of B1–B14 on the budget machine profile; fail on > 20% regression (PRF-02). |
| `TST-16` | **Keyboard** | Every action in the registry is reachable by keyboard; Appendix A is generated from the registry and diffed in CI; no duplicate shortcuts in one context (NAV-32). |
| `TST-17` | **Layout** | At every matrix cell, no element overflows its container, no control is clipped, no page-body scroll bar appears, and the main surface is ≥ 420 px wide (NAV-05/06, VIS-10). |
| `TST-18` | **Contrast** | A unit test computes contrast for every token pair (VIS-15). |
| `TST-19` | **Visual regression** | Component gallery and screen scenarios are compared against baselines with a 0.1% pixel tolerance. |
| `TST-20` | **Search** | Exact search returns known fixtures; Smart without the runtime shows keyword results and the STA-08 message; progressive re-rank rule (SRC-06) is verified with a simulated late semantic result. |
| `TST-21` | **Decompose state machine** | Every transition in §8.3 is exercised; staleness never auto-queues (CMC-08). |
| `TST-22` | **Migration** | A copy of a real old catalog migrates, row counts match, a backup exists, and a forced failure restores the backup (ONB-11, REL-08). |
| `TST-23` | **Single instance** | A second launch focuses the first window; a locked catalog opens read-only with STA-20 and all write actions disabled. |
| `TST-24` | **Settings registry** | Every registry key has a UI control and a default; import of unknown/invalid values is reported (SET-06); resolution order is correct (SET-02). |
| `TST-25` | **Smart collections** | AND/OR rules, type-specific field disabling, live counts, pin/unpin, rename/duplicate/delete/undo, and context restoration are verified (COL-01..07). |
| `TST-26` | **Near duplicates** | Exact matches and perceptual candidates use known fixtures; scan is explicit; model runtime is not started; reviewed/not-duplicate decisions persist; no file operation is exposed (DUP-01..07). |
| `TST-27` | **Watch folders** | Default-off, event debounce, app-close shutdown, notification-only behaviour, and explicit LIB-11 approval are verified; no watcher can spawn OCR/indexing/embedding work directly (WCH-01..03, REL-14). |
| `TST-28` | **Comic slicing/spreads** | Tall strips, false positives, no-gutter inputs, centre-gutter spreads, adjusted boundaries, map-back pixel coordinates, undo/discard, and source-file immutability are verified (CMC-30..35). |
| `TST-29` | **Manual-vs-machine text** | Diff is read-only, changes only appear after backend save acknowledgement, and a failed save retains draft plus last-saved data (REV-21..22); persistence and no-implicit-work rules are verified separately (REV-23..24). |
| `TST-30` | **Type change/migration** | No library contains mixed types; changing a single root uses the move/re-register workflow; the backup restores all source catalog data after an injected failure; no image file changes (D-32..34, LIB-05, ONB-11..14). |
| `TST-31` | **Local source metadata** | URL/site/artist fields can be entered, copied, saved and migrated without network requests; clicking a URL is an explicit user action (INS-05a, REL-13). |

## 17.4 Definition of done (every feature)
A feature is done only when: its requirement IDs have passing tests; it works in web and exe; the core matrix passes; the budgets still pass; every new string has an entry in the states catalogue where relevant; its actions are in the registry with shortcuts; and `docs/audit.md` parity rows are ticked (§18).

---

# 18. Feature inventory and parity (nothing omitted)

This table is the contract behind D-31. Each **old** capability must exist in the **new** location. Items marked `VERIFY` were not visible in the screenshots; Phase 0 completes the inventory by running the current app.

| Old screen / feature (observed unless marked) | New location |
|---|---|
| **Library:** library dropdown ("Synthetic Fixture (2)"), sort ("Newest first"), filename filter, **Filters**, **Add library**, **Remove library**, "0 of 0 shown" counter, **Prev / Next** paging, Inspector, "No images match this view" + **Open Indexing Center** | Library menu (LIB-01..05); Sort and Filters (GAL-13/14); count text (GAL-04) — paging replaced by virtual scroll; Inspector (§7.2); empty states STA-02..06 |
| **Search:** "Search in: Pages & images / Panels"; modes *keyword, semantic, visual, similar, hybrid, comic_text*; source checkboxes *Prompt, Model/metadata, Filename, OCR text, Batch candidates*; **Search**; **Filters**; Preview panel with "double-click for the full image and all details" | Search page (§7.6): scope toggle Pages/Panels/Both; Smart/Exact/Similar + advanced modes (SRC-04); sources in Search settings; filters; Inspector + viewer |
| **Header:** global search box (`/` and `Ctrl+K`), **Options** button, `model: stopped` pill, footer `Ready` / `stopped` | Top-bar search (`/`) and palette search entry (NAV-12, NAV-24); View menu (NAV-13, `VERIFY` contents of Options); System chip (NAV-14) and tray (NAV-07) |
| **Indexing Center:** library dropdown, **Start indexing**, **Add library folder**, **Select folder scope**, **Pause / Resume / Stop safely / Retry failures**, Resource profile (Balanced…), library path display, Indexing preset (*ComfyUI*, *Comic / Manhwa (page + panels)*), stage selection with *All available / None* and *Skip completed*, per-stage **force**, stages (Discover files, Read metadata, Thumbnails, Text search (FTS), Text / Image / Audio / Video embeddings, Finalize job, Register panels, Panel thumbnails, Panel text search, Panel text vectors, Panel image vectors, Dialogue regions), runtime-off warning, Progress, Session log | Pipeline (§7.7): scope tree, presets, Customize with *All / None*, Skip completed, Re-run even if done, resource profile, Pause/Resume + Stop, Retry failures, Add library / folder scope (LIB-03, PIP-01), runtime note in Summary, job drawer with progress and session log (§7.8); stage mapping in Appendix C |
| **Dialogue Review:** Scope (*Pages and panels*), Queue (*Needs review*), **Queue** toggle, **Hide details**, Overlays on/off, Fit/100%/−/+/zoom %, page and region navigation buttons, "Region 2 of 4", **Mark reviewed**, Region crop, Dialogue text + *Manual correction* badge, Machine transcription + confidence + **Restore machine text**, **Lettering ink** (colour, source badge, reliability, Approve, hex, Set colour), Details (reading order, status, OCR, position), on-canvas editor with Save/Cancel, unsaved-changes guard (Save / Discard / Stay), failed-save error with draft retained, keyboard hints (←/→, R, H, drag to pan, Ctrl+wheel zoom, Ctrl+Enter, Esc) | Review (§9.2–9.3): Scope/Show filters (REV-02), queue strip toggle (`Q`), details toggle (`I`), overlays `H`, zoom buttons, navigation (REV-10), right-panel sections (REV-11), editor in the panel instead of on the canvas (REV-12), guard and failure handling (REV-13), ink (REV-14), mark reviewed (REV-15); Review zoom uses the same button/key model as the viewer (REV-18); verify the legacy mouse-wheel binding during audit and ensure the new help text matches the shipped behaviour |
| **Batch Recovery** (`VERIFY`) | Review → Failed items (REV-03) and Pipeline → Retry failures |
| **Panel Studio** (`VERIFY`) | Pipeline → Tools → Panel Studio (PIP-12) |
| **Settings** (`VERIFY`) | Settings registry (§12) — every existing setting mapped (SET-11) |
| **Viewer (double-click)** and **inspector preview** (reported behaviour, `VERIFY`) | §7.2, §7.3 |
| **Additional accepted suggestions:** smart collections, near-duplicate finder, pinned folders, opt-in watch notifications, machine/manual OCR diff, orphan-cache verification | Explore smart collections (COL-01..07); Pipeline Tools and Review → Near duplicates (DUP-01..07); folder tree and `Ctrl+P` pins (NAV-23, NAV-42); notification-only watchers (WCH-01..03); Review text diff (REV-21..22); Diagnostics/Maintenance cache verifier (DGN-02, PIP-13, REL-16) |
| **Harness:** "Reset synthetic fixture" | Kept (TST-02) |

---

# 19. Onboarding, migration and first run

## 19.1 First run (no libraries)
- `ONB-01` Show STA-01 full-area. The two cards open the **Add library wizard** (LIB-03) with the type preselected by the card chosen.
- `ONB-02` After the first library is created, a one-time dismissible checklist appears in the tray's drawer: *Check the library (Pipeline) → Browse (Explore) → Try a search*. It never reappears after dismissal.

## 19.2 Migrating the current catalog (D-68)
| ID | Rule |
|---|---|
| `ONB-10` | On the first launch of the new build with an old catalog, show a blocking **Update** screen: "Your library data needs updating. A backup is made first and your images are not touched." with **Update now** and **Quit**. Progress bar with the current table and counts. |
| `ONB-11` | Steps: (1) back up the old database to `backups/pre-migration-<date>/`; (2) create `app.db`; (3) create a library per old library; (4) **assign each old library a type** — the wizard asks "Is <name> a ComfyUI library or a Comic/Manhwa library?" (no auto-detect; D-32/D-33); where one old library mixes types, the user must select which roots belong to each new library; (5) copy items, metadata, stage state, manual corrections, tags and settings into the new tables; (6) rebuild FTS; (7) verify counts per table against the source; (8) mark migration complete. **Any failure restores the backup** and shows STA-22. |
| `ONB-12` | A legacy catalog that mixes types is split by the user at migration step 4. The wizard creates separate ComfyUI and Comic/Manhwa library records and asks the user to assign every root/folder to one of them. This is a catalog reassignment only; no image file is moved. Unassigned folders block migration until resolved. |
| `ONB-13` | Existing thumbnails are reused only if they are 320 px WebP; otherwise they are regenerated lazily on first view (never all at once at migration time). |
| `ONB-14` | **Nothing is deleted** from the old database; it remains in `backups/` until the user removes it. |

---

# 20. Future extension points (designed now, built later)

| Item | What v1 must already do |
|---|---|
| **CBZ / archive pages** (`DEFERRED`, D-86) | `PageSource` abstraction and nullable `container_id` (DAT-04..07); UI never assumes a filesystem path (DAT-06); thumbnails, previews and panel renders go through the protocol. A future `ArchiveSource` for `.cbz` (zip) needs only a new implementation of `list/open/fingerprint`. |
| **Pop-out viewer window** (`DEFERRED`, D-87) | The viewer is a self-contained component driven by a sequence object (ordered IDs + cursor) so it can be hosted in another Tauri window later. The in-app viewer and Comic Reader are v1. |
| **Model-assisted tags** (D-61) | v1 tags are manual. A future model-tagging task can write provenance-labelled suggestions into a review queue; it must never silently replace manual tags. |
| **ANN index** | Exact vector scan remains the default below about 100,000 vectors. Add ANN only after measured latency/memory show a need, behind the existing vector-search interface. |
| **Additional OCR languages** | v1 is English-only. `ocr.languages` remains list-shaped so additional languages can be added when the OCR engine and test fixtures support them. |
| **Remappable shortcuts** | v1 shortcuts are fixed and generated from the action registry. A remapping UI may be added later without changing action IDs. |
| **Additional library types** | v1 supports only ComfyUI and Comic/Manhwa. A future type must define its own metadata schema, filters, inspector sections and pipeline preset before it can be registered. |

---

# 21. Assumptions and open questions

## 21.1 Remaining assumptions (must be validated, not treated as owner decisions)

| # | Assumption | Validation or fallback |
|---|---|---|
| 1 | The budget machine has 8–16 GB RAM. | Measure actual available RAM in Phase 0; adjust cache, memory and concurrency defaults before approving performance budgets. |
| 2 | Windows 11 and WebView2 are present on the target portable-install environment. | Test on the owner's supported Windows setup and document whether WebView2 is bundled, provisioned or expected to exist. |
| 3 | The existing OCR engine can provide region boxes and confidence values. | Verify the installed engine/version and actual outputs. If confidence is absent, do not fabricate confidence scores; define a visible alternate review rule and record the necessary spec change. |
| 4 | Audio and video embedding stages remain useful for ComfyUI libraries that contain such files. | Audit existing functionality and dependencies. Preserve it if currently supported; otherwise document whether the current stage is inert, experimental or requires an explicit scope decision. |
| 5 | Dates and numbers use the Windows/system locale while UI copy is English. | Use operating-system locale formatting for dates/numbers; keep command names and core UI copy English for v1. |
| 6 | The long-strip candidate ratio, minimum gutter band and preferred segment ratio are tuning defaults, not proven detection accuracy; the near-duplicate perceptual threshold is likewise an initial heuristic. | Ship the disclosed defaults from §8.3/§12, label them as adjustable detection settings, and validate them against Cropper Lab's corrected golden set and duplicate fixtures. Never create a slice where no boundary is detected, and never describe a perceptual candidate as an exact duplicate. Change defaults only with recorded benchmark evidence. |

## 21.2 `VERIFY` list (Phase 0 must resolve and record every item in `docs/audit.md`)

1. **Data location and portable mode:** identify exactly where the current executable writes its catalog, settings, logs, caches and models. Confirm whether the current portable ZIP is self-contained or still depends on `%LOCALAPPDATA%`/user folders. Do not change the default path before testing backup and portability implications.
2. **Existing catalog schema:** list tables, columns, FTS indices, vector storage, per-item statuses, manual OCR fields, panel data and settings. Map every old field to §5, a migration export, or a documented non-retained item requiring owner approval.
3. **Cropper output contract:** prove whether the protected script returns page-pixel boxes, crops only, or both. If there is no deterministic manifest that maps every output to a parent page and coordinates, create a separate new cropper version that emits it. Similarity-based matching is not an acceptable primary mapping mechanism. This blocks the Comic/Manhwa Decompose release until resolved.
4. **Legacy feature inventory:** run the current app and inventory all commands, fields and workflows in Options, Settings, Batch Recovery and Panel Studio. Map each to this specification. D-31 means no working old capability is silently dropped.
5. **OCR engine:** record name, version, language files, output boxes, confidence semantics, lifecycle, whether it shares the model runtime, and whether it is offline. Update preset dependency labels if OCR requires the runtime; never claim OCR has finished before backend acknowledgement.
6. **Vector backend:** measure the existing vector store on the target machine. Keep it only if it meets B7 and config/version invalidation rules; otherwise implement the memory-mapped exact-scan design. Do not add ANN until the threshold/benchmark rule in §14.5 requires it.
7. **Legacy search fields:** trace exactly what “Batch candidates” searches, and what “Status: read” and “OCR ok · fixture” mean. Preserve any real user-facing capability and its source data. If a label is only synthetic-fixture instrumentation, move it to the test harness. If an old control has no production meaning, document that evidence and require a recorded owner-approved removal rather than silently dropping or renaming it.
8. **Synthetic fixture label:** establish whether “Synthetic Fixture (2)” represents two libraries or a fixture-specific count, and make the production library switcher use real library counts/names.
9. **Pipeline stage map:** run the old Indexing Center and record every stage, dependency, force/rerun rule, resource profile and failure-recovery operation. Confirm Appendix C stage mappings against the actual worker rather than screenshots alone.
10. **Startup freeze:** produce a timestamped startup trace for the executable, and the browser build if available, from process start to shell paint, first IPC, first item response and first visible thumbnail. Identify the blocking operation or record the remaining evidence gap. Do not declare the freeze fixed solely because the app launches once without freezing.
11. **Web/executable mismatch:** compare equivalent frontend commit/build hash, browser zoom, window/viewport, Windows scaling, `devicePixelRatio`, theme, density, text scale, native branches, origin-specific stored state and backend/runtime state. Record each cause found and add a regression test for it.
12. **Image serving and cache:** inspect the current image-loading path, cache headers, cache invalidation/fingerprints, and whether preview generation can block the UI thread. Benchmark before replacing working code.
13. **User-corrected OCR and panel data:** confirm which fields are already preserved after reprocessing and which are at risk. Tests must prove manual corrections and corrected panel boxes survive reprocessing, interruption, restart and migration.
14. **Current settings coverage:** compare every visible and hidden old setting to §12. Any omitted setting needs a recorded reason and cannot be dropped just because it is inconvenient to migrate.

These are implementation facts, not a request for the owner to re-answer the planning questionnaire. Repository evidence should resolve them. If a fact cannot be verified, document the uncertainty and keep the affected feature behind a clear unavailable/blocked state; do not represent it as complete.

## 21.3 Open questions

No new product-preference question is currently required to begin the audit or shared UI foundation. A genuinely new issue discovered during implementation must be added to `docs/open-questions.md` with: the exact requirement IDs affected, evidence, at least two concrete options, the consequence of each option, and a recommended default. A question must not be used to defer work that this specification already defines.

---

# Appendix A — Shortcut map (v1, fixed; generated from the action registry)

Shortcuts introduced by Appendix E (flags, view modes, privacy blur) are listed in **Appendix E.9** and are part of this map; `NAV-32` applies to them.

Single-letter keys work only when focus is **not** in a text field (NAV-26).

### Global
| Keys | Action |
|---|---|
| `Ctrl+K` | Command palette |
| `Ctrl+P` | Quick switcher (libraries, folders, saved searches, recents) |
| `Ctrl+Shift+L` | Library menu |
| `/` | Focus the top-bar search |
| `?` | Shortcut overlay |
| `Alt+←` / `Alt+→` | Back / Forward |
| `Esc` | Back out one transient level (NAV-21) |
| `Ctrl+1` … `Ctrl+5` | Explore, Search, Review, Pipeline, Settings |
| `Ctrl+,` | Settings |
| `Ctrl+J` | Toggle job drawer |
| `B` | Toggle folder tree (or saved-searches panel in Search) |
| `I` | Toggle inspector / info panel |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Ctrl+Shift+D` | Performance HUD |
| `F11` | Full screen |

### Gallery and search results
| Keys | Action |
|---|---|
| `←→↑↓` | Move focus |
| `Home` / `End` | First / last loaded item |
| `PageUp` / `PageDown` | One viewport |
| `Enter` | Open viewer |
| `Space` | Peek |
| `X` | Toggle selection of the focused item |
| `Shift+←→↑↓` / `Shift+click` | Extend / range select |
| `Ctrl+click` | Toggle |
| `Ctrl+A` | Select all loaded |
| `Esc` | Clear selection |
| `F` | Find similar |
| `C` | Compare (2–4 selected) |
| `H` | Toggle panel / region overlay (comic) |
| `Alt+↑` | Go to parent page (panel selected) |
| `Ctrl+C` / `Ctrl+Shift+C` | Copy image / copy path |
| letters | Type-ahead jump (filename sort) |

### Viewer and Compare
| Keys | Action |
|---|---|
| `←` `→` / `PageUp` `PageDown` | Previous / next |
| `Home` / `End` | First / last loaded |
| `+` `−` `0` `1` | Zoom in / out / Fit / 100% |
| `I` | Info panel |
| `P` | Reader (comic) |
| `L` | Link zoom (Compare) |
| `D` | Metadata diff (Compare) |
| `F11` | Full screen |
| `Esc` | Close |

### Reader
| Keys | Action |
|---|---|
| `Space` / `PageDown` | Next page or panel |
| `Shift+Space` / `PageUp` | Previous |
| `→` / `←` | Visually right / left (direction-aware, CMC-50) |
| `P` | Panel mode |
| `T` | Dialogue strip |
| `W` | Continuous mode |
| `Home` / `End` | First / last page |

### Review and panel editor
| Keys | Action |
|---|---|
| `←` `→` (canvas focus) | Previous / next region |
| `PageUp` `PageDown` | Previous / next page |
| `Ctrl+↑` `Ctrl+↓` | Previous / next queue item |
| `Q` | Toggle queue strip |
| `H` | Overlays |
| `R` | Mark reviewed |
| `Ctrl+Enter` | Save (and advance if auto-advance on) |
| `Ctrl+Shift+Enter` | Save and stay |
| `Esc` | In text: ask before discarding; otherwise return to canvas |
| `V` `D` `M` `S` `E` `Del` | Select, Draw, Merge, Split, Edit-box, Delete |
| `[` `]` | Move panel earlier / later in reading order (panel editor) |
| `Enter` | Accept panels (panel editor) |

---

# Appendix B — Key microcopy

| Where | Text |
|---|---|
| Launch banner | "Check for new files in “<name>”?" · **Check now** · **Not now** · **Never ask for this library** |
| Check result | "<N> new, <N> changed, <N> missing." · **Add & process…** · **Add to catalog only** · **Mark missing** · **Dismiss** |
| Start disabled (nothing to do) | "Everything in this scope is already processed. Enable ‘Re-run even if done’ to repeat." |
| Stop tooltip | "Stop safely — finishes the current item, then stops." |
| Remove library | "Remove “<name>” from ComfyPanel Studio? … Your image files are not touched." |
| Locked catalog | "This library is open in another ComfyPanel window or process, so it's read-only." |
| Save failed | "Couldn't save. Your text is still here." |
| Unsaved | "Unsaved changes in region <n>." · **Save** · **Discard** · **Stay** |
| Runtime off (search) | "Semantic search needs the model runtime." · **Start model** |
| Slow stage | "Embeddings are the slow stage on this computer." |
| Re-decompose | "<N> pages changed since they were decomposed." · **Re-decompose…** |
| Replace manual edits | "This will replace the panel edits you made on <N> pages." |

---

# Appendix C — Pipeline stage inventory

Names are user-facing; the **old name** column ties each to the current Indexing Center (`VERIFY` dependencies). "Runtime" = needs the model runtime.

### ComfyUI library
| # | Stage | Old name | Requires | Runtime | Enables |
|---|---|---|---|---|---|
| C1 | Find files | Discover files | – | – | listing images |
| C2 | Read metadata | Read metadata | C1 | – | prompt/model filters, inspector |
| C3 | Thumbnails | Thumbnails | C1 | – | grid |
| C4 | Text index | Text search (FTS) | C2 | – | Exact search |
| C5 | Text embeddings | Text embeddings | C2 | ✔ | Smart (semantic) |
| C6 | Image embeddings | Image embeddings | C3 | ✔ | Smart (visual), Similar |
| C7 | Audio embeddings *(only if audio files exist)* | Audio embeddings | C1 | ✔ | audio similarity |
| C8 | Video embeddings *(only if video files exist)* | Video embeddings | C1 | ✔ | video similarity |
| C9 | Finalize | Finalize job | all selected | – | consistent counts and indexes |

**Presets:** *Quick* = C1–C4, C9. *Full* = C1–C6 (+C7, C8 if present), C9. *Thumbnails only* = C1, C3. *Embeddings only* = C5, C6 (+C7, C8).

### Comic library
| # | Stage | Old name | Requires | Runtime | Enables |
|---|---|---|---|---|---|
| M1 | Find pages | Discover files | – | – | listing pages |
| M2 | Read page info | Read metadata | M1 | – | sizes, formats |
| M3 | Page thumbnails | Thumbnails | M1 | – | grid |
| M4 | Decompose | Register panels | M2 | – (worker + cropper) | panels |
| M5 | Panel thumbnails | Panel thumbnails | M4 | – | Panels scope grid |
| M6 | Read text (OCR) | Dialogue regions | M2 (panels if present) | – (OCR engine) | text, review |
| M7 | Text index | Text search (FTS) + Panel text search | M6 | – | Exact search |
| M8 | Text embeddings | Text embeddings + Panel text vectors | M6 | ✔ | Smart (semantic) |
| M9 | Image embeddings | Image embeddings + Panel image vectors | M3, M5 | ✔ | Smart (visual), Similar |
| M10 | Finalize | Finalize job | all selected | – | consistent counts and indexes |

**Presets:** *Quick* = M1–M3, M10. *Comic* = M1–M10. *Decompose only* = M1, M2, M4, M5. *OCR only* = M6, M7. *Embeddings only* = M8, M9.

*(OCR's runtime dependency: `VERIFY` whether the current OCR runs inside the model runtime; if so M6 is also runtime-dependent and the preset chips and PIP-24 apply to it.)*

---

# Appendix D — Errata and reconciliation (v1.4)

This appendix records what was found when the two-file set (`design.md`, `implementation-roadmap.md`) was reviewed for the appendix round, what was changed, and what the appendices add. It is normative where it says **MUST**.

## D.1 Defects found and how they were resolved

| # | Finding | Resolution |
|---|---|---|
| 1 | `REV-18` cited `ASSUMPTION #4, §21` for removing Ctrl+wheel zoom in Review, but §21.1 no longer contained that assumption (its #4 is audio/video stages), so the removal of an existing capability was undocumented. | Decision **D-94** added to the register; `REV-18` now cites it. |
| 2 | Roadmap Phase 2 numbered its tasks 1–6 and then 9–13 (7 and 8 missing). | Phase 2 renumbered continuously; no task removed. |
| 3 | Roadmap Phase 3 repeated smart collections (tasks 7 and 11) and cross-library similarity (tasks 8 and 10). | Merged into single tasks. |
| 4 | The two-database split and the catalog migration were first scheduled in Phase 6, although Phases 2–5 read from the new catalogs. | New **Phase 1b** builds the data-access interface and new schema, rehearses the migration on a *copy* of the real catalog, and keeps the real cutover in Phase 6. |
| 5 | Phase 0 diagnoses the launch freeze, but no task repairs it or gates later phases on the repair. | Phase 1b task 1 repairs it; the gate is budgets B1, B2, B3 and B11. |
| 6 | Phase 5 had 16 tasks spanning decompose, panel editing, OCR, review, reader, Cropper Lab, strips and spreads. | Split into **5a** (decompose and panels), **5b** (OCR and review), **5c** (reader, Cropper Lab, strips, spreads, panel export), each with its own gate. |
| 7 | The roadmap had no effort sizing, risk register, dependency graph or first end-to-end slice. | Added to roadmap v2.0 (walking skeleton = milestone M0). |
| 8 | `PRD-06` and `TST-13` allowed only "last opened" bookkeeping writes, which conflicts with viewing history (Appendix F). | Both now point to the enumerated list in **E.6**. |
| 9 | `INS-11` listed a *Rating* for a selected panel, but the data model has no panel rating. | `INS-11` now shows the parent page's rating, favourite and flag read-only; panels keep their own tags only. |

## D.2 Revised phase order

| Phase | Name | Depends on |
|---|---|---|
| 0 | Audit, baselines, risk retirement | – |
| 1 | Foundations and safety rails | 0 |
| **1b** | **Startup repair, two-database data layer, migration rehearsal, walking skeleton** | 0, 1 |
| 2 | Explore, gallery, inspector, viewer, compare; view modes, flags, privacy blur, copy-as | 1b |
| 3 | Search, collections, quick filters, relations | 2 |
| 4 | Pipeline, jobs, caches, re-run presets, export | 1b, 2 |
| **5a** | Comics: decompose, panel editor, page/panel gallery | 4 |
| **5b** | Comics: OCR, review, OCR quality report | 5a |
| **5c** | Comics: reader, Cropper Lab, strips, spreads, panel export | 5a (5b for text features) |
| 6 | Settings completion, diagnostics, onboarding, real migration cutover | 1b, 2–5c |
| 7 | Performance, parity, regression, release | all |
| **X** | **Expanded mode (Appendix J)** | Core stability gate, OCR readiness gate |

## D.3 Consolidated data additions

| Where | Addition | Defined in |
|---|---|---|
| `catalog.db` → `items` | `catalogued_at` (UTC; set when the row is first created) | F |
| | `import_batch_id` (→ `import_batches.id`) | F |
| | `last_viewed_at` (UTC, nullable) | F |
| | `flag` (`pick` \| `reject` \| null) | E |
| | `hidden` (bool, default false) | E |
| | `search_text_hash` (hash of the exact text that was indexed for search) | H |
| `catalog.db` → `import_batches` | `id`, `kind` (`initial` \| `root_added` \| `migrated` \| `discovered`), `created_at`, `item_count`, `job_id` (nullable) | F |
| `catalog.db` → `stage_state` | `stale_reason` (`file_changed` \| `text_changed` \| `reader_updated` \| null) | H |
| `catalog.db` → `folders` | `sensitive` (bool, default false) | E |
| `catalog.db` → `tags` | Tag-name constraints `TAG-01`–`TAG-04` | G |
| `app.db` → `relations` | See `RLN-03` | E |
| `app.db` → `settings` | New keys listed in each appendix | E–J |
| **Indexes** | `items(catalogued_at)`; partial indexes `items(favourite) WHERE favourite = 1`, `items(flag) WHERE flag IS NOT NULL`, `items(hidden) WHERE hidden = 1`, `items(last_viewed_at) WHERE last_viewed_at IS NOT NULL`; one index per sortable Table column (`TBL-03`) | E, F |
| **Reserved names — NOT created in v1** | `regions.kind`, `regions.speaker_id`, `items.page_kind`, `annotations`, `lab_queries`, `lab_judgments`, `clusters`, `cluster_members`, `suggestions`, `series_characters` | J |

`PRF-34` is extended by the indexes above. The reserved names exist only so later migrations do not collide; v1 MUST NOT create unused tables.

## D.4 Spec deltas applied to existing requirements

| Requirement | Change |
|---|---|
| `PRD-06`, `TST-13` | Permitted bookkeeping writes during browsing are exactly the list in **E.6**. |
| `REV-18` | Cites **D-94**. |
| `INS-11` | Panel inspector shows the parent page's rating/favourite/flag read-only. |
| `LIB-04` (Remove library dialog) | Adds the sentence "Reference links from other libraries to this library (<N>) will also be removed." when relations exist (`RLN-07`). |
| `PRF-34` | Index list extended (D.3). |
| `LIB-12`/`LIB-11` | A *discover* job that adds items creates an `import_batches` row of kind `discovered` (`IMP-01`). |

## D.5 New assumptions and `VERIFY` items (join §21.1 and §21.2)

| # | Assumption / item | Validation or fallback |
|---|---|---|
| A1 | `VERIFY` — Alt-based shortcuts (`Alt+1`, `Alt+2`, `Alt+P`, `Alt+X`, `Alt+U`) work in the exe's WebView2 window without side effects such as a bare Alt press focusing the system menu. | Test in Phase 1. Fallbacks are listed in **E.9**. |
| A2 | The 14-day stability window and the OCR gate thresholds in Appendix J are **proposals**. | Calibrate after the first baseline measurement; change by editing Appendix J. |
| A3 | Hidden items are still processed by jobs (hiding is a view concern). | See `FLG-05`; the Pipeline summary shows how many hidden items are in scope. |
| A4 | Panels inherit rating, favourite, flag and hidden state from their parent page. | See `FLG-06`. |
| A5 | `VERIFY` — thumbnail generation and metadata reading can run without the Python worker (Rust-side pool). | If not, ≤ 20-item re-runs may start the worker on demand; document in `docs/audit.md`. |
| A6 | `VERIFY` — ComfyUI PNGs carry both a `workflow` (graph) and a `prompt` (API) chunk and the current parser stores both. | If only one is stored, disable the other **Copy as** entry and say why. |

## D.6 Identifier ranges used by Appendices D–J

Decisions `D-94`–`D-107`. States `STA-36`–`STA-49`. Tests `TST-32`–`TST-60`. Requirement prefixes: `FLG` (flags), `TBL` (table view), `PRV` (privacy blur), `RLN` (relations), `COL-10`+ (built-in collections), `QFL` (quick filters), `VWH` (viewing history), `IMP` (import batches), `TAG` (tag rules), `CPY` (copy-as), `RRN` (re-run), `EXP` (export), `XPD` (Expanded mode).

---

# Appendix E — Organisation and view extras (Core v1)

Covers: Hide and Reject flags, Table view, Privacy blur, and Relations between a comic panel and a ComfyUI image (D-99 to D-102). Nothing in this appendix changes or deletes an image file (`PRD-09`).

## E.1 Hide and Reject flags (D-102)

| ID | Rule |
|---|---|
| `FLG-01` | `items.flag` is `null`, `pick` or `reject`; `items.hidden` is a boolean. Both are user data protected by `REL-02`: no stage, job or reprocessing writes them. Only the one-time migration may write them, and only to carry over an equivalent old value (`VERIFY`: the old catalog may have none). |
| `FLG-02` | **Hide** removes an item from every user-facing result set: gallery and table, folder/tree counts, Exact/Smart/Similar results (including cross-library), built-in and user collections, the viewer/compare sequence, Needs Attention lists and the Review badge, and near-duplicate candidates. The only place hidden items appear is the **Hidden view** (`FLG-04`). |
| `FLG-03` | Wording is fixed: the action is **Hide** with the tooltip "Hide (doesn't delete the file)"; the reverse is **Show again**. The word "delete" or "remove" is never used for hiding. |
| `FLG-04` | **Hidden view:** the **Hidden** filter in the Filters popover, or the palette action "Show hidden items", shows only hidden items (grid or table) with a "Hidden" badge; **Show again** is available on selection there. |
| `FLG-05` | **Jobs process hidden items** like any other (hiding is a view concern, not a processing concern). Pipeline scope counts show "(N hidden)" beside item totals. Hiding never changes `stage_state`. |
| `FLG-06` | **Panels are not flaggable.** A panel inherits its parent page's rating, favourite, flag and hidden state for display and filtering; a hidden page hides its panels everywhere. |
| `FLG-07` | **Reject** is a judgment, not removal: the item stays visible, dimmed (opacity 0.45) with a reject badge. The **Rejected** filter lists rejected items. **Hide all rejected in this view** shows the count in a confirmation and is undoable as one batch. |
| `FLG-08` | **Pick** shows a flag badge; the **Picks** filter and the built-in **Picks** collection (Appendix F) list picked items. |
| `FLG-09` | Setting a flag replaces the previous one (exactly one of pick / reject / none). The action applies to the selection, or to the focused item when nothing is selected, or to the current item in the viewer. It does **not** auto-advance unless `browse.advanceAfterFlag` is on (default off). |
| `FLG-10` | Every flag/hide operation is undoable (`NAV-50`) and shows an Undo toast (`NAV-51`). |
| `FLG-11` | Flags and hidden state are columns available to Table view and to CSV export (Appendix I). Hidden items are exported only when the export is started from the Hidden view. |

## E.2 Table view (D-100)

A **Grid | Table** toggle in the gallery toolbar (`Alt+1` Grid, `Alt+2` Table, plus palette actions). Available in Explore, Search results and collections.

| ID | Rule |
|---|---|
| `TBL-01` | Switching views keeps the same selection, filters, sort, quick filters and focused item; the table scrolls so the focused item is visible. The view mode is a setting (`browse.viewMode`, scopes A/L/F). |
| `TBL-02` | **Columns (ComfyUI items):** Thumbnail, **Name** (always shown), Folder, Dimensions, Size, Modified, Rating, Favourite, Flag, Tags, Model, Sampler, Steps, CFG, Seed, LoRAs, Processing (worst stage status), Prompt (first 60 characters; off by default). **Comic pages:** Thumbnail, **Name**, Series, Dimensions, Size, Modified, Rating, Favourite, Flag, Tags, Panels (count/status), OCR (status), Review (status). **Comic panels (Panels scope):** Thumbnail, Page, Panel #, Series, Size, OCR status, Tags, Text (first 80 characters). |
| `TBL-03` | **Sorting:** clicking a header cycles ascending → descending → library default. Only columns backed by an index are sortable: Name, Modified, Size, Dimensions (area), Rating, Model, Steps, Seed (ComfyUI); Name, Modified, Size, Rating, Page order (comic). Other headers are not sortable and show the tooltip "This column can't be sorted." Each sortable column has an index (`PRF-34`). |
| `TBL-04` | Row height follows density (28 / 32 / 40 px); the thumbnail column uses 24 / 28 / 36 px images from `cp-thumb`. The table is virtualised and paginated exactly like the grid (`GAL-02`, `ARC-06`). |
| `TBL-05` | **Keyboard and selection parity with the grid:** `↑↓` move, `Home`/`End`, `PageUp`/`PageDown`, `Enter` opens the viewer, `Space` peeks, `X` toggles, `Shift` ranges, `Ctrl+A`, `Esc` clears. Lasso is grid-only. Context menus are identical (`NAV-40`). |
| `TBL-06` | **Columns menu:** show/hide each column; **Move left / Move right** buttons per column (reordering is never drag-only); drag-to-resize is also supported with a minimum width of 64 px; **Reset columns**. Layout is saved per library in `table.columns`. |
| `TBL-07` | Cells truncate with an ellipsis and show the full value in a tooltip. Long prompts and OCR text are never shown unabridged in a cell. |
| `TBL-08` | **Export visible columns (CSV)** uses the export engine of Appendix I (`EXP-05`): all rows of the current result (not only loaded rows), the visible columns in their current order. |
| `TBL-09` | The table uses grid semantics (`role="grid"`, header buttons, row selection state) and the focus ring of `VIS-12`. |
| `TBL-10` | Table scrolling at 12,000 rows meets budget **B5**. |

## E.3 Privacy blur (D-101)

A display mask for use when others can see the screen. It is **not** security: it does not affect Alt+Tab previews, screenshots, screen sharing or exported files, and the Settings description says so (`PRV-09`).

| ID | Rule |
|---|---|
| `PRV-01` | **Toggle:** `Ctrl+Shift+B`, the View menu, or the palette. While on, the tray shows the chip "Privacy blur on" (click to turn off). |
| `PRV-02` | **Scope:** every image surface — grid and table thumbnails, series covers, previews (inspector, peek), viewer, compare, reader, Review canvas and region crops, panel editor, saved-search and similarity thumbnails. UI chrome is unaffected. |
| `PRV-03` | **Modes (`privacy.mode`):** `blur` (default) applies a CSS blur (`privacy.blurRadius`, default 24 px, range 8–48) on the compositing layer of the image container; `colour` does not load or decode images at all and shows each item's dominant colour. `colour` is the fallback when `blur` cannot hold budget **B5** (≥ 45 fps with blur on) on the budget machine. |
| `PRV-04` | **No flash at launch:** the blur state is stored in the small synchronous shell file read at launch step 2 (`PRF-20`), so the first frame is already blurred. `privacy.startBlurred` (default off) forces blur on at every launch. |
| `PRV-05` | **Text masking (`privacy.hideText`, default off):** filenames in hover bars, folder paths, prompts, negative prompts, OCR text and notes are replaced by "••••••" with a **Reveal** button; a reveal lasts until the selection changes or blur is turned off. |
| `PRV-06` | **Reveal one item:** context menu **Reveal this item** (and a **Reveal** button in the viewer) un-blurs that item for the current session; turning blur off or on again clears all reveals. There is no hold-a-key reveal. |
| `PRV-07` | **Auto-blur (`privacy.autoBlurOnBlur`, default off):** blur turns on when the window loses focus or is minimised. It never turns itself off; the user does. |
| `PRV-08` | **Sensitive folders:** the folder context action **Mark folder as sensitive** sets `folders.sensitive`; items in sensitive folders are always blurred (or colour-only) until revealed, independent of the global toggle. Views of items in sensitive folders are never recorded (`VWH-03`). |
| `PRV-09` | The Settings description reads: "Display mask only. It doesn't encrypt anything and doesn't affect screenshots, screen sharing, Alt+Tab previews or exported files." |
| `PRV-10` | Blur is applied without delaying or cancelling image requests, except in `colour` mode, which issues none. Copy/export actions work normally while blur is on; copying an image shows the toast "Copied (privacy blur is on)". |

## E.4 Relations: comic panel → ComfyUI image (D-99)

| ID | Rule |
|---|---|
| `RLN-01` | One relation kind exists in v1: **reference**. The *source* is a comic **panel**; the *target* is a **ComfyUI image**. Pages, other kinds (variant, duplicate) and image-to-image links are Expanded. |
| `RLN-02` | **Creation:** (a) from cross-library **Similar** results (`SRC-08`): a result panel's context menu or the selection bar offers **Use as reference for “<reference filename>”**; (b) from a ComfyUI image's inspector, **Add reference…** opens Search in Similar mode with that image as the reference and the comic library as the scope, so path (a) applies. There is no other creation path in v1. |
| `RLN-03` | **Storage (`app.db` → `relations`):** `id`, `kind` (`reference`), `panel_library_id`, `panel_page_item_id`, `panel_idx`, `panel_box_hash`, `panel_id_hint`, `image_library_id`, `image_item_id`, `note` (optional), `created_at`. |
| `RLN-04` | **Resolution and re-attachment:** a relation first resolves by `panel_id_hint` when the stored box hash still matches. Otherwise the page's panels are searched for a box with IoU ≥ 0.8 to the stored box; if found, the hint is updated. If none is found the relation shows **STA-38**. |
| `RLN-05` | **Display:** a ComfyUI image's inspector gains **References (N)** — panel thumbnails with a "Series · Page" chip and the note; clicking opens the panel in its library (Back returns). A panel's inspector gains **Used as reference for (N)** — image thumbnails; clicking opens the image in its library. Each entry has **Remove link** (Undo toast). |
| `RLN-06` | Deleting nothing: removing a link deletes only the relation row. |
| `RLN-07` | **Library removal:** relations pointing to a removed library are deleted with it, and the Remove-library dialog (`LIB-04`) adds "Reference links from other libraries to this library (<N>) will also be removed." Relations to a library that is merely unavailable show **STA-39** and are kept. |
| `RLN-08` | Relations are user data (`REL-02`) and survive re-decompose (`RLN-04`), OCR and re-runs. |

## E.5 Settings introduced here

Category placement (D-108): the `privacy.*` keys form the **Privacy** category; `browse.*` and `table.*` keys belong to **Browsing**.

| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `browse.viewMode` | enum `grid`,`table` | `grid` | A,L,F | Gallery view |
| `table.columns` | json | per library type | L | Visible columns, order, widths |
| `browse.advanceAfterFlag` | bool | false | A | Move to the next item after pick/reject |
| `privacy.mode` | enum `blur`,`colour` | `blur` | A | How privacy mode hides images |
| `privacy.blurRadius` | int 8–48 | 24 | A | Blur strength (px) |
| `privacy.startBlurred` | bool | false | A | Start every session blurred |
| `privacy.autoBlurOnBlur` | bool | false | A | Blur when the window loses focus |
| `privacy.hideText` | bool | false | A | Also mask filenames, prompts, notes |

## E.6 Permitted bookkeeping writes (`PRD-06`, `TST-13`)

While the user is only browsing (navigating, selecting, opening the inspector, viewer, Review or a collection, switching libraries or launching), the application MAY write **only** the following, and nothing else:

1. `libraries.last_opened_at`
2. `search_history` rows (when `search.historyEnabled`)
3. The launch snapshot file and the small shell-state file (`PRF-20`, `PRV-04`)
4. `items.last_viewed_at` under the rules of `VWH-01`–`VWH-03`
5. Settings and panel layout changes the user made through the UI (`SET-04`)

Anything else — including flags, hide, tags, ratings, relations, notes, jobs of any kind — requires an explicit user action.

## E.7 States

| ID | State | Message | Actions |
|---|---|---|---|
| `STA-36` | Hidden view is empty | "No hidden items." | **Back to all items** |
| `STA-37` | No references yet | "No references yet. **Add reference…** finds comic panels similar to this image." | **Add reference…** |
| `STA-38` | Reference panel changed | "Reference panel changed — its page was decomposed again." | **Open page**, **Remove link** |
| `STA-39` | Referenced library unavailable | "Library unavailable: <name>." | **Open Manage libraries**, **Remove link** |

## E.8 Tests

| ID | Test |
|---|---|
| `TST-32` | Run every stage, re-run and migration against a catalog with flags/hidden set; none are modified (`FLG-01`, `REL-02`). |
| `TST-33` | A hidden item is absent from grid, table, counts, Exact/Smart/Similar results, collections, viewer sequence, Needs Attention, and appears only in the Hidden view; a job still processes it (`FLG-02`, `FLG-05`). |
| `TST-34` | Grid/Table parity: selection, filters, sort, focus and scroll anchor survive toggling; unsortable columns are disabled; CSV of visible columns matches (`TBL-01`–`TBL-08`). |
| `TST-35` | Privacy blur covers every surface in `PRV-02` (screenshot test per surface), the first frame is blurred when `privacy.startBlurred` is on, and `colour` mode issues zero image requests (`PRV-03`, `PRV-04`). |
| `TST-36` | A relation survives a *Replace* re-decompose when a matching box exists, and shows `STA-38` when it does not (`RLN-04`). |
| `TST-37` | While blur is on or the item is in a sensitive folder, `last_viewed_at` is not written (`PRV-08`, `VWH-03`). |

## E.9 Shortcuts introduced here (added to Appendix A)

| Keys | Context | Action |
|---|---|---|
| `Alt+1` / `Alt+2` | Gallery, Search, collections | Grid / Table |
| `Ctrl+Shift+B` | Global | Toggle privacy blur |
| `Ctrl+Shift+H` | Gallery, table, viewer | Hide selection / current item |
| `Alt+P` / `Alt+X` / `Alt+U` | Gallery, table, viewer | Pick / Reject / Clear flag |

`VERIFY` (Phase 1, assumption A1): if a bare Alt press misbehaves in the exe, these fallbacks replace the Alt shortcuts and Appendix A is regenerated from the action registry — Grid `Ctrl+Shift+1`, Table `Ctrl+Shift+2`, Pick `Ctrl+Shift+K`, Reject `Ctrl+Shift+X`, Clear flag `Ctrl+Shift+U`.

---

# Appendix F — Built-in smart collections, quick filters and viewing history (Core v1)

Covers D-103. Built-in collections reuse the smart-collection rule engine (`§7.6.1`, `COL-01`–`COL-07`); this appendix defines the exact predicates, the data they need, and the Quick filters strip. Nothing here starts a job (`PRD-06`).

## F.1 Import batches

| ID | Rule |
|---|---|
| `IMP-01` | Every operation that creates item rows creates one `import_batches` row: kind `initial` (the first batch of a library), `root_added` (items from a root folder added later), `migrated` (all items brought in by the one-time migration), or `discovered` (items found by a later *Check for new files* and applied by the user). Each new item gets `import_batch_id` and `catalogued_at` (UTC, the time the row was created). |
| `IMP-02` | Only batches of kind `discovered` feed **Recently added** (`COL-12`). This is why a freshly indexed or migrated library does not show every image as "recent". |
| `IMP-03` | For migrated items, `catalogued_at` carries over the old catalog's "added" time if the old schema has one (`VERIFY`), otherwise the migration time; the batch kind is still `migrated`. |

## F.2 Built-in smart collections

| ID | Rule |
|---|---|
| `COL-10` | Built-ins are **defined in code**, not stored as database rows: `{ id: "builtin:<name>", version, label, libraryTypes, rules, defaultSort, cap }`. They appear in the left panel under **Smart collections ▸ Built-in**. A built-in cannot be renamed or deleted. It can be **hidden** (`collections.hiddenBuiltins`, library scope), **pinned** (the same pin mechanism as user collections), or **duplicated to edit** (creates a user collection named "<label> (copy)" with the same rules). |
| `COL-11` | **Rule-engine additions required** (extending `COL-03`): relative date ("in the last N days") on `catalogued_at` and `last_viewed_at`; *is set* / *is not set*; *stage status is any of …* per stage; *stage incomplete over the applicable stage set* (`QFL-03`); *flag equals*. Every collection and every search implicitly adds `hidden = false` (`FLG-02`). |
| `COL-12` | **Recently added:** item's batch kind is `discovered` **and** `catalogued_at ≥ now − collections.recentDays` (default 14). Sort: `catalogued_at` descending. |
| `COL-13` | **Recently viewed:** `last_viewed_at` is set. Sort: `last_viewed_at` descending. Shows at most the latest `collections.recentViewedMax` (default 200) items. |
| `COL-14` | **Favourites:** `favourite = true`. Sort: the library default. |
| `COL-15` | **Picks:** `flag = pick`. Sort: the library default. |
| `COL-16` | **Unrated:** rating is unset (null or 0). Flags are ignored on purpose, so the rule is predictable. |
| `COL-17` | **Needs OCR (comic libraries only):** the page's aggregate OCR status is not `done`. The OCR *units* of a page are its **accepted panels**, or the page itself when it has no accepted panel (a page whose decomposition is only `proposed` counts as having no accepted panel). The aggregate is `done` only if **every** unit has a current OCR result (`OCR-08`); it is `partial` if at least one unit is done and one is not; `none`, `stale`, `failed` and `partial` all count as needing OCR. The row detail says which. |
| `COL-18` | **Not decomposed (comic libraries only):** the page's panel-set status is `none` or `failed`, or the page has no panel-set row. Pages that are `queued`, `running`, `proposed`, `accepted`, `no_panels_found` or `stale` are excluded; those have their own Needs Attention entries. |
| `COL-19` | A collection view uses the shared Sort control. The sorts above are defaults; a user's change is saved per collection. |
| `COL-20` | **Stability (`COL-04` applies):** an open collection never reorders and never drops items by itself. Catalog changes show "Updated — **Refresh**". Items viewed while **Recently viewed** is open never reorder that open list. |
| `COL-21` | **Counts** beside collection names are computed lazily while the left panel is open and omitted if they cannot be produced within 150 ms. Queries use the partial indexes in D.3. |
| `COL-22` | Built-ins are **per library** in v1; there are no "all libraries" built-ins. |
| `COL-23` | **Visibility by type:** ComfyUI libraries show Recently added, Recently viewed, Favourites, Picks, Unrated. Comic libraries show those five plus Needs OCR and Not decomposed. |

## F.3 Viewing history (`last_viewed_at`)

| ID | Rule |
|---|---|
| `VWH-01` | **What counts as a view:** an item displayed in the viewer or in peek for at least `browse.viewDwellMs` (default 1,500 ms) of continuous display. Selection, hover, grid/table display, the inspector, compare, and reader page turns shorter than the dwell never count; in the reader, a page displayed for the dwell counts for that page item. Arrowing through many images quickly records nothing. |
| `VWH-02` | **Write coalescing:** views are collected in memory and flushed in **one transaction** every 30 s, after 5 s without input, when 200 are pending, and on exit. A failed flush is retried at the next flush. Nothing is written when the library is read-only (no error is shown). |
| `VWH-03` | **Not recorded** when `browse.trackRecentlyViewed` is off; when privacy blur is on (unless `browse.recordViewsWhenBlurred` is on); for items in sensitive folders (`PRV-08`); or when the library is read-only. |
| `VWH-04` | **Clear viewing history** (Settings → Browsing; per library or all) sets `last_viewed_at` to null for the chosen libraries after a confirmation dialog. It cannot be undone. |
| `VWH-05` | Viewing history is excluded from diagnostics bundles, exports and settings export. |
| `VWH-06` | The migration carries no viewing history (`last_viewed_at` starts null). |

## F.4 Quick filters strip

A strip of toggle chips under the gallery toolbar in Explore, Search results and collections, in both Grid and Table view.

| ID | Rule |
|---|---|
| `QFL-01` | Chips, in order: **Favourites**, **Rated 4+**, **Picks**, **Incomplete ▾**, **Failed**. An active chip shows a check icon and the accent underline. |
| `QFL-02` | **Semantics:** *Favourites* = `favourite = true`; *Rated 4+* = `rating ≥ 4`; *Picks* = `flag = pick`; *Incomplete* = at least one **applicable stage** (`QFL-03`) has status none, stale, failed or skipped; *Failed* = at least one stage has status failed. Hidden items are excluded (`FLG-02`). |
| `QFL-03` | **Applicable stages** of an item are the stages of the library's **Full** (ComfyUI) or **Comic** preset that apply to the item's kind: audio/video stages only for audio/video items; for comic pages, the panel-dependent stages apply only once the page has accepted panels, while *Decompose* itself always applies. In **Panels** scope the applicable stages are panel thumbnails, OCR, text index and the embedding stages for that panel. |
| `QFL-04` | **Incomplete ▾** opens a menu: *Any stage* (default) or one named stage. The chip then shows the stage name. |
| `QFL-05` | **Combination:** all active chips are AND-ed with each other and with the folder, search query, collection and every other filter. |
| `QFL-06` | **Session-only:** active chips are **never** written to folder view memory, the launch snapshot or settings. They are kept in the current session's navigation history (so Back restores them) and reset when the app exits or the library changes. |
| `QFL-07` | **No silent hiding (the "only 5 images" lesson):** while any chip is active, the count text reads e.g. "37 of 412 · Favourites, Rated 4+", the chips stay visible, and a **Clear** button is shown. |
| `QFL-08` | **Panels scope:** *Favourites*, *Rated 4+* and *Picks* apply through the parent page (`FLG-06`); *Incomplete* and *Failed* use the panel's own stages (`QFL-03`). |
| `QFL-09` | Chip counts appear only in tooltips and only when computable within 150 ms. |
| `QFL-10` | **Save search** (`SRC-11`) stores active chips as ordinary filters in the saved definition, and the dialog lists them before saving. |

## F.5 Settings introduced here

| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `collections.recentDays` | int 1–90 | 14 | A,L | "Recently added" window (days) |
| `collections.recentViewedMax` | int 20–1,000 | 200 | A,L | Items kept in "Recently viewed" |
| `collections.hiddenBuiltins` | json list | `[]` | L | Built-in collections hidden in this library |
| `browse.viewDwellMs` | int 500–10,000 | 1,500 | A | Time on screen before a view counts |
| `browse.trackRecentlyViewed` | bool | true | A | Record viewing history |
| `browse.recordViewsWhenBlurred` | bool | false | A | Record views while privacy blur is on |

## F.6 States

| ID | State | Message |
|---|---|---|
| `STA-40` | Recently added is empty | "No recently added items. Items found by ‘Check for new files’ appear here for <N> days." |
| `STA-41` | Recently viewed is empty | "Nothing viewed yet. Items appear here after you look at them for <dwell> seconds." |
| `STA-42` | Picks is empty | "No picks yet. Mark items with `Alt+P`." |
| `STA-43` | Favourites is empty | "No favourites yet." |
| `STA-44` | Unrated is empty | "Every item has a rating." |
| `STA-45` | Needs OCR / Not decomposed is empty | "Nothing needs OCR." / "Every page has been decomposed or flagged." |

## F.7 Tests

| ID | Test |
|---|---|
| `TST-38` | Recently added excludes `initial`, `root_added` and `migrated` batches, includes `discovered` batches inside the window, and respects `collections.recentDays` (`IMP-02`, `COL-12`). |
| `TST-39` | Dwell logic: stepping through 50 images at 300 ms each writes no `last_viewed_at`; stopping on one for 1.5 s records exactly one (`VWH-01`). |
| `TST-40` | No view is recorded while tracking is off, privacy blur is on, the item is in a sensitive folder, or the library is read-only (`VWH-03`). |
| `TST-41` | Views are flushed in a single transaction, at most every 30 s or on exit, and a forced failure retries without data loss (`VWH-02`). |
| `TST-42` | An open *Recently viewed* collection does not reorder when an item is viewed; a Refresh chip appears (`COL-20`). |
| `TST-43` | Quick filters AND-combine, are absent from the snapshot and folder view memory, are restored by Back within a session, and the count text names them (`QFL-05`–`QFL-07`). |
| `TST-44` | The predicates of `COL-17`, `COL-18`, `QFL-02`, `QFL-03` return the expected sets over a fixture matrix of stage states, decomposition states and OCR-unit states. |

---

# Appendix G — Copy-as utilities and tag rules (Core v1)

Covers D-104. Copying never writes to the catalog (`PRD-06`).

## G.1 Tag-name rules (needed so copying tags is unambiguous)

| ID | Rule |
|---|---|
| `TAG-01` | A tag name is 1–60 characters after trimming leading and trailing whitespace. |
| `TAG-02` | A tag name contains no commas and no line breaks. In the tag input, typing a comma or pressing `Enter` commits the current tag; pasting "a, b" creates two tags. |
| `TAG-03` | Uniqueness is case-insensitive; the first-created capitalisation is displayed. |
| `TAG-04` | **Migration:** existing tags that break these rules are sanitised (commas and line breaks become spaces, trimmed, truncated to 60 characters; case-insensitive duplicates merged) and the number changed is reported in the migration summary. |

## G.2 The **Copy as ▸** submenu

Available from the context menu (`NAV-41`), the selection bar and the palette; entries share action IDs (`NAV-30`). Entries that do not apply stay visible but disabled, with the reason as a tooltip. The existing `Ctrl+C` (copy image) and `Ctrl+Shift+C` (copy path) are unchanged.

| Entry | Library | Needs |
|---|---|---|
| Prompts (one per line) | ComfyUI | ≥ 1 item |
| Unique prompts | ComfyUI | ≥ 2 items |
| Negative prompts | ComfyUI | ≥ 1 item |
| Tags (one line per item) | both | ≥ 1 item |
| All distinct tags | both | ≥ 2 items |
| Workflow JSON | ComfyUI | exactly 1 item that has a workflow |
| Prompt API JSON | ComfyUI | exactly 1 item that has an API prompt |
| OCR text | comic | ≥ 1 page or panel |

| ID | Rule |
|---|---|
| `CPY-01` | **Source and order:** items are copied in **gallery order** (not click order). A "Select all N" selection resolves server-side with the same query and sort, so unloaded items are included and hidden items are excluded (`FLG-02`). |
| `CPY-02` | **Prompts:** the stored text exactly, except every run of line breaks becomes a single space and the result is trimmed, so each prompt is one line. Items with no prompt are skipped and counted. The toast reports both numbers, e.g. "Copied 22 of 24 prompts — 2 have no prompt." |
| `CPY-03` | **Unique prompts:** exact string comparison after the normalisation in `CPY-02`; the first occurrence keeps its position. **Negative prompts** follow `CPY-02`. |
| `CPY-04` | **Tags:** one item → `a, b, c`. Several items → one line per item in the same format; items without tags are skipped and counted (same toast style). |
| `CPY-05` | **All distinct tags:** the union of the selection's tags on one line separated by `, `, sorted by frequency (descending), then alphabetically (case-insensitive). |
| `CPY-06` | **Workflow JSON** and **Prompt API JSON** copy the embedded data **verbatim**, with no re-serialisation, reformatting or key re-ordering. *Workflow JSON* is the embedded graph (the data ComfyUI loads when the image is dropped in). *Prompt API JSON* is the embedded API-format prompt. The UI does **not** promise that pasting into ComfyUI works; **Save workflow as .json…** (Appendix I engine, same bytes) is the dependable route. `VERIFY` assumption A6. |
| `CPY-07` | **OCR text (comics):** a page → the effective text of its regions in reading order with a blank line between panels; a panel → that panel's text. Several items are separated by a line containing `---` between blank lines. Machine-versus-manual choice follows `OCR-04` (effective text). |
| `CPY-08` | **Limits:** more than `copy.confirmItems` (2,000) items or `copy.confirmMB` (2 MB) opens a confirmation "That's a lot to copy (<N> items, <X> MB)" with **Copy anyway** and **Export as file…**; more than `copy.hardCapItems` (10,000) items or `copy.hardCapMB` (5 MB) offers **Export as file…** only. |
| `CPY-09` | Text is UTF-8 with LF line endings. If the clipboard cannot be written, show **STA-46** with **Save as file…**. |
| `CPY-10` | Copying works in read-only libraries and while privacy blur is on (`PRV-10`); it never writes to the catalog. |

## G.3 Settings introduced here

| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `copy.confirmItems` | int 100–10,000 | 2,000 | A | Ask before copying more than this many items |
| `copy.confirmMB` | float 0.5–5 | 2 | A | Ask before copying more than this much text |
| `copy.hardCapItems` | int | 10,000 | A | Maximum items copied to the clipboard |
| `copy.hardCapMB` | float | 5 | A | Maximum clipboard text size |

## G.4 States and tests

| ID | State | Message | Actions |
|---|---|---|---|
| `STA-46` | Clipboard unavailable | "Couldn't access the clipboard." | **Save as file…**, **Retry** |
| `STA-47` | Copy too large | "That's a lot to copy (<N> items, <X> MB)." / "Too many to copy (limit <N> items / <X> MB)." | **Copy anyway**, **Export as file…** |

| ID | Test |
|---|---|
| `TST-45` | Prompt copy flattens line breaks, skips and counts missing prompts, preserves gallery order, and "Select all N" includes unloaded items and excludes hidden ones (`CPY-01`, `CPY-02`). |
| `TST-46` | Tag rules: commas/line breaks rejected on entry, case-insensitive uniqueness, migration sanitising report, per-item and distinct-tag copies match the rules (`TAG-01`–`TAG-04`, `CPY-04`, `CPY-05`). |
| `TST-47` | Workflow and API JSON copies are byte-identical to the embedded chunks in the source file (`CPY-06`). |
| `TST-48` | Unique prompts de-duplicate exactly and keep first-occurrence order (`CPY-03`). |
| `TST-49` | Confirmation and hard-cap thresholds behave as specified and never truncate silently (`CPY-08`). |

---

# Appendix H — Re-run presets: Re-read metadata and Regenerate thumbnails (Core v1)

Covers D-105. These are two single-task presets built from existing stages. They are explicit, scoped, never automatic, and never touch user data (`REL-02`).

## H.1 What they are and where they live

| ID | Rule |
|---|---|
| `RRN-01` | **Re-read metadata** and **Regenerate thumbnails** appear (a) in the context menu and selection bar as **Re-run ▸**, scoped to the selection, and (b) as single-task cards in Pipeline (`PIP-02`), scoped by the Pipeline scope tree (so a folder or whole library can be re-run too). |
| `RRN-02` | **Quick confirm:** for a selection of ≤ `rerun.quickConfirmMax` (50) items whose stages need no model runtime, a compact dialog replaces the full composer: "Regenerate thumbnails for 12 items? **[Regenerate]  [Cancel]**", stating the counts (to process, missing files skipped). Larger scopes open the Pipeline composer **prefilled and not started**. Both paths run as a normal job (tray, drawer). |
| `RRN-03` | **Forced, not skipped:** both presets ignore *Skip completed*; the Summary shows "Re-run forced: <stage>" (`PIP-05`). Missing files are skipped and counted. Hidden items are included only if they are in the chosen scope (`FLG-05`). |
| `RRN-04` | **Priority:** a run of ≤ `rerun.interactiveMax` (20) items uses interactive priority (`PRF-50`); larger runs are background jobs. `VERIFY` assumption A5 (whether the Python worker is needed). |
| `RRN-05` | **Not undoable.** The dialog says so ("The previous thumbnail/metadata is replaced."). The automatic backup rule (`REL-03`) covers runs over 1,000 items. |

## H.2 Exact stage sets

| Preset | Library | Stages run | Notes |
|---|---|---|---|
| **Re-read metadata** | ComfyUI | `C2` forced → incremental `C4` (text index) for items whose searchable text changed | If an item's file fingerprint changed, `C3` (thumbnails) is also forced for that item (with a notice). |
| **Re-read metadata** | Comic | `M2` (page info) forced | If width, height or fingerprint changed, see the invalidation matrix. |
| **Regenerate thumbnails** | ComfyUI | `C3` forced | Cached previews for these items are dropped (they regenerate lazily on next view). |
| **Regenerate thumbnails** | Comic | `M3` forced, plus `M5` (panel thumbnails) for pages that have accepted panels | Cached previews and panel renders for these pages are dropped. |

## H.3 Invalidation matrix

| Action | Rewrites | Marks **stale** | Never touches |
|---|---|---|---|
| Re-read metadata (ComfyUI) | metadata (`comfy_meta`, workflow), search index for changed items, `search_text_hash` | **text embeddings** — only for items whose `search_text_hash` changed (`stale_reason = text_changed`); if the file changed: thumbnails regenerate (automatic), image/audio/video vectors → stale (`file_changed`) | tags, notes, rating, favourite, flag, hidden, relations |
| Re-read metadata (comic) | sizes, formats | if dimensions or fingerprint changed: decomposition → stale and OCR → stale (`file_changed`), thumbnails regenerate, vectors stale; otherwise nothing | corrections, ink, edited boxes, flags, relations, tags |
| Regenerate thumbnails | thumbnails (and panel thumbnails), preview cache entries | nothing | everything else |

- `RRN-06` **Stale vocabulary:** one status word, **Stale**, with a `stale_reason` shown in tooltips: *file changed*, *text changed*, *reader updated*. "Outdated" is not a separate status. A stage whose recorded `stage_version` is older than the current implementation is shown as Stale with reason *reader updated*, and Pipeline and Diagnostics show a count "N items were read by an older metadata reader — **Re-read metadata…**" (opens the prefilled composer; never automatic).
- `RRN-07` **Nothing re-runs by itself:** stale decomposition, OCR and embeddings are only *marked*. The Search signal line shows "Semantic 4,198 / 12,043 (12 out of date)" with **Update embeddings** (opens *Embeddings only* prefilled for the out-of-date items).

## H.4 Safety rules

| ID | Rule |
|---|---|
| `RRN-08` | **Compute fully, then swap:** each item's new result is computed completely and written in one transaction. If computing fails (corrupt file, parser error), the **previous result is kept**, the stage is recorded as Failed with the message "Kept the previous result", and the job continues. A failed re-run never deletes data. |
| `RRN-09` | **Sample preview for large forced re-reads:** when the scope exceeds `rerun.samplePreviewThreshold` (200) items, before Start the composer reads `rerun.sampleSize` (20) evenly spaced items **in memory only** and shows "Would change N of 20 items" with a before/after view of the changed fields. **Proceed** and **Cancel** are offered. This catches a regressed reader before it overwrites the catalog. |
| `RRN-10` | **Manual data is never written** by these presets (`REL-02`, `TST-12`). A re-read that changes comic page dimensions marks decomposition and OCR stale but keeps all regions, corrections, ink values, panels and relations. |
| `RRN-11` | **Embeddings staleness honesty:** stale vectors remain searchable until updated and are counted separately in coverage text (`SRC-07`). |

## H.5 Settings introduced here

| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `rerun.quickConfirmMax` | int 1–500 | 50 | A | Largest selection that gets the compact confirm |
| `rerun.interactiveMax` | int 1–100 | 20 | A | Largest re-run run at interactive priority |
| `rerun.samplePreviewThreshold` | int 50–5,000 | 200 | A | Scope size above which a sample preview is shown |
| `rerun.sampleSize` | int 5–100 | 20 | A | Items read for the sample preview |

## H.6 Tests

| ID | Test |
|---|---|
| `TST-50` | Both presets ignore *Skip completed*, skip and count missing files, and show "Re-run forced" in the Summary (`RRN-03`). |
| `TST-51` | Failure injection: a corrupt file and a parser error leave the previous metadata/thumbnail intact and record "Kept the previous result" (`RRN-08`). |
| `TST-52` | The invalidation matrix: after each action, exactly the listed items/stages are stale with the listed reasons, and nothing else changes (`RRN-06`, `RRN-07`). |
| `TST-53` | The sample preview reads exactly `rerun.sampleSize` items in memory, writes nothing, and reports the number that would change (`RRN-09`). |
| `TST-54` | Manual data (tags, notes, rating, flags, relations, corrections, ink, edited boxes) is unchanged after both presets, including when page dimensions change (`RRN-10`). |

---

# Appendix I — Export, core (v1)

Covers D-98. Exports are always **copies** written outside every library root (`REL-01`, `STA-26`). The verbose export branch is Expanded (Appendix J).

## I.1 Entry points and shared rules

**Export ▸** is in the selection bar, the context menu and the palette, for a selection, a folder, a collection or search results: **Prompts (CSV)…**, **Images + captions…**, and (comic) **Panels…** (`CMC-60`). Table view adds **Export visible columns (CSV)** (`TBL-08`).

| ID | Rule |
|---|---|
| `EXP-01` | **Destination:** a native folder picker; the folder MUST be outside all registered library roots, otherwise **STA-26**. The last folder is remembered (`export.lastDir`). |
| `EXP-02` | **Never overwrite:** if a target name exists, a numeric suffix is added (`name_2.png`) and the matching caption file uses the same stem. |
| `EXP-03` | **Dry-run summary** before Start: item count, estimated size (sum of source sizes for copies), items skipped and why (missing file, no caption), and a free-space check requiring the estimated size plus 10%. Insufficient space shows **STA-48** and does not start. |
| `EXP-04` | Export is a job of kind `export` at background priority, with progress in the drawer and **Stop safely**. Files already written are complete; a file being written when Stop is pressed is removed. Completion toast "Export finished — <N> items, <M> skipped. **[Open folder]**" (**STA-49** when anything was skipped). |
| `EXP-05` | **Prompts (CSV):** columns, in order: `file`, `folder`, `positive_prompt`, `negative_prompt`, `model`, `loras`, `sampler`, `steps`, `cfg`, `seed`, `width`, `height`, `tags`, `rating`, `favourite`. UTF-8 with a byte-order mark (`export.csvBom`, default on, for Excel), comma delimiter, CRLF row endings, RFC 4180 quoting; line breaks inside prompts are **preserved** inside quoted cells (unlike copy-as). Items without a prompt are included with empty cells. **Export visible columns** uses the same writer with the table's columns instead. |
| `EXP-06` | **Images + captions:** copies each original **byte-identically** (no resize, no re-encode, metadata kept) and writes a `.txt` with the same stem. Three fixed caption templates: **Prompt** (positive prompt, line breaks flattened to a space), **Tags** (`tag1, tag2, tag3`), **Prompt + tags** (`<prompt>, tag1, tag2`). Items lacking the chosen caption data are **skipped and reported**, unless `export.includeUncaptioned` is on (then no `.txt` is written for them). |
| `EXP-07` | **Comic panels (existing `CMC-60`):** unchanged, plus one optional checkbox **Write caption .txt from OCR text** (default off) that writes each panel's effective text (`OCR-04`). |
| `EXP-08` | **Manifest:** `manifest.json` (`export.writeManifest`, default on) lists the app version, date, library name and type, template used, and for each item the relative source path, output file and fingerprint (size + modified time + first-64 KB hash; not a full-file hash). |
| `EXP-09` | **Save workflow as .json…** (single item) writes the embedded workflow bytes verbatim to a file name derived from the image, under the same destination rules (`CPY-06`). |
| `EXP-10` | A confirmation appears for exports above 5,000 items or 5 GB estimated: "This will copy <X> GB." |

## I.2 Settings introduced here

| Key | Type / range | Default | Scopes | Description |
|---|---|---|---|---|
| `export.lastDir` | path | none | A | Last export folder |
| `export.writeManifest` | bool | true | A | Write `manifest.json` with exports |
| `export.includeUncaptioned` | bool | false | A | Include images that have no caption data |
| `export.csvBom` | bool | true | A | Start CSV files with a byte-order mark |

## I.3 States and tests

| ID | State | Message | Actions |
|---|---|---|---|
| `STA-48` | Not enough disk space | "Not enough free space: need <X>, have <Y>." | **Choose another folder…** |
| `STA-49` | Export finished with skips | "Export finished — <N> items, <M> skipped." | **View skipped**, **Open folder** |

| ID | Test |
|---|---|
| `TST-55` | Exports never overwrite, never write inside a library root, and leave the source folder checksum unchanged (`EXP-01`, `EXP-02`, `REL-01`). |
| `TST-56` | CSV round trip: quotes, commas, line breaks, Unicode and the byte-order mark survive; row count equals the result size including unloaded rows (`EXP-05`, `TBL-08`). |
| `TST-57` | Image copies are byte-identical (hash compare) and captions match the template and flattening rules (`EXP-06`). |
| `TST-58` | Stop mid-export leaves only complete files and a consistent manifest (`EXP-04`). |

---

# Appendix J — Expanded mode (after Core v1)

Covers D-95, D-96, D-97, D-98 (verbose branch), D-99 (other relation kinds), D-106, D-107. Nothing in this appendix is built until both gates pass. Each Expanded feature gets its own detailed appendix, written when work on it is about to start; the scope below is **frozen** so it cannot grow quietly.

## J.1 Framework

| ID | Rule |
|---|---|
| `XPD-01` | **Switch:** setting `ui.expandedTools` (scope A, default **off**). While off, no Expanded control, menu entry, column, filter or Settings page is shown. Turning it off hides Expanded features but never deletes their data. |
| `XPD-02` | **Core stability gate** (must pass before *any* Expanded feature is built): every Phase 7 gate passes; budgets B1–B14 pass; and the owner has used the app daily on the real library for **14 consecutive days** with no data-loss defect, no launch freeze and no blocker defect. A *blocker* is a defect that stops browsing, searching, indexing, reviewing or exporting, or loses user data. *(The 14-day length is a proposal; see assumption A2.)* |
| `XPD-03` | **OCR readiness gate** (before the comic-text features in J.3): measured from Review data by the **OCR quality report** (`XPD-04`) on at least 300 reviewed regions across at least 20 pages from at least 3 series: region detection precision ≥ 0.95 and recall ≥ 0.95 at IoU ≥ 0.5; character error rate ≤ 2%; and zero lost corrections in `TST-12`. *(Thresholds are starting proposals to be calibrated after the first baseline; assumption A2.)* |
| `XPD-04` | **OCR quality report** (the one item allowed before the gates, because it measures them): a Diagnostics section computing, from reviewed regions, *character error rate* = edit distance between `machine_text` and `manual_text` ÷ length of `manual_text` (case-sensitive, whitespace-trimmed), and *region precision/recall* where a region the user deleted is a false positive and a region the user drew is a miss, matched at IoU ≥ 0.5. It reads Review data only and never runs OCR. |
| `XPD-05` | **Assist runtime (D-107):** features that need a language or vision model (speaker tagging, region/page-type suggestions, cluster labels) use a separate, **off-by-default** runtime slot (`assist.*` settings: model path, device), never started automatically and never required. Its outputs are **suggestions** stored with provenance (model id, time) in a Suggestions queue under Needs Attention; accepting one writes the same fields a manual edit would, through the normal protected path (`REL-02`). Nothing is auto-applied. On the budget machine these features are expected to be too slow; they are intended for use with a dedicated GPU. |
| `XPD-06` | Expanded features MUST NOT change Core behaviour or budgets; each ships behind `ui.expandedTools` and has tests before it is enabled. |

## J.2 Reserved names (not created in v1)

`regions.kind`, `regions.speaker_id`, `items.page_kind`, `annotations`, `lab_queries`, `lab_judgments`, `clusters`, `cluster_members`, `suggestions`, `series_characters`. They are added by forward-only migrations when the relevant Expanded work begins (D.3).

## J.3 Frozen scope of each Expanded feature

**Comic text intelligence (after `XPD-03`)**
- **Region types:** dialogue, narration, SFX, title/credit, other, default "unclassified". Set in the Review panel (segmented control, `K` cycles). One rule-based suggestion only: short all-caps text, repeated letters or a trailing "!" proposes "Suggested: SFX (a guess)", applied only on click. `kind:` search filter. Text search covers all kinds by default; the reader's dialogue strip hides SFX unless toggled. Unclassified regions never enter Needs Attention.
- **Page types:** story, cover, credits, ad, blank, other; bulk **Set page type**; a "Looks blank (a guess)" suggestion for near-uniform pages; reader option **Skip non-story pages** (off); a job Summary toggle **Skip non-story pages** (on) that shows the count it skips.
- **Text utilities:** matched region highlighted in the viewer and inspector; **Copy line**, **Copy page text**, **Copy series script** (read-only copies).
- **Speaker tags:** a per-series character list; manual speaker per region; `speaker:` filter; assist suggestions (`XPD-05`) optional.

**Compare and study tools (Expanded)**
- **Compare modes** on the 1280 px previews: *Blink* (`Space` flips A/B), *Overlay slider* (`←/→` 1%, `Shift` 10%), *Difference* (absolute difference with a 1×–8× amplifier; equal dimensions or "fit to A" with letterboxing shown; render ≤ 300 ms).
- **Study tools** (view-only, never saved to the file): value (grayscale) view `G`; grid overlay (thirds, golden ratio, custom N × M); flip horizontal; transient loupe (hold `Z`; it is not a zoom level, so `VWR-04` still holds); eyedropper with hex copy and a 5-colour strip from the current preview.
- **Annotation layer:** box, arrow, text and pin in normalised coordinates of the original; toggle `N`; undoable; **Copy annotated image** produces a flattened copy; originals are never changed; stored in `annotations`.

**Verbose export branch (Expanded)**
Resize (original / 1024 / 768 / 512 long side) and format change (PNG / JPEG / WebP) with a **Keep metadata** option (default off when re-encoding); custom caption templates with tokens `{positive_prompt}`, `{negative_prompt}`, `{tags}`, `{ocr_text}`, `{model}`, `{seed}`, `{notes}`; optional trigger-word prefix; JSONL prompts table; contact sheet (PDF or PNG, 3–8 columns, optional filename/prompt snippet, A4/Letter/custom); comic panel dataset (PNG/JPEG/WebP crops, OCR captions, dialogue-only option, boxes in the manifest). Not included: auto-captioning with a model, training integrations, any upload.

**Relations (Expanded)**
Kinds *variant of* and *duplicate of*, image-to-image links, picker-based linking, and a References column/filter.

**Search Lab (Expanded)**
- *Judge results* mode in Search: `Y` relevant, `N` not relevant, `U` unsure, with auto-advance; judgments saved per query in `lab_queries` / `lab_judgments`.
- Compare configurations: current Smart weights, keyword/semantic/visual alone, or two embedding models when two vector sets exist.
- Metrics over **judged items only**: precision@10, recall@50, MRR, nDCG@10, always shown with "N judged" and judged coverage.
- **Apply as default** writes `search.hybridWeights`. The Lab never starts the model runtime on its own.

**Visual clusters (Expanded)**
- On-demand **Group by look** job over a library, folder or collection using **existing image vectors only** (mini-batch k-means with cosine similarity; the number of groups is chosen automatically between 8 and 60); requires ≥ 80% vector coverage, otherwise it warns; never starts the runtime.
- Labels are "Cluster 7 · 214 images · top terms: …" with terms taken from prompts or OCR text (no model); clusters can be renamed.
- **Clusters** is a third view beside Grid and Table; a cluster opens in the shared gallery with the breadcrumb `Library › Clusters › Cluster 7`; actions: tag all, add to selection.
- Clusters are snapshots tied to a vector set; when new items exist or the model changes a banner says "N new items — **Recompute**". Nothing recomputes on its own. Estimated cost for 12k vectors is a few seconds (to be measured in Phase 0).

## J.4 Suggested order and cut order

**Build order after the gates:** OCR quality report → comic region and page types → compare modes and study tools → verbose export → relations (other kinds) → annotations → Search Lab → visual clusters → speaker tags and other assist features.

**If time runs short, cut in this order:** visual clusters → Search Lab → annotations → speaker tags → contact sheet → relation kinds beyond *reference*. Core v1 items are never cut to make room for Expanded work.

## J.5 Settings introduced here

| Key | Type | Default | Scopes | Description |
|---|---|---|---|---|
| `ui.expandedTools` | bool | false | A | Show Expanded features |
| `assist.enabled` | bool | false | A | Allow the assist runtime to be started by an Expanded feature |
| `assist.model` | path | none | A | Model used by the assist runtime |
| `assist.device` | enum `auto`,`cpu`,`gpu:<id>` | `auto` | A | Device for the assist runtime |

(The three `assist.*` keys exist only when the first assist-based feature is built.)

## J.6 Tests

| ID | Test |
|---|---|
| `TST-59` | With `ui.expandedTools` off, no Expanded control, menu item, column, filter or Settings entry is present anywhere (`XPD-01`). |
| `TST-60` | The OCR quality report computes the documented metrics from a fixture of reviewed regions (including deleted and drawn regions) and runs no OCR (`XPD-04`). |
