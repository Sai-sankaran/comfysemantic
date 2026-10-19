import { useState } from 'react';
import { Button } from '../../components/ui';
import { selectAllInViewLabel, selectionActions } from './exploreModel';
import { actionLabel, actionTooltip } from './flagsModel';
import { copyMenu, type CopyChoice } from '../export/copyMenu';
import { exportMenu, type ExportChoice } from '../export/exportMenu';
import type { ExploreItem, LibraryType } from './exploreTypes';

/**
 * The selection action bar (`GAL-23`).
 *
 * It is a **compact sticky bar directly below the gallery toolbar**, not a
 * floating overlay over image content: the design is explicit that it must not
 * cover the images the user is selecting, and a floating bar would also move
 * every cell by its own height.
 *
 * Every action that cannot apply to the current selection is **disabled with a
 * reason** rather than hidden. A hidden button is indistinguishable from one
 * that has not been built yet, which would make this look broken; a disabled
 * button with a tooltip says "not now, and here is why".
 */
export type SelectionActionBarProps = {
  items: ExploreItem[];
  libraryType: LibraryType;
  /** How many items are loaded, for `GAL-09`'s "Select all N in this view". */
  loadedCount: number;
  /** `null` when the exact count is not known yet. */
  total: number | null;
  onSelectAllInView: () => void;
  onAction: (id: string) => void;
  onClear: () => void;
  /** `CPY-*`: run a copy choice against the selection. */
  onCopy: (choice: CopyChoice) => void;
  /** `EXP-*`: start an export from the selection. */
  onExport: (choice: ExportChoice) => void;
  /**
   * `FLG-03`: whether the selection is hidden, which decides between **Hide**
   * and **Show again**. This is derived from the items rather than a separate
   * "mode", so the button always describes what it will do.
   */
  hiddenMode: 'exclude' | 'only';
};

