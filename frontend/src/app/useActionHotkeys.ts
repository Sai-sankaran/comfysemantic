import { useEffect } from 'react';
import {
  actionShortcuts,
  availability,
  contextForDestination,
  isEditableTarget,
  isUnmodifiedShortcut,
  matchShortcut,
  type ActionContext,
  type ActionRegistry,
} from './actions';
import type { DestinationId } from './navigation';

/**
 * Window-level shortcut dispatch (`NAV-30`/`NAV-31`).
 *
 * One listener, reading the registry — the shell no longer hard-codes `/` or
 * `Ctrl+K`. Two rules from the design apply here:
 *
 * - `NAV-26`: an unmodified shortcut (a single letter, `/`, `?`) is inert while
 *   focus is in a text field; a modified one (`Ctrl+K`) still works there.
 * - Context: an action runs only if it is `global` or scoped to the active
 *   destination.
 *
 * Disabled actions are skipped, so a disabled shortcut does nothing rather than
 * firing an unavailable action.
 */
export function useActionHotkeys(
  registry: ActionRegistry,
  destination: DestinationId,
  ctx: ActionContext,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const context = contextForDestination(destination);
    const onKey = (e: KeyboardEvent) => {
      for (const action of registry.all()) {
        const specs = actionShortcuts(action);
        if (specs.length === 0) continue;
        if (!specs.some((spec) => matchShortcut(e, spec))) continue;
        if (isEditableTarget(e.target) && specs.every(isUnmodifiedShortcut)) continue;
        // The `gallery` context is dispatched by the **grid's own keydown
        // handler**, not by this window listener, and that is deliberate rather
        // than a gap. A grid key is not a global key: `Space` must peek the
        // focused card and not scroll the page, `←→` must move between cards and
        // not move the folder-tree cursor, and type-ahead has to accumulate from
        // the grid's own key sequence. The grid's handler stops propagation, so
        // running these here as well would double-handle every one of them.
        //
        // They are still registered, so the palette and the shortcut overlay list
        // them with their real keys (`NAV-30`), and `tests/test_action_registry_drift.py`
        // counts them as implemented rather than deferred.
        if (action.contexts.includes('gallery') && !action.contexts.includes('global')) continue;
        if (!action.contexts.includes('global') && !action.contexts.includes(context)) continue;
        if (!availability(action, ctx).enabled) continue;
        e.preventDefault();
        void action.run(ctx);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registry, destination, ctx, enabled]);
}