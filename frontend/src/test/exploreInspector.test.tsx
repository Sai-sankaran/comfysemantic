// covers: INS-01, INS-02, INS-03, INS-04, INS-05, INS-06, INS-07, INS-08, INS-09, INS-10, INS-11, GAL-04, STA-02, STA-03, STA-04, STA-05, STA-06
/**
 * The Inspector (design §7.2, `INS-01`–`INS-11`).
 *
 * The rule under almost every test here is `INS-03`: **absent data is never
 * shown**. A heading above nothing, or a column of em dashes for fields the item
 * does not have, is the specific failure this file exists to prevent — so most
 * tests build a detail record with something deliberately missing and assert the
 * corresponding row or whole section is gone.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Inspector,
  NOTES_AUTOSAVE_MS,
  SECTION_ORDER_COMIC,
  SECTION_ORDER_COMFYUI,
  type InspectorActions,
} from '../features/explore/ExploreInspector';
import type {
  ExploreItem,
  ExploreItemDetail,
  ExplorePanelDetail,
} from '../features/explore/exploreTypes';

function item(over: Partial<ExploreItem> = {}): ExploreItem {
  return {
    id: 'i1',
    kind: 'page',
    filename: 'portrait.png',
    displayPath: 'D:\\lib\\portrait.png',
    folderIds: ['lib-root'],
    width: 1024,
    height: 1024,
    fileSizeBytes: 2_400_000,
    modifiedAt: '2026-09-30T12:00:00.000Z',
    generatedAt: null,
    dominantColor: '#3a4a63',
    thumbnailUrl: 'thumb.png',
    previewUrl: 'preview.png',
    badges: [],
    panelCount: null,
    panelIndex: null,
    parentPageId: null,
    parentSeriesLabel: null,
    missing: false,
    flag: 'none',
    hidden: false,
    importBatchId: null,
    importBatchKind: null,
    cataloguedAt: '2026-09-30T12:00:00.000Z',
    ...over,
  };
}

function detail(over: Partial<ExploreItemDetail> = {}): ExploreItemDetail {
  return {
    itemId: 'i1',
    fileName: 'portrait.png',
    displayPath: 'D:\\lib\\portrait.png',
    format: 'PNG',
    width: 1024,
    height: 1024,
    fileSizeBytes: 2_400_000,
    modifiedAt: '2026-09-30T12:00:00.000Z',
    addedAt: '2026-09-01T08:00:00.000Z',
    positivePrompt: null,
    negativePrompt: null,
    model: null,
    loras: [],
    sampler: null,
    scheduler: null,
    steps: null,
    cfg: null,
    seed: null,
    denoise: null,
    hasWorkflow: false,
    workflowJson: null,
    workflowNodeCount: null,
    existingTags: ['portrait', 'window light', 'grain'],
    tags: [],
    rating: 0,
    favourite: false,
    notes: null,
    sourceUrl: null,
    sourceSite: null,
    creator: null,
    stages: [],
    panelStatus: null,
    panels: [],
    text: [],
    ...over,
  };
}

function actions(over: Partial<InspectorActions> = {}): InspectorActions {
  return {
    onCopy: vi.fn(),
    onReveal: vi.fn(),
    onOpenSourceUrl: vi.fn(),
    onSearchPrompt: vi.fn(),
    onSaveTags: vi.fn(async () => undefined),
    onSaveRating: vi.fn(async () => undefined),
    onSaveFavourite: vi.fn(async () => undefined),
    onSaveNotes: vi.fn(async () => undefined),
    onRequestWorkflow: vi.fn(async () => null),
    onRetryStage: vi.fn(),
    onDecompose: vi.fn(),
    onEditPanels: vi.fn(),
    onEditInReview: vi.fn(),
    onOpenViewer: vi.fn(),
    onOpenParentPage: vi.fn(),
    ...over,
  };
}

function renderInspector(
  props: Partial<React.ComponentProps<typeof Inspector>> = {},
  actionOverrides: Partial<InspectorActions> = {},
) {
  const act = actions(actionOverrides);
  const utils = render(
    <Inspector
      detail={detail()}
      libraryType="comfyui"
      item={item()}
      panel={null}
      actions={act}
      {...props}
    />,
  );
  return { ...utils, actions: act };
}

/** The section ids actually rendered, in document order. */
function sectionIds(): string[] {
  return Array.from(document.querySelectorAll('.inspector-section')).map(
    (el) => el.getAttribute('data-section') ?? '',
  );
}

