import { useEffect, useRef, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Popover, PopoverHeading, PopoverItem, PopoverSeparator } from '../components/ui';
import { DENSITY_OPTIONS, TEXT_SCALE_VALUES, THEME_OPTIONS, type AppSettings, type Density } from '../types';
import {
  actionShortcuts,
  availability,
  formatShortcut,
  type ActionContext,
  type AppAction,
} from './actions';

/**
 * The View menu (design `NAV-13`).
 *
 * Theme, density and text scale apply immediately and are persisted through the
 * existing `app_settings` keys, so they are live controls here.
 *
 * Thumbnail size, grid mode and card overlay are **disabled with a stated
 * reason**: they are `browse.*` keys in the design's settings registry, which does
 * not exist yet (it is Stage D — see `docs/ui-inventory.md` §2). The current
 * `thumb_fit` setting is a different thing (how a card crops, not how big it is)
 * and is left in Settings so the two are not confused.
 */
export type ViewMenuProps = {
  settings: AppSettings | null;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /**
   * The registry's `menu`-surface actions (`NAV-31`). `NAV-13` says this popover
   * *replaces* the old Options button and must carry every item it held, so the
   * appearance controls and the old actions live in one menu.
   */
  menuActions: AppAction[];
  actionContext: ActionContext;
  onOpenSettings: () => void;
  openSignal?: number;
};

const REGISTRY_PENDING = 'Needs the settings registry (SET-01) — integration stage';

/**
 * One action row. Disabled actions stay visible and carry their reason in the
 * tooltip rather than disappearing, so the menu does not reshape itself.
 */
function ActionRow({ action, ctx }: { action: AppAction; ctx: ActionContext }) {
  const state = availability(action, ctx);
  const shortcuts = actionShortcuts(action).map((s) => formatShortcut(s));
  return (
    <button
      type="button"
      role="menuitem"
      // `NAV-31`: the row *is* the action, so it carries the action's id.
      data-action-id={action.id}
      aria-disabled={state.enabled ? undefined : true}
      title={state.enabled ? undefined : state.reason}
      className={state.enabled ? undefined : 'menu-item-disabled'}
      onClick={() => {
        if (state.enabled) void action.run(ctx);
      }}
    >
      <span className="menu-item-label">{action.label}</span>
      {shortcuts.length > 0 ? <kbd className="menu-shortcut">{shortcuts.join('  ')}</kbd> : null}
    </button>
  );
}

export function ViewMenu({
  settings,
  onUpdate,
  menuActions,
  actionContext,
  onOpenSettings,
  openSignal,
}: ViewMenuProps) {
  const [open, setOpen] = useState(false);
  const lastSignal = useRef(openSignal);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (openSignal === undefined || openSignal === lastSignal.current) return;
    lastSignal.current = openSignal;
    setOpen(true);
    buttonRef.current?.focus();
  }, [openSignal]);

  const theme = settings?.theme ?? 'dark';
  const density = settings?.density ?? 'comfortable';
  const textScale = settings?.text_scale ?? 100;

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="end"
      className="view-menu"
      label="View"
      trigger={
        <button
          type="button"
          ref={buttonRef}
          className="topbar-button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span>View</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      }
    >
      <PopoverHeading>Theme</PopoverHeading>
      <div className="menu-choice" role="group" aria-label="Theme">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            // `menuitemradio` is the valid child of `role="menu"` for a choice;
            // a bare `radio` inside a menu is a conformance error.
            role="menuitemradio"
            aria-checked={theme === option.value}
            className={`menu-chip${theme === option.value ? ' selected' : ''}`}
            onClick={() => onUpdate('theme', option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <PopoverHeading>Density</PopoverHeading>
      <div className="menu-choice" role="group" aria-label="Density">
        {DENSITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={density === option.value}
            className={`menu-chip${density === option.value ? ' selected' : ''}`}
            onClick={() => onUpdate('density', option.value as Density)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <PopoverHeading>Text size</PopoverHeading>
      <div className="menu-choice" role="group" aria-label="Text scale">
        {TEXT_SCALE_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            aria-checked={textScale === value}
            className={`menu-chip${textScale === value ? ' selected' : ''}`}
            onClick={() => onUpdate('text_scale', value)}
          >
            {value}%
          </button>
        ))}
      </div>

      <PopoverSeparator />
      <PopoverHeading>Browsing</PopoverHeading>
      <PopoverItem disabled reason={REGISTRY_PENDING}>
        Thumbnail size…
      </PopoverItem>
      <PopoverItem disabled reason={REGISTRY_PENDING}>
        Grid mode (uniform / rows)
      </PopoverItem>
      <PopoverItem disabled reason={REGISTRY_PENDING}>
        Card overlay (hover / always / never)
      </PopoverItem>

      <PopoverSeparator />
      <PopoverHeading>Actions</PopoverHeading>
      {menuActions.map((action) => (
        <ActionRow key={action.id} action={action} ctx={actionContext} />
      ))}

      <PopoverSeparator />
      <PopoverItem
        onClick={() => {
          setOpen(false);
          onOpenSettings();
        }}
      >
        All settings…
      </PopoverItem>
    </Popover>
  );
}