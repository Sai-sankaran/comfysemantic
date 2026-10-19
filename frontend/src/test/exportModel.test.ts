// covers: EXP-02, EXP-03, EXP-05, EXP-06, EXP-08, EXP-10
import { describe, expect, it } from 'vitest';
import {
  buildCsv,
  buildManifest,
  captionFor,
  csvCell,
  dryRun,
  needsExportConfirmation,
  planImageExport,
  uniqueName,
  CSV_COLUMNS,
  type ExportItem,
} from '../features/export/exportModel';

function item(over: Partial<ExportItem> & { id: string }): ExportItem {
  return {
    filename: `${over.id}.png`,
    relativePath: `library/${over.id}.png`,
    folder: 'library',
    size: 1000,
    modifiedAt: 1_700_000_000_000,
    ...over,
  };
}

describe('EXP-02: never overwrite', () => {
  it('leaves a free name alone', () => {
    expect(uniqueName('a.png', new Set())).toBe('a.png');
  });

  it('adds a numeric suffix on collision', () => {
    expect(uniqueName('a.png', new Set(['a.png']))).toBe('a_2.png');
    expect(uniqueName('a.png', new Set(['a.png', 'a_2.png']))).toBe('a_3.png');
  });

  it('only changes the stem so the caption can share it', () => {
    expect(uniqueName('report.final.png', new Set(['report.final.png']))).toBe(
      'report.final_2.png',
    );
  });

  it('allocates distinct names for same-named sources in different folders', () => {
    const plan = planImageExport({
      items: [
        item({ id: '1', filename: 'cover.png' }),
        item({ id: '2', filename: 'cover.png' }),
      ],
      takenNames: new Set(),
      caption: null,
      includeUncaptioned: false,
    });
    expect(plan.toWrite.map((e) => e.outputName)).toEqual(['cover.png', 'cover_2.png']);
  });
});

describe('EXP-06: captions', () => {
  it('flattens the prompt for the prompt template', () => {
    expect(captionFor(item({ id: '1', positivePrompt: 'a\nb' }), 'prompt')).toBe('a b');
  });

  it('joins tags for the tags template', () => {
    expect(captionFor(item({ id: '1', tags: ['x', 'y'] }), 'tags')).toBe('x, y');
  });

  it('combines prompt and tags as "<prompt>, tag1, tag2"', () => {
    expect(captionFor(item({ id: '1', positivePrompt: 'p', tags: ['x'] }), 'prompt+tags')).toBe(
      'p, x',
    );
  });

  it('skips an item that lacks the caption data', () => {
    const plan = planImageExport({
      items: [item({ id: '1', positivePrompt: 'p' }), item({ id: '2' })],
      takenNames: new Set(),
      caption: 'prompt',
      includeUncaptioned: false,
    });
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.skipped.map((e) => e.skipped)).toEqual(['no-caption']);
  });

  it('writes the image but no .txt when includeUncaptioned is on', () => {
    const plan = planImageExport({
      items: [item({ id: '1' })],
      takenNames: new Set(),
      caption: 'prompt',
      includeUncaptioned: true,
    });
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.toWrite[0].captionName).toBeNull();
  });

  it('gives the caption file the same stem as the image', () => {
    const plan = planImageExport({
      items: [item({ id: '1', filename: 'cover.png', positivePrompt: 'p' })],
      takenNames: new Set(),
      caption: 'prompt',
      includeUncaptioned: false,
    });
    expect(plan.toWrite[0].captionName).toBe('cover.txt');
  });
});

describe('EXP-05: CSV', () => {
  it('emits the specified columns in order', () => {
    expect(buildCsv({ items: [] }).replace('\uFEFF', '').split('\r\n')[0]).toBe(
      CSV_COLUMNS.join(','),
    );
  });

  it('starts with a BOM by default and can omit it', () => {
    expect(buildCsv({ items: [] }).charCodeAt(0)).toBe(0xfeff);
    expect(buildCsv({ items: [], bom: false }).charCodeAt(0)).not.toBe(0xfeff);
  });

  it('uses CRLF row endings', () => {
    const csv = buildCsv({ items: [item({ id: '1' })] });
    expect(csv).toContain('\r\n');
  });

  it('quotes per RFC 4180 and doubles embedded quotes', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('preserves line breaks inside a prompt, unlike copy-as', () => {
    const csv = buildCsv({ items: [item({ id: '1', positivePrompt: 'line1\nline2' })] });
    expect(csv).toContain('"line1\nline2"');
  });

  it('includes items without a prompt as empty cells rather than dropping them', () => {
    const csv = buildCsv({ items: [item({ id: '1' }), item({ id: '2', positivePrompt: 'p' })] });
    const rows = csv.replace('\uFEFF', '').trim().split('\r\n');
    expect(rows).toHaveLength(3);
    // 15 columns, the first two populated, so 13 empty cells follow.
    expect(rows[1]).toBe('1.png,library' + ','.repeat(13));
  });

  it('reuses the same writer for a custom column set', () => {
    const csv = buildCsv({
      items: [item({ id: '1', positivePrompt: 'p' })],
      columns: ['file', 'tags'],
    });
    expect(csv.replace('\uFEFF', '').split('\r\n')[0]).toBe('file,tags');
  });
});

describe('EXP-08: manifest', () => {
  it('records a size + modified-time + head-hash fingerprint, not a full hash', () => {
    const plan = planImageExport({
      items: [item({ id: '1', headHash: 'abc123' })],
      takenNames: new Set(),
      caption: null,
      includeUncaptioned: false,
    });
    const manifest = buildManifest(plan, {
      appVersion: '0.1.0',
      date: '2026-10-19',
      libraryName: 'Lib',
      libraryType: 'comfyui',
      template: null,
    });
    expect(manifest.items[0].fingerprint).toEqual({
      size: 1000,
      modified: new Date(1_700_000_000_000).toISOString(),
      headHash: 'abc123',
    });
    expect(manifest.items[0].source).toBe('library/1.png');
  });
});

describe('EXP-03: dry run', () => {
  const plan = () =>
    planImageExport({
      items: [item({ id: '1', size: 1000 }), item({ id: '2', size: 1000, missingFile: true })],
      takenNames: new Set(),
      caption: null,
      includeUncaptioned: false,
    });

  it('counts items, bytes and skips with a reason', () => {
    const summary = dryRun(plan(), 1e9);
    expect(summary.itemCount).toBe(1);
    expect(summary.bytes).toBe(1000);
    expect(summary.skipped).toEqual({ missingFile: 1, noCaption: 0 });
  });

  it('requires the estimate plus 10% of headroom', () => {
    expect(dryRun(plan(), 1e9).requiredBytes).toBe(1100);
  });

  it('flags insufficient space instead of starting', () => {
    expect(dryRun(plan(), 1099).insufficientSpace).toBe(true);
    expect(dryRun(plan(), 1100).insufficientSpace).toBe(false);
  });
});

describe('EXP-10: large-export confirmation', () => {
  it('does not confirm a small export', () => {
    const plan = planImageExport({
      items: [item({ id: '1' })],
      takenNames: new Set(),
      caption: null,
      includeUncaptioned: false,
    });
    expect(needsExportConfirmation(plan)).toBe(false);
  });

  it('confirms above 5000 items', () => {
    const plan = planImageExport({
      items: Array.from({ length: 5001 }, (_, i) => item({ id: String(i) })),
      takenNames: new Set(),
      caption: null,
      includeUncaptioned: false,
    });
    expect(needsExportConfirmation(plan)).toBe(true);
  });
});