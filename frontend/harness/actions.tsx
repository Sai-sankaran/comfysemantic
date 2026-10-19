import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/tokens.css';
import '../src/index.css';
import '../src/App.css';
import {
  ActionRegistry,
  contextForDestination,
  formatShortcut,
  type ActionContext,
} from '../src/app/actions';
import { SHELL_ACTIONS } from '../src/app/shellActions';
import { useActionHotkeys } from '../src/app/useActionHotkeys';
import type { DestinationId } from '../src/app/navigation';
import { Button, Checkbox, Select } from '../src/components/ui';
import { CommandPalette } from '../src/features/palette/CommandPalette';
import { ShortcutOverlay } from '../src/features/palette/ShortcutOverlay';

/**
 * Standalone harness for the registry surfaces (`NAV-24`, `NAV-25`, `NAV-31`).
 *
 * The real components, driven by the real registry and the real
 * `useActionHotkeys`, with no Tauri backend - so the palette, the overlay and
 * the shortcut dispatch can be exercised in an actual browser (portal
 * placement, focus, tokens) instead of only in jsdom.
 *
 * Built by `vite.harness.config.ts` to `dist-harness/actions.html`.
 */
export function Harness() {
  const registry = useMemo(() => {
    const r = new ActionRegistry();
    r.register(SHELL_ACTIONS);
    return r;
  }, []);
  const [destination, setDestination] = useState<DestinationId>('explore');
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [privacyOn, setPrivacyOn] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const push = (entry: string) => setLog((l) => [entry, ...l].slice(0, 12));

  const actionContext = useMemo<ActionContext>(
    () => ({
      navigate: (dest, workspace) => push(`navigate(${dest}${workspace ? `/${workspace}` : ''})`),
      back: () => push('back()'),
      forward: () => push('forward()'),
      canBack: true,
      canForward: true,
      openPalette: () => setPaletteOpen(true),
      openOverlay: () => setOverlayOpen(true),
      openLibraryMenu: () => push('openLibraryMenu()'),
      openViewMenu: () => push('openViewMenu()'),
      toggleJobDrawer: () => push('toggleJobDrawer()'),
      focusSearch: () => push('focusSearch()'),
      addLibraryFolder: () => push('addLibraryFolder()'),
      submitSearch: (q) => push(`submitSearch(${JSON.stringify(q)})`),
      activeLibraryName: 'Demo Library',
      busy: busy ? 'indexing' : null,
      // These five were added after this harness was written and nothing was
      // typechecking it, so it had silently rotted. `tsconfig.harness.json` now
      // puts it under `tsc -b`, which is what caught it.
      toggleTree: () => push('toggleTree()'),
      toggleInspector: () => push('toggleInspector()'),
      setViewMode: (mode) => push(`setViewMode(${mode})`),
      privacyOn,
      togglePrivacy: () => {
        setPrivacyOn((v) => !v);
        push('togglePrivacy()');
      },
    }),
    [busy],
  );

  useActionHotkeys(registry, destination, actionContext, !paletteOpen && !overlayOpen);

  const context = contextForDestination(destination);

  return (
    <div className="harness">
      <h1>Action registry harness</h1>
      <p className="hint">
        {registry.all().length} registered actions · context <code>{context}</code>
      </p>
      <div className="harness-controls">
        <Button variant="secondary" onClick={() => setPaletteOpen(true)}>
          Open palette
        </Button>
        <Button variant="secondary" onClick={() => setOverlayOpen(true)}>
          Open shortcuts
        </Button>
        <Select
          aria-label="Context"
          value={destination}
          onChange={(e) => setDestination(e.target.value as DestinationId)}
          options={[
            { value: 'explore', label: 'explore' },
            { value: 'search', label: 'search' },
            { value: 'review', label: 'review' },
            { value: 'pipeline', label: 'pipeline' },
            { value: 'settings', label: 'settings' },
          ]}
        />
        <Checkbox checked={busy} onChange={(checked) => setBusy(checked)}>
          busy
        </Checkbox>
      </div>
      <h2>Run log</h2>
      <ol className="harness-log">
        {log.map((entry, i) => (
          <li key={`${entry}-${i}`}>{entry}</li>
        ))}
      </ol>
      <h2>Registered shortcuts</h2>
      <ul className="harness-log">
        {registry
          .all()
          .filter((a) => a.shortcut || a.alsoShortcut)
          .map((a) => (
            <li key={a.id}>
              <code>{[a.shortcut, a.alsoShortcut].filter(Boolean).join(' / ')}</code> →{' '}
              {[a.shortcut, a.alsoShortcut]
                .filter(Boolean)
                .map((s) => formatShortcut(s as string))
                .join('  ')}{' '}
              · {a.label}
            </li>
          ))}
      </ul>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        registry={registry}
        context={context}
        actionContext={actionContext}
      />
      <ShortcutOverlay
        open={overlayOpen}
        onClose={() => setOverlayOpen(false)}
        registry={registry}
        context={context}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
