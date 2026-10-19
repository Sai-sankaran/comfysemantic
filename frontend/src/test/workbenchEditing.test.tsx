// covers: REV-01, REV-02, REV-03, REV-04, REV-10, REV-11, REV-12, REV-13, REV-14, REV-15, REV-16, REV-17, REV-18, REV-19, REV-20, REV-21, REV-22, REV-23, REV-24, OCR-01, OCR-02, OCR-03, OCR-04, OCR-05, OCR-06, OCR-07, OCR-08, CMC-20, CMC-21, CMC-22, CMC-23, CMC-24, CMC-25, CMC-26, CMC-27, CMC-28
/**
 * OCR Workbench: region editing, provenance, ink states and review queue.
 *
 * These are the behaviours a reviewer relies on when they are deciding whether
 * to trust what the screen tells them:
 *
 *  - the machine transcript stays visible beside their correction, and saying
 *    so is not the same as showing it;
 *  - a correction is never reported as saved unless the backend confirmed it;
 *  - an unsaved correction is never silently discarded;
 *  - a colour that was never measured is never drawn as a colour.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import './mocks';
import { appSettingsState, installMocks, mocks, region } from './workbenchFixtures';
import { DialogueReview } from '../features/dialogue/DialogueReview';
import { fireResizeObservers, setStageRect } from './setup';

async function workbench(opts: Parameters<typeof installMocks>[0] = {}) {
  installMocks(opts);
  const user = userEvent.setup();
  const utils = render(<DialogueReview />);
  await waitFor(() =>
    expect(document.querySelectorAll('.wb-region').length).toBeGreaterThan(0));
  return { user, ...utils };
}

/**
 * The canvas in-place editor.
 *
 * There is exactly one editing surface: clicking an overlay opens it on the
 * canvas, and the inspector shows the same text read-only. Two fields bound to
 * one draft would be two sources of truth for the same pending correction.
 */
function editor(): HTMLTextAreaElement {
  return screen.getByLabelText(/^Edit text for region /) as HTMLTextAreaElement;
}

/** Select the region with the given id via its overlay button. */
async function select(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(document.querySelector<HTMLElement>(`[aria-label^="Region "]`
    + `[class="wb-region"][data-selected]`) ?? findOverlay(id));
}

function findOverlay(id: string): HTMLElement {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('.wb-region'));
  // Overlays are rendered in reading order, which is the order of `units`.
  const idx = ['r1', 'r2', 'r3', 'a', 'b'].indexOf(id);
  const el = buttons[idx];
  if (!el) throw new Error(`no overlay for ${id}`);
  return el;
}

async function selectNth(user: ReturnType<typeof userEvent.setup>, n: number) {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('.wb-region'));
  await user.click(buttons[n]);
  void select;
}

const corrected = () => region({
  id: 'r1', unit_index: 1, x: 100, y: 100, width: 400, height: 200,
  text: 'HELLO THERE', text_source: 'ocr', machine_text: 'HELLO THERE',
  ocr_status: 'ok', confidence: 0.62,
});

const manuallyCorrected = () => region({
  id: 'r1', unit_index: 1, x: 100, y: 100, width: 400, height: 200,
  text: 'Hello there.', text_source: 'manual', machine_text: 'HELLO THERE',
  ocr_status: 'ok', confidence: 1,
});

