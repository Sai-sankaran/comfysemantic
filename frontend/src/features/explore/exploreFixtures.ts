import {
  EMPTY_FILTERS,
  type ExploreFacetValue,
  type ExploreFacets,
  type ExploreFolder,
  type ExploreItem,
  type ExploreRowValues,
  type FlagValue,
  type ExploreItemDetail,
  type ExplorePage,
  type ExploreQuery,
  type ExploreSource,
  type LibraryType,
} from './exploreTypes';
import { filterChips, inFolder } from './exploreModel';
import { passesHiddenFilter } from './flagsModel';
import { hasActiveQuickFilters, passesQuickFilters } from './quickFiltersModel';
import type { BuiltinCollectionId } from './builtinCollections';

/**
 * A **deterministic fixture library** for Explore.
 *
 * This is *not* application data. It is a fixed, reproducible stand-in so the
 * screen's layout, selection and states can be developed and tested without
 * waiting for the backend. It is kept behind the same `ExploreSource` interface
 * the real backend will implement, so replacing it touches no component.
 *
 * Everything here is derived from an integer seed, so the same call always
 * produces the same item: the same filename, the same dimensions, the same
 * dominant colour. A gallery that reshuffled between renders could not be
 * tested for anything.
 *
 * `isFixtureData` is exported so a test or a screenshot can assert that the
 * screen is showing a fixture rather than a catalog, and the UI labels it in the
 * toolbar — a fixture must never be mistakable for a real library.
 */

// A tiny deterministic PRNG (mulberry32). Seeded, not random, so the catalogue is
// reproducible across runs and machines.
/**
 * The seeded generator, exported so the scale fixture and the budget harness
 * derive from the *same* numbers rather than each carrying its own copy.
 *
 * One seed, one generator, one catalogue: a screenshot taken today and one taken
 * after a refactor have to show the same pixels, or they are not comparable.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, values: readonly T[]): T {
  return values[Math.floor(rand() * values.length) % values.length];
}

const MODELS = ['sd_xl_base_1.0.safetensors', 'dreamshaper_8.safetensors', 'waiNSFW_700_v14.safetensors', 'anything_v5.safetensors'] as const;
const SAMPLERS = ['dpmpp_2m', 'euler_a', 'ddim', 'uni_pc'] as const;
const SCHEDULERS = ['karras', 'normal', 'simple'] as const;
const LORAS = ['add-detail.safetensors', 'film-grain.safetensors', 'anime-lineart.safetensors', 'soft-light.safetensors'] as const;
const TAGS = ['portrait', 'landscape', 'studio', 'night', 'closeup', 'wide', 'character'] as const;

/**
 * `FLG-07` / `FLG-08`: a file's flag, derived from its name.
 *
 * Deterministic on purpose. A random flag would make any test written against a
 * specific item fail intermittently, and a flag that changes between runs cannot
 * be reasoned about at all.
 */
function flagOf(filename: string): FlagValue {
  if (/[_-]pick\.png$/i.test(filename)) return 'pick';
  if (/[_-]reject\.png$/i.test(filename)) return 'reject';
  return 'none';
}

/**
 * `FLG-02`: hidden items.
 *
 * Only names carrying `hidden` or `omit` are hidden, which keeps the count small
 * and predictable — enough to exercise the Hidden view and the "(N hidden)"
 * count without hiding so much that a test cannot find an ordinary item.
 */
function hiddenOf(filename: string): boolean {
  return /[_-]hidden\.png$/i.test(filename);
}

/**
 * The prompt shown in the table's Prompt column.
 *
 * It is deliberately longer than the cell's 60-character limit, because
 * `TBL-07`'s rule that a prompt is *never* shown unabridged in a cell is only
 * testable when the value would overflow.
 */
const PROMPT_FIXTURE =
  'a portrait of a woman in soft window light, detailed skin, shallow depth of field, film grain, muted palette';

