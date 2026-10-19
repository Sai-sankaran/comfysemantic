// covers: EXP-01, EXP-02, EXP-04, EXP-06, EXP-10
import { describe, expect, it, vi } from 'vitest';
import { runExport, sanitizeFilename, safeUniqueName } from '../features/export/exportWriter';
import { planImageExport, type ExportItem } from '../features/export/exportModel';

function item(over: Partial<ExportItem> & { id: string }): ExportItem {
  return {
    filename: `${over.id}.png`,
    relativePath: `lib/${over.id}.png`,
    folder: 'lib',
    size: 1000,
    modifiedAt: 1_700_000_000_000,
    positivePrompt: 'prompt',
    negativePrompt: null,
    tags: [],
    rating: null,
    favourite: undefined,
    width: null,
    height: null,
    missingFile: false,
    ...over,
  };
}

const ITEMS = [item({ id: '1' }), item({ id: '2' }), item({ id: '3' })];

describe('sanitise at the writer boundary', () => {
  it('strips path separators and traversal', () => {
    expect(sanitizeFilename('../evil.png')).not.toContain('..');
    expect(sanitizeFilename('a/b\\c.png')).not.toMatch(/[\\/]/);
  });

  it('prefixes reserved device names', () => {
    expect(sanitizeFilename('CON.png')).toBe('_CON.png');
    expect(sanitizeFilename('nul')).toBe('_nul');
  });

  it('strips trailing dots and spaces', () => {
    expect(sanitizeFilename('name. ')).toBe('name');
  });

  it('suffixes after sanitising, so two titles cannot collapse', () => {
    const taken = new Set<string>();
    const a = safeUniqueName('CON.png', taken);
    taken.add(a);
    const b = safeUniqueName('CON.png', taken);
    expect(a).not.toBe(b);
  });
});

describe('cancel at the picker is a first-class outcome', () => {
  it('lands in cancelled, never failed', async () => {
    const adapters = {
      pickFolder: async () => null,
      writeFile: async (name: string) => name,
      confirm: async () => true,
    };
    const result = await runExport(
      { items: ITEMS, caption: 'prompt', libraryRoots: [], includeUncaptioned: false },
      adapters,
    );
    expect(result.state).toBe('cancelled');
  });
});

describe('keep-and-report partial write', () => {
  it('a failing Nth write keeps the survivors and reports them', async () => {
    let calls = 0;
    const adapters = {
      pickFolder: async () => 'D:\\Out',
      writeFile: async (name: string) => {
        calls += 1;
        if (calls === 2) throw new Error('disk full');
        return name;
      },
      confirm: async () => true,
    };
    const result = await runExport(
      { items: ITEMS, caption: 'prompt', libraryRoots: [], includeUncaptioned: false },
      adapters,
    );
    expect(result.state).toBe('failed');
    expect(result.written).toEqual(['1.png']);
    expect(result.notAttempted).toEqual(['3.png']);
    expect(result.written).not.toContain('2.png');
  });
});

describe('collision suffixing', () => {
  it('two same-named sources get distinct output names', async () => {
    const written: string[] = [];
    const adapters = {
      pickFolder: async () => 'D:\\Out',
      writeFile: async (name: string) => {
        written.push(name);
        return name;
      },
      confirm: async () => true,
    };
    const same = [item({ id: '1', filename: 'cover.png' }), item({ id: '2', filename: 'cover.png' })];
    await runExport(
      { items: same, caption: 'prompt', libraryRoots: [], includeUncaptioned: false },
      adapters,
    );
    expect(new Set(written).size).toBe(written.length);
  });
});

describe('STA-26 rejection', () => {
  it('rejects a destination inside a library root', async () => {
    const adapters = {
      pickFolder: async () => 'C:\\Images',
      writeFile: async (name: string) => name,
      confirm: async () => true,
    };
    const result = await runExport(
      { items: ITEMS, caption: 'prompt', libraryRoots: ['C:\\Images'], includeUncaptioned: false },
      adapters,
    );
    expect(result.state).toBe('cancelled');
  });
});

describe('large-export confirmation', () => {
  it('aborts when the user declines the confirmation', async () => {
    const big = Array.from({ length: 5001 }, (_, i) => item({ id: String(i) }));
    const adapters = {
      pickFolder: async () => 'D:\\Out',
      writeFile: async (name: string) => name,
      confirm: async () => false,
    };
    const result = await runExport(
      { items: big, caption: 'prompt', libraryRoots: [], includeUncaptioned: false },
      adapters,
    );
    expect(result.state).toBe('cancelled');
  });
});