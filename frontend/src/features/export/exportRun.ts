// covers: EXP-04, EXP-01, EXP-03

/**
 * The export state machine (step 2, priority 2).
 *
 * Deliberately free of React, of the platform adapter and of the filesystem:
 * every transition is a pure function over an explicit state object, so the
 * interesting cases — cancelling at the picker, failing halfway through a write,
 * two items colliding on one name — are testable without mounting anything.
 *
 * ## States
 *
 *   planning → picking → writing → done
 *                  ↘        ↘
 *                  cancelled  failed
 *
 * `cancelled` and `failed` are **distinct on purpose**. A user who dismisses the
 * folder picker has made a deliberate choice; showing that as a red error in the
 * tray teaches them that cancelling is a failure, and they will start avoiding
 * the button that is supposed to be safe to explore.
 */

/** Where an export run is. */
export type ExportRunState =
  | 'planning'
  | 'picking'
  | 'writing'
  | 'done'
  | 'cancelled'
  | 'failed';

/** The states from which no further work happens. */
export const TERMINAL_STATES: readonly ExportRunState[] = ['done', 'cancelled', 'failed'];

/** Why a run ended, or why it failed. Distinguishes cancel from error. */
export type ExportFailure =
  | { kind: 'user-cancelled' }
  | { kind: 'invalid-destination'; code: 'STA-26' }
  | { kind: 'insufficient-space' }
  | { kind: 'write-failed'; item: string; message: string }
  | { kind: 'aborted' }
  /** A planner returned nothing. A clean run with nothing is a bug. */
  | { kind: 'nothing-to-export' };

/**
 * What actually happened to the files.
 *
 * ## Partial-write policy (step 2, priority 3): **keep and report.**
 *
 * A run that wrote 7 of 12 files and then failed *keeps* the 7. Rolling back
 * would mean deleting files this run created, seconds ago, in a user-chosen
 * folder — and a rollback that itself fails (a file locked by Explorer, a
 * virus scanner holding it, a permissions change mid-run) leaves the user in a
 * worse state than the original failure: files neither complete nor reported.
 *
 * Keeping is also the honest description of what happened. The alternative —
 * deleting silently — is the one option where a bug destroys user-visible data
 * with no record.
 *
 * The consequence, stated plainly: a partial run leaves files behind. The
 * `written` list is therefore part of the result type, not a derived number, so
 * the UI can name exactly which files exist.
 */
export type ExportOutcome = {
  state: 'done' | 'failed' | 'cancelled';
  /** Files fully written. Always accurate, never inferred from `total`. */
  written: string[];
  /** Items skipped by the plan (missing file, no caption) — `EXP-03`/`EXP-06`. */
  skipped: { item: string; reason: 'missing-file' | 'no-caption' }[];
  /** Items that were planned but never reached. */
  notAttempted: string[];
  failure: ExportFailure | null;
};

export type ExportRun = {
  state: ExportRunState;
  /** Set once the user picks a destination (`EXP-01`). */
  destination: string | null;
  /** The item names planned to write, in order. */
  planned: string[];
  /** Files written so far. */
  written: string[];
  skipped: ExportOutcome['skipped'];
  /** Index into `planned` of the next item to attempt. */
  cursor: number;
  failure: ExportFailure | null;
  /** `EXP-10`: set once the confirmation has been shown and accepted. */
  confirmed: boolean;
};

export function startExport(planned: string[]): ExportRun {
  // An empty plan is a **planning failure**, not an empty success.
  //
  // Every planner in the system can legitimately return nothing (nothing
  // selected, every item skipped for a missing caption). If the writer treated
  // that as a clean run it would report "done, 0 files written" and the user
  // would believe the export had happened. Failing here means any future plan
  // builder that silently returns nothing is caught by the same path.
  if (planned.length === 0) {
    return {
      state: 'failed',
      destination: null,
      planned: [],
      written: [],
      skipped: [],
      cursor: 0,
      failure: { kind: 'nothing-to-export' },
      confirmed: false,
    };
  }
  return {
    state: 'planning',
    destination: null,
    planned,
    written: [],
    skipped: [],
    cursor: 0,
    failure: null,
    confirmed: false,
  };
}

