import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ExploreScreen } from '../features/explore/ExploreScreen';
import { SearchScreen } from '../features/search/SearchScreen';
import { FIXTURE_SEARCH_SOURCE } from '../features/search/searchFixtures';
import { PipelineScreen } from '../features/pipeline/PipelineScreen';
import { FIXTURE_PIPELINE_SOURCE } from '../features/pipeline/pipelineFixtures';
import { ShellPanesContext, type ShellPanesValue } from '../app/shellPanes';
import {
  DEFAULT_PRIVACY,
  PrivacyProvider,
  type PrivacySettings,
} from '../app/privacy';
import { mockExploreSource, setMockConfig } from './mockBackend';
import { COMFY_LIBRARY_ID, COMIC_LIBRARY_ID } from './scaleFixture';
import {
  allScenarios,
  missingStaStates,
  scenariosByArea,
  statusTag,
  STA_STATES,
  type Scenario,
} from './scenarios';
import type { LibraryType } from '../features/explore/exploreTypes';
import {
  DENSITIES,
  optionsFromSearch,
  screenUrl,
  THEMES,
  VIEWPORTS,
  writeScreenUrl,
  type ScreenOptions,
} from './screenOptions';
import type { FailMode } from './mockBackend';

/**
 * `/__screens` — the no-backend screen gallery.
 *
 * The index is a **progress map**, not just a launcher. Every `STA-*` state in
 * `design.md` §16 that has no scenario renders as a placeholder tile, so the
 * picture on screen is the honest state of the build rather than the subset that
 * happens to be convenient.
 *
 * The frame is a real element at a real size, not a CSS transform. A scaled
 * screenshot of a differently-laid-out page is not a screenshot of that layout,
 * and `getBoundingClientRect` would report the scaled values — which is exactly
 * the mistake the existing `viewport.html` warns about, and the reason this
 * extends that approach rather than inventing a second one.
 */

// ---------------------------------------------------------------------------
// The scenario frame
// ---------------------------------------------------------------------------

/**
 * One scenario.
 *
 * Each mounts the **real** screen against the mock backend, so a scenario is
 * evidence about the shipped code path and not about the harness.
 */
