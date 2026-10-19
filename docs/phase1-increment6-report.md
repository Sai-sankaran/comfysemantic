# Phase 1 · Increment 6 — Shared controls and the component gallery (CTL-01/02/06)

| | |
|---|---|
| **Date** | 2026-10-16 |
| **Phase** | 1 — Foundations and safety rails |
| **Increment** | 6 of N |
| **Requirement** | `design.md` `CTL-01` (one component library), `CTL-02` (no native `<select>` / browser-default checkboxes), `CTL-06` (component gallery at Settings → Diagnostics → Component gallery, rendering every component in every state/theme/density/text scale), `VIS-06` (3 px checkbox radius), `VIS-12` (focus), roadmap Phase 1 item 2 |
| **Status** | Implemented · regression-tested · checks run |
| **Depends on** | Increment 4 (density/text scale) — the gallery shows their matrices |

## 1. Scope

Roadmap Phase 1 item 2 ("Build shared controls **and** the component gallery").
The acceptance gate names the gallery explicitly: *"Every shared control is
represented in the component gallery across themes, densities, focus, disabled,
loading and error states."* So this increment does the plumbing that makes the
library actually shared (no hand-rolled controls), makes the controls
theme/density-aware, and builds the gallery that proves it.

## 2. What changed

### 2.1 One checkbox control (`CTL-01`, `CTL-02`, `VIS-06`, `VIS-12`)
`frontend/src/components/ui/Checkbox.tsx` was rewritten:

- The element is still a real `<input type="checkbox">`, for native keyboard and
  label semantics, but it is now **drawn** — `appearance: none` plus a
  token-coloured tick (`App.css`) — so it is not the browser default (`CTL-02`).
- New props: `ariaLabel` (a table-row checkbox with no visible label),
  `className` (composite rows pass their own wrapper), `title`, `children`
  (composite content — a stage row with a pill and a nested button), and
  `indeterminate` (a display-only dash for a partial selection).
- Its inline raw-px styles were removed; the wrapper is a `.checkbox` class.
- `VIS-06`'s 3 px checkbox corner is a new `--radius-checkbox` token.

Every hand-rolled checkbox is gone — all six sites now use `<Checkbox>`:
`SearchScreen` source chips, `IndexingScreen` "Skip completed" and the stage
rows, and `BatchRecoveryScreen` "Select all", the table header (now with a real
`indeterminate` state for a partial selection) and the per-row selectors.
`grep 'type="checkbox"' frontend/src/**/*.tsx` now matches only the shared
component.

### 2.2 The component gallery (`CTL-06`)
- New `frontend/src/features/gallery/ComponentGallery.tsx`: every control family
  in every state — button variants + disabled, icon buttons, inputs
  (empty/filled/disabled), select (enabled/disabled), checkboxes
  (checked/unchecked/indeterminate/disabled/label-less), segmented control (with
  a disabled option), all five badge tones, determinate + indeterminate
  progress, skeleton, empty state, dialog, drawer and toasts.
- It renders the **matrices on one page**: three theme panes, three density
  panes and four text-scale panes, each carrying `data-theme` / `data-density` /
  `--text-scale`. To make that possible the theme and density token selectors in
  `tokens.css` were generalised from `:root[data-theme=…]` to `[data-theme=…]`
  (and likewise for density), so any element can scope a palette/density for its
  subtree. The root still works exactly as before; nothing else sets the
  attributes.
- Reachable at **Settings → Diagnostics → Component gallery** (a hidden
  `gallery` destination, deliberately *not* a rail item, matching `CTL-06`'s
  "Settings → Diagnostics" location), with a Back button.
- A standalone fixture `frontend/harness/gallery.html` + `harness/gallery.tsx`
  builds (via `vite.harness.config.ts`, new input `gallery`) to
  `dist-harness/gallery.html`. It needs no backend, so it is the artefact the
  visual-regression tests (TST-19) will diff; `?theme=…&density=…&scale=…` sets
  the page appearance on top of the built-in matrix.

