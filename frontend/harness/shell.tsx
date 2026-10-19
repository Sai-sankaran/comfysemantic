import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/tokens.css';
import '../src/index.css';
import '../src/App.css';
import { SHELL_REGISTRY } from '../src/app/shellActions';
import { contextForDestination, type ActionContext } from '../src/app/actions';
import { useViewHistory } from '../src/app/useViewHistory';
import type { LibraryRecord, AppSettings } from '../src/types';
import { Rail } from '../src/app/Rail';
import { LibraryMenu } from '../src/app/LibraryMenu';
import { Breadcrumb } from '../src/app/Breadcrumb';
import { ViewMenu } from '../src/app/ViewMenu';
import { SystemChip } from '../src/app/SystemChip';
import { Tray } from '../src/app/Tray';

/**
 * Standalone harness for the application shell (design §6.1).
 *
 * The real shell *components* — rail, top bar, breadcrumb, library switcher, View
 * menu, System chip, tray and job drawer — with no Tauri backend and no app
 * context, so their layout, tokens, popovers and shortcuts can be exercised in a
 * real browser. `AppShell` itself is not mounted here because it reads the app
 * context; its composition is covered by `shellActions.test.tsx` in jsdom.
 *
 * Every value below is fixture data and is labelled as such, so a screenshot of
 * this page can never be mistaken for real catalog output.
 *
 * Built by `vite.harness.config.ts` to `dist-harness/shell.html`.
 */

const LIBRARIES = [
  {
    id: 'L1',
    name: 'Sample library (fixture)',
    root_path: 'C:/fixtures/a',
    total_files: 12_043,
    missing_files: 3,
    image_embeddings: 4_210,
    last_scanned_at: null,
  },
  {
    id: 'L2',
    name: 'Comic pages (fixture)',
    root_path: 'C:/fixtures/b',
    total_files: 150,
    missing_files: 0,
    image_embeddings: 0,
    last_scanned_at: null,
  },
] as LibraryRecord[];

const APP_SETTINGS = {
  theme: 'dark',
  density: 'comfortable',
  text_scale: 100,
} as unknown as AppSettings;

function ShellHarness() {
  const history = useViewHistory({ destination: 'explore', workspace: 'browse' });
  const [selected, setSelected] = useState(0);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy] = useState<string | null>(null);

  const actionContext = useMemo<ActionContext>(
    () => ({
      navigate: (destination, workspace) => history.go({ destination, workspace: workspace! }),
      back: history.back,
      forward: history.forward,
      canBack: history.canBack,
      canForward: history.canForward,
      openPalette: () => undefined,
      openOverlay: () => undefined,
      openLibraryMenu: () => undefined,
      openViewMenu: () => undefined,
      toggleJobDrawer: () => setDrawerOpen((v) => !v),
      focusSearch: () => undefined,
      addLibraryFolder: () => undefined,
      submitSearch: () => undefined,
      activeLibraryName: LIBRARIES[0].name,
      busy,
      // Added after this harness was written; it rotted because nothing was
      // typechecking it. `tsconfig.harness.json` now puts it under `tsc -b`.
      toggleTree: () => undefined,
      toggleInspector: () => undefined,
      setViewMode: () => undefined,
      privacyOn: false,
      togglePrivacy: () => undefined,
    }),
    [history, busy],
  );

  const context = contextForDestination(history.view.destination);

  return (
    <div className="app-shell" data-destination={history.view.destination}>
      <Rail
        destination={history.view.destination}
        collapsed={railCollapsed}
        onSelect={(id) => history.go({ destination: id, workspace: 'browse' })}
        onToggleCollapsed={() => setRailCollapsed((v) => !v)}
        reviewCount={null}
        jobRunning={busy !== null}
        jobProgress={null}
      />

      <div className="shell-col">
        <header className="topbar">
          <LibraryMenu
            libraries={LIBRARIES}
            activeId="L1"
            onSelect={() => undefined}
            onAddLibrary={() => undefined}
          />
          <Breadcrumb
            libraryName={LIBRARIES[0].name}
            view={history.view}
            extra={history.view.destination === 'explore' ? [{ label: 'chapter-07' }] : undefined}
            onOpenLibrary={() => undefined}
            onOpenDestination={() => undefined}
            canBack={history.canBack}
            onBack={history.back}
            canForward={history.canForward}
            onForward={history.forward}
          />
          <div className="topbar-search">
            <input
              className="field"
              placeholder="Search library…   /  Ctrl+K"
              aria-label="Search library"
              readOnly
            />
          </div>
          <ViewMenu
            settings={APP_SETTINGS}
            onUpdate={() => undefined}
            menuActions={SHELL_REGISTRY.bySurface(context, 'menu')}
            actionContext={actionContext}
            onOpenSettings={() => undefined}
          />
          <SystemChip
            settings={{ runtime_status: 'ready' } as never}
            activeLibrary={LIBRARIES[0]}
            busy={busy}
            readOnly={false}
            onOpenDiagnostics={() => undefined}
          />
        </header>

        <div className="content">
          <main className="main">
            <h1>{history.view.destination}</h1>
            <p className="hint">
              workspace <code>{history.view.workspace}</code> · history depth{' '}
              <code>{history.depth}</code> · context <code>{context}</code>
            </p>
            <button type="button" onClick={() => setSelected((s) => (s === 0 ? 3 : 0))}>
              toggle selection ({selected})
            </button>
          </main>
        </div>

        <Tray
          expanded={drawerOpen}
          onToggle={() => setDrawerOpen((v) => !v)}
          busy={busy}
          selectedCount={selected}
          jobProgress={null}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<ShellHarness />);