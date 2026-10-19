// covers: SET-01, SET-02, SET-03, SET-04, SET-05, SET-06, SET-07, SET-08, SET-09, SET-10, SET-11, NAV-30, NAV-31, NAV-32, TST-24
/**
 * The Settings screen (design §12.1, `SET-03`, `SET-05`, `SET-08`).
 *
 * The registry and the resolver are unit-tested on their own; this file pins what
 * only the assembled screen can show: the category list, the row anatomy, the
 * control the registry picks for each type, the search box, the honest labelling
 * of what is and is not persisted, and that a mapped change really reaches the
 * backend.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppSettings, LibraryRecord } from '../types';

/**
 * A *stateful* settings mock.
 *
 * The real provider holds `appSettings` in React state and re-renders when
 * `updateAppSetting` succeeds; the store re-reads it. A plain object mock would
 * never re-render, so every write-through change would look like it never
 * happened. This mock reproduces the subscription instead of faking the data.
 */
const updateAppSetting = vi.fn();
const setThumbFit = vi.fn();

vi.mock('../app/providers', async () => {
  const { useCallback, useState } = await import('react');
  const initial = {
    theme: 'dark',
    density: 'comfortable',
    text_scale: 100,
    thumb_fit: 'crop',
    ocr_overlays_visible: true,
    ocr_reading_order_labels: true,
  } as unknown as AppSettings;

  return {
    useLibrary: () => {
      const [appSettings, setAppSettings] = useState<AppSettings>(initial);
      const update = useCallback(async (key: string, value: unknown) => {
        setAppSettings((s) => ({ ...s, [key]: value }) as unknown as AppSettings);
        updateAppSetting(key, value);
      }, []);
      const setFit = useCallback((value: unknown) => {
        setAppSettings((s) => ({ ...s, thumb_fit: value }) as unknown as AppSettings);
        setThumbFit(value);
      }, []);
      return {
        settings: null,
        appSettings,
        thumbFit: appSettings.thumb_fit,
        setThumbFit: setFit,
        updateAppSetting: update,
        libraries: [] as LibraryRecord[],
        libraryId: undefined,
        selectLibrary: vi.fn(),
        refreshLibraries: vi.fn(),
        filters: {},
        facets: null,
        setFilters: vi.fn(),
        clearFilters: vi.fn(),
      };
    },
  };
});

beforeEach(() => {
  updateAppSetting.mockClear();
  setThumbFit.mockClear();
});

vi.mock('../api', () => ({
  api: {
    openDirectory: vi.fn(),
    modelStatus: vi.fn(async () => ({ runtime_status: 'stopped' })),
    embeddingStatus: vi.fn(async () => null),
    onIndexingFinished: vi.fn(async () => () => undefined),
    onIndexingError: vi.fn(async () => () => undefined),
    resetDatabase: vi.fn(),
    backupDatabase: vi.fn(),
    promptExtractionDiagnostics: vi.fn(),
    validateModel: vi.fn(),
    startModel: vi.fn(),
    stopModel: vi.fn(),
    embedPending: vi.fn(),
  },
}));


import { SettingsScreen } from '../features/settings/SettingsScreen';
import { ToastProvider } from '../components/ui';
import { SETTINGS_REGISTRY } from '../settings/registry';

function renderScreen() {
  // The app always mounts the toast viewport (see `App.tsx`), and the import /
  // export flow reports through it, so the harness reproduces that rather than
  // stubbing the hook away.
  return render(
    <ToastProvider>
      <SettingsScreen />
    </ToastProvider>,
  );
}

function row(key: string): HTMLElement {
  const found = document.querySelector(`[data-setting="${key}"]`);
  if (!found) throw new Error(`no row for ${key}`);
  return found as HTMLElement;
}

/**
 * Put a settings document into the import textarea.
 *
 * `userEvent.type` treats `{` and `[` as its own keyboard syntax, so a JSON body
 * has to be set as a value rather than typed character by character.
 */
function setJson(dialog: HTMLElement, settings: Record<string, unknown>) {
  setRaw(
    dialog,
    JSON.stringify({ format: 'comfypanel-settings', version: 1, settings }),
  );
}

