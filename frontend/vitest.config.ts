import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Frontend tests.
 *
 * Vitest reuses the existing Vite pipeline rather than introducing a second
 * build, so the code under test is transformed exactly as it is for the app.
 * jsdom provides the DOM; ResizeObserver and matchMedia are stubbed in the
 * setup file because jsdom does not implement them and the Workbench's
 * measured-fit logic depends on ResizeObserver firing.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      // The production catalog is never reachable from a test: the API module
      // is mocked per-test, and nothing here opens a file or a database.
      restoreMocks: true,
    },
  }),
);