// covers: EXP-02, EXP-04, EXP-06
import { describe, expect, it } from 'vitest';
import {
  destinationChosen,
  destinationRejected,
  finish,
  outcome,
  outcomeMessage,
  recordWrite,
  startExport,
  startWriting,
  writeFailed,
  confirmAccepted,
  abort,
  type ExportFailure,
} from '../features/export/exportRun';
import {
  captionFor,
  planImageExport,
  uniqueName,
  type ExportItem,
} from '../features/export/exportModel';

const ITEMS = ['a.png', 'b.png', 'c.png'];

/** Two items whose source files share a name — the collision case. */
// All three share a source filename *and* carry a prompt, so none of them is
// skipped for missing caption data — otherwise the suffix assertion below would
// find no entries at all.
const COLLIDING: ExportItem[] = [
  item({ id: '1', filename: 'cover.png', positivePrompt: 'p1' }),
  item({ id: '2', filename: 'cover.png', positivePrompt: 'p2' }),
  item({ id: '3', filename: 'cover.png', positivePrompt: 'p3' }),
];

function item(over: Partial<ExportItem> & { id: string }): ExportItem {
  return {
    filename: `${over.id}.png`,
    relativePath: `lib/${over.id}.png`,
    folder: 'lib',
    size: 1000,
    modifiedAt: 1_700_000_000_000,
    ...over,
  };
}

function toWriting(planned: string[] = ITEMS) {
  let run = startExport(planned);
  run = destinationChosen(run, 'D:\\Out');
  run = confirmAccepted(run);
  return startWriting(run);
}

describe('EXP-02: collision policy is suffix, never overwrite', () => {
  it('gives a numeric suffix rather than overwriting', () => {
    const taken = new Set(['a.png']);
    expect(uniqueName('a.png', taken)).toBe('a_2.png');
  });

  it('keeps counting past the first collision', () => {
    const taken = new Set(['a.png', 'a_2.png', 'a_3.png']);
    expect(uniqueName('a.png', taken)).toBe('a_4.png');
  });

  it('plans distinct output names for same-named sources', () => {
    const plan = planImageExport({
      items: COLLIDING,
      takenNames: new Set(),
      caption: null,
      includeUncaptioned: false,
    });
    expect(plan.toWrite.map((e) => e.outputName)).toEqual(['cover.png', 'cover_2.png', 'cover_3.png']);
  });

  it('never lands two items on one output name', () => {
    const plan = planImageExport({
      items: Array.from({ length: 20 }, (_, i) => item({ id: String(i), filename: 'same.png' })),
      takenNames: new Set(),
      caption: null,
      includeUncaptioned: false,
    });
    const names = plan.toWrite.map((e) => e.outputName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('allocates the suffixed name before the caption, so they share a stem', () => {
    const plan = planImageExport({
      items: COLLIDING,
      takenNames: new Set(),
      caption: 'prompt',
      includeUncaptioned: false,
    });
    const second = plan.toWrite[1];
    expect(second.outputName).toBe('cover_2.png');
    expect(second.captionName).toBe('cover_2.txt');
  });

  it('reports the suffixed name actually written, not the intended one', () => {
    let run = toWriting(['cover.png', 'cover.png']);
    run = recordWrite(run, 'cover.png');
    run = recordWrite(run, 'cover_2.png');
    expect(outcome(finish(run)).written).toEqual(['cover.png', 'cover_2.png']);
  });
});

describe('EXP-06: captions', () => {
  it('skips an item with no caption data and counts it', () => {
    const plan = planImageExport({
      items: [item({ id: '1', positivePrompt: 'p' }), item({ id: '2' })],
      takenNames: new Set(),
      caption: 'prompt',
      includeUncaptioned: false,
    });
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.skipped.map((e) => e.skipped)).toEqual(['no-caption']);
  });

  it('writes the image but no caption when includeUncaptioned is set', () => {
    const plan = planImageExport({
      items: [item({ id: '1' })],
      takenNames: new Set(),
      caption: 'tags',
      includeUncaptioned: true,
    });
    expect(plan.toWrite[0].captionName).toBeNull();
  });

  it('builds each of the three templates', () => {
    const one = item({ id: '1', positivePrompt: 'p', tags: ['x', 'y'] });
    expect(captionFor(one, 'prompt')).toBe('p');
    expect(captionFor(one, 'tags')).toBe('x, y');
    expect(captionFor(one, 'prompt+tags')).toBe('p, x, y');
  });

  it('keeps the prompt-only template when tags are absent', () => {
    expect(captionFor(item({ id: '1', positivePrompt: 'p' }), 'prompt+tags')).toBe('p');
  });
});

describe('failure classification drives the message', () => {
  // Only the failures that produce a *message*; `insufficient-space` is a
  // pre-flight gate (`STA-48`) and never reaches `outcome`.
  const cases: { failure: ExportFailure; want: RegExp }[] = [
    { failure: { kind: 'user-cancelled' }, want: /cancelled/i },
    { failure: { kind: 'invalid-destination', code: 'STA-26' }, want: /failed/i },
    { failure: { kind: 'write-failed', item: 'b.png', message: 'x' }, want: /b\.png/ },
    { failure: { kind: 'aborted' }, want: /cancelled/i },
  ];
  // `insufficient-space` and `nothing-to-export` never reach a run with a
  // written-file count to describe, so they are excluded from this table.
  type ClassifiableFailure = Exclude<
    ExportFailure['kind'],
    'insufficient-space' | 'nothing-to-export'
  >;

  // Each case drives the run to its real terminal state rather than pasting a
  // failure onto a still-writing run, which would describe a state the UI never
  // shows.
  const paths: Record<ClassifiableFailure, () => ReturnType<typeof startExport>> = {
    'user-cancelled': () => destinationChosen(startExport(ITEMS), null),
    'invalid-destination': () => {
      let run = destinationChosen(startExport(ITEMS), 'C:\\Images');
      run = destinationRejected(run);
      return run;
    },
    'write-failed': () => {
      let run = toWriting();
      run = recordWrite(run, 'a.png');
      return writeFailed(run, 'b.png', 'x');
    },
    aborted: () => {
      let run = toWriting();
      run = recordWrite(run, 'a.png');
      return abort(run);
    },
  };

  it.each(cases)('classifies $failure.kind correctly', ({ failure, want }) => {
    const run = paths[failure.kind as ClassifiableFailure]();
    expect(run.failure?.kind).toBe(failure.kind);
    expect(outcomeMessage(outcome(run))).toMatch(want);
  });
});

describe('partial writes keep what succeeded', () => {
  it('a failure after some writes reports the survivors', () => {
    let run = toWriting();
    run = recordWrite(run, 'a.png');
    run = writeFailed(run, 'b.png', 'locked');
    const result = outcome(run);
    expect(result.written).toEqual(['a.png']);
    expect(result.notAttempted).toEqual(['c.png']);
    expect(outcomeMessage(result)).toContain('kept');
  });

  it('an abort after some writes also keeps them', () => {
    let run = toWriting();
    run = recordWrite(run, 'a.png');
    run = abort(run);
    expect(outcome(run).written).toEqual(['a.png']);
    expect(outcome(run).notAttempted).toEqual(['b.png', 'c.png']);
  });

  it('an STA-26 rejection leaves nothing written', () => {
    let run = startExport(ITEMS);
    run = destinationChosen(run, 'C:\\Images');
    const rejected = destinationRejected(run);
    expect(rejected.destination).toBe('C:\\Images');
    // The destination was chosen but rejected; writing never started.
    expect(rejected.state).toBe('picking');
  });
});