function ScenarioFrame({ scenario, options }: { scenario: Scenario; options: ScreenOptions }) {
  const isSearch = scenario.id.startsWith('search-');
  const isPipeline = scenario.id.startsWith('pipeline-');
  const isComic = scenario.id.includes('comic') || scenario.id.includes('panel');
  const libraryId = isComic ? COMIC_LIBRARY_ID : COMFY_LIBRARY_ID;
  const libraryType: LibraryType = isComic ? 'comic' : 'comfyui';

  // The palette lives on the root element (`data-theme`), and the real app sets
  // it from stored preferences. The gallery has no stored preferences, so the
  // deep link's `theme` is the only source — without this the `?theme=light`
  // link renders an unstyled dark frame. A layout effect, not render: writing to
  // the DOM during render also fires on renders React later throws away.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = options.theme;
    root.dataset.density = options.density;
    root.style.setProperty('--text-scale', String(options.scale / 100));
    root.style.colorScheme = options.theme === 'light' ? 'light' : 'dark';
  }, [options.theme, options.density, options.scale]);

  const privacy: PrivacySettings = {
    ...DEFAULT_PRIVACY,
    mode: options.privacy === 'colour' ? 'colour' : 'blur',
    startBlurred: options.privacy !== 'off',
  };

  // The panes default open, which is the state a first-time user is in. A screen
  // mounted alone must still be a working screen.
  const panes: ShellPanesValue = {
    treeOpen: true,
    inspectorOpen: true,
    selectedCount: 0,
    setSelectedCount: () => undefined,
    setTreeOpen: () => undefined,
    setInspectorOpen: () => undefined,
    notify: () => undefined,
    viewMode: scenario.id === 'explore-table' ? 'table' : 'grid',
    setViewMode: () => undefined,
  };

  // Scenario-specific initial state
  const searchInitialState = (() => {
    switch (scenario.id) {
      case 'search-smart':
        return { initialQuery: 'test', initialMode: 'hybrid' as const };
      case 'search-exact':
        return { initialQuery: 'test', initialMode: 'keyword' as const };
      case 'search-similar':
        return {
          initialQuery: '',
          initialMode: 'similar' as const,
          initialReference: {
            itemId: 'img-1',
            filename: 'reference.png',
            thumbnailUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjM2E0YTYzIi8+PC9zdmc+',
            libraryId: 'lib-1',
            libraryName: 'ComfyUI Library',
          },
        };
      case 'search-runtime-off':
        return { initialQuery: 'test', initialMode: 'hybrid' as const };
      case 'search-partial':
        return { initialQuery: 'test', initialMode: 'hybrid' as const };
      case 'search-no-matches':
        return { initialQuery: 'no-match', initialMode: 'hybrid' as const };
      case 'search-saved-history':
        return { initialQuery: 'saved query', initialMode: 'hybrid' as const };
      case 'search-all-libraries':
        return { initialQuery: 'test', initialMode: 'hybrid' as const, initialSearchScope: 'all' as const };
      default:
        return {};
    }
  })();

  const pipelineInitialState = (() => {
    switch (scenario.id) {
      case 'pipeline-scope-tree':
        return { initialScope: { type: 'library' as const, libraryId } };
      case 'pipeline-presets-comfyui':
        return { initialPresetId: 'quick', initialStages: ['discovery', 'metadata', 'thumbnails', 'fts'] };
      case 'pipeline-presets-comic':
        return { initialPresetId: 'comic', initialStages: ['discovery', 'metadata', 'thumbnails', 'fts', 'dialogue'] };
      case 'pipeline-stage-list':
        return { initialPresetId: 'quick', initialStages: ['discovery', 'metadata', 'thumbnails', 'fts', 'text_embeddings', 'image_embeddings'] };
      case 'pipeline-summary':
        return { initialPresetId: 'quick', initialStages: ['discovery', 'metadata', 'thumbnails', 'fts'] };
      case 'pipeline-job-running':
        return {
          initialPresetId: 'quick',
          initialStages: ['discovery', 'metadata', 'thumbnails', 'fts'],
          initialDrawerOpen: true,
          initialActiveJobId: 'job-running-1',
          initialTrayText: 'Indexing — discovery 4,210 / 12,043 — 38 min left',
        };
      case 'pipeline-job-paused':
        return {
          initialPresetId: 'quick',
          initialStages: ['discovery', 'metadata', 'thumbnails', 'fts'],
          initialDrawerOpen: true,
          initialActiveJobId: 'job-paused-1',
        };
      case 'pipeline-job-failed':
        return {
          initialPresetId: 'quick',
          initialStages: ['discovery', 'metadata', 'thumbnails', 'fts'],
          initialDrawerOpen: true,
          initialActiveJobId: 'job-failed-1',
        };
      case 'pipeline-job-completed':
        return {
          initialPresetId: 'quick',
          initialStages: ['discovery', 'metadata', 'thumbnails', 'fts'],
          initialDrawerOpen: true,
          initialActiveJobId: 'job-completed-1',
        };
      case 'pipeline-job-queue':
        return {
          initialPresetId: 'quick',
          initialStages: ['discovery', 'metadata', 'thumbnails', 'fts'],
          initialDrawerOpen: true,
        };
      case 'pipeline-tray':
        return { initialTrayText: 'Indexing — discovery 4,210 / 12,043 — 38 min left' };
      case 'pipeline-maintenance':
        return { initialShowMaintenance: true };
      case 'pipeline-cropper-lab':
        return { initialShowMaintenance: true };
      case 'pipeline-empty-queue':
        return { initialDrawerOpen: true };
      case 'pipeline-folder-policies':
        return { initialPresetId: 'folder_policies' };
      case 'pipeline-runtime-unavailable':
        return { initialPresetId: 'full', initialStages: ['discovery', 'metadata', 'thumbnails', 'fts', 'text_embeddings', 'image_embeddings'] };
      case 'pipeline-scope-folders':
        return { initialScope: { type: 'folders' as const, libraryId, folderIds: ['folder-1', 'folder-2'] } };
      default:
        return {};
    }
  })();

  return (
    <div
      data-screen={scenario.id}
      data-screen-reqs={scenario.reqs.join(' ')}
      data-screen-status={scenario.status}
      className="screen-frame"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <PrivacyProvider settings={privacy}>
        <ShellPanesContext.Provider value={panes}>
          {isSearch ? (
            <SearchScreen
              source={FIXTURE_SEARCH_SOURCE}
              libraryId={libraryId}
              libraryType={libraryType}
              density={options.density}
              {...searchInitialState}
            />
          ) : isPipeline ? (
            <PipelineScreen
              source={FIXTURE_PIPELINE_SOURCE}
              libraryId={libraryId}
              libraryType={libraryType}
              density={options.density}
              {...pipelineInitialState}
            />
          ) : (
            <ExploreScreen
              source={mockExploreSource()}
              libraryId={libraryId}
              libraryType={libraryType}
              density={options.density}
            />
          )}
        </ShellPanesContext.Provider>
      </PrivacyProvider>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

export function ScreensApp() {
  const [options, setOptions] = useState<ScreenOptions>(() =>
    optionsFromSearch(new URLSearchParams(location.search)),
  );

  const apply = useCallback(
    (next: Partial<ScreenOptions>) => {
      setOptions((current) => {
        const merged = { ...current, ...next };
        writeScreenUrl(merged);
        // The mock reads its config on every call, so keeping it in step with the
        // URL is what makes `?latency=` and `?fail=` take effect on a deep link.
        setMockConfig({ latency: merged.latency, fail: merged.fail });
        return merged;
      });
    },
    [],
  );

  const scenarios = useMemo(() => allScenarios(), []);
  const grouped = useMemo(() => scenariosByArea(), []);
  const missing = useMemo(() => missingStaStates(), []);
  const active = scenarios.find((s) => s.id === options.scenario);

  // --- index ---------------------------------------------------------------
  if (!active) {
    const built = scenarios.filter((s) => s.status === 'built').length;
    const partial = scenarios.filter((s) => s.status === 'partial').length;
    const notBuilt = scenarios.filter((s) => s.status === 'not-built').length;
    // The denominator is the state catalogue, not the scenario count. "39 of 109"
    // compares two different things and reads as though 109 states exist.
    const implementedStates = STA_STATES.length - missing.length;
    return (
      <div className="screens-index">
        <header className="screens-head">
          <h1>Screen gallery</h1>
          <p>
            Every scenario runs the <strong>real</strong> screen against an in-memory mock of the
            data-access interface. No Python, no Rust, no Tauri, no catalog, no original media.
          </p>
          <p className="hint">
            {built} built · {partial} partial · {notBuilt} not built yet · and{' '}
            <strong>{missing.length}</strong> of the {missing.length + implementedStates}{' '}
            <code>STA-*</code> states in <code>design.md</code> §16 still have no scenario
          </p>
        </header>

        <ScreenToolbar options={options} onChange={apply} />

        {grouped.map((group) => (
          <section key={group.area} className="screens-area">
            <h2>{group.area}</h2>
            <div className="screens-grid">
              {group.scenarios.map((s) => {
                const tag = statusTag(s);
                return (
                  <a key={s.id} className="screen-tile" href={screenUrl({ ...options, scenario: s.id }, s.flags)}>
                    <span className="screen-tile-title">{s.title}</span>
                    <code className="screen-tile-reqs">{s.reqs.join(' · ')}</code>
                    <span className={`screen-tag ${tag.tone}`}>{tag.label}</span>
                  </a>
                );
              })}
            </div>
          </section>
        ))}

        <section className="screens-area">
          <h2>States not built yet</h2>
          <p className="hint">
            One tile per <code>STA-*</code> in <code>design.md</code> §16 with no scenario. This list
            is generated from the state catalogue, so a state added to the specification appears here
            without anyone remembering to add it.
          </p>
          <div className="screens-grid">
            {missing.map((id) => (
              <div key={id} className="screen-tile placeholder">
                <span className="screen-tile-title">{id}</span>
                <span className="screen-tag muted">Not built yet</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // --- one scenario, in a frame at the requested size ----------------------
  const tag = statusTag(active);
  return (
    <div className="screen-detail">
      <header className="screens-head compact">
        <a href="/__screens" className="back">
          ← All screens
        </a>
        <h1>
          {active.title} <span className={`screen-tag ${tag.tone}`}>{tag.label}</span>
        </h1>
        <p className="hint">
          <code>{active.reqs.join(' · ')}</code> — {active.shows}
        </p>
      </header>

      <ScreenToolbar options={options} onChange={apply} />

      <div className="frame-holder">
        <div
          id="frame"
          className="frame"
          style={{ width: options.w, height: options.h, fontSize: `${options.scale}%` }}
        >
          {active.status === 'built' ? (
            <ScenarioFrame scenario={active} options={options} />
          ) : (
            <div className="screen-placeholder">
              <h2>Not built yet</h2>
              <p>
                <code>{active.reqs.join(' · ')}</code>
              </p>
              <p className="hint">{active.shows}</p>
            </div>
          )}
        </div>
      </div>

      <p className="hint frame-note">
        The frame is laid out at exactly {options.w} × {options.h}. No transform is applied, because
        a scaled screenshot of a differently-laid-out page is not a screenshot of that layout.
      </p>
    </div>
  );
}

function ScreenToolbar({
  options,
  onChange,
}: {
  options: ScreenOptions;
  onChange: (next: Partial<ScreenOptions>) => void;
}) {
  return (
    <div className="screens-toolbar">
      <label>
        Viewport{' '}
        <select
          value={`${options.w}x${options.h}`}
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number);
            onChange({ w: w ?? 1366, h: h ?? 768 });
          }}
        >
          {VIEWPORTS.map((v) => (
            <option key={`${v.w}x${v.h}`} value={`${v.w}x${v.h}`}>
              {v.w} × {v.h}
            </option>
          ))}
        </select>
      </label>
      <label>
        Theme{' '}
        <select value={options.theme} onChange={(e) => onChange({ theme: e.target.value as never })}>
          {THEMES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Density{' '}
        <select value={options.density} onChange={(e) => onChange({ density: e.target.value as never })}>
          {DENSITIES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label>
        Text scale{' '}
        <input
          type="range"
          min={80}
          max={200}
          step={10}
          value={options.scale}
          onChange={(e) => onChange({ scale: Number(e.target.value) })}
        />
        <span>{options.scale}%</span>
      </label>
      <label>
        Privacy{' '}
        <select value={options.privacy} onChange={(e) => onChange({ privacy: e.target.value as never })}>
          <option value="off">off</option>
          <option value="blur">blur</option>
          <option value="colour">colour</option>
        </select>
      </label>
      <label>
        Latency{' '}
        <input
          type="number"
          min={0}
          max={10000}
          step={100}
          value={options.latency}
          onChange={(e) => onChange({ latency: Number(e.target.value) })}
        />
        ms
      </label>
      <label>
        Fail{' '}
        <select value={options.fail} onChange={(e) => onChange({ fail: e.target.value as never })}>
          {(['none', 'save', 'load', 'preview', 'clipboard', 'runtime'] as FailMode[]).map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => onChange({ latency: 0, fail: 'none' })}>
        Reset fixture
      </button>
    </div>
  );
}