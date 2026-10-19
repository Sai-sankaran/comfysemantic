#!/usr/bin/env node
/**
 * `scripts/build-exe.mjs` — build the working repo's frontend, stage it into the
 * Tauri project, and produce the portable exe.
 *
 * ## Why this script exists
 *
 * The Tauri project (`src-tauri`) and its `tauri.conf.json` live in a **sibling
 * checkout** of the same repository, at `../comfysemanticsearch` relative to this
 * directory by default. That project is where the Rust shell, the bundled backend
 * worker and the llama.cpp runtime live; the UI it embeds is this repo's
 * `frontend/`.
 *
 * Two problems followed from that split, and both are fixed here rather than by
 * hand, because a fix done by hand in the other checkout is lost the next time
 * somebody runs `git checkout`:
 *
 * 1. **Tauri runs `beforeBuildCommand` from the *repository root*, not from
 *    `src-tauri/`.** The committed config said `..\scripts\build-frontend.bat`,
 *    which resolves *outside* the repo, so every build failed with
 *    "The system cannot find the path specified." — even though the batch file
 *    existed and worked when run by hand.
 * 2. **The exe embedded the sibling checkout's older `frontend/`**, so the
 *    shipped UI was months behind this repo and none of the Export work was in
 *    it. Building the exe did not build *this* application.
 *
 * This script builds the frontend here, copies `dist/` across, and only then
 * invokes Tauri — so the exe always contains the code in this working tree.
 *
 * ## Usage
 *
 *   node scripts/build-exe.mjs                 # build frontend + exe
 *   node scripts/build-exe.mjs --skip-frontend # reuse the existing dist/
 *   node scripts/build-exe.mjs --bundle        # also produce installers (slower)
 *   node scripts/build-exe.mjs --no-exe       # stage dist/ only, skip Tauri
 *
 * ## Configuration
 *
 * Point `--tauri-project` at the checkout holding `src-tauri`, or set
 * `TAURI_PROJECT_DIR`. Defaults to `../comfysemanticsearch` when that directory
 * contains `src-tauri`, otherwise the script fails with an explanation rather
 * than building the wrong thing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This file lives at `frontend/scripts/`, so the frontend root is one level up.
const FRONTEND = path.resolve(__dirname, '..');
const ROOT = path.resolve(FRONTEND, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { skipFrontend: false, bundle: false, noExe: false, tauriProject: null };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--skip-frontend') opts.skipFrontend = true;
    else if (a === '--bundle') opts.bundle = true;
    else if (a === '--no-exe') opts.noExe = true;
    else if (a === '--tauri-project') opts.tauriProject = args[++i];
    else if (a.startsWith('--tauri-project=')) opts.tauriProject = a.slice('--tauri-project='.length);
  }
  return opts;
}

function run(command, args, cwd, label) {
  process.stdout.write(`\n> ${label || `${command} ${args.join(' ')}`}\n`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    // On Windows `npm`/`npx` are `.cmd` shims; spawning them without a shell
    // fails with ENOENT.
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${label || command} failed with exit code ${result.status}`);
  }
}

/** Locate the checkout that holds `src-tauri`. */
function resolveTauriProject(explicit) {
  const candidates = [
    explicit,
    process.env.TAURI_PROJECT_DIR,
    // Sibling checkout holding `src-tauri`.
    path.resolve(FRONTEND, '..', '..', 'comfysemanticsearch'),
    path.resolve(FRONTEND, '..', '..', 'semanticsearch'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(path.join(resolved, 'src-tauri', 'tauri.conf.json'))) {
      return resolved;
    }
  }
  throw new Error(
    'Could not find the Tauri project (the checkout containing src-tauri/tauri.conf.json).\n' +
      'Pass --tauri-project <path> or set TAURI_PROJECT_DIR.',
  );
}

/**
 * The marker written into `beforeBuildCommand` while a build is in flight.
 *
 * It exists so an *interrupted* build can be detected. `finally` restores the
 * config when Tauri exits (cleanly or not), but nothing runs when the process is
 * SIGKILLed or the machine is rebooted — and a leaked no-op override silently
 * breaks `tauri dev` for the other checkout afterwards. On the next run we find
 * this marker and restore from the sidecar before doing anything else.
 */
const STUB_MARKER = 'cmd /c exit 0';

/** Where the pre-override config is kept, so a crash can be undone. */
function sidecarPath(configPath) {
  return `${configPath}.buildexe.bak`;
}

/** Where the owning build's PID is recorded, so a live build is not "recovered". */
function lockPath(configPath) {
  return `${configPath}.buildexe.lock`;
}

