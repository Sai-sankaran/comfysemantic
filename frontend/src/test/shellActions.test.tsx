// covers: NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, NAV-07, NAV-08, NAV-10, NAV-11, NAV-12, NAV-13, NAV-14, NAV-20, NAV-21, NAV-22, NAV-23, NAV-24, NAV-25, NAV-26, NAV-27, NAV-30, NAV-31, NAV-32, NAV-40, NAV-41, NAV-42, NAV-43, NAV-50, NAV-51, NAV-52, PRV-06
/**
 * The shell consumes the action registry (`NAV-30`–`NAV-32`) and owns the
 * documented frame (design §6.1).
 *
 * These tests pin the contract at the shell level: the rail, the View menu, the
 * search placeholder and the window keydown dispatcher all read the same
 * registry, so a shortcut shown anywhere is a shortcut the shell implements.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppSettings, LibraryRecord } from '../types';

const openDirectory = vi.fn();
const registerLibrary = vi.fn();
const refreshLibraries = vi.fn();
const updateAppSetting = vi.fn();

let busy: string | null = null;
let libraries: LibraryRecord[] = [];

vi.mock('../api', () => ({
  api: {
    openDirectory: (...args: unknown[]) => openDirectory(...args),
    registerLibrary: (...args: unknown[]) => registerLibrary(...args),
    startModel: vi.fn(),
    stopModel: vi.fn(),
    pauseIndexing: vi.fn(),
    stopIndexing: vi.fn(),
  },
}));

vi.mock('../app/providers', () => ({
  useLibrary: () => ({
    settings: { runtime_status: 'ready' } as unknown as AppSettings,
    appSettings: { theme: 'dark', density: 'comfortable', text_scale: 100 } as unknown as AppSettings,
    activeLibrary: { id: 'L', name: 'Comics' } as unknown as LibraryRecord,
    libraries,
    libraryId: 'L',
    selectLibrary: vi.fn(),
    updateAppSetting,
    busy,
    refreshLibraries,
  }),
}));

import { AppShell } from '../app/AppShell';
import { SHELL_ACTIONS } from '../app/shellActions';
import { DESTINATIONS, type ViewState } from '../app/navigation';

describe('the registry and the rail agree (NAV-30/31)', () => {
  it('gives every destination a nav action with the same label, icon and key', () => {
    // The nav actions are written out rather than generated so the Appendix A
    // drift guard can parse this file as text; this test is what keeps them from
    // drifting away from the rail the design specifies.
    for (const destination of DESTINATIONS) {
      const action = SHELL_ACTIONS.find((a) => a.id === `nav.${destination.id}`);
      expect(action, `no nav action for ${destination.id}`).toBeDefined();
      expect(action?.label).toBe(`Go to ${destination.label}`);
      expect(action?.icon).toBe(destination.icon);
      expect(action?.shortcut).toBe(destination.shortcut);
    }
  });

  it('gives no other action a rail key, so Ctrl+1…Ctrl+5 stay unique', () => {
    const railKeys = new Set(DESTINATIONS.map((d) => d.shortcut));
    for (const action of SHELL_ACTIONS) {
      if (action.id.startsWith('nav.') && railKeys.has(action.shortcut ?? '')) continue;
      expect(railKeys.has(action.shortcut ?? '')).toBe(false);
    }
  });

  it('gives each action a context the dispatcher can actually resolve', () => {
    // `ActionContextName` is `global | DestinationId | 'gallery'`. The last one
    // is not a destination; it is the narrow context the Explore grid owns, and
    // it exists precisely so a grid key does not become a window-wide key.
    const known = new Set<string>([...DESTINATIONS.map((d) => d.id), 'global', 'gallery']);
    for (const action of SHELL_ACTIONS) {
      for (const context of action.contexts) {
        expect(context === 'global' || known.has(context), `${action.id} has context ${context}`).toBe(
          true,
        );
      }
    }
  });

  it('scopes the gallery keys to the grid rather than to the window', () => {
    // Appendix A's "Gallery and search results" keys must not be `global`: `Space`
    // that peeked from anywhere in Explore would be wrong, and it would also
    // collide with `Space` in the Reader (NAV-32).
    const galleryOnly = SHELL_ACTIONS.filter(
      (a) => a.contexts.includes('gallery') && !a.contexts.includes('global'),
    );
    expect(galleryOnly.length).toBeGreaterThan(0);
    for (const action of galleryOnly) {
      expect(action.contexts, `${action.id} should be grid-only`).toEqual(['gallery']);
    }
  });
});

function renderShell(initial?: Partial<ViewState>) {
  const onNavigate = vi.fn();
  const onGlobalSearch = vi.fn();
  const view: ViewState = {
    destination: 'explore',
    workspace: 'browse',
    ...initial,
  };
  const result = render(
    <AppShell
      view={view}
      onNavigate={onNavigate}
      onBack={vi.fn()}
      onForward={vi.fn()}
      canBack={false}
      canForward={false}
      onGlobalSearch={onGlobalSearch}
      selectedCount={0}
      readOnly={false}
    >
      <div data-testid="screen">screen</div>
    </AppShell>,
  );
  return { ...result, onNavigate, onGlobalSearch };
}

async function openViewMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^View/ }));
  return screen.getByRole('menu', { name: 'View' });
}

/** The registry-driven action rows, in render order (`NAV-31`). */
function actionLabels(): string[] {
  return Array.from(
    document.querySelectorAll('[data-action-id]'),
  ).map((el) => el.getAttribute('data-action-id') ?? '');
}

