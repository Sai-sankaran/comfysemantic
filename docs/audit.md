# Audit — every `VERIFY` item and what was found

`design.md` §21.2 says: *"Phase 0 must resolve and record every item in
`docs/audit.md`"*, and §21.2's closing rule:

> These are implementation facts, not a request for the owner to re-answer the
> planning questionnaire. Repository evidence should resolve them. If a fact
> cannot be verified, document the uncertainty and keep the affected feature
> behind a clear unavailable/blocked state; do not represent it as complete.

**Status vocabulary** — Resolved · Partially resolved · **Unresolved** (no
repository evidence yet) · Blocked on an owner decision.

Nothing below is asserted as verified unless a file, test or measurement supports
it. Where the answer is unknown, the affected feature is listed as blocked
rather than built and quietly wrong.

---

## Summary

| # | `VERIFY` item | Status |
|---|---|---|
| 1 | Data location and portable mode | Partially resolved |
| 2 | Existing catalog schema | Partially resolved |
| 3 | Cropper output contract | **Unresolved — blocks Comic Decompose** |
| 4 | Legacy feature inventory | Partially resolved |
| 5 | OCR engine | **Unresolved** |
| 6 | Vector backend | **Unresolved — blocks the ANN/exact decision** |
| 7 | Legacy search fields ("Batch candidates") | **Unresolved** |
| 8 | Synthetic fixture label | Resolved |
| 9 | Pipeline stage map | **Unresolved** |
| 10 | Startup freeze | **Unresolved — blocks Phase 1b** |
| 11 | Web/executable mismatch | Partially resolved |
| 12 | Image serving and cache | **Unresolved** |
| 13 | User-corrected OCR and panel data | **Unresolved** |
| 14 | Current settings coverage | Partially resolved |

Assumptions from §21.1 and Appendix D.5 are recorded at the end, including the
two new `VERIFY` items D.5 added (A1, A5, A6).

---

## 1. Data location and portable mode

**Where the application writes.** `src-tauri` resolves its data directory with
`COMFYPANEL_PORTABLE_DIR` taking precedence, and the worker is launched with the
same variable set. Evidence: `src-tauri/src/*.rs` (`std::env::var("COMFYPANEL_PORTABLE_DIR")`).

**Why the code says so.** A comment beside the lookup records the concern
directly: inheriting an *ambient* `COMFYPANEL_PORTABLE_DIR` would silently ignore
the application's own portable location.

**Unresolved.** Whether the **shipped** portable ZIP is genuinely self-contained
has not been tested. The code path exists; the artefact has not been verified, and
verification requires building and running the exe (O-6).

**Affected.** `SET-*` `storage.dataDir`, the Settings storage category, and the
onboarding migration path. Both are built behind a stated limitation.

## 2. Existing catalog schema

**Resolved in part.** `DATABASE_SCHEMA.md` and the code agree at **v15**, and
`tests/test_doc_drift.py` fails if they ever diverge again. Earlier drift (the
documents claiming v10 and v12) was corrected in Phase 1 and is recorded as R-7.

**Unresolved.** The full field-by-field mapping required by this item — every old
column mapped to §5, a migration export, or an item requiring owner approval —
is not written down. It is a Phase 1b deliverable and is blocked on O-1 (which
databases exist) and O-2 (how migration is performed).

**Affected.** Phase 1b in full. No migration code has been written.

## 3. Cropper output contract — **blocks Comic Decompose**

**Unresolved, and deliberately so.** The spec requires proof of whether the
protected script returns page-pixel boxes, crops only, or both, and forbids
similarity-based matching as the primary mapping mechanism.

Repository evidence: the cropper emits a **`panels.csv`** (observed as a test
artefact under `pytest-of-sai/…/test_round_trips_a_real_csv0/out/panels.csv`),
while `design.md` `CMC-02` describes a JSON manifest
`{page_path, boxes, script_version}`. The shapes are not the same.

**Consequence, applied.** `panel_folder_cropper_v11.py` is untouched and must
remain byte-identical
(SHA-256 `6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A`). A
**new** cropper version emitting the documented manifest has not been written.
Decompose is therefore **not** released, and the panel workflow in the UI is
built only far enough to be honest about it.

