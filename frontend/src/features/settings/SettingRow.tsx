import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Input,
  Popover,
  PopoverItem,
  SegmentedControl,
  Select,
  Slider,
  Switch,
  Textarea,
} from '../../components/ui';
import { optionLabel, validateSetting, type SettingScope, type SettingValue } from '../../settings/registry';
import { originDescription, originLabel, sameValue, type ResolvedSetting } from '../../settings/resolver';

/**
 * One settings row (design `SET-03`).
 *
 * The documented anatomy: label (Body, weight 500), description (Body small,
 * `--text-2`), the control right-aligned at widths ≥ 640 px, a scope chip showing
 * the current scope with an **Override for this library… / Override for this
 * folder…** menu for the allowed scopes, a **modified dot** when the value differs
 * from its default, a **Reset** button, and a **Requires restart** chip when
 * applicable.
 *
 * The control is chosen from the entry's `type`, which is what makes the registry
 * the single source (`SET-01`) rather than each screen hand-picking a widget.
 */

export type SettingRowProps = {
  resolved: ResolvedSetting;
  /** Apply a change; returns the validation outcome so a bad value can be shown. */
  onChange: (value: unknown) => { ok: true } | { ok: false; reason: string };
  onReset: () => void;
  /** Change a specific scope's override rather than the effective value. */
  onOverride: (scope: SettingScope, value: unknown) => void;
  /** False while library/folder scopes are not persisted yet. */
  scopeWriteEnabled: boolean;
  /** Highlighted by the settings search (`SET-05`, 1.5 s). */
  highlighted?: boolean;
  /** Nested rows are indented, e.g. the `comics.flag.*` group. */
  nested?: boolean;
  /**
   * Extra content rendered under the control — currently the `SET-07` profile
   * affordance. The row does not know about profiles itself, so the screen
   * supplies whatever applies to this setting.
   */
  below?: ReactNode;
};

