# Phase 01 — Image viewer, preview, navigation, gallery, checkbox fixes

## Changes implemented
- Preview sidebar (`PreviewSidebar`, `Inspector`) now uses original file (`fileUrl`) with `maxHeight: 320px` and `object-fit: contain`, instead of stretching a tiny thumbnail.
- `ImageViewerDialog` receives `onPrevious` / `onNext` props and handles keyboard events (`ArrowLeft`, `ArrowRight`, `Escape`) with editable-element guard.
- `LibraryScreen` resets pagination when `libraryId` changes (`[libraryId, filters]`).
- `ImageViewerDialog` keyboard navigation synchronized with gallery using `filtered` array.
- Checkbox styling standardized with consistent size, border, focus-visible, disabled, and checked states across settings, filters, stages, and selection lists.
- Folder-scoped scan controls added to `IndexingScreen` (folder picker button, scope display, clear scope).
- Backend `start_indexing` validates `library_root` exists and is a directory.

## Screenshots captured
- Not captured (no safe test environment launched for packaged app during automated fix pass).
- Visual verification deferred to manual review per protocol.

## Tests added / verified
- `tests/test_regression_fix.py`: 5 passed.
- `tests/test_unit.py`: 19 passed.
- TypeScript build (`frontend`): passed.

## Known limitations / remaining work
- Image viewer navigation operates on current `filtered` page; full-library cross-page navigation would require fetching adjacent pages on arrow key press (not implemented due to time).
- Review dialog (`DialogueReview`) identified but specific broken action not reproduced; grouping actions (`Accept`/`Split`) are intentionally unexposed in this build.
- No automatic full-library reindex triggered by opening library (verified by code inspection of `register_library` which does not call indexing).
- No unnecessary thumbnail regeneration verified by thumbnail module logic (cache key based on `(path, size, mtime)`).

## Blockers
- None. Visual screenshot capture deferred; no fabricated screenshots.