function setRaw(dialog: HTMLElement, text: string) {
  fireEvent.change(within(dialog).getByLabelText('Settings JSON'), { target: { value: text } });
}

/** Pick a value in a listbox-backed enum row (three or more options). */
async function chooseEnum(user: ReturnType<typeof userEvent.setup>, key: string, option: string) {
  await user.click(within(row(key)).getByRole('combobox'));
  await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
}

/** Pick a value in a segmented row (the design renders two-option enums this way). */
async function chooseSegment(user: ReturnType<typeof userEvent.setup>, key: string, option: string) {
  await user.click(within(row(key)).getByRole('button', { name: option }));
}

describe('Settings layout (§12.1)', () => {
  it('lists the categories on the left and one pane on the right', () => {
    renderScreen();
    const nav = screen.getByRole('navigation', { name: 'Settings categories' });
    const labels = within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent?.replace(/\d+$/, '').trim());
    expect(labels).toEqual([
      'Appearance',
      'Browsing',
      // `E.5`'s eleventh category, for the `privacy.*` keys.
      'Privacy',
      'Search',
      'Processing',
      'Comics',
      'OCR & review',
      'Models & runtime',
      'Storage',
      'Shortcuts',
      'Advanced & diagnostics',
    ]);
    expect(screen.getByRole('region', { name: 'Appearance settings' })).toBeTruthy();
  });

  it('opens on Appearance and switches categories', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.getByRole('region', { name: 'Appearance settings' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: new RegExp('^Comics') }));
    expect(screen.getByRole('region', { name: 'Comics settings' })).toBeTruthy();
    expect(screen.getByText('Webtoon strip slicing')).toBeTruthy();
    expect(screen.queryByText('Reduce motion')).toBeNull();
  });

  it('shows the documented rows of the Appearance category', () => {
    renderScreen();
    for (const label of [
      'Theme',
      'Accent colour',
      'Custom accent',
      'Density',
      'Text size',
      'Reduce motion',
      'Navigation rail',
      'Show shortcuts in tooltips',
    ]) {
      expect(screen.getByText(label), `missing ${label}`).toBeTruthy();
    }
  });

  it('explains the Shortcuts category instead of hiding it', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Shortcuts' }));
    // §20: v1 shortcuts are generated from the action registry, so the category
    // has no rows and says where they come from rather than appearing broken.
    expect(
      screen.getByText(/Shortcuts are fixed in v1 and generated from the action registry/),
    ).toBeTruthy();
  });
});

