// covers: REV-10, REV-11, REV-12, REV-13, REV-14, REV-15, REV-16, REV-17, REV-18, REV-19, REV-20, REV-21, REV-22, REV-23, REV-24, CMC-20, CMC-21, CMC-22
/**
 * Editor placement geometry.
 *
 * The editor is larger than the OCR box it corrects, so wherever it lands it
 * tends to sit on something clickable. Phase 3C measured the consequence in a
 * real browser: twelve of twenty-five sampled points across an adjacent balloon
 * landed inside the editor, so clicking a neighbour typed into the region being
 * edited and the unsaved-changes guard never appeared.
 *
 * These tests exercise the placement function directly against synthetic page
 * layouts, which is the only way to cover the awkward cases deliberately: fully
 * overlapping regions, regions far smaller than the editor, regions hard against
 * every edge, and pages dense enough that no placement is clear.
 */
import { describe, expect, it } from 'vitest';
import {
  chooseEditorPlacement,
  intersectionArea,
  totalOverlap,
  regionRect,
  type PageRect,
} from '../features/dialogue/editorPlacement';

const PAGE = { w: 1000, h: 1500 };

/** The editor as the canvas asks for it: 220x96 screen px at a scale of 1. */
const EDITOR: PageRect = { x: 0, y: 0, w: 220, h: 96 };

function place(region: PageRect, others: PageRect[], gap = 6) {
  return chooseEditorPlacement({ region, editor: EDITOR, others, page: PAGE, gap });
}

describe('intersectionArea', () => {
  it('is zero when the rectangles do not overlap', () => {
    expect(intersectionArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 }))
      .toBe(0);
  });

  it('is zero when they only touch along an edge', () => {
    // Touching is not overlapping: an editor flush against a neighbour's edge
    // still lets every pixel of that neighbour be clicked.
    expect(intersectionArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }))
      .toBe(0);
  });

  it('is the overlap when they do overlap', () => {
    // x overlaps 5..10 and y overlaps 5..10, so 25 square units.
    expect(intersectionArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }))
      .toBe(25);
  });

  it('sums overlap across every region', () => {
    const editor = { x: 0, y: 0, w: 10, h: 10 };
    expect(totalOverlap(editor, [
      { x: 0, y: 0, w: 5, h: 10 },
      { x: 5, y: 0, w: 5, h: 10 },
      { x: 100, y: 100, w: 5, h: 5 },
    ])).toBe(100);
  });
});