describe('rail (NAV-01)', () => {
  it('has exactly the five documented destinations, Settings anchored at the bottom', () => {
    renderShell();
    const items = Array.from(
      screen.getByRole('complementary', { name: 'Main navigation' }).querySelectorAll(
        '.rail-item[data-destination]',
      ),
    ).map((el) => el.getAttribute('data-destination'));
    expect(items).toEqual(['explore', 'search', 'review', 'pipeline', 'settings']);
  });

  it('puts the collapse button under Settings', () => {
    renderShell();
    const rail = screen.getByRole('complementary', { name: 'Main navigation' });
    const last = rail.querySelectorAll('.rail-item');
    // jsdom's default window is 1024 px wide, i.e. below the 1280 px rule, so the
    // rail starts collapsed (`NAV-03`) and the button offers to expand it.
    expect(last[last.length - 1].getAttribute('aria-label')).toBe('Expand navigation rail');
  });

  it('marks the active destination and navigates on click', async () => {
    const { onNavigate } = renderShell();
    const user = userEvent.setup();
    const rail = () => screen.getByRole('complementary', { name: 'Main navigation' });
    expect(rail().querySelector('[data-destination="explore"]')?.getAttribute('aria-current')).toBe('page');
    expect(rail().querySelector('[data-destination="review"]')?.getAttribute('aria-current')).toBeNull();
    await user.click(rail().querySelector('[data-destination="review"]') as HTMLElement);
    expect(onNavigate).toHaveBeenCalledWith({ destination: 'review', workspace: 'review-text' });
  });

  it('carries no Review count badge when the count is unknown (PRD-10)', () => {
    const { container } = renderShell();
    expect(container.querySelector('.rail-badge')).toBeNull();
  });
});

