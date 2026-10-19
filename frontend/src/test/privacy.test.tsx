// covers: PRV-01, PRV-02, PRV-03, PRV-04, PRV-05, PRV-06, PRV-07, PRV-08, PRV-09, PRV-10, NAV-41, NAV-42, NAV-43, STA-02, STA-03, STA-04, STA-05, STA-06
/**
 * Privacy blur (design Appendix E.3, `PRV-01`–`PRV-10`).
 *
 * The tests are arranged around the property that matters most: this is a
 * **display mask**, not security. Several of them assert what it does *not* do,
 * because an implementation that quietly made it into encryption would pass every
 * "is the image blurred" test and be worse than useless.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_BLUR_RADIUS,
  DEFAULT_PRIVACY,
  MAX_BLUR_RADIUS,
  MIN_BLUR_RADIUS,
  MASK,
  MaskedText,
  NO_HOLD_TO_REVEAL,
  PRIVACY_SETTINGS_DESCRIPTION,
  PrivacyProvider,
  privacyImageStyle,
  usePrivacy,
} from '../app/privacy';
import { PrivacyImage } from '../components/ui/PrivacyImage';

/** Renders the toggle and reports the current state through the DOM. */
function Toggle() {
  const privacy = usePrivacy();
  return (
    <>
      <button type="button" onClick={privacy.toggle}>
        toggle
      </button>
      <span data-testid="state">{privacy.on ? 'on' : 'off'}</span>
    </>
  );
}

/** Renders a probe that reports whether one item is masked. */
function Probe({ reveal }: { reveal: string }) {
  const privacy = usePrivacy();
  return <span data-testid={reveal}>{privacy.isImageMasked(reveal) ? 'blur' : 'clear'}</span>;
}

describe('PRV-09 — what this is, stated up front', () => {
  it('says in the Settings copy that it protects nothing', () => {
    expect(PRIVACY_SETTINGS_DESCRIPTION).toContain("doesn't encrypt anything");
    expect(PRIVACY_SETTINGS_DESCRIPTION).toMatch(/screenshots/);
    expect(PRIVACY_SETTINGS_DESCRIPTION).toMatch(/screen sharing/);
    expect(PRIVACY_SETTINGS_DESCRIPTION).toMatch(/Alt\+Tab/);
    expect(PRIVACY_SETTINGS_DESCRIPTION).toMatch(/exported files/);
  });

  it('registers that same sentence as the Privacy category hint', async () => {
    const { CATEGORY_HINT, CATEGORY_LABEL } = await import('../settings/registry');
    expect(CATEGORY_HINT.privacy).toBe(PRIVACY_SETTINGS_DESCRIPTION);
    expect(CATEGORY_LABEL.privacy).toBe('Privacy');
  });

  it('registers the four `privacy.*` keys of E.5 with the documented defaults', async () => {
    const { SETTINGS_REGISTRY, SETTINGS_BY_KEY } = await import('../settings/registry');
    expect(SETTINGS_BY_KEY.get('privacy.mode')?.default).toBe('blur');
    expect(SETTINGS_BY_KEY.get('privacy.blurRadius')?.default).toBe(24);
    expect(SETTINGS_BY_KEY.get('privacy.startBlurred')?.default).toBe(false);
    expect(SETTINGS_BY_KEY.get('privacy.autoBlurOnBlur')?.default).toBe(false);
    expect(SETTINGS_BY_KEY.get('privacy.hideText')?.default).toBe(false);
    // `PRV-03`: the radius range is 8-48.
    expect(SETTINGS_BY_KEY.get('privacy.blurRadius')?.constraints).toMatchObject({
      min: 8,
      max: 48,
    });
    // `E.5` also introduces `table.columns`, which `TBL-06` needs.
    expect(SETTINGS_REGISTRY.some((s) => s.key === 'table.columns')).toBe(true);
  });

  it('registers E.5\'s viewMode and advanceAfterFlag', async () => {
    const { SETTINGS_BY_KEY } = await import('../settings/registry');
    expect(SETTINGS_BY_KEY.get('browse.viewMode')?.default).toBe('grid');
    expect(SETTINGS_BY_KEY.get('browse.advanceAfterFlag')?.default).toBe(false);
  });
});