export function SelectionActionBar({
  items,
  libraryType,
  loadedCount,
  total,
  onSelectAllInView,
  onAction,
  onClear,
  onCopy,
  onExport,
  hiddenMode,
}: SelectionActionBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  if (items.length === 0) return null;

  const mixedKinds = new Set(items.map((i) => i.kind)).size > 1;
  const actions = selectionActions({ count: items.length, libraryType, mixedKinds });
  const allInView = selectAllInViewLabel(loadedCount, total);
  const copyEntries = copyMenu({
    libraryType,
    count: items.length,
    // The gallery's list query carries the positive prompt and tags but not the
    // negative prompt or the embedded ComfyUI JSON. Offering those here would
    // copy nothing and report it as "0 of N", which reads as a library with no
    // data rather than a view that did not load it.
    unavailableFields: ['negative-prompts', 'workflow-json', 'prompt-api-json'],
  });
  // The destination picker and the state machine are done and tested, but the
// writer is not. Enabled entries would open a picker and then do nothing, which
// is exactly the dead end `EXP-*` is being built to avoid — so the menu stays
// gated, with a reason, until the writer lands. `onExport` is already wired so
// flipping `available` back on is a one-line change.
  const exportEntries = exportMenu({ libraryType, count: items.length, available: false });

  return (
    <div className="selection-bar" role="region" aria-label="Selection actions">
      <span className="selection-count">{items.length.toLocaleString()} selected</span>

      {/* `FLG-03`/`FLG-09`: Pick, Reject, Clear flag and Hide/Show again. The
          wording is fixed by the design, so it is not derived from a generic
          "flag" noun. `E.5`'s `browse.advanceAfterFlag` is not offered here; it
          is a setting. */}
      <Button
        variant="secondary"
        onClick={() => onAction('pick')}
        title={actionTooltip('pick')}
      >
        {actionLabel('pick')}
      </Button>
      <Button
        variant="secondary"
        onClick={() => onAction('reject')}
        title={actionTooltip('reject')}
      >
        {actionLabel('reject')}
      </Button>
      <Button
        variant="secondary"
        onClick={() => onAction('clearFlag')}
        title={actionTooltip('clearFlag')}
      >
        {actionLabel('clearFlag')}
      </Button>
      <Button
        variant="secondary"
        onClick={() => onAction(hiddenMode === 'only' ? 'showAgain' : 'hide')}
        title={actionTooltip(hiddenMode === 'only' ? 'showAgain' : 'hide')}
      >
        {actionLabel(hiddenMode === 'only' ? 'showAgain' : 'hide')}
      </Button>

      {actions.map((action, index) => {
        if (action.id === 'clear') {
          return (
            <Button key={action.id} variant="ghost" onClick={onClear} className="selection-clear">
              {action.label}
            </Button>
          );
        }
        // `Rate` and `Favourite` open a small choice rather than applying
        // directly, so a mis-click on a hundred items is recoverable.
        const opensMenu = action.id === 'rate' || action.id === 'favourite';
        return (
          <span key={action.id} className="selection-action">
            <Button
              variant="secondary"
              disabled={!action.enabled}
              title={action.reason}
              aria-describedby={action.reason ? `${action.id}-reason` : undefined}
              onClick={() => (opensMenu ? setOpenMenu(openMenu === index ? null : index) : onAction(action.id))}
            >
              {action.label}
            </Button>
            {action.reason ? (
              <span id={`${action.id}-reason`} className="sr-only">
                {action.reason}
              </span>
            ) : null}
            {opensMenu && openMenu === index ? (
              <span className="selection-menu" role="menu" aria-label={action.label}>
                {action.id === 'rate'
                  ? [0, 1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        role="menuitemradio"
                        aria-checked={false}
                        onClick={() => {
                          onAction(`rate:${star}`);
                          setOpenMenu(null);
                        }}
                      >
                        {star === 0 ? 'No rating' : `${'★'.repeat(star)}`}
                      </button>
                    ))
                  : [true, false].map((value) => (
                      <button
                        key={String(value)}
                        type="button"
                        role="menuitemradio"
                        aria-checked={false}
                        onClick={() => {
                          onAction(`favourite:${value}`);
                          setOpenMenu(null);
                        }}
                      >
                        {value ? 'Favourite' : 'Not a favourite'}
                      </button>
                    ))}
              </span>
            ) : null}
          </span>
        );
      })}

      {/* `CPY-01..CPY-08`: the copy menu. Entries that cannot apply are disabled
          with a reason, matching the rule the rest of this bar already follows. */}
      <span className="selection-action">
        <Button
          variant="secondary"
          aria-haspopup="menu"
          aria-expanded={copyOpen}
          onClick={() => setCopyOpen((v) => !v)}
          disabled={items.length === 0}
        >
          Copy as…
        </Button>
        {copyOpen ? (
          <span className="selection-menu" role="menu" aria-label="Copy as">
            {copyEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                disabled={!entry.available}
                title={entry.reason}
                onClick={() => {
                  onCopy(entry.id);
                  setCopyOpen(false);
                }}
              >
                {entry.label}
              </button>
            ))}
          </span>
        ) : null}
      </span>

      {/* `EXP-01..EXP-06`: the export menu. */}
      <span className="selection-action">
        <Button
          variant="secondary"
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          onClick={() => setExportOpen((v) => !v)}
          disabled={items.length === 0}
        >
          Export…
        </Button>
        {exportOpen ? (
          <span className="selection-menu" role="menu" aria-label="Export">
            {exportEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                disabled={!entry.available}
                title={entry.reason}
                onClick={() => {
                  onExport(entry.id);
                  setExportOpen(false);
                }}
              >
                {entry.label}
              </button>
            ))}
          </span>
        ) : null}
      </span>

      {allInView ? (
        <Button variant="ghost" onClick={onSelectAllInView} title={allInView}>
          {allInView}
        </Button>
      ) : null}
    </div>
  );
}