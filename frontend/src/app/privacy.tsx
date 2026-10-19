import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { readShellState, writeShellState } from '../platform/transport';

// This module exports the provider, the hook, the constants and `MaskedText`.
// A context module cannot avoid that: the hook has to live beside the context it
// reads, and the constants (`PRV-03`'s radius bounds, `PRV-09`'s sentence) are
// the settings' single source. Splitting them apart to satisfy a Fast Refresh
// boundary would put the same value in two files, which is the failure this file
// exists to prevent.
/* eslint-disable react-refresh/only-export-components -- see above */
/**
 * Privacy blur (design Appendix E.3, `PRV-01`–`PRV-10`).
 *
 * The one thing this must never become is a security control. `PRV-09` says so
 * in the Settings copy and it is repeated in the module comment because it is the
 * most important property here: it masks what is *on screen*, and it does nothing
 * about Alt+Tab previews, screenshots, screen sharing or exported files. An
 * implementation that blurred only the preview thumbnail — leaving the grid clear
 * — would look secure and protect nothing, so the masking is applied through one
 * component that every image surface uses.
 *
 * `PRV-03`'s two modes are different in kind, not in degree:
 *
 * - `blur` (default) applies a CSS blur to the compositing layer. Image requests
 *   are still issued and still complete (`PRV-10`).
 * - `colour` issues **no image request at all** and shows the item's dominant
 *   colour. It is the documented fallback when `blur` cannot hold budget **B5**,
 *   and it is genuinely more private because the bytes never arrive.
 */

/** `PRV-03`: how privacy mode hides images. */
export type PrivacyMode = 'blur' | 'colour';

/** `PRV-05`: what replaces masked text. */
export const MASK = '•••••';

/** `E.5`: `privacy.blurRadius` default 24 px, range 8-48. */
export const DEFAULT_BLUR_RADIUS = 24;
export const MIN_BLUR_RADIUS = 8;
export const MAX_BLUR_RADIUS = 48;

/** `PRV-06`: "There is no hold-a-key reveal." The word is deliberate. */
export const NO_HOLD_TO_REVEAL = 'No hold-to-reveal: blur is a mask, not a lock.';

export type PrivacySettings = {
  mode: PrivacyMode;
  blurRadius: number;
  hideText: boolean;
  startBlurred: boolean;
  autoBlurOnBlur: boolean;
};

export const DEFAULT_PRIVACY: PrivacySettings = {
  mode: 'blur',
  blurRadius: DEFAULT_BLUR_RADIUS,
  hideText: false,
  startBlurred: false,
  autoBlurOnBlur: false,
};

/**
 * `PRV-04` / `ARC-13`: the launch-time copy of the privacy settings.
 *
 * A module variable rather than `localStorage`, which `ARC-13` and `SET-09`
 * forbid outright so the web and exe builds behave identically. The platform
 * adapter's file read writes here before the first paint; until that is wired,
 * this is empty and the defaults apply — which is safe, because `startBlurred`
 * defaults off and blur defaults off.
 */
let privacyCache: Partial<PrivacySettings> = {};

export function readPrivacyCache(): Partial<PrivacySettings> {
  return privacyCache;
}

export function cachePrivacy(settings: PrivacySettings): void {
  privacyCache = { ...settings };
  // Mirror into the shell-state file so the next launch's first frame is already
  // masked. Fire-and-forget: a failed write leaves the previous state intact.
  void writeShellState({ privacy: { ...settings } });
}

/**
 * Populate the launch-time privacy cache from the shell-state file.
 *
 * Called once, before the first render, so `PRV-04`'s first-frame masking holds.
 * Until this runs the cache is empty and the defaults apply, which is safe
 * (startBlurred defaults to false, so nothing is wrongly masked).
 */
export async function loadPrivacyCache(): Promise<void> {
  try {
    const state = await readShellState();
    if (state?.privacy) {
      privacyCache = { ...state.privacy } as Partial<PrivacySettings>;
    }
  } catch {
    // A failed read leaves the cache empty. Defaults apply; nothing crashes.
  }
}