describe('PRV-01 — the toggle', () => {
  it('is off by default', () => {
    render(
      <PrivacyProvider>
        <Toggle />
      </PrivacyProvider>,
    );
    expect(screen.getByTestId('state').textContent).toBe('off');
  });

  it('starts blurred when privacy.startBlurred is on (PRV-04)', () => {
    render(
      <PrivacyProvider settings={{ ...DEFAULT_PRIVACY, startBlurred: true }}>
        <Toggle />
      </PrivacyProvider>,
    );
    // The first frame is already masked: no click happened first.
    expect(screen.getByTestId('state').textContent).toBe('on');
  });

  it('flips on and off', async () => {
    const user = userEvent.setup();
    render(
      <PrivacyProvider>
        <Toggle />
      </PrivacyProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('state').textContent).toBe('on');
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('state').textContent).toBe('off');
  });
});

describe('PRV-03 — the two modes differ in kind', () => {
  it('applies a compositing blur in blur mode', () => {
    const style = privacyImageStyle({ ...DEFAULT_PRIVACY, mode: 'blur', on: true, blurRadius: 24 } as never);
    expect(style).toEqual({ filter: 'blur(24px)' });
  });

  it('applies no filter in colour mode, because the image is not loaded at all', () => {
    const style = privacyImageStyle({ ...DEFAULT_PRIVACY, mode: 'colour', on: true } as never);
    expect(style).toBeUndefined();
  });

  it('clamps the radius to the documented 8-48 range', () => {
    const at = (r: number) =>
      privacyImageStyle({ ...DEFAULT_PRIVACY, mode: 'blur', on: true, blurRadius: r } as never);
    expect(at(2)).toEqual({ filter: `blur(${MIN_BLUR_RADIUS}px)` });
    expect(at(500)).toEqual({ filter: `blur(${MAX_BLUR_RADIUS}px)` });
    expect(at(DEFAULT_BLUR_RADIUS)).toEqual({ filter: 'blur(24px)' });
  });
});

describe('PRV-02 / PRV-10 — masking an image surface', () => {
  it('leaves the image alone while the mask is off', () => {
    render(
      <PrivacyProvider>
        <PrivacyImage src="a.png" alt="" itemId="i1" />
      </PrivacyProvider>,
    );
    const el = document.querySelector('img') as HTMLImageElement;
    expect(el.getAttribute('data-privacy')).toBe('clear');
    expect(el.style.filter).toBe('');
  });

  it('blurs while the mask is on but keeps the src (PRV-10)', async () => {
    const user = userEvent.setup();
    render(
      <PrivacyProvider settings={{ ...DEFAULT_PRIVACY, startBlurred: true }}>
        <Toggle />
        <PrivacyImage src="a.png" alt="" itemId="i1" />
      </PrivacyProvider>,
    );
    const img = document.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('data-privacy')).toBe('blur');
    expect(img.style.filter).toBe('blur(24px)');
    // `PRV-10`: blur must not delay or cancel the request.
    expect(img.getAttribute('src')).toBe('a.png');
    void user;
  });

  it('issues NO image request in colour mode (PRV-03)', () => {
    render(
      <PrivacyProvider settings={{ ...DEFAULT_PRIVACY, startBlurred: true, mode: 'colour' }}>
        <PrivacyImage src="a.png" alt="A portrait" itemId="i1" />
      </PrivacyProvider>,
    );
    // The point of colour mode: the bytes never arrive. A component that set an
    // empty src and hoped would still be requesting something.
    expect(document.querySelector('img')).toBeNull();
    const swatch = screen.getByRole('img', { name: 'A portrait' });
    expect(swatch.getAttribute('data-privacy')).toBe('colour');
  });

  it('shows the fallback rather than a broken image when there is no src', () => {
    render(
      <PrivacyProvider>
        <PrivacyImage src={null} alt="" itemId="i1" fallback={<span>File missing</span>} />
      </PrivacyProvider>,
    );
    expect(screen.getByText('File missing')).toBeTruthy();
  });

  it('records the masked state so a screenshot can tell it from a failure', () => {
    render(
      <PrivacyProvider settings={{ ...DEFAULT_PRIVACY, startBlurred: true }}>
        <PrivacyImage src="a.png" alt="" itemId="i1" />
      </PrivacyProvider>,
    );
    expect(document.querySelector('[data-privacy="blur"]')).toBeTruthy();
  });
});