describe('row anatomy (SET-03)', () => {
  it('shows label, description, key, scope chip, origin and Reset', () => {
    renderScreen();
    const r = row('appearance.theme');
    expect(within(r).getByText('Theme')).toBeTruthy();
    expect(
      within(r).getByText(/Colour theme\. Windows forced-colours mode overrides tokens/),
    ).toBeTruthy();
    expect(within(r).getByText('appearance.theme')).toBeTruthy();
    // The scope chip shows the current scope and says where the value came from.
    expect(within(r).getByRole('button', { name: 'Theme scope' }).textContent).toContain('Using the');
    expect(within(r).getByRole('button', { name: 'Reset' })).toBeTruthy();
  });

  it('shows the default origin for a setting nobody has set', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    // browse.gridMode has no backend key, so it is genuinely on its default.
    expect(
      within(row('browse.gridMode')).getByRole('button', { name: 'Grid mode scope' }).textContent,
    ).toContain('Using the default.');
  });

  it('disables Reset until something changes', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    const r = row('browse.gridMode');
    const reset = within(r).getByRole('button', { name: 'Reset' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);

    await chooseSegment(user, 'browse.gridMode', 'Rows');
    expect((within(row('browse.gridMode')).getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('marks a changed setting with the modified indicator and origin', async () => {
    const user = userEvent.setup();
    renderScreen();
    await chooseEnum(user, 'appearance.theme', 'Light');
    expect(row('appearance.theme').querySelector('.setting-modified')).toBeTruthy();
    expect(within(row('appearance.theme')).getByRole('button', { name: 'Theme scope' }).textContent).toContain(
      'Using the app value.',
    );
  });

  it('marks the restart-required setting with its chip', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: new RegExp('^Storage') }));
    expect(within(row('storage.dataDir')).getByText('Requires restart')).toBeTruthy();
  });

  it('uses a switch for a boolean, not a checkbox (CTL-04)', async () => {
    const user = userEvent.setup();
    renderScreen();
    const r = row('appearance.shortcutsInTooltips');
    const control = within(r).getByRole('switch', { name: 'Show shortcuts in tooltips' });
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(within(r).queryByRole('checkbox')).toBeNull();
    await user.click(control);
    expect(control.getAttribute('aria-checked')).toBe('false');
  });

  it('picks the control the registry type implies', () => {
    renderScreen();
    // A ranged int is a slider; a long enum is a listbox; a two-value enum is a
    // segmented control; a bool is a switch.
    expect(within(row('appearance.textScale')).getByRole('slider', { name: 'Text size' })).toBeTruthy();
    expect(within(row('appearance.accent')).getByRole('combobox', { name: 'Accent colour' })).toBeTruthy();
    expect(within(row('appearance.rail')).getByRole('combobox', { name: 'Navigation rail' })).toBeTruthy();
    expect(
      within(row('appearance.shortcutsInTooltips')).getByRole('switch', {
        name: 'Show shortcuts in tooltips',
      }),
    ).toBeTruthy();
  });

  it('uses a segmented control where the enum has two values', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    expect(within(row('browse.gridMode')).getByRole('button', { name: 'Rows' })).toBeTruthy();
  });

  it('offers only the scope overrides the entry allows', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(within(row('appearance.theme')).getByRole('button', { name: 'Theme scope' }));
    const menu = screen.getByRole('menu', { name: 'Theme scope' });
    expect(
      within(menu).getByRole('menuitem', { name: /Override for this library/ }).getAttribute('aria-disabled'),
    ).toBe('true');
    expect(
      within(menu).getByRole('menuitem', { name: /Override for this folder/ }).getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('explains why a scope override is unavailable', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    await user.click(within(row('browse.thumbSize')).getByRole('button', { name: 'Thumbnail size scope' }));
    const menu = screen.getByRole('menu', { name: 'Thumbnail size scope' });
    const library = within(menu).getByRole('menuitem', { name: /Override for this library/ });
    expect(library.getAttribute('title')).toMatch(/settings-registry integration/);
  });

  it('shows every scope for a setting that allows all three', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    await user.click(within(row('browse.thumbSize')).getByRole('button', { name: 'Thumbnail size scope' }));
    const menu = screen.getByRole('menu', { name: 'Thumbnail size scope' });
    expect(within(menu).getByRole('menuitem', { name: /Use the app value/ })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /Override for this library/ })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /Override for this folder/ })).toBeTruthy();
  });
});

describe('persistence honesty', () => {
  it('writes a mapped key straight through to the backend', async () => {
    const user = userEvent.setup();
    renderScreen();
    await chooseEnum(user, 'appearance.density', 'Compact');
    expect(updateAppSetting).toHaveBeenCalledWith('density', 'compact');
  });

  it('says plainly that a non-mapped change is held for the session', async () => {
    renderScreen();
    await userEvent.setup().click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    const slider = within(row('browse.thumbSize')).getByRole('slider', { name: 'Thumbnail size' });
    fireEvent.change(slider, { target: { value: '204' } });

    const banner = screen.getByRole('status');
    expect(banner.textContent).toMatch(/held for this session/);
    expect(banner.textContent).toMatch(/Theme, density and text size are saved/);
    // A session-only change must not be written to the backend.
    expect(updateAppSetting).not.toHaveBeenCalled();
  });

  it('shows no pending banner before anything is changed', () => {
    renderScreen();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the legacy thumbnail-fit preference instead of dropping it (SET-11)', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    expect(within(row('legacy.thumb_fit')).getByText('Thumbnail fit')).toBeTruthy();
    expect(
      within(row('legacy.thumb_fit')).getByText(/Not a §12.2 setting; kept so nothing is lost/),
    ).toBeTruthy();
  });
});

