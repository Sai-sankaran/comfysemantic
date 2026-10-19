// Ad-hoc: prove a live build's sidecar is NOT "recovered" by a second invocation.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { recoverStalePatch, isProcessAlive } = await import('../scripts/build-exe.mjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlap-'));
const cfg = path.join(dir, 'tauri.conf.json');
const ORIGINAL = '{"build":{"beforeBuildCommand":"..\\\\scripts\\\\build-frontend.bat build"}}';
const PATCHED = '{"build":{"beforeBuildCommand":"cmd /c exit 0"}}';

// --- A live build: sidecar + lock with a PID that is alive ---
fs.writeFileSync(cfg, PATCHED);
fs.writeFileSync(`${cfg}.buildexe.bak`, ORIGINAL);
fs.writeFileSync(`${cfg}.buildexe.lock`, String(process.pid)); // this process is alive

const touched = recoverStalePatch(cfg);
const stillPatched = fs.readFileSync(cfg, 'utf8') === PATCHED;
console.log('live build untouched:', touched === false);
console.log('config still patched:', stillPatched);

// --- A crashed build: sidecar + lock with a PID that is dead ---
const deadPid = 999999;
fs.writeFileSync(`${cfg}.buildexe.lock`, String(deadPid));
const recovered = recoverStalePatch(cfg);
const nowRestored = fs.readFileSync(cfg, 'utf8') === ORIGINAL;
console.log('dead build recovered:', recovered === true);
console.log('config restored    :', nowRestored);

// --- isProcessAlive sanity ---
console.log('own pid alive     :', isProcessAlive(process.pid) === true);
console.log('dead pid not alive:', isProcessAlive(deadPid) === false);
console.log('garbage not alive  :', isProcessAlive(0) === false);

fs.rmSync(dir, { recursive: true, force: true });

const ok =
  touched === false &&
  stillPatched &&
  recovered === true &&
  nowRestored &&
  isProcessAlive(process.pid) === true &&
  isProcessAlive(deadPid) === false;
if (!ok) {
  console.log('OVERLAP TEST FAILED');
  process.exit(1);
}
console.log('PASS');