describe('PRV-06 — revealing one item', () => {
  it('reveals that item and no other', async () => {
    const user = userEvent.setup();
    render(
      <PrivacyProvider settings={{ ...DEFAULT_PRIVACY, startBlurred: true }}>
        <PrivacyImage src="a.png" alt="" itemId="i1" revealable />
        <PrivacyImage src="b.png" alt="" itemId="i2" revealable />
        <Probe reveal="i1" />
        <Probe reveal="i2" />
      </PrivacyProvider>,
    );
    await user.click(screen.getAllByRole('button', { name: 'Reveal' })[0]);
    expect(screen.getByTestId('i1').textContent).toBe('clear');
    expect(screen.getByTestId('i2').textContent).toBe('blur');
  });

  it('clears every reveal when blur is toggled', async () => {
    const user = userEvent.setup();
    render(
      <PrivacyProvider settings={{ ...DEFAULT_PRIVACY, startBlurred: true }}>
        <PrivacyImage src="a.png" alt="" itemId="i1" revealable />
        <Toggle />
        <Probe reveal="i1" />
      </PrivacyProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(screen.getByTestId('i1').textContent).toBe('clear');
    // Turning the mask off and on again must end every reveal: a reveal that
    // survived would be one the user believes they ended.
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('i1').textContent).toBe('blur');
  });

  it('has no hold-to-reveal, by design', () => {
    expect(NO_HOLD_TO_REVEAL).toMatch(/No hold-to-reveal/);
  });
});

describe('PRV-08 — sensitive folders', () => {
  it('masks a sensitive folder\'s items even while the global mask is off', async () => {
    const user = userEvent.setup();
    render(
      <PrivacyProvider>
        <ToggleSensitive />
        <Sensitive />
      </PrivacyProvider>,
    );
    // `PRV-08`: independent of the global toggle, which is still off here.
    expect(screen.getByTestId('sensitive').textContent).toBe('clear,clear');
    await user.click(screen.getByRole('button', { name: 'mark on' }));
    expect(screen.getByTestId('sensitive').textContent).toBe('blur,clear');
  });

  it('does not mask a sensitive folder after it is unmarked', async () => {
    const user = userEvent.setup();
    render(
      <PrivacyProvider>
        <ToggleSensitive />
        <Sensitive />
      </PrivacyProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'mark on' }));
    expect(screen.getByTestId('sensitive').textContent).toBe('blur,clear');
    await user.click(screen.getByRole('button', { name: 'mark off' }));
    expect(screen.getByTestId('sensitive').textContent).toBe('clear,clear');
  });

  it('still masks a sensitive folder while the global mask is on', async () => {
    const user = userEvent.setup();
    render(
      <PrivacyProvider settings={{ ...DEFAULT_PRIVACY, startBlurred: true }}>
        <ToggleSensitive />
        <Sensitive />
      </PrivacyProvider>,
    );
    // Both folders are masked, because the global toggle is on.
    expect(screen.getByTestId('sensitive').textContent).toBe('blur,blur');
    await user.click(screen.getByRole('button', { name: 'mark on' }));
    expect(screen.getByTestId('sensitive').textContent).toBe('blur,blur');
  });
});

function ToggleSensitive() {
  const privacy = usePrivacy();
  return (
    <>
      <button type="button" onClick={() => privacy.markFolderSensitive('f1', true)}>
        mark on
      </button>
      <button type="button" onClick={() => privacy.markFolderSensitive('f1', false)}>
        mark off
      </button>
    </>
  );
}

function Sensitive() {
  const privacy = usePrivacy();
  return (
    <span data-testid="sensitive">
      {privacy.isImageMasked('i1', ['f1']) ? 'blur' : 'clear'},
      {privacy.isImageMasked('i1', ['f2']) ? 'blur' : 'clear'}
    </span>
  );
}

