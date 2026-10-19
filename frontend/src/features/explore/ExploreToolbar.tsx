import { useMemo, useState } from 'react';
import { Button, Checkbox, Popover, PopoverHeading, PopoverItem, Select, Slider } from '../../components/ui';
import {
  activeFilterCount,
  clearAllLabel,
  filterChips,
  removeChip as removeById,
  sortOptions,
  THUMB_MAX,
  THUMB_MIN,
  THUMB_STEP,
  toggleFacetValue,
} from './exploreModel';
import {
  clearQuickFilters,
  hasActiveQuickFilters,
  isQuickFilterActive,
  incompleteStageOptions,
  QUICK_FILTER_ORDER,
  quickFilterLabel,
  setIncompleteStage,
  toggleQuickFilter,
} from './quickFiltersModel';
import {
  EMPTY_FILTERS,
  type ExploreFacets,
  type ExploreFilters,
  type ExploreSort,
  type GridMode,
  type LibraryType,
} from './exploreTypes';

/**
 * The gallery toolbar (design §7.1).
 *
 * The order is the design's, left to right, and it is not arbitrary:
 *
 * 1. **Scope toggle** `Pages | Panels | Both` — comic libraries only (`GAL-19`).
 * 2. **Subfolders** toggle, default on.
 * 3. **Sort** dropdown plus a direction button.
 * 4. **Filter chips** and a **Filters** button opening the facet popover.
 * 5. Right-aligned: **count text**, the **thumbnail size** slider, and the
 *    **grid mode** toggle.
 *
 * The count text sits with the controls that change it, and the slider is the
 * one right-aligned control that affects every cell, so this order keeps the
 * cause next to the effect.
 */
export type ExploreToolbarProps = {
  libraryType: LibraryType;
  scope: 'pages' | 'panels' | 'both';
  onScopeChange: (scope: 'pages' | 'panels' | 'both') => void;
  includeSubfolders: boolean;
  onIncludeSubfoldersChange: (value: boolean) => void;
  sort: ExploreSort;
  sortDescending: boolean;
  onSortChange: (sort: ExploreSort) => void;
  onSortDirectionChange: (descending: boolean) => void;
  filters: ExploreFilters;
  onFiltersChange: (filters: ExploreFilters) => void;
  facets: ExploreFacets | null;
  countLabel: string;
  thumbSize: number;
  onThumbSizeChange: (size: number) => void;
  gridMode: GridMode;
  onGridModeChange: (mode: GridMode) => void;
  /** `E.2` / `TBL-01`: `browse.viewMode`. */
  viewMode: 'grid' | 'table';
  onViewModeChange: (mode: 'grid' | 'table') => void;
  /** `FLG-04`: whether the Hidden view is showing, and how to leave it. */
  hiddenMode: 'exclude' | 'only';
  onToggleHiddenView: () => void;
  /** `FLG-07`: how many rejected items are loaded, for "Hide all rejected". */
  rejectedCount: number;
  onHideAllRejected: () => void;
  /** `GAL-22`: the one-time message naming a filter dropped as incompatible. */
  droppedFilter: string | null;
  onDismissDroppedFilter: () => void;
};