describe('machine transcription versus manual correction', () => {
  it('shows the machine transcript and labels it as such', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    expect(screen.getByText('Machine transcription')).toBeInTheDocument();
    // The transcript appears in the read-only readout; the editable field holds
    // the effective text, so scope the query to the readout.
    expect(document.querySelector('.wb-machine')?.textContent).toContain('HELLO THERE');
    expect(screen.getByText(/Confidence 62%/)).toBeInTheDocument();
  });

  it('shows both values when a manual correction differs', async () => {
    const { user } = await workbench({ units: [manuallyCorrected()] });
    await selectNth(user, 0);
    expect(screen.getByText('HELLO THERE')).toBeInTheDocument();       // machine
    expect(editor()).toHaveValue('Hello there.');
    expect(screen.getByText('Manual correction')).toBeInTheDocument();
  });

  it('offers to restore the machine text only when it differs', async () => {
    const { user } = await workbench({ units: [manuallyCorrected()] });
    await selectNth(user, 0);
    expect(screen.getByRole('button', { name: 'Restore machine text' })).toBeInTheDocument();
  });

  it('does not offer a restore when there is nothing to restore', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    expect(screen.queryByRole('button', { name: 'Restore machine text' })).toBeNull();
  });

  it('says an unavailable transcript is unavailable, not that nothing was read', async () => {
    // machine_text NULL means the transcript was destroyed before it was kept.
    // Showing "Nothing was read from this region" would be a confident claim
    // about data that does not exist.
    const lost = region({
      id: 'r1', text: 'HAND TYPED', text_source: 'manual', machine_text: null,
    });
    const { user } = await workbench({ units: [lost] });
    await selectNth(user, 0);
    expect(screen.getByText(/Unavailable\./)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing was read/)).toBeNull();
  });

  it('distinguishes a genuinely empty transcript from an unavailable one', async () => {
    const empty = region({
      id: 'r1', text: '', text_source: 'ocr', machine_text: '',
    });
    const { user } = await workbench({ units: [empty] });
    await selectNth(user, 0);
    expect(screen.getByText(/Nothing was read from this region/)).toBeInTheDocument();
  });
});

