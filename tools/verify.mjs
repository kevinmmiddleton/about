#!/usr/bin/env node
/**
 * verify.mjs: check a page the way Kevin checks it by hand, so Claude can run
 * the check itself after every change (the Claude Code "verification loop").
 *
 * For each page it:
 *   - serves the repo locally (Node's http server, no dependencies)
 *   - opens it in headless Chrome at 1280 and 390 wide, via the DevTools
 *     protocol (same approach as tools/design-extract.mjs)
 *   - records JavaScript errors, horizontal overflow, and layout shift (CLS)
 *   - saves full-page screenshots to look at
 *   - greps the page source for house rules (em dashes in copy)
 *   - runs the Impeccable detector when npx is available
 *
 *   node tools/verify.mjs prototypes/mfp/        # one page
 *   node tools/verify.mjs index.htm blog/        # several
 *   node tools/verify.mjs --out /tmp/verify prototypes/mfp/
 *
 * Exits 1 when a hard check fails (JS error, overflow, CLS over budget,
 * em dash in copy). Impeccable findings are reported, not failed on: some are
 * deliberate, and DESIGN.md is where those exceptions are argued.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args.splice(outIdx, 2)[1] : mkdtempSync(join(tmpdir(), 'verify-'));
const NO_IMPECCABLE = args.includes('--no-impeccable');
const pages = args.filter(a => !a.startsWith('--'));
if (!pages.length) { console.error('usage: node tools/verify.mjs <page-path> [...]'); process.exit(2); }
mkdirSync(OUT, { recursive: true });

// Budgets. CLS 0.1 is Google's "good" threshold for Core Web Vitals.
const CLS_BUDGET = 0.1;
const WIDTHS = [1280, 390];

const TYPES = { '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.pdf': 'application/pdf' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = existsSync(join(f, 'index.html')) ? join(f, 'index.html') : join(f, 'index.htm');
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const CHROME = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium-browser']
  .find(p => existsSync(p));
if (!CHROME) { console.error('verify: no Chrome found; set CHROME_PATH'); process.exit(2); }
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--hide-scrollbars',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'verify-chrome-'))}`, 'about:blank'], { stdio: 'ignore' });

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await sleep(200);
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); let errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|plausible/.test(m.params.entry.url || '')) errors.push(m.params.entry.text);
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
// Count layout shift from the first paint on (Core Web Vitals CLS, session-window simplified).
await send('Page.addScriptToEvaluateOnNewDocument', { source:
  'window.__cls=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:"layout-shift",buffered:true})}catch(e){}' });

const results = [];
for (const page of pages) {
  const url = BASE + page.replace(/^\//, '');
  const r = { page, widths: {}, emDashes: 0, fail: [] };
  // House rule: no em dashes in visible copy (comments and <script> are fine).
  const src = (() => { let f = join(ROOT, page); if (existsSync(f) && statSync(f).isDirectory()) f = existsSync(join(f, 'index.html')) ? join(f, 'index.html') : join(f, 'index.htm'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; })();
  const copy = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
  r.emDashes = (copy.match(/—/g) || []).length;
  if (r.emDashes) r.fail.push(`${r.emDashes} em dash(es) in copy`);

  for (const w of WIDTHS) {
    errors = [];
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700 });
    await send('Page.navigate', { url });
    await sleep(3000);
    const { result } = await send('Runtime.evaluate', { returnByValue: true, expression:
      'JSON.stringify({h:document.documentElement.scrollHeight,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,cls:Math.round((window.__cls||0)*1000)/1000})' });
    const d = JSON.parse(result.value);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: Math.min(d.h, 16000), deviceScaleFactor: 1, mobile: w < 700 });
    await sleep(500);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const file = join(OUT, `${page.replace(/[\/.]+/g, '_').replace(/^_|_$/g, '') || 'home'}-${w}.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    r.widths[w] = { height: d.h, overflowX: d.sw > d.cw, cls: d.cls, jsErrors: [...new Set(errors)], screenshot: file };
    if (d.sw > d.cw) r.fail.push(`${w}px: page scrolls sideways (${d.sw} > ${d.cw})`);
    if (d.cls > CLS_BUDGET) r.fail.push(`${w}px: layout shift ${d.cls} over budget ${CLS_BUDGET}`);
    if (errors.length) r.fail.push(`${w}px: JS errors: ${[...new Set(errors)].join(' | ')}`);
  }

  if (!NO_IMPECCABLE) {
    // Async on purpose: a blocking spawn would freeze this process's own
    // http server, and the detector would scan an empty page.
    const det = await new Promise(res => {
      const c = spawn('npx', ['-y', 'impeccable@4.1.0', 'detect', '--no-config', url]);
      let stderr = ''; c.stderr.on('data', d => stderr += d);
      const t = setTimeout(() => c.kill(), 240000);
      c.on('close', status => { clearTimeout(t); res({ status, stderr }); });
    });
    const lines = (det.stderr || '').split('\n').filter(l => /^\s*\[/.test(l)).map(l => l.replace(/ — .*/, '').trim());
    const counts = {};
    lines.forEach(l => { const k = l.match(/^\[([^\]]+)\]/)?.[1] || l; counts[k] = (counts[k] || 0) + 1; });
    r.impeccable = det.status === null ? 'timed out' : { findings: lines.length, byRule: counts };
  }
  results.push(r);
}

ws.close(); chrome.kill(); server.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2));
let failed = false;
for (const r of results) {
  console.log(`\n${r.page}`);
  for (const [w, x] of Object.entries(r.widths)) console.log(`  ${w}px  height ${x.height}  CLS ${x.cls}  overflow ${x.overflowX ? 'YES' : 'no'}  js errors ${x.jsErrors.length}  ${x.screenshot}`);
  if (r.impeccable) console.log(`  impeccable: ${typeof r.impeccable === 'string' ? r.impeccable : r.impeccable.findings + ' findings ' + JSON.stringify(r.impeccable.byRule)}`);
  if (r.fail.length) { failed = true; r.fail.forEach(f => console.log(`  FAIL ${f}`)); } else console.log('  PASS hard checks');
}
console.log(`\nreport: ${join(OUT, 'report.json')}`);
process.exit(failed ? 1 : 0);
