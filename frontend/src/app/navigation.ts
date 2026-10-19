import type { ComponentType } from 'react';
import { Activity, Images, MessagesSquare, Search, Settings } from 'lucide-react';

/**
 * The navigation model (design §6.1, `NAV-01`).
 *
 * The rail has exactly five destinations — **Explore, Search, Review, Pipeline**
 * and, anchored at the bottom, **Settings**. Everything that used to be its own
 * destination is now a *workspace* inside one of them, which is where the design
 * puts it: Panel Studio is Pipeline → Tools (`PIP-12`) and Batch Recovery is
 * Review → Failed items (`REV-03`).
 *
 * This is deliberately pure data so the rail, the breadcrumb, the command
 * palette and the `Ctrl+1…Ctrl+5` shortcuts all read one list.
 */

export type DestinationId = 'explore' | 'search' | 'review' | 'pipeline' | 'settings';

/** A screen inside a destination. */
export type WorkspaceId =
  | 'browse'
  | 'results'
  | 'review-text'
  | 'review-failed'
  | 'pipeline-jobs'
  | 'pipeline-tools'
  | 'settings-preferences'
  | 'settings-components';

/** Where the user is: a destination plus the workspace shown inside it. */
export type ViewState = { destination: DestinationId; workspace: WorkspaceId };

export type IconType = ComponentType<{ className?: string; size?: number | string }>;

export type Workspace = {
  id: WorkspaceId;
  label: string;
  /**
   * Hidden workspaces are reachable but are not offered in the workspace strip
   * (the component gallery is reached from Settings → Diagnostics, not a tab).
   */
  hidden?: boolean;
};

export type Destination = {
  id: DestinationId;
  label: string;
  icon: IconType;
  /** Appendix A: `Ctrl+1` … `Ctrl+5`. */
  shortcut: string;
  workspaces: Workspace[];
};

export const DESTINATIONS: readonly Destination[] = [
  {
    id: 'explore',
    label: 'Explore',
    icon: Images,
    shortcut: 'mod+1',
    workspaces: [{ id: 'browse', label: 'Browse' }],
  },
  {
    id: 'search',
    label: 'Search',
    icon: Search,
    shortcut: 'mod+2',
    workspaces: [{ id: 'results', label: 'Results' }],
  },
  {
    id: 'review',
    label: 'Review',
    icon: MessagesSquare,
    shortcut: 'mod+3',
    workspaces: [
      { id: 'review-text', label: 'Dialogue review' },
      { id: 'review-failed', label: 'Failed items' },
    ],
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    icon: Activity,
    shortcut: 'mod+4',
    workspaces: [
      { id: 'pipeline-jobs', label: 'Jobs' },
      { id: 'pipeline-tools', label: 'Tools' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    shortcut: 'mod+5',
    workspaces: [
      { id: 'settings-preferences', label: 'Preferences' },
      { id: 'settings-components', label: 'Component gallery', hidden: true },
    ],
  },
];

/** `NAV-01`: Explore/Search/Review/Pipeline, then Settings anchored at the bottom. */
export const RAIL_MAIN: readonly Destination[] = DESTINATIONS.filter((d) => d.id !== 'settings');
export const RAIL_BOTTOM: readonly Destination[] = DESTINATIONS.filter((d) => d.id === 'settings');

export function destinationOf(id: DestinationId): Destination {
  const found = DESTINATIONS.find((d) => d.id === id);
  // `DESTINATIONS` covers every `DestinationId`, so this cannot be undefined.
  return found ?? DESTINATIONS[0];
}

export function defaultWorkspace(id: DestinationId): WorkspaceId {
  return destinationOf(id).workspaces[0].id;
}

/** Does this workspace belong to this destination? */
export function hasWorkspace(destination: DestinationId, workspace: WorkspaceId): boolean {
  return destinationOf(destination).workspaces.some((w) => w.id === workspace);
}

/**
 * A `ViewState` that is always internally consistent: a stale workspace id (a
 * restored snapshot, a link to a screen that moved) falls back to the
 * destination's default rather than rendering nothing.
 */
export function coerceView(view: Partial<ViewState> | null | undefined): ViewState {
  const destination = (view?.destination ?? 'explore') as DestinationId;
  const safe = destinationOf(destination).id;
  const workspace = view?.workspace;
  return {
    destination: safe,
    workspace: workspace && hasWorkspace(safe, workspace) ? workspace : defaultWorkspace(safe),
  };
}

export function sameView(a: ViewState, b: ViewState): boolean {
  return a.destination === b.destination && a.workspace === b.workspace;
}

/** `NAV-20`: a history entry is pushed when the *view* changes. */
export function viewsDiffer(a: ViewState, b: ViewState): boolean {
  return !sameView(a, b);
}