import { useMemo, useState } from 'react';
import { Checkbox } from '../../components/ui';
import { badgesFor, badgeOverflow, middleTruncate, objectPositionFor } from './exploreModel';
import { badgesWithFlag, REJECTED_OPACITY } from './flagsModel';
import { privacyImageStyle, usePrivacy } from '../../app/privacy';
import type { ExploreItem } from './exploreTypes';

/**
 * One gallery cell (design `GAL-07`, `GAL-08`).
 *
 * The card shows **the image only** (`D-22`). Everything else is an overlay:
 *
 * - a **28 px solid** bar at the bottom on hover or keyboard focus, carrying the
 *   middle-truncated filename and the dimensions. Solid, not a gradient, because
 *   a gradient over artwork reads as part of the image;
 * - **badges** (16 px, top-right, max 3, overflow "+N") that are always visible
 *   when applicable, each with an accessible name and a tooltip — colour is never
 *   the only signal;
 * - a **checkbox** (top-left) on hover/focus, *or* whenever any selection exists,
 *   so the state does not change when the user's mouse happens to be elsewhere.
 *
 * Before the thumbnail decodes the cell is a solid fill of the item's
 * `dominant_color` and the image fades in over 120 ms (`GAL-08`), so the grid
 * never flashes empty.
 */
export type ImageCardProps = {
  item: ExploreItem;
  /** True when the item is in the multi-selection. */
  selected: boolean;
  /** True for the roving tabindex stop (`GAL-10`). */
  focused: boolean;
  /** `GAL-19`: a panel card gets the panel badge first and a 2 px left edge. */
  panelCard: boolean;
  /** `GAL-19`: "Both" scope marks panel cards with a left edge line. */
  showPanelEdge: boolean;
  /** True whenever any item is selected, which keeps the checkbox visible. */
  anySelected: boolean;
  width: number;
  height: number;
  left: number;
  top: number;
  /** `GAL-09`: a plain click selects. */
  onActivate: () => void;
  /** `GAL-12`: double-click opens the viewer. */
  onOpenViewer: () => void;
  onToggleSelect: () => void;
  onRangeSelect: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  /** `GAL-11`: the hover bar's filename is the peek target too. */
  onPeek: () => void;
  registerRef?: (element: HTMLDivElement | null) => void;
};

