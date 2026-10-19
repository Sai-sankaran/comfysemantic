import { useEffect, useState } from 'react';
import { api } from '../../api';
import type {
  BatchRecoveryScanResult,
  BatchPromptGroup,
  BatchPromptAttribution,
  BatchPromptPreview,
  BatchRecoveryStatus,
} from '../../types';
import { useLibrary } from '../../app/providers';
import { Button, Checkbox, Select, Dialog, Textarea } from '../../components/ui';

const ATTRIBUTION_STATE_LABELS: Record<string, string> = {
  exact_metadata: 'Exact metadata',
  verified_order_inference: 'Inferred (order)',
  high_confidence_inference: 'Inferred (legacy v1)',
  ambiguous: 'Ambiguous',
  unresolved: 'Unresolved',
  malformed: 'Malformed',
  manually_confirmed: 'Manual',
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  manual: 'Manual',
};

const ATTRIBUTION_STATE_COLORS: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  exact_metadata: 'success',
  // Inferred, not proven. Deliberately not styled as success: a reviewer
  // should not read a positional guess as a settled fact.
  verified_order_inference: 'info',
  high_confidence_inference: 'info',
  ambiguous: 'warning',
  unresolved: 'default',
  malformed: 'error',
  manually_confirmed: 'success',
};

export function BatchRecoveryScreen() {
  const { libraryId, libraries, selectLibrary } = useLibrary();

  const [scanResult, setScanResult] = useState<BatchRecoveryScanResult | null>(null);
  const [preview, setPreview] = useState<BatchPromptPreview | null>(null);
  const [status, setStatus] = useState<BatchRecoveryStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupAttributions, setGroupAttributions] = useState<BatchPromptAttribution[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [acceptMode, setAcceptMode] = useState<'accept' | 'reject'>('accept');
  const [manualCorrection, setManualCorrection] = useState<{ imageId: string; promptText: string } | null>(null);

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.8) return 'confidence-high';
    if (conf >= 0.5) return 'confidence-medium';
    return 'confidence-low';
  };

  const formatConfidence = (conf: number) => Math.round(conf * 100) + '%';

/**
 * Why a row carries no prompt.
 *
 * An empty proposal is the correct outcome whenever more than one assignment
 * is still plausible, so the reviewer needs the reason - not just a blank
 * cell. Kept short and factual; the full evidence is in the row's `evidence`.
 */