export type PrivacyValue = PrivacySettings & {
  /** `PRV-01`: whether the mask is applied. */
  on: boolean;
  /** `PRV-01`: the toggle, from the shortcut, the View menu and the palette. */
  toggle: () => void;
  setOn: (on: boolean) => void;
  /**
   * `PRV-08`: folders marked sensitive. Their items are masked regardless of the
   * global toggle.
   */
  sensitiveFolders: ReadonlySet<string>;
  markFolderSensitive: (folderId: string, sensitive: boolean) => void;
  /**
   * Whether this item's image is masked right now.
   *
   * Both `PRV-06`'s per-item reveal and `PRV-08`'s sensitive folders go through
   * here, so no surface can accidentally apply one and forget the other.
   */
  isImageMasked: (itemId: string, folderIds?: readonly string[]) => boolean;
  /** `PRV-06`: un-blur one item for the session. */
  reveal: (itemId: string) => void;
  /** `PRV-05`: a text reveal lasts until the selection changes or blur is toggled. */
  isTextRevealed: (key: string) => boolean;
  revealText: (key: string) => void;
  clearTextReveals: () => void;
  /** `PRV-10`: copy works while blurred, and says so. */
  copyToastSuffix: ' (privacy blur is on)' | '';
};

const PrivacyContext = createContext<PrivacyValue | null>(null);

export function usePrivacy(): PrivacyValue {
  const value = useContext(PrivacyContext);
  // Outside the provider privacy is simply off. A screen must not crash because
  // a harness forgot to wrap it.
  if (value) return value;
  return { ...DEFAULT_PRIVACY, on: false, toggle: () => undefined, setOn: () => undefined,
    sensitiveFolders: new Set(), markFolderSensitive: () => undefined,
    isImageMasked: () => false, reveal: () => undefined, isTextRevealed: () => true,
    revealText: () => undefined, clearTextReveals: () => undefined, copyToastSuffix: '' };
}

