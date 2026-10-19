// covers: EXP-01, EXP-02, EXP-03, EXP-05, EXP-08, EXP-09, EXP-10

/**
 * Export (EXP-01..EXP-10), Appendix I.
 *
 * Like `copyModel.ts`, this file is pure logic: given a validated destination
 * and a set of items it decides *what* to write, and returns a plan. Writing the
 * bytes is the platform adapter's job. That split is what lets the dry-run
 * summary (`EXP-03`) be produced by exactly the same code path as the real run,
 * so the numbers a user approves are the numbers that happen.
 */

/** The CSV column order is fixed by `EXP-05` and is not user-sortable. */
export const CSV_COLUMNS = [
  'file',
  'folder',
  'positive_prompt',
  'negative_prompt',
  'model',
  'loras',
  'sampler',
  'steps',
  'cfg',
  'seed',
  'width',
  'height',
  'tags',
  'rating',
  'favourite',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export type ExportItem = {
  id: string;
  filename: string;
  /** Path relative to the library root, for the manifest and the `folder` column. */
  relativePath: string;
  folder: string;
  /** Bytes of the source file, for the size estimate and the fingerprint. */
  size: number;
  /** Epoch milliseconds, for the manifest fingerprint. */
  modifiedAt: number;
  positivePrompt?: string | null;
  negativePrompt?: string | null;
  model?: string | null;
  loras?: readonly string[] | null;
  sampler?: string | null;
  steps?: number | null;
  cfg?: number | null;
  seed?: number | string | null;
  width?: number | null;
  height?: number | null;
  tags?: readonly string[];
  rating?: number | null;
  favourite?: boolean;
  /** `EXP-06`: the original file, copied byte-identically. */
  /** `EXP-02`: whether the source file is actually on disk. */
  missingFile?: boolean;
  /** `EXP-08`: the first-64 KB hash. Full-file hashing is explicitly not wanted. */
  headHash?: string;
};

export type CaptionTemplate = 'prompt' | 'tags' | 'prompt+tags';

export type ExportSettings = {
  csvBom: boolean;
  includeUncaptioned: boolean;
  writeManifest: boolean;
};

/**
 * `EXP-02`: never overwrite. `report.png` → `report_2.png`, and if that is taken
 * too, `report_3.png`.
 *
 * The counter starts at 2 so the first collision is `_2`, which is what the
 * requirement's example shows. The extension is preserved and the stem is the
 * only part that changes, because the caption file must share the stem.
 */
export function uniqueName(filename: string, taken: ReadonlySet<string>): string {
  if (!taken.has(filename)) return filename;
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  let counter = 2;
  let candidate = `${stem}_${counter}${ext}`;
  while (taken.has(candidate)) {
    counter += 1;
    candidate = `${stem}_${counter}${ext}`;
  }
  return candidate;
}

/** `EXP-06`: build the `.txt` body for one item under the chosen template. */
export function captionFor(item: ExportItem, template: CaptionTemplate): string {
  const prompt = (item.positivePrompt ?? '').replace(/\s+/g, ' ').trim();
  const tags = (item.tags ?? []).map((tag) => tag.trim()).filter(Boolean).join(', ');

  if (template === 'tags') return tags;
  if (template === 'prompt+tags') {
    if (prompt && tags) return `${prompt}, ${tags}`;
    return prompt || tags;
  }
  return prompt;
}

export type ExportPlanEntry = {
  item: ExportItem;
  /** The name written in the destination folder. */
  outputName: string;
  /** `null` when no caption is written. */
  captionName: string | null;
  /** Why the item was skipped, or `null` when it is exported. */
  skipped: 'missing-file' | 'no-caption' | null;
  bytes: number;
  /**
   * The caption body, computed at planning time.
   *
   * Carried on the entry rather than recomputed by the writer because the
   * caption depends on the chosen template, which the planner knows and the
   * writer does not. `''` when there is nothing to write.
   */
  captionBody: string;
};

export type ExportPlan = {
  entries: ExportPlanEntry[];
  toWrite: ExportPlanEntry[];
  skipped: ExportPlanEntry[];
  totalBytes: number;
  /**
   * Whether this plan produces files rather than one document, and so needs the
   * `EXP-03` dry-run summary before Start.
   */
  needsSummary: boolean;
};

export type ExportPlanRequest = {
  items: readonly ExportItem[];
  /** Names already present in the destination folder. */
  takenNames: ReadonlySet<string>;
  caption: CaptionTemplate | null;
  includeUncaptioned: boolean;
};

/**
 * `EXP-02` + `EXP-06`: plan an images-plus-captions export.
 *
 * Names are allocated in gallery order and each allocation is fed back into the
 * taken-set, so two source files called `cover.png` in different folders cannot
 * both land on `cover.png`.
 */
export function planImageExport(request: ExportPlanRequest): ExportPlan {
  const taken = new Set(request.takenNames);
  const entries: ExportPlanEntry[] = [];

  for (const item of request.items) {
    if (item.missingFile) {
      entries.push({
        item,
        outputName: item.filename,
        captionName: null,
        skipped: 'missing-file',
        bytes: 0,
        captionBody: '',
      });
      continue;
    }

    const outputName = uniqueName(item.filename, taken);
    taken.add(outputName);

    let captionName: string | null = null;
    let captionBody = '';
    if (request.caption !== null) {
      const body = captionFor(item, request.caption);
      if (body) {
        captionBody = body;
        const base = outputName.slice(0, outputName.lastIndexOf('.')) || outputName;
        captionName = uniqueName(`${base}.txt`, taken);
        taken.add(captionName);
      } else if (!request.includeUncaptioned) {
        entries.push({
          item,
          outputName,
          captionName: null,
          skipped: 'no-caption',
          bytes: 0,
          captionBody: '',
        });
        continue;
      }
    }

    entries.push({
      item,
      outputName,
      captionName,
      skipped: null,
      bytes: item.size,
      captionBody,
    });
  }

  const toWrite = entries.filter((entry) => entry.skipped === null);
  return {
    entries,
    toWrite,
    skipped: entries.filter((entry) => entry.skipped !== null),
    totalBytes: toWrite.reduce((sum, entry) => sum + entry.bytes, 0),
    needsSummary: true,
  };
}

/**
 * `EXP-05`: RFC 4180 quoting, CRLF rows, and — the part that is easy to get
 * wrong — line breaks *inside* a prompt are preserved inside the quoted cell.
 *
 * That is the explicit contrast with copy-as (`CPY-02` flattens them), so the
 * flattening must not leak in from there.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const needsQuotes = /["\r\n,]/.test(text);
  if (!needsQuotes) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export type CsvRequest = {
  items: readonly ExportItem[];
  /** `EXP-05`: **Export visible columns** reuses this writer with other columns. */
  columns?: readonly CsvColumn[];
  bom?: boolean;
};

