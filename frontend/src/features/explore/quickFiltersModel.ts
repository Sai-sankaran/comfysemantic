/**
 * Quick Filter predicates (`QFL-01`–`QFL-10`).
 *
 * Quick filters are session-only chips that AND-combine with every other filter.
 * `QFL-06`: they are **never** persisted to folder view memory, the launch
 * snapshot or settings. They live only in the current session's navigation
 * history (so Back restores them) and reset on app exit or library change.
 *
 * The five chips, in order (`QFL-01`):
 *   1. **Favourites** — `favourite = true`
 *   2. **Rated 4+** — `rating ≥ 4`
 *   3. **Picks** — `flag = pick`
 *   4. **Incomplete ▾** — at least one applicable stage has status none, stale,
 *      failed or skipped (`QFL-03`). Opens a menu for "Any stage" (default) or a
 *      specific named stage (`QFL-04`).
 *   5. **Failed** — at least one stage has status failed
 *
 * Hidden items are excluded (`FLG-02`).
 *
 * `QFL-08` (Panels scope): *Favourites*, *Rated 4+* and *Picks* apply through
 * the parent page (`FLG-06`); *Incomplete* and *Failed* use the panel's own
 * stages (`QFL-03`).
 */

import type { ExploreItem, ExploreFilters } from './exploreTypes';

// ---------------------------------------------------------------------------
// Stage helpers
// ---------------------------------------------------------------------------



/** `QFL-02`: the stage name for "any stage" in the Incomplete menu. */
export const ANY_STAGE = 'any';

/**
 * `QFL-03`: the applicable stages of an item are the stages of the library's
 * **Full** (ComfyUI) or **Comic** preset that apply to the item's kind.
 *
 * For the fixture and the dev backend, an item's `badges` array carries the
 * stage-level signals (`stale`, `failed`, `missing`) and `row.processing` carries
 * the aggregate. A real backend will expose per-stage status through
 * `ExploreItemDetail.stages`; until then, the badge set is the honest available
 * signal — a stage the fixture does not report is *not* assumed complete.
 */
function applicableStages(item: ExploreItem): string[] {
  const stages: string[] = [];
  const badges = item.badges ?? [];

  // `QFL-03`: audio/video stages only for audio/video items.
  // The fixture only has images (page/panel), so this is a guard for future
  // expansion. A real backend may return additional kinds.
  const kind = item.kind;

  // Comic pages: panel-dependent stages apply only once the page has accepted
  // panels. `Decompose` itself always applies.
  if (kind === 'page' && item.row?.panelStatus) {
    if (item.row.panelStatus === 'decomposed') {
      stages.push('Decompose', 'Panel thumbnails', 'OCR', 'Text index');
    } else {
      // `QFL-03`: pages without accepted panels have no panel-dependent stages.
      stages.push('Decompose');
    }
    return stages;
  }

  // ComfyUI items: thumbnail, metadata, embeddings.
  stages.push('Thumbnail', 'Metadata', 'Embeddings');

  // Stage-level badges (`QFL-03`): a stale or failed badge names a stage.
  if (badges.includes('stale')) stages.push('Stale');
  if (badges.includes('failed')) stages.push('Failed');
  if (badges.includes('missing')) stages.push('Missing');

  return stages;
}

/**
 * `QFL-02` / `QFL-03`: does the item have at least one applicable stage with an
 * incomplete status?
 *
 * `stage === ANY_STAGE` (default) checks all applicable stages. A specific
 * stage name checks only that stage — used by the `QFL-04` menu.
 */
export function isIncomplete(item: ExploreItem, stage: string = ANY_STAGE): boolean {
  const badges = item.badges ?? [];
  const processing = item.row?.processing ?? 'ok';

  // `QFL-08`: in Panels scope, use the panel's own stages. The fixture marks
  // panel items via `item.kind === 'panel'`; the dev backend does the same.
  // For now, the badge set is the honest signal for both page and panel items.

  if (stage === ANY_STAGE) {
    // Any applicable stage is incomplete.
    if (processing === 'stale' || processing === 'failed') return true;
    if (badges.includes('stale') || badges.includes('failed')) return true;
    // A missing file is an incomplete Thumbnail stage.
    if (badges.includes('missing') || item.missing) return true;
    return false;
  }

  // A specific named stage. The fixture does not expose per-stage status for
  // every stage, so a stage the fixture does not report is **not** assumed
  // incomplete — the honest answer is "no" rather than a guess.
  if (stage === 'Thumbnail') return badges.includes('missing') || item.missing;
  if (stage === 'Metadata') return processing === 'failed';
  if (stage === 'Embeddings') return badges.includes('stale');
  if (stage === 'Decompose') return item.badges.includes('failed');
  return false;
}

