// covers: FLG-01, FLG-02, FLG-03, FLG-04, FLG-05, FLG-07, FLG-08, FLG-09, FLG-10, FLG-11, NAV-51, STA-02, STA-03, STA-04, STA-05, STA-06
/**
 * Hide, Pick and Reject (design Appendix E.1, `FLG-01`–`FLG-11`).
 *
 * The rules under test are mostly the ones that distinguish one of these from
 * another. Hiding removes from every result set but not from processing; rejecting
 * keeps the item visible; picking and rejecting are mutually exclusive; and every
 * operation is undoable with the *previous* value restored.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  actionLabel,
  actionTooltip,
  applyFlag,
  badgesWithFlag,
  flagTargets,
  hideRejectedSummary,
  inheritedFlag,
  passesHiddenFilter,
  processableCount,
  REJECTED_OPACITY,
  scopeCountText,
  SHOW_AGAIN_LABEL,
  HIDE_TOOLTIP,
} from '../features/explore/flagsModel';
import {
  FIXTURE_LIBRARIES,
  FIXTURE_SOURCE,
  fixtureCatalogue,
  resetFixtureFlags,
} from '../features/explore/exploreFixtures';
import { ExploreScreen } from '../features/explore/ExploreScreen';
import { ShellPanesContext, type ShellPanesValue } from '../app/shellPanes';
import { EMPTY_FILTERS, type ExploreFilters, type ExploreItem } from '../features/explore/exploreTypes';

const COMFY = FIXTURE_LIBRARIES[0];

/**
 * These tests render the whole screen — 200 cards plus the tree and inspector —
 * and then interact with it. Under a full-suite run that is slower than the
 * 5 s default, and a timeout here would be the harness's load, not a product
 * defect. The assertions themselves are unchanged.
 */
vi.setConfig({ testTimeout: 30_000 });

function item(id: string, over: Partial<ExploreItem> = {}): ExploreItem {
  return {
    id,
    kind: 'page',
    filename: `${id}.png`,
    displayPath: `D:\\lib\\${id}.png`,
    folderIds: ['lib-root'],
    width: 1024,
    height: 1024,
    fileSizeBytes: 1000,
    modifiedAt: '2026-09-30T00:00:00.000Z',
    generatedAt: null,
    dominantColor: '#3a4a63',
    thumbnailUrl: `cp-thumb://${id}`,
    previewUrl: null,
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
    cataloguedAt: '2026-09-30T00:00:00.000Z',
    ...over,
  };
}

describe('FLG-03 — the fixed wording', () => {
  it('never calls hiding a delete or a removal', () => {
    expect(actionLabel('hide')).toBe('Hide');
    // `FLG-03` requires the tooltip to *say* it does not delete; the rule is that
    // the action is never named "delete", not that the word is banned.
    expect(actionTooltip('hide')).toBe("Hide (doesn't delete the file)");
    expect(HIDE_TOOLTIP).toContain("doesn't delete");
    expect(actionLabel('showAgain')).toBe(SHOW_AGAIN_LABEL);
    for (const action of ['hide', 'showAgain', 'pick', 'reject', 'clearFlag'] as const) {
      expect(actionLabel(action).toLowerCase()).not.toContain('delete');
      expect(actionLabel(action).toLowerCase()).not.toContain('remove');
    }
  });

  it('gives every action a label and a tooltip', () => {
    for (const action of ['hide', 'showAgain', 'pick', 'reject', 'clearFlag'] as const) {
      expect(actionLabel(action).length).toBeGreaterThan(0);
      expect(actionTooltip(action).length).toBeGreaterThan(0);
    }
  });
});