export function PrivacyProvider({
  children,
  settings: initialSettings = DEFAULT_PRIVACY,
}: {
  children: ReactNode;
  settings?: PrivacySettings;
}) {
  const [settings] = useState<PrivacySettings>(initialSettings);

  // `PRV-04`: keep the launch cache current so the next launch's first frame is
  // already masked. `cachePrivacy` is a plain module write, not `localStorage`.
  useEffect(() => cachePrivacy(settings), [settings]);
  // `PRV-04`: `privacy.startBlurred` forces blur on at every launch, so the first
  // frame is already masked rather than flashing clear for a moment.
  const [on, setOnState] = useState<boolean>(initialSettings.startBlurred);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
  const [revealedText, setRevealedText] = useState<ReadonlySet<string>>(() => new Set());
  const [sensitiveFolders, setSensitiveFolders] = useState<ReadonlySet<string>>(() => new Set());
  const blurTimer = useRef<number | null>(null);

  /**
   * `PRV-06`: "turning blur off or on again clears all reveals".
   *
   * So the toggle clears both image and text reveals, rather than only the ones it
   * conceptually owns. A reveal that survived a toggle would be a reveal the user
   * believes they ended.
   */
  const setOn = useCallback((next: boolean) => {
    setOnState((current) => {
      if (current !== next) {
        setRevealed(new Set());
        setRevealedText(new Set());
      }
      return next;
    });
  }, []);

  const toggle = useCallback(() => setOn(!on), [on, setOn]);

  const markFolderSensitive = useCallback((folderId: string, sensitive: boolean) => {
    setSensitiveFolders((prev) => {
      const next = new Set(prev);
      if (sensitive) next.add(folderId);
      else next.delete(folderId);
      return next;
    });
  }, []);

  const isImageMasked = useCallback(
    (itemId: string, folderIds: readonly string[] = []) => {
      // `PRV-06`: a revealed item is not masked, whatever else is true.
      if (revealed.has(itemId)) return false;
      if (!on && !sensitiveFolders.size) return false;
      // `PRV-08`: a sensitive folder masks its items regardless of the toggle.
      if (folderIds.some((id) => sensitiveFolders.has(id))) return true;
      return on;
    },
    [on, revealed, sensitiveFolders],
  );

  const reveal = useCallback((itemId: string) => {
    setRevealed((prev) => new Set(prev).add(itemId));
  }, []);

  const isTextRevealed = useCallback(
    (key: string) => !settings.hideText || revealedText.has(key),
    [settings.hideText, revealedText],
  );

  const revealText = useCallback((key: string) => {
    setRevealedText((prev) => new Set(prev).add(key));
  }, []);

  const clearTextReveals = useCallback(() => setRevealedText(new Set()), []);

  // `PRV-07`: auto-blur turns on when the window loses focus or is minimised.
  // It never turns itself off - the user does.
  useEffect(() => {
    if (!settings.autoBlurOnBlur) return undefined;
    const onBlur = () => setOn(true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') setOn(true);
    });
    return () => window.removeEventListener('blur', onBlur);
  }, [settings.autoBlurOnBlur, setOn]);

  useEffect(
    () => () => {
      if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
    },
    [],
  );

  const value = useMemo<PrivacyValue>(
    () => ({
      ...settings,
      on,
      toggle,
      setOn,
      sensitiveFolders,
      markFolderSensitive,
      isImageMasked,
      reveal,
      isTextRevealed,
      revealText,
      clearTextReveals,
      // `PRV-10`: the toast has to say blur is on, or a user who copies an image
      // from a blurred screen may not realise the copy is in the clear.
      copyToastSuffix: on ? ' (privacy blur is on)' : '',
    }),
    [
      settings,
      on,
      toggle,
      setOn,
      sensitiveFolders,
      markFolderSensitive,
      isImageMasked,
      reveal,
      isTextRevealed,
      revealText,
      clearTextReveals,
    ],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

/** The styles an image surface needs, so every surface masks identically. */
export function privacyImageStyle(privacy: PrivacyValue): React.CSSProperties | undefined {
  if (privacy.mode !== 'blur') return undefined;
  const radius = Math.min(Math.max(privacy.blurRadius, MIN_BLUR_RADIUS), MAX_BLUR_RADIUS);
  return { filter: `blur(${radius}px)` };
}

/** `PRV-09`: the wording the Settings row must use. */
export const PRIVACY_SETTINGS_DESCRIPTION =
  "Display mask only. It doesn't encrypt anything and doesn't affect screenshots, screen sharing, Alt+Tab previews or exported files.";

/**
 * `PRV-05`: text masking.
 *
 * Filenames, folder paths, prompts, negative prompts, OCR text and notes are
 * replaced by a fixed mask with a **Reveal** button. The reveal is per-string and
 * lasts until the selection changes or blur is toggled, which is why the key is
 * passed in rather than derived: two different items' filenames must not share
 * one reveal.
 *
 * The masked text is *absent from the DOM*, not just visually covered. A
 * `text-indent: -9999px` or a transparent colour would leave the filename in the
 * accessibility tree and in a text selection — which is the opposite of what
 * someone turned this on for.
 */
export function MaskedText({
  text,
  revealKey,
  as: Tag = 'span',
  className,
}: {
  text: string;
  /** Unique per string, so one reveal does not unmask another. */
  revealKey: string;
  as?: 'span' | 'div' | 'p' | 'dd' | 'li';
  className?: string;
}) {
  const privacy = usePrivacy();
  if (privacy.isTextRevealed(revealKey)) {
    return <Tag className={className}>{text}</Tag>;
  }
  return (
    <Tag className={className}>
      <span className="privacy-mask" aria-label="Hidden by privacy blur">
        {MASK}
      </span>
      <button type="button" className="privacy-reveal" onClick={() => privacy.revealText(revealKey)}>
        Reveal
      </button>
    </Tag>
  );
}