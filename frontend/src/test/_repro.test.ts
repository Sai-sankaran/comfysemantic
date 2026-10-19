import { describe, expect, it } from 'vitest';
import { runExport } from '../features/export/exportWriter';

describe('repro', () => {
  it('sta26', async () => {
    const adapters = {
      pickFolder: async () => 'C:\\Images',
      writeFile: async (name: string) => name,
      confirm: async () => true,
    };
    const result = await runExport(
      { items: [], caption: 'prompt', libraryRoots: ['C:\\Images'], includeUncaptioned: false },
      adapters,
    );
    // eslint-disable-next-line no-console
    console.log('RESULT', JSON.stringify(result));
  });
});