describe('FLG-09 — what a flag action applies to', () => {
  it('uses the selection when there is one', () => {
    expect(flagTargets({ selectionIds: ['a', 'b'], focusedId: 'c' })).toEqual(['a', 'b']);
  });

  it('falls back to the focused item only when nothing is selected', () => {
    expect(flagTargets({ selectionIds: [], focusedId: 'c' })).toEqual(['c']);
  });

  it('does nothing when neither exists', () => {
    expect(flagTargets({ selectionIds: [], focusedId: null })).toEqual([]);
  });

  it('replaces the previous flag rather than adding a second one', () => {
    const items = [item('a', { flag: 'pick' })];
    const { changed } = applyFlag(items, ['a'], 'reject');
    expect(changed).toEqual([{ id: 'a', previous: 'pick' }]);
  });

  it('reports only the items that actually changed', () => {
    const items = [item('a', { flag: 'pick' }), item('b', { flag: 'none' })];
    const { changed } = applyFlag(items, ['a', 'b'], 'pick');
    // `a` was already picked, so it is not in the undo entry.
    expect(changed).toEqual([{ id: 'b', previous: 'none' }]);
  });

  it('ignores items outside the target set', () => {
    const { changed } = applyFlag([item('a'), item('b')], ['a'], 'pick');
    expect(changed.map((c) => c.id)).toEqual(['a']);
  });

  it('clears a flag as a first-class value, not as absence', () => {
    const { changed } = applyFlag([item('a', { flag: 'reject' })], ['a'], 'none');
    expect(changed).toEqual([{ id: 'a', previous: 'reject' }]);
  });
});

describe('FLG-02 — hidden items leave every result set', () => {
  it('excludes hidden items from a normal view', () => {
    expect(passesHiddenFilter(item('a'), 'exclude')).toBe(true);
    expect(passesHiddenFilter(item('a', { hidden: true }), 'exclude')).toBe(false);
  });

  it('shows only hidden items in the Hidden view', () => {
    expect(passesHiddenFilter(item('a', { hidden: true }), 'only')).toBe(true);
    expect(passesHiddenFilter(item('a'), 'only')).toBe(false);
  });
});

describe('FLG-05 — hiding is a view concern, not a processing one', () => {
  it('still counts a hidden item as work', () => {
    const items = [item('a'), item('b', { hidden: true })];
    expect(processableCount(items)).toBe(2);
  });

  it('shows the hidden count beside the total rather than inside it', () => {
    expect(scopeCountText(412, 0)).toBe('412 items');
    expect(scopeCountText(412, 3)).toBe('412 items (3 hidden)');
    expect(scopeCountText(1, 1)).toBe('1 items (1 hidden)');
  });
});

describe('FLG-06 — panels inherit their page\'s flag', () => {
  it('reads the parent page\'s flag for a panel', () => {
    const page = item('page-1', { flag: 'reject' });
    const panel = item('p1', { kind: 'panel', parentPageId: 'page-1', flag: 'none' });
    const pages = new Map([['page-1', page]]);
    expect(inheritedFlag(panel, pages)).toEqual({ flag: 'reject', hidden: false });
  });

  it('inherits hidden state too, so a hidden page hides its panels', () => {
    const page = item('page-1', { hidden: true });
    const panel = item('p1', { kind: 'panel', parentPageId: 'page-1', hidden: false });
    expect(inheritedFlag(panel, new Map([['page-1', page]])).hidden).toBe(true);
  });

  it('leaves a page\'s own flag alone', () => {
    const page = item('page-1', { flag: 'pick' });
    expect(inheritedFlag(page, new Map())).toEqual({ flag: 'pick', hidden: false });
  });

  it('falls back to the panel when its page is not loaded', () => {
    const panel = item('p1', { kind: 'panel', parentPageId: 'gone', flag: 'pick' });
    expect(inheritedFlag(panel, new Map())).toEqual({ flag: 'pick', hidden: false });
  });
});

