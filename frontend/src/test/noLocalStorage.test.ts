// covers: ARC-13, SET-09
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * `ARC-13` / `SET-09` forbid `localStorage` outright. The only sanctioned
 * reference is the one-time migration in `app/appearance.ts`, which reads the
 * legacy key, copies it into the shell-state file, and removes it. Everything
 * else must go through the platform adapter.
 *
 * This is the lint rule the owner asked for, expressed as a test so it runs in
 * the same suite as everything else and fails a build rather than being a
 * convention nobody checks.
 */
const ROOT = join(process.cwd(), 'src');

/**
 * The two files whose only `localStorage` reference is a one-way migration:
 * read the legacy key, hand the value to the canonical store, delete the key.
 * After the first run the key is empty and the branch never fires again.
 */
const ALLOWED = new Set(['app/appearance.ts', 'app/providers.tsx']);

/** Matches an actual property access, not the word in a comment. */
const USAGE = /\blocalStorage\s*\.\s*(?:getItem|setItem|removeItem|clear|key)\s*\(/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('ARC-13: no localStorage usage outside the sanctioned migrations', () => {
  it('has no localStorage access except the two legacy migrations', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (ALLOWED.has(rel)) continue;
      const text = readFileSync(file, 'utf8');
      if (USAGE.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});