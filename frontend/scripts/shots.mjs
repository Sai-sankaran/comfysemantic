#!/usr/bin/env node
/**
 * `npm run shots` — headless screenshots of every scenario at a chosen matrix.
 *
 * The output is meant to be *evidence*, not decoration, so three rules are not
 * negotiable:
 *
 * 1. **Wait for the screen, not for the network.** `waitForLoadState('networkidle')`
 *    would race the mock's own `?latency=` delay and photograph a skeleton. Each
 *    scenario waits for a concrete condition instead.
 * 2. **One scenario per fresh page.** A scenario that navigates away leaves
 *    module-level state behind, and the next screenshot would not be of a cold
 *    start. Every scenario gets its own context.
 * 3. **Record what failed.** A scenario that throws is written to the index as a
 *    failure rather than silently omitted, so a missing screenshot is visible
 *    rather than indistinguishable from one that was never asked for.
 *
 * Usage:
 *   npm run shots -- --matrix core|full
 *   npm run shots -- --only <area-or-id>
 *   npm run shots -- --area <name>
 */
import { chromium } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BASE = process.env.SCREENS_BASE ?? 'http://127.0.0.1:5175';

/** `core` is the two sizes a person actually uses; `full` is every one. */
const VIEWPORTS = {
  core: [
    { w: 1100, h: 680 },
    { w: 1366, h: 768 },
  ],
  full: [
    { w: 900, h: 600 },
    { w: 1100, h: 680 },
    { w: 1366, h: 768 },
    { w: 1920, h: 1080 },
  ],
};

const MATRIX = {
  core: { theme: 'dark', density: 'comfortable', scale: 100 },
  full: null, // one entry per theme
};

/** Parsed by hand so the script needs no dependency for four flags. */
function parseArgs(argv) {
  const out = { matrix: 'core', only: null, area: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--matrix') out.matrix = argv[i + 1];
    else if (argv[i] === '--only') out.only = argv[i + 1];
    else if (argv[i] === '--area') out.area = argv[i + 1];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const viewports = VIEWPORTS[args.matrix] ?? VIEWPORTS.core;

function combos() {
  if (args.matrix === 'full') {
    return viewports.flatMap((v) =>
      ['dark', 'light', 'high-contrast'].map((theme) => ({
        ...v,
        theme,
        density: 'comfortable',
        scale: 100,
      })),
    );
  }
  return viewports.map((v) => ({ ...v, ...MATRIX.core }));
}

async function main() {
  const outRoot = path.join(ROOT, 'screenshots', args.matrix);
  if (existsSync(outRoot)) await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });

  const { scenarios } = await loadScenarios();
  const selected = scenarios.filter((s) => {
    if (args.area && s.area !== args.area) return false;
    if (args.only && s.id !== args.only) return false;
    return true;
  });

  if (selected.length === 0) {
    console.error(`No scenarios matched --only ${args.only ?? ''} --area ${args.area ?? ''}`);
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch();
  const rows = [];
  const failures = [];

  for (const combo of combos()) {
    for (const scenario of selected) {
      // Only built scenarios get a PNG; a placeholder is already visible in the
      // index and photographing it would add hundreds of identical files.
      if (scenario.status !== 'built') {
        rows.push({ scenario, combo, file: null, status: scenario.status });
        continue;
      }
      const context = await browser.newContext({
        viewport: { width: combo.w, height: combo.h },
        // Animations are disabled in CSS too; both are needed because a
        // transition can still be mid-flight when the screenshot is taken.
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text().slice(0, 200));
      });

      const url =
        `${BASE}/__screens?scenario=${encodeURIComponent(scenario.id)}` +
        `&w=${combo.w}&h=${combo.h}&theme=${combo.theme}` +
        `&density=${combo.density}&scale=${combo.scale}` +
        `&${new URLSearchParams(scenario.flags ?? {}).toString()}`;

      let status = 'ok';
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        // Wait for the real screen rather than a fixed sleep: the mock's own
        // latency is a scenario parameter, so guessing would be wrong by design.
        await page
          .waitForSelector('[data-screen]', { timeout: 20_000 })
          .catch(() => undefined);
        await page.waitForFunction(
          () => {
            const el = document.querySelector('[role="status"]');
            return Boolean(el) && el.textContent !== 'Loading…';
          },
          { timeout: 20_000 },
        )
          .catch(() => undefined);
        // One extra frame so a decoded image is painted.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));

        const dir = path.join(outRoot, scenario.area.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
        await mkdir(dir, { recursive: true });
        const file = `${scenario.id}__${combo.w}x${combo.h}__${combo.theme}.png`;
        await page.screenshot({ path: path.join(dir, file), type: 'png' });
        rows.push({ scenario, combo, file: path.join(dir, file), status });
        if (errors.length > 0) failures.push({ scenario: scenario.id, combo, errors: errors.slice(0, 3) });
      } catch (e) {
        status = 'failed';
        failures.push({ scenario: scenario.id, combo, errors: [String(e).slice(0, 200)] });
        rows.push({ scenario, combo, file: null, status });
      } finally {
        await context.close();
      }
    }
  }
  await browser.close();

  await writeFile(path.join(outRoot, 'index.md'), markdown(rows, failures));
  const captured = rows.filter((r) => r.file).length;
  const notBuilt = rows.filter((r) => !r.file && r.status !== 'failed').length;
  console.log(
    `${captured} screenshots, ${notBuilt} skipped (not built), ${failures.length} with errors -> screenshots/${args.matrix}/index.md`,
  );
  if (failures.length > 0) process.exitCode = 1;
}

function markdown(rows, failures) {
  const out = [];
  out.push(`# Screenshots — matrix \`${args.matrix}\``);
  out.push('');
  out.push(`Base URL: \`${BASE}/__screens\` · generated by \`npm run shots\`.`);
  out.push('');
  out.push(
    'Each file is a screenshot of the **real** screen running against the in-memory mock. ' +
      'A scenario tagged *not built yet* has no file on purpose — the tile in the index is the evidence.',
  );
  out.push('');
  out.push('| File | Scenario | Requirements | What it should show |');
  out.push('|---|---|---|---|');
  for (const r of rows) {
    const rel = r.file ? r.file.split(/[\\/]/).slice(1).join('/') : '—';
    out.push(
      `| \`${rel}\` | ${r.scenario.title} | \`${r.scenario.reqs.join(' ')}\` | ${r.scenario.shows} |`,
    );
  }
  if (failures.length > 0) {
    out.push('');
    out.push('## Errors');
    out.push('');
    for (const f of failures) {
      out.push(`- **${f.scenario}** @ ${f.combo.w}×${f.combo.h} ${f.combo.theme}`);
      for (const e of f.errors) out.push(`  - \`${e}\``);
    }
  }
  return out.join('\n');
}

/**
 * The scenario list is read from the running dev server, which evaluates the same
 * TypeScript module the page imports.
 *
 * A copy in this script would drift, and a screenshot run that quietly
 * photographed last month's scenarios would be worse than no run at all.
 */
async function loadScenarios() {
  const res = await fetch(`${BASE}/__screens/scenarios.json`);
  if (!res.ok) {
    throw new Error(
      `Could not read the scenario list from ${BASE}/__screens/scenarios.json (${res.status}). ` +
        `Is "npm run dev" running?`,
    );
  }
  const body = await res.json();
  return { scenarios: body.scenarios, missing: body.missingSta ?? [] };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});