**Owner decision:** O-4 — accept `panels.csv` as the deterministic manifest, or
commission a new cropper version. This blocks the Comic/Manhwa Decompose gate.

## 4. Legacy feature inventory

**Partially resolved.** The pre-existing screens were inventoried and mapped:
Batch Recovery became Review → Failed items, Panel Studio became Pipeline →
Tools, and the legacy Options menu became the View menu carrying every item.
`docs/ui-inventory.md` records the mapping screen by screen, and the Design
decision `D-31` (no working old capability is silently dropped) was applied
explicitly rather than by omission.

**Unresolved.** Item 4 asks for a run of the current app with every command,
field and workflow recorded. That requires the exe (see item 10), so the mapping
is from source rather than from the running application.

**Affected.** The Phase 0 gate cannot be signed off.

## 5. OCR engine

**Unresolved.** The spec requires the engine's name, version, language files,
whether it emits boxes *and confidence values*, its lifecycle, and whether it
shares the model runtime.

This is load-bearing in a specific way. `design.md` §21.1 assumption 3 says that
**if confidence is absent, confidence scores must not be fabricated** — a visible
alternate review rule must be defined instead, and the spec changed. No evidence
about confidence semantics has been recorded, so no confidence UI has been built:
the Review workbench shows text regions and status, not a confidence number.

**Affected.** `OCR-*`, `COL-17` ("Needs OCR" aggregate status), the OCR quality
report, and the OCR readiness gate for Phase X.

## 6. Vector backend — **blocks the ANN/exact decision**

**Unresolved.** §21.2 requires measuring the existing vector store against budget
**B7** and checking the config/version invalidation rules before deciding whether
to keep the exact Python scan or implement the memory-mapped design.

No measurement has been taken, and **B7 cannot be measured** because no budget
harness exists (see Phase 7 in `docs/progress.md`).

**Consequence, applied.** No ANN was added, per §14.5. Semantic search is
presented as unavailable with `STA-08` rather than as working.

**Owner decision:** O-7 — pending B7.

## 7. Legacy search fields — "Batch candidates"

**Unresolved.** `VERIFY` #7 asks what "Batch candidates" searches and what
"Status: read" and "OCR ok ✓" mean. The `batch_recovery` implementation exists in
the repository, but its query semantics have not been traced and documented.

**Affected.** `SRC-04`. This is the same question as owner decision O-5, and it is
recorded there rather than duplicated.

## 8. Synthetic fixture label — **resolved**

**Resolved.** The label existed in the legacy harness and is synthetic-fixture
instrumentation, not a production library count. It has been moved out of the
production path: the new Explore source labels fixture data explicitly in the
toolbar ("Fixture data — these items are generated, not from a library") and sets
`isFixtureData` on the source interface so a fixture can never be mistaken for a
real library's contents.

## 9. Pipeline stage map

**Unresolved.** `VERIFY` #9 requires running the old Indexing Center and
recording every stage, dependency, force/rerun rule, resource profile and
failure-recovery operation, and confirming the Appendix C mappings against the
**actual worker** rather than screenshots.

The existing indexing screen was mapped to its code, but that is a source reading,
not a run. Appendix C has not been confirmed against the worker.