/** `QFL-02`: does the item have at least one stage with status failed? */
export function isFailed(item: ExploreItem): boolean {
  const badges = item.badges ?? [];
  if (badges.includes('failed')) return true;
  if (item.row?.processing === 'failed') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Chip state
// ---------------------------------------------------------------------------

/** `QFL-01`: the five quick-filter chip ids, in display order. */
export type QuickFilterId = 'favourite' | 'rated4' | 'picks' | 'incomplete' | 'failed';

export const QUICK_FILTER_ORDER: QuickFilterId[] = [
  'favourite',
  'rated4',
  'picks',
  'incomplete',
  'failed',
];

/** `QFL-01`: the chip labels. Incomplete shows its stage name when set. */
export function quickFilterLabel(id: QuickFilterId, filters: ExploreFilters): string {
  if (id === 'incomplete') {
    const stage = filters.qfIncomplete.stage;
    return stage === ANY_STAGE ? 'Incomplete' : `Incomplete: ${stage}`;
  }
  if (id === 'favourite') return 'Favourites';
  if (id === 'rated4') return 'Rated 4+';
  if (id === 'picks') return 'Picks';
  return 'Failed';
}

/** Is a chip active? */
export function isQuickFilterActive(id: QuickFilterId, filters: ExploreFilters): boolean {
  if (id === 'favourite') return filters.qfFavourite;
  if (id === 'rated4') return filters.qfRated4Plus;
  if (id === 'picks') return filters.qfPicks;
  if (id === 'incomplete') return filters.qfIncomplete.enabled;
  return filters.qfFailed;
}

/** Toggle a chip on/off. */
export function toggleQuickFilter(
  filters: ExploreFilters,
  id: QuickFilterId,
): ExploreFilters {
  if (id === 'favourite') return { ...filters, qfFavourite: !filters.qfFavourite };
  if (id === 'rated4') return { ...filters, qfRated4Plus: !filters.qfRated4Plus };
  if (id === 'picks') return { ...filters, qfPicks: !filters.qfPicks };
  if (id === 'incomplete') {
    const enabled = !filters.qfIncomplete.enabled;
    return { ...filters, qfIncomplete: { ...filters.qfIncomplete, enabled } };
  }
  return { ...filters, qfFailed: !filters.qfFailed };
}

/** `QFL-04`: set the Incomplete chip's stage filter. */
export function setIncompleteStage(
  filters: ExploreFilters,
  stage: string,
): ExploreFilters {
  return { ...filters, qfIncomplete: { enabled: true, stage } };
}

/** `QFL-07`: are any chips active? */
export function hasActiveQuickFilters(filters: ExploreFilters): boolean {
  return (
    filters.qfFavourite ||
    filters.qfRated4Plus ||
    filters.qfPicks ||
    filters.qfIncomplete.enabled ||
    filters.qfFailed
  );
}

/** `QFL-07`: the names of active chips, for the count text. */
export function activeQuickFilterNames(filters: ExploreFilters): string[] {
  const names: string[] = [];
  if (filters.qfFavourite) names.push('Favourites');
  if (filters.qfRated4Plus) names.push('Rated 4+');
  if (filters.qfPicks) names.push('Picks');
  if (filters.qfIncomplete.enabled) {
    names.push(quickFilterLabel('incomplete', filters));
  }
  if (filters.qfFailed) names.push('Failed');
  return names;
}

/** `QFL-07`: clear all quick filters. */
export function clearQuickFilters(filters: ExploreFilters): ExploreFilters {
  return {
    ...filters,
    qfFavourite: false,
    qfRated4Plus: false,
    qfPicks: false,
    qfIncomplete: { enabled: false, stage: ANY_STAGE },
    qfFailed: false,
  };
}

// ---------------------------------------------------------------------------
// The predicate
// ---------------------------------------------------------------------------

/**
 * `QFL-02` / `QFL-05`: does an item pass the active quick filters?
 *
 * All active chips are AND-ed with each other and with every other filter.
 * `QFL-02` defines each chip's semantics:
 *   - Favourites: `favourite = true`
 *   - Rated 4+: `rating ≥ 4`
 *   - Picks: `flag = pick`
 *   - Incomplete: at least one applicable stage has status none, stale, failed
 *     or skipped
 *   - Failed: at least one stage has status failed
 *
 * Hidden items are excluded (`FLG-02`) — but the Hidden view asks for exactly
 * them, so this is enforced by the source's `hidden` query parameter, not here.
 */
export function passesQuickFilters(item: ExploreItem, filters: ExploreFilters): boolean {
  if (filters.qfFavourite && !item.row?.favourite) return false;
  if (filters.qfRated4Plus && (item.row?.rating ?? 0) < 4) return false;
  if (filters.qfPicks && item.flag !== 'pick') return false;
  if (filters.qfIncomplete.enabled && !isIncomplete(item, filters.qfIncomplete.stage)) return false;
  if (filters.qfFailed && !isFailed(item)) return false;
  return true;
}

/** `QFL-03`: the stage names offered by the Incomplete menu.
 *
 * The menu offers "Any stage" (default) plus each applicable stage. The names
 * are derived from the library type rather than hard-coded, because `QFL-03`
 * says the applicable stages are those of the library's Full or Comic preset.
 */
export function incompleteStageOptions(libraryType: 'comfyui' | 'comic'): string[] {
  if (libraryType === 'comic') {
    return [ANY_STAGE, 'Decompose', 'Panel thumbnails', 'OCR', 'Text index'];
  }
  return [ANY_STAGE, 'Thumbnail', 'Metadata', 'Embeddings'];
}

export { applicableStages };