describe('search (SET-05)', () => {
  it('narrows the rows and reports a non-match', async () => {
    const user = userEvent.setup();
    renderScreen();
    const search = screen.getByLabelText('Search settings');

    await user.type(search, 'webtoon');
    expect(screen.getByText('Webtoon strip slicing')).toBeTruthy();
    expect(screen.queryByText('Reduce motion')).toBeNull();

    await user.clear(search);
    await user.type(search, 'zzzznotasetting');
    expect(screen.getByText(/No settings match/)).toBeTruthy();
  });

  it('matches on a keyword the label does not contain', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByLabelText('Search settings'), 'webtoon');
    expect(screen.getByText('Long-strip candidate ratio')).toBeTruthy();
  });

  it('jumps to the setting on Enter and highlights it (SET-05)', async () => {
    const user = userEvent.setup();
    renderScreen();
    const search = screen.getByLabelText('Search settings');
    await user.type(search, 'battery aware{Enter}');
    expect(row('proc.batteryAware').className).toMatch(/highlighted/);
  });
});

describe('reset (SET-08)', () => {
  it('resets a whole category after confirmation, leaving others alone', async () => {
    const user = userEvent.setup();
    renderScreen();
    await chooseEnum(user, 'appearance.theme', 'Light');
    await chooseEnum(user, 'appearance.accent', 'Blue');
    expect(row('appearance.accent').querySelector('.setting-modified')).toBeTruthy();

    // A browsing change that must survive the appearance reset.
    await user.click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    await chooseSegment(user, 'browse.gridMode', 'Rows');

    await user.click(screen.getByRole('button', { name: /^Appearance/ }));
    await user.click(screen.getByRole('button', { name: 'Reset category' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Reset Appearance?');
    await user.click(within(dialog).getByRole('button', { name: 'Reset category' }));

    expect(
      within(row('appearance.theme')).queryByLabelText('Changed from the default'),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    expect(row('browse.gridMode').querySelector('.setting-modified')).toBeTruthy();
  });

  it('cancels a reset without changing anything', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    await chooseSegment(user, 'browse.gridMode', 'Rows');

    await user.click(screen.getByRole('button', { name: 'Reset category' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(row('browse.gridMode').querySelector('.setting-modified')).toBeTruthy();
  });
});

describe('profiles (SET-07)', () => {
  const openProcessing = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: new RegExp('^Processing') }));
  };

  it('hosts the Profiles manager under Processing', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.queryByRole('region', { name: 'Processing profiles' })).toBeNull();
    await openProcessing(user);
    expect(screen.getByRole('region', { name: 'Processing profiles' })).toBeTruthy();
  });

  it('offers the three built-ins, read-only, with the active one selected', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openProcessing(user);
    const group = screen.getByRole('radiogroup', { name: 'Active processing profile' });
    // A radio input has no text content of its own; its name comes from the
    // label element that wraps it.
    const labels = within(group)
      .getAllByRole('radio')
      .map((r) => (r.closest('label') as HTMLElement).textContent ?? '');
    expect(labels.some((l) => l.includes('Balanced (built-in)'))).toBe(true);
    expect(labels.some((l) => l.includes('Low power (built-in)'))).toBe(true);
    expect(labels.some((l) => l.includes('Max speed (built-in)'))).toBe(true);
    expect((within(group).getAllByRole('radio')[0] as HTMLInputElement).checked).toBe(true);
  });

  it('applies a profile so its rows change', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openProcessing(user);
    // `proc.idleOnly` defaults to off; Low power's batteryAware is on.
    await user.click(screen.getByRole('radio', { name: /Low power/ }));
    expect(row('proc.batteryAware').querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('creates a profile from the current values and applies it', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openProcessing(user);
    await user.click(screen.getByRole('button', { name: 'Create from current' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Profile name'), 'Evening');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(screen.getByText(/Active profile:/).textContent).toContain('Evening');
    // The name appears twice on purpose: in the radio list and in the list of
    // profiles the user owns.
    expect(screen.getAllByText(/Evening/).length).toBeGreaterThan(1);
  });

  it('refuses a blank or duplicate profile name and says why', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openProcessing(user);
    await user.click(screen.getByRole('button', { name: 'Create from current' }));
    let dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(within(dialog).getByText(/Give the profile a name/)).toBeTruthy();

    await user.type(within(dialog).getByLabelText('Profile name'), 'Balanced');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(within(dialog).getByText(/already exists/)).toBeTruthy();
    void dialog;
  });

  it('renames and deletes a user profile', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openProcessing(user);
    await user.click(screen.getByRole('button', { name: 'Create from current' }));
    // `userEvent.type` treats `{` and `[` as keyboard syntax, so JSON is set as
    // a value rather than typed character by character.
    await user.click(within(screen.getByRole('dialog')).getByLabelText('Profile name'));
    await user.keyboard('Evening');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create' }));

    // A built-in offers no rename or delete.
    const builtInRow = screen.getByText('Balanced (built-in)').closest('label') as HTMLElement;
    expect(within(builtInRow).queryByRole('button', { name: 'Rename' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('New profile name'));
    await user.type(within(dialog).getByLabelText('New profile name'), 'Night');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(screen.getAllByText(/Night/).length).toBeGreaterThan(1);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryAllByText(/Night/)).toHaveLength(0);
  });

  it('offers Save to profile / Save as new / Revert when a value drifts', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openProcessing(user);
    // Create and activate a user profile so "Save to profile" is available.
    await user.click(screen.getByRole('button', { name: 'Create from current' }));
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Profile name'), 'Mine');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create' }));

    // Now change a profile-controlled setting away from the profile's value.
    const idleOnly = row('proc.idleOnly');
    await user.click(within(idleOnly).getByRole('switch', { name: 'Run only when idle' }));

    const affordance = within(row('proc.idleOnly')).getByRole('status');
    expect(affordance.textContent).toMatch(/Profile .* modified/);
    expect(within(affordance).getByRole('button', { name: 'Save to profile' })).toBeTruthy();
    expect(within(affordance).getByRole('button', { name: 'Save as new' })).toBeTruthy();
    expect(within(affordance).getByRole('button', { name: 'Revert' })).toBeTruthy();
  });

  it('Revert restores the profile value', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openProcessing(user);
    await user.click(screen.getByRole('button', { name: 'Create from current' }));
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Profile name'), 'Mine');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create' }));

    const before = within(row('proc.idleOnly')).getByRole('switch', { name: 'Run only when idle' });
    const was = before.getAttribute('aria-checked');
    await user.click(before);
    expect(within(row('proc.idleOnly')).getByRole('switch', { name: 'Run only when idle' }).getAttribute('aria-checked')).not.toBe(
      was,
    );
    await user.click(within(row('proc.idleOnly')).getByRole('button', { name: 'Revert' }));
    expect(within(row('proc.idleOnly')).getByRole('switch', { name: 'Run only when idle' }).getAttribute('aria-checked')).toBe(
      was,
    );
  });

  it('disables Save to profile for a built-in, naming the alternative', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openProcessing(user);
    await user.click(within(row('proc.idleOnly')).getByRole('switch', { name: 'Run only when idle' }));
    const save = within(row('proc.idleOnly')).getByRole('button', { name: 'Save to profile' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(save.getAttribute('title')).toMatch(/read-only/);
  });
});

