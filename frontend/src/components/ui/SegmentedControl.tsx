import type { ReactNode } from 'react';

type Option<T extends string> = { value: T; label: string; disabled?: boolean };

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: Array<Option<T>>;
  'aria-label'?: string;
  children?: ReactNode;
};

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
}: Props<T>) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={value === opt.value ? 'active' : ''}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}