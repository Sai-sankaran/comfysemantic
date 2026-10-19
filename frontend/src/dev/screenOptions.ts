/**
 * Screen-gallery options: the query string of a `/__screens` deep link.
 *
 * Kept apart from `ScreensApp.tsx` so that file exports only components. That is
 * not cosmetic - a module that mixes components with helpers breaks React Fast
 * Refresh for everything in it, so editing one helper silently full-reloads the
 * page instead of hot-swapping it.
 */
import type { FailMode } from './mockBackend';

export const VIEWPORTS = [
  { w: 900, h: 600 },
  { w: 1100, h: 680 },
  { w: 1366, h: 768 },
  { w: 1920, h: 1080 },
];

export const THEMES = ['dark', 'light', 'high-contrast'] as const;
export const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export const FAIL_MODES = ['none', 'save', 'load', 'preview', 'clipboard', 'runtime'] as const;

export type ScreenTheme = (typeof THEMES)[number];
export type ScreenDensity = (typeof DENSITIES)[number];

export type ScreenOptions = {
  scenario: string;
  w: number;
  h: number;
  theme: ScreenTheme;
  density: ScreenDensity;
  scale: number;
  privacy: 'off' | 'blur' | 'colour';
  latency: number;
  fail: FailMode;
};

export const DEFAULT_OPTIONS: ScreenOptions = {
  scenario: '',
  w: 1366,
  h: 768,
  theme: 'dark',
  density: 'comfortable',
  scale: 100,
  privacy: 'off',
  latency: 0,
  fail: 'none',
};

/**
 * Read the deep link.
 *
 * Every value is validated rather than cast. A scenario deep link is pasted
 * between people and edited by hand, so `?w=abc` and `?theme=neon` have to land on
 * the default instead of producing a zero-width frame or an unstyled one.
 */
export function optionsFromSearch(search: URLSearchParams): ScreenOptions {
  const num = (key: string, fallback: number): number => {
    const n = Number(search.get(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const theme = search.get('theme');
  const density = search.get('density');
  const fail = search.get('fail');
  const privacy = search.get('privacy');
  const latency = Number(search.get('latency'));

  return {
    scenario: search.get('scenario') ?? '',
    w: num('w', DEFAULT_OPTIONS.w),
    h: num('h', DEFAULT_OPTIONS.h),
    theme: THEMES.includes(theme as ScreenTheme) ? (theme as ScreenTheme) : DEFAULT_OPTIONS.theme,
    density: DENSITIES.includes(density as ScreenDensity)
      ? (density as ScreenDensity)
      : DEFAULT_OPTIONS.density,
    scale: num('scale', DEFAULT_OPTIONS.scale),
    privacy: privacy === 'blur' || privacy === 'colour' ? privacy : 'off',
    latency: Number.isFinite(latency) && latency >= 0 ? Math.min(latency, 10_000) : 0,
    fail: (FAIL_MODES as readonly string[]).includes(fail ?? '')
      ? (fail as FailMode)
      : 'none',
  };
}

/** Serialise options back into a link, preserving any scenario-specific flags. */
export function screenUrl(
  options: ScreenOptions,
  extra: Record<string, string> = {},
): string {
  const q = new URLSearchParams({
    scenario: options.scenario,
    w: String(options.w),
    h: String(options.h),
    theme: options.theme,
    density: options.density,
    scale: String(options.scale),
    privacy: options.privacy,
    latency: String(options.latency),
    fail: options.fail,
    ...extra,
  });
  return `/__screens?${q.toString()}`;
}

/** Replace the address bar without adding a history entry per control change. */
export function writeScreenUrl(options: ScreenOptions): void {
  history.replaceState(null, '', screenUrl(options));
}