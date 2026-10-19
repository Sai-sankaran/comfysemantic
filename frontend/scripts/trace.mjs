#!/usr/bin/env node
/**
 * Traceability script — generates docs/progress.md from design.md and test files.
 *
 * Reads:
 * - design.md (all requirement IDs with titles from tables)
 * - implementation-roadmap.md (phase mapping)
 * - src/test for // covers: ID1, ID2 tags
 *
 * Writes:
 * - docs/progress.md with one row per requirement ID
 *
 * Exits non-zero if:
 * - A test cites an unknown ID
 * - An ID marked "Done" has no tagged test
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// 1. Parse all requirement IDs from design.md
// ---------------------------------------------------------------------------

function parseDesignIds(designPath) {
  const content = fs.readFileSync(designPath, 'utf8');
  const lines = content.split('\n');
  const ids = new Map(); // id -> { line, title, prefix, appendix }

  // Track current appendix/section
  let currentAppendix = '';
  let currentSection = '';

  // Two passes, in this order, and the order is the whole point.
  //
  // A requirement ID is often *cited* inside another requirement's prose — e.g.
  // `TBL-08` says "uses the export engine of Appendix I (`EXP-05`)". If a single
  // pass handled both table rows and inline citations in document order, `EXP-05`
  // would be registered from that citation with a title scraped out of TBL-08's
  // surrounding text, and its real definition further down the file would then be
  // ignored (`if (!ids.has(id))`). The generated row then showed EXP-05's status
  // as "`TBL-06`" — a status column containing another requirement's ID.
  //
  // So: pass 1 takes only the authoritative definitions, pass 2 fills in the
  // genuinely undefined leftovers from their inline mentions.
  const pendingInline = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track appendix headers
    const appendixMatch = line.match(/^##\s+([A-Z]\.[0-9])\s+(.+)$/);
    if (appendixMatch) {
      currentAppendix = appendixMatch[1];
      currentSection = appendixMatch[2].trim();
    }
    const sectionMatch = line.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
    }

    // Table rows: | `ID` | Title | ...
    if (line.includes('|') && line.includes('`')) {
      const cells = line.split('|').map(c => c.trim());
      if (cells.length >= 3) {
        const idMatch = cells[1].match(/`([A-Z]{2,4}-[0-9]{2,3})`/);
        if (idMatch) {
          const id = idMatch[1];
          const title = cells[2];
          if (title && title.length > 2 && !title.startsWith('Rule')) {
            if (!ids.has(id)) {
              const prefix = id.split('-')[0];
              ids.set(id, {
                line: i + 1,
                title: title.replace(/\*\*/g, '').trim(),
                prefix,
                appendix: currentAppendix || 'main',
                section: currentSection,
              });
            }
          }
        }
      }
    }

    // Remember inline citations; resolved after the definitions are known.
    const regex = /`([A-Z]{2,4}-[0-9]{2,3})`/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (!ids.has(match[1])) pendingInline.push({ id: match[1], line, index: i });
    }
  }

  // Pass 2: only IDs with no definition of their own anywhere in the document.
  for (const { id, line, index } of pendingInline) {
    if (ids.has(id)) continue;
    const prefix = id.split('-')[0];
    const context = lines.slice(Math.max(0, index - 2), index + 3).join(' ');
    const title = context.substring(0, 200).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    ids.set(id, {
      line: index + 1,
      title: title.replace(/\*\*/g, '').trim(),
      prefix,
      appendix: 'main',
      section: '',
    });
    void line;
  }

  return ids;
}

// ---------------------------------------------------------------------------
// 2. Parse phase mapping from implementation-roadmap.md
// ---------------------------------------------------------------------------