**Affected.** `PIP-*`, `H.2` re-run preset stage sets, `QFL-03` ("applicable
stages"), and the `COL-17` aggregate OCR status — all of which depend on knowing
the real stage list.

## 10. Startup freeze — **blocks Phase 1b**

**Unresolved, and the spec is explicit about how not to resolve it.** §0.7 and
`VERIFY` #10 forbid declaring the freeze fixed because the app launched once.

No timestamped startup trace from process start to shell paint, first IPC, first
item response and first visible thumbnail exists. Producing one needs a packaged
executable; the plain browser build cannot reproduce the freeze.

**Consequence, applied.** Phase 1b is recorded as not started, and its gate
(budgets B1/B2/B3/B11) is recorded as not measured. Nothing claims the freeze is
fixed.

## 11. Web/executable mismatch

**Partially resolved.** One concrete instance was found, measured and fixed during
Phase 1: the top bar could not shrink below its content width, so the page body
scrolled horizontally — a `NAV-06`/`TST-17` violation (R-9). Fixed with a
shrinkable search and breadcrumb plus icon-only labels below 900 px, and verified
by measurement rather than inspection.

**Unresolved.** The full comparison the item asks for — frontend commit/build
hash, zoom, viewport, Windows scaling, `devicePixelRatio`, theme, density, text
scale, native branches, origin-specific state and backend state — needs the exe.

## 12. Image serving and cache

**Unresolved.** `VERIFY` #12 requires inspecting the image-loading path, cache
headers, invalidation/fingerprints, and whether preview generation can block the
UI thread, **before replacing working code**.

No inspection is recorded. Accordingly no image pipeline was replaced: the
gallery uses the protocol the application already serves, and `VWR-03`'s
loading order is not implemented.

## 13. User-corrected OCR and panel data

**Unresolved.** The item requires tests proving manual corrections and corrected
panel boxes survive reprocessing, interruption, restart and migration.

`REL-02` protects this data and the design states it is never written by any
stage. No test yet proves it, because the reprocessing path that would corrupt it
does not exist in the new pipeline.

**Affected.** The migration rehearsal (Phase 1b) must not run before this is
covered, or a rehearsal could destroy the only copy of the user's corrections.

## 14. Current settings coverage

**Partially resolved.** Every `design.md` §12.2 setting is now present in the
frontend registry (`src/settings/registry.ts`, 88 entries), and a test asserts
every registry key renders as a real row in the screen.

**Unresolved, and this is the honest limit.** Only `appearance.theme`,
`appearance.density` and `appearance.textScale` are **persisted** — they map onto
the existing `app_settings` keys. Every other setting is held for the session and
the screen says so in words rather than implying a save. `SET-09` forbids
`localStorage`, so no second source of truth was invented.

**Affected.** `SET-02` library/folder scopes are blocked on O-1/O-2.

---

## Assumptions from §21.1

| # | Assumption | State |
|---|---|---|
| 1 | Budget machine has 8–16 GB RAM | **Unmeasured**; no budget harness. Cache and concurrency defaults must be adjusted after measurement before budgets are approved. |
| 2 | Windows 11 + WebView2 on the target environment | **Unverified**; needs the exe. |
| 3 | OCR engine provides boxes **and confidence** | **Unverified** — see item 5. Confidence UI deliberately not built. |
| 4 | Audio/video embedding stages remain useful | **Unverified** (O-10). The stages exist in the worker; whether they are useful is not established. |
| 5 | Dates/numbers use system locale, UI copy is English | Followed. `toLocaleString()` is used for every count and size, and all UI copy is English. |
| 6 | Long-strip ratios and the near-duplicate threshold are tuning defaults | Followed: they ship in the registry as adjustable detection settings with the documented defaults, and no slice is ever created where no boundary is detected. |

## New `VERIFY` items added by Appendix D.5

| # | Item | State |
|---|---|---|
| A1 | Alt-based shortcuts work in the exe WebView2 without side effects | **Unverified, and now load-bearing.** `Alt+1`/`Alt+2` **are** registered (`view.gridMode` / `view.tableMode`, increment 16) because Table view needed them. If A1 resolves against Alt they are re-bound to `Ctrl+Shift+1`/`Ctrl+Shift+2`. `Alt+P`/`Alt+X`/`Alt+U` (flags) and `Alt+↑` (parent page) are still unbuilt and stay deferred. The fallback set is `Ctrl+Shift+1`/`Ctrl+Shift+2`/`Ctrl+Shift+K`/`Ctrl+Shift+X`/`Ctrl+Shift+U` — a **replacement**, not an addition. See the Appendix A drift section above. |
| A2 | The 14-day stability window and OCR gate thresholds are proposals | Accepted as proposals. No gate has been measured. |
| A3 | Hidden items are still processed by jobs | Not applicable yet — hidden state (`FLG-*`) is not built. |
| A4 | Panels inherit rating/favourite/flag/hidden from the parent page | Not applicable yet — flags are not built. |
| A5 | Thumbnail generation and metadata reading can run without the Python worker | **Unverified.** Affects `RRN-04` (whether a re-run starts the worker). |
| A6 | ComfyUI PNGs carry both `workflow` and `prompt` chunks and both are stored | **Unverified.** Affects which **Copy as** entries exist (`CPY-*`): if only one is stored the other must be disabled with a reason, which is why **Copy as is not built yet**. |

## Defect found in existing code: `appearance.ts` violates `ARC-13`

Found while building privacy blur (increment 18), which had to answer "where does
the launch-time privacy state come from?" and could not copy the existing answer.

**The rule.** `ARC-13`: *"UI state that must persist (sidebar collapsed, panel
widths, last view) is stored through the settings store or the snapshot file,
**never `localStorage`**, so the web and exe builds behave identically."*
`SET-09` repeats it: *"`localStorage` is never used."*

