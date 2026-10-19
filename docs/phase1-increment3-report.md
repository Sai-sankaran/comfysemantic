# Phase 1 · Increment 3 — Appearance: theme (D-14)

| | |
|---|---|
| **Date** | 2026-10-16 |
| **Phase** | 1 — Foundations and safety rails |
| **Increment** | 3 of N |
| **Requirement** | `design.md` D-14 — "Themes: dark (default), light, high-contrast." |
| **Status** | Implemented · regression-tested · checks run |
| **Depends on** | Increments 1–2 (this session) |

## 1. Scope

Add a real, persisted **theme** setting and the **light** and **high-contrast**
palettes, replacing the single hard-coded dark palette in
`frontend/src/styles/tokens.css`. Density (`compact`/`comfortable`/`spacious`)
and text scale (80–200%) are **deliberately deferred** — see §6.

## 2. What changed

### 2.1 Backend — the setting (`backend/worker.py`)
`BackendWorker._APP_SETTING_RULES` gains a `theme` key:

```python
"theme": {
    "type": str,
    "choices": ("dark", "light", "high-contrast"),
    "default": "dark",
},
```

The existing store (`app_settings`, schema v15) already supports string choices
with validation, persistence, restart survival, and `reset`, so the theme reuses
one canonical owner rather than inventing a second one. An invalid value is
rejected loudly at write time and degrades to the default at read time — the same
contract the other keys already have.

### 2.2 Frontend — types and plumbing
- `frontend/src/types.ts`: new `Theme = 'dark' | 'light' | 'high-contrast'`;
  `AppSettings.theme`; `THEME_OPTIONS`.
- `frontend/src/app/providers.tsx`: a `theme` value derived from `appSettings`
  (like `thumbFit`) and an effect that sets
  `document.documentElement.dataset.theme`. The `setThumbFit` fallback object
  gained `theme: 'dark'`.

### 2.3 Frontend — the palettes (`frontend/src/styles/tokens.css`)
- `:root` gains `color-scheme: dark` and a `--border-hover` token.
- `:root[data-theme='light']` and `:root[data-theme='high-contrast']` override the
  **palette tokens only** (backgrounds, borders, text, status, interaction,
  shadows). Every rule elsewhere reads tokens, so no component changes are
  needed.
- `frontend/src/App.css`: the one stray hard-coded colour (`border-color:
  #5a5a62`) now uses `var(--border-hover)`, so button hover borders recolour too.
  Dark's `--border-hover` is the exact previous value, so dark is unchanged.

### 2.4 Frontend — the control (`frontend/src/features/settings/SettingsScreen.tsx`)
A "Theme" row using the existing `SegmentedControl` (Dark / Light / High
contrast), writing through `updateAppSetting('theme', …)`. The section's scoped
"Reset these to defaults" now includes `'theme'`.

## 3. Tests added

- `tests/unit/test_app_settings_contract.py`: default is `dark` (and not
  explicit); each of the three values is accepted and marked explicit; a
  parametrised set of invalid values (`Dark`, `high_contrast`, `high contrast`,
  `''`, `solarized`, `1`, `True`, `None`) is rejected with
  `invalid value for 'theme'`; the value survives a restart.
- `frontend/src/test/appSettings.test.tsx`: the root element receives the stored
  theme; it defaults to `dark` when nothing is stored; `updateAppSetting('theme',
  'light')` persists the key and re-applies it. Fixtures
  (`workbenchFixtures.ts`, the test `DEFAULTS`) updated for the new required key.

## 4. Verification (commands actually run)

| Check | Command | Result |
|---|---|---|
| Backend settings + guards | `pytest tests/unit/test_app_settings_contract.py tests/test_worker_protocol.py tests/test_doc_drift.py tests/test_rpc_contract_drift.py -q -p no:randomly` | **58 passed** |
| Frontend tests | `npm run test` | **6 files, 129 passed** (+3 theme tests) |
| Frontend build | `npm run build` (tsc -b + vite build) | PASS (1953 modules) |
| Frontend lint | `npm run lint` | exit 0 (only pre-existing `dist-harness/` warnings) |
| Visual | rendered all three palettes side by side and captured a screenshot | dark/light/high-contrast all legible; muted/faint text and status chips readable in each |

Rust is unchanged in this increment, so `cargo check` was not re-run.

## 5. Design conformance

- D-14: three themes, dark default. ✅
- `NAV-08` (browser zoom disabled; text scale replaces it): **not** addressed —
  text scale is deferred.
- The theme is a token-layer change; "no screen defines its own palette"
  (tokens.css header) is preserved.

## 6. Limitations and deferred work (explicit)

- **No first-paint sync.** The design (`VIS-…`/settings registry, roadmap Phase 1
  item 10) wants preferences in a small file read synchronously before first
  paint. Today the theme lives in the catalog and is applied after
  `getAppSettings()` resolves, so a light/high-contrast user sees a brief dark
  first paint on launch. This is a real, documented gap, not a hidden one.
- **Density and text scale are not implemented.** A faithful implementation
  requires first migrating the many hard-coded `font-size`/height values in
  `App.css` and `workbench.css` to tokens; doing it halfway would be a fake
  feature. Tracked as increment 4+.
- **No packaged-exe visual QA.** Verified via build/lint/unit tests and a
  rendered palette preview; per-screen visual QA on the shipped exe is still
  outstanding.

## 7. Repo integrity

- `panel_folder_cropper_v11.py` untouched.
- Pre-existing user changes preserved; this increment is additive.
- No commit/push.
