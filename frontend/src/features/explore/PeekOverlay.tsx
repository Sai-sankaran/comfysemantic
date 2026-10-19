import { useEffect, useRef } from 'react';
import type { ExploreItem } from './exploreTypes';

/**
 * Peek (`GAL-11`).
 *
 * `Space` opens a centred overlay showing the 1280 px preview and the filename.
 * `←/→` change the selected item and update the peek in place, so a user can scan
 * a run of images without opening the viewer on each one. `Space` or `Esc` closes
 * it, and **there is no zoom in peek** — peek is for recognising an image, and a
 * zoomable peek would be the viewer with fewer affordances.
 *
 * The overlay is a modal dialog: it takes focus, `Esc` closes it, and the
 * surrounding gallery is `aria-hidden` by the platform's own modal handling.
 */
export type PeekOverlayProps = {
  item: ExploreItem | null;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  /** `false` when this is the first loaded item. */
  canPrevious: boolean;
  canNext: boolean;
};

export function PeekOverlay({
  item,
  onClose,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
}: PeekOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (item) ref.current?.focus();
    // Focus follows the item id, not the item object: a new object with the same
    // id is the same image, and refocusing would steal focus mid-`←→` run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  useEffect(() => {
    if (!item) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrevious();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [item, onClose, onNext, onPrevious]);

  if (!item) return null;

  return (
    <div className="peek-overlay" role="dialog" aria-modal="true" aria-label={`Peek at ${item.filename}`}>
      <div className="peek-surface">
        {item.previewUrl ? (
          <img
            className="peek-image"
            src={item.previewUrl}
            alt={`Preview of ${item.filename}`}
            style={{ background: item.dominantColor }}
          />
        ) : (
          <p className="peek-placeholder" style={{ background: item.dominantColor }}>
            {item.missing ? 'File missing' : 'No preview available'}
          </p>
        )}
        <p className="peek-name">{item.filename}</p>
      </div>

      <div className="peek-controls">
        <button type="button" onClick={onPrevious} disabled={!canPrevious} aria-label="Previous image">
          ◀ Previous
        </button>
        <span className="peek-hint">← → to change · Esc or Space to close</span>
        <button type="button" onClick={onNext} disabled={!canNext} aria-label="Next image">
          Next ▶
        </button>
      </div>

      {/* Focus is moved here rather than to the first control so `←`/`→` are
          handled by the overlay's own key handler. */}
      <div ref={ref} tabIndex={-1} className="peek-focus" aria-hidden="true" />
    </div>
  );
}