import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import type { CropperFinished, CropperProgress } from '../../types';

/** Cap on retained output so a long run cannot grow the DOM without bound. */
const MAX_LINES = 500;

export type CropperLogState = {
  /** Full accumulated output of the current run, oldest first. */
  lines: string[];
  progress: CropperProgress | null;
  finished: CropperFinished | null;
  error: string | null;
  running: boolean;
  /** Seconds since the detector last printed anything, or null if it just did. */
  silentFor: number | null;
  /** True once anything at all has been captured, so the view can stay up. */
  hasRun: boolean;
  reset: () => void;
};

/**
 * Accumulates the v11 detector's console output for on-screen display.
 *
 * The worker emits one `cropper_progress` event per line the detector writes
 * and includes only the trailing window (`recent`, last 25) in each payload.
 * Rendering `recent` directly would therefore show a scrolling window that
 * loses everything the detector said earlier, which is exactly the part a
 * reviewer wants to read afterwards. Instead: seed from the whole window on
 * the first event (covers the case where this hook mounted mid-run), then
 * append the single new line each subsequent event carries.
 */
export function useCropperLog(): CropperLogState {
  const [lines, setLines] = useState<string[]>([]);
  const [progress, setProgress] = useState<CropperProgress | null>(null);
  const [finished, setFinished] = useState<CropperFinished | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // The detector prints nothing while working, and the run carries no timeout,
  // so "how long since anything moved" is the only honest signal that a run has
  // stalled. Activity means new stdout OR a new crop on disk. Track to the second.
  const lastLineAt = useRef<number>(Date.now());
  const lastCrops = useRef<number>(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    const subs = [
      api.onCropperStarted(() => {
        setLines([]);
        setProgress(null);
        setFinished(null);
        setError(null);
        lastLineAt.current = Date.now();
        lastCrops.current = 0;
        setRunning(true);
      }),
      api.onCropperProgress((p) => {
        // A progress event proves a run is in flight even if `cropper_started`
        // was missed - which happens when this screen mounts mid-run. Without
        // this, `running` stayed false, the Run button stayed enabled, and
        // clicking it wiped the live log via reset() before the backend then
        // refused with "a panel cropper run is already in progress".
        setRunning(true);
        setProgress(p);

        // A new output file means the run is genuinely moving even though the
        // detector's stdout is still buffered. Counting it as activity keeps
        // the stall warning honest instead of crying wolf on a busy run.
        const written = p.artifacts ? p.artifacts.panels ?? 0 : 0;
        if (p.recent.length === 0 || written !== lastCrops.current) {
          lastLineAt.current = Date.now();
          lastCrops.current = written;
        }

        if (p.recent.length === 0) return;
        setLines((prev) => {
          if (prev.length === 0) return p.recent.slice(-MAX_LINES);
          const last = p.recent[p.recent.length - 1];
          if (last === undefined) return prev;
          return [...prev, last].slice(-MAX_LINES);
        });
      }),
      api.onCropperFinished((f) => {
        setRunning(false);
        setFinished(f);
      }),
      api.onCropperError((e) => {
        setRunning(false);
        setError(e.error);
      }),
    ];
    return () => {
      subs.forEach((p) => p.then((u) => u()).catch(() => undefined));
    };
  }, []);

  // `tick` exists only to force this recompute once a second while running.
  void tick;
  const silentFor = running ? Math.floor((Date.now() - lastLineAt.current) / 1000) : null;

  return {
    lines,
    progress,
    finished,
    error,
    running,
    silentFor,
    hasRun: lines.length > 0 || finished !== null || error !== null,
    reset: () => {
      setLines([]);
      setProgress(null);
      setFinished(null);
      setError(null);
      // Clear `running` too. reset() is called immediately before starting a
      // new run; leaving the old run's flag set would either block the button
      // or, worse, survive a failed start and show "running" with no run.
      setRunning(false);
      lastLineAt.current = Date.now();
      lastCrops.current = 0;
    },
  };
}