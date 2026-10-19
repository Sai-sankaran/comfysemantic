// covers: CTL-01, CTL-02, CTL-03, CTL-04, CTL-05, CTL-06, NAV-08, TST-02
/**
 * Tabs, Tooltip and Tree — the three shared controls the library was still
 * missing (§10.6, `CTL-01`). Each is here because a required screen needs it, and
 * each is tested for the behaviour the design actually names rather than for
 * "it renders".
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Tabs, Tooltip, Tree, type TreeNode } from '../components/ui';

describe('Tabs', () => {
  function Harness({ initial = 'b' }: { initial?: 'a' | 'b' | 'c' }) {
    const [value, setValue] = useState<'a' | 'b' | 'c'>(initial);
    return (
      <Tabs
        aria-label="Section"
        value={value}
        onChange={setValue}
        items={[
          { id: 'a', label: 'First' },
          { id: 'b', label: 'Second' },
          { id: 'c', label: 'Third' },
        ]}
      />
    );
  }

  it('is a tablist whose selected tab is the only one in the tab order', () => {
    render(<Harness />);
    const list = screen.getByRole('tablist', { name: 'Section' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    // Roving tabindex: only the selected tab is reachable with Tab.
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('selects on click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Third' }));
    expect(screen.getByRole('tab', { name: 'Third' }).getAttribute('aria-selected')).toBe('true');
  });

  it('moves with the arrow keys and wraps', async () => {
    const user = userEvent.setup();
    render(<Harness initial="b" />);
    screen.getByRole('tab', { name: 'Second' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Third' }).getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'First' }).getAttribute('aria-selected')).toBe('true');
  });

  it('jumps to the ends with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness initial="b" />);
    screen.getByRole('tab', { name: 'Second' }).focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Third' }).getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'First' }).getAttribute('aria-selected')).toBe('true');
  });

  it('skips a disabled tab when moving', async () => {
    function WithDisabled() {
      const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
      return (
        <Tabs
          aria-label="Section"
          value={value}
          onChange={setValue}
          items={[
            { id: 'a', label: 'First' },
            { id: 'b', label: 'Disabled', disabled: true },
            { id: 'c', label: 'Third' },
          ]}
        />
      );
    }
    const user = userEvent.setup();
    render(<WithDisabled />);
    screen.getByRole('tab', { name: 'First' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Third' }).getAttribute('aria-selected')).toBe('true');
  });

  it('links each tab to its panel when one is supplied', () => {
    render(
      <Tabs
        aria-label="Section"
        value="a"
        onChange={() => undefined}
        items={[{ id: 'a', label: 'First' }]}
      >
        {(id) => <p>Panel for {id}</p>}
      </Tabs>,
    );
    const tab = screen.getByRole('tab', { name: 'First' });
    const controls = tab.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls as string)?.textContent).toContain('Panel for a');
  });
});

describe('Tooltip', () => {
  it('shows after the hover delay, not immediately', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip label="Compare" shortcut="C">
          <button type="button">Compare</button>
        </Tooltip>,
      );
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'Compare' }));
      // The design says 600 ms; nothing before then.
      expect(screen.queryByRole('tooltip')).toBeNull();
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.getByRole('tooltip').textContent).toContain('Compare');
    } finally {
      vi.useRealTimers();
    }
  });

  it('appears instantly on keyboard focus', () => {
    render(
      <Tooltip label="Compare" shortcut="C">
        <button type="button">Compare</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Compare' }));
    expect(screen.getByRole('tooltip').textContent).toContain('C');
  });

  it('describes the control rather than replacing its name', () => {
    render(
      <Tooltip label="Compare two to four images">
        <button type="button">Compare</button>
      </Tooltip>,
    );
    const button = screen.getByRole('button', { name: 'Compare' });
    fireEvent.focus(button);
    // Still named "Compare": the bubble describes it rather than labelling it.
    expect(button.getAttribute('aria-label')).toBeNull();
    const describedBy = button.getAttribute('aria-describedby') as string;
    expect(document.getElementById(describedBy)?.textContent).toContain('two to four');
  });

  it('hides on blur and on Escape', () => {
    render(
      <Tooltip label="Compare">
        <button type="button">Compare</button>
      </Tooltip>,
    );
    const button = screen.getByRole('button', { name: 'Compare' });
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(button);
    fireEvent.blur(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('does not fire when disabled', () => {
    render(
      <Tooltip label="Not available" disabled>
        <button type="button">Compare</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Compare' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

const NODES: TreeNode[] = [
  {
    id: 'all',
    label: 'All items',
    count: 12_043,
    status: { label: 'partial', tone: 'partial' },
  },
  {
    id: 'renders',
    label: 'Renders',
    count: 9_980,
    status: { label: 'done', tone: 'done' },
    children: [
      { id: '2026', label: '2026', count: 4_100, status: { label: 'done', tone: 'done' } },
      { id: '2025', label: '2025', count: 5_880, status: { label: 'stale', tone: 'stale' } },
    ],
  },
  { id: 'comics', label: 'Comics', count: 150, status: { label: 'failed', tone: 'failed' } },
];

describe('Tree', () => {
  it('shows a row per folder with its count and status', () => {
    render(
      <Tree
        nodes={NODES}
        mode="browse"
        value="all"
        onChange={() => undefined}
        aria-label="Folders"
        defaultExpanded={['renders']}
      />,
    );
    const tree = screen.getByRole('tree', { name: 'Folders' });
    expect(within(tree).getByRole('treeitem', { name: 'All items' })).toBeTruthy();
    expect(within(tree).getByText('12,043')).toBeTruthy();
    // The §5.7 wording is on the status, not a colour alone.
    expect(within(tree).getAllByText('Done').length).toBeGreaterThan(0);
    expect(within(tree).getByText('Stale')).toBeTruthy();
    expect(within(tree).getByText('Has failures')).toBeTruthy();
  });

  it('is single-select in Browse mode and marks the selected row', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<string>('all');
      return (
        <Tree nodes={NODES} mode="browse" value={value} onChange={setValue} aria-label="Folders" />
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole('treeitem', { name: 'Comics' }));
    expect(screen.getByRole('treeitem', { name: 'Comics' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    // Browse mode has no checkboxes (LIB-07).
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('uses tri-state checkboxes in Select mode', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<string[]>(['2026']);
      return (
        <Tree
          nodes={NODES}
          mode="select"
          value={value}
          onChange={setValue}
          aria-label="Scope"
          defaultExpanded={['renders']}
        />
      );
    }
    render(<Harness />);
    const parent = screen.getByRole('checkbox', { name: 'Renders' });
    // One of two children is checked, so the parent is mixed rather than checked.
    expect((parent as HTMLInputElement).checked).toBe(false);

    await user.click(parent);
    expect((screen.getByRole('checkbox', { name: 'Renders' }) as HTMLInputElement).checked).toBe(true);
    // Checking a folder checks all its descendants (LIB-07).
    expect((screen.getByRole('checkbox', { name: '2025' }) as HTMLInputElement).checked).toBe(true);
  });

  it('unchecks a fully checked folder on a second click', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <Tree
          nodes={NODES}
          mode="select"
          value={value}
          onChange={setValue}
          aria-label="Scope"
          defaultExpanded={['renders']}
        />
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'Renders' }));
    expect((screen.getByRole('checkbox', { name: '2026' }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Renders' }));
    expect((screen.getByRole('checkbox', { name: '2026' }) as HTMLInputElement).checked).toBe(false);
  });

  it('keeps Browse and Select state separate (LIB-08)', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [browse, setBrowse] = useState<string>('all');
      const [select, setSelect] = useState<string[]>([]);
      return (
        <>
          <Tree
            nodes={NODES}
            mode="browse"
            value={browse}
            onChange={setBrowse}
            aria-label="Folders"
          />
          <Tree nodes={NODES} mode="select" value={select} onChange={setSelect} aria-label="Scope" />
        </>
      );
    }
    render(<Harness />);
    const [browseTree, selectTree] = screen.getAllByRole('tree');
    await user.click(within(selectTree).getByRole('checkbox', { name: 'Comics' }));
    // Selecting in Select mode did not move the Browse selection.
    expect(
      within(browseTree).getByRole('treeitem', { name: 'All items' }).getAttribute('aria-selected'),
    ).toBe('true');
    // And the Browse tree has no checkboxes at all (LIB-07).
    expect(within(browseTree).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('collapses and expands a branch', () => {
    render(
      <Tree
        nodes={NODES}
        mode="browse"
        value="all"
        onChange={() => undefined}
        aria-label="Folders"
        defaultExpanded={['renders']}
      />,
    );
    const branch = screen.getByRole('treeitem', { name: 'Renders' });
    expect(branch.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('treeitem', { name: '2026' })).toBeTruthy();
  });

  it('nests a child and indents it by 16 px per level', () => {
    render(
      <Tree
        nodes={NODES}
        mode="browse"
        value="all"
        onChange={() => undefined}
        aria-label="Folders"
        defaultExpanded={['renders']}
      />,
    );
    const child = screen.getByRole('treeitem', { name: '2026' });
    expect(child.getAttribute('aria-level')).toBe('2');
    expect((child as HTMLElement).style.paddingLeft).toBe('24px');
  });

  it('offers a pin affordance without changing the selection', async () => {
    const user = userEvent.setup();
    const onTogglePin = vi.fn();
    const onChange = vi.fn();
    render(
      <Tree
        nodes={NODES}
        mode="browse"
        value="all"
        onChange={onChange}
        aria-label="Folders"
        pinnedIds={['comics']}
        onTogglePin={onTogglePin}
      />,
    );
    // A pinned folder reads as pinned; an unpinned one offers to be pinned.
    expect(screen.getByRole('button', { name: 'Unpin Comics' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Pin All items' }));
    expect(onTogglePin).toHaveBeenCalledWith('all');
    // Pinning is a shortcut, never a selection or a scope change (LIB-06).
    expect(onChange).not.toHaveBeenCalled();
  });
});