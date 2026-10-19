/**
 * The System chip's dot vocabulary (design `NAV-14`).
 *
 * Grey = idle/not started, green = ready or running normally, amber = degraded
 * (read-only, or a runtime that is stopped but needed), red = error. Every state
 * also carries a word, so the colour is never the only signal (`VIS-02`).
 */
export type SystemTone = 'idle' | 'ready' | 'degraded' | 'error';

/**
 * How a runtime status string maps onto that dot.
 *
 * Deliberately conservative: an unrecognised status reads as *idle*, not as ready.
 * `RUN-01` forbids anything claiming the runtime is ready when it is not, and the
 * safe default for an unknown string is the non-optimistic one.
 */
export function toneForRuntime(status: string | undefined): SystemTone {
  if (!status) return 'idle';
  const s = status.toLowerCase();
  if (s.includes('error') || s.includes('fail')) return 'error';
  if (s.includes('ready') || s.includes('running')) return 'ready';
  if (s.includes('stopped')) return 'degraded';
  return 'idle';
}

/** The wording that goes with each dot. */
export const SYSTEM_TONE_LABEL: Record<SystemTone, string> = {
  idle: 'Idle',
  ready: 'Ready',
  degraded: 'Degraded',
  error: 'Error',
};