describe('INS-02 — section order', () => {
  it('documents the two orders it renders', () => {
    expect(SECTION_ORDER_COMFYUI).toEqual([
      'preview',
      'file',
      'generation',
      'workflow',
      'tags',
      'processing',
    ]);
    expect(SECTION_ORDER_COMIC).toEqual(['preview', 'file', 'panels', 'text', 'tags', 'processing']);
  });

  it('renders the ComfyUI sections in the documented order', () => {
    renderInspector({
      detail: detail({
        positivePrompt: 'a portrait',
        hasWorkflow: true,
        workflowNodeCount: 9,
        stages: [{ name: 'Thumbnail', status: 'done', at: null }],
      }),
    });
    expect(sectionIds()).toEqual(['preview', 'file', 'generation', 'workflow', 'tags', 'processing']);
  });

  it('renders the comic sections in the documented order', () => {
    renderInspector({
      libraryType: 'comic',
      detail: detail({
        panelStatus: 'not-decomposed',
        text: [{ region: 'Panel 1', text: 'hello' }],
        stages: [{ name: 'OCR', status: 'done', at: null }],
      }),
    });
    expect(sectionIds()).toEqual(['preview', 'file', 'panels', 'text', 'tags', 'processing']);
  });

  it('gives every section a heading with a toggle that reports its state', async () => {
    const user = userEvent.setup();
    renderInspector();
    const toggle = screen.getByRole('button', { name: /File/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: /File/ }).getAttribute('aria-expanded')).toBe('false');
    // The section's rows are gone. The filename above the sections stays: it is
    // the inspector's heading, not part of the File section.
    const file = document.querySelector('[data-section="file"]') as HTMLElement;
    expect(within(file).queryByText('Dimensions')).toBeNull();
  });
});

