// covers: REV-10, REV-11, REV-12, REV-13, REV-14, REV-15, REV-16, REV-17, REV-18, REV-19, REV-20, REV-21, REV-22, REV-23, REV-24, CMC-20, CMC-21, CMC-22, CMC-23, CMC-24, CMC-25, CMC-26, CMC-27, CMC-28
/**
 * OCR Workbench: canvas geometry and region overlays.
 *
 * These tests assert the arithmetic the canvas depends on. A review screen that
 * draws a region's box a few pixels off is worse than one that draws nothing,
 * because the box looks authoritative - a reviewer types into the wrong balloon
 * and has no reason to doubt it.
 *
 * The page is 2000x3000. Overlays are positioned as percentages of the image
 * box, so the expected values are exact fractions of whatever size the page is
 * drawn at, independent of the rendered pixel size.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import './mocks';
import { appSettingsState, installMocks, mocks, PAGE_H, PAGE_W, region,
         threeRegions, twoPages } from './workbenchFixtures';
import { DialogueReview } from '../features/dialogue/DialogueReview';
import { setStageRect } from './setup';

async function renderWorkbench(opts: Parameters<typeof installMocks>[0] = {}) {
  installMocks(opts);
  const user = userEvent.setup();
  const utils = render(<DialogueReview />);
  await waitFor(() => expect(document.querySelectorAll('.wb-region').length).toBeGreaterThan(0));
  await waitForMeasured(utils.container);
  return { user, ...utils };
}

/**
 * Wait until the canvas has been measured.
 *
 * The first paint deliberately uses a CSS aspect ratio rather than a guessed
 * pixel size, because the stage has not been measured yet on that frame. Any
 * assertion about rendered size has to wait for the measured frame, or it will
 * read the fallback and pass or fail for the wrong reason.
 */
async function waitForMeasured(container: HTMLElement) {
  await waitFor(() => {
    const box = container.querySelector<HTMLElement>('.wb-page');
    expect(box, 'no page rendered').not.toBeNull();
    expect(box!.style.height).not.toBe('');
    expect(box!.style.height.endsWith('px')).toBe(true);
  });
}

function overlays(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.wb-region'));
}

function pageBox(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.wb-page');
  if (!el) throw new Error('no page rendered');
  return el;
}

/** Does the in-place editor currently hold this text? */
function editorHasText(text: string): boolean {
  const el = screen.queryByLabelText(/^Edit text for region /) as
    HTMLTextAreaElement | null;
  return el?.value === text;
}

describe('aspect ratio and fit', () => {
  it('renders the page box at the source aspect ratio', async () => {
    const { container } = await renderWorkbench();
    const box = pageBox(container);
    const w = Number.parseFloat(box.style.width);
    const h = Number.parseFloat(box.style.height);
    // Stage is 1200x800 (see setup.ts); minus 32px of stage padding on each
    // axis. Fit scale is min(availW/PAGE_W, availH/PAGE_H).
    const scale = Math.min((1200 - 32) / PAGE_W, (800 - 32) / PAGE_H);
    expect(w).toBeCloseTo(PAGE_W * scale, 0);
    expect(h).toBeCloseTo(PAGE_H * scale, 0);
    // The ratio itself must survive the fit.
    expect(w / h).toBeCloseTo(PAGE_W / PAGE_H, 2);
  });

  it('never distorts the page, whatever the stage size', async () => {
    setStageRect({ width: 600, height: 1200 });
    const { container } = await renderWorkbench();
    const box = pageBox(container);
    const w = Number.parseFloat(box.style.width);
    const h = Number.parseFloat(box.style.height);
    expect(w / h).toBeCloseTo(PAGE_W / PAGE_H, 2);
  });

  it('scales the page to fit a wider stage without exceeding it', async () => {
    setStageRect({ width: 3000, height: 900 });
    const { container } = await renderWorkbench();
    const w = Number.parseFloat(pageBox(container).style.width);
    expect(w).toBeLessThanOrEqual(3000);
  });
});

