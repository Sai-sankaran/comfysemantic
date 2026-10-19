import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../index.css';
import '../App.css';
import './screens.css';
import { ScreensApp } from './ScreensApp';
import { setMockConfig } from './mockBackend';
import { configFromSearch } from './mockBackend';

/**
 * `/__screens` — dev only.
 *
 * The `import.meta.env.DEV` guard is not decoration: `npm run build` replaces it
 * with `false`, so this module and everything it pulls in — the 12,000-item
 * fixture, the scenario catalogue — is **dead code the bundler removes**. That is
 * what keeps a mock catalogue of synthetic images out of the shipped build.
 *
 * A second guard sits in the Vite plugin that serves the route, so the path does
 * not even exist outside `npm run dev`.
 */
if (import.meta.env.DEV) {
  // The URL's `latency` / `fail` are read before the first render so a deep link
  // is already in the right state on its first paint.
  setMockConfig(configFromSearch(new URLSearchParams(location.search)));

  const container = document.getElementById('root');
  if (container) {
    createRoot(container).render(
      <StrictMode>
        <ScreensApp />
      </StrictMode>,
    );
  }
}