describe('PRV-05 — masking text', () => {
  it('replaces the text with a fixed mask and a Reveal button', async () => {
    const user = userEvent.setup();
    render(
      <PrivacyProvider settings={{ ...DEFAULT_PRIVACY, hideText: true }}>
        <Masked text="portrait-0042.png" revealKey="item:i1:name" />
      </PrivacyProvider>,
    );
    expect(screen.queryByText('portrait-0042.png')).toBeNull();
    expect(screen.getByText(MASK)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(screen.getByText('portrait-0042.png')).toBeTruthy();
  });

  it('keeps one reveal from unmasking another string', async () => {
    const user = userEvent.setup();
    render(
      <PrivacyProvider settings={{ ...DEFAULT_PRIVACY, hideText: true }}>
        <Masked text="first.png" revealKey="a" />
        <Masked text="second.png" revealKey="b" />
      </PrivacyProvider>,
    );
    await user.click(screen.getAllByRole('button', { name: 'Reveal' })[0]);
    expect(screen.getByText('first.png')).toBeTruthy();
    expect(screen.queryByText('second.png')).toBeNull();
  });

  it('does not mask text while privacy.hideText is off', () => {
    render(
      <PrivacyProvider>
        <Masked text="portrait.png" revealKey="a" />
      </PrivacyProvider>,
    );
    expect(screen.getByText('portrait.png')).toBeTruthy();
    expect(screen.queryByText(MASK)).toBeNull();
  });

  it('takes the text out of the DOM rather than covering it', () => {
    // A transparent or off-screen element would leave the filename in the
    // accessibility tree and in a text selection — the opposite of the point.
    render(
      <PrivacyProvider settings={{ ...DEFAULT_PRIVACY, hideText: true }}>
        <Masked text="secret-filename.png" revealKey="a" />
      </PrivacyProvider>,
    );
    expect(document.body.textContent).not.toContain('secret-filename.png');
  });
});

function Masked({ text, revealKey }: { text: string; revealKey: string }) {
  return <MaskedText text={text} revealKey={revealKey} />;
}

describe('PRV-10 — copy while blurred', () => {
  function Suffix() {
    return <span data-testid="suffix">{usePrivacy().copyToastSuffix}</span>;
  }

  it('says the mask is on, so a copy from a blurred screen is not a surprise', () => {
    const { unmount } = render(
      <PrivacyProvider>
        <Suffix />
      </PrivacyProvider>,
    );
    expect(screen.getByTestId('suffix').textContent).toBe('');
    unmount();
    render(
      <PrivacyProvider settings={{ ...DEFAULT_PRIVACY, startBlurred: true }}>
        <Suffix />
      </PrivacyProvider>,
    );
    expect(screen.getByTestId('suffix').textContent).toBe(' (privacy blur is on)');
  });
});

describe('the provider is safe outside its boundary', () => {
  it('reports the mask as off when there is no provider', () => {
    function Bare() {
      const privacy = usePrivacy();
      return <span>{privacy.on ? 'on' : 'off'}</span>;
    }
    render(<Bare />);
    // A harness that forgot to wrap a screen gets a working screen, not a crash.
    expect(screen.getByText('off')).toBeTruthy();
  });

  it('toggles harmlessly outside its boundary', () => {
    function Bare() {
      const privacy = usePrivacy();
      return (
        <button type="button" onClick={privacy.toggle}>
          x
        </button>
      );
    }
    render(<Bare />);
    expect(() => screen.getByRole('button').click()).not.toThrow();
  });
});

describe('the settings screen renders the privacy rows (SET-03)', () => {
  it('has every E.5 privacy row registered with a real control', async () => {
    const { SETTINGS_REGISTRY, SETTINGS_BY_KEY } = await import('../settings/registry');
    const keys = SETTINGS_REGISTRY.filter((s) => s.category === 'privacy').map((s) => s.key);
    // `D-108`: Privacy holds the `privacy.*` keys and nothing else.
    expect(keys).toEqual([
      'privacy.mode',
      'privacy.blurRadius',
      'privacy.startBlurred',
      'privacy.autoBlurOnBlur',
      'privacy.hideText',
    ]);
    // `D-108`: `browse.*` and `table.*` stay in Browsing.
    expect(SETTINGS_BY_KEY.get('table.columns')?.category).toBe('browsing');
    expect(SETTINGS_BY_KEY.get('browse.viewMode')?.category).toBe('browsing');
    expect(SETTINGS_BY_KEY.get('browse.advanceAfterFlag')?.category).toBe('browsing');
    for (const key of keys) {
      const entry = SETTINGS_REGISTRY.find((s) => s.key === key);
      expect(entry?.label.length ?? 0).toBeGreaterThan(0);
      expect(entry?.type).toBeTruthy();
    }
  });

  it('describes the category with the PRV-09 sentence', async () => {
    const { CATEGORY_HINT } = await import('../settings/registry');
    expect(CATEGORY_HINT.privacy).toBe(PRIVACY_SETTINGS_DESCRIPTION);
  });
});