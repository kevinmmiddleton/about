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

// CHROME_PATH first so CI can point at whatever the runner ships.
const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean).find((p) => existsSync(p));

/** The surfaces this document governs, and the element whose scope defines each. */
const VIEWPORT = { w: 1440, h: 900 };   // stated, so the caps below mean something

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
    const args = [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--mute-audio', '--remote-debugging-port=0',
      `--user-data-dir=${dir}`,
    ];
    // A CI runner has no usable sandbox: Chrome's setuid helper is not present
    // and user namespaces are restricted, so it exits before writing
    // DevToolsActivePort and the launch times out with nothing to show for it.
    // Scoped to CI on purpose. The sandbox is a real defence and stays on for
    // a local run, where it works.
    if (process.env.CI) args.push('--no-sandbox', '--disable-dev-shm-usage');
    args.push('about:blank');
    const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });

    // Chrome explains itself on stderr and this used to be piped and never
    // read, so every launch failure surfaced as the same four words and the
    // real reason was discarded. Two weeks of red CI said only "Chrome did not
    // report a debugging port". Collect it, cap it, and put it in the error.
    let stderr = '';
    proc.stderr.on('data', (d) => { if (stderr.length < 4000) stderr += d.toString(); });
    let exited = null;
    proc.on('exit', (code, signal) => { exited = signal ? `signal ${signal}` : `code ${code}`; });

    let port = null;
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(100);
      const f = join(dir, 'DevToolsActivePort');
      if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0].trim();
      // No point waiting out the full ten seconds once the process is gone.
      if (exited && !port) break;
    }
    if (!port) {
      proc.kill();
      const why = [
        'Chrome did not report a debugging port',
        `  binary: ${CHROME}`,
        exited ? `  chrome exited with ${exited}` : '  chrome was still running when we gave up',
        process.env.CI ? '  running with --no-sandbox (CI)' : '  running WITH the sandbox (not CI)',
        stderr.trim() ? `  chrome stderr:\n${stderr.trim().split('\n').map((l) => '    ' + l).join('\n')}`
          : '  chrome stderr: (empty)',
      ].join('\n');
      throw new Error(why);
    }

    const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const ws = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('CDP connect failed')); });
    return new Chrome(proc, ws, dir);
  }

  constructor(proc, ws, dir) {
    this.proc = proc; this.ws = ws; this.dir = dir;
    this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { ok, no } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? no(new Error(m.error.message)) : ok(m.result);
        return;
      }
      if (m.method) this.handlers.get(`${m.sessionId}\u0000${m.method}`)?.(m.params);
    };
  }

  on(sessionId, method, fn) { this.handlers.set(`${sessionId}\u0000${method}`, fn); }

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

    // Every value this tool reports comes from stylesheets in this repo, but
    // readyState:'complete' waits on the whole subresource graph -- and KevinOS
    // alone pulls a Google Fonts stylesheet, an absolute middleton.io image and
    // two weather APIs. On this machine that settles in ~350ms; on a CI runner
    // it ran past the 12s budget below and failed the build on a page nobody had
    // touched. Blocking off-origin requests makes the measurement depend on this
    // repo and nothing else, so the result is the same offline as online.
    await this.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
    this.on(sessionId, 'Fetch.requestPaused', ({ requestId, request }) => {
      const local = request.url.startsWith(this.origin);
      this.send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest',
        local ? { requestId } : { requestId, errorReason: 'BlockedByClient' },
        sessionId)
        // The request can be gone already if the page navigated; that is not a
        // failure worth stopping an extract for.
        .catch(() => {});
    });

    return {
      sessionId,
      goto: async (u) => {
        await this.send('Page.navigate', { url: u }, sessionId);
        for (let i = 0; i < 200; i++) {
          await sleep(60);
          const r = await this.send('Runtime.evaluate',
            { expression: 'document.readyState', returnByValue: true }, sessionId);
          // KevinOS runs a boot sequence, so readyState alone is not enough.
          if (r.result.value === 'complete') { await sleep(400); return; }
        }
        // Used to fall out of the loop and return success, so a page that never
        // finished loading yielded partial tokens that --write committed as truth.
        throw new Error(`timed out waiting for ${u} to finish loading`);
      },
      scheme: (v) => this.send('Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-color-scheme', value: v }] }, sessionId),
      // Caps are width-dependent, so the width has to be declared rather than
      // inherited from whatever Chrome defaults to.
      viewport: (w, h) => this.send('Emulation.setDeviceMetricsOverride',
        { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId),
      eval: async (expr) => {
        const r = await this.send('Runtime.evaluate',
          { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + (r.exceptionDetails.exception?.description || ''));
        return r.result.value;
      },
      close: () => this.send('Target.closeTarget', { targetId }),
    };
  }

  // Must AWAIT the exit. proc.kill() only delivers SIGTERM; if Node exits in the
  // same tick, Chrome never finishes shutting down and its helper processes are
  // reparented to init and survive. Ten stale profiles and nine live browsers
  // accumulated this way before this was noticed. SIGKILL is the backstop.
  async kill() {
    try { this.ws.close(); } catch {}
    if (this.proc.exitCode === null && !this.proc.killed) {
      const dead = new Promise((ok) => this.proc.once('exit', ok));
      this.proc.kill('SIGTERM');
      const timer = setTimeout(() => { try { this.proc.kill('SIGKILL'); } catch {} }, 2000);
      await Promise.race([dead, new Promise((ok) => setTimeout(ok, 5000))]);
      clearTimeout(timer);
    }
    try { rmSync(this.dir, { recursive: true, force: true }); } catch {}
  }
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
    const buf = readFileSync(join(ROOT, file));
    const raw = buf.toString('utf8');
    const code = strip(raw);
    const decls = code.match(/--[a-z0-9-]+\s*:/g) || [];
    out[key] = {
      file,
      bytes: buf.byteLength,   // real bytes; raw.length is UTF-16 code units
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

  // The blog and KevinOS token maps used to be extracted and then thrown away,
  // so changing a token on either surface was invisible to the drift check.
  // They are printed now, which is what makes the check cover them.
  for (const key of ['blog', 'kevinos']) {
    const surf = data.surfaces[key];
    if (!surf) continue;
    const names = Object.keys(surf.light.tokens)
      .filter((n) => surf.dark.tokens[n] !== undefined).sort();
    const flips = names.filter((n) => surf.light.tokens[n] !== surf.dark.tokens[n]);
    L.push(`<details><summary><strong>${key}</strong>: ${names.length} tokens, ${flips.length} flip between modes</summary>`);
    L.push('');
    L.push('| Token | Light | Dark |');
    L.push('|---|---|---|');
    for (const n of names) {
      const l = surf.light.tokens[n], d = surf.dark.tokens[n];
      L.push(`| \`${n}\` | \`${l}\` | ${l === d ? '_same_' : `\`${d}\``} |`);
    }
    L.push('');
    L.push('</details>');
    L.push('');
  }

  // Dark caps were extracted and never printed either.
  L.push('**Layout caps in dark mode** (they should match light; a difference here is a bug):');
  L.push('');
  const capDiffs = [];
  for (const [key, s] of Object.entries(data.surfaces)) {
    for (const [sel, v] of Object.entries(s.dark.caps)) {
      if (v && v !== s.light.caps[sel]) capDiffs.push(`- \`${sel}\` on ${key}: light ${s.light.caps[sel]}, dark ${v}`);
    }
  }
  L.push(capDiffs.length ? capDiffs.join('\n') : '- none differ.');
  L.push('');
  L.push('<!-- design-extract:end -->');
  return L.join('\n');
}