export function SettingRow({
  resolved,
  onChange,
  onReset,
  onOverride,
  scopeWriteEnabled,
  highlighted,
  nested,
  below,
}: SettingRowProps) {
  const { entry, value, modified } = resolved;
  // The error is tagged with the value it was raised for, so it disappears by
  // itself when the value changes (a reset, or a narrower-scope override taking
  // effect). Deriving it during render avoids a state-clearing effect.
  const [raised, setRaised] = useState<{ for: SettingValue; text: string } | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const error = raised && sameValue(raised.for, value) ? raised.text : null;
  const raise = (reason: string) => setRaised({ for: value, text: reason });

  useEffect(() => {
    if (!highlighted || !rowRef.current) return;
    rowRef.current.scrollIntoView({ block: 'center' });
  }, [highlighted]);

  const apply = (next: unknown) => {
    const outcome = onChange(next);
    if (outcome.ok) setRaised(null);
    else raise(`That value ${outcome.reason}.`);
  };

  const jsonText = useMemo(
    () => (entry.type === 'json' ? JSON.stringify(value ?? {}, null, 2) : ''),
    [entry.type, value],
  );

  const control = () => {
    switch (entry.type) {
      case 'bool':
        // `CTL-04`: an on/off setting uses the switch, not a checkbox.
        return (
          <Switch
            checked={Boolean(value)}
            ariaLabel={entry.label}
            onChange={apply}
          />
        );

      case 'enum': {
        const options = entry.constraints?.options ?? entry.options ?? [];
        // Two choices read better as a segmented control than as a dropdown.
        if (options.length === 2) {
          return (
            <SegmentedControl
              aria-label={entry.label}
              value={String(value)}
              onChange={apply}
              options={options.map((o) => ({ value: o, label: optionLabel(o) }))}
            />
          );
        }
        return (
          <Select
            aria-label={entry.label}
            value={String(value)}
            onChange={(e) => apply(e.target.value)}
            options={options.map((o) => ({ value: o, label: optionLabel(o) }))}
          />
        );
      }

      case 'int':
      case 'float': {
        const c = entry.constraints;
        const numeric = typeof value === 'number' ? value : 0;
        if (c?.min !== undefined && c.max !== undefined) {
          return (
            <Slider
              ariaLabel={entry.label}
              min={c.min}
              max={c.max}
              step={c.step ?? 1}
              value={numeric}
              unit={entry.key === 'appearance.textScale' ? '%' : entry.key === 'browse.thumbSize' ? ' px' : ''}
              onChange={apply}
            />
          );
        }
        return (
          <Input
            aria-label={entry.label}
            value={String(value ?? '')}
            onChange={(e) => apply(e.target.value)}
            className="setting-number"
          />
        );
      }

      case 'json':
        return (
          <Textarea
            label={`${entry.label} (JSON)`}
            rows={5}
            value={jsonText}
            error={error ?? undefined}
            onChange={(text) => {
              const outcome = onChange(text);
              if (outcome.ok) setRaised(null);
              else raise(`That JSON ${outcome.reason}.`);
            }}
          />
        );

      case 'path':
        return (
          <Input
            aria-label={entry.label}
            value={String(value ?? '')}
            placeholder="Detected automatically"
            onChange={(e) => {
              apply(e.target.value);
            }}
          />
        );

      case 'hex':
        return (
          <Input
            aria-label={entry.label}
            value={String(value ?? '')}
            onChange={(e) => {
              const result = validateSetting(entry, e.target.value);
              if (result.ok) {
                setRaised(null);
                apply(e.target.value);
              } else {
                raise(`That colour ${result.reason}.`);
              }
            }}
          />
        );

      case 'list':
        return (
          <Input
            aria-label={entry.label}
            value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
            placeholder="Comma-separated"
            onChange={(e) => {
              apply(e.target.value);
            }}
          />
        );

      case 'id':
      case 'string':
      default:
        return (
          <Input
            aria-label={entry.label}
            value={String(value ?? '')}
            onChange={(e) => {
              apply(e.target.value);
            }}
          />
        );
    }
  };

  const canOverrideLibrary = entry.allowedScopes.includes('library');
  const canOverrideFolder = entry.allowedScopes.includes('folder');
  const scopeReason = 'Library and folder overrides arrive with the settings-registry integration';

  return (
    <div
      ref={rowRef}
      className={[
        'setting-row',
        nested ? 'nested' : '',
        highlighted ? 'highlighted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-setting={entry.key}
    >
      <div className="setting-row-text">
        <div className="setting-row-label">
          {modified ? (
            <span className="setting-modified" title="Changed from the default" aria-label="Changed from the default">
              &bull;
            </span>
          ) : null}
          <span>{entry.label}</span>
          {entry.restartRequired ? (
            <span className="chip chip-warn" title="Applies after the app restarts">
              Requires restart
            </span>
          ) : null}
        </div>
        <p className="setting-row-description">{entry.description}</p>
        <p className="setting-row-key mono">{entry.key}</p>
        {error ? (
          <p className="setting-row-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="setting-row-control">
        {control()}

        <div className="setting-row-meta">
          <Popover
            open={scopeOpen}
            onClose={() => setScopeOpen(false)}
            align="end"
            label={`${entry.label} scope`}
            trigger={
              <button
              type="button"
              className="scope-chip"
              aria-haspopup="menu"
              // The chip's text is a value plus a sentence; give it a stable name
              // that says what opening it does.
              aria-label={`${entry.label} scope`}
              onClick={() => setScopeOpen((v) => !v)}
            >
                <span className="scope-chip-value">{originLabel(resolved)}</span>
                <span className="scope-chip-origin">{originDescription(resolved)}</span>
              </button>
            }
          >
            <PopoverItem
              disabled={!scopeWriteEnabled}
              reason={scopeWriteEnabled ? undefined : scopeReason}
              selected={resolved.origin === 'app'}
              onClick={() => onOverride('app', value)}
            >
              Use the app value
            </PopoverItem>
            <PopoverItem
              disabled={!scopeWriteEnabled || !canOverrideLibrary}
              reason={
                !canOverrideLibrary
                  ? `${entry.label} is an app-only setting`
                  : scopeWriteEnabled
                    ? undefined
                    : scopeReason
              }
              selected={resolved.origin === 'library'}
              onClick={() => onOverride('library', value)}
            >
              Override for this library…
            </PopoverItem>
            <PopoverItem
              disabled={!scopeWriteEnabled || !canOverrideFolder}
              reason={
                !canOverrideFolder
                  ? `${entry.label} cannot be overridden per folder`
                  : scopeWriteEnabled
                    ? undefined
                    : scopeReason
              }
              selected={resolved.origin === 'folder'}
              onClick={() => onOverride('folder', value)}
            >
              Override for this folder…
            </PopoverItem>
          </Popover>

          <Button2Reset onReset={onReset} canReset={modified || resolved.overriddenAt.length > 0} />
        </div>
        {below}
      </div>
    </div>
  );
}

/** The `SET-03` Reset button: present always, disabled when it would do nothing. */
function Button2Reset({
  onReset,
  canReset,
}: {
  onReset: () => void;
  canReset: boolean;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={!canReset}
      onClick={onReset}
      title={canReset ? 'Reset to default' : 'Already the default'}
    >
      Reset
    </button>
  );
}