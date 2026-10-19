import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

type Props = {
  /** The text shown in the bubble. */
  label: ReactNode;
  /** Keyboard shortcut appended, e.g. `Compare (C)` (`NAV-43`). */
  shortcut?: string;
  children: ReactElement;
  /** Hide the bubble entirely (a control that has no explanation to give). */
  disabled?: boolean;
  /** Delay before a hover shows the bubble; the design says 600 ms. */
  delay?: number;
};

/**
 * The tooltip control (design §10.6, `NAV-43`).
 *
 * 600 ms hover delay, instant on keyboard focus, maximum width 280 px, and the
 * label may carry a shortcut ("Compare (C)").
 *
 * The bubble is a real `role="tooltip"` referenced by `aria-describedby`, so it is
 * announced without stealing focus, and `Escape` dismisses it. It is positioned
 * below the control with CSS rather than measured, which keeps it out of the
 * layout; a control near the bottom of the window is the known edge of that
 * approach and is called out in the CSS.
 */
export function Tooltip({ label, shortcut, children, disabled, delay = 600 }: Props) {
  const id = useId();
  const timer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);

  /** The design says 600 ms; keyboard focus must not wait for it. */
  const scheduleOpen = useCallback(() => {
    if (disabled) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  }, [delay, disabled]);

  const hide = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setOpen(false);
  }, []);

  // A pending hover timer must not open the bubble over a control the pointer has
  // already left.
  useEffect(() => () => hide(), [hide]);

  // `children` is typed as a ReactElement, but a caller can still pass anything at
  // runtime. The element's own handlers are read here and called alongside ours,
  // so wrapping a control keeps the behaviour it already had — it is additive,
  // not a replacement.
  const child = isValidElement(children)
    ? (children as ReactElement<Record<string, unknown>>)
    : null;
  const own = child?.props ?? {};
  const existing = (own['aria-describedby'] as string | undefined) ?? '';

  // The caller's handler is captured before the clone below replaces it, so the
  // two do not recurse into each other.
  const their = own as {
    onMouseEnter?: () => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onMouseLeave?: () => void;
    onKeyDown?: (event: KeyboardEvent) => void;
  };

  const onHoverEnter = useCallback(() => {
    their.onMouseEnter?.();
    scheduleOpen();
    // `their` is a fresh object each render, but the handlers it holds are the
    // caller's own stable functions in practice; excluding it keeps the identity
    // of this callback stable without silently dropping a handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleOpen]);

  const onHoverLeave = useCallback(() => {
    their.onMouseLeave?.();
    hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hide]);

  const onFocusIn = useCallback(() => {
    their.onFocus?.();
    // Instant on keyboard focus, as the design requires: the hover delay exists to
    // stop a bubble appearing under a pointer that is only passing over.
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFocusOut = useCallback(() => {
    their.onBlur?.();
    hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hide]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      their.onKeyDown?.(event);
      if (event.key === 'Escape') hide();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hide],
  );

  const trigger = child
    ? cloneElement(child, {
        'aria-describedby': open ? `${existing} ${id}`.trim() : existing || undefined,
        onMouseEnter: onHoverEnter,
        onMouseLeave: onHoverLeave,
        onFocus: onFocusIn,
        onBlur: onFocusOut,
        onKeyDown,
      })
    : children;

  return (
    <span className="tooltip-anchor">
      {trigger}
      {open && !disabled ? (
        <span role="tooltip" id={id} className="tooltip-bubble">
          <span className="tooltip-label">{label}</span>
          {shortcut ? <kbd className="tooltip-shortcut">{shortcut}</kbd> : null}
        </span>
      ) : null}
    </span>
  );
}