/**
 * The scenario catalogue for `/__screens`.
 *
 * Two sources, deliberately merged here rather than maintained twice:
 *
 * 1. **Every `STA-*` state**, parsed out of `design.md` §16 at build time. That is
 *    the point: a state added to the specification shows up as a *missing
 *    scenario* rather than quietly never being screenshotted. `missingStaStates()`
 *    is what turns the specification into a progress map.
 * 2. A hand-written list for the states that are not really states — a gallery in
 *    rows mode is not an error state, it is a view.
 *
 * Every scenario carries the requirement IDs it is meant to demonstrate, so the
 * screenshot index is a coverage report rather than a folder of pictures.
 */

export type ScenarioStatus = 'built' | 'partial' | 'not-built';

export type Scenario = {
  id: string;
  title: string;
  /** The grouping shown in the index. */
  area: string;
  /** `STA-*`, `GAL-*`, `TBL-*`… whatever the scenario demonstrates. */
  reqs: string[];
  status: ScenarioStatus;
  /** What the screenshot should show. Used in `screenshots/index.md`. */
  shows: string;
  /** Extra query flags this scenario needs, merged into the deep link. */
  flags?: Record<string, string>;
};

/** `design.md` §16, the state catalogue. Kept as data so it can be diffed. */
export const STA_STATES: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'STA-01', name: 'No library yet' },
  { id: 'STA-02', name: 'Folder has no items (checked)' },
  { id: 'STA-03', name: 'Folder not checked' },
  { id: 'STA-04', name: 'Filters hide everything' },
  { id: 'STA-05', name: 'Failed to load list' },
  { id: 'STA-06', name: 'Library empty (no items at all)' },
  { id: 'STA-07', name: 'Search: no matches' },
  { id: 'STA-08', name: 'Semantic unavailable (runtime off)' },
  { id: 'STA-09', name: 'Semantic partial coverage' },
  { id: 'STA-10', name: 'Model missing' },
  { id: 'STA-11', name: 'Job cannot start' },
  { id: 'STA-12', name: 'Original missing' },
  { id: 'STA-13', name: 'Unreadable/corrupt image' },
  { id: 'STA-14', name: 'Preview generation failed' },
  { id: 'STA-15', name: 'Save failed (notes, tags, text)' },
  { id: 'STA-16', name: 'Unsaved changes' },
  { id: 'STA-17', name: 'Runtime failed to start' },
  { id: 'STA-18', name: 'GPU unavailable' },
  { id: 'STA-19', name: 'Low memory' },
  { id: 'STA-20', name: 'Catalog locked' },
  { id: 'STA-21', name: 'Migration needed' },
  { id: 'STA-22', name: 'Migration failed' },
  { id: 'STA-23', name: 'Pages have no panels' },
  { id: 'STA-24', name: 'Decomposition stale' },
  { id: 'STA-25', name: 'Page not decomposed (panel scope)' },
  { id: 'STA-26', name: 'Export folder invalid' },
  { id: 'STA-27', name: 'Folder not found at launch' },
  { id: 'STA-28', name: 'Library cannot be opened' },
  { id: 'STA-29', name: 'Import settings errors' },
  { id: 'STA-30', name: 'Unknown search field' },
  { id: 'STA-31', name: 'Smart collection has no matches' },
  { id: 'STA-32', name: 'Smart collection failed' },
  { id: 'STA-33', name: 'Duplicate scan running' },
  { id: 'STA-34', name: 'Duplicate scan completed with skipped items' },
  { id: 'STA-35', name: 'Watch-folder changes detected' },
  { id: 'STA-36', name: 'Hidden view is empty' },
  { id: 'STA-37', name: 'No references yet' },
  { id: 'STA-38', name: 'Reference panel changed' },
  { id: 'STA-39', name: 'Referenced library unavailable' },
  { id: 'STA-40', name: 'Recently added is empty' },
  { id: 'STA-41', name: 'Recently viewed is empty' },
  { id: 'STA-42', name: 'Picks is empty' },
  { id: 'STA-43', name: 'Favourites is empty' },
  { id: 'STA-44', name: 'Unrated is empty' },
  { id: 'STA-45', name: 'Needs OCR / Not decomposed is empty' },
  { id: 'STA-46', name: 'Clipboard unavailable' },
  { id: 'STA-47', name: 'Copy too large' },
  { id: 'STA-48', name: 'Not enough disk space' },
  { id: 'STA-49', name: 'Export finished with skips' },
];

