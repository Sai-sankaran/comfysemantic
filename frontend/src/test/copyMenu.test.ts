// covers: CPY-01, CPY-02, CPY-08, CPY-09, CPY-10
import { describe, expect, it } from 'vitest';
import {
  COPY_STATES,
  copyMenu,
  copyToast,
  copyToClipboard,
  runCopy,
  type CopyChoice,
} from '../features/export/copyMenu';
import type { CopyItem, CopyLimits } from '../features/export/copyModel';

const LIMITS: CopyLimits = {
  confirmItems: 2000,
  confirmMB: 2,
  hardCapItems: 10_000,
  hardCapMB: 5,
};

function item(over: Partial<CopyItem> & { id: string }): CopyItem {
  return { filename: `${over.id}.png`, ...over };
}

const ok: (t: string) => Promise<boolean> = async () => true;
const fail: (t: string) => Promise<boolean> = async () => false;

/** Look an entry up without the `| undefined` noise at every assertion. */
function entry(menu: ReturnType<typeof copyMenu>, id: string) {
  const found = menu.find((e) => e.id === id);
  if (!found) throw new Error(`no menu entry ${id}`);
  return found;
}

describe('copy menu entries', () => {
  it('offers OCR for comics and disables it with a reason', () => {
    const menu = copyMenu({ libraryType: 'comic', count: 3 });
    expect(entry(menu, 'ocr-text').available).toBe(true);
    // "Copy prompts" needs a ComfyUI library, so that is what the reason says.
    expect(entry(menu, 'prompts').available).toBe(false);
    expect(entry(menu, 'prompts').reason).toBe('ComfyUI libraries only');
  });

  it('offers prompts for ComfyUI and disables OCR with a reason', () => {
    const menu = copyMenu({ libraryType: 'comfyui', count: 3 });
    expect(entry(menu, 'prompts').available).toBe(true);
    // "Copy OCR text" needs a comic library.
    expect(entry(menu, 'ocr-text').reason).toBe('Comic libraries only');
  });

  it('disables everything with an empty selection rather than hiding entries', () => {
    const menu = copyMenu({ libraryType: 'comfyui', count: 0 });
    expect(menu.every((e) => !e.available)).toBe(true);
    expect(entry(menu, 'prompts').reason).toBe('Select at least one image');
  });

  // Regression: the seeds used to carry a hard-coded reason, which survived into
  // the enabled branch. In the running app every ComfyUI entry was enabled *and*
  // tooltipped "Comic libraries only", i.e. the tooltip contradicted the state.
  it('never gives an enabled entry a reason', () => {
    for (const type of ['comfyui', 'comic'] as const) {
      for (const e of copyMenu({ libraryType: type, count: 5 })) {
        if (e.available) expect(e.reason).toBeUndefined();
        else expect(e.reason).toBeTruthy();
      }
    }
  });

  it('disables a field the caller cannot supply, with a reason', () => {
    const menu = copyMenu({
      libraryType: 'comfyui',
      count: 5,
      unavailableFields: ['negative-prompts'],
    });
    const negative = entry(menu, 'negative-prompts');
    expect(negative.available).toBe(false);
    expect(negative.reason).toBe('Not loaded in this view');
    // The rest are unaffected.
    expect(entry(menu, 'prompts').available).toBe(true);
  });

  it('reports an unloaded field honestly instead of counting every item as empty', () => {
    // The failure this prevents: "Copied 0 of 15 negative prompts — 15 have no
    // negative prompt", which is a confident false statement about the library.
    expect(
      copyToast('negative-prompts', {
        text: '',
        considered: 15,
        copied: 0,
        skipped: 15,
        fieldUnavailable: 'negative prompts are not loaded in this view',
      }),
    ).toBe('Copied nothing — negative prompts are not loaded in this view.');
  });

  it('gives every disabled entry a reason naming the kind it needs', () => {
    // In a comic library the disabled entries are the ComfyUI ones, and their
    // reason says so; in a ComfyUI library it is the reverse.
    for (const e of copyMenu({ libraryType: 'comic', count: 5 })) {
      if (!e.available) expect(e.reason).toBe('ComfyUI libraries only');
    }
    for (const e of copyMenu({ libraryType: 'comfyui', count: 5 })) {
      if (!e.available) expect(e.reason).toBe('Comic libraries only');
    }
  });
});

