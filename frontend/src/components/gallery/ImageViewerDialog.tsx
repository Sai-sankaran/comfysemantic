import { useEffect, useState, type ReactNode } from 'react';
import { Dialog } from '../ui';
import { api } from '../../api';
import { fileUrl, thumbUrl } from '../../app/format';
import type { ImageDetail, ImageRecord } from '../../types';

type Props = {
  record: ImageRecord | null;
  /** Pre-loaded detail, when the caller already has it. */
  detail?: ImageDetail | null;
  onClose: () => void;
  /** Navigate to the previous image in gallery order. */
  onPrevious?: () => void;
  /** Navigate to the next image in gallery order. */
  onNext?: () => void;
  /** Extra actions rendered in the dialog footer, next to Close. */
  footer?: ReactNode;
};

const cell = (v: unknown) => (v == null || v === '' ? '—' : String(v));

/**
 * Full-size image plus the metadata a reviewer needs.
 *
 * This is the double-click target: single click keeps the result list in place
 * and fills the sidebar, while this modal deliberately interrupts so the image
 * can be inspected at full resolution.
 */
export function ImageViewerDialog({ record, detail, onClose, onPrevious, onNext, footer }: Props) {
  const [own, setOwn] = useState<ImageDetail | null>(null);

  // Keyboard navigation: Left/Right arrows navigate, Escape closes.
  // Ignore when the user is typing in an input, textarea, or editable control.
  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.getAttribute('contenteditable') === 'true';
      if (isEditable) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (onPrevious) onPrevious();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (onNext) onNext();
        return;
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [record, onClose, onPrevious, onNext]);

  // Double-click can arrive without a prior single-click, so the viewer may be
  // the first thing to ask for detail. Fetch it rather than showing the summary
  // fields alone; the caller's detail is reused when it matches.
  useEffect(() => {
    if (!record) {
      setOwn(null);
      return;
    }
    let cancelled = false;
    api
      .getImageDetail(record.id)
      .then((d) => {
        if (!cancelled) setOwn(d);
      })
      .catch(() => {
        // A missing detail record must not blank the viewer: the grid record
        // still carries filename, prompts, checkpoint, sampler and seed.
        if (!cancelled) setOwn(null);
      });
    return () => {
      cancelled = true;
    };
  }, [record]);

  const resolved = detail && detail.image?.id === record?.id ? detail : own;

  // Prefer the original file. The thumbnail is a fallback so a missing or
  // unreadable original still shows something instead of an empty frame.
  const url = record ? fileUrl(record.canonical_path) ?? thumbUrl(record) : null;
  const meta = (resolved?.metadata ?? null) as Record<string, unknown> | null;

  const rows: Array<[string, string]> = record
    ? [
        ['Path', record.canonical_path],
        ['Size', record.width && record.height ? `${record.width} × ${record.height}` : '—'],
        ['Positive prompt', cell(meta?.positive_prompt ?? record.positive_prompt)],
        ['Negative prompt', cell(meta?.negative_prompt ?? record.negative_prompt)],
        ['Checkpoint', cell(meta?.checkpoint ?? record.checkpoint)],
        ['LoRAs', cell(meta?.loras)],
        ['Seed', cell(meta?.seed ?? record.seed)],
        [
          'Sampler / scheduler',
          `${cell(meta?.sampler ?? record.sampler)} / ${cell(meta?.scheduler)}`,
        ],
        [
          'Steps / CFG / denoise',
          `${cell(meta?.steps)} / ${cell(meta?.cfg)} / ${cell(meta?.denoise)}`,
        ],
        ['Metadata status', record.metadata_status],
      ]
    : [];

  return (
    <Dialog
      open={record !== null}
      onClose={onClose}
      title={record?.filename ?? 'Image'}
      wide
      footer={
        <>
          {footer}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {record && (
        <div className="preview">
          <div className="preview-media">
            {url ? (
              <img src={url} alt={record.filename} />
            ) : (
              <span className="noimg">preview unavailable</span>
            )}
          </div>
          <div className="preview-body">
            <dl className="kv">
              {rows.map(([k, v]) => (
                <div className="kv-row" key={k}>
                  <dt>{k}</dt>
                  <dd className={k === 'Path' ? 'mono small' : undefined}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </Dialog>
  );
}