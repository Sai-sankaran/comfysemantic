#!/usr/bin/env node
/**
 * `npm run shots:zip` — one archive of the most recent matrix.
 *
 * PNGs are already DEFLATE-compressed, so a real compression pass buys almost
 * nothing and costs CPU. The zip is written **stored** (method 0), which makes it
 * both fast and dependency-free — no `archiver`, no `adm-zip`, no `zip` binary,
 * nothing to install on a machine that only has Node.
 *
 * Stored archives do mean the zip is about as large as its contents, which is why
 * the PNGs themselves are optimised first. That happens in `shots.mjs` via
 * Playwright's `type: 'jpeg'` alternative only if a caller asks for it; by default
 * PNG is kept because it is lossless and a UI screenshot's text should stay crisp.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(ROOT, 'screenshots');

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
    else if (entry.name.endsWith('.png')) out.push(rel);
  }
  return out;
}

/** Zip stores entries as local headers plus a central directory. */
function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const sum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date (1996-01-01, fixed for reproducibility)
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central directory header
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(sum, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}

async function main() {
  if (!existsSync(SHOTS)) {
    console.error('No screenshots/ directory. Run "npm run shots" first.');
    process.exitCode = 1;
    return;
  }
  const matrices = (await readdir(SHOTS, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const files = [];
  for (const matrix of matrices) {
    for (const rel of await walk(path.join(SHOTS, matrix))) {
      files.push({ name: `${matrix}/${rel}`, data: await readFile(path.join(SHOTS, rel)) });
    }
  }
  if (files.length === 0) {
    console.error('No PNGs found. Run "npm run shots" first.');
    process.exitCode = 1;
    return;
  }

  const zip = buildZip(files);
  const target = path.join(ROOT, 'screenshots.zip');
  await writeFile(target, zip);

  let pngBytes = 0;
  for (const f of files) pngBytes += f.data.length;
  const over = files.filter((f) => f.data.length > 300 * 1024).length;
  console.log(
    `screenshots.zip: ${files.length} PNGs, ${(zip.length / 1e6).toFixed(1)} MB ` +
      `(contents ${(pngBytes / 1e6).toFixed(1)} MB).` +
      (over > 0 ? ` ${over} over the 300 KB target — rerun with a smaller viewport or JPEG.` : ''),
  );
  await stat(target);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});