describe('dirty state', () => {
  it('is clean until the text is actually changed', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    expect(screen.queryByText(/edited, not saved/)).toBeNull();
    // Save is withheld until there is something to save. Cancel stays
    // available because it also closes the editor, which is always a valid
    // thing to want.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('becomes dirty on edit, and only on a real change', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    const box = editor();

    await user.type(box, 'X');
    expect(screen.getByText(/edited, not saved/)).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'HELLO THERE');
    // Back to the stored value: no longer dirty, so Save is disabled again.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
    expect(screen.queryByText(/edited, not saved/)).toBeNull();
  });

  it('cancel discards the edit and closes the editor', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    const box = editor();
    await user.clear(box);
    await user.type(box, 'throwaway');
    expect(screen.getByText(/edited, not saved/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // The editor closed, and re-opening it shows the stored value, not the
    // discarded edit.
    expect(screen.queryByLabelText(/^Edit text for region /)).toBeNull();
    expect(screen.queryByText(/edited, not saved/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit on canvas' }));
    expect(editor()).toHaveValue('HELLO THERE');
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
  });

  it('Escape asks about an unsaved edit instead of throwing it away', async () => {
    // Phase 3C made Escape a plain cancel, on the reasoning that it always left
    // edit mode. That is right for a clean draft and wrong for a dirty one:
    // Escape is the reflexive key a reviewer reaches for when they think they
    // are finished, which is precisely when losing typed text is most likely and
    // most annoying. It now raises the same guard a navigation would.
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    const box = editor();
    await user.clear(box);
    await user.type(box, 'throwaway');

    await user.keyboard('{Escape}');

    // The draft is still on screen, nothing was written, and the reviewer is
    // being asked rather than told.
    expect(screen.getByRole('alertdialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(editor()).toHaveValue('throwaway');
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
  });

  it('Escape closes a clean editor without asking', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    expect(editor()).toBeInTheDocument();

    await user.keyboard('{Escape}');

    // Nothing to lose, so nothing to confirm.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByLabelText(/^Edit text for region /)).toBeNull();
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
  });

  it('Escape again dismisses the guard without choosing', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    await user.clear(editor());
    await user.type(editor(), 'kept');

    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // Backing out of the prompt leaves the draft intact rather than resolving it
    // in either direction.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(editor()).toHaveValue('kept');
  });

  it('offers Save / Discard / Stay instead of silently discarding an edit', async () => {
    // This test previously asserted the opposite - that changing selection
    // quietly throws the edit away. The addendum forbids that outright
    // ("Never silently discard the edit"), so the behaviour and the test were
    // both changed.
    const units = [corrected(), region({ id: 'r2', unit_index: 2, x: 800, y: 900 })];
    const { user } = await workbench({ units });
    await selectNth(user, 0);
    const box = editor();
    await user.clear(box);
    await user.type(box, 'only for region one');

    await selectNth(user, 1);

    // The guard appears, the edit is still here, and nothing was written.
    expect(screen.getByRole('alertdialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(box).toHaveValue('only for region one');
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
  });

  it('Stay keeps the region and the edit', async () => {
    const units = [corrected(), region({ id: 'r2', unit_index: 2, x: 800, y: 900 })];
    const { user } = await workbench({ units });
    await selectNth(user, 0);
    const box = editor();
    await user.clear(box);
    await user.type(box, 'keep me');

    await selectNth(user, 1);
    await user.click(screen.getByRole('button', { name: 'Stay' }));

    expect(screen.queryByRole('alertdialog', { name: 'Unsaved changes' })).toBeNull();
    expect(editor()).toHaveValue('keep me');
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
  });

  it('Discard drops the edit and performs the held navigation', async () => {
    const units = [corrected(), region({ id: 'r2', unit_index: 2, x: 800, y: 900 })];
    const { user } = await workbench({ units });
    await selectNth(user, 0);
    const box = editor();
    await user.clear(box);
    await user.type(box, 'throwaway');

    await selectNth(user, 1);
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    // Navigation happened and the second region is clean. Discarding is not
    // saving: nothing may be written.
    expect(editor()).toHaveValue('');
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
  });

  it('Save commits the edit and then performs the held navigation', async () => {
    const units = [corrected(), region({ id: 'r2', unit_index: 2, x: 800, y: 900 })];
    const { user } = await workbench({ units });
    await selectNth(user, 0);
    const box = editor();
    await user.clear(box);
    await user.type(box, 'saved then moved');

    await selectNth(user, 1);
    // The guard has its own Save; the canvas editor underneath still has one.
    const guard = screen.getByRole('alertdialog', { name: 'Unsaved changes' });
    await user.click(within(guard).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.dialogueSetText).toHaveBeenCalledWith({
        libraryId: 'lib1', unitId: 'r1', text: 'saved then moved',
      }));
  });

  it('a failed Save holds the navigation and keeps the text for retry', async () => {
    const units = [corrected(), region({ id: 'r2', unit_index: 2, x: 800, y: 900 })];
    const { user } = await workbench({ units, failText: true });
    await selectNth(user, 0);
    const box = editor();
    await user.clear(box);
    await user.type(box, 'will not save');

    await selectNth(user, 1);
    const guard = screen.getByRole('alertdialog', { name: 'Unsaved changes' });
    await user.click(within(guard).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/save rejected by the backend/)).toBeInTheDocument();
    // The guard is still up and the text is intact: nothing was lost and
    // nothing pretended to succeed.
    expect(screen.getByRole('alertdialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(editor()).toHaveValue('will not save');
  });
});

describe('save', () => {
  it('sends the edited text and reports success', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    const box = editor();
    await user.clear(box);
    await user.type(box, 'Hello there.');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mocks.dialogueSetText).toHaveBeenCalledWith({
        libraryId: 'lib1', unitId: 'r1', text: 'Hello there.',
      }));
    expect(await screen.findByText(/Correction saved/)).toBeInTheDocument();
  });

  it('does not report success when the backend rejects the save', async () => {
    const { user } = await workbench({ units: [corrected()], failText: true });
    await selectNth(user, 0);
    const box = editor();
    await user.clear(box);
    await user.type(box, 'Hello there.');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/save rejected by the backend/)).toBeInTheDocument();
    expect(screen.queryByText(/Correction saved/)).toBeNull();
    // The typed text is still there to retry with, not thrown away.
    expect(box).toHaveValue('Hello there.');
  });

  it('restoring machine text requires an explicit confirmation', async () => {
    const { user } = await workbench({ units: [manuallyCorrected()] });
    await selectNth(user, 0);

    await user.click(screen.getByRole('button', { name: 'Restore machine text' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/replaces it with the machine transcription/))
      .toBeInTheDocument();

    // Backing out changes nothing.
    await user.click(within(dialog).getByRole('button', { name: 'Keep my correction' }));
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
    expect(editor()).toHaveValue('Hello there.');
  });

  it('restoring machine text writes the transcript when confirmed', async () => {
    const { user } = await workbench({ units: [manuallyCorrected()] });
    await selectNth(user, 0);
    await user.click(screen.getByRole('button', { name: 'Restore machine text' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Replace it' }));
    await waitFor(() =>
      expect(mocks.dialogueSetText).toHaveBeenCalledWith({
        libraryId: 'lib1', unitId: 'r1', text: 'HELLO THERE',
      }));
  });
});

describe('keyboard shortcuts', () => {
  it('does not treat arrow keys typed in the text box as navigation', async () => {
    const units = [corrected(), region({ id: 'r2', unit_index: 2, x: 800, y: 900 })];
    const { user } = await workbench({ units });
    await selectNth(user, 0);
    const box = editor();

    await user.click(box);
    await user.keyboard('{ArrowRight}');
    // Still editing region one; the caret moved, selection did not. The region
    // counter appears in both the toolbar and the inspector heading.
    expect(screen.getAllByText('Region 1 of 2').length).toBeGreaterThan(0);
  });

  it('does not let "r" toggle review while typing in the text box', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    await user.click(editor());
    await user.keyboard('rrrr');
    expect(mocks.dialogueSetReviewed).not.toHaveBeenCalled();
  });

  it('toggles review with R when focus is not in a field', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    // Selecting a region opens the editor, which takes focus. Close it first so
    // this test exercises the shortcut rather than text entry.
    await user.keyboard('{Escape}');
    await user.keyboard('r');
    await waitFor(() =>
      expect(mocks.dialogueSetReviewed).toHaveBeenCalledWith({
        libraryId: 'lib1', unitId: 'r1', reviewed: true,
      }));
  });

  it('R types a letter rather than toggling review while the editor is focused', async () => {
    // The inverse of the test above, and the one that matters: a reviewer typing
    // "right" must not mark the region reviewed by pressing R.
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    await user.keyboard('rrr');
    expect(mocks.dialogueSetReviewed).not.toHaveBeenCalled();
    // The letters went into the field. Caret position is not asserted: jsdom
    // does not emulate click-to-position-caret, so where the characters land
    // is a harness artefact rather than product behaviour.
    expect(editor().value).toContain('rrr');
  });

  it('H writes the canonical overlay preference, not a private toggle', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await user.keyboard('h');
    await waitFor(() =>
      expect(mocks.setAppSettings).toHaveBeenCalledWith(
        { ocr_overlays_visible: false }));
    // ...and the stored value changed, which is what Settings will read.
    expect(appSettingsState.current.ocr_overlays_visible).toBe(false);
  });
});