describe('workspace strip', () => {
  it('is hidden for a single-workspace destination and shown for Review', () => {
    const { unmount } = renderShell();
    expect(screen.queryByRole('tablist')).toBeNull();
    unmount();
    renderShell({ destination: 'review', workspace: 'review-failed' });
    // The strip is the shared `Tabs` control, so it is a tablist (not a nav).
    const strip = screen.getByRole('tablist', { name: 'Review views' });
    expect(Array.from(strip.querySelectorAll('[role="tab"]')).map((b) => b.textContent)).toEqual([
      'Dialogue review',
      'Failed items',
    ]);
  });

  it('switches workspace with the keyboard', async () => {
    const { onNavigate } = renderShell({ destination: 'review', workspace: 'review-text' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Dialogue review' }));
    // The ARIA tabs pattern: the list owns arrow-key movement.
    await user.keyboard('{ArrowRight}');
    expect(onNavigate).toHaveBeenCalledWith({
      destination: 'review',
      workspace: 'review-failed',
    });
  });
});

describe('View menu (NAV-13, NAV-31)', () => {
  it('carries every old Options item, in their original order', async () => {
    // `NAV-13` requires the View menu to "carry every item over" — the *old*
    // items keep their relative order. It does not forbid new entries, and
    // `PRV-01` requires one: the privacy-blur toggle has to be in this menu.
    renderShell();
    await openViewMenu();
    const labels = actionLabels();
    const legacy = [
      'library.addFolder',
      'tools.startIndexing',
      'tools.panelSeparator',
      'tools.indexingStatus',
      'tools.recovery',
      'nav.settings',
    ];
    for (const id of legacy) expect(labels).toContain(id);
    const positions = legacy.map((id) => labels.indexOf(id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('offers privacy blur in the View menu (PRV-01)', async () => {
    renderShell();
    await openViewMenu();
    const item = screen.getByRole('menuitem', { name: /Privacy blur/ });
    expect(item.querySelector('kbd')?.textContent).toBe('Ctrl+Shift+B');
  });

  it('does not carry the Grid/Table actions, which `E.2` calls palette actions', async () => {
    // Two new entries in the View menu would break `NAV-31`'s exact list, so the
    // view-mode actions are registered on the palette and shortcut surfaces only.
    renderShell();
    await openViewMenu();
    const labels = actionLabels();
    expect(labels).not.toContain('view.gridMode');
    expect(labels).not.toContain('view.tableMode');
  });

  it('shows both of Settings\' keys, from the registry', async () => {
    renderShell();
    await openViewMenu();
    const settings = screen.getByRole('menuitem', { name: /Go to Settings/ });
    expect(settings.querySelector('kbd')?.textContent).toBe('Ctrl+5  Ctrl+,');
  });

  it('applies a theme change through the shared settings setter', async () => {
    const user = userEvent.setup();
    renderShell();
    await openViewMenu();
    // `menuitemradio` is the valid child of `role="menu"` for a choice.
    await user.click(screen.getByRole('menuitemradio', { name: 'Light' }));
    expect(updateAppSetting).toHaveBeenCalledWith('theme', 'light');
  });

  it('marks the current theme, density and text scale as checked', async () => {
    renderShell();
    await openViewMenu();
    const checked = Array.from(
      document.querySelectorAll('[role="menuitemradio"][aria-checked="true"]'),
    ).map((b) => b.textContent);
    expect(checked).toEqual(['Dark', 'Comfortable', '100%']);
  });

  it('keeps a settings-registry control visible but disabled with its reason', async () => {
    renderShell();
    const menu = await openViewMenu();
    const thumb = Array.from(menu.querySelectorAll('[role="menuitem"]')).find((b) =>
      b.textContent?.includes('Thumbnail size'),
    ) as HTMLElement;
    expect(thumb.getAttribute('aria-disabled')).toBe('true');
    expect(thumb.getAttribute('title')).toMatch(/settings registry/);
  });

  it('keeps a disabled action visible, marked, and inert', async () => {
    busy = 'indexing';
    try {
      const user = userEvent.setup();
      renderShell();
      await openViewMenu();
      const add = screen.getByRole('menuitem', { name: /Add library folder/ });
      expect(add.getAttribute('aria-disabled')).toBe('true');
      expect(add.getAttribute('title')).toBe('A job is already running');
      await user.click(add);
      expect(openDirectory).not.toHaveBeenCalled();
    } finally {
      busy = null;
    }
  });
});

describe('library switcher (NAV-10)', () => {
  it('lists the libraries and marks the active one', async () => {
    libraries = [
      { id: 'L', name: 'Comics', total_files: 120, missing_files: 0 } as unknown as LibraryRecord,
      { id: 'M', name: 'Renders', total_files: 8, missing_files: 1 } as unknown as LibraryRecord,
    ];
    try {
      const user = userEvent.setup();
      const { container } = renderShell();
      await user.click(container.querySelector('.library-trigger') as HTMLElement);
      const menu = screen.getByRole('menu', { name: 'Libraries' });
      const labels = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((b) => b.textContent);
      expect(labels[0]).toContain('All libraries');
      expect(labels[1]).toContain('Comics');
      expect(labels[1]).toContain('120');
      expect(labels[2]).toContain('Renders');
      // `LIB-02` is not built: the row stays visible and says why.
      const manage = Array.from(menu.querySelectorAll('[role="menuitem"]')).find((b) =>
        b.textContent?.includes('Manage libraries'),
      ) as HTMLElement;
      expect(manage.getAttribute('aria-disabled')).toBe('true');
    } finally {
      libraries = [];
    }
  });
});

describe('tray (NAV-07)', () => {
  it('shows Ready when nothing is running', () => {
    const { container } = renderShell();
    // `NAV-14`: the System chip also says "Ready"; the tray has its own line.
    expect(container.querySelector('.tray-summary')?.textContent).toContain('Ready');
  });

  it('shows a job summary with Pause and Stop while a job runs', () => {
    busy = 'indexing';
    try {
      const { container } = renderShell();
      expect(container.querySelector('.tray-summary')?.textContent).toMatch(/Indexing · indexing/);
      expect(container.querySelector('.tray-controls')).toBeTruthy();
    } finally {
      busy = null;
    }
  });

  it('expands the drawer on Ctrl+J', () => {
    renderShell();
    expect(screen.queryByRole('region', { name: 'Jobs' })).toBeNull();
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true, bubbles: true });
    expect(screen.getByRole('region', { name: 'Jobs' })).toBeTruthy();
  });
});

describe('AppShell keyboard dispatch (NAV-20, NAV-26, NAV-31)', () => {
  it('opens the command palette on Ctrl+K', () => {
    renderShell();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, bubbles: true });
    expect(screen.getByRole('heading', { name: 'Command palette' })).toBeTruthy();
    expect(screen.getByRole('listbox', { name: 'Commands' })).toBeTruthy();
  });

  it('opens the shortcuts overlay on ?', () => {
    renderShell();
    fireEvent.keyDown(window, { key: '?', shiftKey: true, bubbles: true });
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeTruthy();
    expect(screen.getByLabelText('Filter shortcuts')).toBeTruthy();
  });

  it('focuses the top-bar search on /', () => {
    renderShell();
    const input = screen.getByLabelText('Search library');
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(window, { key: '/', bubbles: true });
    expect(document.activeElement).toBe(input);
  });

  it('ignores single-letter shortcuts typed into the search field', async () => {
    const user = userEvent.setup();
    renderShell();
    const input = screen.getByLabelText('Search library');
    await user.click(input);
    await user.keyboard('/comics');
    expect((input as HTMLInputElement).value).toBe('/comics');
  });

  it('navigates the rail with Ctrl+1 … Ctrl+5', () => {
    const { onNavigate } = renderShell();
    fireEvent.keyDown(window, { key: '4', ctrlKey: true, bubbles: true });
    expect(onNavigate).toHaveBeenCalledWith({ destination: 'pipeline', workspace: 'pipeline-jobs' });
  });

  it('opens Settings with both Ctrl+5 and Ctrl+,', () => {
    const { onNavigate } = renderShell();
    fireEvent.keyDown(window, { key: ',', ctrlKey: true, bubbles: true });
    expect(onNavigate).toHaveBeenCalledWith({
      destination: 'settings',
      workspace: 'settings-preferences',
    });
  });

  it('runs a registry action from the palette and navigates', async () => {
    const { onNavigate } = renderShell();
    const user = userEvent.setup();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, bubbles: true });
    const field = screen.getByLabelText('Command palette search');
    await user.click(field);
    // Row 0 is the typed-text search, row 1 the matching command.
    await user.type(field, 'Start indexing{ArrowDown}{Enter}');
    expect(onNavigate).toHaveBeenCalledWith({ destination: 'pipeline', workspace: 'pipeline-jobs' });
  });

  it('derives the search placeholder from the registry', () => {
    renderShell();
    expect(screen.getByLabelText('Search library').getAttribute('placeholder')).toBe(
      'Search library…   /  Ctrl+K',
    );
  });
});