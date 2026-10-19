import { hash, rng } from '../features/explore/exploreFixtures';
import type {
  ExploreFolder,
  ExploreFacetValue,
  ExploreFacets,
  ExploreItem,
  ExploreItemDetail,
  ExplorePage,
  ExploreQuery,
  ExploreRowValues,
  ExploreSource,
  FlagValue,
  LibraryType,
} from '../features/explore/exploreTypes';
import { inFolder } from '../features/explore/exploreModel';
import { passesHiddenFilter } from '../features/explore/flagsModel';
import { DEFAULT_FILTERS_FOR_QUERY } from './queryDefaults';

/**
 * The scale fixture: 12,000 ComfyUI items and a 5 × 30 comic library.
 *
 * It exists for three consumers that must agree with each other:
 *
 * 1. the `/__screens` scenarios, so a screenshot is of the same data every time;
 * 2. the budget harness (`TBL-10`, `B5`), because 12,000 rows is the number the
 *    design names and measuring anything smaller would be measuring the wrong
 *    thing;
 * 3. `PRV-03`'s blur-versus-colour decision, which needs a real 12,000-item
 *    grid to measure, not a 412-item one that fits on screen.
 *
 * **Determinism is the whole point.** Nothing is generated from `Math.random`,
 * `Date.now` or a network call. `itemAt(index)` is pure, so the 9,999th item is
 * the same on every machine, in every browser, on every run — which is what lets
 * two screenshots be compared at all.
 *
 * It is **lazy**: `itemAt(i)` costs O(1) and nothing is materialised until
 * something asks. Building 12,000 objects up front took ~1.4 s and froze the tab
 * on every harness load.
 */

/** The one seed everything derives from. Change it and every screenshot changes. */
export const FIXTURE_SEED = 0x5eed_1234;

/**
 * A frozen clock.
 *
 * Every "3 minutes ago" in the UI is computed from this, not from the real time,
 * so a relative timestamp in a screenshot is the same on a machine in a different
 * timezone. `ASSUMPTION` 5 still holds — the *formatting* uses the system locale;
 * only the instant is fixed.
 */
export const FROZEN_NOW = Date.UTC(2026, 8, 30, 12, 0, 0);

export const COMFY_LIBRARY_ID = 'scale-comfy';
export const COMIC_LIBRARY_ID = 'scale-comic';

export const COMFY_ITEM_COUNT = 12_000;
export const COMIC_SERIES = 5;
export const COMIC_PAGES_PER_SERIES = 30;

const MODELS = [
  'sd_xl_base_1.0.safetensors',
  'dreamshaper_8.safetensors',
  'juggernautXL_v9.safetensors',
  'anything_v5.safetensors',
] as const;
const SAMPLERS = ['dpmpp_2m', 'euler_a', 'ddim', 'uni_pc'] as const;
const LORAS = [
  'add-detail.safetensors',
  'film-grain.safetensors',
  'anime-lineart.safetensors',
  'soft-light.safetensors',
] as const;
const TAGS = [
  'portrait', 'landscape', 'studio', 'night', 'closeup',
  'wide', 'character', 'concept', 'wip', 'refined',
] as const;
const ADJECTIVES = ['soft', 'hard', 'warm', 'cool', 'muted', 'harsh'] as const;
const SUBJECTS = ['portrait', 'street', 'forest', 'interior', 'coastline'] as const;

const DIMENSIONS: Array<[number, number]> = [
  [1024, 1024],
  [832, 1216],
  [1344, 768],
  [1216, 832],
  [768, 1344],
];

/**
 * A procedural thumbnail: shapes plus the item id, so a screenshot is
 * identifiable and a wrong item is obvious at a glance.
 *
 * Drawn as an SVG data URI rather than served, so there is no network and no
 * filesystem — which is what keeps the whole thing read-only and shareable.
 * Deliberately flat and text-light: a `<text>` element costs font resolution per
 * image, and 200 of them took over a second to decode.
 */
