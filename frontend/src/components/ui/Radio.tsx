import { useId, type ReactNode } from 'react';

export type RadioOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
  /** Shown under the label, e.g. what the choice means. */
  description?: ReactNode;
};

type Props<T extends string> = {
  /** The group name. Radios with the same name are one group. */
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<RadioOption<T>>;
  'aria-label'?: string;
  disabled?: boolean;
  /** Lays the options out in a row instead of a column. */
  inline?: boolean;
};

/**
 * The radio control (design §10.6): a checkbox drawn circular with an 8 px inner
 * dot.
 *
 * A real `<input type="radio">` for native keyboard and group semantics — arrow
 * keys move and select within the group — but drawn by CSS rather than left as
 * the browser default (`CTL-02`), which five call sites were doing before this.
 */
export function Radio<T extends string>({
  name,
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
  disabled,
  inline,
}: Props<T>) {
  const groupId = useId();

  return (
    <div
      className={`radio-group${inline ? ' inline' : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const optionId = `${groupId}-${option.value}`;
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={`radio${selected ? ' selected' : ''}`}
            htmlFor={optionId}
          >
            <input
              type="radio"
              id={optionId}
              name={name}
              value={option.value}
              checked={selected}
              disabled={disabled || option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="radio-text">
              <span className="radio-label">{option.label}</span>
              {option.description ? (
                <span className="radio-description">{option.description}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}