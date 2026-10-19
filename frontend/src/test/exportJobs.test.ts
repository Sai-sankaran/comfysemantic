// covers: EXP-03, EXP-04, RRN-01, RRN-02, RRN-03, RRN-04, RRN-05
import { describe, expect, it } from 'vitest';
import {
  exportCompletedState,
  exportJob,
  exportSummaryLines,
  rerunJob,
  rerunSurface,
} from '../features/export/exportJobs';
import { planImageExport, type ExportItem } from '../features/export/exportModel';

function item(over: Partial<ExportItem> & { id: string }): ExportItem {
  return {
    filename: `${over.id}.png`,
    relativePath: `lib/${over.id}.png`,
    folder: 'lib',
    size: 1000,
    modifiedAt: 1_700_000_000_000,
    ...over,
  };
}

const plan = (items: ExportItem[], caption: 'prompt' | null = null) =>
  planImageExport({ items, takenNames: new Set(), caption, includeUncaptioned: false });

describe('EXP-04: an export is a job', () => {
  const p = plan([item({ id: '1' }), item({ id: '2' })]);
  const job = exportJob({
    jobId: 'j1',
    libraryId: 'lib-1',
    libraryName: 'Library',
    libraryType: 'comfyui',
    plan: p,
    template: 'prompt',
    now: '2026-10-19T00:00:00Z',
  });

  it('is queued, at background priority, with a total from the plan', () => {
    expect(job.state).toBe('queued');
    expect(job.profile).toBe('background');
    expect(job.progress.total).toBe(2);
  });

  it('reuses the Pipeline stage vocabulary so the drawer needs no new tab', () => {
    expect(job.stages).toEqual(['export']);
  });

  it('mentions skips in the progress message rather than hiding them', () => {
    const withSkip = plan([item({ id: '1' }), item({ id: '2', missingFile: true })]);
    const j = exportJob({
      jobId: 'j2',
      libraryId: 'l',
      libraryName: 'L',
      libraryType: 'comfyui',
      plan: withSkip,
      template: null,
      now: 'x',
    });
    expect(j.progress.message).toContain('1 skipped');
  });

  it('completes_with_failures when anything was skipped (STA-49)', () => {
    expect(exportCompletedState(plan([item({ id: '1' })]))).toBe('completed');
    expect(exportCompletedState(plan([item({ id: '1' }), item({ id: '2', missingFile: true })]))).toBe(
      'completed_with_failures',
    );
  });
});

describe('EXP-03: dry-run summary lines', () => {
  it('reports the count and the estimate', () => {
    const lines = exportSummaryLines(plan([item({ id: '1' }), item({ id: '2' })]), 1e9);
    expect(lines[0]).toBe('2 items to export');
    expect(lines[1]).toContain('MB estimated');
  });

  it('says why each item was skipped', () => {
    const lines = exportSummaryLines(
      plan([item({ id: '1', missingFile: true }), item({ id: '2' })], 'prompt'),
      1e9,
    );
    expect(lines.join(' ')).toContain('file missing');
  });

  it('says no-caption when the template had nothing to write', () => {
    const lines = exportSummaryLines(plan([item({ id: '1' })], 'prompt'), 1e9);
    expect(lines.join(' ')).toContain('no caption');
  });

  it('warns when the destination lacks headroom', () => {
    expect(exportSummaryLines(plan([item({ id: '1' })]), 10).join(' ')).toContain('Not enough free space');
    expect(exportSummaryLines(plan([item({ id: '1' })]), 1e9).join(' ')).not.toContain('Not enough free space');
  });
});

describe('RRN: re-run jobs', () => {
  const base = {
    jobId: 'r1',
    libraryId: 'lib-1',
    libraryName: 'Library',
    scope: { type: 'library' as const, libraryId: 'lib-1' },
    toProcess: 12,
    missingFiles: 0,
    takesBackup: false,
    now: '2026-10-19T00:00:00Z',
  };

  it('forces the stage regardless of skip-completed (RRN-03)', () => {
    const job = rerunJob({ ...base, stage: 'thumbnails' });
    expect(job.progress.message).toContain('Re-run forced');
  });

  it('uses interactive priority for a small run and background for a large one (RRN-04)', () => {
    expect(rerunJob({ ...base, stage: 'metadata' }).profile).toBe('interactive');
    expect(rerunJob({ ...base, stage: 'metadata', toProcess: 21 }).profile).toBe('background');
  });

  it('states the missing-file count in the message (RRN-03)', () => {
    const job = rerunJob({ ...base, stage: 'thumbnails', toProcess: 10, missingFiles: 3 });
    expect(job.progress.message).toContain('3 missing files skipped');
  });

  it('picks the quick dialog for a small selection and the composer above it (RRN-02)', () => {
    expect(rerunSurface({ itemCount: 12, needsModelRuntime: false })).toBe('quick-dialog');
    expect(rerunSurface({ itemCount: 51, needsModelRuntime: false })).toBe('pipeline-composer');
    expect(rerunSurface({ itemCount: 12, needsModelRuntime: true })).toBe('pipeline-composer');
  });
});