describe('ink states', () => {
  const measured = region({
    id: 'r1', text: 'HELLO', text_source: 'ocr', machine_text: 'HELLO',
    ink_rgb: '#2B2B2B', ink_category: 'black', ink_confidence: 0.82,
    effective_ink_rgb: '#2B2B2B', effective_ink_category: 'black',
    effective_ink_source: 'machine',
  });

  it('shows a measured colour as a solid swatch labelled Estimated', async () => {
    const { user } = await workbench({ units: [measured] });
    await selectNth(user, 0);
    const swatch = document.querySelector<HTMLElement>('.wb-swatch');
    expect(swatch?.getAttribute('data-unknown')).toBe('false');
    expect(swatch?.style.background).toContain('rgb(43, 43, 43)');
    expect(screen.getByText('Estimated')).toBeInTheDocument();
  });

  it('labels an approved colour Approved', async () => {
    const approved = region({
      ...measured, ink_source: 'approved', effective_ink_source: 'approved',
    });
    const { user } = await workbench({ units: [approved] });
    await selectNth(user, 0);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('labels a chosen colour Manual and keeps the measurement on record', async () => {
    const manual = region({
      ...measured, ink_source: 'manual', effective_ink_source: 'manual',
      ink_user_rgb: '#1A1A1A', effective_ink_rgb: '#1A1A1A',
    });
    const { user } = await workbench({ units: [manual] });
    await selectNth(user, 0);
    expect(screen.getByText('Manual')).toBeInTheDocument();
    // The estimate the choice replaced must still be on record.
    expect(document.body.textContent)
      .toContain('The measurement it replaced was #2B2B2B');
  });

  it('draws an unknown colour as a hatched swatch, never a guessed colour', async () => {
    const unknown = region({
      id: 'r1', ink_category: 'unknown', ink_rgb: null, ink_confidence: 0,
      effective_ink_rgb: null, effective_ink_category: 'unknown',
    });
    const { user } = await workbench({ units: [unknown] });
    await selectNth(user, 0);
    const swatch = document.querySelector<HTMLElement>('.wb-swatch');
    expect(swatch?.getAttribute('data-unknown')).toBe('true');
    expect(swatch?.style.background).toBe('');
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText(/could not be separated from the lettering/))
      .toBeInTheDocument();
  });

  it('draws a mixed measurement as unknown too, not as one of its inks', async () => {
    const mixed = region({
      id: 'r1', ink_category: 'mixed', ink_rgb: '#2B2B2B', ink_confidence: 0.5,
      effective_ink_rgb: null, effective_ink_category: 'mixed',
    });
    const { user } = await workbench({ units: [mixed] });
    await selectNth(user, 0);
    expect(document.querySelector('.wb-swatch')?.getAttribute('data-unknown'))
      .toBe('true');
    expect(screen.getByText('Mixed')).toBeInTheDocument();
  });

  it('cannot approve a colour that was never measured', async () => {
    const unknown = region({
      id: 'r1', ink_category: 'unknown', ink_rgb: null, ink_confidence: 0,
      effective_ink_rgb: null, effective_ink_category: 'unknown',
    });
    const { user } = await workbench({ units: [unknown] });
    await selectNth(user, 0);
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    // Why it is disabled has to be discoverable, not just that it is.
    expect(approve.getAttribute('title')).toMatch(/no measurement to approve/);
  });

  it('approves a measured colour through the backend', async () => {
    const { user } = await workbench({ units: [measured] });
    await selectNth(user, 0);
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(mocks.dialogueSetInk).toHaveBeenCalledWith({
        libraryId: 'lib1', unitId: 'r1', inkAction: 'approve',
      }));
  });

  it('reports a rejected colour change instead of showing it as applied', async () => {
    const { user } = await workbench({ units: [measured], failInk: true });
    await selectNth(user, 0);
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/ink rejected by the backend/)).toBeInTheDocument();
  });
});