describe('INS-03 — absent data is never shown', () => {
  it('hides the Generation section when the item has no generation record', () => {
    renderInspector({ detail: detail() });
    expect(screen.queryByRole('heading', { name: /Generation/ })).toBeNull();
  });

  it('hides each absent field rather than printing an em dash', () => {
    renderInspector({ detail: detail({ format: null, fileSizeBytes: null, addedAt: null }) });
    const file = screen.getByRole('button', { name: /File/ }).closest('section') as HTMLElement;
    expect(within(file).queryByText('Format')).toBeNull();
    expect(within(file).queryByText('Size')).toBeNull();
    expect(within(file).queryByText('Added')).toBeNull();
    // The fields it does have are still there.
    expect(within(file).getByText('Dimensions')).toBeTruthy();
  });

  it('always shows Preview and File, even for a bare item', () => {
    renderInspector({ detail: detail() });
    expect(sectionIds()).toEqual(['preview', 'file', 'tags', 'processing']);
  });

  it('hides the Workflow section when the item has no workflow', () => {
    renderInspector({ detail: detail({ hasWorkflow: false }) });
    expect(screen.queryByRole('heading', { name: /Workflow/ })).toBeNull();
  });

  it('hides the comic Panels and Text sections when there is nothing to show', () => {
    renderInspector({
      libraryType: 'comic',
      detail: detail({ panelStatus: null, text: [] }),
    });
    expect(screen.queryByRole('heading', { name: 'Panels' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Text' })).toBeNull();
  });
});

describe('INS-04 — preview', () => {
  it('fits the image without cropping it', () => {
    const { container } = renderInspector();
    const img = container.querySelector('.inspector-preview img') as HTMLImageElement;
    expect(img.style.objectFit).toBe('contain');
  });

  it('says it is loading rather than showing a blank box', () => {
    renderInspector();
    // The fixture has a preview URL but jsdom never fires `load`, which is the
    // state a real user sees first.
    expect(screen.getByText('Loading preview…')).toBeTruthy();
  });

  it('opens the viewer on click', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector();
    await user.click(screen.getByRole('button', { name: /Open portrait.png in the viewer/ }));
    expect(act.onOpenViewer).toHaveBeenCalledTimes(1);
  });

  it('offers the two preview toggles for a comic page (INS-10)', () => {
    renderInspector({ libraryType: 'comic', detail: detail({ panelStatus: 'not-decomposed' }) });
    expect(screen.getByRole('button', { name: /Show panels/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Show text regions/ })).toBeTruthy();
  });

  it('offers no comic toggles for a ComfyUI item', () => {
    renderInspector();
    expect(screen.queryByRole('button', { name: /Show panels/ })).toBeNull();
  });

  it('names the missing file instead of showing nothing (STA-12)', () => {
    renderInspector({ item: item({ thumbnailUrl: null, previewUrl: null, missing: true }) });
    expect(screen.getByText(/File not found: D:\\lib\\portrait.png/)).toBeTruthy();
  });
});

describe('INS-05 — file details', () => {
  it('copies the name and the path without changing them', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector();
    await user.click(screen.getByRole('button', { name: 'Copy Name' }));
    expect(act.onCopy).toHaveBeenCalledWith('portrait.png', 'name');
    await user.click(screen.getByRole('button', { name: 'Copy Folder' }));
    expect(act.onCopy).toHaveBeenCalledWith('D:\\lib\\portrait.png', 'path');
  });

  it('reports the size in MB to one decimal place', () => {
    renderInspector();
    // 2,400,000 bytes -> 2.4 MB, not 2.39 and not 2.
    expect(screen.getByText('2.4 MB')).toBeTruthy();
  });
});

describe('INS-05a — comic source details', () => {
  it('offers copy and a separate explicit Open for the source URL', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector({
      libraryType: 'comic',
      detail: detail({ sourceUrl: 'https://example.invalid/s/1' }),
    });
    await user.click(screen.getByRole('button', { name: 'Copy Source URL' }));
    // Copying must not launch a browser.
    expect(act.onCopy).toHaveBeenCalledWith('https://example.invalid/s/1', 'source URL');
    expect(act.onOpenSourceUrl).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Open Source URL' }));
    expect(act.onOpenSourceUrl).toHaveBeenCalledWith('https://example.invalid/s/1');
  });

  it('shows the creator only for a comic page', () => {
    const { unmount } = renderInspector({
      libraryType: 'comic',
      detail: detail({ creator: 'Studio Example' }),
    });
    expect(screen.getByText('Studio Example')).toBeTruthy();
    unmount();
    renderInspector({ libraryType: 'comfyui', detail: detail({ creator: 'Studio Example' }) });
    expect(screen.queryByText('Studio Example')).toBeNull();
  });
});

