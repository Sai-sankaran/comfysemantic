/**
 * Hoisted module mocks shared by every Workbench test file.
 *
 * Imported for its side effects, FIRST in each test file. `vi.mock` calls are
 * hoisted above imports by Vitest, so registering them from this module makes
 * them apply to the test file that imports it.
 *
 * The `api` factory pulls the fake backend in with a dynamic `await import()`
 * rather than closing over it, because the factory runs lazily and the binding
 * must be initialised by then.
 */
import { vi } from 'vitest';

vi.mock('../api', async () => {
  const { mocks } = await import('./workbenchFixtures');
  return { api: mocks };
});

vi.mock('../app/providers', async () => {
  // The factory is async so it can await the fixtures module, but `useLibrary`
  // itself stays synchronous - it is a hook, and an async hook would break
  // every render.
  const fx = await import('./workbenchFixtures');
  return {
    useLibrary: () => ({
      libraryId: 'lib1',
      activeLibrary: { id: 'lib1', name: 'Synthetic' },
      /**
       * The canonical settings store, exactly as the real provider exposes it:
       * one value, shared by Settings and by per-tab quick controls.
       */
      appSettings: fx.appSettingsState.current,
      updateAppSetting: (key: string, value: unknown) => {
        fx.appSettingsState.current = {
          ...fx.appSettingsState.current,
          [key]: value,
        } as typeof fx.appSettingsState.current;
        return fx.mocks.setAppSettings({ [key]: value });
      },
    }),
  };
});

// No exports: this module exists only for its `vi.mock` side effects, which
// Vitest hoists above the imports of every test file that pulls it in.