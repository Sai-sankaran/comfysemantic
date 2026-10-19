import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

/**
 * Stack of currently-open dialogs, oldest first.
 *
 * Every dialog installs its own capture-phase `keydown` listener on the same
 * `document` node. `stopPropagation()` cannot stop a sibling listener on the
 * same node, so with two dialogs open one Escape press closed both - which
 * unmounted whatever the outer dialog was showing, mid-interaction. Only the
 * topmost dialog may react to Escape.
 */
const dialogStack: symbol[] = [];

export function Dialog({ open, onClose, title, children, footer, wide }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const idRef = useRef<symbol | null>(null);
  if (!idRef.current) idRef.current = Symbol('dialog');

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
    return () => restoreFocusRef.current?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = idRef.current!;
    dialogStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the topmost dialog closes, so a confirm dialog layered over a
      // preview does not tear the preview down underneath it.
      if (dialogStack[dialogStack.length - 1] !== id) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const i = dialogStack.lastIndexOf(id);
      if (i >= 0) dialogStack.splice(i, 1);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="overlay" role="presentation">
      <div
        ref={panelRef}
        className={wide ? 'dialog dialog-wide' : 'dialog'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialog-header">
          <h2>{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}