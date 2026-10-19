import type { ComponentType } from 'react';
import type { DestinationId, WorkspaceId } from './navigation';

/**
 * The action registry (design `NAV-30`–`NAV-32`).
 *
 * This is the single source of truth for every user-invocable action: its id,
 * label, icon, optional shortcut, where it is available, whether it is enabled
 * in the current context, and what it does. The command palette (`NAV-24`), the
 * shortcuts overlay (`NAV-25`), menus (`NAV-31`) and — when their screens exist —
 * context menus (`NAV-43`) all read from here. No component may hard-code a
 * shortcut (`NAV-31`).
 */

/** Where an action is surfaced. Menus are opt-in; the palette and overlay are not. */
export type ActionSurface = 'palette' | 'menu' | 'overlay';

/**
 * Where an action is available. `global` means "everywhere"; the rest are the
 * five rail destinations, so `contexts` can never name a screen that the
 * navigation model does not have.
 */
/**
 * `global` — available everywhere. A `DestinationId` — available inside that
 * destination. `'gallery'` — available only while the Explore **grid** owns
 * keyboard focus, which is what Appendix A's "Gallery and search results"
 * section actually means: `Space` must not peek from the search field, and
 * `←→` must not move the gallery while the user is in the folder tree.
 *
 * `NAV-26`'s "single-letter keys work only when focus is not in a text field" is
 * enforced separately, at dispatch time, for every context.
 */
export type ActionContextName = 'global' | DestinationId | 'gallery';

/** Runtime state an action needs: navigation and shell callbacks, plus a little app state. */
export type ActionContext = {
  /** Push a history entry and show `workspace` inside `destination`. */
  navigate: (destination: DestinationId, workspace?: WorkspaceId) => void;
  /** History cursor movement (`NAV-20`). */
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  openPalette: () => void;
  openOverlay: () => void;
  openLibraryMenu: () => void;
  openViewMenu: () => void;
  toggleJobDrawer: () => void;
  focusSearch: () => void;
  addLibraryFolder: () => void | Promise<void>;
  /** `NAV-04`: the shell-level folder tree. */
  toggleTree: () => void;
  /** `NAV-05`: the shell-level inspector. */
  toggleInspector: () => void;
  /**
   * `E.2` / `TBL-01`: the gallery's view mode.
   *
   * It lives in the shell rather than in Explore because `browse.viewMode` has
   * scopes A/L/F and the table has to survive the screen underneath changing;
   * the screen subscribes rather than owning it.
   */
  setViewMode: (mode: 'grid' | 'table') => void;
  /** `PRV-01`: the privacy-blur toggle. */
  privacyOn: boolean;
  togglePrivacy: () => void;
  submitSearch: (query: string) => void;
  activeLibraryName: string | null;
  busy: string | null;
};

export type ActionAvailability = { enabled: boolean; reason?: string };

export type AppAction = {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number | string; className?: string }>;
  /** A physical key combination, e.g. `mod+k`, `/`, `?`, `alt+arrowleft`. */
  shortcut?: string;
  /**
   * A second binding for the same action. Appendix A gives Settings both
   * `Ctrl+5` (the `Ctrl+1…Ctrl+5` rail range) and `Ctrl+,`; one action may own
   * more than one key without any component hard-coding either.
   */
  alsoShortcut?: string;
  contexts: ActionContextName[];
  /** Defaults to `['palette', 'overlay']`. */
  surfaces?: ActionSurface[];
  enabledWhen?: (ctx: ActionContext) => ActionAvailability;
  run: (ctx: ActionContext) => void | Promise<void>;
};

export const DEFAULT_SURFACES: ActionSurface[] = ['palette', 'overlay'];

/** Every key an action answers to, primary first. */
export function actionShortcuts(action: AppAction): string[] {
  const out: string[] = [];
  if (action.shortcut) out.push(action.shortcut);
  if (action.alsoShortcut) out.push(action.alsoShortcut);
  return out;
}

