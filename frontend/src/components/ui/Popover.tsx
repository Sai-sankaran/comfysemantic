import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

/**
 * An anchored popover — the shared shell behind every menu, the library switcher,
 * the View menu and the System popover (design §10.6, `CTL-01`: "a control that is
 * not in the library MUST NOT be used").
 *
 * It is deliberately *anchored, not portalled*: the panel is positioned against
 * its trigger inside a `position: relative` wrapper. That keeps it inside the
 * top bar's stacking context without measuring the trigger's document position,
 * at the cost of clipping inside an `overflow: hidden` ancestor — the same known
 * limitation `<Select>` has, and the reason a shared portal is still owed.
 *
 * Behaviour: outside pointer-down and `Escape` both close it, and focus returns to
 * the trigger so the shortcut that opened it can be pressed again.
 */
export type PopoverAlign = 'start' | 'end';

export type PopoverProps = {
  open: boolean;
  onClose: () => void;
  /** The control that opens the popover. */
  trigger: ReactNode;
  /** The floating layer. Only rendered while `open`. */
  children: ReactNode;
  align?: PopoverAlign;
  role?: 'menu' | 'dialog';
  /** Accessible name for `role="dialog"`. */
  label?: string;
  className?: string;
  panelClassName?: string;
  /** Ref the caller can focus to return the caret to the trigger on close. */
  triggerRef?: RefObject<HTMLElement | null>;
};

export function Popover({
  open,
  onClose,
  trigger,
  children,
  align = 'start',
  role = 'menu',
  label,
  className,
  panelClassName,
  triggerRef,
}: PopoverProps) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
      triggerRef?.current?.focus();
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, onClose, triggerRef]);

  return (
    <span className={className ? `popover-anchor ${className}` : 'popover-anchor'} ref={rootRef}>
      {trigger}
      {open ? (
        <span
          className={panelClassName ? `popover-panel ${panelClassName}` : 'popover-panel'}
          data-align={align}
          role={role}
          aria-label={label}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

/**
 * One row of a popover menu. A disabled row stays visible and carries the reason
 * in its tooltip rather than disappearing, so the menu shape does not change
 * depending on state (design §10.6, `NAV-43`).
 */
export function PopoverItem({
  children,
  onClick,
  disabled,
  reason,
  shortcut,
  selected,
  indent = 0,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  reason?: string;
  shortcut?: string;
  selected?: boolean;
  indent?: number;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={
        [selected ? 'menu-item-selected' : '', disabled ? 'menu-item-disabled' : '']
          .filter(Boolean)
          .join(' ') || undefined
      }
      aria-disabled={disabled ? true : undefined}
      aria-current={selected ? true : undefined}
      title={disabled ? reason : undefined}
      style={indent ? { paddingLeft: `calc(12px + ${indent * 16}px)` } : undefined}
      onClick={() => {
        if (disabled) return;
        onClick?.();
      }}
    >
      <span className="menu-item-label">{children}</span>
      {shortcut ? <kbd className="menu-shortcut">{shortcut}</kbd> : null}
    </button>
  );
}

/** A non-interactive heading inside a popover. */
export function PopoverHeading({ children }: { children: ReactNode }) {
  return <div className="menu-heading">{children}</div>;
}

/** A 1 px separator (`NAV` menus use them between groups). */
export function PopoverSeparator() {
  return <div className="menu-separator" role="separator" />;
}