import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { destinationOf, type DestinationId, type ViewState, type WorkspaceId } from './navigation';
import { useLibrary } from './providers';
import { Input, Tabs } from '../components/ui';
import {
  contextForDestination,
  formatShortcut,
  type ActionContext,
} from './actions';
import { SHELL_REGISTRY } from './shellActions';
import { useActionHotkeys } from './useActionHotkeys';
import { ShellPanesContext, UNDO_WINDOW_MS, type ShellPanesValue, type UndoOffer } from './shellPanes';
import { usePrivacy } from './privacy';
import { CommandPalette } from '../features/palette/CommandPalette';
import { ShortcutOverlay } from '../features/palette/ShortcutOverlay';
import { Rail } from './Rail';
import { LibraryMenu } from './LibraryMenu';
import { Breadcrumb, type BreadcrumbSegment } from './Breadcrumb';
import { ViewMenu } from './ViewMenu';
import { SystemChip } from './SystemChip';
import { Tray } from './Tray';
import { api } from '../api';

export type AppShellProps = {
  view: ViewState;
  /** Push a history entry (`NAV-20`). */
  onNavigate: (next: ViewState) => void;
  onBack: () => void;
  onForward: () => void;
  canBack: boolean;
  canForward: boolean;
  onGlobalSearch: (query: string) => void;
  /**
   * Ignored when the shell is driving the selection itself (which it now is:
   * Explore reports its count through `ShellPanes`). Kept so a caller that
   * manages its own selection — the harness, a test — still works.
   */
  selectedCount?: number;
  /** The catalog is open read-only. */
  readOnly: boolean;
  /** Extra breadcrumb segments contributed by the active screen (`NAV-11`). */
  breadcrumbExtra?: BreadcrumbSegment[];
  children: ReactNode;
};

/**
 * The application shell (design §6.1).
 *
 * Layout: rail · [top bar] · main surface · tray, with the job drawer expanding
 * above the tray. Everything else in the app renders inside `children`.
 */