/**
 * Is a recorded PID a process that is still alive?
 *
 * Used to tell "a build was SIGKILLed, its sidecar is stale" apart from "a build
 * is running right now, its sidecar is current". Two overlapping invocations
 * would otherwise have the second one "recover" the first one's in-progress
 * override and break a build that was succeeding.
 *
 * `process.kill(pid, 0)` throws `ESRCH` when nothing is listening and `EPERM`
 * when the process exists but belongs to someone else — both mean "alive".
 */
export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error && error.code) === 'EPERM';
  }
}

/**
 * Repair a config left patched by a killed build.
 *
 * @returns true if a stale override was found and reverted.
 */
export function recoverStalePatch(configPath) {
  const backup = sidecarPath(configPath);
  if (!fs.existsSync(backup)) return false;

  // A live build owns this sidecar. "Recovering" it would clobber the override a
  // second invocation is relying on mid-build.
  const lock = lockPath(configPath);
  if (fs.existsSync(lock)) {
    const pid = Number.parseInt(fs.readFileSync(lock, 'utf8'), 10);
    if (isProcessAlive(pid)) {
      console.log(
        `Another build (pid ${pid}) is in progress; leaving its in-flight config alone.`,
      );
      return false;
    }
    // The lock is stale too — same crash that left the sidecar.
    fs.rmSync(lock, { force: true });
  }

  const current = fs.readFileSync(configPath, 'utf8');
  // Only touch it if it still carries our no-op; if somebody edited the config
  // in the meantime, their version wins and we drop the sidecar.
  if (current.includes(STUB_MARKER)) {
    fs.writeFileSync(configPath, fs.readFileSync(backup, 'utf8'), 'utf8');
    fs.rmSync(backup, { force: true });
    console.log(`Recovered ${configPath} from an interrupted build.`);
    return true;
  }
  fs.rmSync(backup, { force: true });
  return false;
}

/** Take the build lock, so a concurrent invocation leaves our sidecar alone. */
function takeLock(configPath) {
  const lock = lockPath(configPath);
  if (fs.existsSync(lock)) {
    const pid = Number.parseInt(fs.readFileSync(lock, 'utf8'), 10);
    if (isProcessAlive(pid)) {
      throw new Error(
        `Another build (pid ${pid}) is already running against this config. ` +
          'Wait for it, or delete the stale lock if you are sure it is dead.',
      );
    }
  }
  fs.writeFileSync(lock, String(process.pid), 'utf8');
  return () => fs.rmSync(lock, { force: true });
}

/**
 * Release the lock, and only if it is still ours.
 *
 * A stale lock from a killed build must not be deleted by a *different* live
 * build — the same overlap problem, in the other direction.
 */
function releaseLock(configPath) {
  const lock = lockPath(configPath);
  if (!fs.existsSync(lock)) return;
  const pid = Number.parseInt(fs.readFileSync(lock, 'utf8'), 10);
  if (pid === process.pid) fs.rmSync(lock, { force: true });
}

/**
 * `tauri.conf.json`'s `beforeBuildCommand` runs with the *repository root* as the
 * working directory, not `src-tauri/`. The committed value was
 * `..\scripts\build-frontend.bat`, which resolves outside the repo and fails.
 *
 * We neutralise it rather than "fix" it, because this script already built the
 * frontend: the right command here is "do not rebuild the sibling's frontend,
 * use the dist we just staged". Patching the config in place keeps the change
 * visible in the build log instead of silently mutating another checkout.
 */
function neutraliseBeforeBuild(tauriProject) {
  const configPath = path.join(tauriProject, 'src-tauri', 'tauri.conf.json');
  // Undo anything a previously-killed run left behind before we start.
  recoverStalePatch(configPath);
  // Then claim it, so a second invocation started a moment later does not
  // mistake our live override for a stale one.
  const releaseLock = takeLock(configPath);

  const original = fs.readFileSync(configPath, 'utf8');
  if (!original.includes('beforeBuildCommand')) {
    throw new Error(`${configPath} has no beforeBuildCommand; refusing to guess.`);
  }
  // A no-op that succeeds on Windows.
  const patched = original.replace(
    /"beforeBuildCommand":\s*"[^"]*"/,
    `"beforeBuildCommand": "${STUB_MARKER}"`,
  );
  // The sidecar is what makes a SIGKILL survivable: `finally` will not run, but
  // the next invocation finds this and restores from here.
  fs.writeFileSync(sidecarPath(configPath), original, 'utf8');
  fs.writeFileSync(configPath, patched, 'utf8');

  let restored = false;
  return {
    configPath,
    restore: () => {
      fs.writeFileSync(configPath, original, 'utf8');
      fs.rmSync(sidecarPath(configPath), { force: true });
      restored = true;
      // Only our own lock, and only once the config is back.
      releaseLock(configPath);
    },
    get restored() {
      return restored;
    },
    changed: patched !== original,
    // Exposed so a hard-kill path can still release the lock if it can.
    releaseLock: () => releaseLock(configPath),
  };
}