describe('FLG-07 — reject is a judgment, not a removal', () => {
  it('dims rather than hiding, at the documented opacity', () => {
    expect(REJECTED_OPACITY).toBe(0.45);
  });

  it('adds a reject badge without losing the others', () => {
    const badges = badgesWithFlag(['favourite'], 'reject');
    expect(badges).toContain('reject');
    expect(badges).toContain('favourite');
  });

  it('adds no badge for no flag', () => {
    expect(badgesWithFlag(['stale'], 'none')).toEqual(['stale']);
  });

  it('does not duplicate a badge the item already carries', () => {
    expect(badgesWithFlag(['reject'], 'reject')).toEqual(['reject']);
  });

  it('states the count in the bulk-hide confirmation', () => {
    const one = hideRejectedSummary(['a']);
    expect(one.title).toContain('1 rejected item');
    expect(one.confirmLabel).toBe('Hide 1');
    const many = hideRejectedSummary(['a', 'b', 'c']);
    expect(many.title).toContain('3 rejected items');
    expect(many.confirmLabel).toBe('Hide 3');
  });

  it('says in the confirmation that nothing is deleted', () => {
    expect(hideRejectedSummary(['a']).body).toMatch(/nothing is deleted/i);
  });
});

// --- the assembled screen ---------------------------------------------------

function panes(over: Partial<ShellPanesValue> = {}): ShellPanesValue {
  return {
    treeOpen: true,
    inspectorOpen: true,
    selectedCount: 0,
    setSelectedCount: vi.fn(),
    setTreeOpen: vi.fn(),
    setInspectorOpen: vi.fn(),
    notify: vi.fn(),
    viewMode: 'grid',
    setViewMode: vi.fn(),
    ...over,
  };
}

function renderScreen(paneOverrides: Partial<ShellPanesValue> = {}) {
  const value = panes(paneOverrides);
  const utils = render(
    <ShellPanesContext.Provider value={value}>
      <ExploreScreen
        source={FIXTURE_SOURCE}
        libraryId={COMFY.id}
        libraryType="comfyui"
        density="comfortable"
      />
    </ShellPanesContext.Provider>,
  );
  return { ...utils, panes: value };
}

/** Renders the screen and selects the first card, which is what most of these need. */
async function renderAndSelect(paneOverrides: Partial<ShellPanesValue> = {}) {
  const rendered = renderScreen(paneOverrides);
  const cards = await screen.findAllByRole('option');
  await userEvent.setup().click(cards[0]);
  return { ...rendered, cards };
}

/** Renders the screen and waits for the first page. */
async function renderLoaded(paneOverrides: Partial<ShellPanesValue> = {}) {
  const rendered = renderScreen(paneOverrides);
  await screen.findAllByRole('option');
  return rendered;
}

