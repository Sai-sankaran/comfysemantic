// covers: EXP-01, EXP-03, EXP-04, EXP-06, EXP-10
import { describe, expect, it } from 'vitest';
import {
  abort,
  canTransition,
  confirmAccepted,
  destinationChosen,
  destinationRejected,
  finish,
  outcome,
  outcomeMessage,
  recordSkip,
  recordWrite,
  startExport,
  startWriting,
  trayTone,
  writeFailed,
  TERMINAL_STATES,
  type ExportRunState,
} from '../features/export/exportRun';

const ITEMS = ['a.png', 'b.png', 'c.png'];

function toWriting() {
  let run = startExport(ITEMS);
  run = destinationChosen(run, 'D:\\Out');
  run = confirmAccepted(run);
  return startWriting(run);
}

describe('transition table', () => {
  it('allows only the documented edges', () => {
    expect(canTransition('planning', 'picking')).toBe(true);
    expect(canTransition('picking', 'writing')).toBe(true);
    expect(canTransition('picking', 'cancelled')).toBe(true);
    expect(canTransition('writing', 'done')).toBe(true);
    expect(canTransition('writing', 'failed')).toBe(true);
  });

  it('absorbs nothing into a terminal state', () => {
    const all: ExportRunState[] = [
      'planning',
      'picking',
      'writing',
      'done',
      'cancelled',
      'failed',
    ];
    for (const state of TERMINAL_STATES) {
      for (const to of all) {
        expect(canTransition(state, to)).toBe(false);
      }
    }
  });

  it('treats an empty plan as a failure, not an empty success', () => {
    // A planner that silently returns nothing must not produce "done, 0 files".
    const run = startExport([]);
    expect(run.state).toBe('failed');
    expect(run.failure).toEqual({ kind: 'nothing-to-export' });
    const result = outcome(run);
    expect(result.state).toBe('failed');
    expect(outcomeMessage(result)).toContain('Nothing to export');
    expect(outcomeMessage(result)).not.toMatch(/finished/i);
    expect(trayTone(result)).toBe('error');
  });

it('refuses to start writing without a destination', () => {
    // `startExport` leaves the run in `planning`: no destination was ever
    // chosen, and writing must not be reachable from there.
    expect(() => startWriting(startExport(ITEMS))).toThrow(/destination/);
  });

  it('refuses to start writing without the EXP-10 confirmation', () => {
    const picked = destinationChosen(startExport(ITEMS), 'D:\\Out');
    expect(() => startWriting(picked)).toThrow(/confirmation/);
  });

  it('rejects writes attempted in the wrong state', () => {
    expect(() => recordWrite(startExport(ITEMS), 'a.png')).toThrow(/called while planning/);
    expect(() => recordSkip(startExport(ITEMS), 'a.png', 'missing-file')).toThrow(/planning/);
  });

  it('allows re-picking a folder after an STA-26 rejection', () => {
    const first = destinationChosen(startExport(ITEMS), 'C:\\Images');
    const rejected = destinationRejected(first);
    expect(rejected.state).toBe('picking');
    const again = destinationChosen(rejected, 'D:\\Out');
    expect(again.state).toBe('picking');
    expect(again.destination).toBe('D:\\Out');
    expect(again.failure).toBeNull();
  });
});

describe('cancelling at the picker is not a failure', () => {
  const cancelled = destinationChosen(startExport(ITEMS), null);

  it('lands in cancelled, not failed', () => {
    expect(cancelled.state).toBe('cancelled');
    expect(outcome(cancelled).state).toBe('cancelled');
  });

  it('records the reason as a deliberate choice', () => {
    expect(cancelled.failure).toEqual({ kind: 'user-cancelled' });
  });

  it('does not show a red error in the tray', () => {
    expect(trayTone(outcome(cancelled))).toBe('neutral');
  });

  it('says it was cancelled, not that it failed', () => {
    expect(outcomeMessage(outcome(cancelled))).toBe('Export cancelled.');
  });
});

