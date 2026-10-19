// covers: PIP-01, PIP-02, PIP-03, PIP-04, PIP-05, PIP-06, PIP-07, PIP-08, PIP-09, PIP-10, PIP-11, PIP-12, PIP-13, PIP-20, PIP-21, PIP-22, PIP-23, PIP-24
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Checkbox, EmptyState, ProgressBar, Tree } from '../../components/ui';
import './PipelineScreen.css';
import { STAGE_DEFS } from './pipelineFixtures';
import type { PipelineSource, PipelineScope, PipelinePresetCard, PipelineSummary, PipelineResourceProfile, PipelineJob, PipelineJobState, PipelineTray, MaintenanceAction } from './PipelineTypes';
import { FIXTURE_LIBRARIES } from '../explore/exploreFixtures';

export type PipelineScreenProps = {
  source: PipelineSource;
  libraryId: string;
  libraryType: 'comfyui' | 'comic';
  density: 'compact' | 'comfortable' | 'spacious';
  onNotify?: (message: string) => void;
  // Scenario initial state (for dev gallery)
  initialScope?: PipelineScope;
  initialPresetId?: string | null;
  initialStages?: string[];
  initialDrawerOpen?: boolean;
  initialActiveJobId?: string | null;
  initialTrayText?: string;
  initialShowMaintenance?: boolean;
};