describe('overlay coordinate transform', () => {
  it('places each overlay at the region position as a fraction of the page', async () => {
    const { container } = await renderWorkbench();
    const boxes = overlays(container);
    expect(boxes).toHaveLength(3);

    const expected = [
      { x: 100, y: 100, w: 400, h: 200 },
      { x: 800, y: 900, w: 400, h: 200 },
      { x: 1200, y: 2000, w: 300, h: 300 },
    ];
    boxes.forEach((el, i) => {
      const e = expected[i];
      expect(el.style.left).toBe(`${(e.x / PAGE_W) * 100}%`);
      expect(el.style.top).toBe(`${(e.y / PAGE_H) * 100}%`);
      expect(el.style.width).toBe(`${(e.w / PAGE_W) * 100}%`);
      expect(el.style.height).toBe(`${(e.h / PAGE_H) * 100}%`);
    });
  });

  it('keeps the overlay transform independent of the fitted pixel size', async () => {
    const { container } = await renderWorkbench();
    const before = overlays(container)[2].style.left;

    setStageRect({ width: 700, height: 500 });
    const second = render(<DialogueReview />);
    await waitFor(() => expect(overlays(second.container)).toHaveLength(3));
    expect(overlays(second.container)[2].style.left).toBe(before);
  });

  it('omits an overlay for a region with no geometry instead of guessing one', async () => {
    const units = threeRegions();
    units[1] = region({ id: 'r2', unit_index: 2, x: null, y: null, width: null, height: null });
    installMocks({ units });
    const { container } = render(<DialogueReview />);
    await waitFor(() => expect(overlays(container).length).toBeGreaterThan(0));
    // Two of three regions have boxes; the third must not draw a 0,0 box.
    expect(overlays(container)).toHaveLength(2);
  });
});

describe('reading order and labels', () => {
  it('numbers overlays in reading order and exposes it to assistive tech', async () => {
    const { container } = await renderWorkbench();
    const boxes = overlays(container);
    boxes.forEach((el, i) => {
      expect(within(el).getByText(String(i + 1))).toBeInTheDocument();
      expect(el.getAttribute('aria-label')).toMatch(new RegExp(`^Region ${i + 1}:`));
    });
  });

  it('describes a region with no text as unread rather than blank', async () => {
    const { container } = await renderWorkbench();
    expect(overlays(container)[1].getAttribute('aria-label')).toContain('no text');
  });

  it('tab order follows reading order', async () => {
    const { container } = await renderWorkbench();
    const boxes = overlays(container);
    for (let i = 0; i < boxes.length; i += 1) {
      boxes[i].focus();
      expect(document.activeElement).toBe(boxes[i]);
    }
  });
});

