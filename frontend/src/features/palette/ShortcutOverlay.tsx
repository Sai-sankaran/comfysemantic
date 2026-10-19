import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Input } from '../../components/ui';
import {
  actionShortcuts,
  formatShortcut,
  type ActionContextName,
  type ActionRegistry,
  type AppAction,
} from '../../app/actions';

type Props = {
  open: boolean;
  onClose: () => void;
  registry: ActionRegistry;
  context: ActionContextName;
};

type Row = { id: string; label: string; keys: string };

function groupOf(action: AppAction): string {
  if (action.contexts.includes('global')) return 'Global';
  const first = action.contexts[0] ?? 'global';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * The shortcuts overlay (`NAV-25`): `?` opens a read-only, searchable list of
 * every registered shortcut. It is generated from the registry — never
 * hand-written — so a shortcut can never appear here that the app does not
 * actually implement.
 */
export function ShortcutOverlay({ open, onClose, registry, context }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const rows = registry
      .bySurface(context, 'overlay')
      .map((a) => ({ action: a, specs: actionShortcuts(a) }))
      .filter((r) => r.specs.length > 0)
      .filter((r) => {
        if (!trimmed) return true;
        return (
          r.action.label.toLowerCase().includes(trimmed) ||
          r.specs.some((s) => formatShortcut(s).toLowerCase().includes(trimmed))
        );
      });
    const order: string[] = [];
    const byGroup = new Map<string, Row[]>();
    for (const { action: a, specs } of rows) {
      const group = groupOf(a);
      if (!byGroup.has(group)) {
        byGroup.set(group, []);
        order.push(group);
      }
      // An action may own more than one key (Settings is `Ctrl+5` and `Ctrl+,`).
      byGroup
        .get(group)!
        .push({ id: a.id, label: a.label, keys: specs.map((s) => formatShortcut(s)).join('  ') });
    }
    return order.map((group) => ({ group, rows: byGroup.get(group)! }));
  }, [registry, context, trimmed]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const count = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <div className="shortcuts">
        <Input
          ref={inputRef}
          aria-label="Filter shortcuts"
          placeholder={'Filter shortcuts\u2026'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {count === 0 ? (
          <p className="hint">No shortcuts match \u201c{query.trim()}\u201d.</p>
        ) : (
          groups.map((g) => (
            <section key={g.group} className="shortcuts-group">
              <h3>{g.group}</h3>
              <ul className="shortcuts-list">
                {g.rows.map((row) => (
                  <li key={row.id}>
                    <span>{row.label}</span>
                    <kbd className="palette-kbd">{row.keys}</kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </Dialog>
  );
}
