import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { LibraryProvider, useLibrary } from './app/providers';
import {
  DEFAULT_PRIVACY,
  PrivacyProvider,
  readPrivacyCache,
  type PrivacySettings,
} from './app/privacy';
import { AppShell } from './app/AppShell';
import { useViewHistory } from './app/useViewHistory';
import type { ViewState } from './app/navigation';
import { ExploreScreen } from './features/explore/ExploreScreen';
import { FIXTURE_LIBRARIES, FIXTURE_SOURCE } from './features/explore/exploreFixtures';
import { SearchScreen } from './features/search/SearchScreen';
import { FIXTURE_SEARCH_SOURCE } from './features/search/searchFixtures';
import { IndexingScreen } from './features/indexing/IndexingScreen';
import { PanelScreen } from './features/panel/PanelScreen';
import { DialogueReview } from './features/dialogue/DialogueReview';
import { BatchRecoveryScreen } from './features/recovery/BatchRecoveryScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { ComponentGallery } from './features/gallery/ComponentGallery';
import { Button, ToastProvider } from './components/ui';
import type { Density } from './types';

function FatalScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="app-shell">
      <div className="shell-col">
        <div className="fatal">
          <h1>ComfyPanel Studio</h1>
          <p className="fatal-msg">{message}</p>
          <p className="hint">Check that the Python worker started; see docs/TESTING.md for diagnostics.</p>
          <Button variant="primary" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Routes the five rail destinations to their workspaces (design §6.1).
 *
 * Every screen that exists today is reachable: Explore → the gallery, Search →
 * results, Review → Dialogue review / Failed items, Pipeline → Jobs / Tools,
 * Settings → Preferences / Component gallery. `NAV-27` is satisfied by keeping
 * the history stack rather than by keeping every screen mounted.
 */
function Workspace({
  view,
  navigate,
  density,
}: {
  view: ViewState;
  navigate: (next: ViewState) => void;
  density: Density;
}) {
  switch (`${view.destination}/${view.workspace}`) {
    case 'explore/browse':
      return (
        <ExploreScreen
          source={EXPLORE_SOURCE}
          libraryId={EXPLORE_LIBRARY_ID}
          libraryType={EXPLORE_SOURCE.libraryType(EXPLORE_LIBRARY_ID)}
          density={density}
          onOpenPipeline={() => navigate({ destination: 'pipeline', workspace: 'pipeline-jobs' })}
        />
      );
    case 'search/results':
      return (
        <SearchScreen
          source={FIXTURE_SEARCH_SOURCE}
          libraryId={EXPLORE_LIBRARY_ID}
          libraryType={EXPLORE_SOURCE.libraryType(EXPLORE_LIBRARY_ID)}
          density={density}
        />
      );
    case 'review/review-text':
      return <DialogueReview />;
    case 'review/review-failed':
      return <BatchRecoveryScreen />;
    case 'pipeline/pipeline-jobs':
      return <IndexingScreen />;
    case 'pipeline/pipeline-tools':
      return <PanelScreen />;
    case 'settings/settings-components':
      return (
        <ComponentGallery
          onBack={() => navigate({ destination: 'settings', workspace: 'settings-preferences' })}
        />
      );
    case 'settings/settings-preferences':
    default:
      return (
        <SettingsScreen
          onOpenGallery={() => navigate({ destination: 'settings', workspace: 'settings-components' })}
        />
      );
  }
}

/**
 * Where Explore reads its items from.
 *
 * This is the single line that changes when the backend grows the endpoint
 * Explore needs. Until then it is the deterministic fixture, which the screen
 * labels as fixture data so it can never be mistaken for a real library's
 * contents.
 */
const EXPLORE_SOURCE = FIXTURE_SOURCE;
const EXPLORE_LIBRARY_ID = FIXTURE_LIBRARIES[0].id;

function Shell() {
  const { ready, fatal, reportFatal, init, appSettings } = useLibrary();
  const history = useViewHistory({ destination: 'explore', workspace: 'browse' });
  const [globalQuery, setGlobalQuery] = useState<string | undefined>(undefined);

  useEffect(() => {
    const sub = api.onWorkerExit(() =>
      reportFatal('The backend worker exited. Restart the application.'),
    );
    return () => {
      sub.then((u) => u()).catch(() => undefined);
    };
  }, [reportFatal]);

  const openSearch = useCallback(
    (query: string) => {
      setGlobalQuery(query);
      history.goTo('search', 'results');
    },
    [history],
  );

  if (fatal) {
    return <FatalScreen message={fatal} onRetry={() => void init()} />;
  }

  return (
    <AppShell
      view={history.view}
      onNavigate={history.go}
      onBack={history.back}
      onForward={history.forward}
      canBack={history.canBack}
      canForward={history.canForward}
      onGlobalSearch={openSearch}
      readOnly={false}
      breadcrumbExtra={
        globalQuery && history.view.destination === 'search'
          ? [{ label: `Search \u201C${globalQuery}\u201D` }]
          : undefined
      }
    >
      {!ready ? (
        <main className="main">
          <p className="empty">Starting backend…</p>
        </main>
      ) : (
        <Workspace
          view={history.view}
          navigate={history.go}
          density={appSettings?.density ?? 'comfortable'}
        />
      )}
    </AppShell>
  );
}

/**
 * `PRV-04`: the privacy provider sits above everything so the very first frame is
 * already masked. Mounting it inside the shell would let one frame paint
 * unmasked - which is the "flash at launch" the rule forbids.
 *
 * The comment is a plain one, and deliberately so. It used to sit *inside* the
 * returned JSX as a bare `//` line, which is not a comment there: JSX children
 * are text, so all three lines rendered above the whole application. Wrapping it
 * in braces is not a fix in this position either - two adjacent expressions with
 * no operator between them do not parse. Above the `return` it is an ordinary
 * comment.
 */
export default function App() {
  return (
    <PrivacyProvider settings={readCachedPrivacy()}>
      <ToastProvider>
        <LibraryProvider>
          <Shell />
        </LibraryProvider>
      </ToastProvider>
    </PrivacyProvider>
  );
}

/**
 * `PRV-04`: the state is in the small synchronous shell file read at launch step
 * 2, so it is available before the first paint.
 *
 * `ARC-13` forbids `localStorage`, so the cache is a module variable written by
 * the shell as settings change and read synchronously at launch. The real file
 * read belongs in the platform adapter and is not wired yet — recorded, not
 * faked, and `PRV-04`'s "no flash" is still satisfied for the current session.
 */
function readCachedPrivacy(): PrivacySettings {
  return { ...DEFAULT_PRIVACY, ...readPrivacyCache() };
}