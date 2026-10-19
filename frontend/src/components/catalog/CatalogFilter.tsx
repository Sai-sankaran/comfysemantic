import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Input, Radio } from '../ui';
import type { CatalogFilters, FacetValue, Facets, ListFilterKey } from '../../types';
import { LIST_FILTER_KEYS } from '../../types';

type FacetSectionProps = {
  title: string;
  values: FacetValue[];
  selected: string[];
  onToggle: (value: string) => void;
  formatValue?: (value: string) => string;
};

function FacetSection({ title, values, selected, onToggle, formatValue }: FacetSectionProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return values;
    return values.filter((v) => v.value.toLowerCase().includes(q));
  }, [values, query]);

  return (
    <div className="facet-section">
      <div className="facet-section-head">
        <span>{title}</span>
        <Badge tone={selected.length > 0 ? 'info' : 'muted'}>
          {selected.length > 0 ? `${selected.length} selected` : `${values.length}`}
        </Badge>
      </div>
      {values.length > 6 && (
        <Input
          className="field"
          placeholder={`Search ${title.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Search ${title}`}
        />
      )}
      <div className="facet-values">
        {filtered.length === 0 ? (
          <p className="muted small">No values.</p>
        ) : (
          filtered.map((v) => (
            <label key={v.value} className="facet-value">
              <Checkbox
                label={
                  <span className="facet-value-label">
                    <span className="facet-value-name">
                      {formatValue ? formatValue(v.value) : v.value}
                    </span>
                    <span className="facet-value-count">{v.count}</span>
                  </span>
                }
                checked={selected.includes(v.value)}
                onChange={() => onToggle(v.value)}
              />
            </label>
          ))
        )}
      </div>
    </div>
  );
}

type NumericFilterKey =
  | 'seed'
  | 'steps'
  | 'cfg'
  | 'denoise';

const NUMERIC_FIELDS: { key: NumericFilterKey; label: string; placeholder: string }[] = [
  { key: 'seed', label: 'Seed', placeholder: 'exact' },
  { key: 'steps', label: 'Steps', placeholder: 'exact' },
  { key: 'cfg', label: 'CFG', placeholder: 'exact' },
  { key: 'denoise', label: 'Denoise', placeholder: 'exact' },
];