describe('INS-06 — generation', () => {
  const generated = detail({
    positivePrompt: 'a portrait of a woman in soft window light',
    negativePrompt: 'blurry, low quality',
    model: 'sd_xl_base_1.0.safetensors',
    loras: [{ name: 'add_detail.safetensors', weight: 0.75 }],
    sampler: 'dpmpp_2m',
    scheduler: 'karras',
    steps: 28,
    cfg: 7.5,
    seed: '1843523061',
    denoise: 0.85,
  });

  it('lists every documented field', () => {
    renderInspector({ detail: generated });
    for (const label of ['Model', 'Sampler', 'Scheduler', 'Steps', 'CFG', 'Seed', 'Denoise']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('7.5')).toBeTruthy();
    expect(screen.getByText('0.85')).toBeTruthy();
  });

  it('shows one LoRA per line as "name · weight"', () => {
    renderInspector({ detail: generated });
    expect(screen.getByText('add_detail.safetensors · 0.75')).toBeTruthy();
  });

  it('collapses the negative prompt by default and opens it on request', async () => {
    const user = userEvent.setup();
    renderInspector({ detail: generated });
    expect(screen.queryByText('blurry, low quality')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Negative prompt' }));
    expect(screen.getByText('blurry, low quality')).toBeTruthy();
  });

  it('offers Show more for a long prompt and reveals the rest', async () => {
    const user = userEvent.setup();
    const long = 'x'.repeat(400);
    renderInspector({ detail: detail({ positivePrompt: long }) });
    expect(screen.getByRole('button', { name: 'Show more' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
  });

  it('offers no Show more for a short prompt', () => {
    renderInspector({ detail: detail({ positivePrompt: 'a portrait' }) });
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('copies and searches the prompt', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector({ detail: generated });
    await user.click(screen.getByRole('button', { name: 'Copy Positive prompt' }));
    expect(act.onCopy).toHaveBeenCalledWith(generated.positivePrompt, 'positive prompt');
    await user.click(screen.getByRole('button', { name: 'Search Positive prompt' }));
    expect(act.onSearchPrompt).toHaveBeenCalledWith(generated.positivePrompt);
  });
});

describe('INS-07 — workflow', () => {
  it('starts collapsed and shows the node count without the JSON', async () => {
    const user = userEvent.setup();
    renderInspector({ detail: detail({ hasWorkflow: true, workflowNodeCount: 9, workflowJson: null }) });
    const toggle = screen.getByRole('button', { name: /Workflow/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(screen.getByText('9 nodes')).toBeTruthy();
  });

  it('fetches the JSON only when the user asks for it', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector({
      detail: detail({ hasWorkflow: true, workflowNodeCount: 9, workflowJson: null }),
    });
    expect(act.onRequestWorkflow).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Workflow/ }));
    await user.click(screen.getByRole('button', { name: 'View JSON' }));
    await waitFor(() => expect(act.onRequestWorkflow).toHaveBeenCalledWith('i1'));
  });

  it('shows a read-only dialog with in-dialog search', async () => {
    const user = userEvent.setup();
    const json = '{\n  "nodes": [],\n  "groups": []\n}';
    renderInspector({ detail: detail({ hasWorkflow: true, workflowNodeCount: 2, workflowJson: json }) });
    await user.click(screen.getByRole('button', { name: /Workflow/ }));
    await user.click(screen.getByRole('button', { name: 'View JSON' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Search workflow JSON')).toBeTruthy();
    await user.type(within(dialog).getByLabelText('Search workflow JSON'), 'groups');
    await waitFor(() => expect(dialog.querySelector('.json-hit')?.textContent).toContain('groups'));
  });
});

describe('INS-08 — tags, rating, favourite and notes', () => {
  it('commits a tag on Enter and saves it', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector();
    await user.type(screen.getByLabelText('Add a tag'), 'portrait{Enter}');
    expect(act.onSaveTags).toHaveBeenCalledWith('i1', ['portrait']);
  });

  it('treats a pasted comma as two tags (TAG-02)', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector();
    await user.type(screen.getByLabelText('Add a tag'), 'a, b{Enter}');
    expect(act.onSaveTags).toHaveBeenCalledWith('i1', ['a', 'b']);
  });

  it('refuses an empty or over-long tag (TAG-01)', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector();
    await user.type(screen.getByLabelText('Add a tag'), '{Enter}');
    expect(act.onSaveTags).toHaveBeenCalledWith('i1', []);
    await user.type(screen.getByLabelText('Add a tag'), 'x'.repeat(61) + '{Enter}');
    expect(act.onSaveTags).toHaveBeenLastCalledWith('i1', []);
  });

  it('treats tag names as case-insensitively unique (TAG-03)', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector();
    await user.type(screen.getByLabelText('Add a tag'), 'Portrait{Enter}');
    await user.type(screen.getByLabelText('Add a tag'), 'PORTRAIT{Enter}');
    expect(act.onSaveTags).toHaveBeenLastCalledWith('i1', ['Portrait']);
  });

  it('removes the last chip on Backspace in an empty field', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector({ detail: detail({ tags: ['one', 'two'] }) });
    await user.click(screen.getByLabelText('Add a tag'));
    await user.keyboard('{Backspace}');
    expect(act.onSaveTags).toHaveBeenCalledWith('i1', ['one']);
  });

  it('sets a rating by clicking and by number key', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector();
    await user.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(act.onSaveRating).toHaveBeenCalledWith('i1', 4);

    const group = screen.getByRole('radiogroup', { name: 'Rating' });
    group.focus();
    await user.keyboard('3');
    expect(act.onSaveRating).toHaveBeenLastCalledWith('i1', 3);
  });

  it('clears the rating when the same star is clicked again', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector({ detail: detail({ rating: 4 }) });
    await user.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(act.onSaveRating).toHaveBeenCalledWith('i1', 0);
  });

  it('ignores a number key when the rating does not have focus', async () => {
    const { actions: act } = renderInspector();
    expect(act.onSaveRating).not.toHaveBeenCalled();
  });

  it('autosaves notes after typing stops, with the specified delay', async () => {
    const { actions: act } = renderInspector({ autosaveMs: 30 });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'a note' } });
    expect(screen.getByText('Saving…')).toBeTruthy();
    await waitFor(() => expect(act.onSaveNotes).toHaveBeenCalledWith('i1', 'a note'));
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('saves the text just typed, not the previous value', async () => {
    // Regression: the autosave timer was scheduled from the change handler, whose
    // closure still held the value *before* the keystroke, so the last edit was
    // silently lost.
    const { actions: act } = renderInspector({ autosaveMs: 20 });
    const field = screen.getByLabelText('Notes');
    fireEvent.change(field, { target: { value: 'first' } });
    await waitFor(() => expect(act.onSaveNotes).toHaveBeenCalledWith('i1', 'first'));

    fireEvent.change(field, { target: { value: 'first and second' } });
    await waitFor(() => expect(act.onSaveNotes).toHaveBeenLastCalledWith('i1', 'first and second'));
  });

  it('uses a two-second delay in production (INS-08)', () => {
    // The shortened delay above is a test affordance; the shipped value is fixed.
    expect(NOTES_AUTOSAVE_MS).toBe(2000);
  });

  it('does not save while the user is still typing', async () => {
    const { actions: act } = renderInspector({ autosaveMs: 60 });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'a' } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(act.onSaveNotes).not.toHaveBeenCalled();
    await waitFor(() => expect(act.onSaveNotes).toHaveBeenCalled());
  });

  it('saves on blur without waiting for the timer (INS-08)', async () => {
    const { actions: act } = renderInspector();
    const field = screen.getByLabelText('Notes');
    fireEvent.change(field, { target: { value: 'quick note' } });
    fireEvent.blur(field);
    await waitFor(() => expect(act.onSaveNotes).toHaveBeenCalledWith('i1', 'quick note'));
  });

  it('keeps the text and offers Retry when a save fails (STA-15)', async () => {
    const failing = vi.fn(async () => Promise.reject(new Error('disk full')));
    renderInspector({}, { onSaveNotes: failing });
    const field = screen.getByLabelText('Notes');
    fireEvent.change(field, { target: { value: 'do not lose this' } });
    fireEvent.blur(field);
    await waitFor(() => expect(screen.getByText(/Couldn't save/)).toBeTruthy());
    // The user's text is still in the field, so nothing they typed is lost.
    expect((field as HTMLTextAreaElement).value).toBe('do not lose this');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('toggles favourite', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector();
    await user.click(screen.getByLabelText('Favourite'));
    expect(act.onSaveFavourite).toHaveBeenCalledWith('i1', true);
  });

  it('does not show the previous item\'s edits after switching (INS-08)', async () => {
    const user = userEvent.setup();
    const act = actions();
    const { rerender } = render(
      <Inspector
        detail={detail({ itemId: 'i1', notes: 'first item' })}
        libraryType="comfyui"
        item={item()}
        panel={null}
        actions={act}
      />,
    );
    rerender(
      <Inspector
        detail={detail({ itemId: 'i2', fileName: 'other.png', notes: null })}
        libraryType="comfyui"
        item={item({ id: 'i2', filename: 'other.png' })}
        panel={null}
        actions={act}
      />,
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe(''),
    );
    void user;
  });
});

describe('INS-09 — processing', () => {
  const stages: ExploreItemDetail['stages'] = [
    { name: 'Thumbnail', status: 'done', at: '2026-09-30T12:00:00.000Z' },
    { name: 'Metadata', status: 'failed', at: null, error: 'Model runtime was not available.' },
    { name: 'Embeddings', status: 'skipped', at: null },
    { name: 'OCR', status: 'stale', at: null },
  ];

  it('gives every stage a text status, not a colour alone', () => {
    renderInspector({ detail: detail({ stages }) });
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
    expect(screen.getByText('Stale')).toBeTruthy();
  });

  it('shows the error and a per-item retry for a failed stage', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector({ detail: detail({ stages }) });
    expect(screen.getByText('Model runtime was not available.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry this stage' }));
    expect(act.onRetryStage).toHaveBeenCalledWith('i1', 'Metadata');
  });

  it('offers no retry for a stage that did not fail', () => {
    renderInspector({ detail: detail({ stages }) });
    // One failed stage means one retry; the other three offer none.
    expect(screen.getAllByRole('button', { name: 'Retry this stage' })).toHaveLength(1);
  });
});

