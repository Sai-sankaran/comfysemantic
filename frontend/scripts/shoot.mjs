#!/usr/bin/env node
/**
 * `scripts/shoot.mjs` — automated screenshots for `/__screens` gallery.
 *
 * Starts `npm run dev`, visits every scenario in `scenarios.ts`,
 * captures PNGs at fixed viewport, and saves them by scenario ID.
 *
 * The theme is applied through the `?theme=` query parameter, which drives
 * `data-theme` on `<html>`. Playwright's `colorScheme` is set to match so that
 * native form controls and scrollbars agree, but it is *not* what selects the
 * palette - relying on it alone is what made every dark/light pair come out as
 * two identical dark PNGs.
 *
 * Usage:
 *   node scripts/shoot.mjs [--theme dark|light|high-contrast] [--out dir] [--zip]
 *   node scripts/shoot.mjs --list
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FRONTEND = ROOT;
const OUT_DIR = path.join(ROOT, 'screenshots');

/** Themes captured for every key screen, regardless of `--theme`. */
const THEMES_FOR_SHOTS = ['dark', 'light'];

// Key screens that get light/high-contrast variants
const KEY_SCREENS = new Set([
  'search-smart',
  'search-no-matches',
  'search-similar',
  'pipeline-presets-comfyui',
  'pipeline-stage-list',
  'pipeline-job-running',
  'pipeline-job-failed',
  'pipeline-tray',
  'relations-inspector-comfyui',
  'relations-broken',
  'explore-grid',
]);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { theme: 'dark', out: OUT_DIR, zip: false, list: false, only: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--theme') opts.theme = args[++i];
    else if (a === '--out') opts.out = args[++i];
    else if (a === '--zip') opts.zip = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--only') opts.only = args[++i];
  }
  return opts;
}

async function startDevServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', 'dev', '--', '--port', '5175', '--host', '127.0.0.1'], {
      cwd: FRONTEND,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let ready = false;
    const timeout = setTimeout(() => {
      if (!ready) {
        proc.kill();
        reject(new Error('Dev server did not start in 60s'));
      }
    }, 60000);

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      if (text.includes('ready in') || text.includes('Local:')) {
        ready = true;
        clearTimeout(timeout);
        resolve(proc);
      }
    });
    proc.stderr.on('data', (data) => {
      console.error('[dev]', data.toString());
    });
    proc.on('exit', (code) => {
      if (!ready) {
        clearTimeout(timeout);
        reject(new Error(`Dev server exited with code ${code}`));
      }
    });
  });
}

async function captureScreenshots(baseUrl, scenarios, options) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: options.theme === 'high-contrast' ? 'dark' : options.theme,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Wait for dev server to be ready
  await page.goto(baseUrl + '/__screens', { waitUntil: 'networkidle', timeout: 30000 });

  const results = [];

  // Filter scenarios based on options
  let scenariosToCapture = scenarios.filter(s => s.status === 'built');
  if (options.only) {
    const onlyIds = new Set(options.only.split(',').map(s => s.trim()));
    scenariosToCapture = scenariosToCapture.filter(s => onlyIds.has(s.id));
  }

  console.log(`  Will capture ${scenariosToCapture.length} scenarios...`);

  for (const scenario of scenariosToCapture) {
    console.log(`  Capturing ${scenario.id}...`);

    // Each theme gets its own pass. `data-theme` is a real stylesheet switch,
    // so the same context is reused across themes and only the URL changes -
    // no second browser context, and no risk of the two passes diverging in
    // viewport or device scale.
    const themes = KEY_SCREENS.has(scenario.id) ? THEMES_FOR_SHOTS : [options.theme];

    for (const theme of themes) {
      const url = `${baseUrl}/__screens${scenarioUrl(scenario.id, scenario.flags, theme)}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForSelector('.screen-frame', { timeout: 10000 });
        // The root element must actually carry the requested theme, otherwise the
        // capture is silently a second copy of the default theme.
        const applied = await page.evaluate(() => document.documentElement.dataset.theme);
        if (applied !== theme) {
          console.error(`  FAILED ${scenario.id} [${theme}]: root theme is "${applied}"`);
          continue;
        }
        await sleep(500); // Let animations settle

        const outPath = path.join(options.out, `${scenario.id}-${theme}.png`);
        await page.screenshot({ path: outPath, fullPage: true });
        results.push({ id: `${scenario.id}-${theme}`, path: outPath });
      } catch (e) {
        console.error(`  FAILED ${scenario.id} [${theme}]: ${e.message}`);
      }
    }
  }

  await browser.close();
  return results;
}

function scenarioUrl(id, flags, theme) {
  // The app's theme comes from `?theme=` (it drives `data-theme` on the root
  // element), *not* from Playwright's `colorScheme`. Passing `colorScheme` alone
  // produced a dark capture for `--theme light` - the two files were identical
  // bytes.
  const params = new URLSearchParams({ scenario: id });
  if (theme) params.set('theme', theme);
  if (flags) {
    for (const [k, v] of Object.entries(flags)) params.set(k, v);
  }
  return `?${params.toString()}`;
}

async function zipResults(outDir, results) {
  const archiver = (await import('archiver')).default;
  const output = fs.createWriteStream(path.join(ROOT, 'screenshots.zip'));
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);

  for (const r of results) {
    archive.file(r.path, { name: path.relative(outDir, r.path) });
  }

  await archive.finalize();
  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
  });
}

async function main() {
  const options = parseArgs();

  if (options.list) {
    // Load scenarios from the frontend
    const scenariosModule = await import('file://' + path.join(FRONTEND, 'src/dev/scenarios.ts'));
    const scenarios = scenariosModule.allScenarios();
    const built = scenarios.filter(s => s.status === 'built');
    console.log('Built scenarios:');
    for (const s of built) {
      console.log(`  ${s.id} (${s.area}) - ${s.title}`);
    }
    return;
  }

  // Ensure output dir
  if (!fs.existsSync(options.out)) fs.mkdirSync(options.out, { recursive: true });

  console.log('Starting dev server...');
  const devProc = await startDevServer();
  console.log('Dev server ready');

  try {
    // Load scenarios
    const scenariosModule = await import('file://' + path.join(FRONTEND, 'src/dev/scenarios.ts'));
    const scenarios = scenariosModule.allScenarios();

    console.log(`Capturing ${scenarios.filter(s => s.status === 'built').length} built scenarios...`);
    const results = await captureScreenshots('http://127.0.0.1:5175', scenarios, {
      ...options,
      out: options.out,
    });

    console.log(`\nCaptured ${results.length} screenshots to ${options.out}`);

    if (options.zip) {
      console.log('Creating zip...');
      await zipResults(options.out, results);
      console.log(`Zip created at ${path.join(ROOT, 'screenshots.zip')}`);
    }
  } finally {
    console.log('Stopping dev server...');
    devProc.kill();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});