**What the code does.** `frontend/src/app/appearance.ts` writes
`comfypanel.appearance` to `localStorage` and reads it back at startup
(`cacheAppearance`, `readCachedAppearance`) so the theme can be applied before the
first paint.

**Why it matters.** The reason `ARC-13` gives is the failure mode, not the rule:
`localStorage` is per-origin and per-WebView-profile, so the exe and a browser
build opened on the same data directory can disagree about the theme, and clearing
site data silently resets appearance. That is exactly the class of bug the
shipped-versus-web divergence of `VERIFY` #11 is about.

**Status: resolved (ruling 2).** Privacy blur deliberately did *not* copy the
pattern — `app/privacy.tsx` kept the launch-time copy in a module variable written
by `cachePrivacy`. The real fix was the small synchronous shell file of `PRF-20`,
read by the platform adapter at launch step 2, and it has now landed.

- `appearance.ts` reads/writes the shell-state file via `readShellState` /
  `writeShellState`. `localStorage` appears **once**, to migrate a value written by
  an older build: the legacy key is read, copied into the shell-state file, and
  deleted. After the first run the key is empty and that branch never fires again.
- `main.tsx` awaits `loadShellState()` and `loadPrivacyCache()` before the first
  render, so the cached appearance is already applied when React mounts.
- A failed or corrupt read **clears** the cache rather than keeping stale values,
  so an empty shell-state file shows defaults instead of a previous theme.
- `PRV-04`'s privacy launch cache is populated from the same file.
- A lint rule banning new `localStorage` use is enforced by
  `src/test/noLocalStorage.test.ts`, which fails on any `getItem`/`setItem` /
  `removeItem` access outside the two sanctioned migrations.

**Verified.** 723/723 tests pass (29 files); `tsc -b` and `vite build` clean; lint
0 errors.

---

## Defect found in the specification itself: Appendix A is a revision behind

Found by `tests/test_action_registry_drift.py` while increment 16 registered the
Appendix E.9 shortcut actions.

**What the guard reported.** Seven shortcuts the code declared that Appendix A
does not define: `alt+1`, `alt+2`, `alt+p`, `alt+x`, `alt+u`, `mod+shift+b`,
`mod+shift+h`.

**What is actually true.** Appendix E.9's heading reads *"Shortcuts introduced
here (added to Appendix A)"*, but Appendix A has not been regenerated to list
them. The design contradicts itself, and the guard was right about the symptom
while the specification is the cause.

**Resolution.** The guard's parser now reads Appendix E.9's **table** as part of
the normative map. Only the table: the `VERIFY` paragraph after it lists
fallbacks that *replace* the Alt keys depending on how A1 resolves, and parsing
it would assert both bindings exist at once, which the design explicitly denies.

`design.md` was **not** edited. It is the authority, and an owner decision is the
right way to close a self-contradiction in it rather than a code change.

**Consequence for `A1` below.** Because the fallback replaces the Alt key rather
than accompanying it, `view.gridMode` and `view.tableMode` bind `alt+1` / `alt+2`
alone today. The switch to `Ctrl+Shift+1` / `Ctrl+Shift+2` is a one-line change
once A1 resolves, after which Appendix A is regenerated from the registry.

---

## Defects found by running the UI (not by reading it)

These are not `VERIFY` items — they are implementation defects found while running
the application, recorded here because each one changes what "it renders" means.