function parseRoadmapPhases(roadmapPath) {
  const content = fs.readFileSync(roadmapPath, 'utf8');
  const lines = content.split('\n');
  const phaseMap = new Map(); // prefix -> phase name

  let currentPhase = '';
  for (const line of lines) {
    const phaseMatch = line.match(/^##\s+Phase\s+([0-9]+[a-z]?)\s*—\s+(.+)$/);
    if (phaseMatch) {
      currentPhase = `Phase ${phaseMatch[1]}: ${phaseMatch[2]}`;
    }
    // Look for prefix mentions in phase work items
    const workMatch = line.match(/^\s*\d+\.\s+Implement\s+\*\*([^*]+)\*\*/);
    if (workMatch && currentPhase) {
      const feature = workMatch[1].toLowerCase();
      // Map feature names to prefixes (approximate)
      if (feature.includes('token') || feature.includes('theme') || feature.includes('density') || feature.includes('text scale')) {
        phaseMap.set('VIS', currentPhase);
      }
      if (feature.includes('control') || feature.includes('checkbox') || feature.includes('menu') || feature.includes('dialog')) {
        phaseMap.set('CTL', currentPhase);
      }
      if (feature.includes('action registry')) {
        phaseMap.set('NAV', currentPhase); // action registry is in NAV area
      }
      if (feature.includes('shell') || feature.includes('rail') || feature.includes('tree') || feature.includes('inspector') || feature.includes('queue') || feature.includes('job tray') || feature.includes('system popover') || feature.includes('breadcrumb') || feature.includes('history')) {
        phaseMap.set('NAV', currentPhase);
      }
      if (feature.includes('setting') || feature.includes('profile')) {
        phaseMap.set('SET', currentPhase);
      }
      if (feature.includes('single-instance') || feature.includes('lock')) {
        phaseMap.set('ARC', currentPhase);
      }
      if (feature.includes('gallery') || feature.includes('explore') || feature.includes('thumbnail') || feature.includes('lazy') || feature.includes('facet') || feature.includes('view memory') || feature.includes('scroll restore')) {
        phaseMap.set('GAL', currentPhase);
      }
      if (feature.includes('inspector')) {
        phaseMap.set('INS', currentPhase);
      }
      if (feature.includes('flag') || feature.includes('hidden')) {
        phaseMap.set('FLG', currentPhase);
      }
      if (feature.includes('table')) {
        phaseMap.set('TBL', currentPhase);
      }
      if (feature.includes('privacy') || feature.includes('blur')) {
        phaseMap.set('PRV', currentPhase);
      }
      if (feature.includes('search') || feature.includes('saved search') || feature.includes('history')) {
        phaseMap.set('SRC', currentPhase);
      }
      if (feature.includes('smart collection') || feature.includes('collection') || feature.includes('import batch') || feature.includes('quick filter')) {
        phaseMap.set('COL', currentPhase);
        phaseMap.set('QFL', currentPhase);
        phaseMap.set('IMP', currentPhase);
      }
      if (feature.includes('cross-library') || feature.includes('similar')) {
        phaseMap.set('SRC', currentPhase);
      }
      if (feature.includes('relation') || feature.includes('panel-to-image')) {
        phaseMap.set('RLN', currentPhase);
      }
      if (feature.includes('pipeline') || feature.includes('job') || feature.includes('composer') || feature.includes('cache') || feature.includes('export')) {
        phaseMap.set('PIP', currentPhase);
      }
      if (feature.includes('comic') || feature.includes('decompose') || feature.includes('panel editor') || feature.includes('OCR') || feature.includes('review') || feature.includes('reader') || feature.includes('cropper') || feature.includes('strip') || feature.includes('spread')) {
        phaseMap.set('CMC', currentPhase);
        phaseMap.set('OCR', currentPhase);
        phaseMap.set('REV', currentPhase);
      }
      if (feature.includes('diagnostic') || feature.includes('onboarding') || feature.includes('migration')) {
        phaseMap.set('DGN', currentPhase);
        phaseMap.set('ONB', currentPhase);
      }
      if (feature.includes('performance') || feature.includes('budget') || feature.includes('parity') || feature.includes('regression') || feature.includes('release')) {
        phaseMap.set('PRF', currentPhase);
        phaseMap.set('TST', currentPhase);
      }
      if (feature.includes('expanded')) {
        phaseMap.set('XPD', currentPhase);
      }
      if (feature.includes('watch') || feature.includes('folder')) {
        phaseMap.set('WCH', currentPhase);
      }
      if (feature.includes('run') || feature.includes('retry') || feature.includes('recovery')) {
        phaseMap.set('RRN', currentPhase);
      }
      if (feature.includes('copy') || feature.includes('export')) {
        phaseMap.set('CPY', currentPhase);
      }
      if (feature.includes('duplicate')) {
        phaseMap.set('DUP', currentPhase);
      }
      if (feature.includes('compare')) {
        phaseMap.set('CMP', currentPhase);
      }
    }
  }

  // Default phase assignments for prefixes not explicitly mapped
  const defaults = {
    PRD: 'Phase 0: Principles & scope',
    ARC: 'Phase 1: Foundations',
    DAT: 'Phase 1: Foundations',
    NAV: 'Phase 1: Foundations',
    GAL: 'Phase 2: Explore',
    INS: 'Phase 2: Explore',
    FLG: 'Phase 2: Explore',
    TBL: 'Phase 2: Explore',
    PRV: 'Phase 2: Explore',
    STA: 'Phase 2: Explore',
    LIB: 'Phase 2: Explore',
    SRC: 'Phase 3: Search & Collections',
    COL: 'Phase 3: Search & Collections',
    QFL: 'Phase 3: Search & Collections',
    IMP: 'Phase 3: Search & Collections',
    RLN: 'Phase 3: Search & Collections',
    CMC: 'Phase 5a–5c: Comics',
    OCR: 'Phase 5a–5c: Comics',
    REV: 'Phase 5a–5c: Comics',
    CPY: 'Phase 4: Pipeline & Export',
    PIP: 'Phase 4: Pipeline & Export',
    EXP: 'Phase 4: Pipeline & Export',
    DUP: 'Phase 4: Pipeline & Export',
    WCH: 'Phase 4: Pipeline & Export',
    RUN: 'Phase 4: Pipeline & Export',
    SET: 'Phase 1: Foundations',
    DGN: 'Phase 6: Settings, Diagnostics, Onboarding, Migration',
    ONB: 'Phase 6: Settings, Diagnostics, Onboarding, Migration',
    PRF: 'Phase 7: Performance, Parity, Regression, Release',
    TST: 'Phase 7: Performance, Parity, Regression, Release',
    VIS: 'Phase 1: Foundations',
    CTL: 'Phase 1: Foundations',
    REL: 'Phase 1: Foundations',
    TAG: 'Phase 3: Search & Collections',
    RRN: 'Phase 4: Pipeline & Export',
    XPD: 'Phase X: Expanded mode',
    VWH: 'Phase 3: Search & Collections',
    VWR: 'Phase 3: Search & Collections',
    CMP: 'Phase 3: Search & Collections',
  };

  for (const [prefix, phase] of Object.entries(defaults)) {
    if (!phaseMap.has(prefix)) {
      phaseMap.set(prefix, phase);
    }
  }

  return phaseMap;
}

// ---------------------------------------------------------------------------
// 3. Parse test files for // covers: tags
// ---------------------------------------------------------------------------

function parseTestCovers(testDir, designIds) {
  const covers = new Map(); // id -> Set<testFile>
  const testFiles = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        testFiles.push(full);
      }
    }
  }

  walk(testDir);

  const knownIds = new Set(designIds.keys());
  const unknownIds = [];

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/\/\/\s*covers:\s*([A-Z]{2,4}-[0-9]{2,3}(?:\s*,\s*[A-Z]{2,4}-[0-9]{2,3})*)/i);
      if (match) {
        const ids = match[1].split(',').map(s => s.trim().toUpperCase());
        for (const id of ids) {
          if (!knownIds.has(id)) {
            unknownIds.push({ id, file, line: i + 1 });
          }
          if (!covers.has(id)) covers.set(id, new Set());
          covers.get(id).add(path.relative(process.cwd(), file));
        }
      }
    }
  }

  return { covers, unknownIds, testFiles };
}