export function ExploreToolbar(props: ExploreToolbarProps) {
  const [facetsOpen, setFacetsOpen] = useState(false);
  const {
    libraryType,
    scope,
    onScopeChange,
    includeSubfolders,
    onIncludeSubfoldersChange,
    sort,
    sortDescending,
    onSortChange,
    onSortDirectionChange,
    filters,
    onFiltersChange,
    facets,
    countLabel,
    thumbSize,
    onThumbSizeChange,
    gridMode,
    onGridModeChange,
    viewMode,
    onViewModeChange,
    hiddenMode,
    onToggleHiddenView,
    rejectedCount,
    onHideAllRejected,
    droppedFilter,
    onDismissDroppedFilter,
  } = props;

  const chips = useMemo(() => filterChips(filters), [filters]);
  const count = activeFilterCount(filters);
  const comic = libraryType === 'comic';
  const sortList = useMemo(
    // `GAL-13`: "Generated date (only if present)". The fixture always has one
    // for ComfyUI; a library with none omits it rather than offering an empty sort.
    () => sortOptions(libraryType, true),
    [libraryType],
  );

  return (
    <div className="explore-toolbar" role="toolbar" aria-label="Gallery controls">
      {comic ? (
        <div className="scope-toggle" role="radiogroup" aria-label="Scope">
          {(['pages', 'panels', 'both'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={scope === option}
              className={scope === option ? 'active' : ''}
              onClick={() => onScopeChange(option)}
            >
              {option === 'pages' ? 'Pages' : option === 'panels' ? 'Panels' : 'Both'}
            </button>
          ))}
        </div>
      ) : null}

      <Checkbox
        checked={includeSubfolders}
        onChange={onIncludeSubfoldersChange}
        label="Subfolders"
        ariaLabel="Include subfolders"
      />

      <Select
        aria-label="Sort order"
        value={sort}
        onChange={(event) => onSortChange(event.target.value as ExploreSort)}
        options={sortList.map((option) => ({ value: option.value, label: option.label }))}
      />
      <Button
        variant="ghost"
        className="sort-direction"
        onClick={() => onSortDirectionChange(!sortDescending)}
        title={sortDescending ? 'Descending — click for ascending' : 'Ascending — click for descending'}
        aria-label={sortDescending ? 'Sort descending' : 'Sort ascending'}
      >
        {sortDescending ? '↓' : '↑'}
      </Button>

      <div className="filter-chips" aria-label="Active filters">
        {chips.map((chip) => (
          <span key={chip.id} className="chip removable">
            {chip.label}
            <button
              type="button"
              aria-label={`Remove filter ${chip.label}`}
              onClick={() => onFiltersChange(removeById(filters, chip.id))}
            >
              ×
            </button>
          </span>
        ))}
        {count > 0 ? (
          <Button variant="ghost" onClick={() => onFiltersChange(EMPTY_FILTERS)}>
            {clearAllLabel(count)}
          </Button>
        ) : null}
      </div>

      {/* Quick Filters (QFL-01..QFL-10) — session-only chips that AND-combine
          with other filters. They sit between the facet filter chips and the
          Filters button because they are always visible and always available,
          unlike the facet filters which require the popover. */}
      <QuickFilterStrip
        filters={filters}
        libraryType={libraryType}
        onFiltersChange={onFiltersChange}
      />

      <Popover
        open={facetsOpen}
        onClose={() => setFacetsOpen(false)}
        align="start"
        label="Gallery filters"
        trigger={
          <button type="button" className="btn btn-secondary" onClick={() => setFacetsOpen((v) => !v)}>
            Filters{count > 0 ? ` (${count})` : ''}
          </button>
        }
      >
        <PopoverHeading>Filters</PopoverHeading>
        {facets ? (
          <>
            <FacetGroup
              title="Model"
              values={facets.model}
              selected={filters.model}
              onToggle={(value) => onFiltersChange(toggleFacetValue(filters, 'model', value))}
            />
            <FacetGroup
              title="LoRA"
              values={facets.lora}
              selected={filters.lora}
              onToggle={(value) => onFiltersChange(toggleFacetValue(filters, 'lora', value))}
            />
            <FacetGroup
              title="Sampler"
              values={facets.sampler}
              selected={filters.sampler}
              onToggle={(value) => onFiltersChange(toggleFacetValue(filters, 'sampler', value))}
            />
            <FacetGroup
              title="Tag"
              values={facets.tags}
              selected={filters.tags}
              onToggle={(value) => onFiltersChange(toggleFacetValue(filters, 'tags', value))}
            />
            {/* `FLG-07` / `FLG-08`: the Rejected and Picks filters. A radio
                group rather than checkboxes because `FLG-09` says an item has
                exactly one flag — offering them as independent toggles would let
                a user hold both at once, which the data cannot represent. */}
            <fieldset className="facet-group">
              <legend>Flag</legend>
              {(['any', 'pick', 'reject', 'none'] as const).map((value) => (
                <label key={value} className="facet-row">
                  <input
                    type="radio"
                    name="gallery-flag-filter"
                    checked={filters.flag === value}
                    onChange={() => onFiltersChange({ ...filters, flag: value })}
                  />
                  <span>
                    {value === 'any'
                      ? 'Any'
                      : value === 'pick'
                        ? 'Picked'
                        : value === 'reject'
                          ? 'Rejected'
                          : 'No flag'}
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        ) : (
          <p className="hint">Facet counts are not available yet.</p>
        )}
        <PopoverItem onClick={() => onFiltersChange(EMPTY_FILTERS)} disabled={count === 0}>
          Clear all filters
        </PopoverItem>
      </Popover>

      <span className="spacer" />

      {/* GAL-04: the count is always visible, even mid-load. */}
      <span className="explore-count" role="status">
        {countLabel}
      </span>

      <Slider
        ariaLabel="Thumbnail size"
        value={thumbSize}
        onChange={onThumbSizeChange}
        min={THUMB_MIN}
        max={THUMB_MAX}
        step={THUMB_STEP}
        unit=" px"
      />

      {/* `E.2`: the Grid | Table view toggle. It is separate from the Grid mode
          control below because they answer different questions - "table or
          cards?" and "which card layout?" - and the layout control is
          meaningless while the table is showing. */}
      <div className="filter-chips">{/* `FLG-04` / `FLG-07` / `FLG-08`: the Hidden view toggle and the
          batch reject action. They sit next to the Filters button because that is
          where a user looks for "show me something other than everything". */}
        <button
          type="button"
          className={`ghost${hiddenMode === 'only' ? ' active' : ''}`}
          onClick={onToggleHiddenView}
          aria-pressed={hiddenMode === 'only'}
          title={hiddenMode === 'only' ? 'Show all items again' : 'Show only hidden items'}
        >
          {hiddenMode === 'only' ? 'All items' : 'Hidden'}
        </button>
        {rejectedCount > 0 && hiddenMode !== 'only' ? (
          <button
            type="button"
            className="ghost"
            onClick={onHideAllRejected}
            // `FLG-07`: the count is on the button, not only in the tooltip. A
            // bulk hide of an unknown size is the one action here whose reach the
            // user cannot otherwise judge.
            title={`Hide all ${rejectedCount} rejected item${rejectedCount === 1 ? '' : 's'} in this view`}
          >
            Hide {rejectedCount} rejected
          </button>
        ) : null}
      </div>

      <div className="view-mode" role="radiogroup" aria-label="View mode">
        <button
          type="button"
          role="radio"
          aria-checked={viewMode === 'grid'}
          className={viewMode === 'grid' ? 'active' : ''}
          onClick={() => onViewModeChange('grid')}
          title="Grid (Alt+1)"
        >
          Grid
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={viewMode === 'table'}
          className={viewMode === 'table' ? 'active' : ''}
          onClick={() => onViewModeChange('table')}
          title="Table (Alt+2)"
        >
          Table
        </button>
      </div>

      <div className="grid-mode" role="radiogroup" aria-label="Grid mode" hidden={viewMode === 'table'}>
        <button
          type="button"
          role="radio"
          aria-checked={gridMode === 'uniform'}
          className={gridMode === 'uniform' ? 'active' : ''}
          onClick={() => onGridModeChange('uniform')}
          title="Uniform squares"
        >
          Uniform
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={gridMode === 'rows'}
          className={gridMode === 'rows' ? 'active' : ''}
          onClick={() => onGridModeChange('rows')}
          title="Justified rows that keep the aspect ratio"
        >
          Rows
        </button>
      </div>

      {droppedFilter ? (
        <p className="toolbar-notice" role="status">
          The saved filter “{droppedFilter}” does not apply to this library and was
          removed. Your other settings for this folder were kept.
          <button type="button" onClick={onDismissDroppedFilter}>
            Dismiss
          </button>
        </p>
      ) : null}
    </div>
  );
}

/** One facet with its live counts (`GAL-14`). */
function FacetGroup({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string;
  values: Array<{ value: string; count: number }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (values.length === 0) return null;
  return (
    <fieldset className="facet">
      <legend>{title}</legend>
      <div className="facet-values">
        {values.map((entry) => (
          <Checkbox
            key={entry.value}
            checked={selected.includes(entry.value)}
            onChange={() => onToggle(entry.value)}
            label={`${entry.value} (${entry.count})`}
            ariaLabel={`${title} ${entry.value}, ${entry.count} items`}
          />
        ))}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Quick Filters (QFL-01..QFL-10)
// ---------------------------------------------------------------------------

/**
 * The Quick Filter strip — five session-only chips that AND-combine with other
 * filters (`QFL-01`, `QFL-05`). They are always visible and always available,
 * unlike the facet filters which require the popover.
 *
 * `QFL-06`: they are **never** persisted to folder view memory, the launch
 * snapshot or settings. They live only in the current session's navigation
 * history (so Back restores them) and reset on app exit or library change.
 *
 * `QFL-07`: when any chip is active, a **Clear** button appears and the count
 * text names the active filters.
 */
function QuickFilterStrip({
  filters,
  libraryType,
  onFiltersChange,
}: {
  filters: ExploreFilters;
  libraryType: LibraryType;
  onFiltersChange: (filters: ExploreFilters) => void;
}) {
  const hasActive = hasActiveQuickFilters(filters);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="quick-filter-strip" role="group" aria-label="Quick filters">
      {QUICK_FILTER_ORDER.map((id) => {
        const active = isQuickFilterActive(id, filters);
        const label = quickFilterLabel(id, filters);
        const key = `qf-${id}`;

        if (id === 'incomplete') {
          return (
            <div key={key} className="quick-filter-incomplete">
              <button
                type="button"
                className={`chip quick-filter${active ? ' active' : ''}`}
                onClick={() => onFiltersChange(toggleQuickFilter(filters, id))}
                aria-pressed={active}
                title={label}
              >
                {active ? '✓ ' : ''}{label}
              </button>
              {/* `QFL-04`: Incomplete opens a menu for "Any stage" (default) or a
                  specific named stage. */}
              <button
                type="button"
                className="chip quick-filter-menu-trigger"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label="Choose stage for Incomplete filter"
                title="Choose stage"
              >
                ▾
              </button>
              {menuOpen ? (
                <div className="quick-filter-menu" role="menu">
                  {incompleteStageOptions(libraryType).map((stage) => (
                    <button
                      key={stage}
                      type="button"
                      role="menuitemradio"
                      aria-checked={filters.qfIncomplete.stage === stage}
                      onClick={() => {
                        onFiltersChange(setIncompleteStage(filters, stage));
                        setMenuOpen(false);
                      }}
                    >
                      {stage === 'any' ? 'Any stage' : stage}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        }

        return (
          <button
            key={key}
            type="button"
            className={`chip quick-filter${active ? ' active' : ''}`}
            onClick={() => onFiltersChange(toggleQuickFilter(filters, id))}
            aria-pressed={active}
            title={label}
          >
            {active ? '✓ ' : ''}{label}
          </button>
        );
      })}
      {/* `QFL-07`: a Clear button appears when any chip is active. */}
      {hasActive ? (
        <button
          type="button"
          className="chip quick-filter-clear"
          onClick={() => onFiltersChange(clearQuickFilters(filters))}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}