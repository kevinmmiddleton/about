#!/usr/bin/env node
/**
 * design-extract.mjs — keep DESIGN.md honest.
 *
 * WHY THIS EXISTS
 * On 2026-07-31 DESIGN.md was rewritten and 76 claims were verified by hand
 * before it shipped. A six-agent audit then found errors anyway, in three
 * distinct ways:
 *
 *   1. counts taken over file TEXT, which includes comments
 *   2. a value read from a comment in a DIFFERENT stylesheet
 *      ("1040px" appeared only in a comment reading "Was 1040px";
 *       .blog-index actually computes 1400px)
 *   3. numbers that changed depending on which regex you picked
 *      ("25 ratios" by one pattern, 17 by another, 50 occurrences)
 *
 * Every claim a machine could have checked held. Every failure was prose.
 * So: no number goes into DESIGN.md by hand again. This script reads COMPUTED
 * values out of real headless Chrome, per surface, per colour scheme, which
 * resolves the actual cascade instead of guessing at it from source text.
 *
 * NO NEW DEPENDENCIES. It uses the Chrome already installed on the machine,
 * Node's built-in http server, and the global WebSocket (Node 22+) to speak
 * the DevTools protocol directly.
 *
 *   node tools/design-extract.mjs           # check; exits 1 on drift
 *   node tools/design-extract.mjs --write   # update DESIGN.md in place
 *   node tools/design-extract.mjs --json    # dump raw extraction
 */
import { createServer } from 'node:http';
import { readFile, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const WRITE = process.argv.includes('--write');
const JSON_OUT = process.argv.includes('--json');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].find((p) => existsSync(p));

/** The surfaces this document governs, and the element whose scope defines each. */
const SURFACES = [
  { key: 'homepage', path: '/index.htm', host: '.fv' },
  { key: 'blog', path: '/blog/index.html', host: ':root' },
  { key: 'kevinos', path: '/kevinos/index.html', host: ':root' },
];

/* ------------------------------------------------------------------ server */
const MIME = { '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
  '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' };