export function proceduralThumb(
  seedText: string,
  width: number,
  height: number,
  hue: number,
): string {
  const r = rng(hash(seedText));
  const barCount = 3 + Math.floor(r() * 3);
  let shapes = '';
  for (let i = 0; i < barCount; i += 1) {
    const h = Math.round(height * (0.08 + r() * 0.22));
    const y = Math.round((height / barCount) * i);
    const fill = `hsla(${(hue + i * 24) % 360}, 42%, ${28 + i * 6}%, 0.85)`;
    shapes += `<rect y="${y}" width="${width}" height="${h}" fill="${fill}"/>`;
  }
  const disc = Math.round(Math.min(width, height) * (0.22 + r() * 0.2));
  shapes +=
    `<circle cx="${Math.round(width * (0.3 + r() * 0.4))}" cy="${Math.round(height * 0.4)}" ` +
    `r="${disc}" fill="hsla(${(hue + 180) % 360}, 38%, 62%, 0.7)"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="hsl(${hue}, 32%, 26%)"/>` +
    shapes +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** `FLG-*`: flags are derived from the index so they are stable and testable. */
function flagAt(index: number): FlagValue {
  if (index > 0 && index % 53 === 0) return 'pick';
  if (index > 0 && index % 37 === 0) return 'reject';
  return 'none';
}

function hiddenAt(index: number): boolean {
  return index > 0 && index % 61 === 0;
}

/** The 12,000-item ComfyUI catalogue. Pure and O(1). */
export function comfyItemAt(index: number): ExploreItem {
  const id = `${COMFY_LIBRARY_ID}-i${index}`;
  const r = rng(hash(id));
  const [width, height] = DIMENSIONS[Math.floor(r() * DIMENSIONS.length)];
  const hue = Math.floor(r() * 360);
  const folder = `f${index % 40}`;
  const modified = FROZEN_NOW - index * 3_600_000;

  // Some items are deliberately imperfect, because the states that matter are the
  // ones where data is *absent*: `INS-03` hides those fields, and a fixture where
  // every item is complete cannot show that it does.
  const noMetadata = index % 11 === 0;
  const missingFile = index > 0 && index % 149 === 0;
  const failedStage = index % 23 === 0;
  const staleStage = index % 17 === 0;

  const badges: ExploreItem['badges'] = [];
  if (index % 9 === 0) badges.push('favourite');
  if (staleStage) badges.push('stale');
  if (failedStage) badges.push('failed');
  if (missingFile) badges.push('missing');

  const prompt =
    `${ADJECTIVES[index % ADJECTIVES.length]} ${SUBJECTS[index % SUBJECTS.length]} lighting, ` +
    `${TAGS[index % TAGS.length]}, ${TAGS[(index + 3) % TAGS.length]}, detailed`;

  const row: ExploreRowValues = {
    seriesLabel: null,
    panelCount: null,
    panelStatus: null,
    ocrStatus: null,
    reviewStatus: null,
    rating: index % 7 === 0 ? (index % 5) + 1 : 0,
    favourite: badges.includes('favourite'),
    tags: [TAGS[index % TAGS.length], TAGS[(index + 5) % TAGS.length]],
    model: noMetadata ? null : MODELS[index % MODELS.length],
    sampler: noMetadata ? null : SAMPLERS[index % SAMPLERS.length],
    steps: noMetadata ? null : 20 + (index % 30),
    cfg: noMetadata ? null : Math.round((3 + (index % 80) / 10) * 10) / 10,
    seed: noMetadata ? null : String(1_000_000 + index * 7919),
    loras: noMetadata || index % 3 !== 0 ? [] : [{ name: LORAS[index % LORAS.length], weight: 0.6 }],
    processing: failedStage ? 'failed' : staleStage ? 'stale' : 'ok',
    prompt: noMetadata ? null : prompt,
    text: null,
  };

  return {
    id,
    kind: 'page',
    filename: `render_${String(index + 1).padStart(5, '0')}.png`,
    displayPath: `D:\\Scale\\${folder}\\render_${String(index + 1).padStart(5, '0')}.png`,
    folderIds: [COMFY_LIBRARY_ID, folder],
    width,
    height,
    fileSizeBytes: 180_000 + ((index * 7919) % 4_200_000),
    modifiedAt: new Date(modified).toISOString(),
    generatedAt: new Date(modified - 60_000).toISOString(),
    dominantColor: `hsl(${hue}, 32%, 26%)`,
    thumbnailUrl: missingFile ? null : proceduralThumb(`${id}:t`, 320, Math.round((320 * height) / width), hue),
    previewUrl: missingFile ? null : proceduralThumb(`${id}:p`, width, height, hue),
    badges,
    panelCount: null,
    panelIndex: null,
    parentPageId: null,
    parentSeriesLabel: null,
    missing: missingFile,
    flag: flagAt(index),
    hidden: hiddenAt(index),
    importBatchId: `scale-batch-${Math.floor(index / 100)}`,
    importBatchKind:
      index < 100
        ? 'initial'
        : index < 200
        ? 'discovered'
        : index < 300
        ? 'migrated'
        : 'root_added',
    cataloguedAt: new Date(modified).toISOString(),
    row,
  };
}

export function comfyItemCount(): number {
  return COMFY_ITEM_COUNT;
}

/** One comic page, with known panel boxes. Pure. */
export function comicPageAt(series: number, page: number): ExploreItem {
  const id = `${COMIC_LIBRARY_ID}-s${series}p${page}`;
  const r = rng(hash(id));
  const hue = Math.floor(r() * 360);
  const seriesLabel = `Series ${series + 1}`;
  const filename = `ch-${String(series + 1).padStart(2, '0')}-page-${String(page + 1).padStart(3, '0')}.png`;

  // `STA-23` (pages have no panels), `STA-24` (stale) and `STA-25` (not
  // decomposed) all need to be reachable from the fixture, not only from a real
  // failure.
  const kind =
    page % 9 === 0 ? 'no-panels' : page % 11 === 0 ? 'stale' : page % 7 === 0 ? 'not-decomposed' : 'decomposed';
  const panelCount = kind === 'decomposed' ? 2 + (page % 5) : 0;
  const decomposed = kind === 'decomposed';

  const row: ExploreRowValues = {
    seriesLabel,
    panelCount: decomposed ? panelCount : null,
    panelStatus: kind,
    // `VERIFY` #5 is unresolved, so OCR status exists but **no confidence value**
    // is ever fabricated - `ASSUMPTION` 3 forbids it.
    ocrStatus: page % 4 === 0 ? 'none' : page % 8 === 0 ? 'needsReview' : 'done',
    reviewStatus: page % 5 === 0 ? 'pending' : page % 3 === 0 ? 'reviewed' : 'none',
    rating: page % 6 === 0 ? (page % 5) + 1 : 0,
    favourite: page % 11 === 0,
    tags: [TAGS[page % TAGS.length]],
    model: null,
    sampler: null,
    steps: null,
    cfg: null,
    seed: null,
    loras: [],
    processing: page % 13 === 0 ? 'failed' : 'none',
    prompt: null,
    text: 'Panel text region.',
  };

  return {
    id,
    kind: 'page',
    filename,
    displayPath: `D:\\Scale\\${seriesLabel}\\${filename}`,
    folderIds: [COMIC_LIBRARY_ID, `${COMIC_LIBRARY_ID}-s${series}`],
    width: 1600,
    height: 2400,
    fileSizeBytes: 900_000 + ((page * 131) % 800_000),
    modifiedAt: new Date(FROZEN_NOW - (series * 30 + page) * 7_200_000).toISOString(),
    generatedAt: null,
    dominantColor: `hsl(${hue}, 30%, 24%)`,
    thumbnailUrl: proceduralThumb(`${id}:t`, 320, 480, hue),
    previewUrl: proceduralThumb(`${id}:p`, 1600, 2400, hue),
    badges: decomposed ? ['decomposed'] : [],
    panelCount,
    panelIndex: null,
    parentPageId: null,
    parentSeriesLabel: seriesLabel,
    missing: false,
    flag: 'none',
    hidden: false,
    importBatchId: `scale-batch-${Math.floor(page / 100)}`,
    importBatchKind:
      page < 100
        ? 'initial'
        : page < 200
        ? 'discovered'
        : page < 300
        ? 'migrated'
        : 'root_added',
    cataloguedAt: new Date(FROZEN_NOW - (series * 30 + page) * 7_200_000).toISOString(),
    row,
  };
}

export function comicPageCount(): number {
  return COMIC_SERIES * COMIC_PAGES_PER_SERIES;
}

/** The comic folder tree: one folder per series. */
export function comicFolderTree(): ExploreFolder[] {
  const root: ExploreFolder = {
    id: `${COMIC_LIBRARY_ID}-root`,
    label: 'All series',
    parentId: null,
    isRoot: true,
    count: comicPageCount(),
    status: 'done',
    children: Array.from({ length: COMIC_SERIES }, (_, s) => ({
      id: `${COMIC_LIBRARY_ID}-s${s}`,
      label: `Series ${s + 1}`,
      parentId: `${COMIC_LIBRARY_ID}-root`,
      isRoot: false,
      count: COMIC_PAGES_PER_SERIES,
      status: 'done' as const,
      children: [],
    })),
  };
  return [root];
}

/** The ComfyUI folder tree: 40 folders. */
export function comfyFolderTree(): ExploreFolder[] {
  return [
    {
      id: `${COMFY_LIBRARY_ID}-root`,
      label: 'All items',
      parentId: null,
      isRoot: true,
      count: COMFY_ITEM_COUNT,
      status: 'done',
      children: Array.from({ length: 40 }, (_, f) => ({
        id: `${COMFY_LIBRARY_ID}-f${f}`,
        label: `Folder ${String(f + 1).padStart(2, '0')}`,
        parentId: `${COMFY_LIBRARY_ID}-root`,
        isRoot: false,
        count: Math.floor(COMFY_ITEM_COUNT / 40),
        status: f === 39 ? ('partial' as const) : ('done' as const),
        children: [],
      })),
    },
  ];
}

/** Every comic page, as a flat list. 150 items, so eager generation is fine. */
export function allComicPages(): ExploreItem[] {
  const out: ExploreItem[] = [];
  for (let s = 0; s < COMIC_SERIES; s += 1) {
    for (let p = 0; p < COMIC_PAGES_PER_SERIES; p += 1) out.push(comicPageAt(s, p));
  }
  return out;
}

function libraryOf(libraryId: string): LibraryType {
  return libraryId === COMIC_LIBRARY_ID ? 'comic' : 'comfyui';
}

/**
 * The scale source.
 *
 * It implements the **same** `ExploreSource` interface the real backend is
 * plugged into, so a scenario exercises the real `ExploreScreen` code path rather
 * than a parallel mock of it. `slice` replaces `sort` for the scale library:
 * sorting 12,000 items on every request would dominate the measurement.
 */
export function scaleSource(overrides: Partial<ExploreSource> = {}): ExploreSource {
  return {
    isFixtureData: true,
    libraryType: libraryOf,
    libraryName: (id) =>
      id === COMIC_LIBRARY_ID ? 'Scale comic library' : 'Scale ComfyUI library',
    folderTree: (id) => (id === COMIC_LIBRARY_ID ? comicFolderTree() : comfyFolderTree()),
    async facets(): Promise<ExploreFacets> {
      const v = (values: readonly string[]): ExploreFacetValue[] =>
        values.map((value, i) => ({ value, count: 40 + i * 7 }));
      return {
        model: v(MODELS),
        lora: v(LORAS),
        sampler: v(SAMPLERS),
        dimension: v(DIMENSIONS.map(([w, h]) => `${w} × ${h}`)),
        tags: v(TAGS),
        rating: v(['0', '1', '2', '3', '4', '5']),
        panels: v(['decomposed', 'not', 'no-panels', 'stale']),
        text: v(['done', 'not', 'needs-review']),
      };
    },
    async page(query) {
      const comic = libraryOf(query.libraryId) === 'comic';
      const items = comic ? allComicPages() : undefined;
      const inScope = items
        ? items.filter((i) => inFolder(i, query.folderId, query.includeSubfolders))
        : null;

      // For 12,000 items only the requested window is materialised.
      const start = query.cursor ? Number(query.cursor) : 0;
      const total = inScope
        ? inScope.length
        : countMatching(query);
      const hiddenCount = inScope
        ? inScope.length - inScope.filter((i) => !i.hidden).length
        : 0;
      const visibleTotal = total - hiddenCount;

      const limit = Math.min(query.limit, 200);
      const take = Math.max(0, Math.min(limit, visibleTotal - start));
      const slice: ExploreItem[] = [];
      for (let i = 0; i < take; i += 1) {
        const index = start + i;
        const item = inScope
          ? inScope[index]
          : comfyItemAt(comic ? index : nthMatching(query, index));
        if (item && (inScope ? passesHiddenFilter(item, query.hidden) : true)) slice.push(item);
      }
      const next = start + slice.length;
      const page: ExplorePage = {
        items: slice,
        total: visibleTotal,
        hiddenCount,
        nextCursor: next < visibleTotal ? String(next) : null,
      };
      return page;
    },
    async itemDetail(itemId) {
      const [libraryId, kind, tail] = itemId.split('-');
      void libraryId;
      const item =
        kind === 'i' ? comfyItemAt(Number(tail ?? '0')) : allComicPages()[0];
      return detailFor(item);
    },
    async setFlag() {
      return [];
    },
    async setHidden() {
      return [];
    },
    ...overrides,
  };
}

function countMatching(query: ExploreQuery): number {
  // A cheap upper bound that is exact for the common unfiltered case. Walking
  // 12,000 items to count on every request would be the thing `B5` measures.
  const base = COMFY_ITEM_COUNT;
  const f = query.filters;
  if (f.flag === 'any' && !f.favourite && f.ratingAtLeast === 0 && f.model.length === 0) {
    return base;
  }
  return Math.floor(base / 2);
}

function nthMatching(_query: ExploreQuery, n: number): number {
  return n;
}

function detailFor(item: ExploreItem): ExploreItemDetail {
  return {
    itemId: item.id,
    fileName: item.filename,
    displayPath: item.displayPath,
    format: 'PNG',
    width: item.width,
    height: item.height,
    fileSizeBytes: item.fileSizeBytes,
    modifiedAt: item.modifiedAt,
    addedAt: item.modifiedAt,
    positivePrompt: item.row?.prompt ?? null,
    negativePrompt: item.row?.prompt ? 'blurry, low quality' : null,
    model: item.row?.model ?? null,
    loras: item.row?.loras ?? [],
    sampler: item.row?.sampler ?? null,
    scheduler: item.row?.sampler ? 'karras' : null,
    steps: item.row?.steps ?? null,
    cfg: item.row?.cfg ?? null,
    seed: item.row?.seed ?? null,
    denoise: item.row?.prompt ? 0.85 : null,
    hasWorkflow: Boolean(item.row?.model),
    workflowJson: item.row?.model ? '{\n  "nodes": []\n}' : null,
    workflowNodeCount: item.row?.model ? 6 + (item.row.steps ?? 0) : null,
    existingTags: [...TAGS],
    tags: item.row?.tags ?? [],
    rating: item.row?.rating ?? 0,
    favourite: item.row?.favourite ?? false,
    notes: null,
    sourceUrl: null,
    sourceSite: null,
    creator: null,
    stages: [
      { name: 'Thumbnail', status: 'done', at: item.modifiedAt },
      { name: 'Metadata', status: item.badges.includes('failed') ? 'failed' : 'done', at: item.modifiedAt },
      {
        name: 'Embeddings',
        status: item.badges.includes('stale') ? 'stale' : 'done',
        at: item.modifiedAt,
      },
    ],
    panelStatus: item.row?.panelStatus ?? null,
    panels:
      item.row?.panelStatus === 'decomposed'
        ? Array.from({ length: item.row.panelCount ?? 0 }, (_, i) => ({
            id: `${item.id}-p${i}`,
            index: i + 1,
            width: 320,
            height: 220,
            thumbnailUrl: proceduralThumb(`${item.id}:p${i}`, 320, 220, 20),
          }))
        : [],
    text: item.row?.text ? [{ region: 'Panel 1', text: item.row.text }] : [],
  };
}

export { DEFAULT_FILTERS_FOR_QUERY };