## 3. Tests added

- `frontend/src/test/controls.test.tsx` (new, 11 tests): the checkbox contract
  (reports the *next* value; label and `ariaLabel` naming; the DOM
  `indeterminate` property for a partial selection and never for a full one;
  disabled does not fire; composite children render). The segmented control
  (selects, blocks disabled options, names the group). The progress bar
  (determinate `aria-valuenow`; absent when indeterminate).
- `frontend/src/test/componentGallery.test.tsx` (new, 7 tests): every control
  family's heading is present; all five badge tones; a theme pane per theme
  carrying `data-theme` and holding the control set; a density pane per density;
  four text-scale panes carrying `--text-scale` 0.8/1/1.5/2; the dialog opens;
  Back fires.

Before this increment there were **no** tests of the primitives themselves.

## 4. Verification (commands actually run)

| Check | Command | Result |
|---|---|---|
| Frontend tests | `npm run test` | **9 files, 158 passed** (+18) |
| Frontend build | `npm run build` (tsc -b + vite build) | PASS (1955 modules) |
| Frontend lint | `npm run lint` | exit 0 (only pre-existing warnings) |
| Hand-rolled control sweep | `grep 'type="checkbox"' frontend/src/**/*.tsx` | only `components/ui/Checkbox.tsx` |
| Gallery built standalone | `npx vite build --config vite.harness.config.ts` | PASS → `dist-harness/harness/gallery.html` |
| Gallery rendered | served `dist-harness`, opened `gallery.html` | 14 sections, 15 checkboxes, 3 theme panes, 3 density panes, 4 scale panes; screenshot captured |
| Density actually differs | computed button height per pane | compact **24 px** · comfortable **28 px** · spacious **32 px** |
| Text scale actually differs | computed control font size per pane | 80 % **9.6 px** · 100 % **12 px** · 150 % **18 px** · 200 % **24 px** |
| Themes actually differ | computed button colours per pane | dark `#1b1b1f`, light `#eeeef0`, high-contrast `#0b0b0b` |
| Drawn checkbox | computed style | background `#8f8f98`, **border-radius 3 px** (`VIS-06`), tick `#0a0a0b` (`--text-inverse`) |

The backend was not touched in this increment, so the backend suite was not
re-run.

## 5. Design conformance

- `CTL-01` one component library: **checkboxes now yes**; the checkout of the
  native `<select>` is the remaining gap (§6).
- `CTL-02` no browser-default checkbox: **yes** (drawn). Native `<select>`:
  **not yet**.
- `CTL-06` component gallery: **yes** — every control in every state, and the
  theme/density/text-scale matrices, at Settings → Diagnostics → Component
  gallery.
- `VIS-06` 3 px checkbox radius: **yes**.

## 6. Limitations and deferred work (explicit)

- **`<Select>` still wraps a native `<select>`.** `CTL-02` bans it. Replacing it
  with an accessible custom listbox touches all 11 call sites (each currently
  passes `<option>` children) and needs its own keyboard/ARIA test pass. It is
  the next control-library increment; the gallery shows the current native
  control rather than hiding it.
- **No pixel baselines yet.** `CTL-06` says the gallery is the fixture for visual
  regression; `TST-19` (compare against baselines, 0.1 % tolerance) is not
  implemented. The standalone fixture now exists for it.
- **The gallery is a fixture, not the Diagnostics surface.** `CTL-06` locates it
  under Settings → Diagnostics; the full `DGN-*` Diagnostics sections are a
  separate Phase 1 item (roadmap item 7). The entry point is in place.
- **No forced-colors handling** (`VIS-15` high-contrast is the app's own theme,
  not the OS forced-colors mode).
- **No packaged-exe visual QA.** Verified via tests and a served build; per-screen
  QA on the shipped exe is outstanding.

## 7. Repo integrity

- `panel_folder_cropper_v11.py` untouched
  (`6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A`).
- Pre-existing user changes preserved; this increment is additive except for the
  intended control migrations.
- No commit/push.
