import { useEffect, useState } from 'react';
import type { ImageDetail, ImageRecord, PromptDirection, PromptExplanation } from '../../types';
import { api } from '../../api';
import { thumbUrl, fileUrl } from '../../app/format';
import { Button } from '../../components/ui';

function StatusPill({ value }: { value: string | null | undefined }) {
  const map: Record<string, string> = {
    parsed: 'ok',
    partial: 'warn',
    absent: 'muted',
    malformed: 'warn',
    error: 'bad',
    failed: 'bad',
    ready: 'ok',
    pending: 'muted',
    not_applicable: 'muted',
  };
  const tone = map[value ?? ''] ?? 'muted';
  return <span className={`pill pill-${tone}`}>{value ?? 'unknown'}</span>;
}

function DirectionRow({ label, dir }: { label: string; dir: PromptDirection | null | undefined }) {
  if (!dir) return <p className="empty">{label}: no diagnostic available.</p>;

  // The backend sends a full explanation when it had raw graphs to walk, and a
  // reduced stored-details object otherwise. Every field below is therefore
  // optional, and dereferencing one that is absent used to throw during render
  // - blanking the app with no error boundary in the tree.
  const path = dir.path ?? dir.trace ?? [];
  const candidateCount = dir.candidate_count ?? dir.candidates?.length ?? 0;
  const valueLength = dir.value_length ?? (dir.value?.length ?? 0);

  const tone =
    dir.state === 'exact' || dir.state === 'resolved_from_connection'
      ? 'ok'
      : dir.state === 'absent'
        ? 'muted'
        : 'warn';
  return (
    <div className="diag-direction">
      <div className="diag-head">
        <strong>{label}</strong>
        <span className={`pill pill-${tone}`}>{dir.state}</span>
        {dir.container && <span className="pill pill-muted">container: {dir.container}</span>}
        {dir.exact !== undefined && (
          <span className="pill pill-muted">
            {dir.exact ? 'exact' : dir.ambiguous ? 'ambiguous' : 'not resolved'}
          </span>
        )}
        {candidateCount > 0 && (
          <span className="pill pill-muted">{candidateCount} candidate(s)</span>
        )}
        <span className="pill pill-muted">
          {valueLength} chars{dir.value_truncated ? ' (truncated preview)' : ''}
        </span>
      </div>
      {path.length > 0 && <pre className="raw small">{path.join('\n')}</pre>}
      {dir.note && <p className="hint">{dir.note}</p>}
    </div>
  );
}

export function Inspector({ detail, record }: { detail: ImageDetail | null; record: ImageRecord }) {
  const [showRaw, setShowRaw] = useState(false);
  const [explain, setExplain] = useState<PromptExplanation | null>(null);
  const [explainErr, setExplainErr] = useState<string | null>(null);
  const meta = (detail?.metadata ?? null) as Record<string, unknown> | null;

  useEffect(() => {
    let cancelled = false;
    setExplain(null);
    setExplainErr(null);
    api
      .explainImagePrompt(record.id)
      .then((r) => {
        if (!cancelled) setExplain(r);
      })
      .catch((e) => {
        if (!cancelled) setExplainErr(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [record.id]);
  const cell = (v: unknown) => (v == null || v === '' ? '—' : String(v));
  const rows: Array<[string, React.ReactNode]> = [
    ['Metadata status', <StatusPill key="s" value={record.metadata_status} />],
    ['File', cell(record.canonical_path)],
    ['Size', record.width && record.height ? `${record.width} × ${record.height}` : '—'],
    ['Positive prompt', cell(meta?.positive_prompt)],
    ['Negative prompt', cell(meta?.negative_prompt)],
    ['Checkpoint', cell(meta?.checkpoint)],
    ['LoRAs', cell(meta?.loras)],
    ['Seed', cell(meta?.seed)],
    ['Sampler / scheduler', `${cell(meta?.sampler)} / ${cell(meta?.scheduler)}`],
    ['Steps / CFG / denoise', `${cell(meta?.steps)} / ${cell(meta?.cfg)} / ${cell(meta?.denoise)}`],
  ];
  const url = fileUrl(record.canonical_path) ?? thumbUrl(record);
  return (
    <div className="inspector-body">
      {url && <img className="inspector-thumb" src={url} alt={record.filename} style={{ maxHeight: '320px', objectFit: 'contain', width: '100%' }} />}
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div className="kv-row" key={String(k)}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h3>Prompt extraction</h3>
      {explainErr ? (
        <p className="notice bad">{explainErr}</p>
      ) : !explain ? (
        <p className="empty">Analyzing stored prompt/workflow metadata…</p>
      ) : (
        <div className="prompt-diag">
          <DirectionRow label="Positive" dir={explain.diagnostic.positive} />
          <DirectionRow label="Negative" dir={explain.diagnostic.negative} />
          <p className="hint">
            containers present — execution: {String(explain.diagnostic.containers_present.execution)},
            workflow: {String(explain.diagnostic.containers_present.workflow)} · {explain.note}
          </p>
        </div>
      )}
      <h3>Embeddings</h3>
      {detail && detail.embeddings.length > 0 ? (
        <table className="table">
          <thead>
            <tr><th>Modality</th><th>Dim</th><th>Config</th><th>Valid</th></tr>
          </thead>
          <tbody>
            {detail.embeddings.map((e) => (
              <tr key={`${e.modality}-${e.config_hash}`}>
                <td>{e.modality}</td>
                <td>{e.dimension}</td>
                <td className="mono small">{e.config_hash.slice(0, 8)}</td>
                <td>{e.valid ? 'yes' : 'stale'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="empty">No embeddings stored for this item.</p>}
      <h3>Raw metadata</h3>
      {detail?.raw_metadata ? (
        <>
          <Button onClick={() => setShowRaw((v) => !v)}>{showRaw ? 'Hide' : 'Show'} raw ComfyUI JSON</Button>
          {showRaw && <pre className="raw">{JSON.stringify(detail.raw_metadata, null, 2)}</pre>}
        </>
      ) : <p className="empty">No raw metadata stored.</p>}
    </div>
  );
}