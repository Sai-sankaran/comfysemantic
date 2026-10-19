import { useId, type TextareaHTMLAttributes } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Visible caption above the field. */
  label?: string;
  /** Helper text below the field. */
  description?: string;
  /** Error text; the border turns to `--danger` when present. */
  error?: string;
  /** Visible rows; the field resizes vertically only. */
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  className?: string;
  id?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows' | 'className'>;

/**
 * The textarea control (design §10.6).
 *
 * As the text input, but vertically resizable only — a settings or JSON value
 * should not be re-flowed horizontally, because that silently reflows the
 * content the user is reading.
 *
 * This exists because two screens were using a raw `<textarea>`, which `CTL-01`
 * ("a control that is not in the library MUST NOT be used") does not allow.
 */
export function Textarea({
  value,
  onChange,
  label,
  description,
  error,
  rows = 4,
  placeholder,
  disabled,
  name,
  className,
  id,
  ...rest
}: Props) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`textarea-field${className ? ` ${className}` : ''}`}>
      {label ? (
        <label className="field-label" htmlFor={fieldId}>
          {label}
        </label>
      ) : null}
      <textarea
        {...rest}
        id={fieldId}
        name={name}
        className={`field${error ? ' field-error' : ''}`}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      {description ? (
        <span className="field-hint" id={descriptionId}>
          {description}
        </span>
      ) : null}
      {error ? (
        <span className="field-error-text" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}