export function AppShell({
  view,
  onNavigate,
  onBack,
  onForward,
  canBack,
  canForward,
  onGlobalSearch,
  selectedCount: selectedCountProp,
  readOnly,
  breadcrumbExtra,
  children,
}: AppShellProps) {
  const { settings, appSettings, activeLibrary, libraries, libraryId, busy, refreshLibraries, selectLibrary, updateAppSetting } =
    useLibrary();
  const destination = destinationOf(view.destination);

  // `NAV-03`: expanded at >= 1280 px. Below that the rail is collapsed, which is
  // also the `S` breakpoint rule (`NAV-06`). A manual choice wins over the
  // automatic one for the rest of the session.
  const [railChoice, setRailChoice] = useState<'auto' | 'expanded' | 'collapsed'>('auto');
  const [wide, setWide] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1280,
  );
  const railCollapsed = railChoice === 'auto' ? !wide : railChoice === 'collapsed';

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 1280);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  // `PRV-01`–`PRV-10`. The provider owns the state; the shell only reads `on` so
  // the action context and the tray chip can show it.
  const privacy = usePrivacy();
  // `NAV-51`: the Undo action on the current note, and the timer that retires it
  // after 8 seconds.
  const [noteUndo, setNoteUndo] = useState<UndoOffer | null>(null);
  const noteTimer = useRef<number | null>(null);

  const clearNote = useCallback(() => {
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = null;
    setNoteUndo(null);
    setNote(null);
  }, []);

  const notify = useCallback<ShellPanesValue['notify']>((message, undo) => {
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    setNote(message);
    setNoteUndo(undo ? { ...undo } : null);
    // `NAV-51`: 8 seconds. A new message replaces the old one *and* its timer,
    // so a second action cannot leave a stale Undo pointing at the first.
    if (undo) noteTimer.current = window.setTimeout(() => {
      noteTimer.current = null;
      setNoteUndo(null);
    }, UNDO_WINDOW_MS);
  }, []);

  useEffect(() => () => {
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [libraryMenuSignal, setLibraryMenuSignal] = useState(0);
  const [viewMenuSignal, setViewMenuSignal] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // `E.2`: `browse.viewMode` is a setting with scopes A/L/F, so the shell owns it
  // and the `Alt+1` / `Alt+2` actions can reach it from any destination.
  const [viewModeSignal, setViewModeSignal] = useState<'grid' | 'table'>('grid');
  const searchRef = useRef<HTMLInputElement>(null);

  // `NAV-04` / `NAV-05`: the folder tree and the inspector are shell-level
  // surfaces, so their open state lives here rather than inside Explore — which
  // is also what makes `B` and `I` work from the folder tree or the inspector
  // itself. Explore reads them through `ShellPanes`, so it does not need them
  // threaded through `App`.
  const [treeOpen, setTreeOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // `NAV-07`: the tray's "N selected" reads the gallery's selection, which
  // Explore reports up rather than duplicating here. A caller-supplied count
  // still wins, so the harness and the tests keep working.
  const [reportedSelectedCount, setReportedSelectedCount] = useState(0);
  const selectedCount = selectedCountProp ?? reportedSelectedCount;

  const shellPanes = useMemo<ShellPanesValue>(
    () => ({
      treeOpen,
      inspectorOpen,
      selectedCount,
      setSelectedCount: setReportedSelectedCount,
      setTreeOpen,
      setInspectorOpen,
      notify,
      viewMode: viewModeSignal,
      setViewMode: setViewModeSignal,
    }),
    // `setNote` and `setViewModeSignal` are stable state setters; the compiler
    // cannot see that, and listing them would change nothing about when this
    // value is recomputed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [treeOpen, inspectorOpen, selectedCount, viewModeSignal, notify],
  );

  const registry = SHELL_REGISTRY;

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  const submit = () => {
    const q = query.trim();
    if (!q) return;
    onGlobalSearch(q);
    setQuery('');
  };

  const submitSearch = useCallback(
    (q: string) => {
      const t = q.trim();
      if (t) onGlobalSearch(t);
    },
    [onGlobalSearch],
  );

  const addLibraryFolder = useCallback(async () => {
    const dir = await api.openDirectory('Add library folder');
    if (!dir) return;
    try {
      await api.registerLibrary(dir);
      await refreshLibraries();
      setNote(`Added library: ${dir}`);
    } catch (e) {
      setNote(`Could not add library: ${String(e)}`);
    }
  }, [refreshLibraries, setNote]);

  const actionContext = useMemo<ActionContext>(
    () => ({
      navigate: (dest: DestinationId, workspace?: WorkspaceId) =>
        onNavigate({ destination: dest, workspace: workspace ?? destinationOf(dest).workspaces[0].id }),
      back: onBack,
      forward: onForward,
      canBack,
      canForward,
      openPalette: () => setPaletteOpen(true),
      openOverlay: () => setOverlayOpen(true),
      openLibraryMenu: () => setLibraryMenuSignal((n) => n + 1),
      openViewMenu: () => setViewMenuSignal((n) => n + 1),
      toggleJobDrawer: () => setDrawerOpen((v) => !v),
      focusSearch,
      addLibraryFolder,
      submitSearch,
      activeLibraryName: activeLibrary?.name ?? null,
      busy,
      toggleTree: () => setTreeOpen((v) => !v),
      toggleInspector: () => setInspectorOpen((v) => !v),
      setViewMode: (mode) => setViewModeSignal(mode),
      privacyOn: privacy.on,
      togglePrivacy: privacy.toggle,
    }),
    [
      onNavigate,
      onBack,
      onForward,
      canBack,
      canForward,
      focusSearch,
      addLibraryFolder,
      submitSearch,
      activeLibrary,
      busy,
      // Stable state setters the callbacks close over; listed so the compiler can
      // still preserve the memoisation.
      setDrawerOpen,
      setOverlayOpen,
      setPaletteOpen,
      setViewModeSignal,
      privacy.on,
      privacy.toggle,
    ],
  );

  const modalOpen = paletteOpen || overlayOpen;
  useActionHotkeys(registry, view.destination, actionContext, !modalOpen);

  const menuActions = registry.bySurface(contextForDestination(view.destination), 'menu');

  const focusKey = registry.get('nav.focusSearch')?.shortcut;
  const paletteKey = registry.get('palette.open')?.shortcut;
  const searchHint = [focusKey && formatShortcut(focusKey), paletteKey && formatShortcut(paletteKey)]
    .filter(Boolean)
    .join('  ');
  const placeholder = searchHint ? `Search library\u2026   ${searchHint}` : 'Search library\u2026';

  const visibleWorkspaces = destination.workspaces.filter((w) => !w.hidden);

  return (
    <div className="app-shell" data-destination={view.destination}>
      <Rail
        destination={view.destination}
        collapsed={railCollapsed}
        onSelect={(id) => onNavigate({ destination: id, workspace: destinationOf(id).workspaces[0].id })}
        onToggleCollapsed={() =>
          setRailChoice(railCollapsed ? 'expanded' : 'collapsed')
        }
        // `REV-01`'s badge needs the Needs-Attention counts, which arrive with the
        // Review landing. `null` renders no badge rather than a fabricated zero.
        reviewCount={null}
        jobRunning={busy !== null}
        jobProgress={null}
      />

      <div className="shell-col">
        <header className="topbar">
          <LibraryMenu
            libraries={libraries}
            activeId={libraryId}
            onSelect={(id) => selectLibrary(id)}
            onAddLibrary={() => void addLibraryFolder()}
            openSignal={libraryMenuSignal}
          />

          <Breadcrumb
            libraryName={activeLibrary?.name ?? null}
            view={view}
            extra={breadcrumbExtra}
            onOpenLibrary={() => setLibraryMenuSignal((n) => n + 1)}
            onOpenDestination={() =>
              onNavigate({ destination: view.destination, workspace: destinationOf(view.destination).workspaces[0].id })
            }
            canBack={canBack}
            onBack={onBack}
            canForward={canForward}
            onForward={onForward}
          />

          <div className="topbar-search">
            <SearchIcon size={14} aria-hidden="true" />
            <Input
              ref={searchRef}
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              aria-label="Search library"
            />
          </div>

          <ViewMenu
            settings={appSettings}
            onUpdate={(key, value) => void updateAppSetting(key, value)}
            menuActions={menuActions}
            actionContext={actionContext}
            onOpenSettings={() => onNavigate({ destination: 'settings', workspace: 'settings-preferences' })}
            openSignal={viewMenuSignal}
          />

          <SystemChip
            settings={settings}
            activeLibrary={activeLibrary}
            busy={busy}
            readOnly={readOnly}
            onOpenDiagnostics={() => setNote('Diagnostics is not built yet (DGN-01).')}
          />
        </header>

        {/*
          A destination with more than one workspace gets a tab strip. It is the
          shared `Tabs` control, so it carries the ARIA tabs semantics and the
          arrow-key movement rather than hand-written markup (`CTL-01`).
        */}
        {visibleWorkspaces.length > 1 ? (
          <div className="workspace-strip">
            <Tabs
              aria-label={`${destination.label} views`}
              items={visibleWorkspaces.map((w) => ({ id: w.id, label: w.label }))}
              value={view.workspace}
              onChange={(workspace) =>
                onNavigate({ destination: view.destination, workspace })
              }
            />
          </div>
        ) : null}

        {note && (
          <div className="notice-bar" role="status">
            <span>{note}</span>
            {/* `NAV-51`: a reversible action offers Undo for 8 seconds rather than
                a confirmation dialog. The countdown is not shown — an animated
                timer a user has to watch to know whether Undo is still available
                is worse than a plain 8 seconds. */}
            {noteUndo ? (
              <button
                type="button"
                className="notice-undo"
                onClick={() => {
                  void noteUndo.run();
                  clearNote();
                }}
              >
                {noteUndo.label}
              </button>
            ) : null}
            <button type="button" onClick={clearNote} aria-label="Dismiss">
              &times;
            </button>
          </div>
        )}

        {/* `NAV-04`/`NAV-05`/`NAV-07`: the shell owns the tree, the inspector and the
            selection count, so a screen below can read and report them without
            threading the state through `App`. A JSX comment has to be wrapped -
            a bare `//` line inside JSX children is text, and was rendered as a
            paragraph of source code above the content area. */}
        <div className="content">
          <ShellPanesContext.Provider value={shellPanes}>{children}</ShellPanesContext.Provider>
        </div>

        <Tray
          expanded={drawerOpen}
          onToggle={() => setDrawerOpen((v) => !v)}
          busy={busy}
          selectedCount={selectedCount}
          jobProgress={null}
          privacyOn={privacy.on}
          onTogglePrivacy={privacy.toggle}
        />
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        registry={registry}
        context={contextForDestination(view.destination)}
        actionContext={actionContext}
      />
      <ShortcutOverlay
        open={overlayOpen}
        onClose={() => setOverlayOpen(false)}
        registry={registry}
        context={contextForDestination(view.destination)}
      />
    </div>
  );
}