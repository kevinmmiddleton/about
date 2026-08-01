#!/usr/bin/env node
/**
 * stamp-assets.mjs — refresh the ?v= cache stamps on CSS/JS references.
 *
 * Every page references its assets as `fv.css?v=<first 8 of md5>`. The stamp is
 * what makes a deploy invalidate a visitor's cached copy immediately. If the
 * file changes and the stamp does not, the mechanism silently does nothing and
 * still LOOKS like it is working, which is the worst failure mode available.
 *
 * That is exactly what happened on 2026-07-31: fv.css was edited repeatedly
 * across 28 referencing files and the stamp sat at 3bb54490 the whole time.
 * GitHub Pages sends `cache-control: max-age=600`, so the real-world cost was
 * bounded at ten minutes rather than forever, but the guarantee the stamp is
 * supposed to provide was absent.
 *
 *   node tools/stamp-assets.mjs           # report only, changes nothing
 *   node tools/stamp-assets.mjs --write   # rewrite the stale stamps
 *
 * Exits non-zero when stamps are stale, so it can gate a deploy.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, normalize, resolve } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const WRITE = process.argv.includes('--write');

// Directories that are history or scratch, not the live site.
const SKIP = [/(^|\/)archive\//, /(^|\/)node_modules\//, /(^|\/)\.git\//, /(^|\/)_[^/]*\.html$/];

const pages = globSync('**/*.{htm,html}', { cwd: ROOT })
  .filter((p) => !SKIP.some((re) => re.test(p)));

const hashCache = new Map();
const hashOf = (abs) => {
  if (!hashCache.has(abs)) {
    hashCache.set(abs, createHash('md5').update(readFileSync(abs)).digest('hex').slice(0, 8));
  }
  return hashCache.get(abs);
};

const REF = /((?:href|src)=["'])([^"'?]+\.(?:css|js))\?v=([a-f0-9]+)(["'])/g;
// Refs with no ?v= at all were completely invisible: not ok, not stale, not
// missing. "55 ok" was measuring only what someone had already instrumented.
const UNSTAMPED = /(?:href|src)=["']((?!https?:|\/\/)[^"'?]+\.(?:css|js))["']/g;
let stale = 0, ok = 0, missing = 0, filesChanged = 0, unstamped = 0;
const unstampedRefs = new Set();
const report = new Map();

for (const page of pages) {
  const abs = join(ROOT, page);
  const src = readFileSync(abs, 'utf8');
  let touched = false;

  const out = src.replace(REF, (whole, pre, assetPath, stamp, post) => {
    // Resolve root-relative against ROOT, everything else against the page.
    const target = assetPath.startsWith('/')
      ? join(ROOT, assetPath.slice(1))
      : normalize(join(ROOT, dirname(page), assetPath));

    let actual;
    try { actual = hashOf(target); }
    catch { missing++; report.set(assetPath, 'MISSING ' + assetPath); return whole; }

    if (actual === stamp) { ok++; return whole; }

    stale++;
    report.set(assetPath, `STALE  ${assetPath}  ${stamp} -> ${actual}`);
    if (!WRITE) return whole;
    touched = true;
    return `${pre}${assetPath}?v=${actual}${post}`;
  });

  if (touched) { writeFileSync(abs, out); filesChanged++; }

  for (const m of src.matchAll(UNSTAMPED)) {
    const target = m[1].startsWith('/') ? join(ROOT, m[1].slice(1))
                                        : normalize(join(ROOT, dirname(page), m[1]));
    try { hashOf(target); unstamped++; unstampedRefs.add(m[1]); } catch { /* not a local file */ }
  }
}

for (const line of report.values()) console.log('  ' + line);
console.log(`\n  references ok: ${ok}   stale: ${stale}   missing: ${missing}   unstamped: ${unstamped}`);
if (unstampedRefs.size) {
  console.log('\n  local assets referenced WITHOUT a ?v= stamp (a change to these will not');
  console.log('  invalidate a cached copy). Not an error, but not covered either:');
  for (const r of [...unstampedRefs].sort()) console.log('    ' + r);
}
if (WRITE) console.log(`\n  files rewritten: ${filesChanged}`);
else if (stale) console.log('\n  run with --write to fix');

// A reference to a file that does not exist is a broken page. It used to print
// MISSING and exit 0, so the gate reported a dead href as success.
if (missing) {
  console.error(`\n  ${missing} reference(s) point at files that do not exist. Failing.`);
  process.exit(1);
}
process.exit(stale && !WRITE ? 1 : 0);
