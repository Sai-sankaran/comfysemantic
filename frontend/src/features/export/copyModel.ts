// covers: CPY-01, CPY-02, CPY-03, CPY-04, CPY-05, CPY-06, CPY-07, CPY-08, CPY-09, CPY-10

/**
 * Copy-as-text (CPY-01..CPY-10), Appendix G.2.
 *
 * Every function here is pure and takes the items in **gallery order**. Nothing
 * in this file touches the clipboard, the filesystem or the catalog: the caller
 * decides what to do with the returned text (clipboard or file), which is what
 * makes `CPY-08`'s "Export as file…" fallback a one-line branch rather than a
 * second implementation.
 *
 * The ordering rule (`CPY-01`) is the reason items are passed in as an ordered
 * array and never sorted here. "Select all N" is resolved by the backend against
 * the same query and sort, so a selection that includes unloaded items still
 * arrives here in gallery order.
 */

/** The minimum an item must expose to be copyable. */
export type CopyItem = {
  id: string;
  filename: string;
  /** Stored positive prompt, if any. */
  positivePrompt?: string | null;
  /** Stored negative prompt, if any. */
  negativePrompt?: string | null;
  tags?: readonly string[];
  /** ComfyUI embedded workflow, verbatim. Never re-serialise (`CPY-06`). */
  workflowJson?: string | null;
  /** ComfyUI embedded API-format prompt, verbatim. */
  promptApiJson?: string | null;
  /** Comic OCR. `CPY-07`. */
  ocr?: OcrCopySource | null;
};

/**
 * `CPY-07`: the effective text of a page or a panel.
 *
 * `OCR-04` chooses between machine and manual text; that decision is made by the
 * backend, so this type carries only the already-effective regions.
 */
export type OcrCopySource = {
  /** Regions in reading order, each already reduced to its effective text. */
  regions: readonly { text: string }[];
};

/** `CPY-02`: every run of line breaks becomes a single space, then trim. */
export function flattenPrompt(text: string | null | undefined): string {
  if (!text) return '';
  // `\s` covers CRLF and CR as well as LF, so a prompt authored on Windows and
  // one authored on Linux normalise identically.
  return text.replace(/\s+/g, ' ').trim();
}

/** `CPY-02` + `CPY-03`: normalise, then compare as an exact string. */
export function promptKey(text: string | null | undefined): string {
  return flattenPrompt(text);
}

/** The result of a copy that can skip items and therefore counts them. */
export type CopyResult = {
  /** The text to put on the clipboard. */
  text: string;
  /** How many items were considered. */
  considered: number;
  /** How many were actually copied (`CPY-02`/`CPY-04` skip and count). */
  copied: number;
  /** How many were skipped because the field they needed was empty. */
  skipped: number;
  /**
   * Set when the field is **not loaded at all**, which is a different thing from
   * being empty on every item.
   *
   * The gallery's list query does not return the negative prompt (only the
   * positive one reaches `ExploreRowValues`). Without this flag a copy of
   * negative prompts would report "Copied 0 of 15 negative prompts — 15 have no
   * negative prompt", which is a confident false statement: the user would go
   * looking for prompts the library does have. Reporting "not loaded" keeps a
   * partial copy from looking complete, which is the whole point of counting.
   */
  fieldUnavailable?: string;
};

/**
 * `CPY-02`: prompts, one per line, in gallery order.
 *
 * Items with no prompt are skipped and counted, so the toast can say
 * "Copied 22 of 24 prompts — 2 have no prompt."
 */
export function copyPrompts(items: readonly CopyItem[]): CopyResult {
  const lines: string[] = [];
  let skipped = 0;
  for (const item of items) {
    const prompt = flattenPrompt(item.positivePrompt);
    if (!prompt) {
      skipped += 1;
      continue;
    }
    lines.push(prompt);
  }
  return { text: lines.join('\n'), considered: items.length, copied: lines.length, skipped };
}

/**
 * `CPY-02`: negative prompts follow exactly the same rule as positive ones.
 */
export function copyNegativePrompts(items: readonly CopyItem[]): CopyResult {
  const lines: string[] = [];
  let skipped = 0;
  for (const item of items) {
    const prompt = flattenPrompt(item.negativePrompt);
    if (!prompt) {
      skipped += 1;
      continue;
    }
    lines.push(prompt);
  }
  return { text: lines.join('\n'), considered: items.length, copied: lines.length, skipped };
}

/**
 * `CPY-03`: unique prompts.
 *
 * De-duplication is on the *normalised* string, and the first occurrence keeps
 * its position, so the output is a subsequence of `copyPrompts` rather than a
 * re-sort. Negative prompts follow `CPY-02` (same normalisation), just not the
 * uniqueness rule.
 */
export function copyUniquePrompts(items: readonly CopyItem[]): CopyResult {
  const seen = new Set<string>();
  const lines: string[] = [];
  let skipped = 0;
  for (const item of items) {
    const prompt = flattenPrompt(item.positivePrompt);
    if (!prompt) {
      skipped += 1;
      continue;
    }
    if (seen.has(prompt)) continue;
    seen.add(prompt);
    lines.push(prompt);
  }
  return { text: lines.join('\n'), considered: items.length, copied: lines.length, skipped };
}

/** `CPY-04`: one item's tags as `a, b, c`. Several items: one line each. */
export function copyTags(items: readonly CopyItem[]): CopyResult {
  const lines: string[] = [];
  let skipped = 0;
  for (const item of items) {
    const tags = normaliseTagList(item.tags);
    if (!tags) {
      skipped += 1;
      continue;
    }
    lines.push(tags);
  }
  return { text: lines.join('\n'), considered: items.length, copied: lines.length, skipped };
}

