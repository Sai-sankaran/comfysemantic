// covers: CPY-01, CPY-02, CPY-03, CPY-04, CPY-05, CPY-06, CPY-07, CPY-08, CPY-10

/**
 * The copy/export surface (Appendix G.2 + I).
 *
 * `copyModel.ts` knows how to build the text and `exportModel.ts` knows how to
 * plan the files; neither knows about buttons. This module supplies the menu the
 * design specifies, the mapping from a menu choice to the right builder, and the
 * one place where a clipboard write can fail (`STA-46`).
 */

import {
  copyDistinctTags,
  copyNegativePrompts,
  copyOcrText,
  copyPromptApiJson,
  copyPrompts,
  copyTags,
  copyUniquePrompts,
  copyWorkflowJson,
  gateCopy,
  toClipboardText,
  type CopyItem,
  type CopyLimits,
  type CopyResult,
} from './copyModel';

/** `STA-46`/`STA-47` dialog text, kept beside the states that produce it. */
export const COPY_STATES = {
  clipboardUnavailable: "Couldn't access the clipboard.",
  tooLarge: (items: number, mb: number) =>
    `Too many to copy (limit exceeded: ${items} items, ${mb} MB).`,
  confirm: (items: number, mb: number) => `That's a lot to copy (${items} items, ${mb} MB).`,
} as const;

/** The wording used when a field exists in the catalog but is not loaded. */
export const FIELD_UNAVAILABLE_REASON = 'Not loaded in this view';

/** What the user chose from the copy menu. */
export type CopyChoice =
  | 'prompts'
  | 'unique-prompts'
  | 'negative-prompts'
  | 'tags'
  | 'distinct-tags'
  | 'workflow-json'
  | 'prompt-api-json'
  | 'ocr-text';

export type CopyMenuEntry = {
  id: CopyChoice;
  label: string;
  /** `CPY-10`/design: comics get OCR, ComfyUI gets the JSON copies. */
  kind: 'comfyui' | 'comic';
  /** Disabled with a reason rather than hidden, as `GAL-23` requires. */
  available: boolean;
  reason?: string;
};

/**
 * The copy menu.
 *
 * Availability follows the same rule as the selection bar's other actions: the
 * entry is present but disabled with a reason. Hiding it would make a comic
 * library look as if OCR copy had never been built.
 */
export function copyMenu(options: {
  libraryType: 'comfyui' | 'comic';
  count: number;
  /**
   * Fields the caller cannot supply. The gallery's list query returns the
   * positive prompt and tags but not the negative prompt or the embedded JSON,
   * so from Explore those entries are disabled up front rather than enabled and
   * then reporting an empty result.
   */
  unavailableFields?: readonly CopyChoice[];
}): CopyMenuEntry[] {
  const comic = options.libraryType === 'comic';
  const none = options.count === 0;
  const unavailable = new Set(options.unavailableFields ?? []);

  // Seeds carry no reason: the reason is decided below, because a seeded one
  // survives into the enabled branch and an enabled entry that advertises
  // "Comic libraries only" tells the user the opposite of the truth.
  const entries: CopyMenuEntry[] = [
    { id: 'prompts', label: 'Copy prompts', kind: 'comfyui', available: false },
    { id: 'unique-prompts', label: 'Copy unique prompts', kind: 'comfyui', available: false },
    { id: 'negative-prompts', label: 'Copy negative prompts', kind: 'comfyui', available: false },
    { id: 'tags', label: 'Copy tags', kind: 'comfyui', available: false },
    { id: 'distinct-tags', label: 'Copy all distinct tags', kind: 'comfyui', available: false },
    { id: 'workflow-json', label: 'Copy workflow JSON', kind: 'comfyui', available: false },
    { id: 'prompt-api-json', label: 'Copy Prompt API JSON', kind: 'comfyui', available: false },
    { id: 'ocr-text', label: 'Copy OCR text', kind: 'comic', available: false },
  ];

  return entries.map((entry) => {
    const wanted = comic ? 'comic' : 'comfyui';
    if (entry.kind !== wanted) {
      // The reason names the kind the entry needs, not the library we are in.
      return {
        ...entry,
        available: false,
        reason: entry.kind === 'comic' ? 'Comic libraries only' : 'ComfyUI libraries only',
      };
    }
    if (none) return { ...entry, available: false, reason: 'Select at least one image' };
    if (unavailable.has(entry.id)) {
      return { ...entry, available: false, reason: FIELD_UNAVAILABLE_REASON };
    }
    // No `reason` key at all when enabled: the tooltip is for disabled entries.
    return { ...entry, available: true, reason: undefined };
  });
}

