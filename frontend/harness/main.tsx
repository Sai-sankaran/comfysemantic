/**
 * Visual-verification harness entry point - NOT part of the application.
 *
 * It renders the genuine `AppShell`, `LibraryProvider` and `DialogueReview`
 * with the real stylesheets. Nothing about the Workbench is reimplemented,
 * stubbed or simplified here: the only substitution is the transport
 * (`tauri-shim.ts`), which swaps Tauri IPC for the isolated harness server.
 *
 * The real `AppShell` is used deliberately rather than a bare wrapper. The
 * Workbench's width is decided by the `.app-shell` > `.shell-col` > `.content`
 * chain, so hosting it in an ad-hoc div made it size to its content instead -
 * which looked exactly like a canvas bug at narrow widths and was purely an
 * artefact of the harness. The sidebar and status strip are part of what a
 * 1366x768 or 1100x680 window really looks like, so they stay.
 *
 * A "Reset synthetic fixture" button exists so the screenshot pass can be
 * repeated after a test has mutated a correction. It calls the harness server's
 * own `/reset` endpoint, which rebuilds the fixture catalog in place. Nothing
 * about it exists in the shipped application.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/tokens.css';
import '../src/index.css';
import '../src/App.css';
import '../src/features/dialogue/workbench.css';
import { LibraryProvider, useLibrary } from '../src/app/providers';
import { AppShell } from '../src/app/AppShell';
import { DialogueReview } from '../src/features/dialogue/DialogueReview';
import type { ViewState } from '../src/app/navigation';

/**
 * Rebuild the synthetic fixture through the harness server's own `/reset`
 * endpoint. Kept out of `src/api.ts` on purpose: the application must not carry
 * a method that exists only for this rig.
 */
async function resetFixture(): Promise<void> {
  const res = await fetch('http://127.0.0.1:8765/reset', { method: 'POST' });
  if (!res.ok) throw new Error(`reset failed: ${res.status}`);
  window.location.reload();
}

function FixtureControls() {
  const { libraryId, libraries } = useLibrary();
  const [state, setState] = useState('idle');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 8px',
                  borderBottom: '1px solid #26262a', fontSize: 12, flex: '0 0 auto' }}>
      <strong>harness</strong>
      <span>library: {libraryId ?? '(none)'}</span>
      <span>{libraries.length} library/libraries</span>
      <button
        type="button"
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy');
          resetFixture().catch((e: unknown) => setState(String(e)));
        }}
      >
        Reset synthetic fixture
      </button>
      <span>{state === 'idle' ? '' : state}</span>
    </div>
  );
}

function App() {
  // The real AppShell, so the Workbench is hosted exactly as the app hosts it.
  // `AppShell` takes a `ViewState`, not a `tab`. This harness predates that
// refactor and rotted because no compiler looked at `harness/` — see
// `tsconfig.harness.json`, which puts it under `tsc -b`.
const [view] = useState<ViewState>({ destination: 'review', workspace: 'review-text' });
  return (
    <LibraryProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <FixtureControls />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <AppShell
            view={view}
            onNavigate={() => {}}
            onBack={() => {}}
            onForward={() => {}}
            canBack={false}
            canForward={false}
            readOnly
            onGlobalSearch={() => {}}
          >
            <DialogueReview />
          </AppShell>
        </div>
      </div>
    </LibraryProvider>
  );
}

const host = document.getElementById('root');
if (host) {
  createRoot(host).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}