/** Copy `from` → `to`, replacing `to` wholesale. */
function copyDist(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

/** Copy just the built frontend into the Tauri project and stop. */
export function stageOnly() {
  const opts = parseArgs();
  const tauriProject = resolveTauriProject(opts.tauriProject);
  const dist = path.join(FRONTEND, 'dist');
  if (!fs.existsSync(dist)) {
    throw new Error(`${dist} does not exist. Run the frontend build first.`);
  }
  const target = path.join(tauriProject, 'frontend', 'dist');
  copyDist(dist, target);
  console.log(`Staged ${dist}\n      -> ${target}`);
  return target;
}

function main() {
  const opts = parseArgs();

  if (!opts.skipFrontend) {
    run('npm', ['run', 'build'], FRONTEND, 'build frontend (this repo)');
  }

  const dist = path.join(FRONTEND, 'dist');
  if (!fs.existsSync(dist)) {
    throw new Error(`${dist} does not exist after the frontend build.`);
  }

  const tauriProject = resolveTauriProject(opts.tauriProject);
  const target = path.join(tauriProject, 'frontend', 'dist');
  console.log(`\nTauri project: ${tauriProject}`);
  copyDist(dist, target);
  console.log(`Staged dist -> ${target}`);

  if (opts.noExe) {
    console.log('\n--no-exe: staged the frontend only. Done.');
    return;
  }

  const patch = neutraliseBeforeBuild(tauriProject);
  console.log(`Neutralised beforeBuildCommand in ${patch.configPath}`);
  try {
    const tauriArgs = ['--no-install', 'tauri', 'build'];
    if (!opts.bundle) tauriArgs.push('--no-bundle');
    run('npx', tauriArgs, tauriProject, 'tauri build');
  } finally {
    patch.restore();
    console.log('Restored the original tauri.conf.json.');
  }

  const exe = path.join(tauriProject, 'src-tauri', 'target', 'release', 'app.exe');
  if (!fs.existsSync(exe)) {
    throw new Error(`${exe} was not produced by the build.`);
  }
  const { size, mtime } = fs.statSync(exe);
  console.log(`\nBuilt: ${exe}\n  ${(size / (1024 * 1024)).toFixed(2)} MB, ${mtime.toISOString()}`);

  verifyEmbeddedFrontend(exe, target);
}

/**
 * Fail loudly unless the exe really embeds *this* repo's frontend.
 *
 * This exists because the script can otherwise exit 0 having done nothing — the
 * Windows entrypoint-guard bug above did exactly that, and a green exit code is
 * indistinguishable from a real build.
 *
 * The check is deliberately two-layer, because each layer alone has a failure
 * mode of its own:
 *
 * - The staged `dist/` must contain a content-hashed bundle whose name matches
 *   this build. If Tauri rebuilt the *sibling's* frontend instead of using what
 *   we staged, the staged name and the embedded name would disagree.
 * - The exe must contain that hashed name as a literal. Tauri compresses
 *   embedded assets, so the *contents* of the bundle are not greppable; the
 *   asset path is, because the runtime has to find it by name. A growing byte
 *   count alone would not prove it — an unrelated Rust change grows the exe too.
 *
 * @param exe    the produced executable
 * @param staged the dist directory that was copied into the Tauri project
 */
export function verifyEmbeddedFrontend(exe, staged) {
  const assetsDir = path.join(staged, 'assets');
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Staged bundle has no assets/ directory: ${assetsDir}`);
  }
  const bundles = fs
    .readdirSync(assetsDir)
    .filter((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))
    .sort();
  if (bundles.length === 0) {
    throw new Error(`No hashed index bundle found in ${assetsDir}.`);
  }

  // The newest bundle is the one this build produced.
  const newest = bundles[bundles.length - 1];
  console.log(`\nSelf-check: verifying ${newest} is embedded in the exe...`);

  const bytes = fs.readFileSync(exe);
  const text = bytes.toString('latin1');
  if (!text.includes(newest)) {
    throw new Error(
      `Self-check FAILED: the exe does not contain the bundle name "${newest}".\n` +
        'The executable does not embed this repository\'s frontend — most likely the\n' +
        'Tauri project rebuilt its own frontend instead of using the staged dist.',
    );
  }

  console.log(`Self-check OK: exe embeds ${newest} (${(bytes.length / (1024 * 1024)).toFixed(2)} MB).`);
}

// Compare through `pathToFileURL` rather than string-concatenating `file://`.
//
// The naive `import.meta.url === 'file://' + process.argv[1]` guard silently
// never matches on Windows: `pathToFileURL` yields `file:///C:/...` (three
// slashes) while the concatenation yields `file://C:/...` (two). The result was
// a script that exited 0 having done nothing, which reads exactly like success.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }
}