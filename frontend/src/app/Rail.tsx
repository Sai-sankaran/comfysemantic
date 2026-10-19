import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatShortcut } from './actions';
import { RAIL_BOTTOM, RAIL_MAIN, type Destination, type DestinationId } from './navigation';

/**
 * The navigation rail (design `NAV-01`–`NAV-03`).
 *
 * Five destinations, in the documented order: Explore, Search, Review, Pipeline,
 * then **Settings anchored at the bottom**, with the collapse button under it.
 * Expanded it is 200 px (icon + label); collapsed 56 px (icon + tooltip).
 *
 * Only Review carries a count badge and Pipeline a progress ring (`NAV-02`).
 */

export type RailProps = {
  destination: DestinationId;
  collapsed: boolean;
  onSelect: (destination: DestinationId) => void;
  onToggleCollapsed: () => void;
  /**
   * Items in Needs Attention for the Review badge. `null` means "not known yet"
   * and renders no badge rather than a fake zero (`PRD-10`).
   */
  reviewCount: number | null;
  /** A job is running, so Pipeline shows its ring (`NAV-02`). */
  jobRunning: boolean;
  /** 0–1 when known; `null` renders the ring as indeterminate. */
  jobProgress: number | null;
};

function capCount(count: number): string {
  return count > 999 ? '999+' : String(count);
}

/** The small determinate/indeterminate ring drawn beside the Pipeline icon. */
function ProgressRing({ progress }: { progress: number | null }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const dash = progress === null ? c * 0.25 : c * Math.min(1, Math.max(0, progress));
  return (
    <svg className="rail-ring" width={22} height={22} viewBox="0 0 22 22" aria-hidden="true">
      <circle className="rail-ring-track" cx="11" cy="11" r={r} />
      <circle
        className="rail-ring-fill"
        cx="11"
        cy="11"
        r={r}
        strokeDasharray={`${dash} ${c - dash}`}
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}

function RailButton({
  item,
  active,
  collapsed,
  onSelect,
  badge,
  ring,
}: {
  item: Destination;
  active: boolean;
  collapsed: boolean;
  onSelect: (id: DestinationId) => void;
  badge?: string;
  ring?: React.ReactNode;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={`rail-item${active ? ' active' : ''}${collapsed ? ' collapsed' : ''}`}
      // Collapsed rails are icon-only, so the accessible name must still be there.
      aria-current={active ? 'page' : undefined}
      title={collapsed ? `${item.label} (${formatShortcut(item.shortcut)})` : item.label}
      data-destination={item.id}
      onClick={() => onSelect(item.id)}
    >
      <span className="rail-icon">
        <Icon size={20} />
        {ring}
        {badge ? (
          <span className="rail-badge">{badge}</span>
        ) : null}
      </span>
      {!collapsed ? <span className="rail-label">{item.label}</span> : null}
    </button>
  );
}

export function Rail({
  destination,
  collapsed,
  onSelect,
  onToggleCollapsed,
  reviewCount,
  jobRunning,
  jobProgress,
}: RailProps) {
  return (
    <aside
      className={`rail${collapsed ? ' collapsed' : ''}`}
      aria-label="Main navigation"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <nav className="rail-nav">
        {RAIL_MAIN.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={item.id === destination}
            collapsed={collapsed}
            onSelect={onSelect}
            badge={item.id === 'review' && reviewCount !== null ? capCount(reviewCount) : undefined}
            ring={item.id === 'pipeline' && jobRunning ? <ProgressRing progress={jobProgress} /> : undefined}
          />
        ))}
      </nav>
      {/* `NAV-01`: Settings is anchored at the bottom, with collapse beneath it. */}
      <div className="rail-foot">
        {RAIL_BOTTOM.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={item.id === destination}
            collapsed={collapsed}
            onSelect={onSelect}
          />
        ))}
        <button
          type="button"
          className="rail-item rail-collapse"
          title={collapsed ? 'Expand rail' : 'Collapse rail'}
          aria-label={collapsed ? 'Expand navigation rail' : 'Collapse navigation rail'}
          aria-pressed={collapsed}
          onClick={onToggleCollapsed}
        >
          <span className="rail-icon">
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </span>
          {!collapsed ? <span className="rail-label">Collapse</span> : null}
        </button>
      </div>
    </aside>
  );
}