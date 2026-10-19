import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Command,
  Crop,
  Database,
  EyeOff,
  FolderPlus,
  FolderTree,
  Images,
  Keyboard,
  LayoutGrid,
  ListChecks,
  MessagesSquare,
  PanelBottom,
  PanelRight,
  Search,
  Settings,
  Table2,
} from 'lucide-react';
import { ActionRegistry, type AppAction } from './actions';

/**
 * The actions the application actually has today (`NAV-30`).
 *
 * They are pure data: every one reads what it needs from the `ActionContext`
 * passed to `run`/`enabledWhen`, so the same list works from the palette, the
 * shortcuts overlay, the window keydown dispatcher, the rail and the menus. Only
 * shortcuts the design Appendix A defines for actions that exist are assigned;
 * everything else is registered without one (the missing ones are tracked in
 * `tests/test_action_registry_drift.py`, not invented here).
 *
 * The array order is the palette/menu order.
 */
export const SHELL_ACTIONS: AppAction[] = [
  {
    id: 'palette.open',
    label: 'Command palette',
    icon: Command,
    shortcut: 'mod+k',
    contexts: ['global'],
    // Listed in the shortcuts overlay, but not *inside* itself.
    surfaces: ['overlay'],
    run: (ctx) => ctx.openPalette(),
  },
  {
    id: 'overlay.open',
    label: 'Keyboard shortcuts',
    icon: Keyboard,
    shortcut: '?',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.openOverlay(),
  },
  {
    id: 'quickSwitcher.open',
    label: 'Quick switcher',
    icon: FolderTree,
    // Design `NAV-23`. Not built yet: it needs pinned folders, saved searches and
    // recent views, none of which exist. Registered without a shortcut so the
    // palette can name the gap rather than a dead key.
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    enabledWhen: () => ({ enabled: false, reason: 'Not implemented yet (NAV-23)' }),
    run: () => undefined,
  },

  {
    id: 'nav.back',
    label: 'Back',
    icon: ArrowLeft,
    shortcut: 'alt+arrowleft',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    enabledWhen: (ctx) => (ctx.canBack ? { enabled: true } : { enabled: false, reason: 'At the oldest view' }),
    run: (ctx) => ctx.back(),
  },
  {
    id: 'nav.forward',
    label: 'Forward',
    icon: ArrowRight,
    shortcut: 'alt+arrowright',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    enabledWhen: (ctx) =>
      ctx.canForward ? { enabled: true } : { enabled: false, reason: 'At the newest view' },
    run: (ctx) => ctx.forward(),
  },
  {
    id: 'library.menu',
    label: 'Library menu',
    icon: FolderTree,
    shortcut: 'mod+shift+l',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.openLibraryMenu(),
  },

  {
    id: 'nav.focusSearch',
    label: 'Focus search',
    icon: Search,
    shortcut: '/',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.focusSearch(),
  },
  {
    id: 'jobs.drawer',
    label: 'Toggle job drawer',
    icon: PanelBottom,
    shortcut: 'mod+j',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.toggleJobDrawer(),
  },
  {
    id: 'view.menu',
    label: 'View menu',
    icon: LayoutGrid,
    contexts: ['global'],
    // Palette only: the View menu does not list itself.
    surfaces: ['palette'],
    run: (ctx) => ctx.openViewMenu(),
  },

  // --- Library / pipeline tools -------------------------------------------
  {
    id: 'library.addFolder',
    label: 'Add library folder\u2026',
    icon: FolderPlus,
    contexts: ['global'],
    surfaces: ['palette', 'menu'],
    enabledWhen: (ctx) =>
      ctx.busy ? { enabled: false, reason: 'A job is already running' } : { enabled: true },
    run: (ctx) => ctx.addLibraryFolder(),
  },
  {
    id: 'tools.startIndexing',
    label: 'Start indexing',
    icon: Activity,
    contexts: ['global'],
    surfaces: ['palette', 'menu'],
    enabledWhen: (ctx) =>
      ctx.busy ? { enabled: false, reason: 'A job is already running' } : { enabled: true },
    run: (ctx) => ctx.navigate('pipeline', 'pipeline-jobs'),
  },
  {
    id: 'tools.panelSeparator',
    label: 'Run panel separator',
    icon: Crop,
    contexts: ['global'],
    surfaces: ['palette', 'menu'],
    run: (ctx) => ctx.navigate('pipeline', 'pipeline-tools'),
  },
  {
    id: 'tools.indexingStatus',
    label: 'Indexing status',
    icon: Activity,
    contexts: ['global'],
    surfaces: ['menu'],
    run: (ctx) => ctx.navigate('pipeline', 'pipeline-jobs'),
  },
  {
    id: 'tools.recovery',
    label: 'Batch prompt recovery',
    icon: Database,
    contexts: ['global'],
    surfaces: ['palette', 'menu'],
    run: (ctx) => ctx.navigate('review', 'review-failed'),
  },
  {
    id: 'review.openWorkspace',
    label: 'Open Dialogue review',
    icon: MessagesSquare,
    contexts: ['global'],
    surfaces: ['palette'],
    run: (ctx) => ctx.navigate('review', 'review-text'),
  },
  // --- Navigation (design §6.1, Appendix A `Ctrl+1 … Ctrl+5`) ----------------
  // Written out one by one rather than generated, because the Appendix A drift
  // guard parses this file as text: a generated block would hide these five
  // shortcuts from it. `shellActions.test.tsx` asserts instead that every one of
  // them agrees with `DESTINATIONS`, so the rail and the registry still cannot
  // disagree.
  {
    id: 'nav.explore',
    label: 'Go to Explore',
    icon: Images,
    shortcut: 'mod+1',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.navigate('explore'),
  },
  {
    id: 'nav.search',
    label: 'Go to Search',
    icon: Search,
    shortcut: 'mod+2',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.navigate('search'),
  },
  {
    id: 'nav.review',
    label: 'Go to Review',
    icon: MessagesSquare,
    shortcut: 'mod+3',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.navigate('review'),
  },
  {
    id: 'nav.pipeline',
    label: 'Go to Pipeline',
    icon: Activity,
    shortcut: 'mod+4',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.navigate('pipeline'),
  },
  {
    id: 'nav.settings',
    label: 'Go to Settings',
    icon: Settings,
    // Appendix A gives Settings `Ctrl+5` (the rail range) *and* `Ctrl+,`.
    shortcut: 'mod+5',
    alsoShortcut: 'mod+,',
    contexts: ['global'],
    // `NAV-13`: the View menu replaces the old Options button, and "Open Settings"
    // was one of its items, so this one destination is also on the `menu` surface.
    surfaces: ['palette', 'menu', 'overlay'],
    run: (ctx) => ctx.navigate('settings'),
  },

  // --- Explore (design §7.1, `NAV-04` / `NAV-05`) --------------------------
  {
    id: 'view.toggleTree',
    label: 'Toggle folder tree',
    icon: FolderTree,
    // Appendix A, Global: `B`.
    shortcut: 'b',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.toggleTree(),
  },
  {
    id: 'view.toggleInspector',
    label: 'Toggle inspector',
    icon: PanelRight,
    // Appendix A, Global: `I`.
    shortcut: 'i',
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.toggleInspector(),
  },
  {
    id: 'view.gridMode',
    label: 'Grid view',
    icon: LayoutGrid,
    // Appendix E.9: `Alt+1`. The documented fallback is `Ctrl+Shift+1`, and
    // Appendix E.9 says it *replaces* the Alt binding rather than accompanying
    // it — so only the Alt key is registered while `VERIFY` A1 is unresolved.
    // When A1 resolves against Alt, this binding changes to `mod+shift+1` and
    // Appendix A is regenerated from the registry.
    shortcut: 'alt+1',
    contexts: ['global'],
    // Not on the View menu: `NAV-31` requires that menu to hold the old Options
    // items in their original order.
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.setViewMode('grid'),
  },
  {
    id: 'privacy.toggle',
    label: 'Privacy blur',
    icon: EyeOff,
    // Appendix E.9: `Ctrl+Shift+B`. Unlike the Alt keys this one does not depend
    // on `VERIFY` A1, so it is bound now.
    shortcut: 'mod+shift+b',
    contexts: ['global'],
    // On the `menu` surface so `PRV-01`'s "the View menu" is real. It is a
    // toggle, not a radio, so it does not disturb `NAV-31`'s item order — it is
    // appended after the old Options items.
    surfaces: ['palette', 'menu', 'overlay'],
    run: (ctx) => ctx.togglePrivacy(),
  },
  {
    id: 'view.tableMode',
    label: 'Table view',
    icon: Table2,
    // Appendix E.9: `Alt+2`, with the same `Ctrl+Shift+2` fallback pending A1.
    shortcut: 'alt+2',
    contexts: ['global'],
    // `E.2` calls these "plus palette actions", and they are deliberately *not*
    // on the View menu: `NAV-31` requires that menu to carry the old Options
    // items in their original order, and two new entries would change it.
    surfaces: ['palette', 'overlay'],
    run: (ctx) => ctx.setViewMode('table'),
  },
  {
    id: 'gallery.peek',
    label: 'Peek focused image',
    icon: Images,
    // Appendix A, "Gallery and search results": `Space`.
    shortcut: 'space',
    contexts: ['gallery'],
    // Palette excluded: a grid-only key offered from the command palette would
    // have no focused card to act on.
    surfaces: ['overlay'],
    run: () => undefined,
  },
  {
    id: 'gallery.selectAll',
    label: 'Select all loaded images',
    icon: ListChecks,
    // Appendix A: `Ctrl+A`.
    shortcut: 'mod+a',
    contexts: ['gallery'],
    surfaces: ['overlay'],
    run: () => undefined,
  },

  {
    id: 'diagnostics.gallery',
    label: 'Open component gallery',
    icon: LayoutGrid,
    // Only offered while Settings is open (`NAV-30` contexts).
    contexts: ['settings'],
    surfaces: ['palette'],
    run: (ctx) => ctx.navigate('settings', 'settings-components'),
  },
  {
    id: 'diagnostics.page',
    label: 'Open Diagnostics',
    icon: ListChecks,
    // Design `DGN-01`. The Diagnostics page is not built yet; the component
    // gallery is the only Diagnostics entry point that exists.
    contexts: ['global'],
    surfaces: ['palette', 'overlay'],
    enabledWhen: () => ({ enabled: false, reason: 'Diagnostics page is not built yet (DGN-01)' }),
    run: () => undefined,
  },
];

/**
 * The one registry instance the shell uses.
 *
 * Built once at module scope rather than per render: it is immutable after
 * registration, every surface must see the same instance, and `register` fails
 * loudly here if two actions ever claim the same id.
 */
export const SHELL_REGISTRY: ActionRegistry = (() => {
  const registry = new ActionRegistry();
  registry.register(SHELL_ACTIONS);
  return registry;
})();