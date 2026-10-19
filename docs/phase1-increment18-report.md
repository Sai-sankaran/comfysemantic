# Phase 1 — Increment 18: Privacy blur (design Appendix E.3)

| | |
|---|---|
| **Date** | 2026-10-18 |
| **Policy** | `AGENT.md` §"UI-First Implementation Strategy" — Stage A (complete the UI) |
| **Requirements** | `PRV-01`–`PRV-10`, plus `E.5`'s six new settings keys |
| **Follows** | Increment 17 (Hide/Pick/Reject) — `docs/phase1-increment17-report.md` |

## 1. What this is, stated before anything else

It is a **display mask**. It does nothing about Alt+Tab previews, screenshots,
screen sharing or exported files. `PRV-09`'s sentence is imported into the
registry rather than retyped, so the Settings row, the category hint and any future
surface cannot drift apart, and two tests assert it says all of the things it must
say.

That property is tested first and most heavily, because an implementation that
quietly turned this into encryption would pass every "is the image blurred" test
and be worse than useless: it would buy false confidence.

## 2. The two modes differ in kind, not in degree

`PRV-03`'s two modes are often described as "blur vs a fallback". They are not
alternatives of equal strength:

| | Image request | What is on screen |
|---|---|---|
| `blur` | issued and completes | the image, compositing-blurred at 8–48 px |
| `colour` | **never issued** | the item's dominant colour |

`PRV-10` requires that blur never delays or cancels a request, so `blur` keeps the
`src` — the compositing blur only applies to pixels that have decoded. `colour`
issues nothing, which is the whole point: it is genuinely more private because the
bytes never arrive. A test asserts `document.querySelector('img')` is `null` in
colour mode, because a component that set an empty `src` and hoped would still be
issuing a request.

## 3. What was built

- **`app/privacy.tsx`** — the provider, the hook and the constants. `usePrivacy`
  returns "off" outside the provider, so a harness that forgets to wrap a screen
  gets a working screen rather than a crash.
- **`components/ui/PrivacyImage.tsx`** — the one image surface. `PRV-02` names
  eleven surfaces; routing each one through its own blur would be eleven chances
  to miss one, and a surface that forgot would look secure while showing the whole
  image.
- **`MaskedText`** (`PRV-05`) — the masked string is **absent from the DOM**, not
  covered. A transparent or off-screen element would leave the filename in the
  accessibility tree and in a text selection, which is the opposite of the point.
- **`Ctrl+Shift+B`** registered as `privacy.toggle`, on the palette, the shortcut
  overlay and the View menu (`PRV-01`). This key does **not** depend on `VERIFY`
  A1, unlike Appendix E.9's Alt bindings.
- **The tray chip** "Privacy blur on", click to turn off.
- **`E.5`'s six settings** in a new `privacy` category: `privacy.mode`,
  `privacy.blurRadius`, `privacy.startBlurred`, `privacy.autoBlurOnBlur`,
  `privacy.hideText` and `table.columns`; plus `browse.viewMode` and
  `browse.advanceAfterFlag`.

## 4. Three decisions worth recording

**Reveal clears on toggle.** `PRV-06` says "turning blur off or on again clears
all reveals". The toggle therefore clears image *and* text reveals, not only the
ones it conceptually owns — a reveal that survived would be one the user believes
they ended.

**Sensitive folders are checked in one place.** `PRV-06`'s per-item reveal and
`PRV-08`'s sensitive folders both go through `isImageMasked`, so no surface can
apply one and forget the other. Tests cover sensitive folders with the global mask
off, on, and unmarked again.

**`PRV-04` does not use `localStorage`.** `ARC-13` and `SET-09` forbid it
outright, so the launch-time copy is a module variable. This surfaced a real
violation in existing code — see below.

## 5. A defect found in existing code

`frontend/src/app/appearance.ts` writes `comfypanel.appearance` to `localStorage`
and reads it back so the theme applies before the first paint. `ARC-13` says
*"never `localStorage`, so the web and exe builds behave identically"*, and
`SET-09` repeats it.

The reason the rule exists is the failure it prevents: `localStorage` is
per-origin and per-WebView-profile, so the exe and a browser build on the same data
directory can disagree about the theme. That is the same class of bug as
`VERIFY` #11's shipped-versus-web divergence.

Privacy blur deliberately does **not** copy the pattern. The existing violation is
recorded in `docs/audit.md` rather than fixed here, because changing a shipped
feature's first-paint path is a visible behaviour change that belongs in its own
increment with its own verification.

## 6. Two requirement-driven test corrections

`PRV-01` requires the privacy toggle to be in the View menu. Two existing tests
asserted the View menu's **exact** action list, which blocked it.

Both tests were wrong, not the requirement. `NAV-13` says the View menu "replaces
the old Options button — verify what the old button contained and **carry every
item over**". That is a requirement about the old items keeping their *relative*
order, not that nothing may ever be added. Both tests now assert presence plus
relative order, which is what `NAV-13` actually says, and a new test asserts the
privacy entry is present with its `Ctrl+Shift+B` label.

Three settings tests enumerated §12.1's ten categories and every registry key.
`E.5` legitimately adds an eleventh category and six keys, so those lists were
extended with the reason.

## 7. A flake fixed properly

`exploreScreen.test.tsx`'s two scroll tests passed alone and failed under
full-suite load. The cause was real: the scroll listener is attached by an effect
that only runs once a cursor exists, so a scroll fired immediately after the first
page can land before the listener exists and be lost.

A `scrollUntil` helper re-delivers the scroll inside `waitFor` until the screen
reacts. Same behaviour asserted, race removed.

## 8. Tests

`privacy.test.tsx`, **30 tests**: the `PRV-09` disclaimer and its registration, the
toggle and `startBlurred`, both modes including "colour mode issues no request",
blur keeping the `src`, radius clamping, per-item reveal and its clearing on
toggle, sensitive folders in three states, text masking including "absent from the
DOM", the copy-toast suffix, and the provider being safe outside its boundary.

**Results:** frontend **28 files, 714 tests passed**. `npm run build` PASS.
`npm run lint` **0 errors, 14 warnings** — the pre-existing baseline, none from the
new files (the five `only-export-components` hints in `privacy.tsx` are suppressed
with a written reason, as in increment 15).

## 9. Not included

- **`PRV-07`'s auto-blur** is implemented against `window` blur and
  `visibilitychange`. It is not browser-verified here, because the browser pane
  cannot take focus (`document.hasFocus()` is always `false` in this harness).
  Covered by `fireEvent` and **not** claimed as a browser check.
- **`PRV-08`'s "Mark folder as sensitive"** has no context-menu entry — the folder
  context menu (`NAV-42`) is not built. The state and its effect on masking are
  implemented and tested; only the entry point is missing.
- **`PRV-03`'s "`colour` is the fallback when `blur` cannot hold B5"** cannot be
  evaluated: budget **B5** has no measurement harness. Colour mode is available
  as a setting; nothing measures when it should become the default.
- **`PRV-02`'s eleven surfaces** — the grid, the table and the inspector preview
  are wired. The viewer, compare, reader, Review canvas, panel editor, series
  covers and saved-search thumbnails are not built yet.
- **The platform-adapter file read** for `PRF-20` is not wired; the module cache
  stands in for it, and `PRV-04`'s "no flash at launch" holds for the current
  session only.