export function PipelineScreen({ source, libraryId, libraryType, density: _density, onNotify: _onNotify, initialScope, initialPresetId, initialStages, initialDrawerOpen, initialActiveJobId, initialTrayText, initialShowMaintenance }: PipelineScreenProps) {
  const [scope, setScope] = useState<PipelineScope>(initialScope ?? { type: 'library', libraryId });
  const [presets, setPresets] = useState<PipelinePresetCard[]>([]);
  const [presetId, setPresetId] = useState<string | null>(initialPresetId ?? null);
  const [stages, setStages] = useState<string[]>(initialStages ?? []);
  const [reRunEvenIfDone, setReRunEvenIfDone] = useState<Record<string, boolean>>({});
  const [skipCompleted, setSkipCompleted] = useState(true);
  const [profile, _setProfile] = useState<string>('balanced');
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [_resourceProfiles, _setResourceProfiles] = useState<PipelineResourceProfile[]>([]);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen ?? false);
  const [activeJobId, setActiveJobId] = useState<string | null>(initialActiveJobId ?? null);
  const [tray, setTray] = useState<PipelineTray>(initialTrayText ? { text: initialTrayText, canPause: true, canStop: true } : { text: 'Ready', canPause: false, canStop: false });
  const [maintenanceActions, setMaintenanceActions] = useState<MaintenanceAction[]>([]);
  const [showMaintenance, setShowMaintenance] = useState(initialShowMaintenance ?? false);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const trayRef = useRef<HTMLDivElement>(null);

  const push = useCallback((line: string) => {
    setLog((l) => [...l.slice(-499), `${new Date().toLocaleTimeString()} ${line}`]);
  }, []);

  // Load presets, stages, resource profiles, jobs, maintenance on mount
  useEffect(() => {
    source.presets(libraryType).then(setPresets).catch(() => {});
    source.resourceProfiles(libraryId).then(_setResourceProfiles).catch(() => {});
    source.jobs(libraryId).then(setJobs).catch(() => {});
    source.maintenanceActions(libraryId).then(setMaintenanceActions).catch(() => {});
    source.trayText().then(setTray).catch(() => {});
  }, [source, libraryId, libraryType]);

  // Update scope folder count
  useEffect(() => {
    if (scope.type === 'folders') {
      // Could update folder count here
    }
  }, [scope]);

  // Load stages when preset changes
  useEffect(() => {
    if (!presetId) return;
    source.stages(libraryType, scope).then((allStages) => {
      const preset = presets.find((p) => p.id === presetId);
      if (preset && !preset.fromPolicies) {
        setStages(preset.stages);
      } else {
        // Use folder policies or default
        setStages(allStages.map((s) => s.id));
      }
    }).catch(() => {});
  }, [presetId, presets, scope]);

  // Apply initial stages if provided (for dev gallery scenarios)
  useEffect(() => {
    if (initialStages && initialStages.length > 0 && presetId === initialPresetId) {
      setStages(initialStages);
    }
  }, [initialStages, initialPresetId, presetId]);

  // Update summary when stages or scope change
  useEffect(() => {
    if (stages.length === 0) {
      setSummary(null);
      return;
    }
    source.summary({ library: { id: libraryId, name: FIXTURE_LIBRARIES.find((l) => l.id === libraryId)?.name ?? libraryId, rootPath: '' }, scope, presetId, stages, counts: { toProcess: 0, alreadyDone: 0, stale: 0, failed: 0 }, runtimeNote: '' }).then(setSummary).catch(() => {});
  }, [stages, scope, presetId, profile]);

  // Update tray text periodically
  useEffect(() => {
    const interval = setInterval(() => {
      source.trayText().then(setTray).catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [source]);

  // Load stages on mount
  useEffect(() => {
    source.stages(libraryType, scope).catch(() => {});
  }, []);

  // Handle scope change
  const handleScopeChange = useCallback((newScope: PipelineScope) => {
    setScope(newScope);
    // Reset preset when scope changes to folders
    if (newScope.type === 'folders') {
      setPresetId(null);
      setStages([]);
    }
  }, []);

  // Handle preset change
  const handlePresetChange = useCallback((id: string) => {
    setPresetId(id);
    const preset = presets.find((p) => p.id === id);
    if (preset && !preset.fromPolicies) {
      setStages(preset.stages);
    }
  }, [presets]);

  // Toggle stage
  const toggleStage = useCallback((stageId: string) => {
    setStages((cur) => cur.includes(stageId) ? cur.filter((x) => x !== stageId) : [...cur, stageId]);
  }, []);

  // Toggle re-run
  const toggleReRun = useCallback((stageId: string) => {
    setReRunEvenIfDone((cur) => ({ ...cur, [stageId]: !cur[stageId] }));
  }, []);

  // Start job
  const startJob = useCallback(async () => {
    if (!summary?.canStart) {
      setErr(summary?.cannotStartReason ?? 'Cannot start job');
      return;
    }
    setErr(null);
    push('Starting job...');
    try {
      const job = await source.startJob({
        libraryId,
        libraryName: FIXTURE_LIBRARIES.find((l) => l.id === libraryId)?.name ?? libraryId,
        scope,
        presetId,
        stages,
        profile,
      });
      setJobs((cur) => [...cur, job]);
      setActiveJobId(job.id);
      setDrawerOpen(true);
      setTray(await source.trayText());
    } catch (e) {
      setErr(String(e));
    }
  }, [source, libraryId, scope, presetId, stages, profile, summary]);

  // Job controls
  const pauseJob = useCallback(async (jobId: string) => {
    await source.pauseJob(jobId);
    setJobs((cur) => cur.map((j) => j.id === jobId ? { ...j, state: 'paused' as PipelineJobState } : j));
    setTray(await source.trayText());
  }, [source]);

  const resumeJob = useCallback(async (jobId: string) => {
    await source.resumeJob(jobId);
    setJobs((cur) => cur.map((j) => j.id === jobId ? { ...j, state: 'running' as PipelineJobState } : j));
    setTray(await source.trayText());
  }, [source]);

  const stopJob = useCallback(async (jobId: string) => {
    await source.stopJob(jobId);
    setJobs((cur) => cur.map((j) => j.id === jobId ? { ...j, state: 'stopping' as PipelineJobState } : j));
    setTray(await source.trayText());
  }, [source]);

  const retryFailures = useCallback(async (jobId: string) => {
    await source.retryFailures(jobId);
    setJobs((cur) => cur.map((j) => j.id === jobId ? { ...j, failures: [] } : j));
  }, [source]);

  const cancelQueuedJob = useCallback(async (jobId: string) => {
    await source.cancelQueuedJob(jobId);
    setJobs((cur) => cur.filter((j) => j.id !== jobId));
  }, [source]);

  // Maintenance
  const runMaintenance = useCallback(async (actionId: string) => {
    push(`Starting maintenance: ${actionId}`);
    await source.runMaintenance(libraryId, actionId);
    push(`Maintenance started: ${actionId}`);
  }, [source, libraryId]);

  // Cropper Lab
  const runCropper = useCallback(async () => {
    if (scope.type === 'folders' && scope.folderIds) {
      const result = await source.runCropper({ libraryId, folderIds: scope.folderIds, addAsLibrary: true });
      push(`Cropper Lab started: ${result.jobId}`);
    }
  }, [source, libraryId, scope]);

  return (
    <div className="pipeline-screen">
      {/* Tray */}
      <div ref={trayRef} className="pipeline-tray" onClick={() => setDrawerOpen(true)}>
        <span className="tray-text">{tray.text}</span>
        <div className="tray-actions">
          {tray.canPause && <Button variant="ghost" onClick={() => activeJobId && pauseJob(activeJobId)}>Pause</Button>}
          {tray.canStop && <Button variant="ghost" onClick={() => activeJobId && stopJob(activeJobId)}>Stop</Button>}
        </div>
      </div>

      <div className="pipeline-content">
        {/* Scope */}
        <section className="pipeline-section">
          <h2>Scope</h2>
          <div className="pipeline-scope">
            <div className="scope-mode">
              <label>
                <input type="radio" checked={scope.type === 'library'} onChange={() => handleScopeChange({ type: 'library', libraryId })} /> Entire library
              </label>
              <label>
                <input type="radio" checked={scope.type === 'folders'} onChange={() => handleScopeChange({ type: 'folders', libraryId, folderIds: [] })} /> Selected folders
              </label>
              <Button variant="secondary" onClick={() => handleScopeChange({ type: 'library', libraryId })}>Selected in Explore</Button>
              <Button variant="ghost" onClick={() => handleScopeChange({ type: 'library', libraryId, folderIds: [] })}>Clear</Button>
            </div>
            {scope.type === 'folders' && (
              <div className="scope-tree">
                <Tree
                  mode="select"
                  nodes={[
                    { id: libraryId, label: 'Library', children: [
                      { id: 'f1', label: 'Folder A', children: [] },
                      { id: 'f2', label: 'Folder B', children: [] },
                    ]}
                  ]}
                  value={scope.folderIds ?? []}
                  onChange={(ids) => setScope({ ...scope, folderIds: ids })}
                  aria-label="Scope folders"
                />
              </div>
            )}
            <div className="scope-summary">
              {scope.type === 'library' ? 'Entire library' : `${scope.folderIds?.length ?? 0} folders selected`}
            </div>
          </div>
        </section>

        {/* What to run */}
        <section className="pipeline-section">
          <h2>What to run</h2>
          <div className="preset-cards">
            {presets.map((preset) => (
              <div key={preset.id} className={`preset-card ${presetId === preset.id ? 'selected' : ''} ${preset.needsModel ? 'needs-model' : ''}`} onClick={() => handlePresetChange(preset.id)}>
                <div className="preset-header">
                  <h3>{preset.label}</h3>
                  {preset.needsModel && <span className="pill pill-muted">Needs model runtime</span>}
                </div>
                <p className="preset-desc">{preset.description}</p>
                <div className="preset-stages">
                  {preset.stages.map((s) => <span key={s} className="stage-tag">{s}</span>)}
                  {preset.fromPolicies && <span className="pill pill-info">From folder policies</span>}
                </div>
                {preset.estimate && (
                  <div className="preset-estimate">
                    Estimate: {preset.estimate.min}–{preset.estimate.max} min {preset.estimate.min === 0 ? '(depends on policies)' : ''}
                  </div>
                )}
                <Checkbox
                  checked={presetId === preset.id}
                  onChange={() => handlePresetChange(preset.id)}
                  label="Use this preset"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Stage list */}
        {presetId && (
          <section className="pipeline-section">
            <h2>Stage list</h2>
            <div className="stage-controls">
              <Checkbox checked={skipCompleted} onChange={setSkipCompleted} label="Skip completed (PIP-04)" />
            </div>
            <div className="stage-groups">
              {presets.find((p) => p.id === presetId)?.stages.map((stageId) => {
                const stage = STAGE_DEFS[stageId];
                if (!stage) return null;
                return (
                  <div key={stageId} className="stage-row">
                    <Checkbox
                      checked={stages.includes(stageId)}
                      onChange={() => toggleStage(stageId)}
                      label={stage.label}
                      title={stage.description}
                    >
                      <span>{stage.label}</span>
                      {stage.needsModel && <span className="pill pill-muted">model</span>}
                      {stages.includes(stageId) && (
                        <Checkbox
                          checked={reRunEvenIfDone[stageId]}
                          onChange={() => toggleReRun(stageId)}
                          label="Re-run even if done"
                        />
                      )}
                    </Checkbox>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Summary */}
        {summary && (
          <section className="pipeline-section">
            <h2>Summary</h2>
            <div className="pipeline-summary">
              <div className="summary-grid">
                <div>Library: {summary.library.name}</div>
                <div>Scope: {summary.scope.type === 'library' ? 'Entire library' : `${summary.scope.folderIds?.length ?? 0} folders`}</div>
                <div>Preset: {presets.find((p) => p.id === summary.presetId)?.label ?? 'Custom'}</div>
                <div>Stages: {summary.stages.length}</div>
                <div className="summary-counts">
                  <span className="count to-process">To process: {summary.counts.toProcess}</span>
                  <span className="count already-done">Already done: {summary.counts.alreadyDone}</span>
                  <span className="count stale">Stale: {summary.counts.stale}</span>
                  <span className="count failed">Failed: {summary.counts.failed}</span>
                </div>
                <div className="summary-runtime">{summary.runtimeNote}</div>
                {summary.estimate && (
                  <div className="summary-estimate">
                    Estimate: {summary.estimate.min}–{summary.estimate.max} min
                  </div>
                )}
              </div>
              <div className="summary-actions">
                <Button
                  onClick={startJob}
                  disabled={!summary.canStart}
                  className="primary"
                >
                  {summary.canStart ? 'Start' : 'Cannot start'}
                </Button>
                {!summary.canStart && summary.cannotStartReason && (
                  <span className="hint bad">{summary.cannotStartReason}</span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Tools */}
        <section className="pipeline-section">
          <h2>Tools</h2>
          <details open>
            <summary>Tools</summary>
            <div className="tools-grid">
              <Button onClick={runCropper} disabled={libraryType !== 'comic'}>
                Panel Studio
              </Button>
              <Button variant="ghost" onClick={() => setShowMaintenance(!showMaintenance)}>
                Maintenance {showMaintenance ? '▼' : '▶'}
              </Button>
            </div>
          </details>
          {showMaintenance && (
            <div className="maintenance-list">
              {maintenanceActions.map((action) => (
                <div key={action.id} className="maintenance-item">
                  <div className="maintenance-info">
                    <strong>{action.label}</strong>
                    <p>{action.description}</p>
                    <span className="hint">Reads: {action.reads.join(', ')}</span>
                    <span className="hint">May update: {action.mayUpdate.join(', ')}</span>
                    {action.estimate && <span className="hint">Estimate: {action.estimate.min}–{action.estimate.max} min</span>}
                  </div>
                  <Button variant="ghost" onClick={() => runMaintenance(action.id)}>Run</Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Job queue / Drawer */}
        {drawerOpen && (
          <div className="pipeline-drawer-overlay" onClick={() => setDrawerOpen(false)}>
            <div className="pipeline-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="drawer-header">
                <h2>Pipeline</h2>
                <Button variant="ghost" onClick={() => setDrawerOpen(false)}>✕</Button>
              </div>
              <div className="drawer-tabs">
                <button className={activeJobId ? 'active' : ''} onClick={() => setActiveJobId(null)}>Queue</button>
                <button className={!activeJobId ? 'active' : ''} onClick={() => setActiveJobId(jobs[0]?.id ?? null)}>Current Job</button>
                <button onClick={() => setActiveJobId(null)}>Log</button>
              </div>
              {activeJobId ? (
                <div className="drawer-job">
                  {(() => {
                    const job = jobs.find((j) => j.id === activeJobId);
                    if (!job) return <EmptyState title="Job not found" />;
                    return (
                      <div>
                        <div className="job-header">
                          <span className={`job-state ${job.state}`}>{job.state}</span>
                          <span className="job-library">{job.libraryName}</span>
                        </div>
                        <ProgressBar
                          value={job.progress.total > 0 ? (job.progress.done / job.progress.total) * 100 : null}
                          label={job.progress.message}
                          indeterminate={job.progress.total === 0}
                        />
                        <div className="job-progress">
                          <span>Stage: {job.progress.stage}</span>
                          <span>Rate: {job.progress.itemsPerSecond.toFixed(1)}/s</span>
                          <span>ETA: {job.progress.etaSeconds ? `${Math.round(job.progress.etaSeconds / 60)} min` : 'calculating...'}</span>
                        </div>
                        <div className="job-controls">
                          {job.state === 'running' && <Button onClick={() => pauseJob(job.id)}>Pause</Button>}
                          {job.state === 'paused' && <Button variant="secondary" onClick={() => resumeJob(job.id)}>Resume</Button>}
                          {(job.state === 'running' || job.state === 'paused') && <Button variant="ghost" onClick={() => stopJob(job.id)}>Stop safely</Button>}
                          {job.failures.length > 0 && <Button onClick={() => retryFailures(job.id)}>Retry failures ({job.failures.length})</Button>}
                        </div>
                        {job.failures.length > 0 && (
                          <div className="job-failures">
                            <h4>Failures</h4>
                            {job.failures.map((f, i) => (
                              <div key={i} className="failure">
                                <span className="failure-item">{f.item}</span>
                                <span className="failure-stage">{f.stage}</span>
                                <span className="failure-error">{f.error}</span>
                                <Button variant="ghost" onClick={() => retryFailures(job.id)}>Retry</Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="drawer-queue">
                  {jobs.length === 0 ? (
                    <EmptyState title="No jobs" body="Start a job from the Pipeline screen" />
                  ) : (
                    jobs.map((job) => (
                      <div key={job.id} className={`queue-item ${job.state}`}>
                        <span>{job.libraryName} — {presets.find((p) => p.id === job.presetId)?.label ?? 'Custom'}</span>
                        <span className={`job-state ${job.state}`}>{job.state}</span>
                        {job.state === 'queued' && <Button variant="ghost" onClick={() => cancelQueuedJob(job.id)}>Cancel</Button>}
                      </div>
                    ))
                  )}
                </div>
              )}
              <div className="drawer-log">
                <h4>Session log</h4>
                <pre className="log">{log.length ? log.join('\n') : 'No events yet.'}</pre>
              </div>
            </div>
          </div>
        )}

        {err && <div className="notice bad">{err}</div>}
      </div>
    </div>
  );
}