describe('runCopy covers every choice', () => {
  it('routes each choice to its own builder', () => {
    const items = [item({ id: '1', positivePrompt: 'p', tags: ['t'], workflowJson: '{"a":1}' })];
    expect(runCopy('prompts', items).text).toBe('p');
    expect(runCopy('unique-prompts', items).text).toBe('p');
    expect(runCopy('tags', items).text).toBe('t');
    expect(runCopy('distinct-tags', items).text).toBe('t');
    expect(runCopy('workflow-json', items).text).toBe('{"a":1}');
  });
});

describe('copy toast wording', () => {
  it('reports the plain count when nothing was skipped', () => {
    const result = runCopy('prompts', [item({ id: '1', positivePrompt: 'p' })]);
    expect(copyToast('prompts', result)).toBe('Copied 1 prompts.');
  });

  it('reports both numbers when items were skipped', () => {
    const result = runCopy('prompts', [
      item({ id: '1', positivePrompt: 'p' }),
      item({ id: '2', positivePrompt: null }),
    ]);
    expect(copyToast('prompts', result)).toBe('Copied 1 of 2 prompts — 1 have no prompt.');
  });
});

describe('copyToClipboard', () => {
  it('writes the text and reports the toast', async () => {
    const outcome = await copyToClipboard(
      'prompts',
      [item({ id: '1', positivePrompt: 'p' })],
      LIMITS,
      ok,
    );
    expect(outcome.status).toBe('copied');
  });

  it('normalises to LF before writing (CPY-09)', async () => {
    let written = '';
    await copyToClipboard(
      'prompts',
      [item({ id: '1', positivePrompt: 'a\r\nb' })],
      LIMITS,
      async (t) => {
        written = t;
        return true;
      },
    );
    expect(written).toBe('a b');
  });

  it('returns STA-46 and keeps the text when the clipboard fails', async () => {
    const outcome = await copyToClipboard(
      'prompts',
      [item({ id: '1', positivePrompt: 'p' })],
      LIMITS,
      fail,
    );
    expect(outcome.status).toBe('clipboard-unavailable');
    if (outcome.status !== 'clipboard-unavailable') throw new Error('expected STA-46');
    expect(outcome.toast).toBe(COPY_STATES.clipboardUnavailable);
    // The text survives so **Save as file…** can still offer it.
    expect(outcome.text).toBe('p');
  });

  it('asks for confirmation above the confirm threshold', async () => {
    const items = Array.from({ length: 2001 }, (_, i) => item({ id: String(i), positivePrompt: 'p' }));
    const outcome = await copyToClipboard('prompts', items, LIMITS, ok);
    expect(outcome.status).toBe('needs-confirm');
  });

  it('proceeds when the user confirmed', async () => {
    const items = Array.from({ length: 2001 }, (_, i) => item({ id: String(i), positivePrompt: 'p' }));
    const outcome = await copyToClipboard('prompts', items, LIMITS, ok, true);
    expect(outcome.status).toBe('copied');
  });

  it('refuses above the hard cap even when confirmed', async () => {
    const items = Array.from({ length: 10_001 }, (_, i) => item({ id: String(i), positivePrompt: 'p' }));
    const outcome = await copyToClipboard('prompts', items, LIMITS, ok, true);
    expect(outcome.status).toBe('too-large');
  });

  it('never signals a catalog write (CPY-10)', async () => {
    // The only collaborator is the clipboard writer; there is no save path here.
    const outcome = await copyToClipboard(
      'prompts',
      [item({ id: '1', positivePrompt: 'p' })],
      LIMITS,
      ok,
    );
    expect(outcome.status).toBe('copied');
    if (outcome.status !== 'copied') throw new Error('expected a copied outcome');
    expect(Object.keys(outcome).sort()).toEqual(['status', 'text', 'toast']);
  });
});

describe('copyToClipboard across every choice', () => {
  const choices: CopyChoice[] = [
    'prompts',
    'unique-prompts',
    'negative-prompts',
    'tags',
    'distinct-tags',
    'workflow-json',
    'prompt-api-json',
    'ocr-text',
  ];

  it('never throws for any choice, even with entirely empty items', async () => {
    for (const choice of choices) {
      const outcome = await copyToClipboard(choice, [], LIMITS, ok);
      expect(outcome.status).toBe('copied');
      expect(outcome.text).toBe('');
    }
  });
});