/**
 * The `STA-*` states that are actually reachable from a screen today.
 *
 * This is the list a reviewer checks, so it is deliberately conservative: a state
 * is listed only when a scenario reaches it through real UI. Everything absent
 * from it renders as a placeholder tile in the index, which is the honest state of
 * things.
 */
const STA_IMPLEMENTED: Record<string, { scenario: string; area: string; reqs: string[] }> = {
  'STA-02': { scenario: 'explore-empty-folder', area: 'Explore', reqs: ['GAL-03', 'STA-02'] },
  'STA-03': { scenario: 'explore-not-checked', area: 'Explore', reqs: ['GAL-15', 'STA-03'] },
  'STA-04': { scenario: 'explore-filters-empty', area: 'Explore', reqs: ['GAL-14', 'STA-04'] },
  'STA-05': { scenario: 'explore-load-failed', area: 'Explore', reqs: ['GAL-03', 'STA-05'] },
  'STA-12': { scenario: 'explore-file-missing', area: 'Explore', reqs: ['GAL-07', 'STA-12'] },
  'STA-15': { scenario: 'inspector-save-failed', area: 'Inspector', reqs: ['INS-08', 'STA-15'] },
  'STA-23': { scenario: 'inspector-comic-no-panels', area: 'Inspector', reqs: ['INS-10', 'STA-23'] },
  'STA-25': { scenario: 'inspector-comic-not-decomposed', area: 'Inspector', reqs: ['INS-10', 'STA-25'] },
  'STA-29': { scenario: 'settings-import-errors', area: 'Settings', reqs: ['SET-06', 'STA-29'] },
  'STA-36': { scenario: 'explore-hidden-view-empty', area: 'Explore', reqs: ['FLG-04', 'STA-36'] },
};

