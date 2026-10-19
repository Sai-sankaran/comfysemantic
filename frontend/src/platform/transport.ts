import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * The platform adapter.
 *
 * Everything that crosses the process boundary goes through here, and nowhere
 * else. `api.ts` used to call `invoke` directly, which meant the only way to run
 * the UI without the desktop shell was to *not run it* - the app booted to
 * "Backend unavailable" and every screen was unreachable. Routing through one
 * module fixes that and gives `ARC-13`'s "no `localStorage`" rule a real
 * enforcement point at the same time.
 *
 * Two backends:
 *
 * - **Tauri**, when the shell is present. Unchanged behaviour.
 * - **A dev backend**, installed by `src/dev/` under `import.meta.env.DEV`. It
 *   serves the same command names from fixtures, so the screens exercise real
 *   code paths rather than a parallel imitation of them.
 *
 * With neither present the call throws a message that says which is missing,
 * because "Backend unavailable" with no cause is not a diagnostic.
 */

/** A backend that can answer RPC commands and deliver events. */
export interface TransportBackend {
  call: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  listen: (event: string, handler: (payload: unknown) => void) => Promise<UnlistenFn>;
  /**
   * The small synchronous-ish shell-state file (theme, density, text scale,
   * privacy flag) read at launch step 2. Optional on the interface so a backend
   * that has no persistence (a pure in-memory dev backend) is still valid; the
   * transport treats `undefined` as "no state".
   */
  readShellState?: () => Promise<ShellState | null>;
  writeShellState?: (state: ShellState) => Promise<void>;
}

/**
 * The shape of the shell-state file. Kept deliberately tiny and flat: it is read
 * before the first paint, so a large or nested document would cost startup time
 * for no benefit. `appearance` holds the validated appearance; `privacy` holds the
 * launch-time privacy cache.
 */
export type ShellState = {
  appearance?: {
    theme?: string;
    density?: string;
    text_scale?: number;
  };
  privacy?: {
    startBlurred?: boolean;
    mode?: 'blur' | 'colour';
  };
};

let devBackend: TransportBackend | null = null;

/**
 * Install the dev backend.
 *
 * Called only from the dev entry point. It exists as a function rather than a
 * static import so the mock and the 12,000-item fixture stay out of the
 * production bundle entirely: `main.tsx` reaches this through a dynamic
 * `import()` guarded by `import.meta.env.DEV`, which Rollup resolves to nothing
 * in a release build.
 */
export function installDevBackend(backend: TransportBackend): void {
  devBackend = backend;
}

/** Only for tests, which must not leak a backend into the next test file. */
export function resetDevBackend(): void {
  devBackend = null;
}

export function hasDevBackend(): boolean {
  return devBackend !== null;
}

/**
 * Is the Tauri shell actually present?
 *
 * Checking for the injected internals rather than a user agent or a build flag:
 * `__TAURI_INTERNALS__` only exists when the shell has initialised, so a browser
 * pointed at the dev server takes the dev path and the same bundle inside the
 * exe takes the Tauri path, with no second build.
 */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isDevRuntime(): boolean {
  return !isTauriRuntime();
}

/**
 * Read the shell-state file.
 *
 * Returns `null` when no state has been written (first launch, or a backend with
 * no persistence), so callers apply defaults rather than failing.
 */
export async function readShellState(): Promise<ShellState | null> {
  if (devBackend?.readShellState) return devBackend.readShellState();
  if (isTauriRuntime()) {
    const raw = await tauriInvoke<string | null>('read_shell_state');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ShellState;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Write the shell-state file. Fire-and-forget is acceptable: the cache is an
 * optimization, and a failed write leaves the previous state in place rather
 * than corrupting it.
 */
export async function writeShellState(state: ShellState): Promise<void> {
  if (devBackend?.writeShellState) {
    await devBackend.writeShellState(state);
    return;
  }
  if (isTauriRuntime()) {
    await tauriInvoke('write_shell_state', { content: JSON.stringify(state) });
  }
}

/** The single place a command crosses the boundary. */
export async function transportCall<T>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  if (devBackend) return (await devBackend.call(method, params)) as T;
  // `tauriInvoke`, **not** the `invoke` exported below. Those two look
  // interchangeable and are not: the exported one re-enters `transportCall` for an
  // `rpc_call` command, so calling it here recurses until the stack gives out.
  if (isTauriRuntime()) return tauriInvoke<T>('rpc_call', { method, params });
  throw new Error(
    `No backend for "${method}". Start the desktop shell (npm run dev:tauri), ` +
      'or run the dev server (npm run dev) which serves it from fixtures.',
  );
}

/** The single place an event subscription crosses the boundary. */
export async function transportListen(
  event: string,
  handler: (payload: unknown) => void,
): Promise<UnlistenFn> {
  if (devBackend) return devBackend.listen(event, handler);
  if (isTauriRuntime()) {
    return listen(event, (e) => handler(e.payload));
  }
  // No backend: a no-op unsubscribe rather than a throw.
  //
  // A subscription that throws during an effect takes the whole screen down on
  // mount, which is how an event listener became a startup blocker. Returning an
  // inert unlisten lets the UI come up and simply never hear the event.
  return () => undefined;
}

/**
 * A drop-in for Tauri's `invoke`, for the few components that call a command
 * directly rather than through `api`.
 *
 * It takes Tauri's `(command, args)` shape so a call site does not have to
 * change, but it routes through the adapter: a component issuing a raw
 * `rpc_call` gets the dev backend rather than reaching past it.
 */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (command === 'rpc_call') {
    const params = (args?.params ?? {}) as Record<string, unknown>;
    return transportCall<T>(String(params.method ?? ''), params);
  }
  if (devBackend) return (await devBackend.call(command, args ?? {})) as T;
  if (isTauriRuntime()) return tauriInvoke<T>(command, args);
  throw new Error(`No backend for "${command}".`);
}

// ---------------------------------------------------------------------------
// Clipboard and file writes (`CPY-09`, `STA-46`, `EXP-*`)
// ---------------------------------------------------------------------------

/**
 * Write text to the clipboard.
 *
 * Returns `false` rather than throwing when the write fails, because that is a
 * designed state (`STA-46`) with a **Save as file…** fallback, not an error the
 * caller should have to catch. A thrown clipboard error in a browser can also be
 * a permissions-policy refusal, which the user cannot fix by retrying.
 *
 * In the desktop shell this goes to the backend rather than `navigator`, so the
 * clipboard survives the window losing focus.
 */
export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (isTauriRuntime() || devBackend) {
      await transportCall('clipboard_write_text', { text });
      return true;
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save text to a file chosen by the user.
 *
 * Used by the `STA-46` and `CPY-08` fallbacks. Returns the path written, or
 * `null` when the user cancelled — a cancel is not a failure and must not be
 * reported as one.
 */
export async function saveTextToFile(text: string, suggestedName = 'copy.txt'): Promise<string | null> {
  try {
    if (isTauriRuntime() || devBackend) {
      return await transportCall<string | null>('save_text_file', { text, suggestedName });
    }
    // Browser fallback: a download. Not byte-identical to a chosen path, but it
    // is the only save the web platform offers, and it keeps the text reachable.
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggestedName;
    anchor.click();
    URL.revokeObjectURL(url);
    return suggestedName;
  } catch {
    return null;
  }
}

/** `EXP-01`: pick a destination folder, remembering the last one. */
export async function pickExportFolder(lastDir?: string): Promise<string | null> {
  return transportCall<string | null>('pick_export_folder', { lastDir: lastDir ?? '' });
}