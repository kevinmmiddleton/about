#!/usr/bin/env node
// og-render.mjs - render og.html to one-night-only/og.png at 1200x630.
//
// Run by hand after an identity change, NOT by build.mjs and NOT in CI. The
// card is identical on every run, so rendering it on a schedule would mean
// carrying a browser in CI to reproduce a file byte for byte.
//
//   node tools/one-night-only/og-render.mjs
//
// Needs Google Chrome installed locally. Exits non-zero and explains itself if
// the render produced anything other than a 1200x630 PNG, so a silent
// half-height card can never be committed.
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = 'file://' + join(HERE, 'og.html');
const OUT = resolve(join(HERE, '..', '..', 'one-night-only', 'og.png'));
const W = 1200, H = 630;

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p));
if (!CHROME) {
  process.stderr.write('og-render: no Chrome found. Install Chrome or render og.html by hand.\n');
  process.exit(1);
}

const PORT = 9455;
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars',
  '--force-color-profile=srgb', '--disable-lcd-text', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await sleep(2000);
  const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((r) => pending.set(i, r));
  };

  // deviceScaleFactor 1: og:image:width says 1200, so the file must be 1200.
  await send('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  // The card is one fixed composition and must never inherit a reader's scheme.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Page.navigate', { url: SRC });
  await sleep(1500);

  const shot = await send('Page.captureScreenshot',
    { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  const buf = Buffer.from(shot.result.data, 'base64');

  // Assert the PNG header's own dimensions rather than trusting the request.
  const pw = buf.readUInt32BE(16), ph = buf.readUInt32BE(20);
  if (pw !== W || ph !== H) {
    process.stderr.write(`og-render: FAIL rendered ${pw}x${ph}, wanted ${W}x${H}. Nothing written.\n`);
    process.exit(1);
  }
  writeFileSync(OUT, buf);
  process.stdout.write(`og-render: wrote ${OUT} ${pw}x${ph} ${statSync(OUT).size} bytes\n`);
  ws.close();
} finally {
  proc.kill();
}
