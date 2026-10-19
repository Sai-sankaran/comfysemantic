// covers: CPY-01, CPY-02, CPY-03, CPY-04, CPY-05, CPY-06, CPY-07, CPY-08, CPY-09, CPY-10, TST-45, TST-47, TST-48, TST-49
import { describe, expect, it } from 'vitest';
import {
  byteLength,
  copyDistinctTags,
  copyNegativePrompts,
  copyOcrText,
  copyPromptApiJson,
  copyPrompts,
  copyTags,
  copyUniquePrompts,
  copyWorkflowJson,
  flattenPrompt,
  gateCopy,
  megabytes,
  toClipboardText,
  type CopyItem,
  type CopyLimits,
} from '../features/export/copyModel';

const LIMITS: CopyLimits = {
  confirmItems: 2000,
  confirmMB: 2,
  hardCapItems: 10_000,
  hardCapMB: 5,
};

function item(over: Partial<CopyItem> & { id: string }): CopyItem {
  return { filename: `${over.id}.png`, ...over };
}

describe('CPY-02 / TST-45: prompt copy', () => {
  it('flattens every run of line breaks to a single space and trims', () => {
    expect(flattenPrompt('a\nb\r\nc\n\nd')).toBe('a b c d');
    expect(flattenPrompt('  padded  ')).toBe('padded');
    expect(flattenPrompt(null)).toBe('');
  });

  it('preserves gallery order, not click order', () => {
    const items = [
      item({ id: '1', positivePrompt: 'first' }),
      item({ id: '2', positivePrompt: 'second' }),
      item({ id: '3', positivePrompt: 'third' }),
    ];
    expect(copyPrompts(items).text).toBe('first\nsecond\nthird');
  });

  it('skips items with no prompt and counts them for the toast', () => {
    const items = [
      item({ id: '1', positivePrompt: 'one' }),
      item({ id: '2', positivePrompt: null }),
      item({ id: '3', positivePrompt: '   ' }),
      item({ id: '4', positivePrompt: 'two' }),
    ];
    const result = copyPrompts(items);
    expect(result.text).toBe('one\ntwo');
    expect(result.considered).toBe(4);
    expect(result.copied).toBe(2);
    expect(result.skipped).toBe(2);
  });

  it('applies the same rule to negative prompts', () => {
    const items = [
      item({ id: '1', negativePrompt: 'bad\nhands' }),
      item({ id: '2', negativePrompt: null }),
    ];
    const result = copyNegativePrompts(items);
    expect(result.text).toBe('bad hands');
    expect(result.skipped).toBe(1);
  });
});

describe('CPY-03 / TST-48: unique prompts', () => {
  it('de-duplicates on the normalised string', () => {
    const items = [
      item({ id: '1', positivePrompt: 'a b' }),
      item({ id: '2', positivePrompt: 'a\nb' }),
      item({ id: '3', positivePrompt: 'c' }),
    ];
    expect(copyUniquePrompts(items).text).toBe('a b\nc');
  });

  it('keeps the first occurrence position', () => {
    const items = [
      item({ id: '1', positivePrompt: 'dup' }),
      item({ id: '2', positivePrompt: 'other' }),
      item({ id: '3', positivePrompt: 'dup' }),
    ];
    expect(copyUniquePrompts(items).text).toBe('dup\nother');
  });

  it('counts duplicates as copied-and-deduped, not as skipped', () => {
    const items = [
      item({ id: '1', positivePrompt: 'x' }),
      item({ id: '2', positivePrompt: 'x' }),
    ];
    const result = copyUniquePrompts(items);
    expect(result.copied).toBe(1);
    expect(result.skipped).toBe(0);
  });
});