export function CatalogFilter({
  facets,
  value,
  onChange,
  onClear,
}: {
  facets: Facets | null;
  value: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
  onClear: () => void;
}) {
  // Only the list-valued filter keys route through `toggle`. Numeric fields
  // are free text (the backend ignores a half-typed value rather than
  // failing) and `has_ocr` is a boolean tri-state, so neither belongs here.
  const toggle = (key: ListFilterKey, raw: string) => {
    const current = (value[key] as string[] | undefined) ?? [];
    const next = current.includes(raw)
      ? current.filter((x: string) => x !== raw)
      : [...current, raw];
    onChange({ ...value, [key as string]: next });
  };

  const activeCount = LIST_FILTER_KEYS.reduce(
    (n, k) => n + ((value[k] as string[] | undefined)?.length ?? 0),
    0,
  );

  const kindValues: FacetValue[] = facets?.kinds ?? [];

  return (
    <div className="catalog-filter">
      <div className="catalog-filter-head">
        <div>
          <strong>Catalog filters</strong>
          <p className="muted small">
            Auto-derived from extracted metadata. Applies to browse and every search mode.
          </p>
        </div>
        <Button variant="ghost" onClick={onClear} disabled={activeCount === 0}>
          Clear
        </Button>
      </div>
      {facets === null ? (
        <p className="muted small">Scanning metadata for categories…</p>
      ) : (
        <>
          <FacetSection
            title="Image kind"
            values={kindValues}
            selected={value.kinds}
            onToggle={(v) => toggle('kinds', v)}
            formatValue={(v) => (v === 'comfy' ? 'ComfyUI image' : v === 'normal' ? 'Normal image' : v)}
          />
          <FacetSection
            title="Checkpoint"
            values={facets.checkpoints}
            selected={value.checkpoints}
            onToggle={(v) => toggle('checkpoints', v)}
          />
          <FacetSection
            title="Sampler"
            values={facets.samplers}
            selected={value.samplers}
            onToggle={(v) => toggle('samplers', v)}
          />
          <FacetSection
            title="LoRA"
            values={facets.loras}
            selected={value.loras}
            onToggle={(v) => toggle('loras', v)}
          />
          <FacetSection
            title="Scheduler"
            values={facets.schedulers ?? []}
            selected={value.schedulers ?? []}
            onToggle={(v) => toggle('schedulers', v)}
          />
          <FacetSection
            title="File extension"
            values={facets.extensions ?? []}
            selected={value.extensions ?? []}
            onToggle={(v) => toggle('extensions', v)}
          />
          <FacetSection
            title="File format"
            values={facets.formats ?? []}
            selected={value.formats ?? []}
            onToggle={(v) => toggle('formats', v)}
          />

          {/* --- status / provenance ------------------------------------- */}
          <div className="facet-section">
            <div className="facet-section-head">
              <span>Generation</span>
              <Badge tone="muted">exact values</Badge>
            </div>
            <div className="numeric-grid">
              {NUMERIC_FIELDS.map(({ key, label, placeholder }) => (
                <label key={key} className="inline">
                  <span className="small muted">{label}</span>
                  <Input
                    className="field"
                    inputMode="numeric"
                    placeholder={placeholder}
                    value={value[key] ?? ''}
                    aria-label={label}
                    onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <p className="muted small">
              Leave blank to ignore. A partially typed or non-numeric value is ignored rather
              than treated as zero.
            </p>
          </div>

          <div className="facet-section">
            <div className="facet-section-head">
              <span>Image size</span>
            </div>
            <div className="numeric-grid">
              <label className="inline">
                <span className="small muted">Width min</span>
                <Input
                  className="field"
                  inputMode="numeric"
                  value={value.min_width ?? ''}
                  aria-label="Minimum width"
                  onChange={(e) => onChange({ ...value, min_width: e.target.value })}
                />
              </label>
              <label className="inline">
                <span className="small muted">Width max</span>
                <Input
                  className="field"
                  inputMode="numeric"
                  value={value.max_width ?? ''}
                  aria-label="Maximum width"
                  onChange={(e) => onChange({ ...value, max_width: e.target.value })}
                />
              </label>
              <label className="inline">
                <span className="small muted">Height min</span>
                <Input
                  className="field"
                  inputMode="numeric"
                  value={value.min_height ?? ''}
                  aria-label="Minimum height"
                  onChange={(e) => onChange({ ...value, min_height: e.target.value })}
                />
              </label>
              <label className="inline">
                <span className="small muted">Height max</span>
                <Input
                  className="field"
                  inputMode="numeric"
                  value={value.max_height ?? ''}
                  aria-label="Maximum height"
                  onChange={(e) => onChange({ ...value, max_height: e.target.value })}
                />
              </label>
            </div>
          </div>

          <FacetSection
            title="OCR status"
            values={facets.ocr_statuses ?? []}
            selected={value.ocr_status ?? []}
            onToggle={(v) => toggle('ocr_status', v)}
          />
          <FacetSection
            title="Lettering ink colour"
            values={facets.ink_categories ?? []}
            selected={value.ink_category ?? []}
            onToggle={(v) => toggle('ink_category', v)}
          />
          <FacetSection
            title="Dialogue grouping"
            values={facets.dialogue_statuses ?? []}
            selected={value.dialogue_status ?? []}
            onToggle={(v) => toggle('dialogue_status', v)}
          />
          <FacetSection
            title="Batch attribution"
            values={facets.attribution_states ?? []}
            selected={value.attribution_state ?? []}
            onToggle={(v) => toggle('attribution_state', v)}
          />

          <div className="facet-section">
            <div className="facet-section-head">
              <span>Text presence</span>
            </div>
            {/* One drawn radio group (`CTL-02`), not three browser-default inputs. */}
            <Radio
              name="has-ocr"
              aria-label="Text presence"
              inline
              value={
                value.has_ocr === undefined || value.has_ocr === null
                  ? 'any'
                  : value.has_ocr
                    ? 'yes'
                    : 'no'
              }
              onChange={(next) => {
                if (next === 'any') {
                  // "Any" means the filter is not set at all, not "set to any".
                  const cleared = { ...value };
                  delete cleared.has_ocr;
                  onChange(cleared);
                  return;
                }
                onChange({ ...value, has_ocr: next === 'yes' });
              }}
              options={[
                { value: 'any', label: 'Any' },
                { value: 'yes', label: 'Has text' },
                { value: 'no', label: 'No text found' },
              ]}
            />
            <p className="muted small">
              &ldquo;No text found&rdquo; means the page was processed and no lettering was
              detected. Use the OCR status filter above to tell that apart from a page that has
              not been processed yet.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
