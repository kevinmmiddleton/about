#!/usr/bin/env node
// Card thumbnails for middleton.io/recipes/.
// The list used to load each full photo (up to 1400px, 2.6 MB in all) to draw a
// 90px square. This writes two small crops per recipe into recipes/images/thumbs/:
//   <name>-192.jpg  192x192, the 96px phone row at 2x
//   <name>-640.jpg  640x480, the 4:3 desktop card at about 2x
// from each recipe's photo_square (or photo when it has none). Crops keep the
// top of the photo and lose the bottom (Kevin: "crop from the bottom").
// tools/recipes-generate.mjs uses a thumb when it exists and falls back to the
// full photo when it does not, so CI (which has no sharp) never breaks.
//
// Usage: npm install && node tools/recipes-thumbs.mjs   (re-run after adding a photo)
import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES = resolve(ROOT, 'recipes/images');
const OUT = resolve(IMAGES, 'thumbs');
mkdirSync(OUT, { recursive: true });

const md = readFileSync(resolve(ROOT, 'recipes/recipes.md'), 'utf8');
const sources = new Set();
for (const block of md.split(/^# /m).slice(1)) {
  const square = block.match(/^photo_square:\s*(\S+)/m)?.[1];
  const photo = block.match(/^photo:\s*(\S+)/m)?.[1];
  if (square || photo) sources.add(basename(square || photo));
}

for (const file of sources) {
  const src = resolve(IMAGES, file);
  if (!existsSync(src)) { console.warn(`missing ${file}`); continue; }
  const name = basename(file, extname(file));
  for (const [w, h] of [[192, 192], [640, 480]]) {
    const out = resolve(OUT, `${name}-${w}.jpg`);
    if (existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs) continue;
    await sharp(src).rotate().resize(w, h, { fit: 'cover', position: 'top' })
      .jpeg({ quality: 78, mozjpeg: true, progressive: true }).toFile(out);
    console.log(`wrote thumbs/${name}-${w}.jpg`);
  }
}
