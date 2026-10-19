/**
 * Shared fixtures for the OCR Workbench tests.
 *
 * Everything here is synthetic. No test opens a real image, reaches a real
 * catalog, or calls a real backend: the whole `api` module is replaced, and the
 * regions are literal objects shaped like `dialogue_list` rows.
 *
 * Geometry is chosen so that every expected coordinate is exact and hand-
 * checkable - a 2000x3000 page with regions at known pixel offsets - because
 * the overlay tests are about arithmetic, and arithmetic tests need round
 * numbers.
 *
 * The mocks are declared with `vi.hoisted` so they exist before the component
 * module is imported. `vi.doMock` was tried first and does not work here: it
 * only affects modules resolved after the call, and the component under test is
 * already in the graph by then.
 */
import { vi } from 'vitest';
import type { AppSettings, DialogueUnit } from '../types';

export const PAGE_W = 2000;
export const PAGE_H = 3000;

/**
 * The fake backend.
 *
 * A plain export, not `vi.hoisted`. The `vi.mock` factories in the test files
 * pull this in with a dynamic `await import()`, which evaluates lazily - when
 * the mocked module is first imported - so by then this binding is initialised.
 * That avoids the "cannot export hoisted variable" error while keeping the
 * factory from closing over an uninitialised binding.
 */
export const mocks = {
  dialogueList: vi.fn(),
  dialogueSetText: vi.fn(),
  dialogueSetInk: vi.fn(),
  dialogueSetReviewed: vi.fn(),
  dialogueSetGroup: vi.fn(),
  getAppSettings: vi.fn(),
  setAppSettings: vi.fn(),
  resetAppSettings: vi.fn(),
};

/** The canonical settings the mocked provider reports. */
export const appSettingsState: { current: AppSettings } = {
  current: {
    thumb_fit: 'crop',
    ocr_overlays_visible: true,
    ocr_reading_order_labels: true,
    theme: 'dark',
    density: 'comfortable',
    text_scale: 100,
  },
};

export function region(over: Partial<DialogueUnit> = {}): DialogueUnit {
  return {
    id: 'r1',
    library_id: 'lib1',
    source_image_id: 'img1',
    panel_crop_id: null,
    scope: 'image',
    unit_index: 1,
    x: 100,
    y: 100,
    width: 400,
    height: 200,
    color_signature: '#ffffff',
    color_bucket: 'FF-FF-FF',
    group_id: 'g1',
    group_confidence: 1,
    grouping_method: 'exact_color',
    text: '',
    text_source: 'none',
    confidence: 0,
    ocr_status: 'not_run',
    status: 'ready',
    parent_filename: 'page-01.png',
    parent_path: '/synthetic/page-01.png',
    parent_width: PAGE_W,
    parent_height: PAGE_H,
    ink_rgb: null,
    ink_category: 'unknown',
    ink_confidence: 0,
    ink_multi_colour: false,
    ocr_box_json: null,
    ocr_engine: null,
    ocr_model: null,
    ocr_version: null,
    machine_text: null,
    ink_source: 'machine',
    ink_user_rgb: null,
    ink_user_category: null,
    ink_user_at: null,
    reviewed: 0,
    reviewed_at: null,
    reattachment: null,
    effective_ink_rgb: null,
    effective_ink_category: 'unknown',
    effective_ink_source: 'machine',
    ...over,
  };
}

/** Three regions, well separated, in reading order. */
export function threeRegions(): DialogueUnit[] {
  return [
    region({
      id: 'r1', unit_index: 1, x: 100, y: 100, width: 400, height: 200,
      text: 'FIRST LINE', text_source: 'ocr', machine_text: 'FIRST LINE',
    }),
    region({ id: 'r2', unit_index: 2, x: 800, y: 900, width: 400, height: 200 }),
    region({ id: 'r3', unit_index: 3, x: 1200, y: 2000, width: 300, height: 300 }),
  ];
}

/** Two pages, one region each, so page navigation has something to move between. */
export function twoPages(): DialogueUnit[] {
  return [
    region({ id: 'p1r1', unit_index: 1, source_image_id: 'img1',
             parent_filename: 'page-01.png', parent_path: '/synthetic/page-01.png' }),
    region({ id: 'p2r1', unit_index: 1, source_image_id: 'img2',
             parent_filename: 'page-02.png', parent_path: '/synthetic/page-02.png' }),
  ];
}

export type MockOptions = {
  units?: DialogueUnit[];
  total?: number;
  failText?: boolean;
  failInk?: boolean;
  /** Starting value of the canonical overlay-visibility preference. */
  overlays?: boolean;
};

/** Point the mocked backend at a specific page and behaviour. */
export function installMocks(opts: MockOptions = {}) {
  const units = opts.units ?? threeRegions();
  mocks.dialogueList.mockReset().mockResolvedValue({
    units,
    total: opts.total ?? units.length,
    groups: [],
  });
  mocks.dialogueSetText.mockReset().mockImplementation(async (p: { text: string }) => {
    if (opts.failText) throw new Error('save rejected by the backend');
    return { status: 'ok', action: 'set_text', text: p.text };
  });
  mocks.dialogueSetInk.mockReset().mockImplementation(async () => {
    if (opts.failInk) throw new Error('ink rejected by the backend');
    return { status: 'ok', action: 'ink_approve' };
  });
  mocks.dialogueSetReviewed.mockReset().mockResolvedValue({
    status: 'ok', action: 'set_reviewed', reviewed: true,
  });
  mocks.dialogueSetGroup.mockReset().mockResolvedValue({ status: 'ok', action: 'accept' });

  // The canonical settings store. A quick control writes here, so the overlay
  // toggle is a real write to the same place Settings writes to.
  appSettingsState.current = {
    thumb_fit: 'crop',
    ocr_overlays_visible: opts.overlays ?? true,
    ocr_reading_order_labels: true,
    theme: 'dark',
    density: 'comfortable',
    text_scale: 100,
  };
  mocks.getAppSettings.mockReset().mockImplementation(async () => ({
    settings: { ...appSettingsState.current },
    defaults: { thumb_fit: 'crop', ocr_overlays_visible: true, ocr_reading_order_labels: true, theme: 'dark', density: 'comfortable', text_scale: 100 },
    explicit: { thumb_fit: false, ocr_overlays_visible: false, ocr_reading_order_labels: false, theme: false, density: false, text_scale: false },
  }));
  mocks.setAppSettings.mockReset().mockImplementation(async (partial: Partial<AppSettings>) => {
    Object.assign(appSettingsState.current, partial);
    return {
      settings: { ...appSettingsState.current },
      defaults: { thumb_fit: 'crop', ocr_overlays_visible: true, ocr_reading_order_labels: true, theme: 'dark', density: 'comfortable', text_scale: 100 },
      explicit: { thumb_fit: false, ocr_overlays_visible: false, ocr_reading_order_labels: false, theme: false, density: false, text_scale: false },
    };
  });
  mocks.resetAppSettings.mockReset().mockResolvedValue({
    settings: { thumb_fit: 'crop', ocr_overlays_visible: true, ocr_reading_order_labels: true, theme: 'dark', density: 'comfortable', text_scale: 100 },
    defaults: { thumb_fit: 'crop', ocr_overlays_visible: true, ocr_reading_order_labels: true, theme: 'dark', density: 'comfortable', text_scale: 100 },
    explicit: { thumb_fit: false, ocr_overlays_visible: false, ocr_reading_order_labels: false, theme: false, density: false, text_scale: false },
  });
  return mocks;
}