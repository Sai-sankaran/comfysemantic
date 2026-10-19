/**
 * Tauri API shim for the visual-verification harness.
 *
 * This file is NOT part of the application. It is aliased in **only** by
 * `vitest.harness.config.ts`, so the shipped build still imports the real
 * `@tauri-apps/api`. Its whole purpose is to let the genuine Workbench run in a
 * plain browser against the isolated harness server:
 *
 *   invoke('rpc_call', {method, params})  ->  POST /rpc on the harness server
 *   convertFileSrc(path)                  ->  GET /image/<file name>
 *
 * `convertFileSrc` matters for correctness of the visual pass, not just
 * convenience: the Workbench positions its overlays as percentages of the
 * image box, so the page image has to actually render. Without it the canvas
 * would show an empty box and a screenshot would prove nothing about alignment.
 */

const RPC_URL = 'http://127.0.0.1:8765/rpc';
const IMAGE_BASE = 'http://127.0.0.1:8765/image/';

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (cmd !== 'rpc_call') {
    throw new Error(`harness shim: unsupported command ${cmd}`);
  }
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args ?? {}),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body.result as T;
}

/**
 * Resolve a page path to the harness image URL.
 *
 * Only the file name is used: the harness server resolves it against the
 * fixture root and refuses anything else, so an absolute path from a real
 * library cannot become a readable URL here.
 */
export function convertFileSrc(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  return `${IMAGE_BASE}${encodeURIComponent(name)}`;
}

/** The harness has no event bus; subscriptions resolve to a no-op unsubscribe. */
export async function listen(_event: string, _handler: (payload: unknown) => void) {
  return () => {};
}

export const Channel = class {
  onmessage: ((payload: unknown) => void) | null = null;
};