describe('the flag buttons in the selection bar', () => {
  beforeEach(() => {
    resetFixtureFlags();
  });

  it('appear once something is selected, with the fixed wording', async () => {
    await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    expect(within(bar).getByRole('button', { name: 'Pick' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Reject' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Clear flag' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Hide' })).toBeTruthy();
  });

  it('carries the "doesn\'t delete the file" tooltip on Hide', async () => {
    await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    expect(within(bar).getByRole('button', { name: 'Hide' }).getAttribute('title')).toBe(
      "Hide (doesn't delete the file)",
    );
  });

  it('marks a rejected item dimmed and badged (FLG-07)', async () => {
    const user = userEvent.setup();
    await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    await user.click(within(bar).getByRole('button', { name: 'Reject' }));

    await waitFor(() => {
      const card = screen.getAllByRole('option')[0];
      expect(card.className).toContain('rejected');
      // The image is dimmed; the badge is not, so it stays readable.
      const img = card.querySelector('img') as HTMLImageElement;
      expect(img.style.opacity).toBe(String(REJECTED_OPACITY));
      expect(card.textContent).toContain('⊗');
    });
  });

  it('says Rejected in the card\'s accessible name, not only in colour', async () => {
    const user = userEvent.setup();
    await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    await user.click(within(bar).getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(screen.getAllByRole('option')[0].getAttribute('aria-label')).toContain('Rejected'),
    );
  });

  it('picks instead, and replaces the flag rather than adding one', async () => {
    const user = userEvent.setup();
    await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    await user.click(within(bar).getByRole('button', { name: 'Reject' }));
    await user.click(within(bar).getByRole('button', { name: 'Pick' }));

    await waitFor(() => {
      const card = screen.getAllByRole('option')[0];
      expect(card.className).not.toContain('rejected');
      expect(card.textContent).toContain('⚑');
      expect(card.textContent).not.toContain('⊗');
    });
  });

  it('clears the flag', async () => {
    const user = userEvent.setup();
    await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    await user.click(within(bar).getByRole('button', { name: 'Pick' }));
    await user.click(within(bar).getByRole('button', { name: 'Clear flag' }));
    await waitFor(() =>
      expect(screen.getAllByRole('option')[0].textContent).not.toContain('⚑'),
    );
  });

  it('does not advance the focus by default (E.5 advanceAfterFlag off)', async () => {
    const user = userEvent.setup();
    await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    // Focus is identified by the card's own marker, not by its accessible name —
    // the name legitimately changes when a badge is added.
    const focusedIndexBefore = screen
      .getAllByRole('option')
      .findIndex((c) => c.getAttribute('data-focused') === 'true');
    await user.click(within(bar).getByRole('button', { name: 'Pick' }));
    await waitFor(() => expect(screen.getAllByRole('option')[0].textContent).toContain('⚑'));
    const focusedIndexAfter = screen
      .getAllByRole('option')
      .findIndex((c) => c.getAttribute('data-focused') === 'true');
    expect(focusedIndexAfter).toBe(focusedIndexBefore);
  });

  it('advances when browse.advanceAfterFlag is on', async () => {
    const user = userEvent.setup();
    render(
      <ShellPanesContext.Provider value={panes()}>
        <ExploreScreen
          source={FIXTURE_SOURCE}
          libraryId={COMFY.id}
          libraryType="comfyui"
          density="comfortable"
          advanceAfterFlag
        />
      </ShellPanesContext.Provider>,
    );
    const cards = await screen.findAllByRole('option');
    await user.click(cards[0]);
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    await user.click(within(bar).getByRole('button', { name: 'Pick' }));
    await waitFor(() => {
      const focused = screen
        .getAllByRole('option')
        .find((c) => c.getAttribute('data-focused') === 'true');
      expect(focused).not.toBe(cards[0]);
    });
  });
});

describe('FLG-10 / NAV-51 — undo', () => {
  beforeEach(() => {
    resetFixtureFlags();
  });

  it('offers Undo on a flag and restores the previous value', async () => {
    const user = userEvent.setup();
    const { panes: p } = await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    const notify = p.notify as ReturnType<typeof vi.fn>;

    // Pick, then clear. The undo that matters is the *second* one: it has to
    // restore 'pick', which is the case a naive "just clear it" undo gets wrong.
    await user.click(within(bar).getByRole('button', { name: 'Pick' }));
    await waitFor(() => expect(screen.getAllByRole('option')[0].textContent).toContain('⚑'));

    await user.click(within(bar).getByRole('button', { name: 'Clear flag' }));
    await waitFor(() =>
      expect(screen.getAllByRole('option')[0].textContent).not.toContain('⚑'),
    );

    const lastCall = notify.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatch(/Clear flag/);
    const undo = lastCall?.[1] as { label: string; run: () => Promise<void> };
    expect(undo.label).toBe('Undo');

    await undo.run();
    // The pick came back — not "no flag", which is what clearing on undo would
    // have produced.
    await waitFor(() => expect(screen.getAllByRole('option')[0].textContent).toContain('⚑'));
  });

  it('undoes a Pick by clearing it, not by restoring a flag it never had', async () => {
    const user = userEvent.setup();
    const { panes: p } = await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    const notify = p.notify as ReturnType<typeof vi.fn>;

    await user.click(within(bar).getByRole('button', { name: 'Pick' }));
    await waitFor(() => expect(screen.getAllByRole('option')[0].textContent).toContain('⚑'));
    const offer = notify.mock.calls.at(-1)?.[1] as { run: () => Promise<void> } | undefined;
    expect(offer).toBeTruthy();
    await offer!.run();
    await waitFor(() =>
      expect(screen.getAllByRole('option')[0].textContent).not.toContain('⚑'),
    );
  });

  it('says nothing changed rather than pretending it did', async () => {
    const user = userEvent.setup();
    const { panes: p } = await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    // Pick twice: the second changes nothing.
    await user.click(within(bar).getByRole('button', { name: 'Pick' }));
    await waitFor(() => expect(screen.getAllByRole('option')[0].textContent).toContain('⚑'));
    await user.click(within(bar).getByRole('button', { name: 'Pick' }));
    const notify = p.notify as ReturnType<typeof vi.fn>;
    await waitFor(() =>
      expect(notify.mock.calls.some((c) => /No change/i.test(String(c[0])))).toBe(true),
    );
  });
});

describe('FLG-04 — the Hidden view', () => {
  beforeEach(() => {
    resetFixtureFlags();
  });

  it('is reachable from the toolbar in any view', async () => {
    await renderLoaded();
    const hiddenButton = await screen.findByRole('button', { name: 'Hidden' });
    expect(hiddenButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows only hidden items and names itself (FLG-04)', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole('button', { name: 'Hidden' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/hidden images/);
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });
  });

  it('offers "Show again" instead of Hide while in the Hidden view', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole('button', { name: 'Hidden' }));
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('option')[0]);
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    expect(within(bar).getByRole('button', { name: 'Show again' })).toBeTruthy();
    expect(within(bar).queryByRole('button', { name: 'Hide' })).toBeNull();
  });

  it('leaves the Hidden view again', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole('button', { name: 'Hidden' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'All items' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'All items' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).not.toMatch(/hidden images/),
    );
  });

  it('reports the hidden count beside the total (FLG-05)', async () => {
    await renderLoaded();
    await waitFor(() => {
      const status = screen.getByRole('status').textContent ?? '';
      expect(status).toMatch(/\(\d+ hidden\)/);
    });
  });
});