/**
 * Which transitions are legal.
 *
 * Kept as data rather than a chain of `if`s in each mutator, so the illegal
 * transitions can be asserted directly instead of inferred from a crash.
 */
const TRANSITIONS: Record<ExportRunState, readonly ExportRunState[]> = {
  // `planning → cancelled` exists because the picker opens from planning: a
  // run that has done nothing but collect a plan can be abandoned before a
  // destination is chosen at all.
  planning: ['picking', 'cancelled'],
  // `picking → picking` is "the user chose another folder" — after an `STA-26`
  // rejection the run must stay pickable rather than dying over a folder choice.
  picking: ['picking', 'writing', 'cancelled'],
  writing: ['done', 'failed', 'cancelled'],
  // Terminal states absorb nothing: a late progress event must not resurrect a
  // finished run, which is how a duplicate "Export finished" toast happens.
  done: [],
  cancelled: [],
  failed: [],
};

export function canTransition(from: ExportRunState, to: ExportRunState): boolean {
  return TRANSITIONS[from].includes(to);
}

function move(run: ExportRun, to: ExportRunState): ExportRun {
  if (!canTransition(run.state, to)) {
    throw new Error(`Illegal export transition ${run.state} → ${to}`);
  }
  return { ...run, state: to };
}

/**
 * `EXP-01`: the user opened the folder picker.
 *
 * A `null` destination is a **cancel**, not a failure — see the module comment.
 */
export function destinationChosen(run: ExportRun, destination: string | null): ExportRun {
  if (run.state !== 'planning' && run.state !== 'picking') {
    throw new Error(`destinationChosen called while ${run.state}`);
  }
  if (destination === null) {
    return { ...move(run, 'cancelled'), failure: { kind: 'user-cancelled' } };
  }
  // A valid choice clears any earlier `STA-26`; otherwise the run carries a stale
  // rejection into a state where it no longer applies.
  return { ...move(run, 'picking'), destination, failure: null };
}

/**
 * `EXP-01`: reject a destination inside a library root with `STA-26`.
 *
 * The run stays in `picking` so the user can choose another folder — failing the
 * whole job over a folder choice would be disproportionate.
 */
export function destinationRejected(run: ExportRun): ExportRun {
  if (run.state !== 'picking') throw new Error(`destinationRejected called while ${run.state}`);
  return { ...run, failure: { kind: 'invalid-destination', code: 'STA-26' } };
}

/**
 * `EXP-10`: the large-export confirmation was accepted.
 *
 * This is a **state-preserving** transition — it records consent rather than
 * moving to a new state — so it checks the current state directly. Using
 * `canTransition` here would be wrong: it asks "can `picking` move to `picking`?",
 * which is false, and would reject every legitimate call.
 */
export function confirmAccepted(run: ExportRun): ExportRun {
  if (run.state !== 'picking') {
    throw new Error(`confirmAccepted called while ${run.state}`);
  }
  return { ...run, confirmed: true, failure: null };
}

/** Begin writing. Requires a destination; `EXP-03`'s summary is the gate. */
export function startWriting(run: ExportRun): ExportRun {
  if (!run.destination) throw new Error('startWriting without a destination');
  if (!run.confirmed) throw new Error('startWriting without confirmation');
  return move(run, 'writing');
}

/**
 * Record one completed write.
 *
 * `name` is the *actual* name written, which may carry the `-2`/`-3` suffix from
 * collision handling. That is why it is passed in rather than derived from the
 * plan: the UI must name the file that exists, not the one that was intended.
 */
// Both of these are **state-preserving** bookkeeping, not transitions, so they
// check the current state directly. Using `canTransition` here would be wrong:
// it asks "can `writing` move to `writing`?", which is false.
export function recordWrite(run: ExportRun, name: string): ExportRun {
  if (run.state !== 'writing') {
    throw new Error(`recordWrite called while ${run.state}`);
  }
  return {
    ...run,
    written: [...run.written, name],
    cursor: run.cursor + 1,
  };
}