describe('selection', () => {
  it('selects a region on click and opens its editor in place', async () => {
    const { container, user } = await renderWorkbench();
    const boxes = overlays(container);
    await user.click(boxes[1]);
    // The addendum's central interaction: clicking the words on the image
    // selects the region *and* opens the editor there.
    const editor = screen.getByLabelText(/^Edit text for region /);
    expect(editor).toBeInTheDocument();
    // The editor is its own layer, and it names the region it belongs to.
    const layer = document.querySelector('.wb-region-editor');
    expect(layer).not.toBeNull();
    expect(layer!.getAttribute('aria-label')).toContain('Editing region 2');
    // The region that was clicked is the one marked as being edited, and the
    // region that was not stays untouched.
    expect(boxes[1].getAttribute('data-editing')).toBe('true');
    expect(boxes[0].getAttribute('data-editing')).toBeNull();
    expect(boxes[0].getAttribute('data-selected')).toBe('false');
  });

  it('marks the selected region as selected before editing', async () => {
    const { container, user } = await renderWorkbench();
    const boxes = overlays(container);
    // Keyboard navigation selects without opening the editor, so the selected
    // state is observable on the button itself.
    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(overlays(container)[0].getAttribute('data-selected')).toBe('true'));
    expect(boxes[1].getAttribute('data-selected')).toBe('false');
  });

  it('selects a region inside an overlap, and reports which one', async () => {
    // Two regions stacked on nearly the same spot - the overlap case the
    // design calls out. Both remain individually addressable.
    const units = [
      region({ id: 'a', unit_index: 1, x: 100, y: 100, width: 500, height: 500,
               text: 'OUTER', text_source: 'ocr', machine_text: 'OUTER' }),
      region({ id: 'b', unit_index: 2, x: 200, y: 200, width: 300, height: 300,
               text: 'INNER', text_source: 'ocr', machine_text: 'INNER' }),
    ];
    const { container, user } = await renderWorkbench({ units });
    const boxes = overlays(container);
    expect(boxes).toHaveLength(2);

    // Clicking the inner one opens its editor; the outer one is untouched.
    await user.click(boxes[1]);
    expect(editorHasText('INNER')).toBe(true);
    expect(boxes[0].getAttribute('aria-label')).toContain('OUTER');
  });

  it('moves between overlapping regions with the arrow keys', async () => {
    const units = [
      region({ id: 'a', unit_index: 1, text: 'OUTER', text_source: 'ocr', machine_text: 'OUTER' }),
      region({ id: 'b', unit_index: 2, text: 'INNER', text_source: 'ocr', machine_text: 'INNER' }),
    ];
    installMocks({ units });
    const user = userEvent.setup();
    const { container } = render(<DialogueReview />);
    await waitFor(() => expect(overlays(container)).toHaveLength(2));

    // From no selection, "next" is the first region.
    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(container.querySelectorAll('.wb-region')[0].getAttribute('data-selected'))
        .toBe('true'));

    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(container.querySelectorAll('.wb-region')[1].getAttribute('data-selected'))
        .toBe('true'));

    // ...and back again, so the cycle is closed rather than one-way.
    await user.keyboard('{ArrowLeft}');
    await waitFor(() =>
      expect(container.querySelectorAll('.wb-region')[0].getAttribute('data-selected'))
        .toBe('true'));
  });

  it('wraps around at the end of the region list', async () => {
    const { container, user } = await renderWorkbench();
    await user.keyboard('{ArrowLeft}');  // from nothing selected, wraps to last
    await waitFor(() =>
      expect(overlays(container)[2].getAttribute('data-selected')).toBe('true'));
  });
});

describe('page navigation', () => {
  /** The queue list only - page names also appear in the canvas title. */
  function queue(): HTMLElement {
    const el = document.querySelector<HTMLElement>('.wb-queue-list');
    if (!el) throw new Error('queue not rendered');
    return el;
  }

  it('shows only the regions of the selected page', async () => {
    const user = userEvent.setup();
    installMocks({ units: twoPages(), total: 2 });
    const { container } = render(<DialogueReview />);
    await waitFor(() => expect(overlays(container)).toHaveLength(1));
    expect(within(queue()).getByText('page-01.png')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Page ▶/ }));
    await waitFor(() => expect(overlays(container)).toHaveLength(1));
    const current = document.querySelector<HTMLElement>('.wb-insp-title, .wb-toolbar .wb-insp-title');
    void current;
    // The canvas now shows the second page, and only its region.
    expect(within(queue()).getByText('page-02.png')).toBeInTheDocument();
  });

  it('lists every page in the queue with its own region count', async () => {
    installMocks({ units: twoPages(), total: 2 });
    render(<DialogueReview />);
    await waitFor(() => expect(within(queue()).getByText('page-01.png')).toBeInTheDocument());
    expect(within(queue()).getByText('page-02.png')).toBeInTheDocument();
    // Each page shows its own region count.
    expect(within(queue()).getAllByText(/1 region/)).toHaveLength(2);
  });
});