describe('review queue', () => {
  it('asks the backend for unreviewed regions by default', async () => {
    await workbench();
    await waitFor(() =>
      expect(mocks.dialogueList).toHaveBeenCalledWith(
        expect.objectContaining({ reviewed: false })));
  });

  it('can show everything instead', async () => {
    const { user } = await workbench();
    await user.click(screen.getByRole('combobox', { name: /Queue/ }));
    await user.click(screen.getByRole('option', { name: 'Everything' }));
    await waitFor(() =>
      expect(mocks.dialogueList).toHaveBeenLastCalledWith(
        expect.objectContaining({ reviewed: undefined })));
  });

  it('marks a region reviewed and persists it', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() =>
      expect(mocks.dialogueSetReviewed).toHaveBeenCalledWith({
        libraryId: 'lib1', unitId: 'r1', reviewed: true,
      }));
    expect(await screen.findByText(/Marked as reviewed/)).toBeInTheDocument();
  });

  it('shows an already-reviewed region as reviewed', async () => {
    const done = region({ ...corrected(), reviewed: 1 });
    const { user } = await workbench({ units: [done] });
    await selectNth(user, 0);
    expect(screen.getByRole('button', { name: /Reviewed/ })).toBeInTheDocument();
  });

  it('flags a region whose correction could not be reattached', async () => {
    const orphan = region({
      ...corrected(), text_source: 'manual', reattachment: 'unmatched',
    });
    const { user } = await workbench({ units: [orphan] });
    await selectNth(user, 0);
    expect(screen.getByText('Region no longer detected')).toBeInTheDocument();
    expect(screen.getByText(/kept exactly as it was/)).toBeInTheDocument();
  });

  it('distinguishes an ambiguous reattachment from a vanished region', async () => {
    const orphan = region({
      ...corrected(), text_source: 'manual', reattachment: 'ambiguous',
    });
    const { user } = await workbench({ units: [orphan] });
    await selectNth(user, 0);
    expect(screen.getByText('Needs reattaching')).toBeInTheDocument();
  });
});

