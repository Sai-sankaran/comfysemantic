import type { ExploreItem, FlagValue } from './exploreTypes';

/**
 * Hide, Pick and Reject (design Appendix E.1, `FLG-01`–`FLG-11`).
 *
 * The rules that are easy to get subtly wrong, and what makes each one that way:
 *
 * - **Hide is not delete.** `FLG-03` fixes the wording, and `FLG-05` fixes the
 *   consequence: hiding is a *view* concern, so a job still processes a hidden
 *   item and `stage_state` never changes. An implementation that treats hidden as
 *   "gone" would silently change processing behaviour.
 * - **Reject is not removal.** `FLG-07`: a rejected item stays visible, dimmed.
 *   Conflating reject with hide would make Reject destructive, which the design
 *   explicitly refuses.
 * - **Undo needs the previous value.** `FLG-10`. Setting a flag *replaces* the
 *   previous one (`FLG-09`), so an undo that just cleared the flag would be
 *   wrong for any item that had a flag before.
 */

/** `FLG-03`: the tooltip wording. "delete" and "remove" are never used. */
export const HIDE_TOOLTIP = "Hide (doesn't delete the file)";
export const SHOW_AGAIN_LABEL = 'Show again';

/** `FLG-07`: the dimming applied to a rejected item. */
export const REJECTED_OPACITY = 0.45;

/** `FLG-09`: what a flag action applies to. */
export type FlagTargets = {
  /** The current selection, or empty. */
  selectionIds: string[];
  /** The focused item, used only when nothing is selected. */
  focusedId: string | null;
};

/**
 * `FLG-09`: the selection if there is one, otherwise the focused item.
 *
 * The order matters. Acting on the focused item when a selection exists would
 * silently flag the wrong thing — the item under the cursor rather than the N
 * items the user just ticked.
 */
export function flagTargets(targets: FlagTargets): string[] {
  if (targets.selectionIds.length > 0) return [...targets.selectionIds];
  return targets.focusedId === null ? [] : [targets.focusedId];
}

/** The wording `FLG-03` fixes, and the tooltip beside it. */
export function actionLabel(action: 'hide' | 'showAgain' | 'pick' | 'reject' | 'clearFlag'): string {
  switch (action) {
    case 'hide':
      return 'Hide';
    case 'showAgain':
      return SHOW_AGAIN_LABEL;
    case 'pick':
      return 'Pick';
    case 'reject':
      return 'Reject';
    case 'clearFlag':
      return 'Clear flag';
    default:
      return 'Flag';
  }
}

export function actionTooltip(action: 'hide' | 'showAgain' | 'pick' | 'reject' | 'clearFlag'): string {
  if (action === 'hide') return HIDE_TOOLTIP;
  if (action === 'showAgain') return 'Show this item in the gallery again. The file is untouched.';
  if (action === 'pick') return 'Mark this item as picked.';
  if (action === 'reject') return 'Mark this item as rejected. It stays visible.';
  return 'Remove the pick or reject flag.';
}

/**
 * `FLG-09`: what a flag action actually does to each item.
 *
 * Returns the items that **changed**, so `FLG-10`'s undo covers exactly the
 * right rows. An item already carrying the requested flag is not reported: it
 * was not changed, and putting it in the undo entry would make Undo clear a
 * flag the user never set here.
 */
export function applyFlag(
  items: ExploreItem[],
  targetIds: string[],
  flag: FlagValue,
): { changed: Array<{ id: string; previous: FlagValue }> } {
  const wanted = new Set(targetIds);
  const changed: Array<{ id: string; previous: FlagValue }> = [];
  for (const item of items) {
    if (!wanted.has(item.id)) continue;
    if (item.flag === flag) continue;
    changed.push({ id: item.id, previous: item.flag });
  }
  return { changed };
}

/** `FLG-10`: an entry the Undo toast can reverse. */
export type FlagUndo = {
  label: string;
  /** Restore this and the operation is undone. */
  undo: () => Promise<void>;
  /** `NAV-51`: reversible actions never show a confirmation dialog. */
  reversible: true;
};

/**
 * `FLG-07`: "Hide all rejected in this view", as one undoable batch.
 *
 * The confirmation shows the count, because a bulk hide that removed 300 items
 * with no number in front of the user is not a confirmation.
 */
export function hideRejectedSummary(rejectedIds: string[]): {
  title: string;
  body: string;
  confirmLabel: string;
} {
  const n = rejectedIds.length;
  return {
    title: `Hide ${n} rejected item${n === 1 ? '' : 's'}?`,
    body: `They disappear from every view, but nothing is deleted and jobs still process ${
      n === 1 ? 'it' : 'them'
    }.`,
    confirmLabel: `Hide ${n}`,
  };
}

/**
 * `FLG-06`: a panel inherits its page's flag and hidden state.
 *
 * Panels are not flaggable in their own right, so "the panel's flag" is always
 * the page's. This is what the table's Flag column and the card badges must
 * show for a panel row.
 */
export function inheritedFlag(
  panel: Pick<ExploreItem, 'kind' | 'flag' | 'hidden' | 'parentPageId'>,
  pageById: Map<string, ExploreItem>,
): { flag: FlagValue; hidden: boolean } {
  if (panel.kind !== 'panel' || panel.parentPageId === null) {
    return { flag: panel.flag, hidden: panel.hidden };
  }
  const page = pageById.get(panel.parentPageId);
  if (!page) return { flag: panel.flag, hidden: panel.hidden };
  return { flag: page.flag, hidden: page.hidden };
}

/** `FLG-07`: the badge list for a card, with the reject badge added. */
export function badgesWithFlag(badges: ExploreItem['badges'], flag: FlagValue): ExploreItem['badges'] {
  if (flag === 'none') return badges;
  if (badges.includes(flag)) return badges;
  return [...badges, flag];
}

/**
 * `FLG-02`: whether an item belongs in the current result set.
 *
 * Centralised because `FLG-02` lists *nine* places an item must disappear from,
 * and a per-call-site check is nine chances to forget one. Every caller filters
 * through here.
 */
export function passesHiddenFilter(item: ExploreItem, mode: 'exclude' | 'only'): boolean {
  return mode === 'only' ? item.hidden : !item.hidden;
}

/** `FLG-05`: the Pipeline scope count reads "412 items (3 hidden)". */
export function scopeCountText(total: number, hiddenCount: number): string {
  if (hiddenCount === 0) return `${total.toLocaleString()} items`;
  return `${total.toLocaleString()} items (${hiddenCount.toLocaleString()} hidden)`;
}

/** `FLG-05`: a hidden item is still processed, so it is still counted as work. */
export function processableCount(items: ExploreItem[]): number {
  return items.length;
}