export function ImageCard({
  item,
  selected,
  focused,
  panelCard,
  showPanelEdge,
  anySelected,
  width,
  height,
  left,
  top,
  onActivate,
  onOpenViewer,
  onToggleSelect,
  onRangeSelect,
  onContextMenu,
  onPeek,
  registerRef,
}: ImageCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  // `PRV-02`: the card is one of the eleven surfaces that must mask.
  const privacy = usePrivacy();

  // `FLG-07` / `FLG-08`: the flag contributes a badge. It is merged rather than
  // read from `item.badges` alone so a flag set in this session shows immediately
  // instead of waiting for a re-query.
  const allBadges = useMemo(
    () => badgesWithFlag(item.badges, item.flag),
    [item.badges, item.flag],
  );
  const badges = useMemo(() => badgesFor(allBadges, panelCard), [allBadges, panelCard]);
  const overflow = useMemo(() => badgeOverflow(allBadges, panelCard), [allBadges, panelCard]);
  const objectPosition = objectPositionFor(item.width, item.height);

  // The accessible name is the whole card: filename, dimensions and every badge,
  // so a screen-reader user gets what the visual badges convey. `FLG-07`'s dimming
  // is also a word here, because dimming alone is a visual-only signal.
  const dimensions = item.width && item.height ? `${item.width} × ${item.height}` : 'Dimensions unknown';
  const name = [
    item.filename,
    dimensions,
    panelCard && item.panelIndex ? `Panel ${item.panelIndex}` : null,
    item.flag === 'reject' ? 'Rejected' : null,
    ...badges.map((b) => b.label),
  ]
    .filter(Boolean)
    .join(', ');

  const showChrome = hovered || focused;

  return (
    <div
      ref={registerRef}
      className={[
        'image-card',
        selected ? 'selected' : '',
        focused ? 'focused' : '',
        item.missing ? 'missing' : '',
        // `FLG-07`: a rejected item is a judgment, not a removal — it stays
        // visible, dimmed to 0.45.
        item.flag === 'reject' ? 'rejected' : '',
        // `PRV-02`: the card records whether it is masked so a screenshot or a
        // support question can tell a masked thumbnail from a broken one.
        privacy.isImageMasked(item.id, item.folderIds) ? 'privacy-masked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="option"
      aria-selected={selected}
      aria-label={name}
      tabIndex={focused ? 0 : -1}
      data-item={item.id}
      data-kind={item.kind}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        background: item.dominantColor,
        ...(showPanelEdge ? { borderLeft: '2px solid var(--text)' } : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(event) => {
        if (event.shiftKey) onRangeSelect();
        else if (event.ctrlKey || event.metaKey) onToggleSelect();
        else onActivate();
      }}
      onDoubleClick={onOpenViewer}
      onContextMenu={onContextMenu}
    >
      {item.thumbnailUrl ? (
        <img
          className={`image-card-img${loaded ? ' loaded' : ''}`}
          src={item.thumbnailUrl}
          alt=""
          draggable={false}
          loading="lazy"
          style={{
            objectFit: 'cover',
            objectPosition,
            // `FLG-07`: the dimming applies to the image only. The badges and the
            // hover bar stay at full opacity so a rejected item is still readable.
            ...(item.flag === 'reject' ? { opacity: REJECTED_OPACITY } : {}),
            // `PRV-03`: the compositing blur. The `src` stays, so the request is
            // neither delayed nor cancelled (`PRV-10`).
            ...(privacy.isImageMasked(item.id, item.folderIds) && privacy.mode === 'blur'
              ? privacyImageStyle(privacy)
              : {}),
          }}
          // `PRV-06`: a Reveal button for this one item, for the session.
          data-privacy-revealable={privacy.isImageMasked(item.id, item.folderIds) ? 'true' : undefined}
          onLoad={() => setLoaded(true)}
          // A thumbnail that fails to decode leaves the dominant-colour fill in
          // place and says so, rather than showing a broken-image icon.
          onError={() => setLoaded(false)}
        />
      ) : (
        <span className="image-card-placeholder">{item.missing ? 'File missing' : 'No preview'}</span>
      )}

      {/* GAL-07: the checkbox is visible on hover/focus or whenever anything is
          selected, so the affordance does not move under the pointer. */}
      <span
        className={`image-card-check${showChrome || anySelected ? ' visible' : ''}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onChange={onToggleSelect}
          ariaLabel={`Select ${item.filename}`}
        />
      </span>

      {badges.length > 0 ? (
        <span className="image-card-badges">
          {badges.map((badge) => (
            <span
              key={badge.key}
              className={`card-badge ${badge.tone}`}
              title={badge.label}
              aria-hidden="true"
            >
              {badge.glyph}
            </span>
          ))}
          {overflow > 0 ? (
            <span className="card-badge overflow" title={`${overflow} more`} aria-hidden="true">
              +{overflow}
            </span>
          ) : null}
        </span>
      ) : null}

      {showChrome ? (
        <span className="image-card-bar">
          <span className="image-card-name">
            {middleTruncate(item.filename, 34)}
            {panelCard && item.panelIndex ? ` · #${item.panelIndex}` : ''}
          </span>
          <span className="image-card-dims">{dimensions}</span>
        </span>
      ) : null}

      {/* Peek is a keyboard affordance (`GAL-11`); a pointer user opens the
          viewer, so the button is only exposed when the card is focused. */}
      {focused ? (
        <button
          type="button"
          className="image-card-peek"
          onClick={(event) => {
            event.stopPropagation();
            onPeek();
          }}
        >
          Peek
        </button>
      ) : null}
    </div>
  );
}