import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Visual-verification harness configuration.
 *
 * Separate from `vite.config.ts` so the shipped build is untouched. The only
 * meaningful difference is an alias that redirects `@tauri-apps/api/*` at the
 * harness shim, replacing desktop IPC with HTTP to the isolated harness server.
 * Everything else - React, the stylesheets, the real components - is the
 * application, unmodified.
 *
 * Run:  npx vite --config vite.harness.config.ts
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@tauri-apps\/api\/core$/,
        replacement: resolve(__dirname, 'harness/tauri-shim.ts'),
      },
      {
        find: /^@tauri-apps\/api\/event$/,
        replacement: resolve(__dirname, 'harness/tauri-shim.ts'),
      },
    ],
  },
  server: {
    port: 5178,
    strictPort: true,
    fs: { allow: ['..'] },
  },
  build: {
    outDir: 'dist-harness',
    rollupOptions: {
      input: {
        // The workbench harness (real components against the isolated worker).
        harness: resolve(__dirname, 'harness/index.html'),
        // The component gallery on its own (CTL-06), with no backend: the
        // fixture the visual-regression tests compare against.
        gallery: resolve(__dirname, 'harness/gallery.html'),
        // The action-registry surfaces (NAV-24/25/31), with no backend: palette,
        // shortcuts overlay and window shortcut dispatch in a real browser.
        actions: resolve(__dirname, 'harness/actions.html'),
        // The application shell (NAV-01 … NAV-14) with no backend: rail, top bar,
        // breadcrumb, library switcher, View menu, System chip and tray.
        shell: resolve(__dirname, 'harness/shell.html'),
      },
    },
  },
});