function serve() {
  return new Promise((ok) => {
    const s = createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = join(ROOT, p);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      readFile(file, (err, buf) => {
        if (err) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    s.listen(0, '127.0.0.1', () => ok({ server: s, port: s.address().port }));
  });
}

/* -------------------------------------------------------------------- CDP */
class Chrome {
  static async launch() {
    if (!CHROME) throw new Error('No Chrome/Chromium/Edge found. Install one, or run with --json against a running instance.');
    const dir = mkdtempSync(join(tmpdir(), 'design-extract-'));
    const proc = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--mute-audio', '--remote-debugging-port=0',
      `--user-data-dir=${dir}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    let port = null;
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(100);
      const f = join(dir, 'DevToolsActivePort');
      if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0].trim();
    }
    if (!port) { proc.kill(); throw new Error('Chrome did not report a debugging port'); }

    const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const ws = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('CDP connect failed')); });
    return new Chrome(proc, ws, dir);
  }

  constructor(proc, ws, dir) {
    this.proc = proc; this.ws = ws; this.dir = dir;
    this.id = 0; this.pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { ok, no } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? no(new Error(m.error.message)) : ok(m.result);
      }
    };
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((ok, no) => {
      this.pending.set(id, { ok, no });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) no(new Error(`${method} timed out`)); }, 30000);
    });
  }

  async page(url) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    await this.send('Page.enable', {}, sessionId);
    await this.send('Runtime.enable', {}, sessionId);
    return {
      sessionId,
      goto: async (u) => {
        await this.send('Page.navigate', { url: u }, sessionId);
        for (let i = 0; i < 100; i++) {
          await sleep(60);
          const r = await this.send('Runtime.evaluate',
            { expression: 'document.readyState', returnByValue: true }, sessionId);
          if (r.result.value === 'complete') return;
        }
      },
      scheme: (v) => this.send('Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-color-scheme', value: v }] }, sessionId),
      eval: async (expr) => {
        const r = await this.send('Runtime.evaluate',
          { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + (r.exceptionDetails.exception?.description || ''));
        return r.result.value;
      },
      close: () => this.send('Target.closeTarget', { targetId }),
    };
  }

  kill() { try { this.ws.close(); } catch {} this.proc.kill(); try { rmSync(this.dir, { recursive: true, force: true }); } catch {} }
}

/* -------------------------------------------------------- in-page extractor */
const EXTRACT = (hostSel) => `(() => {
  const host = ${JSON.stringify(hostSel)} === ':root'
    ? document.documentElement
    : (document.querySelector(${JSON.stringify(hostSel)}) || document.documentElement);
  const cs = getComputedStyle(host);

  // Collect every custom property NAME the page's stylesheets declare, then read
  // its COMPUTED value. Reading computed is the whole point: it resolves the real
  // cascade across every block, rather than whichever one you happened to open.
  const names = new Set();
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
    (function walk(list) {
      for (const r of list) {
        if (r.cssRules) walk(r.cssRules);
        if (r.style) for (const p of r.style) if (p.startsWith('--')) names.add(p);
      }
    })(rules);
  }
  const tokens = {};
  for (const n of [...names].sort()) {
    const v = cs.getPropertyValue(n).trim();
    if (v) tokens[n] = v;
  }

  // Structural facts that are layout-dependent, so they cannot be read from source.
  const cap = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const mw = getComputedStyle(el).maxWidth;
    return mw === 'none' ? null : mw;
  };

  return {
    url: location.pathname,
    hostSelector: ${JSON.stringify(hostSel)},
    hostIsRoot: host === document.documentElement,
    tokenCount: Object.keys(tokens).length,
    tokens,
    caps: {
      '.article': cap('.article'),
      '.blog-index': cap('.blog-index'),
      '.container': cap('.container'),
      '.exp-list': cap('.exp-list'),
      '.prose': cap('.prose'),
    },
    stylesheets: [...document.styleSheets].map(s => (s.href || 'inline').replace(location.origin, '')),
  };
})()`;

/* --------------------------------------------------------- CSS text facts */
/** Counts that must never be taken over raw text, because comments are text. */
function cssFacts() {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = {};
  for (const [key, file] of [['fv', 'fv.css'], ['kevinos', 'kevinos/kevinos.css'], ['blog', 'blog/blog.css']]) {
    const raw = readFileSync(join(ROOT, file), 'utf8');
    const code = strip(raw);
    const decls = code.match(/--[a-z0-9-]+\s*:/g) || [];
    out[key] = {
      file,
      bytes: raw.length,
      declarationsOfCustomProps: decls.length,
      distinctCustomProps: new Set(decls.map((d) => d.replace(/\s*:$/, ''))).size,
      paletteBlocksDeclaringInk: (code.match(/--ink\s*:/g) || []).length,
      reducedMotionBlocks: (code.match(/prefers-reduced-motion/g) || []).length,
      // deliberately NOT counting "contrast ratios cited": three methods gave
      // three answers, so the number was deleted from DESIGN.md rather than fixed.
    };
  }
  return out;
}

/* ------------------------------------------------------------------- render */
function renderBlock(data) {
  const L = [];
  L.push('<!-- design-extract:start -->');
  L.push('<!-- GENERATED by tools/design-extract.mjs. Do not edit by hand.');
  L.push('     Values are COMPUTED, read from headless Chrome per surface and');
  L.push('     per colour scheme, so they reflect the real cascade. -->');
  L.push('');

  const home = data.surfaces.homepage;
  const rows = Object.keys(home.light.tokens)
    .filter((n) => home.dark.tokens[n] !== undefined)
    .sort();
  const flips = rows.filter((n) => home.light.tokens[n] !== home.dark.tokens[n]);
  const stable = rows.filter((n) => home.light.tokens[n] === home.dark.tokens[n]);

  L.push(`**Homepage (\`.fv\`): ${rows.length} tokens, ${flips.length} flip between modes, ${stable.length} are mode-stable.**`);
  L.push('');
  L.push('| Token | Light | Dark |');
  L.push('|---|---|---|');
  for (const n of flips) L.push(`| \`${n}\` | \`${home.light.tokens[n]}\` | \`${home.dark.tokens[n]}\` |`);
  L.push('');
  L.push('<details><summary>Mode-stable tokens</summary>');
  L.push('');
  L.push('| Token | Value |');
  L.push('|---|---|');
  for (const n of stable) L.push(`| \`${n}\` | \`${home.light.tokens[n]}\` |`);
  L.push('');
  L.push('</details>');
  L.push('');

  L.push('**Layout caps, computed (not read from source):**');
  L.push('');
  L.push('| Selector | Surface | max-width |');
  L.push('|---|---|---|');
  for (const [key, s] of Object.entries(data.surfaces)) {
    for (const [sel, v] of Object.entries(s.light.caps)) {
      if (v) L.push(`| \`${sel}\` | ${key} | ${v} |`);
    }
  }
  L.push('');

  L.push('**Stylesheet facts, counted with comments stripped:**');
  L.push('');
  L.push('| File | Bytes | Custom props (distinct/declared) | Blocks declaring `--ink` | `prefers-reduced-motion` blocks |');
  L.push('|---|---|---|---|---|');
  for (const f of Object.values(data.css)) {
    L.push(`| \`${f.file}\` | ${f.bytes.toLocaleString()} | ${f.distinctCustomProps} / ${f.declarationsOfCustomProps} | ${f.paletteBlocksDeclaringInk} | ${f.reducedMotionBlocks} |`);
  }
  L.push('');
  L.push('**Stylesheets each surface loads:**');
  L.push('');
  for (const [key, s] of Object.entries(data.surfaces)) {
    L.push(`- \`${key}\` (${s.light.url}): ${s.light.stylesheets.map((x) => `\`${x}\``).join(', ')}`);
  }
  L.push('');
  L.push('<!-- design-extract:end -->');
  return L.join('\n');
}

/* --------------------------------------------------------------------- main */
const { server, port } = await serve();
let chrome;
try {
  chrome = await Chrome.launch();
  const page = await chrome.page();
  const surfaces = {};
  for (const s of SURFACES) {
    surfaces[s.key] = {};
    for (const scheme of ['light', 'dark']) {
      await page.scheme(scheme);
      await page.goto(`http://127.0.0.1:${port}${s.path}`);
      await page.eval(`(() => { const st=document.createElement('style');
        st.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';
        document.head.appendChild(st); })()`);
      surfaces[s.key][scheme] = await page.eval(EXTRACT(s.host));
    }
  }
  await page.close();

  const data = { surfaces, css: cssFacts() };

  if (JSON_OUT) { console.log(JSON.stringify(data, null, 2)); process.exit(0); }

  const block = renderBlock(data);
  const docPath = join(ROOT, 'DESIGN.md');
  const doc = readFileSync(docPath, 'utf8');
  const re = /<!-- design-extract:start -->[\s\S]*?<!-- design-extract:end -->/;

  if (!re.test(doc)) {
    console.error('  DESIGN.md has no <!-- design-extract:start --> / <!-- design-extract:end --> markers.');
    console.error('  Add them where the generated tables should live, then re-run with --write.');
    process.exit(2);
  }

  const updated = doc.replace(re, block);
  if (updated === doc) {
    console.log('  DESIGN.md generated block is up to date.');
    process.exit(0);
  }
  if (WRITE) {
    writeFileSync(docPath, updated);
    console.log('  DESIGN.md generated block updated.');
    process.exit(0);
  }
  console.error('  DRIFT: DESIGN.md generated block does not match the live values.');
  console.error('  Run: node tools/design-extract.mjs --write');
  process.exit(1);
} finally {
  chrome?.kill();
  server.close();
}