const MANUAL: Scenario[] = [
  // --- rail destinations ---------------------------------------------------
  { id: 'explore', title: 'Explore', area: 'Rail', reqs: ['NAV-01', 'GAL-01'], status: 'built',
    shows: 'The three-pane gallery with the folder tree, toolbar and inspector.' },
  { id: 'search', title: 'Search', area: 'Rail', reqs: ['SRC-01'], status: 'not-built',
    shows: 'Phase 3. The Smart / Exact / Similar mode switch and the signal line.' },
  { id: 'review', title: 'Review', area: 'Rail', reqs: ['REV-01'], status: 'partial',
    shows: 'Phase 5b. What exists today is the workbench; the queue strip is not built.' },
  { id: 'pipeline', title: 'Pipeline', area: 'Rail', reqs: ['PIP-01'], status: 'partial',
    shows: 'Phase 4. The existing indexing screen, not the three-column PIP layout.' },
  { id: 'settings', title: 'Settings', area: 'Rail', reqs: ['SET-01'], status: 'built',
    shows: 'The registry-driven settings screen with its category list.' },
  { id: 'settings-privacy', title: 'Settings · Privacy', area: 'Rail', reqs: ['PRV-09', 'D-108'], status: 'built',
    shows: 'The eleventh category and PRV-09\'s disclaimer sentence.' },
  { id: 'diagnostics', title: 'Diagnostics', area: 'Rail', reqs: ['DGN-01'], status: 'not-built',
    shows: 'Phase 6. Registered as an action but the page is a placeholder.' },
  { id: 'component-gallery', title: 'Component gallery', area: 'Rail', reqs: ['CTL-01'], status: 'not-built',
    shows: 'Phase 1. Every shared control with its states side by side.' },

  // --- Explore -------------------------------------------------------------
  { id: 'explore-grid', title: 'Explore · grid', area: 'Explore', reqs: ['GAL-05'], status: 'built',
    shows: 'Uniform squares at the default 180 px, filling the available width.' },
  { id: 'explore-rows', title: 'Explore · rows mode', area: 'Explore', reqs: ['GAL-05'], status: 'built',
    shows: 'Justified rows that fill the width without distorting any cell.' },
  { id: 'explore-table', title: 'Explore · table', area: 'Explore', reqs: ['TBL-01', 'TBL-09'], status: 'built',
    shows: 'The same result sequence as a grid, with header buttons and row selection.' },
  { id: 'explore-hidden-view', title: 'Explore · hidden view', area: 'Explore', reqs: ['FLG-04'], status: 'built',
    shows: 'Only hidden items, with the banner and Show again in place of Hide.' },
  { id: 'explore-rejected', title: 'Explore · rejected + picked', area: 'Explore', reqs: ['FLG-07', 'FLG-08'], status: 'built',
    shows: 'Rejected items dimmed to 0.45 with a reject badge; picks badged.' },
  { id: 'explore-filters', title: 'Explore · filters active', area: 'Explore', reqs: ['GAL-14'], status: 'built',
    shows: 'Removable filter chips and an "N of M" count.' },
  { id: 'explore-selection', title: 'Explore · selection bar', area: 'Explore', reqs: ['GAL-23'], status: 'built',
    shows: 'The sticky action bar with inapplicable actions disabled and a reason.' },
  { id: 'explore-lasso', title: 'Explore · lasso', area: 'Explore', reqs: ['GAL-09'], status: 'built',
    shows: 'A rectangle drawn on empty space with the touched cards selected.' },
  { id: 'explore-peek', title: 'Explore · peek', area: 'Explore', reqs: ['GAL-11'], status: 'built',
    shows: 'The centred overlay at 70% of the main surface with ← → to change.' },
  { id: 'explore-folder-tree', title: 'Explore · folder tree', area: 'Explore', reqs: ['LIB-06'], status: 'built',
    shows: 'The tree with counts and §5.7 status dots.' },
  { id: 'explore-privacy-blur', title: 'Explore · privacy blur', area: 'Explore', reqs: ['PRV-03'], status: 'built',
    shows: 'Every thumbnail compositing-blurred; the count is unchanged.', flags: { privacy: 'blur' } },
  { id: 'explore-privacy-colour', title: 'Explore · privacy colour', area: 'Explore', reqs: ['PRV-03'], status: 'built',
    shows: 'Dominant colours only — no image request is issued at all.', flags: { privacy: 'colour' } },
  { id: 'explore-loading', title: 'Explore · loading', area: 'Explore', reqs: ['STA-*'], status: 'built',
    shows: 'Skeleton cells, never a bare spinner. Use ?latency=1500 to hold it.',
    flags: { latency: '1500' } },

  // --- Inspector -----------------------------------------------------------
  { id: 'inspector-comfyui', title: 'Inspector · ComfyUI item', area: 'Inspector', reqs: ['INS-02', 'INS-06'], status: 'built',
    shows: 'Preview, File, Generation, Workflow, Tags & notes, Processing.' },
  { id: 'inspector-comic-page', title: 'Inspector · comic page', area: 'Inspector', reqs: ['INS-10'], status: 'built',
    shows: 'Panels list, grouped OCR text, Decompose / Edit panels.' },
  { id: 'inspector-comic-panel', title: 'Inspector · comic panel', area: 'Inspector', reqs: ['INS-11'], status: 'partial',
    shows: 'The crop box and inherited rating. Selection is a seam until GAL-19 lands.' },
  { id: 'inspector-multi', title: 'Inspector · multi-selection', area: 'Inspector', reqs: ['INS-01'], status: 'built',
    shows: 'A summary card. No metadata is merged or averaged.' },
  { id: 'inspector-references', title: 'Inspector · references', area: 'Inspector', reqs: ['RLN-05'], status: 'not-built',
    shows: 'Phase 2, after relations exist. Relations are fixtures only until then.' },

  // --- Viewer / Compare ----------------------------------------------------
  { id: 'viewer-loading', title: 'Viewer · loading', area: 'Viewer', reqs: ['VWR-02'], status: 'not-built',
    shows: 'Phase 2. Preview-first loading, then original on demand.' },
  { id: 'viewer-zoomed', title: 'Viewer · zoomed', area: 'Viewer', reqs: ['VWR-05'], status: 'not-built',
    shows: 'Phase 2. The zoom model and pan.' },
  { id: 'viewer-error', title: 'Viewer · error', area: 'Viewer', reqs: ['STA-14'], status: 'not-built',
    shows: 'Phase 2. STA-14 in the viewer surface.' },
  { id: 'viewer-info', title: 'Viewer · info panel', area: 'Viewer', reqs: ['VWR-09'], status: 'not-built',
    shows: 'Phase 2. Collapsible metadata beside the image.' },
  { id: 'compare-2up', title: 'Compare · 2-up', area: 'Viewer', reqs: ['CMP-01'], status: 'not-built',
    shows: 'Phase 2. Two images side by side with a difference readout.' },
  { id: 'compare-4up', title: 'Compare · 4-up', area: 'Viewer', reqs: ['CMP-02'], status: 'not-built',
    shows: 'Phase 2. Four-up, the maximum GAL-23 allows.' },

  // --- Search --------------------------------------------------------------
  { id: 'search-smart', title: 'Search · Smart', area: 'Search', reqs: ['SRC-01', 'SRC-02', 'SRC-06', 'SRC-07'], status: 'built',
    shows: 'Smart mode with signal line showing keyword/semantic/visual counts.' },
  { id: 'search-exact', title: 'Search · Exact', area: 'Search', reqs: ['SRC-03', 'SRC-05'], status: 'built',
    shows: 'Exact mode running live (150 ms debounce), signal line shows keyword only.' },
  { id: 'search-similar', title: 'Search · Similar', area: 'Search', reqs: ['SRC-08', 'SRC-14'], status: 'built',
    shows: 'Similar mode with reference chip and cross-library scope toggle.' },
  { id: 'search-runtime-off', title: 'Search · runtime off', area: 'Search', reqs: ['STA-08', 'SRC-07'], status: 'built',
    shows: 'Runtime stopped: semantic signal ineligible with "Start model" action.', flags: { fail: 'semantic' } },
  { id: 'search-partial', title: 'Search · partial coverage', area: 'Search', reqs: ['STA-09', 'SRC-07'], status: 'built',
    shows: 'Partial coverage: some signals skipped with reason disclosed.', flags: { fail: 'visual' } },
  { id: 'search-no-matches', title: 'Search · no matches', area: 'Search', reqs: ['STA-07', 'SRC-13'], status: 'built',
    shows: 'Empty state with suggestions: Clear filters, Switch to Smart, Include panels, Search all libraries.' },
  { id: 'search-saved-history', title: 'Search · saved searches & history', area: 'Search', reqs: ['SRC-11', 'SRC-12'], status: 'built',
    shows: 'Saved searches pinned and recent history dropdown.' },
  { id: 'search-all-libraries', title: 'Search · all libraries', area: 'Search', reqs: ['SRC-14'], status: 'built',
    shows: 'Cross-library scope with library-type icons on cards.' },

  // --- Pipeline ------------------------------------------------------------
  { id: 'pipeline-scope-tree', title: 'Pipeline · scope tree (Select mode)', area: 'Pipeline', reqs: ['PIP-01', 'LIB-07', 'LIB-08'], status: 'built',
    shows: 'Library root with Entire library / Selected folders radio, Selected in Explore, Clear, folder tree with counts.' },
  { id: 'pipeline-presets-comfyui', title: 'Pipeline · presets (ComfyUI)', area: 'Pipeline', reqs: ['PIP-02', 'PIP-06'], status: 'built',
    shows: 'Quick, Full, Thumbnails only, Embeddings only, Use folder policies cards with estimates and model runtime chips.' },
  { id: 'pipeline-presets-comic', title: 'Pipeline · presets (Comic)', area: 'Pipeline', reqs: ['PIP-02', 'PIP-06'], status: 'built',
    shows: 'Quick, Comic, Comic+Panels, Decompose only, OCR only, Embeddings only, Use folder policies.' },
  { id: 'pipeline-stage-list', title: 'Pipeline · stage list', area: 'Pipeline', reqs: ['PIP-03', 'PIP-04'], status: 'built',
    shows: 'Grouped stages with checkboxes, Re-run even if done toggles, Skip completed, model runtime chips.' },
  { id: 'pipeline-summary', title: 'Pipeline · summary (dry run)', area: 'Pipeline', reqs: ['PIP-05', 'PIP-06', 'PIP-07'], status: 'built',
    shows: 'Library, scope, preset, stages, counts (to process / already done / stale / failed), runtime note, estimate, Start button.' },
  { id: 'pipeline-job-running', title: 'Pipeline · running job (drawer)', area: 'Pipeline', reqs: ['PIP-08', 'PIP-09', 'PIP-21'], status: 'built',
    shows: 'Drawer open with Current Job tab: stage progress bar, rate/ETA, Pause/Resume/Stop safely, Retry failures.' },
  { id: 'pipeline-job-paused', title: 'Pipeline · paused job', area: 'Pipeline', reqs: ['PIP-09', 'PIP-21'], status: 'built',
    shows: 'Drawer with paused job, Resume and Stop safely buttons.' },
  { id: 'pipeline-job-failed', title: 'Pipeline · failed job', area: 'Pipeline', reqs: ['STA-11', 'PIP-21'], status: 'built',
    shows: 'Drawer with failures list, per-row Retry, Retry all failures, Copy error.' },
  { id: 'pipeline-job-completed', title: 'Pipeline · completed job', area: 'Pipeline', reqs: ['PIP-23', 'PIP-21'], status: 'built',
    shows: 'Drawer This session tab with completed job outcome, elapsed time, completion toast.' },
  { id: 'pipeline-job-queue', title: 'Pipeline · job queue (drawer)', area: 'Pipeline', reqs: ['PIP-08', 'PIP-21'], status: 'built',
    shows: 'Drawer Queue tab with queued jobs and Cancel buttons.' },
  { id: 'pipeline-tray', title: 'Pipeline · bottom tray', area: 'Pipeline', reqs: ['PIP-20'], status: 'built',
    shows: 'Tray text with stage/count/ETA, Pause/Stop buttons, click opens drawer.' },
  { id: 'pipeline-maintenance', title: 'Pipeline · maintenance actions', area: 'Pipeline', reqs: ['PIP-13'], status: 'built',
    shows: 'Tools expanded: 7 actions (Check new files, Verify files, Integrity check, Verify cached, Rebuild text index, Find duplicates, Clear caches) with Run buttons.' },
  { id: 'pipeline-cropper-lab', title: 'Pipeline · Cropper Lab', area: 'Pipeline', reqs: ['PIP-12', 'CMC-*'], status: 'built',
    shows: 'Tools: Panel Studio card with Run button, add-as-library option.' },
  { id: 'pipeline-empty-queue', title: 'Pipeline · empty queue', area: 'Pipeline', reqs: ['PIP-21'], status: 'built',
    shows: 'Drawer Queue tab empty state: "No jobs — Start a job from the Pipeline screen".' },
  { id: 'pipeline-folder-policies', title: 'Pipeline · folder policies preset', area: 'Pipeline', reqs: ['PIP-11', 'LIB-10'], status: 'built',
    shows: 'Use folder policies preset card showing per-folder stages computed from policies.' },
  { id: 'pipeline-runtime-unavailable', title: 'Pipeline · runtime unavailable', area: 'Pipeline', reqs: ['PIP-24'], status: 'built',
    shows: 'Runtime stopped notice: runtime-dependent stages marked Skipped, others complete.' },
  { id: 'pipeline-scope-folders', title: 'Pipeline · folder scope', area: 'Pipeline', reqs: ['PIP-01', 'LIB-07'], status: 'built',
    shows: 'Selected folders mode with tree showing checkboxes, "N folders — M items" summary.' },

  // --- Relations -----------------------------------------------------------
  { id: 'relations-inspector-comfyui', title: 'Relations · ComfyUI image inspector', area: 'Relations', reqs: ['RLN-05'], status: 'built',
    shows: 'Inspector shows "References (N)" with panel thumbnails, Series/Page chip, note, Remove link (Undo toast).' },
  { id: 'relations-inspector-comic', title: 'Relations · comic panel inspector', area: 'Relations', reqs: ['RLN-05'], status: 'built',
    shows: 'Inspector shows "Used as reference for (N)" with ComfyUI image thumbnails, note, Remove link (Undo toast).' },
  { id: 'relations-broken', title: 'Relations · broken reference (STA-38)', area: 'Relations', reqs: ['RLN-04', 'STA-38'], status: 'built',
    shows: 'Broken relation shows "Reference panel changed — Re-attach / Remove" with reason.' },
  { id: 'relations-cross-library', title: 'Relations · cross-library similar', area: 'Relations', reqs: ['RLN-02', 'SRC-08', 'D-62'], status: 'built',
    shows: 'From ComfyUI image, Similar mode with comic library scope returns panels; Use as reference creates relation.' },
  { id: 'relations-library-removal', title: 'Relations · library removal', area: 'Relations', reqs: ['RLN-07', 'LIB-04'], status: 'built',
    shows: 'Remove library dialog warns "Reference links from other libraries to this library (N) will also be removed."' },

  // --- Review --------------------------------------------------------------
  { id: 'review-queue', title: 'Review · queue strip', area: 'Review', reqs: ['REV-02'], status: 'not-built',
    shows: 'Phase 5b. The Needs Attention landing.' },
  { id: 'review-editing', title: 'Review · editing', area: 'Review', reqs: ['REV-10'], status: 'partial',
    shows: 'The workbench exists; the queue around it does not.' },
  { id: 'review-unsaved', title: 'Review · unsaved changes guard', area: 'Review', reqs: ['NAV-51', 'STA-16'], status: 'not-built',
    shows: 'Phase 5b. STA-16: leaving with unsaved edits.' },
  { id: 'review-save-failed', title: 'Review · save failure', area: 'Review', reqs: ['STA-15'], status: 'not-built',
    shows: 'Phase 5b. STA-15 in the review editor.' },
  { id: 'review-no-regions', title: 'Review · no-regions page', area: 'Review', reqs: ['STA-23'], status: 'partial',
    shows: 'Handled today; the surrounding queue is not built.' },
  { id: 'panel-editor', title: 'Panel editor', area: 'Review', reqs: ['CMC-*'], status: 'not-built',
    shows: 'Phase 5a. Blocked on VERIFY #3 — the cropper contract is unresolved.' },
  { id: 'reader', title: 'Comic reader', area: 'Review', reqs: ['RDR-*'], status: 'not-built',
    shows: 'Phase 5c. Spreads and long strips.' },
  { id: 'cropper-lab', title: 'Cropper Lab', area: 'Review', reqs: ['CMP-LAB'], status: 'not-built',
    shows: 'Phase 5c. Blocked on VERIFY #3.' },

  // --- Dialogs and banners -------------------------------------------------
  { id: 'library-menu', title: 'Library menu', area: 'Dialogs', reqs: ['NAV-08'], status: 'built',
    shows: 'The switcher with library counts and names.' },
  { id: 'manage-libraries', title: 'Manage libraries', area: 'Dialogs', reqs: ['LIB-01'], status: 'not-built',
    shows: 'Phase 2. Add, remove, health and type.' },
  { id: 'add-library-wizard', title: 'Add-library wizard', area: 'Dialogs', reqs: ['LIB-02'], status: 'not-built',
    shows: 'Phase 2. Root selection and indexing options.' },
  { id: 'remove-library', title: 'Remove library', area: 'Dialogs', reqs: ['LIB-04'], status: 'not-built',
    shows: 'Phase 2. States exactly what will and will not be deleted.' },
  { id: 'locked-catalog', title: 'Locked-catalog banner', area: 'Dialogs', reqs: ['STA-20'], status: 'not-built',
    shows: 'Phase 6. STA-20.' },
  { id: 'new-files', title: 'New-files banner', area: 'Dialogs', reqs: ['STA-33'], status: 'not-built',
    shows: 'Phase 6. STA-33 / STA-34.' },
  { id: 'migration', title: 'Migration screen', area: 'Dialogs', reqs: ['STA-21', 'STA-22'], status: 'not-built',
    shows: 'Phase 6. Blocked on O-1 and O-2.' },
  { id: 'welcome', title: 'Welcome screen', area: 'Dialogs', reqs: ['ONB-01'], status: 'not-built',
    shows: 'Phase 6. First run.' },
];