const describeBlockers = (attr: BatchPromptAttribution): string => {
  const reasons = attr.assumptions?.blocking_reasons;
  if (Array.isArray(reasons) && reasons.length > 0) {
    return String(reasons[0]);
  }
  switch (attr.attribution_state) {
    case 'ambiguous':
      return 'several assignments remain plausible';
    case 'unresolved':
      return 'no candidate list was recovered';
    case 'malformed':
      return 'the metadata is structurally invalid';
    default:
      return 'not enough evidence';
  }
};

  // Load status on mount and when library changes
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const s = await api.batchRecoveryStatus(libraryId || undefined);
        setStatus(s);
      } catch (e) {
        setErr(String(e));
      }
    };
    loadStatus();
  }, [libraryId]);

  const handleScan = async () => {
    if (!libraryId) {
      setErr('Select a library first.');
      return;
    }
    setLoading(true);
    setErr(null);
    setScanResult(null);
    setPreview(null);
    try {
      const res = await api.batchRecoveryScan(libraryId);
      setScanResult(res);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (group: BatchPromptGroup) => {
    setActiveGroupId(group.group_id);
    setLoading(true);
    try {
      const res = await api.batchRecoveryPreview(group.group_id, libraryId || undefined);
      setPreview(res);
      // Pre-select only assignments whose prompt is established per-output.
      // Anything inferred, ambiguous, unresolved or malformed starts
      // unselected: accepting is a search-visible, embedding-invalidating
      // write, so it must be a deliberate act on a row the reviewer has read.
      // Automatic recovery never produces `exact_metadata` (standard ComfyUI
      // output metadata carries no per-output prompt), so in practice this
      // starts with nothing selected.
      const acceptedIds = new Set<string>(
        res.attributions
          .filter((a) => a.attribution_state === 'exact_metadata')
          .map((a) => a.image_id)
      );
      setSelection(acceptedIds);
      setGroupAttributions(res.attributions);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (imageId: string) => {
    setSelection((cur) => {
      const next = new Set(cur);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!preview) return;
    if (selection.size === preview.attributions.length) {
      setSelection(new Set());
    } else {
      setSelection(new Set(preview.attributions.map((a) => a.image_id)));
    }
  };

  const openManualCorrection = (imageId: string, currentPrompt: string) => {
    setManualCorrection({ imageId, promptText: currentPrompt });
  };

  const handleAcceptReject = async () => {
    if (!libraryId || !activeGroupId) return;
    const toProcess = selection.size > 0 ? Array.from(selection) : groupAttributions.map((a) => a.image_id);
    if (toProcess.length === 0) return;

    setLoading(true);
    try {
      // Get attribution IDs from the preview
      const attrIds = groupAttributions
        .filter((a) => toProcess.includes(a.image_id))
        .map((a) => a.image_id); // Backend uses image_id as attribution ID

      const manualCorrections: Record<string, string> = {};
      if (acceptMode === 'accept' && manualCorrection) {
        manualCorrections[manualCorrection.imageId] = manualCorrection.promptText;
      }

      await api.batchRecoveryAccept({
        library_id: libraryId,
        attribution_ids: attrIds,
        group_id: activeGroupId,
        reject: acceptMode === 'reject',
        manual_corrections: manualCorrections,
      });

      setErr(null);
      // Refresh preview and status
      await handlePreview(preview!.group);
      const s = await api.batchRecoveryStatus(libraryId || undefined);
      setStatus(s);
      setSelection(new Set());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="main">
      <div className="toolbar">
        <Select
          aria-label="Library scope"
          value={libraryId ?? ''}
          onChange={(e) => {
            setActiveGroupId(null);
            setPreview(null);
            selectLibrary(e.target.value);
          }}
        >
          <option value="">All libraries</option>
          {libraries.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>

        <Button
          onClick={handleScan}
          disabled={loading || !libraryId}
          variant="primary"
        >
          {loading ? 'Scanning…' : 'Scan for Batch Prompts'}
        </Button>

        {scanResult && (
          <span className="spacer" />
        )}

        {scanResult && (
          <span className="mono small">
            {scanResult.total_images} images · {scanResult.eligible_batches} batch(es) · {scanResult.groups.length} group(s)
          </span>
        )}

        {err && <p className="notice bad">{err}</p>}
      </div>

      {scanResult && scanResult.groups.length > 0 && (
        <section className="panel">
          <h2>Generation Groups</h2>
          <div className="groups-list">
            {scanResult.groups.map((group) => (
              <div
                key={group.group_id}
                className={`group-card ${activeGroupId === group.group_id ? 'active' : ''}`}
                onClick={() => handlePreview(group)}
              >
                <div className="group-header">
                  <span className="group-prefix">{group.common_prefix}</span>
                  <span className="group-count">{group.image_ids.length} images</span>
                </div>
                <div className="group-meta">
                  <span>Counters: {group.counter_sequence[0]}–{group.counter_sequence[group.counter_sequence.length - 1]}</span>
                  {group.gaps.length > 0 && <span className="gap-badge">Gaps: {group.gaps.length}</span>}
                  <span>Confidence: {Math.round(group.confidence * 100)}%</span>
                </div>
                {group.counter_evidence === false && (
                  <div className="group-meta warn">
                    No filename counter — no ordering evidence for this group
                  </div>
                )}
                {activeGroupId === group.group_id && <span className="preview-badge">Previewing →</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {preview && (
        <section className="panel preview-panel">
          <div className="preview-header">
            <h2>Group Preview: {preview.group.common_prefix}</h2>
            <div className="preview-actions">
              <Select
                value={acceptMode}
                onChange={(e) => setAcceptMode(e.target.value as 'accept' | 'reject')}
              >
                <option value="accept">Accept</option>
                <option value="reject">Reject</option>
              </Select>
              <Button
                onClick={handleAcceptReject}
                disabled={selection.size === 0 && !manualCorrection}
                variant={acceptMode === 'accept' ? 'primary' : 'danger'}
              >
                {acceptMode === 'accept' ? `Accept ${selection.size} selected` : `Reject ${selection.size} selected`}
              </Button>
              <Checkbox
                className="inline"
                checked={selection.size === preview.attributions.length}
                onChange={toggleSelectAll}
                label="Select all"
              />
            </div>
          </div>

          <div className="batch-info">
            <h3>Batch: {preview.batch.config.class_type} (node {preview.batch.config.node_id})</h3>
            <div className="batch-facts">
              <span>
                {preview.batch.candidates.length} candidate
                {preview.batch.candidates.length === 1 ? '' : 's'}
              </span>
              <span>
                Source:{' '}
                {preview.batch.config.source_container === 'execution'
                  ? 'execution graph'
                  : 'UI workflow (can be stale)'}
              </span>
              {(preview.batch.config.prepend || preview.batch.config.append) && (
                <span>
                  Affixes — prepend: <code>{preview.batch.config.prepend || '—'}</code>,
                  append: <code>{preview.batch.config.append || '—'}</code>
                </span>
              )}
              {preview.group.output_topology && (
                <span>
                  Outputs per candidate:{' '}
                  {preview.group.output_topology.outputs_per_candidate ?? 'unproven'}
                  {preview.group.output_topology.reason
                    ? ` — ${preview.group.output_topology.reason}`
                    : ''}
                </span>
              )}
            </div>
            <div className="candidates-list">
              {preview.batch.candidates.map((c, i) => (
                <span key={i} className="candidate-chip" title={c.text}>
                  #{i}: {c.text.slice(0, 60)}{c.text.length > 60 ? '…' : ''}
                  <span className="widget-tag">line {c.original_line}</span>
                </span>
              ))}
            </div>
            {preview.batch.diagnostics && preview.batch.diagnostics.length > 0 && (
              <details className="diagnostics">
                <summary>
                  {preview.batch.diagnostics.length} advisory note
                  {preview.batch.diagnostics.length === 1 ? '' : 's'} about the
                  generated list (text is unchanged)
                </summary>
                <ul>
                  {preview.batch.diagnostics.map((d, i) => (
                    <li key={i}>
                      <code>{d.code}</code> {d.message}
                      {d.indices.length > 0 && (
                        <span className="widget-tag">candidates: {d.indices.join(', ')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {preview.batch.warnings.length > 0 && (
              <details className="diagnostics">
                <summary>Reconstruction warnings</summary>
                <ul>
                  {preview.batch.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="attributions-table">
            <div className="table-header">
              <div className="col-checkbox">
                <Checkbox
                  className="inline"
                  ariaLabel="Select all rows"
                  checked={selection.size === preview.attributions.length && preview.attributions.length > 0}
                  indeterminate={selection.size > 0 && selection.size < preview.attributions.length}
                  onChange={toggleSelectAll}
                />
              </div>
              <div className="col-image">Image</div>
              <div className="col-prompt">Assigned Prompt</div>
              <div className="col-state">State</div>
              <div className="col-confidence">Confidence</div>
              <div className="col-actions">Actions</div>
            </div>

            {preview.attributions.map((attr) => (
              <div key={attr.image_id} className={`table-row ${selection.has(attr.image_id) ? 'selected' : ''}`}>
                <div className="col-checkbox">
                  <Checkbox
                    className="inline"
                    ariaLabel={`Select ${attr.image_id}`}
                    checked={selection.has(attr.image_id)}
                    onChange={() => toggleSelection(attr.image_id)}
                  />
                </div>
                <div className="col-image">
                  <span className="mono small">{attr.image_id.slice(0, 12)}…</span>
                </div>
                <div className="col-prompt">
                  {attr.prompt_text ? (
                    <span title={attr.prompt_text}>
                      {attr.prompt_text.slice(0, 80)}
                      {attr.prompt_text.length > 80 ? '…' : ''}
                    </span>
                  ) : (
                    <span className="muted">
                      No prompt proposed — {describeBlockers(attr)}
                    </span>
                  )}
                  {attr.prompt_index >= 0 && <span className="index-badge">#{attr.prompt_index}</span>}
                </div>
                <div className="col-state">
                  <span className={`badge badge-${ATTRIBUTION_STATE_COLORS[attr.attribution_state] || 'default'}`}>
                    {ATTRIBUTION_STATE_LABELS[attr.attribution_state] || attr.attribution_state}
                  </span>
                </div>
                <div className="col-confidence">
                  <span className={`confidence-badge ${getConfidenceColor(attr.confidence)}`}>
                    {formatConfidence(attr.confidence)}
                  </span>
                </div>
                <div className="col-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => openManualCorrection(attr.image_id, attr.prompt_text)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const evidence = attr.evidence as Record<string, unknown>;
                      alert(JSON.stringify(evidence, null, 2));
                    }}
                  >
                    Evidence
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {manualCorrection && (
        <Dialog
          open={true}
          onClose={() => setManualCorrection(null)}
          title="Manual Prompt Correction"
          footer={
            <>
              <Button onClick={() => setManualCorrection(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => setManualCorrection(null)}
              >
                Save
              </Button>
            </>
          }
        >
          <p>Image: {manualCorrection.imageId}</p>
          {/* One shared textarea (`CTL-01`), not a raw element with inline styles. */}
          <Textarea
            label="Corrected prompt"
            rows={6}
            value={manualCorrection.promptText}
            onChange={(promptText) => setManualCorrection({ ...manualCorrection, promptText })}
            placeholder="Enter corrected prompt"
          />
        </Dialog>
      )}

      {!scanResult && (
        <section className="empty">
          <p>Select a library and click "Scan for Batch Prompts" to find SimplePromptBatcher generations.</p>
          <p className="hint">
            This analyzes stored execution/workflow graphs to reconstruct ordered prompt batches from SimplePromptBatcher nodes,
            then groups generated images by filename counters and timestamps.
          </p>
        </section>
      )}

      {status && (
        <section className="panel status-panel">
          <h2>Recovery Status</h2>
          <div className="status-grid">
            <div className="status-section">
              <h3>By Attribution State</h3>
              {Object.entries(status.by_attribution_state).map(([state, count]) => (
                <div key={state} className="status-row">
                  <span className={`badge badge-${ATTRIBUTION_STATE_COLORS[state] || 'default'}`}>
                    {ATTRIBUTION_STATE_LABELS[state] || state}
                  </span>
                  <span className="status-count">{count}</span>
                </div>
              ))}
            </div>
            <div className="status-section">
              <h3>By Review Status</h3>
              {Object.entries(status.by_review_status).map(([state, count]) => (
                <div key={state} className="status-row">
                  <span className={`badge ${state === 'accepted' ? 'badge-success' : state === 'rejected' ? 'badge-error' : 'badge-default'}`}>
                    {REVIEW_STATUS_LABELS[state] || state}
                  </span>
                  <span className="status-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="status-total">
            Total images with batch fingerprint: {status.total_images_with_batch}
          </div>
        </section>
      )}
    </main>
  );
}