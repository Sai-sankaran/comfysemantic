import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Dialog, Input } from '../../components/ui';
import {
  actionShortcuts,
  availability,
  formatShortcut,
  type ActionContext,
  type ActionContextName,
  type ActionRegistry,
} from '../../app/actions';

type Props = {
  open: boolean;
  onClose: () => void;
  registry: ActionRegistry;
  context: ActionContextName;
  actionContext: ActionContext;
};

type Row = {
  key: string;
  label: string;
  disabled?: boolean;
  reason?: string;
  shortcut?: string;
  run: () => void;
};

const LISTBOX_ID = 'palette-listbox';

/** DOM id for a row, so the input can point at the highlighted one. */
function optionId(row: Row): string {
  return `palette-opt-${row.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

/**
 * The command palette (`NAV-24`).
 *
 * It lists every action the registry offers in the current context — disabled
 * ones greyed with their reason — and, when text is typed, puts
 * `Search for "<text>" in <library>` first, preserving the old `Ctrl+K` habit.
 * Nothing here is hand-listed: the rows come from the registry.
 */
export function CommandPalette({ open, onClose, registry, context, actionContext }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();

  const actions = useMemo(
    () => registry.bySurface(context, 'palette'),
    [registry, context],
  );

  const rows = useMemo<Row[]>(() => {
    const q = trimmed.toLowerCase();
    const matched = actions
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .map<Row>((a) => {
        const state = availability(a, actionContext);
        return {
          key: `action:${a.id}`,
          label: a.label,
          disabled: !state.enabled,
          reason: state.reason,
          shortcut: actionShortcuts(a).map((s) => formatShortcut(s)).join('  ') || undefined,
          run: () => void a.run(actionContext),
        };
      });
    if (!trimmed) return matched;
    const target = actionContext.activeLibraryName ?? 'all libraries';
    return [
      {
        key: 'search',
        label: `Search for \u201c${trimmed}\u201d in ${target}`,
        run: () => actionContext.submitSearch(trimmed),
      },
      ...matched,
    ];
  }, [actions, trimmed, actionContext]);

  // A new query (or a reopen) restarts the highlight at the top. Deriving this
  // during render rather than in an effect avoids a second render pass.
  const [active, setActive] = useState(0);
  const [resetKey, setResetKey] = useState(`${String(open)}|${trimmed}`);
  const nextResetKey = `${String(open)}|${trimmed}`;
  if (resetKey !== nextResetKey) {
    setResetKey(nextResetKey);
    setActive(0);
  }

  // Runs after Dialog's own autofocus, so the search box wins.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const choose = (row: Row | undefined) => {
    if (!row || row.disabled) return;
    onClose();
    row.run();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(rows[active]);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Command palette">
      <div className="palette">
        <Input
          ref={inputRef}
          aria-label="Command palette search"
          role="combobox"
          aria-expanded
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={rows[active] ? optionId(rows[active]) : undefined}
          placeholder={'Type a command\u2026'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul className="palette-list" id={LISTBOX_ID} role="listbox" aria-label="Commands">
          {rows.map((row, i) => (
            <li
              key={row.key}
              id={optionId(row)}
              role="option"
              aria-selected={i === active}
              aria-disabled={row.disabled || undefined}
              className={[
                'palette-item',
                i === active ? 'active' : '',
                row.disabled ? 'disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(row);
              }}
            >
              <span className="palette-label">{row.label}</span>
              {row.disabled && row.reason ? (
                <span className="palette-reason">{row.reason}</span>
              ) : null}
              {row.shortcut ? <kbd className="palette-kbd">{row.shortcut}</kbd> : null}
            </li>
          ))}
          {rows.length === 0 ? <li className="palette-empty">No matching commands</li> : null}
        </ul>
      </div>
    </Dialog>
  );
}