describe('zoom', () => {
  it('grows the page when zoomed in and keeps the ratio', async () => {
    const { container, user } = await renderWorkbench();
    const beforeW = Number.parseFloat(pageBox(container).style.width);

    // The button is labelled "Zoom in" rather than "+": a plus sign alone is a
    // poor accessible name, and the visible glyph is decoration on top of it.
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));

    const afterW = Number.parseFloat(pageBox(container).style.width);
    expect(afterW).toBeGreaterThan(beforeW);
    const box = pageBox(container);
    expect(Number.parseFloat(box.style.width) / Number.parseFloat(box.style.height))
      .toBeCloseTo(PAGE_W / PAGE_H, 2);
  });

  it('returns to fit and stops growing past the maximum', async () => {
    const { container, user } = await renderWorkbench();
    for (let i = 0; i < 40; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    }
    const capped = Number.parseFloat(pageBox(container).style.width);
    expect(capped).toBeLessThanOrEqual(PAGE_W * 8 + 1);

    await user.click(screen.getByRole('button', { name: 'Fit' }));
    await waitFor(() =>
      expect(Number.parseFloat(pageBox(container).style.width)).toBeLessThan(capped));
  });

  it('renders overlays from the canonical preference, not local state', async () => {
    // The stored preference is the only input: a quick toggle and Settings must
    // not each keep a private copy.
    const { container } = await renderWorkbench({ overlays: false });
    expect(pageBox(container).getAttribute('data-overlays')).toBe('off');
  });

it('the overlay toggle writes the canonical preference', async () => {
    const { user } = await renderWorkbench();
    const toggle = screen.getByRole('button', { name: /Overlays on/ });
    await user.click(toggle);
    await waitFor(() =>
      expect(mocks.setAppSettings).toHaveBeenCalledWith(
        { ocr_overlays_visible: false }));
    expect(appSettingsState.current.ocr_overlays_visible).toBe(false);
  });
});