// ---------------------------------------------------------------------------
// 4. Determine status for each ID
// ---------------------------------------------------------------------------

function determineStatus(id, covers, designIds) {
  const hasTest = covers.has(id) && covers.get(id).size > 0;
  const testFiles = hasTest ? Array.from(covers.get(id)).sort() : [];

  // For now, use a heuristic based on what we know is built
  // This will be refined as we add // covers: tags
  const prefix = id.split('-')[0];
  const num = parseInt(id.split('-')[1], 10);

  // Known implemented areas (from the work done)
  const implemented = new Set([
    // Phase 1 - Foundations
    'VIS-01', 'VIS-02', 'VIS-03', 'VIS-04', 'VIS-05', 'VIS-06', 'VIS-07', 'VIS-08', 'VIS-09', 'VIS-10', 'VIS-11', 'VIS-12', 'VIS-13', 'VIS-14', 'VIS-15',
    'CTL-01', 'CTL-02', 'CTL-03', 'CTL-04', 'CTL-05', 'CTL-06',
    'ARC-01', 'ARC-02', 'ARC-03', 'ARC-04', 'ARC-05', 'ARC-06', 'ARC-07', 'ARC-08', 'ARC-09', 'ARC-10', 'ARC-11', 'ARC-12', 'ARC-13', 'ARC-14',
    'NAV-01', 'NAV-02', 'NAV-03', 'NAV-04', 'NAV-05', 'NAV-06', 'NAV-07', 'NAV-08', 'NAV-10', 'NAV-11', 'NAV-12', 'NAV-13', 'NAV-14',
    'NAV-20', 'NAV-21', 'NAV-22', 'NAV-23', 'NAV-24', 'NAV-25', 'NAV-26', 'NAV-27',
    'NAV-30', 'NAV-31', 'NAV-32',
    'NAV-40', 'NAV-41', 'NAV-42', 'NAV-43',
    'NAV-50', 'NAV-51', 'NAV-52',
    'SET-01', 'SET-02', 'SET-03', 'SET-04', 'SET-05', 'SET-06', 'SET-07', 'SET-08', 'SET-09', 'SET-10', 'SET-11',
    'REL-01', 'REL-02', 'REL-03', 'REL-04', 'REL-05', 'REL-06', 'REL-07', 'REL-08', 'REL-09', 'REL-10', 'REL-11', 'REL-12', 'REL-13', 'REL-14', 'REL-15', 'REL-16',
    // Phase 2 - Explore
    'GAL-01', 'GAL-02', 'GAL-03', 'GAL-04', 'GAL-05', 'GAL-06', 'GAL-07', 'GAL-08', 'GAL-09', 'GAL-10', 'GAL-11', 'GAL-12', 'GAL-13', 'GAL-14', 'GAL-15', 'GAL-16', 'GAL-17', 'GAL-18', 'GAL-19', 'GAL-20', 'GAL-21', 'GAL-22', 'GAL-23',
    'INS-01', 'INS-02', 'INS-03', 'INS-04', 'INS-05', 'INS-06', 'INS-07', 'INS-08', 'INS-09', 'INS-10', 'INS-11',
    'FLG-01', 'FLG-02', 'FLG-03', 'FLG-04', 'FLG-05', 'FLG-06', 'FLG-07', 'FLG-08', 'FLG-09', 'FLG-10', 'FLG-11',
    'TBL-01', 'TBL-02', 'TBL-03', 'TBL-04', 'TBL-05', 'TBL-06', 'TBL-07', 'TBL-08', 'TBL-09',
    'PRV-01', 'PRV-02', 'PRV-03', 'PRV-04', 'PRV-05', 'PRV-06', 'PRV-07', 'PRV-08', 'PRV-09', 'PRV-10',
    'STA-02', 'STA-03', 'STA-04', 'STA-05', 'STA-06',
    'LIB-06', 'LIB-09',
    // Phase 4 - Pipeline & Export
    'PIP-01', 'PIP-02', 'PIP-03', 'PIP-04', 'PIP-05', 'PIP-06', 'PIP-07', 'PIP-08', 'PIP-09', 'PIP-10', 'PIP-11', 'PIP-12', 'PIP-13',
    'PIP-20', 'PIP-21', 'PIP-22', 'PIP-23', 'PIP-24',
    // Copy-as-text (Appendix G.2). The contract is pure logic and fully tested;
    // the clipboard and file-write shells around it are still to come.
    'CPY-01', 'CPY-02', 'CPY-03', 'CPY-04', 'CPY-05', 'CPY-06', 'CPY-07', 'CPY-08', 'CPY-09', 'CPY-10',
    // Export (Appendix I). Planning/serialisation, the destination rule, the job
    // semantics and the re-run rules are implemented and tested. EXP-07 (comic
    // panels, the existing CMC-60 path) is not.
    'EXP-01', 'EXP-02', 'EXP-03', 'EXP-04', 'EXP-05', 'EXP-06', 'EXP-08', 'EXP-09', 'EXP-10',
    // The copy/export menus, wired into the selection action bar.
    'STA-46',
    // Re-run (Appendix I, RRN). Decision logic only — no UI entry points yet.
    'RRN-02', 'RRN-03', 'RRN-04', 'RRN-09', 'RRN-10',
    // Copy/export tests. TST-46 is not claimed here: its tag-entry and migration
    // sanitising rules (TAG-01..TAG-04) are not implemented, only the copy side
    // that TST-46 also covers.
    'TST-45', 'TST-47', 'TST-48', 'TST-49',
    // Phase 3 - partial
    'QFL-01', 'QFL-02', 'QFL-03', 'QFL-04', 'QFL-05', 'QFL-06', 'QFL-07', 'QFL-08', 'QFL-09', 'QFL-10',
    'COL-10', 'COL-11', 'COL-12', 'COL-13', 'COL-14', 'COL-15', 'COL-16', 'COL-17', 'COL-18', 'COL-19', 'COL-20', 'COL-21', 'COL-22', 'COL-23',
    'IMP-01', 'IMP-02', 'IMP-03',
    // Search (Phase 3)
    'SRC-01', 'SRC-02', 'SRC-03', 'SRC-04', 'SRC-05', 'SRC-06', 'SRC-07', 'SRC-08', 'SRC-09', 'SRC-10', 'SRC-11', 'SRC-12', 'SRC-13', 'SRC-14', 'SRC-15', 'SRC-16',
    // Relations (Phase 3)
    'RLN-01', 'RLN-02', 'RLN-03', 'RLN-04', 'RLN-05', 'RLN-06', 'RLN-07', 'RLN-08',
    'STA-07', 'STA-08', 'STA-09', 'STA-30', 'STA-40', 'STA-41', 'STA-42', 'STA-43', 'STA-44', 'STA-45',
    'TST-38', 'TST-42', 'TST-43', 'TST-44',
    // TST IDs
    'TST-02', 'TST-03', 'TST-04', 'TST-05', 'TST-06', 'TST-08', 'TST-09', 'TST-15', 'TST-16', 'TST-21', 'TST-24',
  ]);

  const partiallyImplemented = new Set([
    'GAL-05', 'GAL-08', 'GAL-09', 'GAL-10', 'GAL-11', 'GAL-12', 'GAL-16', 'GAL-17', 'GAL-18', 'GAL-19', 'GAL-20', 'GAL-21', 'GAL-23',
    'INS-04', 'INS-05', 'INS-07', 'INS-09', 'INS-10', 'INS-11',
    'FLG-06',
    'TBL-06', 'TBL-08', 'TBL-09', 'TBL-10',
    'PRV-03', 'PRV-07', 'PRV-10',
    'STA-01', 'STA-10', 'STA-11', 'STA-12', 'STA-13', 'STA-14', 'STA-15', 'STA-16', 'STA-17', 'STA-18', 'STA-19', 'STA-20',
    'STA-21', 'STA-22', 'STA-23', 'STA-24', 'STA-25', 'STA-26', 'STA-27', 'STA-28', 'STA-29',
    'STA-31', 'STA-32', 'STA-33', 'STA-34', 'STA-35', 'STA-36', 'STA-37', 'STA-38', 'STA-39',
    // STA-46 (clipboard unavailable) is now implemented and tested, so it is listed
    // in the `implemented` set above rather than here.
    'STA-47', 'STA-48', 'STA-49',
    'LIB-01', 'LIB-02', 'LIB-03', 'LIB-04', 'LIB-05', 'LIB-07', 'LIB-08', 'LIB-10', 'LIB-11', 'LIB-12',
    'TST-01', 'TST-06', 'TST-07', 'TST-10', 'TST-13', 'TST-14', 'TST-17', 'TST-18', 'TST-19', 'TST-20',
    'TST-32', 'TST-33', 'TST-34', 'TST-35', 'TST-37',
  ]);

  if (implemented.has(id)) {
    return hasTest ? 'Done' : 'Partial'; // Done only if test exists
  }
  if (partiallyImplemented.has(id)) {
    return 'Partial';
  }

  // Check VERIFY blockers
  const verifyBlocked = new Set([
    'TST-32', // VERIFY #13
    'TST-36', // RLN not started
    'TST-37', // VWH-03 Phase 3
  ]);
  if (verifyBlocked.has(id)) {
    return 'Blocked-VERIFY';
  }

  // Appendix J (XPD) - must not be built
  if (prefix === 'XPD') {
    return 'Deferred';
  }

  return 'Not built';
}

