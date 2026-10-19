import { thumbUrl, fileUrl } from '../../app/format';
import type { ImageRecord } from '../../types';

const cell = (v: unknown) => (v == null || v === '' ? '—' : String(v));

/**
 * Compact selection summary for the sidebar.
 *
 * Deliberately cheap: it renders from the record already held by the result
 * grid and issues no request, so clicking through results stays instant. Use
 * the double-click viewer for the full image and the complete detail record.
 */
export function PreviewSidebar({ record }: { record: ImageRecord | null }) {
  if (!record) {
    return (
      <p className="empty">
        Select an image to preview it.
        <br />
        Double-click for the full image and all details.
      </p>
    );
  }

  const url = fileUrl(record.canonical_path) ?? thumbUrl(record);

  return (
    <div className="inspector-body">
      {url ? (
        <img className="inspector-thumb" src={url} alt={record.filename} style={{ maxHeight: '300px', objectFit: 'contain', width: '100%' }} />
      ) : (
        <p className="noimg">no thumbnail</p>
      )}
      <dl className="kv">
        {(
          [
            ['File', record.filename],
            ['Size', record.width && record.height ? `${record.width} × ${record.height}` : '—'],
            ['Positive prompt', cell(record.positive_prompt)],
            ['Negative prompt', cell(record.negative_prompt)],
            ['Checkpoint', cell(record.checkpoint)],
            ['Sampler', cell(record.sampler)],
            ['Seed', cell(record.seed)],
            ['Metadata', record.metadata_status],
          ] as Array<[string, string]>
        ).map(([k, v]) => (
          <div className="kv-row" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">Double-click for the full image and all details.</p>
    </div>
  );
}