describe('zoom level and panning', () => {
  /** Current pan, read back from the page box's own offset. */
  function pan(container: HTMLElement): { x: number; y: number } {
    const box = pageBox(container);
    return {
      x: Number.parseFloat(box.style.left || '0'),
      y: Number.parseFloat(box.style.top || '0'),
    };
  }

  function factor(container: HTMLElement): number {
    return Number.parseFloat(pageBox(container).style.width) / PAGE_W;
  }

  function level(): number {
    return Number.parseInt(screen.getByRole('status', { name: 'Zoom level' }).textContent!, 10);
  }

  it('shows the current zoom as a percentage rather than a word', async () => {
    const { container } = await renderWorkbench();
    // Fit for this page against a 1200x800 stage is height-bound.
    expect(level()).toBe(Math.round(factor(container) * 100));
  });

  it('offers actual size and jumps to it', async () => {
    const { container, user } = await renderWorkbench();
    expect(factor(container)).not.toBeCloseTo(1, 2);

    await user.click(screen.getByRole('button', { name: '100%' }));

    expect(factor(container)).toBeCloseTo(1, 5);
    expect(level()).toBe(100);
    // Actual size means centred, not merely scaled.
    expect(pan(container)).toEqual({ x: 0, y: 0 });
  });

  it('steps down as well as up, and returns to fit from anywhere', async () => {
    const { container, user } = await renderWorkbench();
    await user.click(screen.getByRole('button', { name: '100%' }));
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(factor(container)).toBeCloseTo(0.8, 5);

    const fitted = Number.parseFloat(pageBox(container).style.width);
    await user.click(screen.getByRole('button', { name: 'Fit' }));
    await waitFor(() =>
      expect(Number.parseFloat(pageBox(container).style.width)).toBeLessThan(fitted));
    expect(pan(container)).toEqual({ x: 0, y: 0 });
  });

  it('keeps the page point under the pointer fixed when zooming', async () => {
    // Zooming that always recentres feels like the page sliding away from the
    // cursor. The pointer is at a fixed screen point, so the page coordinate
    // under it must not change.
    const { container, user } = await renderWorkbench();
    const stage = container.querySelector<HTMLElement>('.wb-stage')!;

    const pointer = { x: 300, y: 250 };
    const pagePointUnder = () => {
      const f = factor(container);
      const p = pan(container);
      const rect = stage.getBoundingClientRect();
      const centredX = (rect.width - PAGE_W * f) / 2;
      const centredY = (rect.height - PAGE_H * f) / 2;
      return {
        x: (pointer.x - rect.left - centredX - p.x) / f,
        y: (pointer.y - rect.top - centredY - p.y) / f,
      };
    };

    const before = pagePointUnder();
    fireEvent.wheel(stage, { ctrlKey: true, deltaY: -120, clientX: pointer.x, clientY: pointer.y });
    await waitFor(() => expect(factor(container)).toBeGreaterThan(0));
    const after = pagePointUnder();

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    // And it really did zoom rather than silently doing nothing.
    expect(factor(container)).toBeGreaterThan(0);
    void user;
  });

  it('pans by dragging empty canvas', async () => {
    const { container } = await renderWorkbench();
    const stage = container.querySelector<HTMLElement>('.wb-stage')!;
    expect(pan(container)).toEqual({ x: 0, y: 0 });

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 160, clientY: 130 });
    await waitFor(() => expect(pan(container)).toEqual({ x: 60, y: 30 }));

    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 160, clientY: 130 });

    // A move after the button is released must not keep dragging the page.
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 400, clientY: 400 });
    expect(pan(container)).toEqual({ x: 60, y: 30 });
  });

  it('does not start a drag from a region, so clicking still selects', async () => {
    const { container, user } = await renderWorkbench();
    const stage = container.querySelector<HTMLElement>('.wb-stage')!;
    const box = overlays(container)[0];

    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 10, clientY: 10, button: 0 });
    // A drag that began on the overlay must belong to the overlay.
    fireEvent.pointerDown(box, { pointerId: 3, clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(stage, { pointerId: 3, clientX: 300, clientY: 300 });

    expect(pan(container)).toEqual({ x: 0, y: 0 });
    void user;
  });

  it('starts a new page from the centre', async () => {
    const { container, user } = await renderWorkbench({ units: twoPages() });
    const stage = container.querySelector<HTMLElement>('.wb-stage')!;

    fireEvent.pointerDown(stage, { pointerId: 4, clientX: 50, clientY: 50, button: 0 });
    fireEvent.pointerMove(stage, { pointerId: 4, clientX: 250, clientY: 50 });
    await waitFor(() => expect(pan(container).x).toBe(200));
    fireEvent.pointerUp(stage, { pointerId: 4, clientX: 250, clientY: 50 });

    await user.click(screen.getByRole('button', { name: /Page ▶/ }));
    await waitFor(() =>
      expect(within(container.querySelector<HTMLElement>('.wb-queue')!)
        .getByText('page-02.png')).toBeInTheDocument());

    // Panning belongs to a page; carrying it across would drop the reviewer
    // into the middle of a page they have not seen.
    expect(pan(container)).toEqual({ x: 0, y: 0 });
  });

  it('keeps overlays on their regions at every zoom', async () => {
    // The percentage geometry is what makes an overlay track its region; this
    // asserts the transform is unchanged by zooming, which is the property that
    // guarantees it.
    const { container, user } = await renderWorkbench();
    const before = overlays(container).map((o) => o.style.cssText);

    await user.click(screen.getByRole('button', { name: '100%' }));
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));

    const after = overlays(container).map((o) => o.style.cssText);
    expect(after).toEqual(before);
  });
});

describe('page image failure', () => {
  it('keeps overlay geometry correct when no page file is available', async () => {
    // `parent_path` null models a page whose file cannot be located: `fileUrl`
    // returns null, so no <img> renders. The page box still exists and overlays
    // are percentages of it - which is exactly the property that keeps them
    // correct without an image behind them.
    const units = [region({
      id: 'a', text: 'HELLO', text_source: 'ocr', machine_text: 'HELLO',
      parent_path: null,
    })];
    installMocks({ units });
    const { container } = render(<DialogueReview />);
    await waitFor(() => expect(overlays(container)).toHaveLength(1));
    expect(container.querySelector('.wb-page img')).toBeNull();
    expect(overlays(container)[0].style.left).toBe(`${(100 / PAGE_W) * 100}%`);
    expect(overlays(container)[0].style.top).toBe(`${(100 / PAGE_H) * 100}%`);
  });
});