describe('import and export (SET-06, STA-29)', () => {
  const openTransfer = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /Import \/ export/ }));
    return screen.getByRole('dialog');
  };

  it('exports the changed settings and excludes paths by default', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    await chooseSegment(user, 'browse.gridMode', 'Rows');

    const dialog = await openTransfer(user);
    await user.click(within(dialog).getByRole('button', { name: 'Export' }));
    const field = within(dialog).getByLabelText('Settings JSON') as HTMLTextAreaElement;
    const parsed = JSON.parse(field.value);
    expect(parsed.format).toBe('comfypanel-settings');
    expect(parsed.settings['browse.gridMode']).toBe('rows');
    expect(parsed.includePaths).toBe(false);
    expect(Object.keys(parsed.settings)).not.toContain('storage.dataDir');
  });

  it('includes paths when the checkbox is ticked', async () => {
    const user = userEvent.setup();
    renderScreen();
    const dialog = await openTransfer(user);
    await user.click(within(dialog).getByRole('checkbox', { name: /Include paths/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Export' }));
    const parsed = JSON.parse((within(dialog).getByLabelText('Settings JSON') as HTMLTextAreaElement).value);
    expect(parsed.includePaths).toBe(true);
  });

  it('previews a diff before applying anything', async () => {
    const user = userEvent.setup();
    renderScreen();
    const dialog = await openTransfer(user);
    setJson(dialog, { 'appearance.accent': 'teal' });
    await user.click(within(dialog).getByRole('button', { name: 'Preview import' }));

    const table = within(dialog).getByRole('table');
    expect(within(table).getByText('Accent colour')).toBeTruthy();
    expect(within(table).getByText('teal')).toBeTruthy();
    // Nothing has been applied: the accent row is untouched so far.
    expect(row('appearance.accent').querySelector('.setting-modified')).toBeNull();
  });

  it('lists ignored values with STA-29 wording and still applies the rest', async () => {
    const user = userEvent.setup();
    renderScreen();
    const dialog = await openTransfer(user);
    setJson(dialog, {
      'appearance.accent': 'teal',
      'appearance.textScale': 500,
      'not.a.setting': 1,
    });
    await user.click(within(dialog).getByRole('button', { name: 'Preview import' }));

    const ignored = within(dialog).getByRole('alert');
    expect(ignored.textContent).toMatch(/2 values were ignored/);
    expect(ignored.textContent).toMatch(/not.a.setting/);
    expect(ignored.textContent).toMatch(/appearance.textScale/);

    await user.click(within(dialog).getByRole('button', { name: 'Apply the rest' }));
    expect(row('appearance.accent').querySelector('.setting-modified')).toBeTruthy();
  });

  it('refuses a file that is not a settings document', async () => {
    const user = userEvent.setup();
    renderScreen();
    const dialog = await openTransfer(user);
    setRaw(dialog, 'not json at all');
    await user.click(within(dialog).getByRole('button', { name: 'Preview import' }));
    expect(within(dialog).getByText(/not valid JSON/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Apply the rest' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('keeps Apply disabled until there is something to apply', async () => {
    const user = userEvent.setup();
    renderScreen();
    const dialog = await openTransfer(user);
    expect((within(dialog).getByRole('button', { name: 'Apply the rest' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('round-trips: export, then import the same file', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: new RegExp('^Browsing') }));
    await chooseSegment(user, 'browse.gridMode', 'Rows');

    const dialog = await openTransfer(user);
    await user.click(within(dialog).getByRole('button', { name: 'Export' }));
    const exported = (within(dialog).getByLabelText('Settings JSON') as HTMLTextAreaElement).value;

    await user.click(within(dialog).getByRole('button', { name: 'Preview import' }));
    // The export also carries the keys the backend already stores, so the count is
    // not 1; what matters is that the changed setting appears as a previewed diff.
    expect(within(dialog).getByText(/values? will be applied/)).toBeTruthy();
    expect(within(within(dialog).getByRole('table')).getByText('Grid mode')).toBeTruthy();
    expect(exported).toContain('browse.gridMode');
  });
});

describe('every registry key is reachable (TST-24)', () => {
  it('renders each entry as a real row somewhere in the screen', async () => {
    const user = userEvent.setup();
    renderScreen();
    const categories = [
      'Appearance',
      'Browsing',
      // `E.5`'s eleventh category, for the `privacy.*` keys.
      'Privacy',
      'Search',
      'Processing',
      'Comics',
      'OCR & review',
      'Models & runtime',
      'Storage',
      'Advanced & diagnostics',
    ];
    const seen = new Set<string>();
    for (const c of categories) {
      await user.click(screen.getByRole('button', { name: new RegExp('^' + c) }));
      for (const r of document.querySelectorAll('[data-setting]')) {
        seen.add(r.getAttribute('data-setting') as string);
      }
    }
    const missing = SETTINGS_REGISTRY.map((e) => e.key).filter((k) => !seen.has(k));
    expect(missing).toEqual([]);
  });
});