describe('overlay text', () => {
  it('draws the recognised transcription on the region itself', async () => {
    installMocks({ units: [corrected()] });
    render(<DialogueReview />);
    await waitFor(() => expect(document.querySelector('.wb-region')).not.toBeNull());
    const label = document.querySelector('.wb-region-text');
    expect(label?.textContent).toBe('HELLO THERE');
  });

  it('says "not read" rather than leaving a region blank', async () => {
    installMocks({ units: [region({ id: 'a', text: '', text_source: 'none' })] });
    render(<DialogueReview />);
    await waitFor(() => expect(document.querySelector('.wb-region-text')).not.toBeNull());
    expect(document.querySelector('.wb-region-text')?.textContent).toBe('not read');
  });

  it('says OCR failed when the engine failed', async () => {
    installMocks({
      units: [region({ id: 'a', text: '', text_source: 'none', ocr_status: 'error' })],
    });
    render(<DialogueReview />);
    await waitFor(() => expect(document.querySelector('.wb-region-text')).not.toBeNull());
    expect(document.querySelector('.wb-region-text')?.textContent).toBe('OCR failed');
  });

  it('marks a corrected region with the word "manual", not colour alone', async () => {
    installMocks({ units: [manuallyCorrected()] });
    render(<DialogueReview />);
    await waitFor(() => expect(document.querySelector('.wb-region-badge')).not.toBeNull());
    expect(document.querySelector('.wb-region-badge')?.textContent).toBe('manual');
  });

  it('shows the effective (corrected) text, not the machine reading', async () => {
    installMocks({ units: [manuallyCorrected()] });
    render(<DialogueReview />);
    await waitFor(() => expect(document.querySelector('.wb-region-text')).not.toBeNull());
    expect(document.querySelector('.wb-region-text')?.textContent).toBe('Hello there.');
  });
});

describe('Ctrl+Enter', () => {
  it('saves the edit from inside the canvas editor', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    const box = editor();
    await user.clear(box);
    await user.type(box, 'typed on canvas');

    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() =>
      expect(mocks.dialogueSetText).toHaveBeenCalledWith({
        libraryId: 'lib1', unitId: 'r1', text: 'typed on canvas',
      }));
  });

  it('does nothing when there is nothing to save', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
  });

  it('leaves plain Enter alone so a newline can be typed', async () => {
    const { user } = await workbench({ units: [corrected()] });
    await selectNth(user, 0);
    const box = editor();
    await user.clear(box);
    await user.type(box, 'line one{Enter}line two');

    expect(box.value).toBe('line one\nline two');
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
  });
});