/**
 * Run a copy choice.
 *
 * The mapping is exhaustive over `CopyChoice` so a new menu entry cannot be
 * added without deciding what it copies — the compiler, not review, catches it.
 */
export function runCopy(choice: CopyChoice, items: readonly CopyItem[]): CopyResult {
  switch (choice) {
    case 'prompts':
      return copyPrompts(items);
    case 'unique-prompts':
      return copyUniquePrompts(items);
    case 'negative-prompts':
      return copyNegativePrompts(items);
    case 'tags':
      return copyTags(items);
    case 'distinct-tags':
      return copyDistinctTags(items);
    case 'workflow-json':
      return copyWorkflowJson(items);
    case 'prompt-api-json':
      return copyPromptApiJson(items);
    case 'ocr-text':
      return copyOcrText(items);
  }
}

/** The clipboard write, which is the only thing that can fail (`STA-46`). */
export type ClipboardWriter = (text: string) => Promise<boolean>;

export type CopyOutcome =
  | { status: 'copied'; text: string; toast: string }
  /** `STA-46`: the clipboard could not be written. */
  | { status: 'clipboard-unavailable'; text: string; toast: string }
  /** `STA-47` lower tier: confirm first. */
  | { status: 'needs-confirm'; text: string; items: number; mb: number }
  /** `STA-47` upper tier: file export only. */
  | { status: 'too-large'; text: string; items: number; mb: number };

/**
 * The toast wording.
 *
 * `CPY-02` fixes it as "Copied 22 of 24 prompts — 2 have no prompt.", so the
 * noun is part of the contract and lives with the rest of the copy rules rather
 * than being spelled out at the call site.
 */
export function copyToast(choice: CopyChoice, result: CopyResult): string {
  // Say plainly that the field is missing rather than reporting every item as
  // empty — see `CopyResult.fieldUnavailable`.
  if (result.fieldUnavailable) {
    return `Copied nothing — ${result.fieldUnavailable}.`;
  }
  const noun = TOAST_NOUN[choice];
  if (result.skipped === 0) {
    return `Copied ${result.copied} ${noun}.`;
  }
  return `Copied ${result.copied} of ${result.considered} ${noun} — ${result.skipped} have no ${singular(noun)}.`;
}

const TOAST_NOUN: Record<CopyChoice, string> = {
  prompts: 'prompts',
  'unique-prompts': 'prompts',
  'negative-prompts': 'negative prompts',
  tags: 'tags',
  'distinct-tags': 'tags',
  'workflow-json': 'workflows',
  'prompt-api-json': 'prompts',
  'ocr-text': 'pages',
};

function singular(noun: string): string {
  return noun.endsWith('s') ? noun.slice(0, -1) : noun;
}

/**
 * The whole copy interaction: build, gate, write.
 *
 * `CPY-10` is satisfied by construction — nothing here writes to the catalog, and
 * the caller cannot be handed a "did it save?" signal because there is none.
 * Read-only libraries and privacy-blur states simply call this unchanged.
 */
export async function copyToClipboard(
  choice: CopyChoice,
  items: readonly CopyItem[],
  limits: CopyLimits,
  write: ClipboardWriter,
  confirm: boolean = false,
): Promise<CopyOutcome> {
  const result = runCopy(choice, items);
  const text = toClipboardText(result.text);
  const gate = gateCopy(result, limits);

  if (gate.kind === 'too-large') {
    return { status: 'too-large', text, items: gate.items, mb: gate.mb };
  }
  if (gate.kind === 'confirm' && !confirm) {
    return { status: 'needs-confirm', text, items: gate.items, mb: gate.mb };
  }

  const ok = await write(text);
  if (!ok) {
    // `STA-46` still offers **Save as file…**, so the text travels with it.
    return { status: 'clipboard-unavailable', text, toast: COPY_STATES.clipboardUnavailable };
  }
  return { status: 'copied', text, toast: copyToast(choice, result) };
}