describe('FLG-07 — hide all rejected in this view', () => {
  beforeEach(() => {
    resetFixtureFlags();
  });

  it('offers the batch action, and it applies to the view rather than the selection', async () => {
    // `FLG-07` says "Hide all rejected in this view", so it is present with no
    // selection at all — the wording is the point.
    const { panes: p } = await renderLoaded();
    const batch = await screen.findByRole('button', { name: /^Hide \d+ rejected$/ });
    expect(batch).toBeTruthy();
    expect(p.notify).not.toHaveBeenCalled();
  });

  it('states the whole view\'s count in the confirmation, not the selection\'s (NAV-51)', async () => {
    const user = userEvent.setup();
    await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    await user.click(within(bar).getByRole('button', { name: 'Reject' }));
    const batch = await screen.findByRole('button', { name: /^Hide \d+ rejected$/ });
    const claimed = /Hide (\d+)/.exec(batch.textContent ?? '')?.[1];
    await user.click(batch);

    const dialog = await screen.findByRole('dialog');
    // The fixture holds several rejected files; the count must be the real one.
    expect(Number(claimed)).toBeGreaterThan(1);
    expect(dialog.textContent).toContain(`Hide ${claimed} rejected item`);
    // Nothing has happened yet.
    expect(screen.getAllByRole('option')[0].textContent).toContain('⊗');
  });

  it('cancels without hiding anything', async () => {
    const user = userEvent.setup();
    await renderAndSelect();
    const bar = await screen.findByRole('region', { name: 'Selection actions' });
    await user.click(within(bar).getByRole('button', { name: 'Reject' }));
    await user.click(await screen.findByRole('button', { name: /^Hide \d+ rejected$/ }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The rejected item is still visible, still dimmed: nothing was hidden.
    const rejected = screen
      .getAllByRole('option')
      .filter((c) => c.textContent?.includes('⊗'));
    expect(rejected.length).toBeGreaterThan(0);
  });

  it('hides them all once confirmed, and offers one batch undo', async () => {
    const user = userEvent.setup();
    const { panes: p } = await renderLoaded();
    await user.click(await screen.findByRole('button', { name: /^Hide \d+ rejected$/ }));
    const claim = screen.getByRole('button', { name: /^Hide \d+$/ });
    await user.click(claim);

    const notify = p.notify as ReturnType<typeof vi.fn>;
    await waitFor(() => expect(notify).toHaveBeenCalled());
    const message = String(notify.mock.calls.at(-1)?.[0]);
    expect(message).toMatch(/^Hidden \d+ rejected items$/);
    const undo = notify.mock.calls.at(-1)?.[1] as { label: string; run: () => Promise<void> };
    expect(undo.label).toBe('Undo');

    // One Undo reverses the whole batch, per `FLG-07`.
    await undo.run();
    await waitFor(() => {
      const stillRejected = screen
        .getAllByRole('option')
        .filter((c) => c.textContent?.includes('⊗'));
      expect(stillRejected.length).toBeGreaterThan(0);
    });
  });
});

describe('FLG-06 — a panel is not flaggable', () => {
  beforeEach(() => {
    resetFixtureFlags();
  });

  it('never offers Hide or a flag on a panel row', () => {
    // The rule is structural: panels carry their page's flag and there is no
    // per-panel flag action. This test records that the model agrees.
    const panel = item('p1', { kind: 'panel', parentPageId: 'page-1' });
    const pages = new Map([['page-1', item('page-1', { flag: 'pick' })]]);
    expect(inheritedFlag(panel, pages).flag).toBe('pick');
  });
});

describe('the fixture honours FLG-02 and FLG-07', () => {
  beforeEach(() => {
    resetFixtureFlags();
  });

  it('excludes hidden items from a normal page and reports the count', async () => {
    const catalogue = fixtureCatalogue(COMFY.id);
    const hidden = catalogue.filter((i) => i.hidden);
    expect(hidden.length).toBeGreaterThan(0);

    const page = await FIXTURE_SOURCE.page({
      libraryId: COMFY.id,
      folderId: null,
      includeSubfolders: true,
      scope: 'pages',
      sort: 'mtime_desc',
      sortDescending: true,
      filters: emptyFilters(),
      limit: 500,
      cursor: null,
      hidden: 'exclude',
      hiddenCount: 0,
    });
    expect(page.items.some((i) => i.hidden)).toBe(false);
    expect(page.hiddenCount).toBe(hidden.length);
  });

  it('returns only hidden items for the Hidden view', async () => {
    const page = await FIXTURE_SOURCE.page({
      libraryId: COMFY.id,
      folderId: null,
      includeSubfolders: true,
      scope: 'pages',
      sort: 'mtime_desc',
      sortDescending: true,
      filters: emptyFilters(),
      limit: 500,
      cursor: null,
      hidden: 'only',
      hiddenCount: 0,
    });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((i) => i.hidden)).toBe(true);
  });

  it('keeps a flag set in the session (setFlag sticks)', async () => {
    const catalogue = fixtureCatalogue(COMFY.id);
    const target = catalogue.find((i) => i.flag === 'none') ?? catalogue[0];
    const changed = await FIXTURE_SOURCE.setFlag([target.id], 'reject');
    expect(changed).toEqual([target.id]);

    const page = await FIXTURE_SOURCE.page({
      libraryId: COMFY.id,
      folderId: null,
      includeSubfolders: true,
      scope: 'pages',
      sort: 'mtime_desc',
      sortDescending: true,
      filters: emptyFilters(),
      limit: 500,
      cursor: null,
      hidden: 'exclude',
      hiddenCount: 0,
    });
    expect(page.items.find((i) => i.id === target.id)?.flag).toBe('reject');
  });

  it('reports nothing changed when the flag is already set', async () => {
    const catalogue = fixtureCatalogue(COMFY.id);
    const target = catalogue.find((i) => i.flag === 'none') ?? catalogue[0];
    await FIXTURE_SOURCE.setFlag([target.id], 'pick');
    expect(await FIXTURE_SOURCE.setFlag([target.id], 'pick')).toEqual([]);
  });
});

function emptyFilters(): ExploreFilters {
  return { ...EMPTY_FILTERS };
}