/** The context a screen contributes to actions that are not `global`. */
export function contextForDestination(destination: DestinationId): ActionContextName {
  return destination;
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

export type ParsedShortcut = {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
};

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  escape: 'escape',
  space: 'space',
  spacebar: 'space',
  ' ': 'space',
  del: 'delete',
  delete: 'delete',
  '\u2190': 'arrowleft',
  '\u2192': 'arrowright',
  '\u2191': 'arrowup',
  '\u2193': 'arrowdown',
  '\u2212': '-',
  '\u2013': '-',
  '\u2014': '-',
};

/** Keys that are themselves produced by holding Shift on a US layout. */
const SHIFTED_KEYS = new Set('?+!@#$%^&*()_:"<>~{}|'.split(''));

export function normalizeKey(key: string): string {
  const lower = key.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

/**
 * Parse a shortcut spec into modifiers plus a canonical key. A bare `+` is the
 * plus key, not a separator, so it is handled before splitting.
 */
export function parseShortcut(spec: string): ParsedShortcut {
  const trimmed = spec.trim();
  let parts: string[];
  if (trimmed === '+') {
    parts = ['+'];
  } else {
    parts = trimmed.split('+').map((p) => p.trim()).filter((p) => p.length > 0);
  }
  let mod = false;
  let ctrl = false;
  let meta = false;
  let alt = false;
  let shift = false;
  let key = '';
  for (const part of parts) {
    const p = part.toLowerCase();
    if (p === 'mod' || p === 'cmdorctrl') mod = true;
    else if (p === 'ctrl' || p === 'control') ctrl = true;
    else if (p === 'meta') meta = true;
    else if (p === 'alt' || p === 'option') alt = true;
    else if (p === 'shift') shift = true;
    else if (key !== '') throw new Error(`shortcut "${spec}" has more than one key`);
    else key = normalizeKey(part);
  }
  if (key === '') throw new Error(`shortcut "${spec}" has no key`);
  return { mod, ctrl, meta, alt, shift, key };
}

/** The canonical form used for equality and conflict detection. */
export function normalizeShortcut(spec: string): string {
  const p = parseShortcut(spec);
  const mods: string[] = [];
  if (p.mod) mods.push('mod');
  if (p.ctrl) mods.push('ctrl');
  if (p.meta) mods.push('meta');
  if (p.alt) mods.push('alt');
  if (p.shift) mods.push('shift');
  mods.push(p.key);
  return mods.join('+');
}

const KEY_LABELS: Record<string, string> = {
  arrowleft: '\u2190',
  arrowright: '\u2192',
  arrowup: '\u2191',
  arrowdown: '\u2193',
  escape: 'Esc',
  space: 'Space',
  enter: 'Enter',
  delete: 'Del',
};

/** Human-readable form, e.g. `Ctrl+K`, `Alt+←`, `?`. */
export function formatShortcut(spec: string, platform: 'mac' | 'other' = 'other'): string {
  const p = parseShortcut(spec);
  const mods: string[] = [];
  if (p.mod) mods.push(platform === 'mac' ? '\u2318' : 'Ctrl');
  if (p.ctrl) mods.push('Ctrl');
  if (p.meta) mods.push('Meta');
  if (p.alt) mods.push(platform === 'mac' ? '\u2325' : 'Alt');
  if (p.shift) mods.push('Shift');
  const key = KEY_LABELS[p.key] ?? (p.key.length === 1 ? p.key.toUpperCase() : p.key);
  return [...mods, key].join('+');
}

export type ShortcutEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

/**
 * Does a keyboard event match a shortcut spec? Shift is only enforced when the
 * spec asks for it or the key is not itself a shifted symbol, so `?` (Shift+/)
 * matches without the spec having to say `shift`.
 */
export function matchShortcut(event: ShortcutEvent, spec: string): boolean {
  const p = parseShortcut(spec);
  if (normalizeKey(event.key) !== p.key) return false;
  if (p.mod) {
    if (!(event.ctrlKey || event.metaKey)) return false;
  } else {
    if (event.ctrlKey !== p.ctrl) return false;
    if (event.metaKey !== p.meta) return false;
  }
  if (event.altKey !== p.alt) return false;
  if (p.shift && !event.shiftKey) return false;
  if (!p.shift && event.shiftKey && !SHIFTED_KEYS.has(p.key)) return false;
  return true;
}

/** `NAV-26`: single-letter shortcuts are inert while focus is in a text field. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/** A shortcut that carries no Ctrl/Alt/Meta modifier (a "single-letter" key). */
export function isUnmodifiedShortcut(spec: string): boolean {
  const p = parseShortcut(spec);
  return !p.mod && !p.ctrl && !p.meta && !p.alt;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type ShortcutConflict = { shortcut: string; ids: [string, string] };

/**
 * Do two context lists overlap? `global` means "available everywhere", so it
 * overlaps every other context — a global `Ctrl+K` and a search-only `Ctrl+K`
 * are *not* in disjoint contexts and must be reported as a conflict (`NAV-32`).
 */
export function contextsOverlap(a: ActionContextName[], b: ActionContextName[]): boolean {
  if (a.includes('global') || b.includes('global')) return true;
  return a.some((c) => b.includes(c));
}

/**
 * Two actions collide when they declare the same shortcut *and* their contexts
 * overlap. The same key in genuinely disjoint contexts is allowed (`NAV-32`).
 * Every declared binding of an action is checked, so a second key on one action
 * is guarded exactly like its primary.
 */
export function findShortcutConflicts(actions: AppAction[]): ShortcutConflict[] {
  const conflicts: ShortcutConflict[] = [];
  for (let i = 0; i < actions.length; i += 1) {
    const a = actions[i];
    for (let j = i + 1; j < actions.length; j += 1) {
      const b = actions[j];
      if (!contextsOverlap(a.contexts, b.contexts)) continue;
      for (const specA of actionShortcuts(a)) {
        const normalizedA = normalizeShortcut(specA);
        for (const specB of actionShortcuts(b)) {
          if (normalizedA !== normalizeShortcut(specB)) continue;
          conflicts.push({ shortcut: normalizedA, ids: [a.id, b.id] });
        }
      }
    }
  }
  return conflicts;
}

export class ActionRegistry {
  private actions = new Map<string, AppAction>();

  register(actions: AppAction[]): void {
    for (const action of actions) {
      if (this.actions.has(action.id)) {
        throw new Error(`duplicate action id: ${action.id}`);
      }
      if (action.shortcut) normalizeShortcut(action.shortcut);
      if (action.alsoShortcut) normalizeShortcut(action.alsoShortcut);
      this.actions.set(action.id, action);
    }
  }

  all(): AppAction[] {
    return [...this.actions.values()];
  }

  get(id: string): AppAction | undefined {
    return this.actions.get(id);
  }

  /** Actions available in a context: those scoped to it plus the global ones. */
  forContext(context: ActionContextName): AppAction[] {
    return this.all().filter(
      (a) => a.contexts.includes('global') || a.contexts.includes(context),
    );
  }

  bySurface(context: ActionContextName, surface: ActionSurface): AppAction[] {
    return this.forContext(context).filter((a) =>
      (a.surfaces ?? DEFAULT_SURFACES).includes(surface),
    );
  }

  conflicts(): ShortcutConflict[] {
    return findShortcutConflicts(this.all());
  }

  /**
   * The actions whose shortcut matches an event, in the given context. `NAV-26`
   * is applied by the caller: an unmodified shortcut never matches from a text
   * field. An action may own more than one key (`nav.settings`), so every
   * declared binding is checked.
   */
  matchShortcut(event: ShortcutEvent): AppAction[] {
    return this.all().filter((a) =>
      actionShortcuts(a).some((spec) => matchShortcut(event, spec)),
    );
  }
}

export function availability(action: AppAction, ctx: ActionContext): ActionAvailability {
  return action.enabledWhen ? action.enabledWhen(ctx) : { enabled: true };
}
