import { ChevronDown, ChevronUp, Pause, Square } from 'lucide-react';
import { api } from '../api';

/**
 * The bottom tray and the job drawer (design `NAV-07`, §7.8 `PIP-20`–`PIP-23`).
 *
 * Collapsed it is 28 px and shows, left to right, the system state text — "Ready",
 * or the running job's one-line summary with **Pause** and **Stop** — and, right
 * aligned, "N selected". Clicking it or pressing `Ctrl+J` expands the drawer to
 * 280 px.
 *
 * Scope note: the tray, its buttons and the drawer shell are here; the drawer's
 * stage rows, failure list, queue and session log (`PIP-21`) arrive with the
 * Pipeline increment, and the selection count arrives with Explore (`GAL-23`).
 * Until then the drawer says so rather than inventing job history.
 */
export type TrayProps = {
  expanded: boolean;
  onToggle: () => void;
  busy: string | null;
  /** Items currently selected; the Explore screen supplies this. */
  selectedCount: number;
  /** `null` renders the "Counting…" determinate/indeterminate rule of `PIP-22`. */
  jobProgress: number | null;
  /**
   * `PRV-01`: while the mask is on, the tray shows a chip that turns it off. It is
   * in the tray rather than only in a menu because the tray is visible from every
   * screen — including the ones where someone can see the display.
   */
  privacyOn?: boolean;
  onTogglePrivacy?: () => void;
};

export function Tray({
  expanded,
  onToggle,
  busy,
  selectedCount,
  jobProgress,
  privacyOn = false,
  onTogglePrivacy,
}: TrayProps) {
  const running = busy !== null;

  const statusText = running
    ? `Indexing · ${busy}${jobProgress === null ? ' · Counting…' : ` · ${Math.round(jobProgress * 100)}%`}`
    : 'Ready';

  return (
    <>
      <div className="tray" data-expanded={expanded ? 'true' : 'false'}>
        <button
          type="button"
          className="tray-summary"
          aria-expanded={expanded}
          onClick={onToggle}
          title={expanded ? 'Collapse the job drawer' : 'Expand the job drawer'}
        >
          {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
          <span className={running ? 'tray-running' : undefined}>{statusText}</span>
        </button>

        {running ? (
          <span className="tray-controls">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void api.pauseIndexing().catch(() => undefined)}
            >
              <Pause size={12} aria-hidden="true" /> Pause
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              // `PIP-09`: Stop means "stop safely" — the current item finishes first.
              title="Stop safely — finishes the current item, then stops."
              onClick={() => void api.stopIndexing().catch(() => undefined)}
            >
              <Square size={12} aria-hidden="true" /> Stop
            </button>
          </span>
        ) : null}

        <span className="spacer" />
        {/* `PRV-01`: the chip says the mask is on and turns it off in one click. */}
        {privacyOn ? (
          <button
            type="button"
            className="tray-privacy"
            onClick={onTogglePrivacy}
            title="Turn privacy blur off"
          >
            Privacy blur on
          </button>
        ) : null}
        {selectedCount > 0 ? (
          <span className="tray-selection">{selectedCount} selected</span>
        ) : null}
      </div>

      {expanded ? (
        <section className="job-drawer" aria-label="Jobs">
          <header className="job-drawer-head">
            <h2>Jobs</h2>
            <span className="job-drawer-state">{running ? 'Running' : 'Idle'}</span>
          </header>
          <div className="job-drawer-body">
            {running ? (
              <p className="job-drawer-line">{statusText}</p>
            ) : (
              <p className="job-drawer-empty">
                No jobs this session. Stage rows, failures, the queue and the session log
                arrive with the Pipeline screen (`PIP-21`).
              </p>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}