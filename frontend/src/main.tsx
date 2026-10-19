import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import './App.css'
import App from './App.tsx'
import { applyAppearance, loadShellState, readCachedAppearance } from './app/appearance.ts'
import { loadPrivacyCache } from './app/privacy.tsx'
import { isTauriRuntime } from './platform/transport.ts'

// Apply the cached appearance before the first React render, so a light /
// high-contrast / scaled-up user does not see a dark, default-size flash while
// the catalog settings load. The catalog remains the owner: LibraryProvider
// reconciles with the canonical values and refreshes the cache. CSP is
// `script-src 'self'`, so this cannot be an inline <script> in index.html and
// must run here, from the module bundle.
/**
 * `npm run dev` boots the **whole application** against an in-memory backend.
 *
 * Every rail destination is reachable and every button does something, with no
 * Python, no Rust, no Tauri and no catalog. `npm run dev:tauri` runs the same
 * bundle against the real worker.
 *
 * The install is a **dynamic** import behind `import.meta.env.DEV`, which does two
 * things that matter. It keeps the fixture and its 12,000-item generator out of a
 * release build entirely - Rollup resolves the branch to nothing, so the dev
 * backend is a separate chunk rather than dead code in the app bundle. And
 * because it is awaited before the first render, the app's startup calls cannot
 * race the backend into "Backend unavailable".
 */
async function boot() {
  if (import.meta.env.DEV && !isTauriRuntime()) {
    const { install } = await import('./dev/devBackend.ts')
    install()
  }

  // Load the shell-state cache (appearance + privacy flag) before the first
  // paint, so the cached values are already applied when React mounts.
  await loadShellState()
  await loadPrivacyCache()
  applyAppearance(readCachedAppearance())

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()