### 1. JSX children swallowed source comments and rendered them as text

**Found.** Booting the real application showed this paragraph above the content
area:

```
// `NAV-04`/`NAV-05`/`NAV-07`: the shell owns the tree, the inspector and the
// selection count, so a screen below can read and report them without
// threading the state through `App`.
```

A bare `//` line inside JSX **children** is not a comment. JSX children are text,
so it rendered literally. The same mistake was in `App.tsx` above the root
provider, where it painted above the entire application.

**Fix.** `AppShell.tsx` wraps it in braces (valid in a children position).
`App.tsx` had to move the comment *above* the `return`, because
`return ({/* */} <X/>)` is two adjacent expressions with no operator between them
and does not parse. A third attempt — keeping it in place and wrapping it — is the
trap worth recording: a block comment whose body contains `*/` closes early, and
the remainder becomes code.

**Status.** Resolved. Typechecked, and the absence of leaked text is now checked at
runtime rather than by eye.

### 2. Infinite recursion in the platform adapter

**Found.** Routing `api.ts` through a new transport module made
`adjacentImage.test.ts` fail with `Maximum call stack size exceeded`. The exported
`invoke` re-enters `transportCall` for an `rpc_call` command, and `transportCall`
called the exported `invoke` rather than Tauri's. The two look interchangeable in
the same file and are not.

**Status.** Resolved, with the reason recorded at the call site, since the two
names differing only by an import alias is exactly what invites it back.

### 3. Gallery thumbnails appear broken in an unfocused pane

**Symptom.** Every thumbnail reported `naturalWidth === 0` and `complete === false`,
which looks like a broken placeholder.

**Resolution — not a defect.** The page's `document.visibilityState` is `"hidden"`,
and Chromium defers `loading="lazy"` images in a hidden document. Setting
`loading="eager"` on three cells loaded them immediately, and a fresh `Image()` on
the identical data URI decoded at its full 320 × 880. The fixture and the
`<img>` are correct; the harness pane was hiding them.

**Consequence for measurement.** Any budget that reads decode time or paint cost
(B5, B6, B8, B9) must run in a **visible** page, or it will measure Chromium's
lazy-loading deferral instead of the application. `npm run shots` uses a real
headless browser and is unaffected.

### 4. Duplicate gallery cells on overlapping pages

**Found.** React logged `Encountered two children with the same key` for a
contiguous run of item ids — a whole page rendered twice.

**Cause — narrowed, not closed.** The `requestSeq` guard drops a response older
than the newest *request*, so two concurrent requests for the *same* cursor cannot
both apply; that path was tested and does not duplicate. The reachable path is two
*different* cursors whose pages **overlap**, which `GAL-02`'s keyset contract
permits: an item inserted or re-flagged between requests moves the boundary, and a
retried request re-serves the page it already returned. `[...prev, ...page.items]`
rendered the overlap twice.

**Fix.** The append is now idempotent — already-present ids are dropped — which
enforces the no-overlap property where it belongs rather than assuming the source
honours it.

**Evidence.** The regression test was verified to **fail on the unfixed code**
(420 cells, 400 unique) and pass with the fix (400 and 400). An earlier version of
that test passed either way and was discarded: a test that cannot fail proves
nothing, and a plausible-sounding comment about "the bug it fixes" is worse than
none.

**Status.** Resolved for overlapping pages. The original duplicate-key log was
observed once during hot-reload; its exact trigger was not reproduced and is not
claimed to be fixed.

---

## What this means for the order of work

Three unresolved items gate real features, and each is recorded rather than
worked around:

| Blocker | Gates |
|---|---|
| `VERIFY` 3 (cropper contract) | Comic Decompose, panel editor, `CMC-02` manifest |
| `VERIFY` 5 (OCR confidence) | Any confidence UI, the OCR quality report, the Phase X OCR gate |
| `VERIFY` 10 (startup freeze) + budgets | Phase 1b in full, and therefore everything downstream of it |

The frontend UI work is unaffected by these: it is built against typed
interfaces and deterministic fixtures, so the screens can be completed while the
backend questions stay open. That separation is deliberate, and it is why the
Explore source is an interface (`ExploreSource`) rather than a direct API call.