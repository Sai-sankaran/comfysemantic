// covers: EXP-01, EXP-04, EXP-09, RRN-01, RRN-02, RRN-03, RRN-04, RRN-05, RRN-09, RRN-10

/**
 * Export job shape and the re-run rules (Appendix I, EXP-04 / RRN-*).
 *
 * `planImageExport` decides *what* to write; this file decides *how the run
 * behaves* — priority, whether a skip-completed flag is honoured, what the
 * summary line says, and what a forced re-run is allowed to change.
 */

/** `EXP-04`: an export is a job of kind `export` at background priority. */
export type ExportJobKind = 'export' | 'metadata-reread' | 'thumbnail-regenerate';

/** `PRF-50`: the interactive/background cut-off. */
export const INTERACTIVE_MAX_ITEMS = 20;

/** `RRN-02`: the quick-confirm cut-off. */
export const RERUN_QUICK_CONFIRM_MAX = 50;

/** `RRN-09`: the sample-preview threshold and size. */
export const RERUN_SAMPLE_PREVIEW_THRESHOLD = 200;
export const RERUN_SAMPLE_SIZE = 20;

/** `REL-03`: the automatic backup threshold for a re-run. */
export const RERUN_BACKUP_THRESHOLD = 1000;

export type RerunScope = {
  itemCount: number;
  /** `RRN-02`/`RRN-04`: whether any selected stage needs the model runtime. */
  needsModelRuntime: boolean;
};

/**
 * `RRN-02`: a small selection with no runtime need gets the compact dialog; a
 * larger scope opens the full Pipeline composer, prefilled and not started.
 */
export function rerunDialog(scope: RerunScope): 'quick-confirm' | 'composer' {
  if (scope.itemCount <= RERUN_QUICK_CONFIRM_MAX && !scope.needsModelRuntime) {
    return 'quick-confirm';
  }
  return 'composer';
}

/**
 * `RRN-02`/`RRN-03`: the counts the dialog states. Missing files are skipped and
 * counted rather than silently dropped.
 */
export function rerunCounts(toProcess: number, missingFiles: number): {
  toProcess: number;
  missing: number;
  /** The one-line summary the dialog shows. */
  summary: string;
} {
  const parts = [`${toProcess} to process`];
  if (missingFiles > 0) parts.push(`${missingFiles} missing files skipped`);
  return { toProcess, missing: missingFiles, summary: parts.join(' · ') };
}

/**
 * `RRN-03`: both presets are **forced** — they ignore *Skip completed*.
 *
 * This is the whole behavioural difference from a normal Pipeline run, so it is
 * expressed as an explicit override rather than left to a caller to remember.
 */
export function applyForcedStage(stage: {
  skipCompleted: boolean;
}): { skipCompleted: false; summaryNote: string } {
  void stage;
  return { skipCompleted: false, summaryNote: 'Re-run forced' };
}

/**
 * `RRN-04`: ≤ 20 items runs at interactive priority; larger runs are background
 * jobs.
 */
export function rerunPriority(itemCount: number): 'interactive' | 'background' {
  return itemCount <= INTERACTIVE_MAX_ITEMS ? 'interactive' : 'background';
}

/**
 * `RRN-09`: a forced re-read over the threshold samples items in memory before
 * Start, so a regressed reader is caught before it overwrites the catalog.
 */
export function needsSamplePreview(itemCount: number): boolean {
  return itemCount > RERUN_SAMPLE_PREVIEW_THRESHOLD;
}

/** `RRN-09`: evenly spaced sample of `size` indices across `itemCount`. */
export function sampleIndices(itemCount: number, size = RERUN_SAMPLE_SIZE): number[] {
  if (itemCount <= 0) return [];
  const take = Math.min(size, itemCount);
  const out: number[] = [];
  for (let i = 0; i < take; i += 1) {
    // Spreading by (n-1)/(take-1) hits the first and last item exactly.
    const index = take === 1 ? 0 : Math.round((i * (itemCount - 1)) / (take - 1));
    out.push(Math.min(index, itemCount - 1));
  }
  return [...new Set(out)];
}

/** `RRN-09`: the sample result — how many of the sampled items would change. */
export type SamplePreview = {
  sampled: number;
  wouldChange: number;
  /** The changed fields, per sampled item, for the before/after view. */
  changes: { index: number; field: string; before: string; after: string }[];
};

export function buildSamplePreview(
  changes: SamplePreview['changes'],
): SamplePreview {
  return {
    sampled: changes.length,
    wouldChange: new Set(changes.map((c) => c.index)).size,
    changes,
  };
}

/**
 * `RRN-10`: a re-read may mark stages stale, but must never write user data.
 *
 * Fields owned by the user are returned as a guard list rather than being
 * stripped from the result, so a caller that tries to write one is a visible
 * type error instead of a silent data loss.
 */
export const MANUAL_PROTECTED_FIELDS = [
  'regions',
  'regionCorrections',
  'inkValues',
  'panels',
  'relations',
  'notes',
] as const;

export type ManualProtectedField = (typeof MANUAL_PROTECTED_FIELDS)[number];

/** `RRN-10` / `REL-02`: what a changed page size does to downstream stages. */
export function staleFromDimensionChange(dimensionsChanged: boolean): {
  markDecompositionStale: boolean;
  markOcrStale: boolean;
  preserveRegions: true;
} {
  return {
    markDecompositionStale: dimensionsChanged,
    markOcrStale: dimensionsChanged,
    // Explicitly true and non-optional: this is the invariant `RRN-10` requires.
    preserveRegions: true,
  };
}

/** `EXP-04`: progress for an export job. */
export type ExportProgress = {
  written: number;
  skipped: number;
  total: number;
  /** `EXP-04`: a file mid-write when Stop is pressed is removed, not left partial. */
  inFlightName: string | null;
};

/**
 * `EXP-04`: compute the files that must be deleted when Stop is pressed.
 *
 * "Files already written are complete" — so only the in-flight file is removed.
 * Returning the name rather than doing the delete keeps this testable.
 */
export function filesToRemoveOnStop(progress: ExportProgress): string[] {
  return progress.inFlightName ? [progress.inFlightName] : [];
}

/** `EXP-04` / `STA-49`: the completion toast text. */
export function exportToast(written: number, skipped: number): string {
  const base = `Export finished — ${written} item${written === 1 ? '' : 's'}`;
  return skipped > 0
    ? `${base}, ${skipped} skipped.`
    : `${base}, 0 skipped.`;
}

/** `EXP-01`: the destination must be outside every registered library root. */
export function destinationIsValid(
  destination: string,
  libraryRoots: readonly string[],
): { ok: true } | { ok: false; reason: 'STA-26' } {
  const normalise = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase();
  const target = normalise(destination);
  const inside = libraryRoots.some((root) => {
    const r = normalise(root);
    // A prefix match must be followed by a separator, or `C:\images2` would be
    // rejected as being inside `C:\images`.
    return target === r || target.startsWith(`${r}\\`) || target.startsWith(`${r}/`);
  });
  return inside ? { ok: false, reason: 'STA-26' } : { ok: true };
}

/** `EXP-09`: the file name derived from the image name for a saved workflow. */
export function workflowFileName(imageFilename: string): string {
  const dot = imageFilename.lastIndexOf('.');
  const stem = dot > 0 ? imageFilename.slice(0, dot) : imageFilename;
  return `${stem}.workflow.json`;
}