describe('CPY-04 / CPY-05 / TST-46: tags', () => {
  it('joins one item as "a, b, c"', () => {
    expect(copyTags([item({ id: '1', tags: ['a', 'b', 'c'] })]).text).toBe('a, b, c');
  });

  it('gives one line per item and skips/counts untagged items', () => {
    const result = copyTags([
      item({ id: '1', tags: ['a'] }),
      item({ id: '2', tags: [] }),
      item({ id: '3', tags: ['b', 'c'] }),
    ]);
    expect(result.text).toBe('a\nb, c');
    expect(result.copied).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it('sorts distinct tags by frequency desc then alphabetically case-insensitively', () => {
    const result = copyDistinctTags([
      item({ id: '1', tags: ['common', 'Alpha'] }),
      item({ id: '2', tags: ['common', 'beta'] }),
      item({ id: '3', tags: ['common'] }),
    ]);
    // common(3) first, then alpha(1) and beta(1) case-insensitively.
    expect(result.text).toBe('common, Alpha, beta');
  });

  it('treats tags differing only in case as one distinct tag', () => {
    const result = copyDistinctTags([
      item({ id: '1', tags: ['Portrait'] }),
      item({ id: '2', tags: ['portrait'] }),
    ]);
    expect(result.text).toBe('Portrait');
  });
});

describe('CPY-06 / TST-47: verbatim JSON', () => {
  it('copies the workflow bytes without re-serialising or re-ordering keys', () => {
    // Deliberately odd spacing and key order: any round-trip through JSON.parse
    // would change this string.
    const raw = '{ "b":1,\n  "a" : [1,2] }';
    const result = copyWorkflowJson([item({ id: '1', workflowJson: raw })]);
    expect(result.text).toBe(raw);
  });

  it('copies the API-format prompt verbatim too', () => {
    const raw = '{"3": {"inputs": {"seed": 1}}}';
    expect(copyPromptApiJson([item({ id: '1', promptApiJson: raw })]).text).toBe(raw);
  });

  it('counts items with no embedded data as skipped', () => {
    const result = copyWorkflowJson([
      item({ id: '1', workflowJson: '{}' }),
      item({ id: '2', workflowJson: null }),
    ]);
    expect(result.copied).toBe(1);
    expect(result.skipped).toBe(1);
  });
});

describe('CPY-07: OCR text', () => {
  it('joins a page’s regions in reading order with a blank line', () => {
    const result = copyOcrText([
      item({ id: '1', ocr: { regions: [{ text: 'top' }, { text: 'bottom' }] } }),
    ]);
    expect(result.text).toBe('top\n\nbottom');
  });

  it('separates several items with a --- line between blank lines', () => {
    const result = copyOcrText([
      item({ id: '1', ocr: { regions: [{ text: 'a' }] } }),
      item({ id: '2', ocr: { regions: [{ text: 'b' }] } }),
    ]);
    expect(result.text).toBe('a\n\n---\n\nb');
  });

  it('counts items with no effective text as skipped', () => {
    const result = copyOcrText([
      item({ id: '1', ocr: { regions: [{ text: '  ' }] } }),
      item({ id: '2', ocr: null }),
    ]);
    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(2);
  });
});

describe('CPY-08 / TST-49: confirmation and hard cap', () => {
  it('allows a small copy with no prompt', () => {
    expect(gateCopy({ text: 'x', considered: 10 }, LIMITS).kind).toBe('ok');
  });

  it('confirms above confirmItems', () => {
    const gate = gateCopy({ text: 'x', considered: 2001 }, LIMITS);
    expect(gate.kind).toBe('confirm');
  });

  it('confirms above confirmMB even when the item count is small', () => {
    const big = 'x'.repeat(3 * 1024 * 1024);
    expect(gateCopy({ text: big, considered: 5 }, LIMITS).kind).toBe('confirm');
  });

  it('offers file export only above the hard cap', () => {
    const gate = gateCopy({ text: 'x', considered: 10_001 }, LIMITS);
    expect(gate.kind).toBe('too-large');
  });

  it('checks the hard cap before the confirm tier, so nothing is truncatable', () => {
    // Over both thresholds: the answer must be too-large, never 'confirm'.
    const huge = 'x'.repeat(6 * 1024 * 1024);
    expect(gateCopy({ text: huge, considered: 20_000 }, LIMITS).kind).toBe('too-large');
  });

  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    // A 4-byte emoji must not be measured as 2.
    expect(byteLength('😀')).toBe(4);
    expect(megabytes(2 * 1024 * 1024)).toBe(2);
  });
});

describe('CPY-09: clipboard text', () => {
  it('uses LF endings, never CRLF', () => {
    expect(toClipboardText('a\r\nb\rc')).toBe('a\nb\nc');
  });
});