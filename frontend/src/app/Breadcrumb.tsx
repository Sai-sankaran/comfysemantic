import { ChevronLeft, ChevronRight } from 'lucide-react';
import { destinationOf, type ViewState } from './navigation';

/**
 * The breadcrumb (design `NAV-11`).
 *
 * `Library › Folder › Subfolder` in Explore, `Library › Search "query"` in Search,
 * `Library › … › filename` in the viewer. Every segment is clickable and goes
 * back to that level. The workspace segment only appears when the destination
 * actually has more than one workspace, so Explore shows `Library › Explore`
 * rather than a redundant `Library › Explore › Browse`.
 */
export type BreadcrumbSegment = {
  label: string;
  onClick?: () => void;
};

export type BreadcrumbProps = {
  libraryName: string | null;
  view: ViewState;
  /** Extra segments the active screen contributes (search query, folder, file). */
  extra?: BreadcrumbSegment[];
  onOpenLibrary: () => void;
  onOpenDestination: () => void;
  canBack: boolean;
  onBack: () => void;
  canForward: boolean;
  onForward: () => void;
};

export function Breadcrumb({
  libraryName,
  view,
  extra = [],
  onOpenLibrary,
  onOpenDestination,
  canBack,
  onBack,
  canForward,
  onForward,
}: BreadcrumbProps) {
  const destination = destinationOf(view.destination);
  const visibleWorkspaces = destination.workspaces.filter((w) => !w.hidden);
  const showWorkspace = visibleWorkspaces.length > 1;

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {/* `NAV-20`: Back/Forward are also available as Alt+←/Alt+→. */}
      <button
        type="button"
        className="crumb-nav"
        aria-label="Back"
        disabled={!canBack}
        onClick={onBack}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        className="crumb-nav"
        aria-label="Forward"
        disabled={!canForward}
        onClick={onForward}
      >
        <ChevronRight size={16} />
      </button>

      <ol className="crumb-list">
        <li>
          <button type="button" className="crumb-link" onClick={onOpenLibrary}>
            {libraryName ?? 'All libraries'}
          </button>
        </li>
        <li aria-hidden="true" className="crumb-sep">
          ›
        </li>
        <li>
          <button type="button" className="crumb-link current" aria-current="page" onClick={onOpenDestination}>
            {destination.label}
          </button>
        </li>
        {showWorkspace ? (
          <>
            <li aria-hidden="true" className="crumb-sep">
              ›
            </li>
            <li>
              <button type="button" className="crumb-link current">
                {
                  destination.workspaces.find((w) => w.id === view.workspace)?.label ?? ''
                }
              </button>
            </li>
          </>
        ) : null}
        {extra.map((segment) => (
          <li key={segment.label} className="crumb-extra">
            <span aria-hidden="true" className="crumb-sep">
              ›
            </span>
            <span className="crumb-link current">{segment.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}