describe('empty and failure states', () => {
  it('explains an empty review queue rather than showing a blank screen', async () => {
    installMocks({ units: [] });
    render(<DialogueReview />);
    expect(await screen.findByText('Nothing left to review')).toBeInTheDocument();
    expect(screen.getByText(/marked reviewed/)).toBeInTheDocument();
  });

  it('points at indexing when there are no regions at all', async () => {
    installMocks({ units: [] });
    const user = userEvent.setup();
    render(<DialogueReview />);
    await screen.findByText('Nothing left to review');
    await user.click(screen.getByRole('combobox', { name: /Queue/ }));
    await user.click(screen.getByRole('option', { name: 'Everything' }));
    expect(await screen.findByText('No dialogue regions recorded')).toBeInTheDocument();
  });

  it('surfaces a load failure instead of rendering an empty workbench', async () => {
    installMocks({ units: [] });
    mocks.dialogueList.mockRejectedValueOnce(new Error('catalog unavailable'));
    render(<DialogueReview />);
    expect(await screen.findByText(/catalog unavailable/)).toBeInTheDocument();
  });
});

/**
 * The editor must not steal its neighbours' clicks.
 *
 * The in-place editor is deliberately larger than the OCR box it corrects,
 * because an OCR box is sized to the lettering and is routinely too small to
 * type into. On a real page that overflow lands on the *next* region, and
 * because the editor is painted after its siblings it received those clicks.
 *
 * The observable failure was not cosmetic. Clicking an adjacent balloon put
 * the caret in the region being edited, so a reviewer correcting one balloon
 * silently typed into another one - and the Save/Discard/Stay guard never
 * appeared, because the click that would have triggered it never arrived.
 *
 * Phase 3D addressed the cause rather than the symptom: the editor is no longer
 * anchored on top of its region at all, it is placed beside it in whichever of
 * four directions covers the least of the other regions.
 *
 * jsdom performs no hit testing and no layout, so the geometry is asserted
 * against the placement function directly and the DOM assertions cover what the
 * function is wired to.
 */
describe('editor placement', () => {
  it('places the editor beside the region instead of on top of it', async () => {
    const { user } = await workbench({ units: [corrected(), region({ id: 'r2' })] });
    await user.click(findOverlay('r1'));

    // A separate layer, positioned rather than anchored on the region's box.
    const layer = document.querySelector<HTMLElement>('.wb-region-editor');
    expect(layer).not.toBeNull();
    expect(layer!.getAttribute('role')).toBe('group');
    expect(layer!.getAttribute('aria-label')).toMatch(/^Editing region 1: /);
    // The region being edited is still on the canvas, marked as such.
    expect(findOverlay('r1').getAttribute('data-editing')).toBe('true');
  });

  it('says which region is being edited, above the text', async () => {
    const { user } = await workbench({ units: [corrected(), region({ id: 'r2' })] });
    await user.click(findOverlay('r1'));

    // On a page too dense to place the editor clear of everything, this heading
    // is the only thing that says which balloon the text belongs to.
    expect(document.querySelector('.wb-editor-head')?.textContent)
      .toBe('Editing region 1 of 2');
  });

  it('keeps the editor inside the page box', async () => {
    // A region hard against the right edge would push a right-hand placement off
    // the page, where the editor would float over the surrounding chrome and
    // read as belonging to nothing.
    const right = region({
      id: 'r1', unit_index: 1, x: 1800, y: 200, width: 180, height: 60,
    });
    const { user } = await workbench({ units: [right, region({ id: 'r2', x: 200, y: 900 })] });
    await user.click(findOverlay('r1'));

    const layer = document.querySelector<HTMLElement>('.wb-region-editor');
    const left = Number.parseFloat(layer!.style.left);
    const top = Number.parseFloat(layer!.style.top);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left).toBeLessThan(100);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(100);
  });

  it('lets the reviewer type and press Save or Cancel', async () => {
    const { user } = await workbench({ units: [corrected(), region({ id: 'r2' })] });
    await user.click(findOverlay('r1'));

    await user.clear(editor());
    await user.type(editor(), 'CORRECTED');
    expect(editor()).toHaveValue('CORRECTED');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText(/^Edit text for region /)).toBeNull();
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
  });
});

