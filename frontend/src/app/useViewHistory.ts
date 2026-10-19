import { useCallback, useMemo, useState } from 'react';
import {
  coerceView,
  defaultWorkspace,
  type DestinationId,
  type ViewState,
  type WorkspaceId,
} from './navigation';

/**
 * View history (design `NAV-20`).
 *
 * A history entry is pushed when the **view** changes — library, destination,
 * workspace, folder, query — and each entry keeps its own selection and scroll
 * position, which is why those are saved *inside* an entry rather than being
 * entries themselves. Depth is 100.
 *
 * Navigating to the view that is already current is a no-op, so re-selecting the
 * active destination from the rail or the breadcrumb does not create a duplicate
 * entry you would have to press Back through twice.
 *
 * The stack and the cursor live in one state object so that pushing an entry is a
 * single atomic update: splitting them would let the index and the list disagree
 * (and reading one from inside the other's updater is not safe under React).
 */
export const HISTORY_DEPTH = 100;

type HistoryState = { entries: ViewState[]; index: number };

export type ViewHistory = {
  view: ViewState;
  /** Navigate, pushing a history entry. */
  go: (next: ViewState) => void;
  /** Navigate from a caller that names only a destination. */
  goTo: (destination: DestinationId, workspace?: WorkspaceId) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  depth: number;
};

function sameView(a: ViewState, b: ViewState): boolean {
  return a.destination === b.destination && a.workspace === b.workspace;
}

export function useViewHistory(initial?: Partial<ViewState>): ViewHistory {
  const [state, setState] = useState<HistoryState>(() => ({
    entries: [coerceView(initial)],
    index: 0,
  }));

  const view = state.entries[state.index];

  const go = useCallback((next: ViewState) => {
    const target = coerceView(next);
    setState((prev) => {
      const current = prev.entries[prev.entries.length - 1];
      if (prev.entries.length > 0 && sameView(current, target)) return prev;
      // Navigating away from an entry that still has forward history drops it.
      const entries = [...prev.entries.slice(0, prev.index + 1), target].slice(-HISTORY_DEPTH);
      return { entries, index: entries.length - 1 };
    });
  }, []);

  const goTo = useCallback(
    (destination: DestinationId, workspace?: WorkspaceId) => {
      go({ destination, workspace: workspace ?? defaultWorkspace(destination) });
    },
    [go],
  );

  const back = useCallback(
    () => setState((prev) => ({ ...prev, index: Math.max(0, prev.index - 1) })),
    [],
  );

  const forward = useCallback(
    () => setState((prev) => ({ ...prev, index: Math.min(prev.entries.length - 1, prev.index + 1) })),
    [],
  );

  return useMemo(
    () => ({
      view,
      go,
      goTo,
      back,
      forward,
      canBack: state.index > 0,
      canForward: state.index < state.entries.length - 1,
      depth: state.entries.length,
    }),
    [view, go, goTo, back, forward, state.index, state.entries.length],
  );
}