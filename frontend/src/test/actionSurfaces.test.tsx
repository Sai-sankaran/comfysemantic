// covers: NAV-24, NAV-25, NAV-31, NAV-20, NAV-21, NAV-22, NAV-23, NAV-26, NAV-27, NAV-40, NAV-41, NAV-42, NAV-43
/**
 * The registry-driven surfaces: the command palette (`NAV-24`), the shortcuts
 * overlay (`NAV-25`) and the window shortcut dispatcher (`NAV-31`).
 *
 * The point of these tests is that *nothing here is hand-written*: every row
 * comes from the registry, so a shortcut shown in the overlay is a shortcut the
 * app actually implements.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionRegistry, type ActionContext, type ActionContextName } from '../app/actions';
import { SHELL_ACTIONS } from '../app/shellActions';
import { useActionHotkeys } from '../app/useActionHotkeys';
import { CommandPalette } from '../features/palette/CommandPalette';
import { ShortcutOverlay } from '../features/palette/ShortcutOverlay';
import type { DestinationId } from '../app/navigation';

function registry(): ActionRegistry {
  const r = new ActionRegistry();
  r.register(SHELL_ACTIONS);
  return r;
}

function ctx(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    navigate: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    canBack: false,
    canForward: false,
    openPalette: vi.fn(),
    openOverlay: vi.fn(),
    openLibraryMenu: vi.fn(),
    openViewMenu: vi.fn(),
    toggleJobDrawer: vi.fn(),
    focusSearch: vi.fn(),
    addLibraryFolder: vi.fn(),
    toggleTree: vi.fn(),
    toggleInspector: vi.fn(),
    setViewMode: vi.fn(),
    privacyOn: false,
    togglePrivacy: vi.fn(),
    submitSearch: vi.fn(),
    activeLibraryName: 'Comics',
    busy: null,
    ...overrides,
  };
}

function HotkeyHarness({
  reg = registry(),
  destination = 'explore' as DestinationId,
  actionContext = ctx(),
  enabled = true,
}: {
  reg?: ActionRegistry;
  destination?: DestinationId;
  actionContext?: ActionContext;
  enabled?: boolean;
}) {
  useActionHotkeys(reg, destination, actionContext, enabled);
  return <input aria-label="A text field" />;
}

describe('CommandPalette (NAV-24)', () => {
  it('lists the registry actions for the context, not hand-written rows', () => {
    render(
      <CommandPalette open onClose={() => undefined} registry={registry()} context="explore" actionContext={ctx()} />,
    );
    const options = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(options.some((t) => t.includes('Go to Settings'))).toBe(true);
    expect(options.some((t) => t.includes('Add library folder'))).toBe(true);
  });

  it('never lists itself (the palette is not a palette item)', () => {
    render(
      <CommandPalette open onClose={() => undefined} registry={registry()} context="explore" actionContext={ctx()} />,
    );
    const options = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    // The dialog *title* is "Command palette"; there must be no such row.
    expect(options.some((t) => t.includes('Command palette'))).toBe(false);
  });

  it('offers the settings-only gallery action only in the settings context', () => {
    const { unmount } = render(
      <CommandPalette open onClose={() => undefined} registry={registry()} context="settings" actionContext={ctx()} />,
    );
    expect(screen.getByText('Open component gallery')).toBeTruthy();
    unmount();
    render(
      <CommandPalette open onClose={() => undefined} registry={registry()} context="explore" actionContext={ctx()} />,
    );
    expect(screen.queryByText('Open component gallery')).toBeNull();
  });

  it('greys a disabled action and shows why', () => {
    render(
      <CommandPalette open onClose={() => undefined} registry={registry()} context="explore" actionContext={ctx({ busy: 'indexing' })} />,
    );
    const item = screen.getByText('Start indexing').closest('[role="option"]');
    expect(item?.getAttribute('aria-disabled')).toBe('true');
    expect(item?.textContent).toContain('A job is already running');
    // Both busy-gated actions explain themselves.
    expect(screen.getAllByText('A job is already running')).toHaveLength(2);
  });

  it('filters by typed text and puts "Search for …" first', () => {
    render(
      <CommandPalette open onClose={() => undefined} registry={registry()} context="explore" actionContext={ctx()} />,
    );
    fireEvent.change(screen.getByLabelText('Command palette search'), { target: { value: 'settings' } });
    const options = screen.getAllByRole('option');
    // The typed text is offered as a search first, then the matching command.
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain('Search for \u201csettings\u201d in Comics');
    expect(options[1].textContent).toContain('Go to Settings');
  });

  it('offers a search row even when no command matches', () => {
    render(
      <CommandPalette open onClose={() => undefined} registry={registry()} context="explore" actionContext={ctx()} />,
    );
    fireEvent.change(screen.getByLabelText('Command palette search'), { target: { value: 'dragons' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('Search for \u201cdragons\u201d in Comics');
  });

  it('wires the search field as a combobox over the listbox (a11y)', () => {
    render(
      <CommandPalette open onClose={() => undefined} registry={registry()} context="explore" actionContext={ctx()} />,
    );
    const field = screen.getByLabelText('Command palette search');
    const list = screen.getByRole('listbox', { name: 'Commands' });
    expect(field.getAttribute('role')).toBe('combobox');
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(field.getAttribute('aria-controls')).toBe(list.id);
    // A screen reader follows the highlight only through this pointer.
    expect(field.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0].id);
  });

  it('moves the highlight and aria-activedescendant with the arrow keys', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette open onClose={() => undefined} registry={registry()} context="explore" actionContext={ctx()} />,
    );
    const field = screen.getByLabelText('Command palette search');
    await user.click(field);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(options[2].getAttribute('aria-selected')).toBe('true');
    expect(field.getAttribute('aria-activedescendant')).toBe(options[2].id);
    // The highlight stops at the last row rather than wrapping into nothing.
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(field.getAttribute('aria-activedescendant')).toBe(options[0].id);
  });

  it('runs the highlighted action on Enter and closes', async () => {
    const user = userEvent.setup();
    const actionContext = ctx();
    const onClose = vi.fn();
    render(
      <CommandPalette open onClose={onClose} registry={registry()} context="explore" actionContext={actionContext} />,
    );
    const field = screen.getByLabelText('Command palette search');
    await user.click(field);
    await user.type(field, 'Settings');
    // Row 0 is the typed-text search; the command is row 1.
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onClose).toHaveBeenCalled();
    expect(actionContext.navigate).toHaveBeenCalledWith('settings');
    expect(actionContext.submitSearch).not.toHaveBeenCalled();
  });

  it('runs the "Search for …" row, preserving the old Ctrl+K habit', async () => {
    const user = userEvent.setup();
    const actionContext = ctx();
    const onClose = vi.fn();
    render(
      <CommandPalette open onClose={onClose} registry={registry()} context="explore" actionContext={actionContext} />,
    );
    const field = screen.getByLabelText('Command palette search');
    await user.click(field);
    await user.type(field, 'comic panels{Enter}');
    expect(actionContext.submitSearch).toHaveBeenCalledWith('comic panels');
    expect(onClose).toHaveBeenCalled();
  });

  it('moves the highlight with the arrow keys', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette open onClose={() => undefined} registry={registry()} context="explore" actionContext={ctx()} />,
    );
    const field = screen.getByLabelText('Command palette search');
    await user.click(field);
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
  });
});

describe('ShortcutOverlay (NAV-25)', () => {
  it('lists registry shortcuts, grouped, and omits actions without one', () => {
    render(<ShortcutOverlay open onClose={() => undefined} registry={registry()} context="explore" />);
    expect(screen.getByText('Global')).toBeTruthy();
    const rows = Array.from(document.querySelectorAll('.shortcuts-list li')).map((li) => li.textContent ?? '');
    // These have shortcuts...
    for (const label of ['Command palette', 'Keyboard shortcuts', 'Focus search', 'Go to Settings']) {
      expect(rows.some((r) => r.includes(label))).toBe(true);
    }
    // ...and these do not.
    expect(rows.some((r) => r.includes('Add library folder'))).toBe(false);
    // `quickSwitcher.open` is registered but deliberately has no key yet, so it
    // must not appear in a list of shortcuts.
    expect(rows.some((r) => r.includes('Quick switcher'))).toBe(false);
    expect(rows.length).toBeGreaterThan(4);
  });

  it('shows every key an action owns', () => {
    render(<ShortcutOverlay open onClose={() => undefined} registry={registry()} context="explore" />);
    const keys = Array.from(document.querySelectorAll('.shortcuts-list kbd')).map((k) => k.textContent);
    // Settings answers to both `Ctrl+5` (the rail range) and `Ctrl+,`.
    expect(keys).toEqual(expect.arrayContaining(['Ctrl+K', '?', '/', 'Ctrl+5  Ctrl+,']));
  });

  it('filters by label or by keys', () => {
    render(<ShortcutOverlay open onClose={() => undefined} registry={registry()} context="explore" />);
    fireEvent.change(screen.getByLabelText('Filter shortcuts'), { target: { value: 'ctrl+k' } });
    const rows = Array.from(document.querySelectorAll('.shortcuts-list li')).map((li) => li.textContent ?? '');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Command palette');
  });

  it('explains when nothing matches', () => {
    render(<ShortcutOverlay open onClose={() => undefined} registry={registry()} context="explore" />);
    fireEvent.change(screen.getByLabelText('Filter shortcuts'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No shortcuts match/)).toBeTruthy();
  });
});

describe('useActionHotkeys dispatch', () => {
  it('runs the registry action for a global shortcut', () => {
    const actionContext = ctx();
    render(<HotkeyHarness actionContext={actionContext} />);
    fireEvent.keyDown(window, { key: '/', bubbles: true });
    expect(actionContext.focusSearch).toHaveBeenCalled();
  });

  it('dispatches mod+k and ? from the registry', () => {
    const actionContext = ctx();
    render(<HotkeyHarness actionContext={actionContext} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, bubbles: true });
    expect(actionContext.openPalette).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: '?', shiftKey: true, bubbles: true });
    expect(actionContext.openOverlay).toHaveBeenCalled();
  });

  it('dispatch is inert while a modal is open', () => {
    const actionContext = ctx();
    render(<HotkeyHarness actionContext={actionContext} enabled={false} />);
    fireEvent.keyDown(window, { key: '/', bubbles: true });
    expect(actionContext.focusSearch).not.toHaveBeenCalled();
  });

  it('ignores an unmodified shortcut typed into a text field (NAV-26)', async () => {
    const user = userEvent.setup();
    const actionContext = ctx();
    render(<HotkeyHarness actionContext={actionContext} />);
    await user.click(screen.getByLabelText('A text field'));
    await user.keyboard('/');
    expect(actionContext.focusSearch).not.toHaveBeenCalled();
  });

  it('still honours a modified shortcut from a text field', async () => {
    const user = userEvent.setup();
    const actionContext = ctx();
    render(<HotkeyHarness actionContext={actionContext} />);
    await user.click(screen.getByLabelText('A text field'));
    await user.keyboard('{Control>}k{/Control}');
    expect(actionContext.openPalette).toHaveBeenCalled();
  });

  it('does not run a disabled action', () => {
    const actionContext = ctx({ busy: 'indexing' });
    const reg = new ActionRegistry();
    reg.register([
      {
        id: 'x',
        label: 'X',
        shortcut: 'i',
        contexts: ['global'],
        enabledWhen: () => ({ enabled: false, reason: 'nope' }),
        run: vi.fn(),
      },
    ]);
    render(<HotkeyHarness reg={reg} actionContext={actionContext} />);
    fireEvent.keyDown(window, { key: 'i', bubbles: true });
    expect(reg.get('x')?.run).not.toHaveBeenCalled();
  });

  it('does not run a context-scoped action from another context', () => {
    const run = vi.fn();
    const reg = new ActionRegistry();
    reg.register([{ id: 'settingsOnly', label: 'S', shortcut: 'j', contexts: ['settings' as ActionContextName], run }]);
    render(<HotkeyHarness reg={reg} destination="explore" actionContext={ctx()} />);
    fireEvent.keyDown(window, { key: 'j', bubbles: true });
    expect(run).not.toHaveBeenCalled();
  });
});
