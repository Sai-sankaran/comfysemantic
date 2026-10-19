import { useId } from 'react';

type Props = {
  /** Current state. */
  checked: boolean;
  /** Called with the next state, so callers do not re-derive it. */
  onChange: (checked: boolean) => void;
  /** Visible label text, rendered beside the track. */
  label?: string;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
  disabled?: boolean;
  /**
   * Rendered when the setting needs an explanation. `CTL-04`: a switch is for a
   * setting that applies immediately; the helper text says what it does.
   */
  description?: string;
  id?: string;
};

/**
 * The switch control (design §10.6, `CTL-04`).
 *
 * 32 × 18 px, an off `--bg-3` track, an accent track when on, a 14 px knob.
 * `role="switch"` with `aria-checked`, so assistive technology reports it as on
 * and off rather than as a button.
 *
 * `CTL-04`: **switches are for on/off settings; checkboxes are for choosing items
 * inside a form.** The Settings screen uses this one for booleans and keeps the
 * `<Checkbox>` for filter lists, tree selection and stage rows.
 */
export function Switch({
  checked,
  onChange,
  label,
  ariaLabel,
  disabled,
  description,
  id,
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const textId = description ? `${inputId}-description` : undefined;

  return (
    <div className="switch-field">
      <button
        type="button"
        id={inputId}
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        aria-describedby={textId}
        disabled={disabled}
        className={`switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" aria-hidden="true" />
      </button>
      {label ? (
        <label className="switch-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      {description ? (
        <span className="switch-description" id={textId}>
          {description}
        </span>
      ) : null}
    </div>
  );
}