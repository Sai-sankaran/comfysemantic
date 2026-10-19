type Props = {
  value?: number | null;
  indeterminate?: boolean;
  label?: string;
};

export function ProgressBar({ value, indeterminate, label }: Props) {
  const pct = typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      className="progress-track"
    >
      {indeterminate || pct === null ? (
        <div className="progress-indeterminate-fill" />
      ) : (
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      )}
    </div>
  );
}