/* --------------------------------------------------------------------- main */
const { server, port } = await serve();
let chrome;
let exitCode = 0;
try {
  chrome = await Chrome.launch();
  chrome.origin = `http://127.0.0.1:${port}`;
  const page = await chrome.page();
  const surfaces = {};
  for (const s of SURFACES) {
    surfaces[s.key] = {};
    for (const scheme of ['light', 'dark']) {
      await page.scheme(scheme);
      await page.viewport(VIEWPORT.w, VIEWPORT.h);
      await page.goto(`http://127.0.0.1:${port}${s.path}`);
      await page.eval(`(() => { const st=document.createElement('style');
        st.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';
        document.head.appendChild(st); })()`);
      surfaces[s.key][scheme] = await page.eval(EXTRACT(s.host));
    }
  }
  await page.close();

  const data = { surfaces, css: cssFacts() };

  // SANITY GATE. A surface that failed to load yields an empty token map, and
  // without this the empty result renders as a valid-looking block: check mode
  // exits 1, tells you to run --write, and --write then bakes the emptiness in
  // and exits 0 forever. A broken load must never be mistaken for drift.
  for (const [key, modes] of Object.entries(surfaces)) {
    for (const [scheme, snap] of Object.entries(modes)) {
      if (!snap || snap.tokenCount === 0) {
        throw new Error(`${key}/${scheme} produced 0 tokens. The surface did not load; ` +
          `refusing to write. Check the path in SURFACES and that the page renders.`);
      }
      const spec = SURFACES.find((x) => x.key === key);
      if (spec.host !== ':root' && snap.hostIsRoot) {
        throw new Error(`${key}/${scheme}: selector "${spec.host}" did not match, so tokens were ` +
          `read from :root instead. That would be published under the wrong heading.`);
      }
    }
  }

  if (JSON_OUT) { console.log(JSON.stringify(data, null, 2)); exitCode = 0; }
  else {
    const block = renderBlock(data);
    const docPath = join(ROOT, 'DESIGN.md');
    const doc = readFileSync(docPath, 'utf8');
    const re = /<!-- design-extract:start -->[\s\S]*?<!-- design-extract:end -->/;

    if (!re.test(doc)) {
      console.error('  DESIGN.md has no <!-- design-extract:start --> / <!-- design-extract:end --> markers.');
      console.error('  Add them where the generated tables should live, then re-run with --write.');
      exitCode = 2;
    } else {
      const updated = doc.replace(re, block);
      if (updated === doc) {
        console.log('  DESIGN.md generated block is up to date.');
        exitCode = 0;
      } else if (WRITE) {
        writeFileSync(docPath, updated);
        console.log('  DESIGN.md generated block updated.');
        exitCode = 0;
      } else {
        console.error('  DRIFT: DESIGN.md generated block does not match the live values.');
        console.error('  Run: node tools/design-extract.mjs --write');
        exitCode = 1;
      }
    }
  }
} catch (err) {
  console.error('  FAILED: ' + err.message);
  exitCode = 3;
} finally {
  // These must run. Every exit path used to be a process.exit() inside the try,
  // which terminates immediately and skips finally entirely, so Chrome was never
  // killed and the temp profile was never removed. Set an exit code, let finally
  // clean up, then exit.
  await chrome?.kill();
  server.close();
}
process.exit(exitCode);
