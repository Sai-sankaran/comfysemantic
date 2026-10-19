// covers: EXP-01, EXP-02, EXP-05, EXP-07, EXP-09
import { describe, expect, it } from 'vitest';
import { exportMenu } from '../features/export/exportMenu';

/** Look an entry up without the `| undefined` noise at every assertion. */
function entry(id: string, libraryType: 'comfyui' | 'comic', count: number) {
  const found = exportMenu({ libraryType, count }).find((e) => e.id === id);
  if (!found) throw new Error(`no menu entry ${id}`);
  return found;
}

describe('export menu entries', () => {
  it('disables comic-only entries for a ComfyUI library, with a reason', () => {
    expect(entry('comic-panels', 'comfyui', 5).available).toBe(false);
    expect(entry('comic-panels', 'comfyui', 5).reason).toBe('Comic libraries only');
    expect(entry('prompts-csv', 'comfyui', 5).available).toBe(true);
  });

  it('disables ComfyUI-only entries for a comic library', () => {
    expect(entry('images-prompt', 'comic', 5).available).toBe(false);
    expect(entry('comic-panels', 'comic', 5).available).toBe(true);
  });

  it('disables everything with an empty selection', () => {
    const menu = exportMenu({ libraryType: 'comfyui', count: 0 });
    expect(menu.every((e) => !e.available)).toBe(true);
    expect(entry('prompts-csv', 'comfyui', 0).reason).toBe('Select at least one image');
  });

  it('restricts Save workflow to a single item (EXP-09)', () => {
    expect(entry('workflow-json', 'comfyui', 1).available).toBe(true);
    expect(entry('workflow-json', 'comfyui', 4).available).toBe(false);
    expect(entry('workflow-json', 'comfyui', 4).reason).toBe('Select one image');
  });

  it('marks the file-producing entries as needing the dry-run summary', () => {
    // EXP-03's summary is for the file copy; the CSV and single-JSON writes are
    // a single serialised document each.
    expect(entry('images-prompt', 'comfyui', 3).needsSummary).toBe(true);
    expect(entry('prompts-csv', 'comfyui', 3).needsSummary).toBe(false);
  });

  it('never hides an entry, so nothing looks unbuilt', () => {
    for (const type of ['comfyui', 'comic'] as const) {
      expect(exportMenu({ libraryType: type, count: 1 })).toHaveLength(7);
    }
  });

  it('disables everything with a clear reason when export cannot run', () => {
    // The dead end this replaces: an enabled entry that opens nothing.
    for (const type of ['comfyui', 'comic'] as const) {
      const menu = exportMenu({ libraryType: type, count: 5, available: false });
      expect(menu.every((e) => !e.available)).toBe(true);
      for (const e of menu) expect(e.reason).toBe('Export is not available yet');
    }
  });

  it('prefers the pipeline reason over a selection problem', () => {
    // An empty selection in a non-runnable pipeline: the user needs to know the
    // button is dead, not that they should select something.
    const menu = exportMenu({ libraryType: 'comfyui', count: 0, available: false });
    expect(menu.every((e) => e.reason === 'Export is not available yet')).toBe(true);
  });

  it('is runnable by default, so `available` is opt-in', () => {
    expect(entry('prompts-csv', 'comfyui', 5).available).toBe(true);
  });

  it('never gives an enabled entry a reason', () => {
    for (const type of ['comfyui', 'comic'] as const) {
      for (const e of exportMenu({ libraryType: type, count: 1 })) {
        if (e.available) expect(e.reason).toBeUndefined();
        else expect(e.reason).toBeTruthy();
      }
    }
  });
});