import { useRef, useState } from 'react';
import { Activity, ChevronDown, CircleAlert, Cpu, Database, Lock, Play, Square } from 'lucide-react';
import { Popover, PopoverHeading, PopoverItem, PopoverSeparator } from '../components/ui';
import { SYSTEM_TONE_LABEL, toneForRuntime, type SystemTone } from './systemState';
import { api } from '../api';
import type { LibraryRecord, SettingsInfo } from '../types';

/**
 * The System chip and popover (design `NAV-14`, §6.5).
 *
 * The chip is a dot plus a label; the dot's colour means grey = idle/not started,
 * green = ready or running normally, amber = degraded, red = error. It replaces
 * the old `model: stopped` pill *and* the old Ready/stopped footer, so this is
 * the one place system state is shown.
 *
 * Rows, in the documented order: Library, Model runtime (with Start/Stop), Worker,
 * Caches, then the Diagnostics link.
 */
export type SystemChipProps = {
  settings: SettingsInfo | null;
  activeLibrary: LibraryRecord | null;
  /** A job is running. */
  busy: string | null;
  /** The catalog is open read-only (another process holds the lock). */
  readOnly: boolean;
  onOpenDiagnostics: () => void;
};

export function SystemChip({
  settings,
  activeLibrary,
  busy,
  readOnly,
  onOpenDiagnostics,
}: SystemChipProps) {
  const [open, setOpen] = useState(false);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const runtime = settings?.runtime_status ?? 'unknown';
  const tone: SystemTone = readOnly ? 'degraded' : toneForRuntime(runtime);
  const running = runtime.toLowerCase().includes('ready') || runtime.toLowerCase().includes('running');

  const toggleRuntime = async () => {
    setRuntimeBusy(true);
    try {
      if (running) await api.stopModel();
      else await api.startModel({});
    } catch {
      // The runtime reports failures through its own status; the chip re-reads it
      // on the next settings poll, so a rejected call needs no UI of its own.
    } finally {
      setRuntimeBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="end"
      className="system-chip"
      label="System"
      trigger={
        <button
          type="button"
          ref={buttonRef}
          className={`system-trigger ${tone}`}
          aria-haspopup="menu"
          aria-expanded={open}
          title={`System: ${SYSTEM_TONE_LABEL[tone]}`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`system-dot ${tone}`} aria-hidden="true" />
          <span className="system-label">{SYSTEM_TONE_LABEL[tone]}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      }
    >
      <PopoverHeading>Library</PopoverHeading>
      <div className="sys-row">
        {readOnly ? <Lock size={14} aria-hidden="true" /> : <Database size={14} aria-hidden="true" />}
        <span>
          {activeLibrary ? activeLibrary.name : 'All libraries'} —{' '}
          {readOnly ? 'Read-only (locked by another process)' : 'Open'}
        </span>
      </div>

      <PopoverHeading>Model runtime</PopoverHeading>
      <div className="sys-row">
        <Cpu size={14} aria-hidden="true" />
        <span className="sys-state">{runtime}</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={runtimeBusy}
          onClick={() => void toggleRuntime()}
        >
          {running ? <Square size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}
          {running ? 'Stop' : 'Start'}
        </button>
      </div>

      <PopoverHeading>Worker</PopoverHeading>
      <div className="sys-row">
        <Activity size={14} aria-hidden="true" />
        {/* Not started vs idle needs a worker-state call that does not exist yet
            (`api.workerStatus`); until integration we report what we can prove. */}
        <span>{busy ? `Busy — ${busy}` : 'Idle'}</span>
      </div>

      <PopoverHeading>Caches</PopoverHeading>
      <div className="sys-row sys-muted">
        <CircleAlert size={14} aria-hidden="true" />
        <span>Not available yet — needs a cache-stats call (DGN-02)</span>
      </div>

      <PopoverSeparator />
      <PopoverItem onClick={() => { setOpen(false); onOpenDiagnostics(); }}>
        Open Diagnostics
      </PopoverItem>
    </Popover>
  );
}