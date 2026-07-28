#!/usr/bin/env node
/**
 * og-export.mjs — render OG.html to real image files.
 *
 * Renders every design x page combination through headless Chromium at 2x,
 * then downsamples to 1200x630 with sharp. Two outputs per combination:
 *
 *   dist/og/<file>-<design>.png   review copy, lossless
 *   dist/og/<file>-<design>.jpg   production copy, q92
 *
 * JPEG is what ships: DESIGN.md calls for it on anything that doubles as an
 * og:image, because a couple of social scrapers still choke on PNG.
 *
 * Usage
 *   node tools/og-export.mjs                       everything
 *   node tools/og-export.mjs --design=editorial    one design, all pages
 *   node tools/og-export.mjs --page=kevinos        one page, all designs
 *   node tools/og-export.mjs --out=dist/og         override output dir
 *
 * Needs playwright available (npm i -D playwright) and a Chromium build.
 * Set CHROMIUM_PATH if playwright's bundled browser is not where it expects.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DESIGNS = ['editorial', 'invert', 'split', 'grid', 'metric'];
const PAGES = {
  home:        'kevin-middleton-og',
  casestudies: 'casestudies-og',
  prototypes:  'prototypes-og',
  officehours: 'officehours-og',
  kevinos:     'kevinos-og',
};

const W = 1200, H = 630, SCALE = 2;

const argOf = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};

const outDir   = path.resolve(ROOT, argOf('out', 'dist/og'));
const designs  = argOf('design') ? argOf('design').split(',') : DESIGNS;
const pages    = argOf('page')   ? argOf('page').split(',')   : Object.keys(PAGES);

for (const d of designs) if (!DESIGNS.includes(d)) throw new Error(`unknown design: ${d}`);
for (const p of pages)   if (!PAGES[p])            throw new Error(`unknown page: ${p}`);

/* ---- a tiny static server so relative asset paths (/images/...) resolve ---- */
const MIME = {
  '.html':'text/html', '.htm':'text/html', '.css':'text/css', '.js':'text/javascript',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.gif':'image/gif',
};

function serve(root) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, rel);
    // keep the server inside the repo
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (!fsSync.existsSync(file) || fsSync.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fsSync.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* ------------------------------- run -------------------------------- */
const server = await serve(ROOT);
const port = server.address().port;
await fs.mkdir(outDir, { recursive: true });

const launch = { args: ['--font-render-hinting=none'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;

const browser = await chromium.launch(launch);
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: SCALE,
});

let n = 0;
for (const design of designs) {
  for (const pageKey of pages) {
    const url = `http://127.0.0.1:${port}/OG.html?design=${design}&page=${pageKey}&chrome=0`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('html[data-og-ready="1"]');
    // let any background-image decode before the shot
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);

    const shot = await page.locator('#og').screenshot({ type: 'png' });
    const base = path.join(outDir, `${PAGES[pageKey]}-${design}`);

    const img = sharp(shot).resize(W, H, { fit: 'fill', kernel: 'lanczos3' });
    await img.clone().png({ compressionLevel: 9 }).toFile(`${base}.png`);
    await img.clone().jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(`${base}.jpg`);

    n++;
    console.log(`  ${design.padEnd(10)} ${pageKey.padEnd(12)} -> ${path.relative(ROOT, base)}.{png,jpg}`);
  }
}

await browser.close();
server.close();
console.log(`\n${n} image${n === 1 ? '' : 's'} written to ${path.relative(ROOT, outDir)}/ at ${W}x${H}.`);
