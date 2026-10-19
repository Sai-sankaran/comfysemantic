/**
 * Where to put the in-place editor for a selected OCR region.
 *
 * The editor is deliberately larger than the OCR box it corrects - an OCR box is
 * sized to the lettering and is routinely too small to type into - so wherever
 * it lands it tends to sit on top of something else. On a real comic page that
 * is usually the *next* balloon, and because the editor receives pointer events
 * over its whole box, clicking the neighbour put the caret in the wrong region
 * instead. The unsaved-changes guard never appeared either, because the click
 * that would have raised it never reached the neighbour at all.
 *
 * So the position is chosen rather than assumed. Four candidates are scored
 * against the other regions' boxes, and the least intrusive one wins. This
 * module is pure geometry with no DOM dependency so it can be tested directly
 * against synthetic region layouts, including the pathological ones.
 *
 * All rectangles are in **page pixels** - the same coordinate space the backend
 * stores and the canvas draws in. Screen pixels enter only through `gap`, which
 * is divided by the current scale so a 4px visual gap stays 4px at any zoom.
 */

/** Axis-aligned rectangle in page pixels. */
export interface PageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Candidate positions, in the order they are preferred when nothing collides.
 *
 * `below` is first because reading order in a comic runs downwards, so the text
 * a reviewer is reading is the one nearest the editor.
 */
export type EditorPlacement = 'below' | 'above' | 'right' | 'left';

const PREFERENCE: EditorPlacement[] = ['below', 'above', 'right', 'left'];

/** Size of a rectangle, without a position. */
export interface Size {
  w: number;
  h: number;
}

export interface PlacementInput {
  /** The region being edited. */
  region: PageRect;
  /**
   * Desired editor size, already converted to page units.
   *
   * Only a size, not a rectangle: the editor's position is the thing being
   * decided here, so passing one in would be circular.
   */
  editor: Size;
  /** Every other region on the page, in page units. */
  others: PageRect[];
  /** Page size in page pixels. */
  page: Size;
  /** Visual gap between region and editor, in page units. */
  gap?: number;
}

export interface PlacementResult {
  placement: EditorPlacement;
  /** Final rectangle, already clamped into the page. */
  rect: PageRect;
  /**
   * True when the chosen position still covers some part of another region.
   *
   * The caller must treat this as significant rather than cosmetic: it is the
   * signal that the editor is sitting on a clickable target, so the UI has to
   * make the edited region unmistakable and must not let a click be ambiguous.
   */
  fallback: boolean;
  /** Total overlap area with other regions, in squared page pixels. */
  overlap: number;
  /** Per-candidate overlap, for diagnostics and tests. */
  scores: Record<EditorPlacement, number>;
}

/** Area of the intersection of two rectangles; 0 when they do not overlap. */
export function intersectionArea(a: PageRect, b: PageRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Total area this rectangle covers across a list of regions. */
export function totalOverlap(rect: PageRect, regions: PageRect[]): number {
  let sum = 0;
  for (const r of regions) sum += intersectionArea(rect, r);
  return sum;
}

function candidate(
  placement: EditorPlacement,
  region: PageRect,
  editor: Size,
  gap: number,
): PageRect {
  switch (placement) {
    case 'below':
      return { x: region.x, y: region.y + region.h + gap, w: editor.w, h: editor.h };
    case 'above':
      return { x: region.x, y: region.y - editor.h - gap, w: editor.w, h: editor.h };
    case 'right':
      return { x: region.x + region.w + gap, y: region.y, w: editor.w, h: editor.h };
    case 'left':
      return { x: region.x - editor.w - gap, y: region.y, w: editor.w, h: editor.h };
  }
}

/**
 * Pull a rectangle back inside the page without changing its size.
 *
 * The editor is an annotation on the image, so leaving the page box would draw
 * it over the surrounding chrome where it reads as belonging to nothing. Where
 * clamping would push the rectangle onto other regions that is a real cost, and
 * it is reflected in the overlap score like any other collision.
 */
function clampToPage(rect: PageRect, page: Size): PageRect {
  const w = Math.min(rect.w, page.w);
  const h = Math.min(rect.h, page.h);
  return {
    w,
    h,
    x: Math.min(Math.max(0, rect.x), Math.max(0, page.w - w)),
    y: Math.min(Math.max(0, rect.y), Math.max(0, page.h - h)),
  };
}

/**
 * Choose where the editor goes.
 *
 * Picks the candidate covering the least of the other regions, breaking ties by
 * reading-order preference. `fallback` is true when even the best candidate
 * covers something - which is expected on a dense page and is reported rather
 * than hidden, because the caller has to compensate for it.
 */
export function chooseEditorPlacement(input: PlacementInput): PlacementResult {
  const { region, editor, others, page } = input;
  const gap = input.gap ?? 0;

  const scores = {} as Record<EditorPlacement, number>;
  let best: EditorPlacement = 'below';
  let bestScore = Number.POSITIVE_INFINITY;

  for (const placement of PREFERENCE) {
    const rect = clampToPage(candidate(placement, region, editor, gap), page);
    const score = totalOverlap(rect, others);
    scores[placement] = score;
    // Strictly-less keeps the first candidate on a tie, so `PREFERENCE` order is
    // the tie-break and nothing else is needed.
    if (score < bestScore) {
      bestScore = score;
      best = placement;
    }
  }

  const rect = clampToPage(candidate(best, region, editor, gap), page);
  return {
    placement: best,
    rect,
    overlap: bestScore,
    fallback: bestScore > 0,
    scores,
  };
}

/**
 * Region rectangle in page pixels, or null when the row has no usable box.
 */
export function regionRect(u: {
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
}): PageRect | null {
  const { x, y, width, height } = u;
  if (x == null || y == null || width == null || height == null) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, w: width, h: height };
}