# Phase 1 · Increment 7 — Custom `<Select>` listbox (CTL-02)

| | |
|---|---|
| **Date** | 2026-10-16 |
| **Phase** | 1 — Foundations and safety rails |
| **Increment** | 7 of N |
| **Requirement** | `design.md` `CTL-02` — "Native `<select>` and browser-default checkboxes are not used." (roadmap Phase 1 item 2) |
| **Status** | Implemented · regression-tested · checks run |
| **Depends on** | Increment 6 (shared controls + component gallery) |

## 1. Scope

`CTL-02` banned native `<select>`, but `components/ui/Select.tsx` was a thin
wrapper around exactly that element, and the audit listed it as the remaining
control-library gap. This increment replaces it with a real listbox and removes
the native element from the app entirely. (The checkbox half of `CTL-02` was done
in increment 6.)

## 2. What changed

### 2.1 A select-only listbox (`frontend/src/components/ui/Select.tsx`)
Rewritten to the ARIA 1.2 **select-only combobox** pattern:

- The trigger is a `<button role="combobox">` with `aria-haspopup="listbox"`,
  `aria-expanded`, `aria-controls` and `aria-activedescendant`.
- The popup is a `<ul role="listbox">` of `<li role="option">` items, each with
  `aria-selected` / `aria-disabled`; the selected option also carries a check
  mark, so colour/text is never the only signal.
- Keyboard: Arrow Down/Up (open at the selection, then move, **skipping disabled
  options**), Home/End, Enter/Space (select), Escape (close), Tab (close), and
  type-ahead.
- A pointer-down outside closes it and focus returns to the trigger after a
  commit.
- Options come from an `options` prop **or**, for compatibility, from `<option>`
  children (any `<optgroup>`/fragment is flattened).

### 2.2 Drop-in API — zero call-site churn
The change handler still receives a `{ target: { value } }` object, the same
shape the native element produced:

```tsx
onChange?: (e: { target: { value: string } }) => void;
```

Every one of the 11 existing call sites is an inline `(e) => f(e.target.value)`,
so all of them kept compiling unchanged (the TypeScript build confirms it). This
was deliberate: the *public* API of the control is preserved even though the
element underneath is not, which is what keeps a redesign from breaking working
screens.

### 2.3 Styling (`App.css`)
`.select` / `.select-trigger` / `.select-menu` / `.select-option`, all on tokens
and density (`--control-pad-y`, `--row-pad-y-tight`, `--space-*`), so the listbox
follows every theme, density and text scale like the rest of the library.

### 2.4 Gallery
The gallery's `Select` section now shows the listbox (enabled and disabled), and
the theme/density/scale matrix panes carry it too.

## 3. Tests

- **New** `frontend/src/test/select.test.tsx` (11 tests): shows the selected
  value and is a collapsed combobox; opens on click and marks the current option
  selected; reports the chosen value in the `{ target: { value } }` shape;
  reads `<option>` children when no `options` prop is given; Arrow keys +
  Enter; **skips disabled options**; Escape closes without changing the value;
  outside pointer-down closes; disabled never opens; uncontrolled via
  `defaultValue` updates on selection.
- **Updated** `frontend/src/test/workbenchEditing.test.tsx` (2 tests): the two
  cases that used `user.selectOptions(...)` now click the trigger and then the
  option — the honest way to drive a listbox. The assertions are unchanged.

## 4. Verification (commands actually run)

| Check | Command | Result |
|---|---|---|
| Frontend tests | `npm run test` | **10 files, 168 passed** (+10) |
| Frontend build | `npm run build` (tsc -b + vite build) | PASS — **the 11 call sites compiled unchanged** |
| Frontend lint | `npm run lint` | exit 0 (the one new `react(purity)` warning was removed by using the event timestamp instead of `Date.now()`) |
| Native element sweep | `grep '<select' frontend/src/**/*.tsx` | only comments — **no native `<select>`** |
| Gallery build | `npx vite build --config vite.harness.config.ts` | PASS |
| Rendered (served `dist-harness`) | opened `gallery.html` and drove it | 12 listbox triggers, **0 `select` elements**; a click opens a `role=listbox` with the right options; the selected option carries a check; a commit updates the trigger text and closes the menu; **Arrow Down opens it** with a valid `aria-activedescendant`; an outside pointer-down closes it; a disabled trigger never opens; triggers inside the light and high-contrast panes take those palettes (`#ffffff`/dark text and `#000000`/white text) |

The backend was not touched, so the backend suite was not re-run.

## 5. Design conformance

- `CTL-02` no native `<select>`: **yes** — the element is gone, replaced by an
  ARIA listbox.
- `CTL-01` one library: the select is the one control; no screen hand-rolls one.

## 6. Limitations and deferred work (explicit)

- **No portal / flip.** The menu is `position: absolute` inside the control, so
  in a scroll container it can be clipped at the very bottom edge, and it does
  not flip above the trigger when there is no room below. Every current call site
  sits near the top of its container, so none is affected today; a portal-based
  popover is the fix when one is.
- **No multi-select or searchable variant.** The design's later `SET-*`/filter
  work may need one; this is the single-select listbox only.
- **The compatibility `children` parser** (reading `<option>` elements) exists so
  the existing screens did not have to change. New code should pass `options`.
- **No packaged-exe visual QA.** Verified via unit tests and a served build;
  per-screen QA on the shipped exe is outstanding.
- **Still no pixel baselines** for the gallery (`TST-19`).

## 7. Repo integrity

- `panel_folder_cropper_v11.py` untouched
  (`6A120FAF3BFBFAF27A681C62EAAF881868285348EFFC4BA9F5517FCD1C62AD0A`).
- Pre-existing user changes preserved; the only edits outside the new/modified
  control files are the two test interactions that had to change because the
  element did.
- No commit/push.