/**
 * Layout changes must not disturb the work in progress.
 *
 * Opening the queue and collapsing the inspector are pure presentation, and a
 * reviewer reaching for them mid-edit - to check what is still outstanding, say -
 * must not lose a word of the correction they are typing. The same is true of a
 * window resize, which the application cannot prevent.
 */
describe('layout changes preserve the work in progress', () => {
  async function editing() {
    const units = [corrected(), region({ id: 'r2', unit_index: 2, x: 800, y: 900 })];
    const ctx = await workbench({ units });
    await selectNth(ctx.user, 0);
    await ctx.user.clear(editor());
    await ctx.user.type(editor(), 'half-typed sentence');
    return ctx;
  }

  it('keeps the draft when the queue is shown and hidden', async () => {
    const { user } = await editing();

    await user.click(screen.getByRole('button', { name: 'Queue' }));
    expect(editor()).toHaveValue('half-typed sentence');

    await user.click(screen.getByRole('button', { name: 'Hide queue' }));
    expect(editor()).toHaveValue('half-typed sentence');
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
  });

  it('keeps the selection when the queue is shown and hidden', async () => {
    const { user } = await editing();

    await user.click(screen.getByRole('button', { name: 'Queue' }));
    await user.click(screen.getByRole('button', { name: 'Hide queue' }));

    expect(findOverlay('r1').getAttribute('data-selected')).toBe('true');
  });

  it('restores the layout when the queue closes', async () => {
    const { user, container } = await editing();
    const wb = container.querySelector<HTMLElement>('.wb')!;
    expect(wb.getAttribute('data-queue-open')).toBe('false');

    await user.click(screen.getByRole('button', { name: 'Queue' }));
    expect(wb.getAttribute('data-queue-open')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Hide queue' }));
    expect(wb.getAttribute('data-queue-open')).toBe('false');
  });

  it('keeps the draft when the inspector is collapsed and restored', async () => {
    const { user, container } = await editing();
    const wb = container.querySelector<HTMLElement>('.wb')!;

    await user.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(wb.getAttribute('data-inspector-open')).toBe('false');
    expect(editor()).toHaveValue('half-typed sentence');

    await user.click(screen.getByRole('button', { name: 'Show details' }));
    expect(wb.getAttribute('data-inspector-open')).toBe('true');
    expect(editor()).toHaveValue('half-typed sentence');
  });

  it('keeps the draft when the window is resized', async () => {
    const { container } = await editing();
    const page = container.querySelector<HTMLElement>('.wb-page')!;
    const before = page.style.width;

    // A different stage size re-fits the page; it must not touch the draft.
    setStageRect({ width: 700, height: 420 });
    fireResizeObservers();

    await waitFor(() => expect(page.style.width).not.toBe(before));
    expect(editor()).toHaveValue('half-typed sentence');
    expect(mocks.dialogueSetText).not.toHaveBeenCalled();
  });

  it('keeps the zoom level when the layout is reshuffled', async () => {
    const { user, container } = await editing();
    await user.click(screen.getByRole('button', { name: '100%' }));
    const page = container.querySelector<HTMLElement>('.wb-page')!;
    const zoomed = page.style.width;

    await user.click(screen.getByRole('button', { name: 'Queue' }));
    expect(page.style.width).toBe(zoomed);
    expect(screen.getByRole('status', { name: 'Zoom level' }).textContent).toBe('100%');
  });
});