/**
 * `CPY-04`: tags are stored without commas or line breaks (`TAG-02`), so the
 * join is unambiguous. Empty entries are dropped defensively.
 */
export function normaliseTagList(tags: readonly string[] | null | undefined): string {
  if (!tags) return '';
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .join(', ');
}

/**
 * `CPY-05`: every distinct tag in the selection, one line, separated by `, `,
 * ordered by frequency (descending) then alphabetically, case-insensitively.
 *
 * Case-insensitive alphabetical order needs a stable comparison: `localeCompare`
 * with the default locale sorts `Ä` next to `A`, which is not what a tag list
 * should do. Comparing lowercased code points keeps it predictable.
 */
export function copyDistinctTags(items: readonly CopyItem[]): CopyResult {
  // One pass collects both the count and the first-seen spelling. The spelling
  // matters because uniqueness is case-insensitive (`TAG-03`) but the output
  // should read `Portrait`, not whichever casing happened to come last.
  const entries = new Map<string, { count: number; spelling: string }>();
  for (const item of items) {
    for (const raw of item.tags ?? []) {
      const tag = raw.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      const existing = entries.get(key);
      if (existing) existing.count += 1;
      else entries.set(key, { count: 1, spelling: tag });
    }
  }
  const ordered = [...entries.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.spelling.toLowerCase() < b.spelling.toLowerCase()
      ? -1
      : a.spelling.toLowerCase() > b.spelling.toLowerCase()
        ? 1
        : 0;
  });
  const text = ordered.map((entry) => entry.spelling).join(', ');
  return { text, considered: items.length, copied: entries.size, skipped: 0 };
}

/**
 * `CPY-06`: workflow and API JSON are copied **verbatim**.
 *
 * No parsing, no re-serialising, no key re-ordering — the whole point is that
 * the bytes are the bytes ComfyUI embedded. This is why the return type is the
 * raw string and not a parsed object.
 */
export function copyWorkflowJson(items: readonly CopyItem[]): CopyResult {
  return copyVerbatim(items, (item) => item.workflowJson);
}

/** `CPY-06`: the API-format prompt, same verbatim rule. */
export function copyPromptApiJson(items: readonly CopyItem[]): CopyResult {
  return copyVerbatim(items, (item) => item.promptApiJson);
}

function copyVerbatim(
  items: readonly CopyItem[],
  pick: (item: CopyItem) => string | null | undefined,
): CopyResult {
  const parts: string[] = [];
  let skipped = 0;
  for (const item of items) {
    const value = pick(item);
    if (!value) {
      skipped += 1;
      continue;
    }
    parts.push(value);
  }
  return { text: parts.join('\n'), considered: items.length, copied: parts.length, skipped };
}

/**
 * `CPY-07`: OCR text for comics.
 *
 * A page becomes the effective text of its regions in reading order with a blank
 * line between panels; a panel becomes just its own text. Several items are
 * separated by a line containing `---`, itself surrounded by blank lines, so a
 * later region can never be mistaken for a continuation of an earlier one.
 */
export function copyOcrText(items: readonly CopyItem[]): CopyResult {
  const parts: string[] = [];
  let skipped = 0;
  for (const item of items) {
    const regions = (item.ocr?.regions ?? [])
      .map((region) => region.text.trim())
      .filter((text) => text.length > 0);
    if (regions.length === 0) {
      skipped += 1;
      continue;
    }
    parts.push(regions.join('\n\n'));
  }
  const text = parts.join('\n\n---\n\n');
  return { text, considered: items.length, copied: parts.length, skipped };
}

/** `CPY-08`: the thresholds, read from settings. */
export type CopyLimits = {
  confirmItems: number;
  confirmMB: number;
  hardCapItems: number;
  hardCapMB: number;
};

/** `CPY-09`: UTF-8 byte length, which is what the MB limits are actually about. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function megabytes(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

export type CopyGate =
  | { kind: 'ok' }
  /** `STA-47` first tier: confirm, but **Copy anyway** is offered. */
  | { kind: 'confirm'; items: number; mb: number }
  /** `STA-47` second tier: **Export as file…** only. Never silently truncate. */
  | { kind: 'too-large'; items: number; mb: number };

/**
 * `CPY-08`: decide whether a copy needs a confirmation, needs to go to a file,
 * or can simply happen.
 *
 * Order matters. The hard cap is checked first, because a copy that is over the
 * hard cap must not be offered as "Copy anyway" — that button would produce text
 * the caller is not allowed to write, and the requirement is explicitly that it
 * never truncates silently.
 */
export function gateCopy(
  result: Pick<CopyResult, 'text' | 'considered'>,
  limits: CopyLimits,
): CopyGate {
  const items = result.considered;
  const mb = megabytes(byteLength(result.text));

  if (items > limits.hardCapItems || mb > limits.hardCapMB) {
    return { kind: 'too-large', items, mb };
  }
  if (items > limits.confirmItems || mb > limits.confirmMB) {
    return { kind: 'confirm', items, mb };
  }
  return { kind: 'ok' };
}

/** `CPY-09`: UTF-8 with LF endings, never CRLF, whatever the platform. */
export function toClipboardText(text: string): string {
  // Order matters: CRLF must collapse to a single LF first, otherwise a
  // later lone-CR pass would not exist but a naive CR-only pass would turn
  // `\r\n` into two newlines.
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}