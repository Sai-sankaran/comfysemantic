import { useId } from 'react';

type Props = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Step between arrow-key moves. */
  step?: number;
  /** Renders a unit or suffix in the readout, e.g. `px` or `%`. */
  unit?: string;
  /** Accessible name; required, because a bare track has no visible label. */
  ariaLabel: string;
  disabled?: boolean;
  /** Hide the numeric readout (the value is still announced via aria-valuetext). */
  hideValue?: boolean;
};

/**
 * The slider control (design §10.6).
 *
 * A 4 px track with a 14 px thumb and a value readout. `←`/`→` move by one step
 * and `PageUp`/`PageDown` by five, as the design specifies; a native
 * `<input type="range">` already gives `role="slider"`, the correct value
 * semantics and arrow handling, so only the PageUp/PageDown multiplier is added.
 * (`CTL-02` bans the native *select* and browser-default *checkbox*; a range input
 * is not on that list, and using it is what keeps the control accessible.)
 */
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
  ariaLabel,
  disabled,
  hideValue,
}: Props) {
  const id = useId();
  const text = `${value}${unit}`;

  return (
    <div className="slider-field">
      <input
        id={id}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-valuetext={text}
        onChange={(e) => onChange(Number(e.target.value))}
        onKeyDown={(e) => {
          // PageUp/PageDown move five steps in this design; the native range
          // input uses them for a larger, browser-defined jump.
          if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
          e.preventDefault();
          const delta = e.key === 'PageUp' ? step * 5 : -step * 5;
          const next = Math.min(max, Math.max(min, value + delta));
          if (next !== value) onChange(next);
        }}
      />
      {hideValue ? null : (
        <span className="slider-value" aria-hidden="true">
          {text}
        </span>
      )}
    </div>
  );
}