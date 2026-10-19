import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  /** Current checked state. */
  checked: boolean;
  /** Called with the *next* state, so callers do not re-derive it. */
  onChange: (checked: boolean) => void;
  /** Visible label text. */
  label?: ReactNode;
  /**
   * Composite content (a stage row, a chip). Rendered instead of `label` when
   * present, so a row with extra children (a pill, a nested button) still uses
   * the one checkbox control.
   */
  children?: ReactNode;
  /** Accessible name when there is no visible label (e.g. a table row checkbox). */
  ariaLabel?: string;
  disabled?: boolean;
  name?: string;
  title?: string;
  /**
   * Wrapper class. Defaults to the shared `checkbox` wrapper; composite rows
   * pass their own class and keep their existing layout.
   */
  className?: string;
  /** Display-only tri-state dash (the "select all" header, a partial selection). */
  indeterminate?: boolean;
};

/**
 * The single checkbox control (CTL-01/CTL-02). It is a real `<input
 * type="checkbox">` for native keyboard, label and form semantics, but it is
 * drawn by CSS (App.css) rather than left as the browser default.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  children,
  ariaLabel,
  disabled,
  name,
  title,
  className = 'checkbox',
  indeterminate,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

  // `indeterminate` is a DOM property with no HTML attribute, so it can only be
  // set imperatively. A fully-checked box shows the tick, never the dash.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked;
  }, [indeterminate, checked]);

  return (
    <label className={className} title={title}>
      <input
        ref={ref}
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children ?? (label != null ? <span className="checkbox-label">{label}</span> : null)}
    </label>
  );
}
