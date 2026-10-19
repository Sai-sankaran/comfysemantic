// covers: EXP-02, EXP-03, EXP-05, EXP-06, EXP-07, EXP-09, EXP-10, RRN-01

/**
 * The export menu (Appendix I).
 *
 * Same shape as `copyMenu.ts`: the entries and their availability live here so
 * the selection bar stays a rendering concern, and the actual planning lives in
 * `exportModel.ts`.
 */

/** Shown while the destination picker and writer are not wired. */
export const NOT_RUNNABLE_REASON = 'Export is not available yet';

export type ExportChoice =
  | 'prompts-csv'
  | 'visible-columns-csv'
  | 'images-prompt'
  | 'images-tags'
  | 'images-prompt-tags'
  | 'comic-panels'
  | 'workflow-json';

export type ExportMenuEntry = {
  id: ExportChoice;
  label: string;
  kind: 'comfyui' | 'comic';
  available: boolean;
  reason?: string;
  /** `EXP-03`: whether the entry opens the dry-run summary before Start. */
  needsSummary: boolean;
};

/**
 * The export menu.
 *
 * `EXP-07` is comic-only and `EXP-09` is ComfyUI-only; both stay visible with a
 * reason rather than disappearing, for the same reason `GAL-23` gives.
 */
export function exportMenu(options: {
  libraryType: 'comfyui' | 'comic';
  count: number;
  /**
   * Whether the export pipeline can actually run.
   *
   * `false` while the picker/writer is not wired: the entries stay visible and
   * are **disabled with a reason**, per the `GAL-23` rule. An enabled button that
   * opens nothing is the dead end this replaces.
   */
  available?: boolean;
}): ExportMenuEntry[] {
  const comic = options.libraryType === 'comic';
  const empty = options.count === 0;
  const runnable = options.available !== false;

  const entries: ExportMenuEntry[] = [
    { id: 'prompts-csv', label: 'Prompts (CSV)…', kind: 'comfyui', available: false, needsSummary: false },
    { id: 'visible-columns-csv', label: 'Export visible columns (CSV)…', kind: 'comfyui', available: false, needsSummary: false },
    { id: 'images-prompt', label: 'Images + prompts…', kind: 'comfyui', available: false, needsSummary: true },
    { id: 'images-tags', label: 'Images + tags…', kind: 'comfyui', available: false, needsSummary: true },
    { id: 'images-prompt-tags', label: 'Images + prompts + tags…', kind: 'comfyui', available: false, needsSummary: true },
    { id: 'comic-panels', label: 'Export comic panels…', kind: 'comic', available: false, needsSummary: true },
    { id: 'workflow-json', label: 'Save workflow as .json…', kind: 'comfyui', available: false, needsSummary: false },
  ];

  return entries.map((entry) => {
    // The pipeline gate comes first: if export cannot run at all, that is the
    // reason the user needs, not "select one image".
    if (!runnable) {
      return { ...entry, available: false, reason: NOT_RUNNABLE_REASON };
    }
    if (entry.kind !== (comic ? 'comic' : 'comfyui')) {
      return {
        ...entry,
        available: false,
        reason: entry.kind === 'comic' ? 'Comic libraries only' : 'ComfyUI libraries only',
      };
    }
    if (empty) return { ...entry, available: false, reason: 'Select at least one image' };
    // `EXP-09` is a single-item action: a workflow belongs to one image, so a
    // multi-item selection must say so rather than silently writing one file.
    if (entry.id === 'workflow-json' && options.count !== 1) {
      return { ...entry, available: false, reason: 'Select one image' };
    }
    // `reason: undefined` explicitly, so an enabled entry can never inherit a
  // seed reason. See the same guard in `copyMenu.ts`.
  return { ...entry, available: true, reason: undefined };
  });
}