/**
 * A resolvable stand-in for a thumbnail.
 *
 * The real URLs are `cp-thumb://…` / `cp-prev://…`, which only the Tauri image
 * protocol handler resolves. In a plain browser every one of them fails, so the
 * harness showed 40 `ERR_UNKNOWN_URL_SCHEME` errors and a wall of blank cards —
 * which makes the gallery impossible to look at and hides whether `GAL-08`'s
 * fade-in, the `object-position: top` rule and the privacy blur work at all.
 *
 * An inline SVG data URI keeps the contract identical (a string URL on the item,
 * decoded by the browser) while actually rendering. It is deterministic, so the
 * same item always yields the same bytes.
 */
/** Dominant colours chosen to read as plausible image averages, not UI tokens. */
const DOMINANT = ['#3a4a63', '#6b4f3a', '#4a5f42', '#7a3f4f', '#2f3a44', '#5c5470', '#8a7154', '#39505a'] as const;

function placeholderImage(width: number, height: number, colour: string): string {
  // Deliberately flat geometry and **no text**. A `<text>` element forces font
  // resolution and glyph rasterisation per image; with 200 cards on screen that
  // took over a second to decode and left the gallery looking broken. Two rects
  // decode essentially instantly, which is all a placeholder needs to do.
  //
  // The lighter band across the lower third is not decoration: it makes
  // `object-fit: cover` and `object-position: top` visibly different, which is
  // how `GAL-05`'s tall-image rule can be checked by eye.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${colour}"/>` +
    `<rect y="${Math.round(height * 0.66)}" width="${width}" ` +
    `height="${Math.round(height * 0.34)}" fill="rgba(255,255,255,0.10)"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const FOLDER_SHAPE: Array<{ name: string; children: string[] }> = [
  { name: '2026', children: ['January', 'February'] },
  { name: '2025', children: ['Q3', 'Q4', 'Archive'] },
  { name: 'Characters', children: ['Aiko', 'Ren'] },
  { name: 'Sketches', children: [] },
  { name: 'Reference', children: ['Poses', 'Lighting'] },
];

export const FIXTURE_LIBRARIES: Array<{ id: string; name: string; type: LibraryType; itemCount: number }> = [
  { id: 'fx-comfy', name: 'Comfy renders', type: 'comfyui', itemCount: 412 },
  { id: 'fx-comic', name: 'Sample series', type: 'comic', itemCount: 30 },
];

function buildTree(libraryId: string, type: LibraryType): ExploreFolder {
  const rootId = `${libraryId}-root`;
  const makeFolders = (parentId: string, shape: typeof FOLDER_SHAPE, path: string[]): ExploreFolder[] =>
    shape.map((entry) => {
      const id = `${libraryId}-${path.join('-')}-${entry.name}`.toLowerCase();
      const rand = rng(hash(id));
      const children =
        entry.children.length > 0
          ? makeFolders(id, entry.children.map((n) => ({ name: n, children: [] })), [...path, entry.name])
          : [];
      const roll = rand();
      return {
        id,
        label: entry.name,
        parentId,
        isRoot: false,
        // `GAL-14`: a count that cannot be computed in time is omitted, so the
        // tree shows the real number or nothing rather than a wrong one.
        count: roll < 0.08 ? null : Math.floor(4 + rand() * 180),
        // Status is derived from the name where it matters and from the seed
        // otherwise, so a given folder's state is the same on every run — a
        // folder that is "Not checked" today cannot be "Done" tomorrow, or every
        // test written against it becomes intermittent.
        status: entry.name === 'Sketches'
          ? 'unchecked'
          : roll < 0.3
            ? 'partial'
            : roll < 0.85
              ? 'done'
              : roll < 0.95
                ? 'stale'
                : 'failed',
        children,
      };
    });

  const rootStatus = type === 'comic' ? 'partial' : 'done';
  return {
    id: rootId,
    label: 'All items',
    parentId: null,
    isRoot: true,
    count: FIXTURE_LIBRARIES.find((l) => l.id === libraryId)?.itemCount ?? 0,
    status: rootStatus,
    children: makeFolders(rootId, FOLDER_SHAPE, []),
  };
}

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Flatten the tree to the ids a folder filter can test against. */
function folderPaths(tree: ExploreFolder, prefix: string[] = []): string[][] {
  const here = tree.isRoot ? prefix : [...prefix, tree.id];
  return [here, ...tree.children.flatMap((c) => folderPaths(c, here))];
}

function makeItem(
  libraryId: string,
  type: LibraryType,
  index: number,
  path: string[],
): ExploreItem {
  const seed = hash(`${libraryId}:${index}`);
  const rand = rng(seed);
  const comic = type === 'comic';

  // Dimensions include a tall 1:2.5+ case on purpose, because `GAL-05`'s
  // `object-position: top` rule only shows up for extreme aspect ratios.
  const shapes: Array<[number, number]> = [
    [1024, 1024],
    [832, 1216],
    [1344, 768],
    [512, 1408],
    [1216, 832],
    [768, 1344],
  ];
  const [width, height] = pick(rand, shapes);

  const folderLabel = path.length > 0 ? path[path.length - 1] : '';
  // `FLG-07` / `FLG-08`: every 37th file is rejected and every 53rd is picked,
  // by position rather than by the seed. A name- or seed-derived flag would make
  // "the rejected filter lists rejected items" untestable without first finding
  // a file that happens to carry the flag — and that file would move if the
  // catalogue size changed.
  const suffix =
    index % 53 === 0 && index > 0 ? '_pick' : index % 37 === 0 && index > 0 ? '_reject' : '';
  // `FLG-02`: a small fixed set of hidden items, enough to exercise the Hidden
  // view and the "(N hidden)" count without hiding so much that an ordinary item
  // is hard to find.
  const hiddenSuffix = index % 61 === 0 && index > 0 ? '_hidden' : '';
  const name = comic
    ? `chapter-${String(Math.floor(index / 6) + 1).padStart(3, '0')}-page-${String((index % 6) + 1).padStart(2, '0')}${suffix}${hiddenSuffix}.png`
    : `${folderLabel || 'render'}_${String(index + 1).padStart(4, '0')}${suffix}${hiddenSuffix}.png`;

  const roll = rand();
  const badges: ExploreItem['badges'] = [];
  if (roll < 0.12) badges.push('favourite');
  if (comic && roll > 0.25 && roll < 0.85) badges.push('decomposed');
  if (comic && roll >= 0.85 && roll < 0.95) badges.push('needsReview');
  if (roll < 0.08) badges.push('stale');
  if (roll > 0.97) badges.push('failed');
  if (roll > 0.985) badges.push('missing');

  const missing = badges.includes('missing');
  const dominant = pick(rand, DOMINANT);
  // A thumbnail smaller than the source, as `GAL-*` describes: it is a thumbnail
  // store entry, not the original.
  const thumbWidth = 320;
  const thumbHeight = Math.max(1, Math.round((320 * height) / width));

  return {
    id: `${libraryId}-item-${index}`,
    kind: 'page',
    filename: name,
    displayPath: `D:\\ComfyPanel\\${FIXTURE_LIBRARIES.find((l) => l.id === libraryId)?.name ?? libraryId}\\${path.join('\\')}\\${name}`,
    folderIds: path,
    width,
    height,
    fileSizeBytes: Math.floor(180_000 + rand() * 4_200_000),
    modifiedAt: new Date(Date.UTC(2026, 8, 30) - index * 3_600_000).toISOString(),
    generatedAt: comic ? null : new Date(Date.UTC(2026, 8, 29) - index * 3_600_000).toISOString(),
    dominantColor: dominant,
    // A thumbnail URL is deliberately absent for a missing file, so `STA-12` is
    // reachable from the fixture rather than only from a real failure.
    thumbnailUrl: missing ? null : placeholderImage(thumbWidth, thumbHeight, dominant),
    previewUrl: missing ? null : placeholderImage(width, height, dominant),
    badges,
    panelCount: comic ? (badges.includes('decomposed') ? 4 + Math.floor(rand() * 5) : 0) : null,
    panelIndex: null,
    parentPageId: null,
    parentSeriesLabel: null,
    missing,
    // `FLG-01` / `FLG-07` / `FLG-08`: derived from the name so a given file's
    // flag is the same on every run. A random flag would make any test written
    // against a specific item intermittent.
    flag: flagOf(name),
    // `FLG-02`: a small, fixed set of hidden items so the Hidden view, the
    // "(N hidden)" count and the exclusion rule are all reachable.
    hidden: hiddenOf(name),

    // `IMP-01`..`IMP-03`: import batch fields. The fixture assigns:
    // - `initial` for the first 100 items (the original index)
    // - `discovered` for items that would be found by "Check for new files"
    // - `migrated` for items from a hypothetical migration
    // - `root_added` for items from added root folders
    // All get a deterministic `cataloguedAt` based on their index.
    importBatchId: `${libraryId}-batch-${Math.floor(index / 100)}`,
    importBatchKind:
      index < 100
        ? 'initial'
        : index < 200
        ? 'discovered'
        : index < 300
        ? 'migrated'
        : 'root_added',
    cataloguedAt: new Date(Date.UTC(2026, 8, 30) - index * 3_600_000).toISOString(),

    // `TBL-02`: the per-row columns the table renders. A backend would join
    // these in the list query; the fixture derives them from the same seed so the
    // table shows a realistic spread rather than a column of empties.
    row: {
      seriesLabel: comic ? path[0] ?? null : null,
      panelCount: comic ? (badges.includes('decomposed') ? 4 + Math.floor(rand() * 5) : null) : null,
      panelStatus: comic
        ? badges.includes('decomposed')
          ? 'decomposed'
          : 'not-decomposed'
        : null,
      ocrStatus: comic ? pick(rand, ['done', 'none', 'failed', 'needsReview'] as const) : null,
      reviewStatus: comic ? pick(rand, ['none', 'pending', 'reviewed'] as const) : null,
      rating: Math.floor(rand() * 6),
      favourite: badges.includes('favourite'),
      tags: [pick(rand, TAGS), pick(rand, TAGS)],
      model: comic ? null : pick(rand, MODELS),
      sampler: comic ? null : pick(rand, SAMPLERS),
      steps: comic ? null : 20 + Math.floor(rand() * 20),
      cfg: comic ? null : Math.round((4 + rand() * 4) * 10) / 10,
      seed: comic ? null : String(Math.floor(rand() * 4_294_967_295)),
      loras: comic ? [] : [{ name: pick(rand, LORAS), weight: 0.6 + rand() * 0.3 }],
      // `TBL-02`: the *worst* stage status, not the last one.
      processing: badges.includes('failed')
        ? 'failed'
        : badges.includes('stale')
          ? 'stale'
          : comic
            ? 'none'
            : 'ok',
      prompt: comic ? null : PROMPT_FIXTURE,
      text: comic ? 'A shouted word in the second panel.' : null,
    },
  };
}

function makePanel(page: ExploreItem, index: number): ExploreItem {
  const rand = rng(hash(`${page.id}:panel:${index}`));
  return {
    ...page,
    id: `${page.id}-p${index}`,
    kind: 'panel',
    filename: page.filename,
    panelIndex: index + 1,
    parentPageId: page.id,
    parentSeriesLabel: 'Sample series',
    badges: page.badges.filter((b) => b !== 'decomposed'),
    dominantColor: pick(rand, DOMINANT),
    thumbnailUrl: page.thumbnailUrl,
    previewUrl: null,
    row: {
      ...page.row,
      // A panel inherits its page's tags and rating (`FLG-06`), and its own
      // text comes from OCR rather than from a generation record.
      panelStatus: null,
      panelCount: null,
      ocrStatus: pick(rand, ['done', 'none', 'failed'] as const),
      prompt: null,
      text: index === 0 ? 'A shouted word.' : '…',
    } as ExploreRowValues,
  };
}

/** The whole catalogue for one library, computed once and cached. */
const catalogueCache = new Map<string, ExploreItem[]>();

export function fixtureCatalogue(libraryId: string): ExploreItem[] {
  const cached = catalogueCache.get(libraryId);
  if (cached) return applyOverrides(cached);
  const library = FIXTURE_LIBRARIES.find((l) => l.id === libraryId);
  if (!library) return [];
  const tree = buildTree(libraryId, library.type);
  const paths = folderPaths(tree).filter((p) => p.length > 0);
  const items = Array.from({ length: library.itemCount }, (_, index) => {
    // Assign a folder round-robin over the real tree paths, so the tree's counts
    // and the grid actually agree.
    const path = paths.length > 0 ? paths[index % paths.length] : [];
    return makeItem(libraryId, library.type, index, path);
  });
  catalogueCache.set(libraryId, items);
  return applyOverrides(items);
}

/**
 * Applies the session's flag and hidden overrides.
 *
 * A new array is returned rather than mutating the cache, because the cache is
 * shared between every reader and a mutation would be invisible to React's
 * identity checks — the screen would re-query and see an equal array.
 */
function applyOverrides(items: ExploreItem[]): ExploreItem[] {
  if (flagOverrides.size === 0 && hiddenOverrides.size === 0) return items;
  return items.map((item) => ({
    ...item,
    flag: flagOverrides.get(item.id) ?? item.flag,
    hidden: hiddenOverrides.get(item.id) ?? item.hidden,
  }));
}

function matchesFilters(item: ExploreItem, query: ExploreQuery): boolean {
  const f = query.filters;

  // `QFL-05`: all active quick filters are AND-ed with other filters.
  // They apply even when there are no facet filter chips active.
  if (!passesQuickFilters(item, f)) return false;

  if (filterChips(f).length === 0 && !hasActiveQuickFilters(f)) return true;
  // `FLG-07` / `FLG-08`: the Rejected and Picks filters. A rejected item is still
  // in the library and still visible when unfiltered — it is only dimmed.
  if (f.flag !== 'any' && item.flag !== f.flag) return false;
  if (f.model.length > 0) {
    const model = MODELS[hash(item.id) % MODELS.length];
    if (!f.model.includes(model)) return false;
  }
  if (f.sampler.length > 0) {
    const sampler = SAMPLERS[hash(`${item.id}:s`) % SAMPLERS.length];
    if (!f.sampler.includes(sampler)) return false;
  }
  if (f.minWidth !== null && (item.width ?? 0) < f.minWidth) return false;
  if (f.minHeight !== null && (item.height ?? 0) < f.minHeight) return false;
  if (f.favourite && !item.badges.includes('favourite')) return false;
  if (f.tags.length > 0 && !f.tags.every((t) => TAGS.includes(t as (typeof TAGS)[number]))) return false;
  if (f.panels !== 'any') {
    const decomposed = item.badges.includes('decomposed');
    if (f.panels === 'decomposed' && !decomposed) return false;
    if (f.panels === 'not' && decomposed) return false;
    if (f.panels === 'stale' && !item.badges.includes('stale')) return false;
  }
  if (f.text !== 'any') {
    const done = item.badges.includes('decomposed');
    if (f.text === 'done' && !done) return false;
    if (f.text === 'needs-review' && !item.badges.includes('needsReview')) return false;
  }
  return true;
}

function facet(values: readonly string[]): ExploreFacetValue[] {
  return values.map((value) => ({ value, count: 1 + (hash(value) % 40) }));
}

const facetsFor = (type: LibraryType): ExploreFacets =>
  type === 'comic'
    ? {
        model: [],
        lora: [],
        sampler: [],
        dimension: facet(['1024 × 1024', '832 × 1216', '1344 × 768', '512 × 1408']),
        tags: facet(TAGS),
        rating: facet(['0', '1', '2', '3', '4', '5']),
        panels: facet(['decomposed', 'not', 'no-panels', 'stale']),
        text: facet(['done', 'not', 'needs-review']),
      }
    : {
        model: facet(MODELS),
        lora: facet(LORAS),
        sampler: facet(SAMPLERS),
        dimension: facet(['1024 × 1024', '832 × 1216', '1344 × 768', '512 × 1408']),
        tags: facet(TAGS),
        rating: facet(['0', '1', '2', '3', '4', '5']),
      };

/**
 * A small but structurally real ComfyUI workflow graph, for `INS-07`'s read-only
 * JSON dialog. It is deliberately not valid JSON of a real graph — it is a
 * fixture, and it exists so the dialog, the in-dialog search and the node count
 * have something real to operate on.
 */
const FIXTURE_WORKFLOW_JSON = JSON.stringify(
  {
    last_node_id: 9,
    last_link_id: 11,
    nodes: [
      { id: 4, type: 'CheckpointLoaderSimple', widgets_values: ['dreamshaper_8.safetensors'] },
      { id: 6, type: 'CLIPTextEncode', widgets_values: ['a portrait of a woman in soft window light'] },
      { id: 7, type: 'EmptyLatentImage', widgets_values: [832, 1216] },
      { id: 9, type: 'KSampler', widgets_values: [1843523061, 'fixed', 28, 7.5, 'dpmpp_2m', 'karras', 1] },
    ],
    links: [],
    groups: [],
    config: {},
    extra: {},
  },
  null,
  2,
);

export function panelsOf(items: ExploreItem[]): (pageId: string) => ExploreItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return (pageId: string) => {
    const page = byId.get(pageId);
    if (!page || !page.panelCount) return [];
    return Array.from({ length: page.panelCount }, (_, i) => makePanel(page, i));
  };
}

/**
 * Session overlays for `setFlag` / `setHidden`.
 *
 * `fixtureCatalogue` is cached and its items are shared, so a flag set in the UI
 * would either mutate the cache permanently (leaking between tests) or do nothing
 * at all. A separate overlay map is read when an item is served, so a reset is a
 * `clear()` rather than a rebuild.
 */
const flagOverrides = new Map<string, FlagValue>();
const hiddenOverrides = new Map<string, boolean>();

export function flagOverlay(): Map<string, FlagValue> {
  return flagOverrides;
}
export function hiddenOverlay(): Map<string, boolean> {
  return hiddenOverrides;
}

/** Clears both overlays. Test-only; a real session keeps them for its lifetime. */
export function resetFixtureFlags(): void {
  flagOverrides.clear();
  hiddenOverrides.clear();
}

/**
 * The fixture source.
 *
 * It honours the same pagination contract as the backend — a 200-item page and a
 * keyset cursor — so the screen's loading, end-of-list and retry behaviour is
 * exercised for real rather than assumed.
 */
export const FIXTURE_SOURCE: ExploreSource = {
  isFixtureData: true,

  libraryType(libraryId) {
    return FIXTURE_LIBRARIES.find((l) => l.id === libraryId)?.type ?? 'comfyui';
  },

  libraryName(libraryId) {
    return FIXTURE_LIBRARIES.find((l) => l.id === libraryId)?.name ?? 'Fixture library';
  },

  folderTree(libraryId) {
    return [buildTree(libraryId, this.libraryType(libraryId))];
  },

  async facets(query) {
    return Promise.resolve(facetsFor(this.libraryType(query.libraryId)));
  },

  async page(query) {
    // The scope, the hidden mode and the filter are applied separately, because
    // `GAL-04`'s total is the *unfiltered* count and `FLG-05` needs the hidden
    // count reported beside it: the label has to read "37 of 412", and a source
    // that returned the filtered count here would say "104 of 104".
    const inScope = fixtureCatalogue(query.libraryId).filter(
      (item) => item.kind === 'page' && inFolder(item, query.folderId, query.includeSubfolders),
    );
    // `FLG-02`: hidden items are in no result set; `FLG-04`'s Hidden view asks
    // for exactly them.
    const scoped = inScope.filter((item) => passesHiddenFilter(item, query.hidden ?? 'exclude'));
    const hiddenCount = inScope.length - scoped.length;

    // `COL-10`..`COL-18`: handle built-in collection filters.
    // These are encoded in `query.filters` with a `_builtin` marker.
    const builtinFilter = (query.filters as any)._builtin as BuiltinCollectionId | undefined;
    const recentDays = (query.filters as any)._recentDays as number | undefined;

    const all = scoped.filter((item) => {
      if (!matchesFilters(item, query)) return false;
      if (!builtinFilter) return true;

      const libraryType = FIXTURE_LIBRARIES.find((l) => l.id === query.libraryId)?.type ?? 'comfyui';
      const cat = new Date(item.cataloguedAt ?? item.modifiedAt).getTime();
      const now = Date.UTC(2026, 8, 30); // fixture's "now"
      const daysAgo = (now - cat) / (1000 * 60 * 60 * 24);

      switch (builtinFilter) {
        case 'recently-added':
          // `COL-12` / `IMP-02`: `catalogued_at` in the last N days AND
          // `import_batch_kind = discovered`
          return (
            item.importBatchKind === 'discovered' &&
            daysAgo <= (recentDays ?? 30)
          );
        case 'recently-viewed':
          // `COL-13`: `last_viewed_at` in the last N days.
          // Fixture doesn't track last_viewed_at; fall back to cataloguedAt.
          return daysAgo <= (recentDays ?? 30);
        case 'unrated':
          // `COL-16`: `rating = 0`
          return (item.row?.rating ?? 0) === 0;
        case 'needs-ocr':
          // `COL-17`: comic only, `ocrStatus = none` or `needsReview`
          return (
            libraryType === 'comic' &&
            (item.row?.ocrStatus === 'none' || item.row?.ocrStatus === 'needsReview')
          );
        case 'not-decomposed':
          // `COL-18`: comic only, `panelStatus = not-decomposed`
          return (
            libraryType === 'comic' &&
            item.row?.panelStatus === 'not-decomposed'
          );
        case 'all-images':
        case 'favourites':
        case 'picks':
          // These are handled by the regular filters (favourite, flag, etc.)
          return true;
      }
      return true;
    });

    const start = query.cursor ? Number(query.cursor) : 0;
    const slice = all.slice(start, start + query.limit);
    const next = start + query.limit;
    return Promise.resolve({
      items: slice,
      total: scoped.length,
      hiddenCount,
      nextCursor: next < all.length ? String(next) : null,
    });
  },

  /**
   * `FLG-01` / `FLG-09`.
   *
   * The fixture keeps a mutable overlay so a flag set in the UI actually sticks
   * for the session — otherwise the flag buttons would appear to do nothing and
   * every "flag it then check the badge" test would be testing a no-op.
   */
  async setFlag(itemIds, flag) {
    const overlay = flagOverlay();
    const changed: string[] = [];
    for (const id of itemIds) {
      const current = overlay.get(id);
      if (current === flag) continue;
      overlay.set(id, flag);
      changed.push(id);
    }
    return Promise.resolve(changed);
  },

  /** `FLG-03`: hiding never touches a file, only the flag the catalog returns. */
  async setHidden(itemIds, hidden) {
    const overlay = hiddenOverlay();
    const changed: string[] = [];
    for (const id of itemIds) {
      const current = overlay.get(id) ?? false;
      if (current === hidden) continue;
      overlay.set(id, hidden);
      changed.push(id);
    }
    return Promise.resolve(changed);
  },

  async itemDetail(itemId) {
    const [libraryId, , indexText] = itemId.split('-');
    const index = Number(indexText ?? '0');
    const item = fixtureCatalogue(libraryId)[index];
    if (!item) throw new Error(`no fixture item ${itemId}`);
    const rand = rng(hash(item.id));
    const comic = this.libraryType(libraryId) === 'comic';
    return Promise.resolve({
      itemId: item.id,
      fileName: item.filename,
      displayPath: item.displayPath,
      format: 'PNG',
      width: item.width,
      height: item.height,
      fileSizeBytes: item.fileSizeBytes,
      modifiedAt: item.modifiedAt,
      addedAt: item.modifiedAt,
      positivePrompt: comic
        ? null
        : 'a portrait of a woman in soft window light, detailed skin, shallow depth of field, film grain',
      negativePrompt: comic ? null : 'blurry, low quality, extra fingers',
      model: comic ? null : pick(rand, MODELS),
      loras: comic ? [] : [{ name: pick(rand, LORAS), weight: 0.6 + rand() * 0.3 }],
      sampler: comic ? null : pick(rand, SAMPLERS),
      scheduler: comic ? null : pick(rand, SCHEDULERS),
      steps: comic ? null : 20 + Math.floor(rand() * 20),
      cfg: comic ? null : 4 + rand() * 4,
      seed: comic ? null : String(Math.floor(rand() * 4_294_967_295)),
      denoise: comic ? null : rand(),
      hasWorkflow: !comic && rand() > 0.35,
      workflowJson: comic || rand() <= 0.35 ? null : FIXTURE_WORKFLOW_JSON,
      workflowNodeCount: comic ? null : 6 + Math.floor(rand() * 20),
      existingTags: [...TAGS],
      tags: [pick(rand, TAGS), pick(rand, TAGS)],
      rating: Math.floor(rand() * 6),
      favourite: item.badges.includes('favourite'),
      notes: null,
      sourceUrl: comic ? 'https://example.invalid/series/1' : null,
      sourceSite: comic ? 'example.invalid' : null,
      creator: comic ? 'Studio Example' : null,
      stages: [
        { name: 'Thumbnail', status: 'done', at: item.modifiedAt },
        { name: 'Metadata', status: item.badges.includes('failed') ? 'failed' : 'done', at: item.modifiedAt },
        {
          name: 'Embeddings',
          status: item.badges.includes('stale') ? 'stale' : comic ? 'skipped' : 'done',
          at: item.modifiedAt,
          ...(item.badges.includes('failed') ? { error: 'Model runtime was not available.' } : {}),
        },
      ],
      panelStatus: comic
        ? item.badges.includes('decomposed')
          ? 'decomposed'
          : item.badges.includes('stale')
            ? 'stale'
            : 'not-decomposed'
        : null,
      panels: comic
        ? Array.from({ length: item.panelCount ?? 0 }, (_, i) => ({
            id: `${item.id}-p${i}`,
            index: i + 1,
            width: 512,
            height: 720,
            thumbnailUrl: `cp-thumb://${item.id}/p/${i}`,
          }))
        : [],
      text: comic
        ? [
            { region: 'Panel 1', text: 'You made it!' },
            { region: 'Panel 2', text: 'I told you it would work.' },
            { region: 'Page', text: 'Later that evening…' },
          ]
        : [],
    } satisfies ExploreItemDetail);
  },
};

/** `GAL-04`'s "1,000+" branch, reachable on demand for the tests. */
export const EXPLORE_NULL_TOTAL = 'null-total';

/** A source that behaves exactly like the fixture but cannot count. */
export const FIXTURE_SOURCE_NO_COUNT: ExploreSource = {
  ...FIXTURE_SOURCE,
  isFixtureData: true,
  async page(query: ExploreQuery): Promise<ExplorePage> {
    const page = await FIXTURE_SOURCE.page(query);
    return { ...page, total: null };
  },
};

/** `STA-05`: a source whose list request fails, for the error state. */
export const FAILING_SOURCE: ExploreSource = {
  ...FIXTURE_SOURCE,
  isFixtureData: true,
  async page(): Promise<ExplorePage> {
    return Promise.reject(new Error('The catalog is locked by another window.'));
  },
};

export const FIXTURE_EMPTY_LIBRARY = 'fx-empty';

export function fixtureLibraryIds(): string[] {
  return FIXTURE_LIBRARIES.map((l) => l.id);
}

export { EMPTY_FILTERS };