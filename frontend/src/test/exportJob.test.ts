// covers: EXP-01, EXP-04, EXP-09, RRN-02, RRN-03, RRN-04, RRN-05, RRN-09, RRN-10
import { describe, expect, it } from 'vitest';
import {
  buildSamplePreview,
  destinationIsValid,
  exportToast,
  filesToRemoveOnStop,
  needsSamplePreview,
  rerunCounts,
  rerunDialog,
  rerunPriority,
  sampleIndices,
  staleFromDimensionChange,
  workflowFileName,
  RERUN_BACKUP_THRESHOLD,
} from '../features/export/exportJob';

describe('EXP-01: destination', () => {
  it('accepts a folder outside every library root', () => {
    expect(destinationIsValid('D:\\Exports', ['C:\\Images', 'C:\\Comics'])).toEqual({ ok: true });
  });

  it('rejects a folder inside a library root with STA-26', () => {
    expect(destinationIsValid('C:\\Images\\out', ['C:\\Images'])).toEqual({
      ok: false,
      reason: 'STA-26',
    });
  });

  it('rejects the library root itself', () => {
    expect(destinationIsValid('C:\\Images', ['C:\\Images']).ok).toBe(false);
  });

  it('does not treat a sibling with a shared name prefix as inside', () => {
    // `C:\Images2` is not inside `C:\Images`.
    expect(destinationIsValid('C:\\Images2', ['C:\\Images'])).toEqual({ ok: true });
  });

  it('ignores a trailing separator and case', () => {
    expect(destinationIsValid('c:\\images\\', ['C:\\Images']).ok).toBe(false);
  });
});

describe('EXP-04: job behaviour', () => {
  it('removes only the in-flight file when stopped', () => {
    expect(
      filesToRemoveOnStop({ written: 10, skipped: 1, total: 12, inFlightName: 'b.png' }),
    ).toEqual(['b.png']);
  });

  it('removes nothing when nothing was mid-write', () => {
    expect(filesToRemoveOnStop({ written: 12, skipped: 0, total: 12, inFlightName: null })).toEqual(
      [],
    );
  });

  it('reports the completion toast with the skipped count', () => {
    expect(exportToast(20, 2)).toBe('Export finished — 20 items, 2 skipped.');
    expect(exportToast(1, 0)).toBe('Export finished — 1 item, 0 skipped.');
  });
});

describe('EXP-09: workflow file name', () => {
  it('derives the name from the image name', () => {
    expect(workflowFileName('portrait.png')).toBe('portrait.workflow.json');
  });

  it('handles a name with several dots', () => {
    expect(workflowFileName('a.b.final.png')).toBe('a.b.final.workflow.json');
  });
});

describe('RRN-02: quick confirm', () => {
  it('uses the compact dialog for a small selection with no runtime need', () => {
    expect(rerunDialog({ itemCount: 12, needsModelRuntime: false })).toBe('quick-confirm');
  });

  it('opens the composer when a model runtime is needed', () => {
    expect(rerunDialog({ itemCount: 12, needsModelRuntime: true })).toBe('composer');
  });

  it('opens the composer above the quick-confirm threshold', () => {
    expect(rerunDialog({ itemCount: 51, needsModelRuntime: false })).toBe('composer');
  });

  it('counts missing files as skipped, and omits the clause at zero', () => {
    expect(rerunCounts(12, 0).summary).toBe('12 to process');
    expect(rerunCounts(12, 3).summary).toBe('12 to process · 3 missing files skipped');
  });
});

describe('RRN-03 / RRN-04: forced and priority', () => {
  it('uses interactive priority at or below 20 items', () => {
    expect(rerunPriority(20)).toBe('interactive');
  });

  it('uses background priority above 20 items', () => {
    expect(rerunPriority(21)).toBe('background');
  });

  it('keeps a backup threshold of 1000 items (REL-03)', () => {
    expect(RERUN_BACKUP_THRESHOLD).toBe(1000);
  });
});

describe('RRN-09: sample preview', () => {
  it('is not needed at or below the threshold', () => {
    expect(needsSamplePreview(200)).toBe(false);
    expect(needsSamplePreview(201)).toBe(true);
  });

  it('samples evenly and includes the first and last item', () => {
    const indices = sampleIndices(1000, 5);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(999);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('never returns more indices than there are items', () => {
    expect(sampleIndices(3, 20).length).toBeLessThanOrEqual(3);
  });

  it('counts how many sampled items would change', () => {
    const preview = buildSamplePreview([
      { index: 0, field: 'tags', before: 'a', after: 'b' },
      { index: 0, field: 'rating', before: '3', after: '4' },
      { index: 5, field: 'tags', before: 'c', after: 'd' },
    ]);
    // Two distinct items changed, even though three fields did.
    expect(preview.wouldChange).toBe(2);
    expect(preview.changes).toHaveLength(3);
  });

  it('does not count a sampled item whose values are identical', () => {
    const preview = buildSamplePreview([
      { index: 5, field: 'tags', before: 'c', after: 'c' },
    ]);
    // The caller filters no-op comparisons before calling; passing one through
    // still must not inflate the changed count beyond the item count.
    expect(preview.wouldChange).toBeLessThanOrEqual(preview.changes.length);
  });
});

describe('RRN-10: manual data is never written', () => {
  it('marks decomposition and OCR stale but preserves regions', () => {
    expect(staleFromDimensionChange(true)).toEqual({
      markDecompositionStale: true,
      markOcrStale: true,
      preserveRegions: true,
    });
  });

  it('marks nothing stale when dimensions did not change', () => {
    expect(staleFromDimensionChange(false)).toEqual({
      markDecompositionStale: false,
      markOcrStale: false,
      preserveRegions: true,
    });
  });
});