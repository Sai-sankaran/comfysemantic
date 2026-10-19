import { useId } from 'react';
import {
  columnWidth,
  columnsFor,
  moveColumn,
  resetLayout,
  toggleColumn,
  visibleColumns,
  type ColumnLayout,
  type TableTarget,
} from './tableModel';

/**
 * The columns menu (`TBL-06`).
 *
 * Reordering has explicit **Move left / Move right** buttons on purpose: the
 * design says reordering is never drag-only. A menu whose only affordance is a
 * drag handle is unusable with a keyboard and unusable at all on a touch screen,
 * and a column layout is something people do reasonably often.
 */
export function ColumnsMenu({
  target,
  layout,
  onChange,
  onClose,
}: {
  target: TableTarget;
  layout: ColumnLayout;
  onChange: (layout: ColumnLayout) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const all = columnsFor(target);

  return (
    <div className="popover columns-menu" role="menu" aria-labelledby={titleId}>
      <div className="popover-head">
        <h2 id={titleId}>Columns</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close columns menu">
          ×
        </button>
      </div>

      <p className="hint">
        {visibleColumns(target, layout).length} of {all.length} shown. Layout is saved per library.
      </p>

      <ul className="columns-list">
        {layout.order.map((id, index) => {
          const column = all.find((c) => c.id === id);
          if (!column) return null;
          const hidden = layout.hidden.includes(id);
          const atStart = index === 0;
          const atEnd = index === layout.order.length - 1;
          return (
            <li key={id} className="columns-row">
              <label className="columns-toggle">
                <input
                  type="checkbox"
                  checked={!hidden}
                  disabled={id === 'name'}
                  onChange={() => onChange(toggleColumn(layout, id))}
                />
                <span>{column.label || 'Thumbnail'}</span>
                {id === 'name' ? (
                  // `TBL-02`: Name is always shown, so the control says why it
                  // is locked rather than just being inert.
                  <span className="hint">Always shown</span>
                ) : null}
              </label>
              <span className="hint columns-width">{columnWidth(column, layout)} px</span>
              <span className="columns-moves">
                <button
                  type="button"
                  className="ghost"
                  disabled={atStart}
                  aria-label={`Move ${column.label || 'Thumbnail'} left`}
                  onClick={() => onChange(moveColumn(layout, id, -1))}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={atEnd}
                  aria-label={`Move ${column.label || 'Thumbnail'} right`}
                  onClick={() => onChange(moveColumn(layout, id, 1))}
                >
                  →
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="popover-foot">
        <button type="button" className="ghost" onClick={() => onChange(resetLayout(target))}>
          Reset columns
        </button>
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}