/** Every scenario: the hand-written list plus one row per implemented `STA-*`. */
export function allScenarios(): Scenario[] {
  const fromStates: Scenario[] = Object.entries(STA_IMPLEMENTED).map(([sta, entry]) => {
    const state = STA_STATES.find((s) => s.id === sta);
    return {
      id: entry.scenario,
      title: state?.name ?? sta,
      area: entry.area,
      reqs: [sta, ...entry.reqs.filter((r) => r !== sta)],
      status: 'built' as const,
      shows: `The ${state?.name.toLowerCase() ?? sta} state.`,
    };
  });
  const byId = new Map<string, Scenario>();
  for (const s of [...MANUAL, ...fromStates]) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => a.area.localeCompare(b.area) || a.id.localeCompare(b.id));
}

/** The `STA-*` states with no scenario. These are the ones still to build. */
export function missingStaStates(): string[] {
  return STA_STATES.filter((s) => !(s.id in STA_IMPLEMENTED)).map((s) => s.id);
}

export function scenariosByArea(): Array<{ area: string; scenarios: Scenario[] }> {
  const map = new Map<string, Scenario[]>();
  for (const s of allScenarios()) {
    const list = map.get(s.area) ?? [];
    list.push(s);
    map.set(s.area, list);
  }
  return [...map.entries()].map(([area, scenarios]) => ({ area, scenarios }));
}

/** `TST-33` is explicitly Partial until collections and search exist. */
export function statusTag(s: Scenario): { label: string; tone: string } {
  if (s.status === 'built') return { label: 'Built', tone: 'ok' };
  if (s.status === 'partial') return { label: 'Partial', tone: 'warn' };
  return { label: 'Not built yet', tone: 'muted' };
}