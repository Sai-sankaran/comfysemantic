import { privacyImageStyle, usePrivacy } from '../../app/privacy';

/**
 * The one image surface (design `PRV-02`, `PRV-03`, `PRV-10`).
 *
 * Every image in the application should render through this component, because
 * `PRV-02` lists eleven surfaces that must all mask and a per-surface
 * implementation is eleven chances to miss one — and a surface that forgot would
 * look secure while showing the whole image, which is worse than not offering the
 * feature at all.
 *
 * The two modes differ in whether the request happens at all:
 *
 * - `blur` keeps the `src`. `PRV-10` requires that blur never delays or cancels
 *   an image request, and the image has to finish decoding for the compositing
 *   blur to apply to it.
 * - `colour` sets **no `src` at all**. `PRV-03` says colour mode "does not load
 *   or decode images"; that is the whole point of the fallback, and a component
 *   that set an empty `src` and hoped would still be issuing a request.
 */
export type PrivacyImageProps = {
  src: string | null;
  alt: string;
  /** `PRV-08`: the folders this item is in, so a sensitive folder masks it. */
  itemId?: string;
  folderIds?: readonly string[];
  /** Shown instead of the image when it is missing, or in colour mode. */
  fallback?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onError?: () => void;
  /** `PRV-06`: a Reveal button for this one item. */
  revealable?: boolean;
};

export function PrivacyImage({
  src,
  alt,
  itemId,
  folderIds,
  fallback,
  className,
  style,
  onLoad,
  onError,
  revealable = false,
}: PrivacyImageProps) {
  const privacy = usePrivacy();
  const masked = itemId ? privacy.isImageMasked(itemId, folderIds) : privacy.on;
  const colourOnly = masked && privacy.mode === 'colour';
  const revealButton =
    masked && revealable && itemId ? (
      <button
        type="button"
        className="privacy-reveal"
        onClick={() => privacy.reveal(itemId)}
        title="Reveal this item while privacy blur is on"
      >
        Reveal
      </button>
    ) : null;

  if (!src || colourOnly) {
    // In colour mode this is a colour swatch, not a broken image: no `src` is set,
    // so no request is made (`PRV-03`).
    return (
      <span
        className={`privacy-surface${colourOnly ? ' colour' : ''}${className ? ` ${className}` : ''}`}
        style={style}
        data-privacy={colourOnly ? 'colour' : masked ? 'blur' : 'clear'}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
      >
        {fallback}
        {revealButton}
      </span>
    );
  }

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`privacy-surface${className ? ` ${className}` : ''}`}
        style={{ ...(masked ? privacyImageStyle(privacy) : undefined), ...style }}
        data-privacy={masked ? 'blur' : 'clear'}
        onLoad={onLoad}
        onError={onError}
      />
      {/* `PRV-06`: the Reveal is available in *blur* mode too. Offering it only in
          colour mode would mean the common mode has no per-item escape at all. */}
      {revealButton}
    </>
  );
}