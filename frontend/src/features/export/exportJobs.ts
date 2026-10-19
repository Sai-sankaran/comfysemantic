// covers: EXP-04, RRN-01, RRN-03, RRN-05

/**
 * Export and re-run jobs as Pipeline jobs (Appendix I).
 *
 * `EXP-04` says an export *is* a job — progress in the drawer, stop safely,
 * completion toast — and `RRN-01` puts re-runs in the same queue. Rather than a
 * second job type with its own tray and drawer, both are converted into the
 * existing `PipelineJob` shape. One queue means one place where "what is
 * running" is answered, which is what the tray shows.
 */

import type { PipelineJob, PipelineJobState, PipelineScope } from '../pipeline/PipelineTypes';
import {
  applyForcedStage,
  rerunCounts,
  rerunDialog,
  rerunPriority,
  type RerunScope,
} from './exportJob';
import type { ExportPlan } from './exportModel';

/** `EXP-04`: the stages an export job reports, in the drawer's wording. */
export const EXPORT_STAGES = ['export'] as const;

export type ExportJobRequest = {
  jobId: string;
  libraryId: string;
  libraryName: string;
  libraryType: 'comfyui' | 'comic';
  /** `EXP-03`: the approved dry-run. */
  plan: ExportPlan;
  /** `EXP-08`: what the manifest should record. */
  template: string | null;
  now: string;
};

/**
 * Build the job for a planned export.
 *
 * `EXP-04` makes it background priority, so `scope` is recorded as the whole
 * selection rather than a folder the user picked — the destination is not part
 * of the library scope and must not appear to narrow the job.
 */
export function exportJob(request: ExportJobRequest): PipelineJob {
  const total = request.plan.toWrite.length;
  const skipped = request.plan.skipped.length;
  // `PipelineScope` is library-or-folders. An export is neither: its inputs are
  // the approved plan, and the destination is not part of the library. Recording
  // the library is the honest scope — it is the thing the job reads and writes
  // beside, and it keeps the drawer's scope line meaningful.
  const scope: PipelineScope = { type: 'library', libraryId: request.libraryId };

  return {
    id: request.jobId,
    libraryId: request.libraryId,
    libraryName: request.libraryName,
    scope,
    presetId: null,
    stages: [...EXPORT_STAGES],
    profile: 'background',
    state: 'queued',
    progress: {
      stage: 'export',
      done: 0,
      total,
      elapsedSeconds: 0,
      // `EXP-04`: an export copies files, so the rate is bytes-per-second in
      // practice; the drawer's items/second reads correctly enough for a job the
      // user is not waiting on.
      itemsPerSecond: 0,
      etaSeconds: null,
      message: skipped > 0 ? `${total} to export, ${skipped} skipped` : `${total} to export`,
    },
    failures: [],
    createdAt: request.now,
    startedAt: null,
    completedAt: null,
  };
}

/**
 * `EXP-04`: the completion state.
 *
 * Anything skipped means `completed_with_failures` rather than `completed`, so
 * the tray and the toast both surface it (`STA-49`). Silently reporting success
 * for a run that dropped files is the failure mode the requirement names.
 */
export function exportCompletedState(plan: ExportPlan): PipelineJobState {
  return plan.skipped.length > 0 ? 'completed_with_failures' : 'completed';
}

/** `EXP-03`: the dry-run summary lines shown before Start. */
export function exportSummaryLines(plan: ExportPlan, freeBytes: number): string[] {
  const lines = [
    `${plan.toWrite.length} item${plan.toWrite.length === 1 ? '' : 's'} to export`,
    `${Math.round(plan.totalBytes / (1024 * 1024))} MB estimated`,
  ];
  const missing = plan.skipped.filter((e) => e.skipped === 'missing-file').length;
  const noCaption = plan.skipped.filter((e) => e.skipped === 'no-caption').length;
  if (missing > 0) lines.push(`${missing} skipped: file missing`);
  if (noCaption > 0) lines.push(`${noCaption} skipped: no caption for the chosen template`);
  if (freeBytes < Math.ceil(plan.totalBytes * 1.1)) {
    lines.push('Not enough free space in the destination');
  }
  return lines;
}

export type RerunJobRequest = {
  jobId: string;
  libraryId: string;
  libraryName: string;
  scope: PipelineScope;
  /** `RRN-01`: the stage being re-run — metadata or thumbnails. */
  stage: 'metadata' | 'thumbnails';
  /** `RRN-02`: the counts the dialog stated. */
  toProcess: number;
  missingFiles: number;
  /** `RRN-05`: runs over 1,000 items are covered by the automatic backup rule. */
  takesBackup: boolean;
  now: string;
};

/**
 * `RRN-*`: build the job for a re-run.
 *
 * `RRN-03` is the load-bearing part: `applyForcedStage` returns
 * `skipCompleted: false`, so a re-run cannot be quietly turned into a no-op by a
 * stage that already has a result. `RRN-05` is not undoable, which is why the
 * job carries no undo affordance — the dialog says so instead.
 */
export function rerunJob(request: RerunJobRequest): PipelineJob {
  const forced = applyForcedStage({ skipCompleted: false });
  const counts = rerunCounts(request.toProcess, request.missingFiles);
  const priority = rerunPriority(request.toProcess);
  const stageLabel = request.stage === 'metadata' ? 'metadata' : 'thumbnails';

  return {
    id: request.jobId,
    libraryId: request.libraryId,
    libraryName: request.libraryName,
    scope: request.scope,
    presetId: `rerun-${stageLabel}`,
    stages: [stageLabel],
    profile: priority,
    state: 'queued',
    progress: {
      stage: stageLabel,
      done: 0,
      total: request.toProcess,
      elapsedSeconds: 0,
      itemsPerSecond: 0,
      etaSeconds: null,
      message: `${counts.summary} · ${forced.summaryNote}: ${stageLabel}`,
    },
    failures: [],
    createdAt: request.now,
    startedAt: null,
    completedAt: null,
  };
}

/** `RRN-02`: which surface a re-run should open. */
export function rerunSurface(scope: RerunScope): 'quick-dialog' | 'pipeline-composer' {
  return rerunDialog(scope) === 'quick-confirm' ? 'quick-dialog' : 'pipeline-composer';
}

/**
 * `RRN-09`: whether the composer must show the sample preview before Start.
 *
 * Returned as data rather than rendered here so the decision is testable without
 * mounting the composer.
 */
export function rerunRequiresSamplePreview(
  itemCount: number,
  needsPreview: (n: number) => boolean,
): boolean {
  return needsPreview(itemCount);
}