export function buildCsv(request: CsvRequest): string {
  const columns = request.columns ?? CSV_COLUMNS;
  const rows = [columns.map(csvCell).join(',')];
  for (const item of request.items) {
    rows.push(columns.map((column) => csvCell(csvValue(item, column))).join(','));
  }
  const body = rows.join('\r\n') + '\r\n';
  return request.bom === false ? body : `\uFEFF${body}`;
}

function csvValue(item: ExportItem, column: CsvColumn): string | number | boolean | null {
  switch (column) {
    case 'file':
      return item.filename;
    case 'folder':
      return item.folder;
    case 'positive_prompt':
      return item.positivePrompt ?? null;
    case 'negative_prompt':
      return item.negativePrompt ?? null;
    case 'model':
      return item.model ?? null;
    case 'loras':
      return item.loras?.join(', ') ?? null;
    case 'sampler':
      return item.sampler ?? null;
    case 'steps':
      return item.steps ?? null;
    case 'cfg':
      return item.cfg ?? null;
    case 'seed':
      return item.seed ?? null;
    case 'width':
      return item.width ?? null;
    case 'height':
      return item.height ?? null;
    case 'tags':
      return (item.tags ?? []).join(', ') || null;
    case 'rating':
      return item.rating ?? null;
    case 'favourite':
      return item.favourite ?? null;
  }
}

export type ManifestEntry = {
  source: string;
  output: string;
  /** `EXP-08`: size + modified time + first-64 KB hash, never a full hash. */
  fingerprint: { size: number; modified: string; headHash: string | null };
};

export type Manifest = {
  appVersion: string;
  date: string;
  libraryName: string;
  libraryType: 'comfyui' | 'comic';
  template: CaptionTemplate | null;
  items: ManifestEntry[];
};

export function buildManifest(
  plan: ExportPlan,
  context: Omit<Manifest, 'items'>,
): Manifest {
  return {
    ...context,
    items: plan.toWrite.map((entry) => ({
      source: entry.item.relativePath,
      output: entry.outputName,
      fingerprint: {
        size: entry.item.size,
        modified: new Date(entry.item.modifiedAt).toISOString(),
        headHash: entry.item.headHash ?? null,
      },
    })),
  };
}

/** `EXP-03`: the estimate, and the free-space check that gates Start. */
export type DryRun = {
  itemCount: number;
  bytes: number;
  skipped: { missingFile: number; noCaption: number };
  /** `EXP-03`: required space is the estimate plus 10%. */
  requiredBytes: number;
  /** `STA-48` when there is not enough room. */
  insufficientSpace: boolean;
};

export function dryRun(plan: ExportPlan, freeBytes: number): DryRun {
  const bytes = plan.totalBytes;
  const requiredBytes = Math.ceil(bytes * 1.1);
  return {
    itemCount: plan.toWrite.length,
    bytes,
    skipped: {
      missingFile: plan.skipped.filter((entry) => entry.skipped === 'missing-file').length,
      noCaption: plan.skipped.filter((entry) => entry.skipped === 'no-caption').length,
    },
    requiredBytes,
    insufficientSpace: freeBytes < requiredBytes,
  };
}

/** `EXP-10`: the confirmation threshold, in items and estimated gigabytes. */
export const EXPORT_CONFIRM_ITEMS = 5_000;
export const EXPORT_CONFIRM_BYTES = 5 * 1024 * 1024 * 1024;

export function needsExportConfirmation(plan: ExportPlan): boolean {
  return plan.toWrite.length > EXPORT_CONFIRM_ITEMS || plan.totalBytes > EXPORT_CONFIRM_BYTES;
}