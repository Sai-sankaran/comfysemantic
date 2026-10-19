# Phase 1 · Increment 5 — First-paint appearance sync (D-14, D-16)

| | |
|---|---|
| **Date** | 2026-10-16 |
| **Phase** | 1 — Foundations and safety rails |
| **Increment** | 5 of N |
| **Requirement** | `design.md` D-14 / D-16 applied *before* first paint; the gap documented as a limitation in increments 3–4 |
| **Status** | Implemented · regression-tested · checks run |
| **Depends on** | Increments 3 (theme) and 4 (density, text scale) |

## 1. Scope

Close the "brief dark first paint" gap: a light, high-contrast, or scaled-up user
should not see a dark, default-size frame while `getAppSettings()` is still in
flight.

## 2. Why the obvious approaches were rejected

- **Inline `<script>` in `index.html`.** Blocked: `src-tauri/tauri.conf.json` sets
  `csp: "… script-src 'self' …"` with no `'unsafe-inline'`. An inline script would
  not run in the packaged app.
- **Apply only from `LibraryProvider`.** That is exactly the current (delayed)
  behaviour — the provider cannot run before its settings read resolves.
- **Make the cache the source of truth.** Rejected: the catalog
  (`app_settings`, schema v15) owns these values; the audit and design both treat
  it as canonical. A second owner would drift.

## 3. What changed

### 3.1 New module `frontend/src/app/appearance.ts`
- `applyAppearance(part)` — validated write of `data-theme` / `data-density` /
  `--text-scale` on the root element. Absent or illegal fields are left as they
  are, so a partial cache hit never clears the rest.
- `cacheAppearance(a)` — writes the JSON cache (`comfypanel.appearance`),
  swallowing storage errors (it is an optimisation, not the owner).
- `readCachedAppearance()` — reads and *re-validates* against the same
  allowlists (`THEME_OPTIONS`, `DENSITY_OPTIONS`, `TEXT_SCALE_VALUES`). A corrupt
  or hand-edited entry yields `{}` rather than throwing or being trusted.

### 3.2 `frontend/src/main.tsx`
`applyAppearance(readCachedAppearance())` runs **before**
`createRoot(...).render(...)`. With CSP forbidding inline script, the module
bundle is the only pre-paint hook.

### 3.3 `frontend/src/app/providers.tsx`
One effect: once the canonical settings load, `applyAppearance(...)` them and
`cacheAppearance(...)` the same values. While loading — or after a failed read —
it applies **nothing**, so the cache (the last *canonical* value) is not clobbered
by the defaults. With no cache the `:root` defaults (dark / comfortable / 100%)
apply anyway.

## 4. Tests added

- `frontend/src/test/appearance.test.ts` (new): `applyAppearance` writes all three
  values; leaves illegal/absent fields untouched; `readCachedAppearance` returns
  `{}` when empty and for corrupt JSON, and drops illegal fields while keeping
  legal ones; `cacheAppearance` → `readCachedAppearance` round-trips.
- `frontend/src/test/appSettings.test.tsx` (+1): the provider mirrors the
  canonical appearance into localStorage for the next first paint.

## 5. Verification (commands actually run)

| Check | Command | Result |
|---|---|---|
| Frontend tests | `npm run test` | **7 files, 140 passed** |
| Frontend build | `npm run build` | PASS (1954 modules) |
| Frontend lint | `npm run lint` | exit 0 (only pre-existing warnings) |
| End-to-end (real browser, served `dist/`) | planted cache → reload → read root | `data-theme=light`, `data-density=spacious`, `--text-scale=1.5` — **while the RPC read failed**, proving the provider does not clobber the cache |
| Default path | no cache → reload → read root | attributes unset → `:root` defaults (dark / comfortable / 100%) |
| Real computed type | `getComputedStyle(body).fontSize` | `14px` at 100%, **`21px` at 150%** (14 × 1.5) |

The end-to-end run served the production `dist/` over plain HTTP (the same
approach used for the increment-3 palette screenshots).

## 6. Design conformance

- D-14 / D-16 preferences are now applied before React's first render when a
  cache exists. ✅
- The catalog remains the single source of truth; the cache is a validated,
  write-through mirror. ✅

## 7. Limitations and deferred work (explicit)

- **First-ever launch of a light-theme user still shows one dark frame.** There is
  no cache to read until a settings load has succeeded once. This is inherent to
  an async canonical store; the roadmap's synchronous settings file (Phase 1
  item 10) is the eventual answer, and this increment is the compatible
  intermediate step.
- **The cache is per-origin localStorage, not the design's "small file".** In the
  webview, localStorage is the CSP-safe synchronous store; a file-based store
  arrives with the settings registry increment.
- **No packaged-exe visual QA.** Verified via unit tests plus a served-build
  browser check; per-screen QA on the shipped exe is outstanding.

## 8. Repo integrity

- `panel_folder_cropper_v11.py` untouched
  (`6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A`).
- Pre-existing user changes preserved; this increment is additive.
- No commit/push.
