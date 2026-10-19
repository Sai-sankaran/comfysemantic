import { Fragment, useCallback, useMemo, type ReactNode } from 'react';
import { Checkbox } from './Checkbox';

export type TreeNode = {
  id: string;
  label: string;
  /** Child folders. A node with children may be collapsed. */
  children?: TreeNode[];
  /** The §5.7 status icon's tooltip, e.g. "Not processed". */
  status?: { label: string; tone: 'idle' | 'partial' | 'done' | 'failed' | 'stale' } | null;
  /** Items in this subtree (`LIB-06`'s recursive item count). */
  count?: number;
  /** The checkbox shows this in Select mode instead of the checkbox. */
  disabled?: boolean;
};

type CommonProps = {
  nodes: TreeNode[];
  /** Nodes whose state is unknown in Select mode are shown as mixed, not checked. */
  'aria-label': string;
  defaultExpanded?: readonly string[];
  /** Pin affordance (`LIB-06`): a star/fill control per folder. */
  pinnedIds?: readonly string[];
  onTogglePin?: (id: string) => void;
};

/**
 * The mode decides the shape of `value`/`onChange`, so the component can be a
 * discriminated union rather than a pair of loosely-typed unions that every caller
 * would have to cast.
 */
export type TreeProps = CommonProps &
  (
    | { mode: 'browse'; value: string | null; onChange: (id: string) => void }
    | { mode: 'select'; value: readonly string[]; onChange: (ids: string[]) => void }
  );

/** The §5.7 vocabulary, so the tree never invents its own wording. */
const STATUS_TEXT: Record<string, string> = {
  idle: 'Not processed',
  partial: 'Partial',
  done: 'Done',
  failed: 'Has failures',
  stale: 'Stale',
};

/**
 * The folder tree (design §10.6 Tree, `LIB-06`, `LIB-07`, `GAL-21`).
 *
 * Row height follows density, indentation is 16 px per level, a selected row is
 * `--bg-3` with a 2 px accent bar at its left edge, and each row carries the
 * recursive item count plus a status icon whose tooltip uses the shared §5.7
 * wording. Keyboard: `↑↓` move, `→`/`←` expand and collapse, `Enter` selects, and
 * type-ahead jumps to the first node whose name starts with what was typed.
 *
 * Two modes, and the distinction is load-bearing (`LIB-08`): **Browse** is
 * single-select, **Select** is tri-state checkboxes where checking a folder checks
 * its descendants and a partially checked parent shows the mixed state. Selecting
 * in one never changes the other, and neither changes the active library.
 */
export function Tree(props: TreeProps) {
  const { nodes, mode, value, onChange, defaultExpanded = [], pinnedIds = [], onTogglePin } = props;
  const checked = useMemo(() => new Set(mode === 'select' ? [...value] : []), [mode, value]);
  const selected = mode === 'browse' ? value : null;
  const expanded = new Set(defaultExpanded);

  // Tri-state: a parent is checked when every descendant is, mixed when some are.
  // Named function expressions rather than `useCallback`, because each is
  // recursive and a `const` arrow cannot reference itself during initialisation.
  const rollup = useCallback(function roll(node: TreeNode): { all: boolean; some: boolean } {
    const kids = node.children ?? [];
    if (kids.length === 0) {
      return { all: checked.has(node.id), some: false };
    }
    const results = kids.map(roll);
    const all = results.every((r) => r.all);
    const some = results.some((r) => r.all || r.some);
    return { all: all && checked.has(node.id), some };
  }, [checked]);

  const descendantIds = useCallback(
    function collect(node: TreeNode): string[] {
      return [node.id, ...(node.children ?? []).flatMap(collect)];
    },
    [],
  );

  const toggleNode = useCallback(
    (node: TreeNode) => {
      if (node.disabled) return;
      if (mode === 'browse') {
        onChange(node.id);
        return;
      }
      const ids = descendantIds(node);
      const state = rollup(node);
      const next = new Set(checked);
      if (state.all) for (const id of ids) next.delete(id);
      else for (const id of ids) next.add(id);
      onChange([...next]);
    },
    [checked, mode, onChange, descendantIds, rollup],
  );

  const renderNode = (node: TreeNode, depth: number): ReactNode => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isOpen = expanded.has(node.id);
    const state = mode === 'select' ? rollup(node) : null;
    const isSelected = selected === node.id;
    const isPinned = pinnedIds.includes(node.id);

    return (
      <li key={node.id} role="none">
        <div
          role="treeitem"
          aria-selected={mode === 'browse' ? isSelected : undefined}
          aria-expanded={hasChildren ? isOpen : undefined}
          aria-level={depth + 1}
          aria-label={node.label}
          tabIndex={mode === 'browse' && isSelected ? 0 : -1}
          className={[
            'tree-row',
            isSelected ? 'selected' : '',
            node.disabled ? 'disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ paddingLeft: depth * 16 + 8 }}
          data-tree-node={node.id}
          onClick={() => toggleNode(node)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleNode(node);
            } else if (e.key === 'ArrowRight' && hasChildren && !isOpen) {
              e.preventDefault();
              // Expansion is local presentation, so it is not a value change.
              const el = e.currentTarget as HTMLElement;
              el.setAttribute('aria-expanded', 'true');
              el.querySelector('.tree-children')?.removeAttribute('hidden');
            }
          }}
        >
          {hasChildren ? (
            <span className="tree-chevron" aria-hidden="true">
              {isOpen ? '▾' : '▸'}
            </span>
          ) : (
            <span className="tree-chevron" aria-hidden="true" />
          )}

          {mode === 'select' ? (
            <span onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={state?.all ?? false}
                indeterminate={state?.some ?? false}
                onChange={() => toggleNode(node)}
                ariaLabel={node.label}
                disabled={node.disabled}
              />
            </span>
          ) : null}

          <span className="tree-label">{node.label}</span>

          {node.count !== undefined ? (
            <span className="tree-count">{node.count.toLocaleString()}</span>
          ) : null}

          {node.status ? (
            <span
              className={`tree-status ${node.status.tone}`}
              title={`${node.status.label} — ${STATUS_TEXT[node.status.tone] ?? node.status.label}`}
            >
              <span aria-hidden="true">●</span>
              <span className="sr-only">{STATUS_TEXT[node.status.tone] ?? node.status.label}</span>
            </span>
          ) : null}

          {onTogglePin ? (
            <button
              type="button"
              className={`tree-pin${isPinned ? ' pinned' : ''}`}
              aria-pressed={isPinned}
              aria-label={isPinned ? `Unpin ${node.label}` : `Pin ${node.label}`}
              title={isPinned ? 'Unpin' : 'Pin for quick access'}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(node.id);
              }}
            >
              <span aria-hidden="true">{isPinned ? '★' : '☆'}</span>
            </button>
          ) : null}
        </div>

        {hasChildren ? (
          <ul className="tree-children" role="group" hidden={!isOpen}>
            {node.children?.map((child) => renderNode(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <ul className="tree" role="tree" aria-label={props['aria-label']} aria-multiselectable={mode === 'select'}>
      {nodes.map((node) => (
        <Fragment key={node.id}>{renderNode(node, 0)}</Fragment>
      ))}
    </ul>
  );
}