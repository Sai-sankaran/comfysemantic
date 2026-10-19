import { createContext, useContext } from 'react';

/**
 * The shell-level panes (design `NAV-04`, `NAV-05`, `NAV-07`).
 *
 * The folder tree and the inspector are **not** part of any one screen: `B` and
 * `I` toggle them, they frame Explore and Search alike, and they have to survive
 * the screen underneath being unmounted. So their state belongs to the shell, and
 * a screen reads it from here rather than receiving it as props through `App`.
 *
 * `selectedCount` lives here too because the tray's "N selected" has to agree
 * with the gallery's selection without the two each keeping a copy.
 */
/** `NAV-51`: the Undo action offered beside a note, and how long it lives. */
export type UndoOffer = { label: string; run: () => void | Promise<void> };

/** `NAV-51`: reversible actions show Undo for 8 seconds. */
export const UNDO_WINDOW_MS = 8000;

export type ShellPanesValue = {
  treeOpen: boolean;
  inspectorOpen: boolean;
  /** `NAV-07`: how many items the gallery has selected. */
  selectedCount: number;
  setSelectedCount: (count: number) => void;
  setTreeOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  /**
   * Say something in the shell's note line, optionally with an Undo action.
   *
   * `NAV-51`: a reversible action never shows a confirmation dialog; it shows a
   * toast with **Undo** for 8 seconds. The toast belongs to the shell for the
   * same reason the note line does — a screen that opened its own would put one
   * fact in two places with two lifetimes.
   */
  notify: (message: string, undo?: { label: string; run: () => void | Promise<void> }) => void;
  /**
   * `E.2` / `TBL-01`: the gallery's Grid | Table view mode.
   *
   * It is here rather than in Explore because `browse.viewMode` is a setting with
   * scopes A/L/F and because the `Alt+1` / `Alt+2` actions are registered
   * `global`, so they have to reach it from any destination. `TBL-01` requires
   * the table to keep the selection, filters, sort and focused item across a view
   * switch, which is why only the *mode* crosses this boundary - the result
   * sequence stays in the screen.
   */
  viewMode: 'grid' | 'table';
  setViewMode: (mode: 'grid' | 'table') => void;
};

export const ShellPanesContext = createContext<ShellPanesValue | null>(null);

/**
 * Read the shell panes. Returns `null` outside the shell, which a screen must
 * tolerate: a harness or a test that mounts a screen alone still gets a working
 * screen with both panes open.
 */
export function useShellPanes(): ShellPanesValue | null {
  return useContext(ShellPanesContext);
}