describe('EXP-01: a destination inside a library root', () => {
  it('stays in picking so another folder can be chosen', () => {
    const picked = destinationChosen(startExport(ITEMS), 'C:\\Images\\out');
    const rejected = destinationRejected(picked);
    expect(rejected.state).toBe('picking');
    expect(rejected.failure).toEqual({ kind: 'invalid-destination', code: 'STA-26' });
  });

  it('clears the rejection once a valid folder is chosen', () => {
    const rejected = destinationRejected(destinationChosen(startExport(ITEMS), 'C:\\Images'));
    const recovered = confirmAccepted(destinationChosen(rejected, 'D:\\Out'));
    expect(recovered.failure).toBeNull();
    expect(recovered.destination).toBe('D:\\Out');
    // And writing is reachable again.
    expect(startWriting(recovered).state).toBe('writing');
  });
});

describe('partial-write policy: keep and report', () => {
  const partial = (() => {
    let run = toWriting();
    run = recordWrite(run, 'a.png');
    run = recordWrite(run, 'b.png');
    // The third write fails, so `c.png` is never recorded.
    return writeFailed(run, 'c.png', 'disk full');
  })();

  it('keeps the files already written', () => {
    expect(outcome(partial).written).toEqual(['a.png', 'b.png']);
  });

  it('lists what was never attempted', () => {
    // Two writes succeeded, then `c.png` failed. The cursor has moved past the
    // failed item too — it *was* attempted — so nothing appears in `notAttempted`.
    expect(partial.cursor).toBe(3);
    expect(outcome(partial).notAttempted).toEqual([]);
  });

  it('does not double-report the failed item', () => {
    const result = outcome(partial);
    expect(result.written).not.toContain('c.png');
    expect(result.notAttempted).not.toContain('c.png');
    // It is accounted for exactly once, as the failure.
    expect(result.failure).toEqual({ kind: 'write-failed', item: 'c.png', message: 'disk full' });
  });

  it('says the written files were kept, so the user does not go looking for them', () => {
    const message = outcomeMessage(outcome(partial));
    expect(message).toContain('were kept');
    expect(message).toContain('c.png');
  });

  it('is a warning-toned error, not a success', () => {
    expect(trayTone(outcome(partial))).toBe('error');
    expect(outcomeMessage(outcome(partial))).not.toMatch(/finished/i);
  });

  it('names the actual written filename, suffix and all', () => {
    let run = toWriting();
    run = recordWrite(run, 'a_2.png');
    expect(outcome(finish(run)).written).toEqual(['a_2.png']);
  });
});

describe('EXP-04: stop mid-write', () => {
  const stopped = (() => {
    let run = toWriting();
    run = recordWrite(run, 'a.png');
    return abort(run);
  })();

  it('keeps what was written rather than deleting it', () => {
    expect(outcome(stopped).written).toEqual(['a.png']);
  });

  it('reports the remainder as not attempted', () => {
    expect(outcome(stopped).notAttempted).toEqual(['b.png', 'c.png']);
  });

  it('is neutral in the tray, and says which files remain', () => {
    expect(trayTone(outcome(stopped))).toBe('neutral');
    expect(outcomeMessage(outcome(stopped))).toContain('1 file was already written');
  });
});

describe('a clean run', () => {
  const complete = (() => {
    let run = toWriting();
    run = recordWrite(run, 'a.png');
    run = recordSkip(run, 'b.png', 'missing-file');
    run = recordWrite(run, 'c.png');
    return finish(run);
  })();

  it('reports done with everything accounted for', () => {
    const result = outcome(complete);
    expect(result.state).toBe('done');
    expect(result.written).toEqual(['a.png', 'c.png']);
    expect(result.skipped).toEqual([{ item: 'b.png', reason: 'missing-file' }]);
    expect(result.notAttempted).toEqual([]);
  });

  it('is a warning tone when something was skipped (STA-49)', () => {
    expect(trayTone(outcome(complete))).toBe('warning');
    expect(outcomeMessage(outcome(complete))).toContain('1 skipped');
  });

  it('is a success tone with nothing skipped', () => {
    let run = toWriting();
    run = recordWrite(run, 'a.png');
    const result = outcome(finish(run));
    expect(trayTone(result)).toBe('success');
    expect(outcomeMessage(result)).not.toContain('skipped');
  });
});