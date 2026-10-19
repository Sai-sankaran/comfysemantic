import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/tokens.css';
import '../src/index.css';
import '../src/App.css';
import { ExploreScreen } from '../src/features/explore/ExploreScreen';
import {
  FIXTURE_LIBRARIES,
  FIXTURE_SOURCE,
  resetFixtureFlags,
} from '../src/features/explore/exploreFixtures';
import {
  DEFAULT_PRIVACY,
  PrivacyProvider,
  usePrivacy,
  type PrivacySettings,
} from '../src/app/privacy';
import type { LibraryType } from '../src/features/explore/exploreTypes';

/**
 * Standalone harness for Explore (design §7.1, Appendix E.1–E.3).
 *
 * The real `ExploreScreen`, with the real deterministic fixture source and no
 * Tauri backend. That combination is the point: the full application at `/`
 * cannot reach Explore without a backend, because it has to list libraries
 * first, and it says so plainly rather than rendering an empty shell. This page
 * mounts the screen directly so the gallery, the table, the inspector, the flag
 * actions and privacy blur can be exercised in a real browser.
 *
 * Everything on this page is fixture data, and the screen labels it as such in
 * its own toolbar, so a screenshot can never be mistaken for a real library.
 *
 * The harness-only controls at the top are the settings that are otherwise
 * app-scoped and would need a Settings round trip: density, library type, and
 * privacy mode. They are wired straight to the same values the real registry
 * holds, so what is on screen is what the product would show.
 */

function Harness() {
  const [libraryId, setLibraryId] = useState(FIXTURE_LIBRARIES[0].id);
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const mask = usePrivacy();
  const library = FIXTURE_LIBRARIES.find((l) => l.id === libraryId) ?? FIXTURE_LIBRARIES[0];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="harness-bar" role="note">
        <strong>Harness</strong> &mdash; deterministic fixture data, no backend.
        <label>
          Library{' '}
          <select value={libraryId} onChange={(e) => setLibraryId(e.target.value)}>
            {FIXTURE_LIBRARIES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.type})
              </option>
            ))}
          </select>
        </label>
        <label>
          Density{' '}
          <select
            value={density}
            onChange={(e) => setDensity(e.target.value as typeof density)}
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
          </select>
        </label>
        <label>
          Privacy mode{' '}
          <select
            value={privacy.mode}
            onChange={(e) => setPrivacy((p) => ({ ...p, mode: e.target.value as PrivacySettings['mode'] }))}
          >
            <option value="blur">blur</option>
            <option value="colour">colour</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={privacy.hideText}
            onChange={(e) => setPrivacy((p) => ({ ...p, hideText: e.target.checked }))}
          />{' '}
          hide text
        </label>
        <button type="button" onClick={mask.toggle}>
          {mask.on ? 'Turn privacy blur off' : 'Turn privacy blur on'} (Ctrl+Shift+B)
        </button>
        <button
          type="button"
          onClick={() => {
            resetFixtureFlags();
            // A remount re-reads the catalogue, so the reset is visible.
            setLibraryId((id) => (id === libraryId ? libraryId : id));
            window.location.reload();
          }}
        >
          Reset fixture flags
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ExploreScreen
          source={FIXTURE_SOURCE}
          libraryId={library.id}
          libraryType={library.type as LibraryType}
          density={density}
        />
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <PrivacyProvider settings={DEFAULT_PRIVACY}>
      <Harness />
    </PrivacyProvider>,
  );
}