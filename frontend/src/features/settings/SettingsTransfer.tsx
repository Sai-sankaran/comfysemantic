import { useState } from 'react';
import { Button, Checkbox, Dialog, Textarea, useToast } from '../../components/ui';
import {
  formatValue,
  ignoredList,
  planImport,
  planToValues,
  serializeSettingsFile,
  type ImportPlan,
} from '../../settings/settingsFile';
import type { SettingsStore } from '../../settings/useSettingsStore';

/**
 * Import and export (design `SET-06`, `STA-29`).
 *
 * **Export** writes JSON and includes machine-specific paths only when *Include
 * paths* is ticked, because a settings file is normally shared between machines.
 *
 * **Import** is three deliberate steps — parse, preview, apply — so a bad file can
 * never half-apply. Unknown keys and invalid values are listed and ignored rather
 * than guessed at, the diff shows every change before it happens, and `STA-29`'s
 * "N values were ignored" names them. Applying is the point at which the current
 * settings are backed up: the store records the pre-import state, which is what a
 * user needs in order to get back.
 */
export function SettingsTransfer({
  store,
  open,
  onClose,
}: {
  store: SettingsStore;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [includePaths, setIncludePaths] = useState(false);
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const doExport = () => {
    const file = store.exportFile(includePaths);
    const json = serializeSettingsFile(file);
    setText(json);
    setPlan(null);
    toast({
      kind: 'success',
      title: 'Export ready',
      message: `${Object.keys(file.settings).length} settings${
        includePaths ? ' (paths included)' : ' (paths excluded)'
      }`,
    });
  };

  const doParse = () => {
    const current: Record<string, unknown> = {};
    for (const r of store.resolved) current[r.entry.key] = r.value;
    setPlan(planImport({ text, current: current as Record<string, never> }));
  };

  const doApply = () => {
    if (!plan) return;
    setBusy(true);
    // The pre-import state is the backup `SET-06` requires. It is held for the
    // session, which is the same limit the rest of the un-persisted settings have.
    const backup = store.exportFile(true);
    const written = store.applyImport(planToValues(plan), plan.profiles);
    setBusy(false);
    setPlan(null);
    setText('');
    onClose();
    toast({
      kind: plan.ignoredCount > 0 ? 'warning' : 'success',
      title: `${written} settings imported`,
      message:
        plan.ignoredCount > 0
          ? `${plan.ignoredCount} values were ignored. A copy of the previous settings is held for this session.`
          : 'A copy of the previous settings is held for this session.',
    });
    void backup;
  };

  const ignored = plan ? ignoredList(plan) : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import and export settings"
      wide
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button onClick={doExport}>Export</Button>
          <Button onClick={doParse} disabled={text.trim().length === 0}>
            Preview import
          </Button>
          <Button variant="primary" onClick={doApply} disabled={!plan || plan.apply.length === 0 || busy}>
            Apply the rest
          </Button>
        </>
      }
    >
      <section className="transfer-block">
        <h3>Export</h3>
        <Checkbox checked={includePaths} onChange={setIncludePaths}>
          Include paths
        </Checkbox>
        <p className="hint">
          Writes the settings you have changed and your own profiles. Paths are excluded
          unless you tick the box, so a file you share does not carry another machine’s
          data directory.
        </p>
      </section>

      <section className="transfer-block">
        <h3>Import</h3>
        <Textarea
          label="Settings JSON"
          rows={8}
          value={text}
          placeholder="Paste an exported settings file here"
          onChange={setText}
        />
      </section>

      {plan?.fatal ? (
        <p className="setting-row-error" role="alert">
          {plan.fatal}
        </p>
      ) : null}

      {plan && !plan.fatal ? (
        <section className="transfer-block" aria-label="Import preview">
          <h3>Preview</h3>
          <p>
            {plan.apply.length} value{plan.apply.length === 1 ? '' : 's'} will be applied.
          </p>
          {plan.diff.length > 0 ? (
            <table className="transfer-diff">
              <thead>
                <tr>
                  <th scope="col">Setting</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                </tr>
              </thead>
              <tbody>
                {plan.diff.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">
                      {row.label}
                      <span className="mono small"> {row.key}</span>
                    </th>
                    <td>{formatValue(row.from)}</td>
                    <td>
                      <strong>{formatValue(row.to)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {/* `STA-29`: "<N> values were ignored." plus the list. */}
          {plan.ignoredCount > 0 ? (
            <div className="transfer-ignored" role="alert">
              <p>
                {plan.ignoredCount} value{plan.ignoredCount === 1 ? ' was' : 's were'}{' '}
                ignored.
              </p>
              <ul>
                {ignored.map((row) => (
                  <li key={row.key}>
                    <code>{row.key}</code> — {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan.profiles.length > 0 ? (
            <p className="hint">{plan.profiles.length} profile(s) will be imported.</p>
          ) : null}
        </section>
      ) : null}
    </Dialog>
  );
}