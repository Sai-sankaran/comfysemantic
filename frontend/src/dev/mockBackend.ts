import type { ExploreSource } from '../features/explore/exploreTypes';
import { scaleSource, COMFY_LIBRARY_ID, COMIC_LIBRARY_ID, comfyItemCount } from './scaleFixture';

/**
 * The in-memory mock backend behind `npm run dev`.
 *
 * It implements the **same** data-access interfaces the real backend is plugged
 * into — `ExploreSource` here, and the `api` surface through `mockApi` — so a
 * scenario drives real UI code rather than a parallel imitation of it. That is
 * the difference between a harness that catches a regression and one that only
 * proves the mock works.
 *
 * The switches (`latency`, `fail`) exist because the states that matter are the
 * ones you cannot reach by clicking quickly: `STA-05` needs a load that fails,
 * `STA-15` needs a save that fails, and both need to be *reproducible* rather
 * than lucky.
 *
 * **Read-only, and deliberately incomplete as a backend.** It reads nothing, writes
 * nothing, opens no sockets and touches no original media. `setFlag` and
 * `setHidden` resolve to "nothing changed" rather than pretending to persist,
 * because a mock that silently accepted writes would let a scenario pass while the
 * real write path stayed broken.
 */

/** Which operation a scenario wants to fail. */
export type FailMode = 'save' | 'load' | 'preview' | 'clipboard' | 'runtime' | 'none';

export type MockConfig = {
  /** Artificial delay in ms for every read. */
  latency: number;
  /** Which operation should reject. */
  fail: FailMode;
};

export const DEFAULT_CONFIG: MockConfig = { latency: 0, fail: 'none' };

export function configFromSearch(search: URLSearchParams): MockConfig {
  const latency = Number(search.get('latency') ?? '0');
  const fail = (search.get('fail') ?? 'none') as FailMode;
  return {
    latency: Number.isFinite(latency) && latency >= 0 ? Math.min(latency, 10_000) : 0,
    fail,
  };
}

let active: MockConfig = DEFAULT_CONFIG;

export function setMockConfig(config: MockConfig): void {
  active = config;
}

export function getMockConfig(): MockConfig {
  return active;
}

/** The message a failing read reports, so `STA-05` has something real to show. */
export const LOAD_FAILURE_MESSAGE =
  "Couldn't reach the catalog. The data directory may be locked by another window.";

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * An `ExploreSource` that honours the config.
 *
 * `fail: 'load'` rejects the **page** request only, so a scenario can show the
 * list's error state while the folder tree and the shell still render — which is
 * what `STA-05` actually looks like, and what a whole-screen failure would
 * wrongly hide.
 */
export function mockExploreSource(base: ExploreSource = scaleSource()): ExploreSource {
  return {
    ...base,
    async page(query) {
      await delay(active.latency);
      if (active.fail === 'load') throw new Error(LOAD_FAILURE_MESSAGE);
      return base.page(query);
    },
    async itemDetail(itemId) {
      await delay(active.latency);
      if (active.fail === 'preview') throw new Error('Preview generation failed.');
      return base.itemDetail(itemId);
    },
    async setFlag() {
      await delay(active.latency);
      if (active.fail === 'save') throw new Error('Could not save.');
      // A read-only mock: it reports that nothing changed rather than pretending.
      return [];
    },
    async setHidden() {
      await delay(active.latency);
      if (active.fail === 'save') throw new Error('Could not save.');
      return [];
    },
  };
}

/** The library registry the shell reads. Derived from the scale fixture. */
export const MOCK_LIBRARIES = [
  {
    id: COMFY_LIBRARY_ID,
    name: 'Scale ComfyUI library',
    root_path: 'D:\\Scale',
    total_files: comfyItemCount(),
    missing_files: 0,
    image_embeddings: 0,
    last_scanned_at: '2026-09-30T12:00:00.000Z',
    library_type: 'comfyui' as const,
  },
  {
    id: COMIC_LIBRARY_ID,
    name: 'Scale comic library',
    root_path: 'D:\\ScaleComic',
    total_files: 150,
    missing_files: 0,
    image_embeddings: 0,
    last_scanned_at: '2026-09-30T12:00:00.000Z',
    library_type: 'comic' as const,
  },
];

export type AppSettingsLike = {
  theme: 'dark' | 'light' | 'high-contrast';
  density: 'compact' | 'comfortable' | 'spacious';
  text_scale: number;
};

/** The settings the shell applies at startup. No persistence, by design. */
export function mockSettings(overrides: Partial<AppSettingsLike> = {}): AppSettingsLike {
  return {
    theme: 'dark',
    density: 'comfortable',
    text_scale: 100,
    ...overrides,
  };
}