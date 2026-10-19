# Phase 1 · Increment 4 — Appearance: tokenisation, density and text scale (D-16)

| | |
|---|---|
| **Date** | 2026-10-16 |
| **Phase** | 1 — Foundations and safety rails |
| **Increment** | 4 of N |
| **Requirement** | `design.md` D-16 — "Density (compact / comfortable / spacious) and text scale (80–200%)." · `NAV-08` — text scale replaces browser zoom |
| **Status** | Implemented · regression-tested · checks run |
| **Depends on** | Increment 3 (theme), which established the appearance-setting pattern |

## 1. Scope

Make **density** and **text scale** real, persisted preferences — not a partial
feature that only moves some controls.

The blocker recorded in increment 3 was that `App.css`/`workbench.css` contained
many hard-coded `font-size` and height values that bypass the `--fs-*` tokens;
a text-scale that reached only *some* type would be a fake feature. The increment
is therefore split in two:

- **4a — tokenise** the hard-coded typography and dimensions (pure refactor;
  identical appearance at the default values).
- **4b — the settings**: backend keys + validation, frontend application, and
  Settings controls.

## 2. What changed — 4a (tokenisation, appearance-preserving)

### 2.1 Typography scales from one multiplier (`frontend/src/styles/tokens.css`)
Added `--text-scale: 1` and rebuilt the type scale on it:

```css
--text-scale: 1;
--fs-2xs: calc(11px * var(--text-scale));   /* new token */
--fs-xs:  calc(12px * var(--text-scale));
--fs-sm:  calc(13px * var(--text-scale));
--fs-md:  calc(14px * var(--text-scale));
--fs-lg:  calc(18px * var(--text-scale));
--fs-xl:  calc(24px * var(--text-scale));
```

A multiplier rather than redefined px values, because the app uses px type — a
root `font-size` change would not reach absolute px sizes, but a multiplier the
tokens are built from reaches every one of them.

### 2.2 Density tokens
`--control-pad-y`, `--control-h`, `--row-pad-y`, `--row-pad-y-tight`, `--row-gap`.
Their `:root` values equal the literals they replace, so the default is
byte-identical; `[data-density='compact']` and `[data-density='spacious']`
override them. Density never touches `--fs-*`.

### 2.3 Consumers
- `App.css`: 24 × `font-size: 11px` → `var(--fs-2xs)`; `12px` → `--fs-xs`;
  `13px` → `--fs-sm`; `18px` → `--fs-lg`; the notice-bar dismiss glyph
  (`16px`) → `calc(16px * var(--text-scale))`. Controls (`button, select, input`),
  `.icon-btn`, `.segmented button`, `.table`, `.diag-table`, `.kv-row`,
  `.group-row` and the `.row`/`.toolbar` gaps moved onto the density tokens.
- `index.css`: `body { font-size: 14px }` → `var(--fs-md)`.
- `workbench.css`: the one fixed `line-height: 18px` →
  `calc(18px * var(--text-scale))`. Its type was already tokenised.

Result: `grep -E 'font-size:\s*[0-9]'` over `frontend/src/**/*.css` returns no
matches.

## 3. What changed — 4b (the settings)

### 3.1 Backend (`backend/worker.py`)
`_APP_SETTING_RULES` gains:

```python
"density": {"type": str, "choices": ("compact", "comfortable", "spacious"),
            "default": "comfortable"},
"text_scale": {"type": int, "min": 80, "max": 200, "step": 10, "default": 100},
```

`_validate_app_setting` gains an `int` branch: it rejects `bool` (an `int`
subclass, so JSON `true` must not read as `1`), floats and strings, and enforces
min/max/step. The bounds exist for the same reason the string choices do — a
value the UI cannot render is a bug, not a preference.

### 3.2 Frontend
- `types.ts`: `Density`; `AppSettings.density` / `AppSettings.text_scale`;
  `DENSITY_OPTIONS`; `TEXT_SCALE_VALUES` (the 80…200 step-10 grid, one source
  shared with the backend bounds by value).
- `providers.tsx`: applies `document.documentElement.dataset.density` and sets
  `--text-scale` to `text_scale / 100`.
- `SettingsScreen.tsx`: a Density `SegmentedControl` and a Text scale `<select>`;
  both added to the section's scoped reset.

## 4. Tests added

- `tests/unit/test_app_settings_contract.py` (+26): defaults (not explicit);
  every legal density and text-scale value accepted; invalid values rejected
  (`Compact`, `comfy`, `''`, `1`, `True`, `None` for density; `79`, `201`, `105`,
  `0`, `-10`, `100.0`, `"100"`, `True`, `None` for text scale); both values
  survive a restart.
- `frontend/src/test/appSettings.test.tsx` (+4): stored density/scale applied to
  the root; defaults when nothing stored; `updateAppSetting` persists and
  re-applies each.
- Fixtures (`workbenchFixtures.ts`, test `DEFAULTS`) updated for the two required
  keys.

## 5. Verification (commands actually run)

| Check | Command | Result |
|---|---|---|
| Backend settings + guards | `pytest tests/unit/test_app_settings_contract.py tests/test_worker_protocol.py tests/test_doc_drift.py tests/test_rpc_contract_drift.py -q -p no:randomly` | **84 passed** |
| Frontend tests | `npm run test` | **7 files, 140 passed** |
| Frontend build | `npm run build` (tsc -b + vite build) | PASS (1954 modules) |
| Frontend lint | `npm run lint` | exit 0 (only pre-existing warnings) |
| Hard-coded sweep | `grep 'font-size:\s*[0-9]' frontend/src/**/*.css` | no matches |
| Visual | served `tokens.css`+`index.css`+`App.css` and rendered 3 themes × {compact, comfortable, spacious} × {100%, 150%}; captured a screenshot | every frame legible; compact visibly shorter controls/rows, spacious taller, 150% clearly larger type |

Rust is unchanged in this increment, so `cargo check` was not re-run.

## 6. Design conformance

- D-16 density: three levels, changing control height, row height and item gaps —
  **not** font size. ✅
- D-16 text scale: 80–200%, step 10. ✅
- `NAV-08`: the setting now exists to replace browser zoom (the packaged app still
  disables zoom; wiring the setting to that is unchanged behaviour).

## 7. Limitations and deferred work (explicit)

- **Density coverage is the control/row layer, not every padding.** The tokens
  are applied to buttons, inputs, selects, the segmented control, icon buttons,
  tables and the common list rows; bespoke per-view paddings (e.g. some
  workbench panel insets) do not scale. This is a deliberate, documented boundary
  rather than an unnoticed one.
- **First-paint gap still present.** Applying the settings from the async catalog
  read means one default frame before they land — addressed separately in
  increment 5.
- **No packaged-exe visual QA.** Verified by build/lint/unit tests and a served
  preview; per-screen QA on the shipped exe is outstanding.

## 8. Repo integrity

- `panel_folder_cropper_v11.py` untouched
  (`6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A`).
- Pre-existing user changes preserved; this increment is additive.
- No commit/push.