export function recordSkip(
  run: ExportRun,
  item: string,
  reason: 'missing-file' | 'no-caption',
): ExportRun {
  if (run.state !== 'writing') {
    throw new Error(`recordSkip called while ${run.state}`);
  }
  return { ...run, skipped: [...run.skipped, { item, reason }], cursor: run.cursor + 1 };
}

/** A write failed. Previously written files are **kept** — see `ExportOutcome`. */
export function writeFailed(run: ExportRun, item: string, message: string): ExportRun {
  // `writeFailed` *does* transition (writing → failed), so the check is
  // `canTransition`. Guards must match the mutator's actual behaviour.
  if (!canTransition(run.state, 'failed')) {
    throw new Error(`writeFailed called while ${run.state}`);
  }
  // The cursor advances past the item that failed. It *was* attempted — that is
  // the whole point of the failure — so leaving it in place would report it as
  // `notAttempted` as well as as the failure.
  return {
    ...move(run, 'failed'),
    cursor: run.cursor + 1,
    failure: { kind: 'write-failed', item, message },
  };
}

/** `EXP-04`: the user pressed Stop. */
export function abort(run: ExportRun): ExportRun {
  if (!canTransition(run.state, 'cancelled')) {
    throw new Error(`abort called while ${run.state}`);
  }
  return { ...move(run, 'cancelled'), failure: { kind: 'aborted' } };
}

/** All planned items accounted for. */
export function finish(run: ExportRun): ExportRun {
  if (!canTransition(run.state, 'done')) {
    throw new Error(`finish called while ${run.state}`);
  }
  return move(run, 'done');
}

/**
 * Collapse a run into the outcome the UI reports.
 *
 * This is the single place the partial-write policy is turned into words, so the
 * toast and the tray cannot describe the same run differently.
 */
export function outcome(run: ExportRun): ExportOutcome {
  const notAttempted = run.planned.slice(run.cursor);
  if (run.state === 'done') {
    return {
      state: 'done',
      written: [...run.written],
      skipped: [...run.skipped],
      notAttempted: [],
      failure: null,
    };
  }

  // Classify by the recorded state, with the failure as the tie-break. Casting
  // the state blindly (as an earlier version did) produced "Export finished" for a
  // run that was still writing and carried a failure — the one outcome the
  // requirement says must never read as success.
  const state: 'done' | 'failed' | 'cancelled' =
    run.state === 'cancelled' || run.failure?.kind === 'user-cancelled' || run.failure?.kind === 'aborted'
      ? 'cancelled'
      : 'failed';

  return {
    state,
    written: [...run.written],
    skipped: [...run.skipped],
    notAttempted,
    failure: run.failure,
  };
}

/** The completion line. Partial runs must never read as success. */
export function outcomeMessage(result: ExportOutcome): string {
  if (result.state === 'cancelled') {
    // A deliberate cancel: no error wording, and the files that were written
    // are still named, because they do still exist.
    const n = result.written.length;
    // Both words inflect — "1 file was already written", not "1 file were".
    return n > 0
      ? `Export cancelled — ${n} file${n === 1 ? '' : 's'} ${n === 1 ? 'was' : 'were'} already written.`
      : 'Export cancelled.';
  }
  if (result.state === 'failed') {
    // A planner that returned nothing must say so, never "0 files written".
    if (result.failure?.kind === 'nothing-to-export') {
      return 'Nothing to export — no items could be written.';
    }
    const where = result.failure?.kind === 'write-failed' ? ` on ${result.failure.item}` : '';
    return `Export failed${where} — ${result.written.length} of ${result.written.length + result.notAttempted.length} written. Already-written files were kept.`;
  }
  const skipped = result.skipped.length;
  return `Export finished — ${result.written.length} item${result.written.length === 1 ? '' : 's'}${skipped > 0 ? `, ${skipped} skipped` : ''}.`;
}

/** `EXP-04`: the tray state. A cancel must not look like a red error. */
export function trayTone(result: ExportOutcome): 'neutral' | 'success' | 'warning' | 'error' {
  if (result.state === 'cancelled') return 'neutral';
  if (result.state === 'failed') return 'error';
  return result.skipped.length > 0 ? 'warning' : 'success';
}