describe('chooseEditorPlacement, ordinary pages', () => {
  it('puts the editor below the region when nothing is in the way', () => {
    const r = place({ x: 100, y: 100, w: 300, h: 80 }, []);
    expect(r.placement).toBe('below');
    expect(r.overlap).toBe(0);
    expect(r.fallback).toBe(false);
    // Directly under the region, separated by the gap.
    expect(r.rect.x).toBe(100);
    expect(r.rect.y).toBe(100 + 80 + 6);
  });

  it('steps out of the way when the region below is occupied', () => {
    const below = { x: 100, y: 186, w: 300, h: 120 };
    const r = place({ x: 100, y: 100, w: 300, h: 80 }, [below]);
    expect(r.placement).not.toBe('below');
    expect(r.overlap).toBe(0);
  });

  it('prefers a clear direction over the one that covers text', () => {
    // The neighbour sits squarely under the default position, so "below" would
    // bury it. Above and to the right are both free; the nearer of those in
    // reading order wins, and either way nothing is covered.
    const under = { x: 90, y: 186, w: 300, h: 120 };
    const r = place({ x: 100, y: 100, w: 300, h: 80 }, [under]);
    expect(r.overlap).toBe(0);
    expect(r.fallback).toBe(false);
    expect(r.placement).toBe('above');
    // "Below" really would have covered it - otherwise this proves nothing.
    expect(r.scores.below).toBeGreaterThan(0);
    expect(r.scores.above).toBe(0);
  });

  it('reports every candidate cost so a bad layout can be diagnosed', () => {
    const r = place({ x: 100, y: 100, w: 300, h: 80 }, [
      { x: 100, y: 186, w: 300, h: 120 },
      { x: 406, y: 100, w: 200, h: 90 },
    ]);
    expect(Object.keys(r.scores).sort()).toEqual(['above', 'below', 'left', 'right']);
    for (const v of Object.values(r.scores)) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe('chooseEditorPlacement, overlapping regions', () => {
  it('avoids a region that overlaps the default position', () => {
    // Two balloons whose boxes genuinely intersect - the fixture case.
    const a = { x: 120, y: 560, w: 440, h: 160 };
    const b = { x: 430, y: 640, w: 390, h: 160 };
    const r = place(a, [b]);
    expect(r.overlap).toBe(0);
    expect(r.fallback).toBe(false);
  });

  it('never covers a neighbour when some direction is clear', () => {
    // Systematic sweep: move the neighbour around the edited region and require
    // that the editor never lands on it whenever any direction avoids it.
    const region = { x: 300, y: 400, w: 250, h: 90 };
    const offsets = [-320, -260, -120, 0, 120, 260, 320];
    const rows = [-260, -140, -60, 0, 60, 140, 260];
    let sampled = 0;
    let blockedByDefault = 0;
    for (const dx of offsets) {
      for (const dy of rows) {
        const other = { x: region.x + dx, y: region.y + dy, w: 200, h: 90 };
        const r = place(region, [other]);
        sampled += 1;
        // Many of these genuinely obstruct the preferred position, so the sweep
        // is not vacuous.
        if (r.scores.below > 0) blockedByDefault += 1;
        expect(r.overlap, `overlap at dx=${dx} dy=${dy}`).toBe(0);
        expect(r.fallback).toBe(false);
      }
    }
    expect(sampled).toBe(offsets.length * rows.length);
    expect(blockedByDefault).toBeGreaterThan(0);
  });

  it('picks the least bad option when the page is too dense to be clear', () => {
    // One region blocking each of the four candidate directions.
    const region = { x: 400, y: 700, w: 200, h: 60 };
    const others = [
      { x: 380, y: 500, w: 240, h: 180 },  // blocks "above"
      { x: 380, y: 770, w: 240, h: 120 },  // blocks "below"
      { x: 140, y: 690, w: 250, h: 100 },  // blocks "left"
      { x: 620, y: 690, w: 250, h: 100 },  // blocks "right"
    ];
    const r = place(region, others);
    // Every direction really is obstructed...
    for (const score of Object.values(r.scores)) expect(score).toBeGreaterThan(0);
    expect(r.fallback).toBe(true);
    // ...and the chosen one really is the cheapest of them.
    expect(r.overlap).toBeCloseTo(Math.min(...Object.values(r.scores)), 6);
  });
});

describe('chooseEditorPlacement, very small regions', () => {
  it('still finds a clear position beside a tiny region', () => {
    const tiny = { x: 500, y: 700, w: 12, h: 8 };
    const r = place(tiny, []);
    expect(r.placement).toBe('below');
    expect(r.fallback).toBe(false);
    // The editor is anchored to the tiny box, not resized to it.
    expect(r.rect.w).toBe(EDITOR.w);
    expect(r.rect.h).toBe(EDITOR.h);
    expect(r.rect.x).toBe(500);
  });

  it('reports a collision on a lattice of very small regions', () => {
    // A dense field of tiny boxes - the shape of a lettering-heavy page. The
    // editor cannot fit in the gaps, so the fallback must engage rather than
    // pretend the page is clear.
    const lattice: PageRect[] = [];
    for (let y = 280; y < 520; y += 14) {
      for (let x = 160; x < 660; x += 36) lattice.push({ x, y, w: 30, h: 10 });
    }
    const region = { x: 400, y: 400, w: 30, h: 10 };
    const r = place(region, lattice);
    expect(r.fallback).toBe(true);
    expect(r.overlap).toBeGreaterThan(0);
    expect(['below', 'above', 'right', 'left']).toContain(r.placement);
  });
});

describe('chooseEditorPlacement, page bounds', () => {
  it('keeps the editor inside the page for a region in the top-left corner', () => {
    const r = place({ x: 0, y: 0, w: 200, h: 60 }, []);
    expect(r.rect.x).toBeGreaterThanOrEqual(0);
    expect(r.rect.y).toBeGreaterThanOrEqual(0);
    expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(PAGE.w);
    expect(r.rect.y + r.rect.h).toBeLessThanOrEqual(PAGE.h);
  });

  it('keeps the editor inside the page for a region in the bottom-right corner', () => {
    const r = place({ x: 900, y: 1450, w: 100, h: 50 }, []);
    expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(PAGE.w);
    expect(r.rect.y + r.rect.h).toBeLessThanOrEqual(PAGE.h);
  });

  it('never produces a rectangle larger than the page itself', () => {
    // A page smaller than the editor: the result must be clamped, not overflow.
    const small = chooseEditorPlacement({
      region: { x: 0, y: 0, w: 50, h: 20 },
      editor: EDITOR,
      others: [],
      page: { w: 120, h: 90 },
      gap: 6,
    });
    expect(small.rect.w).toBeLessThanOrEqual(120);
    expect(small.rect.h).toBeLessThanOrEqual(90);
    expect(small.rect.x).toBeGreaterThanOrEqual(0);
    expect(small.rect.y).toBeGreaterThanOrEqual(0);
  });

  it('swaps the gap for a zero when the gap would push it off the page', () => {
    const r = place({ x: 990, y: 100, w: 10, h: 10 }, [], 50);
    expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(PAGE.w);
  });
});

describe('regionRect', () => {
  it('returns null when any coordinate is missing', () => {
    expect(regionRect({ x: 1, y: 1, width: null, height: 5 })).toBeNull();
    expect(regionRect({ x: null, y: 1, width: 5, height: 5 })).toBeNull();
    expect(regionRect({ x: 1, y: 1, width: 5, height: null })).toBeNull();
    expect(regionRect({ x: 1, y: null, width: 5, height: 5 })).toBeNull();
  });

  it('returns null for a degenerate box', () => {
    // A zero-width region has no area to point at; guessing a size would put an
    // overlay somewhere the reviewer never agreed to.
    expect(regionRect({ x: 1, y: 1, width: 0, height: 5 })).toBeNull();
    expect(regionRect({ x: 1, y: 1, width: 5, height: 0 })).toBeNull();
    expect(regionRect({ x: 1, y: 1, width: -5, height: 5 })).toBeNull();
  });

  it('returns the box when it is usable', () => {
    expect(regionRect({ x: 3, y: 4, width: 5, height: 6 }))
      .toEqual({ x: 3, y: 4, w: 5, h: 6 });
  });
});