// ---------------------------------------------------------------------------
// 5. Generate progress.md
// ---------------------------------------------------------------------------

function generateProgressMarkdown(designIds, phaseMap, covers) {
  const lines = [];
  lines.push('# Implementation Progress — requirement-ID coverage');
  lines.push('');
  lines.push('> Generated by `scripts/trace.mjs` — do not edit by hand.');
  lines.push('');
  lines.push('| Requirement | Title | Status | Test file(s) | Phase |');
  lines.push('|-------------|-------|--------|--------------|-------|');

  // Sort IDs by prefix then number
  const sortedIds = Array.from(designIds.keys()).sort((a, b) => {
    const [pa, na] = a.split('-');
    const [pb, nb] = b.split('-');
    if (pa !== pb) return pa.localeCompare(pb);
    return parseInt(na, 10) - parseInt(nb, 10);
  });

  for (const id of sortedIds) {
    const info = designIds.get(id);
    const status = determineStatus(id, covers, designIds);
    const testFiles = covers.has(id) ? Array.from(covers.get(id)).sort().join(', ') : '—';
    const phase = phaseMap.get(info.prefix) || 'Unknown';
    lines.push(`| \`${id}\` | ${info.title} | ${status} | ${testFiles} | ${phase} |`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Phase 1b tasks
// ---------------------------------------------------------------------------

function generatePhase1bMarkdown() {
  const lines = [];
  lines.push('---');
  lines.push('');
  lines.push('## Phase 1b — Startup Repair, Data-Access Interface, Migration Rehearsal, M0');
  lines.push('');
  lines.push('| Task | Description | Status | Notes |');
  lines.push('|------|-------------|--------|-------|');
  lines.push('| **Startup repair** | Fix the 30 s+ launch freeze; ensure the UI shows a deterministic skeleton while the backend boots; eliminate the "Backend unavailable" flash on `/` in the dev build. | Not started | Blocked by VERIFY #10 (startup freeze) |');
  lines.push('| **Data-access interface** | Define the `ExploreSource` / `SearchSource` / `LibrarySource` interfaces in TypeScript so the web build and the Tauri shell share the exact same contract. The dev backend (`devBackend.ts`) is the reference implementation. | In progress | `ExploreSource` exists; `SearchSource` and `LibrarySource` need to be extracted from the dev backend |');
  lines.push('| **Migration rehearsal** | Run the one-time SQLite migration (`schema_version` → current) against a copy of production data in CI; verify idempotency, rollback plan, and that user-corrected data survives (`VERIFY` #13). | Not started | Blocked by VERIFY #13; requires the data-access interface to be stable |');
  lines.push('| **M0 (minimum viable backend)** | Ship the dev backend as a standalone Node/TypeScript process that the Tauri shell can spawn, so the web build and the exe use the **exact same code path** for data access. This is the parity gate for `TST-01`. | Not started | Depends on data-access interface completion |');
  lines.push('');
  lines.push('> **VERIFY blockers for Phase 1b:** #3 (cropper contract → blocks Comic Decompose), #5 (OCR confidence → no confidence UI), #6 (vector backend), #9 (pipeline stage map), #10 (startup freeze → blocks Phase 1b), #13 (user-corrected data survives reprocessing).');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const designPath = '../design.md';
const roadmapPath = '../implementation-roadmap.md';
const testDir = 'src/test';
const outputPath = '../docs/progress.md';

console.log('Parsing design.md...');
const designIds = parseDesignIds(designPath);
console.log(`Found ${designIds.size} requirement IDs`);

console.log('Parsing implementation-roadmap.md...');
const phaseMap = parseRoadmapPhases(roadmapPath);

console.log('Parsing test files for // covers: tags...');
const { covers, unknownIds } = parseTestCovers(testDir, designIds);
console.log(`Found ${covers.size} IDs with // covers: tags`);
if (unknownIds.length > 0) {
  console.error('ERROR: Tests cite unknown IDs:');
  for (const u of unknownIds) {
    console.error(`  ${u.id} in ${u.file}:${u.line}`);
  }
  process.exit(1);
}

console.log('Generating progress.md...');
const markdown = generateProgressMarkdown(designIds, phaseMap, covers);
const phase1bMarkdown = generatePhase1bMarkdown();
fs.writeFileSync(outputPath, markdown + '\n\n' + phase1bMarkdown);
console.log(`Written to ${outputPath}`);

// Check for Done IDs without tests
const doneWithoutTest = [];
for (const id of designIds.keys()) {
  const status = determineStatus(id, covers, designIds);
  if (status === 'Done' && !covers.has(id)) {
    doneWithoutTest.push(id);
  }
}
if (doneWithoutTest.length > 0) {
  console.error('ERROR: IDs marked Done but have no // covers: test tag:');
  for (const id of doneWithoutTest) {
    console.error(`  ${id}`);
  }
  process.exit(1);
}

console.log('✓ Traceability check passed');