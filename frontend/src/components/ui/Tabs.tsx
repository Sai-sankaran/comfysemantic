import { useId, useRef, type ReactNode } from 'react';

export type TabItem<T extends string> = {
  id: T;
  label: string;
  disabled?: boolean;
};

type Props<T extends string> = {
  items: Array<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Accessible name for the tab list. */
  'aria-label': string;
  children?: (id: T) => ReactNode;
};

/**
 * The tabs control (design §10.6).
 *
 * Underline style: the selected tab has a 2 px accent underline and `--text-1`;
 * hover is `--bg-2`. `←→` move between tabs (and skip a disabled one), and Home/End
 * jump to the ends.
 *
 * It is the ARIA **tabs** pattern: the list owns arrow-key movement, each tab is a
 * `tab`, and only the selected tab is in the tab order. That is the difference from
 * a row of buttons, and it is why the rail's workspace strip uses this instead of
 * hand-written tab markup (`CTL-01`).
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  'aria-label': ariaLabel,
  children,
}: Props<T>) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const enabled = items.filter((i) => !i.disabled);
  const move = (from: T, delta: 1 | -1) => {
    if (enabled.length === 0) return;
    const at = enabled.findIndex((i) => i.id === from);
    const next = enabled[(at + delta + enabled.length) % enabled.length];
    if (!next) return;
    focusTab(next.id);
  };

  /**
   * Select a tab and move focus to it.
   *
   * Focus has to follow the selection: in the ARIA tabs pattern a second arrow
   * press arrives from whichever tab is focused, and without this the keystroke
   * would come from the tab the user already left. Every tab is always rendered,
   * so moving focus is not a render race.
   */
  const focusTab = (id: T | undefined) => {
    if (!id) return;
    onChange(id);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${baseId}-${id}`)}`)
      ?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel} ref={listRef}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${baseId}-${item.id}`}
            className={`tab${selected ? ' active' : ''}`}
            aria-selected={selected}
            aria-controls={`${baseId}-${item.id}-panel`}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                move(item.id, 1);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                move(item.id, -1);
              } else if (e.key === 'Home') {
                e.preventDefault();
                focusTab(enabled[0]?.id);
              } else if (e.key === 'End') {
                e.preventDefault();
                focusTab(enabled[enabled.length - 1]?.id);
              }
            }}
          >
            {item.label}
          </button>
        );
      })}
      {children
        ? items.map((item) =>
            item.id === value ? (
              <div
                key={`${item.id}-panel`}
                role="tabpanel"
                id={`${baseId}-${item.id}-panel`}
                aria-labelledby={`${baseId}-${item.id}`}
                className="tab-panel"
              >
                {children(item.id)}
              </div>
            ) : null,
          )
        : null}
    </div>
  );
}