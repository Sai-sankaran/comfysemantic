// covers: NAV-30, NAV-31, NAV-32, NAV-20, NAV-21, NAV-22, NAV-23, NAV-24, NAV-25, NAV-26, NAV-27, NAV-40, NAV-41, NAV-42, NAV-43, NAV-50, NAV-51, NAV-52, E.9, TST-21
/**
 * The action registry (`NAV-30`–`NAV-32`).
 *
 * These are the contract tests for the registry itself: ids are unique, ids
 * cannot be re-registered, shortcuts parse/normalise/format predictably,
 * conflicts are found only across overlapping contexts, `enabledWhen` gates
 * execution, and the shipped actions actually do what they say.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ActionRegistry,
  availability,
  contextsOverlap,
  findShortcutConflicts,
  formatShortcut,
  isEditableTarget,
  isUnmodifiedShortcut,
  matchShortcut,
  normalizeShortcut,
  parseShortcut,
  type ActionContext,
  type AppAction,
} from '../app/actions';
import { SHELL_ACTIONS } from '../app/shellActions';

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
    activeLibraryName: 'Library A',
    busy: null,
    ...overrides,
  };
}

function action(partial: Partial<AppAction> & Pick<AppAction, 'id'>): AppAction {
  return {
    label: partial.id,
    contexts: ['global'],
    run: () => undefined,
    ...partial,
  };
}

describe('ActionRegistry', () => {
  it('registers actions and rejects a duplicate id', () => {
    const registry = new ActionRegistry();
    registry.register([action({ id: 'a' }), action({ id: 'b' })]);
    expect(registry.all().map((a) => a.id)).toEqual(['a', 'b']);
    expect(() => registry.register([action({ id: 'a' })])).toThrow(/duplicate action id: a/);
  });

  it('ships a registry of shell actions with unique ids', () => {
    const ids = SHELL_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const registry = new ActionRegistry();
    expect(() => registry.register(SHELL_ACTIONS)).not.toThrow();
  });

  it('validates every shipped shortcut at registration time', () => {
    const registry = new ActionRegistry();
    expect(() => registry.register(SHELL_ACTIONS)).not.toThrow();
    for (const a of SHELL_ACTIONS) {
      if (a.shortcut) expect(() => normalizeShortcut(a.shortcut as string)).not.toThrow();
    }
  });

  it('returns actions for a context, always including global ones', () => {
    const registry = new ActionRegistry();
    registry.register([
      action({ id: 'global-1', contexts: ['global'] }),
      action({ id: 'settings-1', contexts: ['settings'] }),
      action({ id: 'library-1', contexts: ['explore'] }),
    ]);
    expect(registry.forContext('settings').map((a) => a.id)).toEqual(['global-1', 'settings-1']);
    expect(registry.forContext('explore').map((a) => a.id)).toEqual(['global-1', 'library-1']);
  });

  it('filters by surface, defaulting to palette + overlay', () => {
    const registry = new ActionRegistry();
    registry.register([
      action({ id: 'both' }),
      action({ id: 'menu-only', surfaces: ['menu'] }),
      action({ id: 'palette-only', surfaces: ['palette'] }),
    ]);
    expect(registry.bySurface('global', 'palette').map((a) => a.id)).toEqual(['both', 'palette-only']);
    expect(registry.bySurface('global', 'menu').map((a) => a.id)).toEqual(['menu-only']);
    expect(registry.bySurface('global', 'overlay').map((a) => a.id)).toEqual(['both']);
  });

  it('offers the gallery action only in the settings context', () => {
    const registry = new ActionRegistry();
    registry.register(SHELL_ACTIONS);
    expect(registry.forContext('settings').map((a) => a.id)).toContain('diagnostics.gallery');
    expect(registry.forContext('explore').map((a) => a.id)).not.toContain('diagnostics.gallery');
  });
});

describe('shortcut parsing and normalisation', () => {
  it('parses modifiers and the key', () => {
    expect(parseShortcut('mod+k')).toMatchObject({ mod: true, shift: false, key: 'k' });
    expect(parseShortcut('ctrl+shift+z')).toMatchObject({ ctrl: true, shift: true, key: 'z' });
    expect(parseShortcut('alt+arrowleft')).toMatchObject({ alt: true, key: 'arrowleft' });
  });

  it('treats a bare plus as the plus key, not a separator', () => {
    expect(parseShortcut('+')).toMatchObject({ mod: false, key: '+' });
  });

  it('normalises aliases and modifier order', () => {
    expect(normalizeShortcut('Esc')).toBe('escape');
    expect(normalizeShortcut('\u2190')).toBe('arrowleft');
    expect(normalizeShortcut('Shift+Mod+K')).toBe('mod+shift+k');
    expect(normalizeShortcut('mod+k')).toBe(normalizeShortcut('Mod+ K'));
  });

  it('rejects a shortcut with two keys or no key', () => {
    expect(() => parseShortcut('k+j')).toThrow(/more than one key/);
    expect(() => parseShortcut('mod+')).toThrow(/no key/);
  });

  it('formats shortcuts for display', () => {
    expect(formatShortcut('mod+k')).toBe('Ctrl+K');
    expect(formatShortcut('mod+,')).toBe('Ctrl+,');
    expect(formatShortcut('alt+arrowleft')).toBe('Alt+\u2190');
    expect(formatShortcut('?')).toBe('?');
    expect(formatShortcut('mod+k', 'mac')).toBe('\u2318+K');
  });
});

describe('shortcut matching', () => {
  const ev = (over: Partial<Parameters<typeof matchShortcut>[0]>) => ({
    key: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...over,
  });

  it('matches mod against Ctrl or Cmd', () => {
    expect(matchShortcut(ev({ key: 'k', ctrlKey: true }), 'mod+k')).toBe(true);
    expect(matchShortcut(ev({ key: 'k', metaKey: true }), 'mod+k')).toBe(true);
    expect(matchShortcut(ev({ key: 'k' }), 'mod+k')).toBe(false);
  });

  it('does not match when an unrequested modifier is held', () => {
    expect(matchShortcut(ev({ key: 'k', ctrlKey: true, shiftKey: true }), 'mod+k')).toBe(false);
    expect(matchShortcut(ev({ key: 'k', ctrlKey: true, altKey: true }), 'mod+k')).toBe(false);
  });

  it('matches a shifted symbol without the spec spelling out shift', () => {
    // `?` is Shift+/ on a US layout.
    expect(matchShortcut(ev({ key: '?', shiftKey: true }), '?')).toBe(true);
  });

  it('matches plain keys and arrows', () => {
    expect(matchShortcut(ev({ key: '/' }), '/')).toBe(true);
    expect(matchShortcut(ev({ key: 'ArrowLeft', altKey: true }), 'alt+arrowleft')).toBe(true);
  });

  it('classifies unmodified shortcuts and editable targets', () => {
    expect(isUnmodifiedShortcut('b')).toBe(true);
    expect(isUnmodifiedShortcut('mod+k')).toBe(false);
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
  });

  it('finds the actions matching an event', () => {
    const registry = new ActionRegistry();
    registry.register(SHELL_ACTIONS);
    const matches = registry.matchShortcut(ev({ key: 'k', ctrlKey: true }));
    expect(matches.map((a) => a.id)).toEqual(['palette.open']);
  });
});

describe('shortcut conflicts (NAV-32)', () => {
  it('flags the same shortcut in overlapping contexts', () => {
    const conflicts = findShortcutConflicts([
      action({ id: 'a', shortcut: 'mod+k', contexts: ['global'] }),
      action({ id: 'b', shortcut: 'mod+k', contexts: ['search'] }),
    ]);
    expect(conflicts).toEqual([{ shortcut: 'mod+k', ids: ['a', 'b'] }]);
  });

  it('treats `global` as overlapping every scoped context', () => {
    // `global` means "available everywhere", so it is never disjoint.
    expect(contextsOverlap(['global'], ['review'])).toBe(true);
    expect(contextsOverlap(['explore'], ['review'])).toBe(false);
    expect(contextsOverlap(['explore', 'search'], ['search'])).toBe(true);
  });

  it('allows the same shortcut in genuinely disjoint contexts', () => {
    const conflicts = findShortcutConflicts([
      action({ id: 'a', shortcut: 'b', contexts: ['explore'] }),
      action({ id: 'b', shortcut: 'b', contexts: ['review'] }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('guards a second binding exactly like the primary one', () => {
    const conflicts = findShortcutConflicts([
      action({ id: 'a', shortcut: 'mod+5', alsoShortcut: 'mod+,' }),
      action({ id: 'b', shortcut: 'mod+,', contexts: ['explore'] }),
    ]);
    expect(conflicts).toEqual([{ shortcut: 'mod+,', ids: ['a', 'b'] }]);
  });

  it('compares shortcuts by their normalised form', () => {
    const conflicts = findShortcutConflicts([
      action({ id: 'a', shortcut: 'Esc' }),
      action({ id: 'b', shortcut: 'escape' }),
    ]);
    expect(conflicts).toHaveLength(1);
  });

  it('finds no conflicts among the shipped actions', () => {
    expect(findShortcutConflicts(SHELL_ACTIONS)).toEqual([]);
    const registry = new ActionRegistry();
    registry.register(SHELL_ACTIONS);
    expect(registry.conflicts()).toEqual([]);
  });
});

describe('enabledWhen and run', () => {
  it('treats an action without enabledWhen as always enabled', () => {
    expect(availability(action({ id: 'a' }), ctx())).toEqual({ enabled: true });
  });

  it('gates actions while a job is running', () => {
    const start = SHELL_ACTIONS.find((a) => a.id === 'tools.startIndexing');
    expect(start).toBeDefined();
    expect(availability(start as AppAction, ctx())).toEqual({ enabled: true });
    expect(availability(start as AppAction, ctx({ busy: 'indexing' }))).toEqual({
      enabled: false,
      reason: 'A job is already running',
    });
  });

  it('runs the action it names, using the context it is given', () => {
    const registry = new ActionRegistry();
    registry.register(SHELL_ACTIONS);
    const c = ctx();
    registry.get('nav.settings')?.run(c);
    expect(c.navigate).toHaveBeenCalledWith('settings');
    registry.get('palette.open')?.run(c);
    expect(c.openPalette).toHaveBeenCalled();
    registry.get('overlay.open')?.run(c);
    expect(c.openOverlay).toHaveBeenCalled();
    registry.get('nav.focusSearch')?.run(c);
    expect(c.focusSearch).toHaveBeenCalled();
    registry.get('library.addFolder')?.run(c);
    expect(c.addLibraryFolder).toHaveBeenCalled();
    registry.get('diagnostics.gallery')?.run(c);
    expect(c.navigate).toHaveBeenCalledWith('settings', 'settings-components');
  });

  it('keeps the legacy Options menu items, in their original order', () => {
    // `NAV-13`: these six were the old Options button, and the View menu that
    // replaced it must "carry every item over". That is a requirement about the
    // *old* items keeping their relative order — not that nothing may ever be
    // added, which would make it impossible to satisfy `PRV-01`'s "the View menu"
    // for the privacy-blur toggle.
    const menu = SHELL_ACTIONS.filter((a) => (a.surfaces ?? []).includes('menu')).map((a) => a.label);
    const legacy = [
      'Add library folder\u2026',
      'Start indexing',
      'Run panel separator',
      'Indexing status',
      'Batch prompt recovery',
      'Go to Settings',
    ];
    for (const label of legacy) expect(menu).toContain(label);
    const positions = legacy.map((label) => menu.indexOf(label));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