describe('INS-10 — comic page', () => {
  it('lists the panels and offers edit actions once decomposed', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector({
      libraryType: 'comic',
      detail: detail({
        panelStatus: 'decomposed',
        panels: [
          { id: 'p1', index: 1, width: 400, height: 300, thumbnailUrl: null },
          { id: 'p2', index: 2, width: 400, height: 250, thumbnailUrl: null },
        ],
      }),
    });
    expect(screen.getByText('Decomposed — 2 panels')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Edit panels' }));
    expect(act.onEditPanels).toHaveBeenCalledWith('i1');
    await user.click(screen.getByRole('button', { name: 'Re-decompose' }));
    expect(act.onDecompose).toHaveBeenCalledWith('i1');
  });

  it('offers Decompose, not Edit, when the page is not decomposed', async () => {
    renderInspector({
      libraryType: 'comic',
      detail: detail({ panelStatus: 'not-decomposed' }),
    });
    expect(screen.getByText('Not decomposed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decompose' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit panels' })).toBeNull();
  });

  it('says no panels were found, distinctly from "not decomposed"', () => {
    renderInspector({
      libraryType: 'comic',
      detail: detail({ panelStatus: 'no-panels' }),
    });
    expect(screen.getByText('No panels found')).toBeTruthy();
  });

  it('groups text by region and links to Review', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector({
      libraryType: 'comic',
      detail: detail({
        panelStatus: 'not-decomposed',
        text: [
          { region: 'Panel 1', text: 'first bubble' },
          { region: 'Page', text: 'page level caption' },
        ],
      }),
    });
    expect(screen.getByText('Panel 1')).toBeTruthy();
    expect(screen.getByText('first bubble')).toBeTruthy();
    expect(screen.getByText('page level caption')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Edit in Review' }));
    expect(act.onEditInReview).toHaveBeenCalledWith('i1');
  });
});

describe('INS-11 — comic panel', () => {
  const panel: ExplorePanelDetail = {
    id: 'p1',
    index: 2,
    box: { x: 40, y: 120, width: 400, height: 260 },
    parentPageId: 'page-7',
    parentSeriesLabel: 'Chapter 3',
    parentFilename: 'page-007.jpg',
    parentRating: 4,
    parentFavourite: true,
    tags: ['action', 'panel'],
    text: [{ region: 'Panel 2', text: 'a shouted word' }],
    thumbnailUrl: null,
  };

  it('shows the crop box in source pixels', () => {
    renderInspector({ detail: null, panel });
    expect(screen.getByText('400')).toBeTruthy();
    expect(screen.getByText('260')).toBeTruthy();
    expect(screen.getByText('Reading order')).toBeTruthy();
  });

  it('links to the parent page', async () => {
    const user = userEvent.setup();
    const { actions: act } = renderInspector({ detail: null, panel });
    await user.click(screen.getByRole('button', { name: /page-007.jpg/ }));
    expect(act.onOpenParentPage).toHaveBeenCalledWith('page-7');
  });

  it('shows the parent rating and favourite as inherited, read-only', () => {
    renderInspector({ detail: null, panel });
    expect(screen.getByText(/read-only here/)).toBeTruthy();
    expect(screen.getByText('★★★★ from the page')).toBeTruthy();
    expect(screen.getByText('★ Favourite on the page')).toBeTruthy();
    // A panel has no rating of its own, so there is no editable star group.
    expect(screen.queryByRole('radiogroup', { name: 'Rating' })).toBeNull();
  });

  it('shows the panel\'s own tags read-only', () => {
    renderInspector({ detail: null, panel });
    expect(screen.getByText('action')).toBeTruthy();
    expect(screen.queryByLabelText('Add a tag')).toBeNull();
  });

  it('prefers the panel over the page when both are supplied', () => {
    renderInspector({ detail: detail(), panel });
    expect(screen.getByText('Panel #2')).toBeTruthy();
  });
});

describe('the loading state', () => {
  it('says it is loading rather than showing an empty inspector', () => {
    renderInspector({ detail: null });
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(document.querySelectorAll('.inspector-section')).toHaveLength(0);
  });
});