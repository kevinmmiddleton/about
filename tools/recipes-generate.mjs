#!/usr/bin/env node
// Static recipe pages for middleton.io/recipes/
// Reads recipes/recipes.md (the same file the /recipes/ list renders from) and
// writes one real page per recipe at recipes/<slug>/index.html, each carrying a
// schema.org Recipe in JSON-LD. That markup is what Google's recipe results and
// Safari's "Start Cooking" mode (Apple HomeView, 2026-10-13) read.
// Also writes the list page's cards, tag chips and ItemList JSON-LD into
// recipes/index.html between the RECIPE-* markers (app.js only filters them),
// and keeps the recipe URLs in sitemap.xml between the RECIPE-PAGES markers.
//
// Photos: `photo` is the wide hero (and og:image); optional `photo_square` is
// the card crop. Card thumbnails come from tools/recipes-thumbs.mjs.
//
// Usage:  node tools/recipes-generate.mjs        (from the repo root)

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { splitQuantity } from '../recipes/kitchen.js';

const SITE = 'https://middleton.io';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIR = resolve(ROOT, 'recipes');

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s = '') => esc(s).replace(/"/g, '&quot;');
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const stamp = (rel) => createHash('md5').update(readFileSync(resolve(ROOT, rel))).digest('hex').slice(0, 8);

// ---------- parse (mirrors parseRecipes in recipes/app.js) ----------
function parseRecipes(md) {
  return md.split(/^# /m).filter((b) => b.trim()).map((block) => {
    const lines = block.split('\n');
    const title = lines[0].trim();
    const fmStart = lines.findIndex((l) => l.trim() === '---');
    const fmEnd = lines.findIndex((l, i) => i > fmStart && l.trim() === '---');
    const fm = {};
    if (fmStart !== -1 && fmEnd !== -1) {
      for (const line of lines.slice(fmStart + 1, fmEnd)) {
        const [key, ...rest] = line.split(':');
        if (key.trim()) fm[key.trim()] = rest.join(':').trim();
      }
    }
    const content = lines.slice(fmEnd !== -1 ? fmEnd + 1 : 1).join('\n').trim();
    const firstHeading = content.search(/^## /m);
    const section = (name) => (content.match(new RegExp(`## ${name}\\n([\\s\\S]*?)(?=\\n## |$)`)) || [])[1]?.trim() || '';

    // Ingredients keep their "### For the X" groups for the page; schema gets a flat list.
    const groups = [];
    for (const line of section('Ingredients').split('\n')) {
      if (line.startsWith('### ')) groups.push({ name: line.slice(4).trim(), items: [] });
      else if (line.startsWith('- ')) {
        if (!groups.length) groups.push({ name: '', items: [] });
        groups.at(-1).items.push(line.slice(2).trim());
      }
    }
    const steps = section('Instructions').split('\n')
      .filter((l) => /^\d+\./.test(l))
      .map((l) => l.replace(/^\d+\.\s*/, '').trim());

    return {
      title,
      slug: slugify(title),
      tags: (fm.tags || '').replace(/[\[\]]/g, '').split(',').map((t) => t.trim()).filter(Boolean),
      servings: fm.servings || '',
      source: fm.source || '',
      photo: fm.photo || '',
      photoSquare: fm.photo_square || '',
      notes: fm.notes || '',
      prepTime: fm.prep_time || '',
      cookTime: fm.cook_time || '',
      totalTime: fm.total_time || '',
      cuisine: fm.cuisine || '',
      calories: fm.calories || '',
      protein: fm.protein || '',
      carbs: fm.carbs || '',
      fat: fm.fat || '',
      intro: firstHeading > 0 ? content.slice(0, firstHeading).trim() : '',
      groups,
      steps,
    };
  });
}

// "20 min", "1 hr 15 min", or ISO "PT20M" -> ISO 8601 duration. Times are optional
// frontmatter (prep_time / cook_time / total_time); nothing is guessed.
function isoDuration(s) {
  if (!s) return '';
  if (/^P/i.test(s)) return s.toUpperCase();
  const h = +(s.match(/(\d+)\s*h/i) || [])[1] || 0;
  const m = +(s.match(/(\d+)\s*m/i) || [])[1] || 0;
  return h || m ? `PT${h ? h + 'H' : ''}${m ? m + 'M' : ''}` : '';
}

// A step's short name: its first sentence, cut at a word near 60 characters.
function stepName(text) {
  let first = text.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, '');
  if (first.length > 60) first = first.slice(0, 60).replace(/\s+\S*$/, '') + '…';
  return first;
}

const COURSES = { main: 'Main course', breakfast: 'Breakfast', snack: 'Snack' };

function recipeSchema(r) {
  const url = `${SITE}/recipes/${r.slug}/`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    '@id': `${url}#recipe`,
    name: r.title,
    url,
    mainEntityOfPage: url,
    author: { '@type': 'Person', '@id': `${SITE}/#kevin`, name: 'Kevin Middleton', url: SITE },
    description: r.intro || r.notes || r.title,
  };
  // [wide, square] when a recipe has a separate square crop (wide feeds og:image).
  if (r.photo) schema.image = r.photoSquare ? [r.photo, r.photoSquare] : [r.photo];
  if (r.servings) schema.recipeYield = /^\d+(-\d+)?$/.test(r.servings) ? `${r.servings} serving${r.servings === '1' ? '' : 's'}` : r.servings;
  for (const k of ['prepTime', 'cookTime', 'totalTime']) if (isoDuration(r[k])) schema[k] = isoDuration(r[k]);
  const course = r.tags.find((t) => COURSES[t]);
  if (course) schema.recipeCategory = COURSES[course];
  if (r.cuisine) schema.recipeCuisine = r.cuisine;
  else if (r.tags.includes('asian')) schema.recipeCuisine = 'Asian';
  // Estimated per serving from the gram weights; shown on the page too.
  if (r.calories) {
    schema.nutrition = { '@type': 'NutritionInformation', calories: `${r.calories} calories` };
    if (r.protein) schema.nutrition.proteinContent = `${r.protein} g`;
    if (r.carbs) schema.nutrition.carbohydrateContent = `${r.carbs} g`;
    if (r.fat) schema.nutrition.fatContent = `${r.fat} g`;
  }
  if (r.tags.includes('vegetarian')) schema.suitableForDiet = 'https://schema.org/VegetarianDiet';
  if (r.tags.length) schema.keywords = r.tags.join(', ');
  schema.recipeIngredient = r.groups.flatMap((g) => g.items);
  schema.recipeInstructions = r.steps.map((text, i) => ({
    '@type': 'HowToStep', position: i + 1, name: stepName(text), text, url: `${url}#step-${i + 1}`,
  }));
  if (r.source) schema.isBasedOn = r.source;
  return JSON.stringify(schema, null, 2).replace(/</g, '\\u003c');
}

const BACK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;
const POT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 10h20M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2"/></svg>`;

// ---------- images ----------
// Photo URLs in recipes.md are absolute (https://middleton.io/...). Pages load
// them root-relative, so a local preview shows the working copy's files.
const localPath = (url) => (url && url.startsWith(SITE) ? url.slice(SITE.length) : url);

// Pixel size of a local JPEG or PNG, read from its header (no dependencies, so
// CI can run this without npm install). null when unknown.
function imageSize(url) {
  const rel = localPath(url);
  if (!rel || !rel.startsWith('/')) return null;
  const file = resolve(ROOT, rel.slice(1));
  if (!existsSync(file)) return null;
  const b = readFileSync(file);
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

// A photo needs this many pixels across to fill the wide hero without going
// soft. Smaller ones (the quiche is 293px) keep a contained layout instead.
const HERO_MIN_WIDTH = 600;

// recipes/images/thumbs/<name>-<w>.jpg, written by tools/recipes-thumbs.mjs.
function thumb(url, w) {
  const name = basename(localPath(url) || '', extname(localPath(url) || ''));
  const rel = `/recipes/images/thumbs/${name}-${w}.jpg`;
  return existsSync(resolve(ROOT, rel.slice(1))) ? rel : null;
}

// ---------- shared bits ----------
// "10 min" -> 10 <small>min</small>; "6-8 slices" -> 6-8 <small>slices</small>
const specValue = (v) => esc(v).split(/\s+/).map((t) => (/^[~\d.,-]+$/.test(t) ? t : `<small>${t}</small>`)).join(' ');
const plainServings = (s) => /^\d+(-\d+)?$/.test(s);

function ingredientItem(text) {
  const { qty, name } = splitQuantity(text);
  const m = name.match(/^(.*?)\s*(\([^()]*\))$/);
  const body = m && m[1] ? `${esc(m[1])} <small>${esc(m[2])}</small>` : esc(name);
  return `<li><span class="q">${esc(qty)}</span> <span class="n">${body}</span></li>`;
}

function page(r, css, kitchenStamp) {
  const url = `${SITE}/recipes/${r.slug}/`;
  const desc = r.intro || `${r.title}. Measured in grams, no life story.`;
  const image = r.photo || `${SITE}/recipes/images/recipes.png`;
  const qw = Math.max(2, ...r.groups.flatMap((g) => g.items.map((i) => splitQuantity(i).qty.length)));
  const ingredients = r.groups.map((g) =>
    `${g.name ? `<h3>${esc(g.name)}</h3>\n        ` : ''}<ul class="ing" style="--qw:${qw + 0.5}ch">\n${g.items.map((i) => `          ${ingredientItem(i)}`).join('\n')}\n        </ul>`
  ).join('\n        ');
  const steps = r.steps.map((s, i) => `          <li id="step-${i + 1}">${esc(s)}</li>`).join('\n');

  let hero = '';
  if (r.photo) {
    const size = imageSize(r.photo);
    const wide = size && size.w >= HERO_MIN_WIDTH;
    const dims = size ? ` width="${size.w}" height="${size.h}"` : '';
    // A small photo sits sharp and centered on a blurred copy of itself, so
    // its banner keeps the same shape as the wide ones (Kevin, 2026-11-01).
    const bg = wide ? '' : ` style="--hero-bg:url('${escAttr(localPath(r.photo))}')"`;
    hero = `<figure class="hero${wide ? '' : ' hero-contained'}"${bg}><img src="${escAttr(localPath(r.photo))}" alt="${escAttr(r.title)}"${dims} fetchpriority="high" decoding="async"></figure>`;
  }

  const spec = [
    ['Serves', r.servings], ['Prep', r.prepTime], ['Cook', r.cookTime], ['Total', r.totalTime],
    ['Calories', r.calories], ['Protein', r.protein && `${r.protein} g`],
  ].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${specValue(v)}</dd></div>`).join('');

  const macros = r.protein || r.carbs || r.fat
    ? `<dl class="macro">${[['kcal', r.calories], ['Protein', r.protein && `${r.protein}g`], ['Carbs', r.carbs && `${r.carbs}g`], ['Fat', r.fat && `${r.fat}g`]]
        .filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '';
  const source = r.source ? `<p><a href="${escAttr(r.source)}" target="_blank" rel="noopener">Adapted from source</a></p>` : '';
  const aside = r.notes || macros || source
    ? `<aside class="rp-aside"><div class="notecard">
          <h2>Notes</h2>
          ${r.notes ? `<p>${esc(r.notes)}</p>` : ''}${macros}${source}
        </div></aside>` : '';
  const kitchenData = JSON.stringify({ title: r.title, groups: r.groups, steps: r.steps }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>${esc(r.title)} · Cook Like a PM</title>
  <meta name="description" content="${escAttr(desc)}">
  <link rel="canonical" href="${url}">

  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${escAttr(r.title)}">
  <meta property="og:description" content="${escAttr(desc)}">
  <meta property="og:image" content="${escAttr(image)}">
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:title" content="${escAttr(r.title)}">
  <meta property="twitter:description" content="${escAttr(desc)}">
  <meta property="twitter:image" content="${escAttr(image)}">

  <meta name="theme-color" content="#F4F4F5" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0F0F12" media="(prefers-color-scheme: dark)">

  <link rel="icon" href="${SITE}/recipes/images/chef-technologist.webp">
  <link rel="apple-touch-icon" href="${SITE}/recipes/images/chef-technologist.webp">
  <link rel="stylesheet" href="/fv.css?v=${css}">
<script async src="https://plausible.io/js/pa-CycHtdoRKtjDMtDpjBTA4.js"></script>
<script>
  window.plausible = window.plausible || function () { (plausible.q = plausible.q || []).push(arguments) }, plausible.init = plausible.init || function (i) { plausible.o = i || {} };
  plausible.init()
</script>
  <script type="application/ld+json">
${recipeSchema(r)}
  </script>
</head>
<body class="p-recipes">
  <div class="page-wrapper">
    <a class="brand" href="/recipes/"><img src="/recipes/images/chef-technologist.webp" alt="" width="44" height="44"><span class="brand-t"><span class="brand-t1">Cook Like a</span><span class="brand-t2">PM</span></span><span class="brand-k">Measured. Tested. Minimal scrolling.</span></a>

    <main>
      <article class="recipe-detail">
      <a class="back-btn" href="/recipes/">${BACK_ICON} All recipes</a>
      ${hero}
      <div class="rp-layout${aside ? '' : ' no-aside'}">
        <div class="rp-main">
        <h1>${esc(r.title)}</h1>
        ${r.intro ? `<p class="intro">${esc(r.intro)}</p>` : ''}
        ${spec ? `<dl class="spec">${spec}</dl>` : ''}
        <button type="button" class="km-start plausible-event-name=Kitchen+Mode" hidden>${POT_ICON}Start cooking</button>
        <h2>Ingredients</h2>
        ${ingredients}
        <h2>Instructions</h2>
        <ol class="steps">
${steps}
        </ol>
        </div>
        ${aside}
      </div>
      <a class="back-btn-bottom" href="/recipes/">${BACK_ICON} All recipes</a>
      </article>
    </main>

    <footer>
      <p>Made by <a href="https://middleton.io">Kevin</a>. Say hi. I also do product stuff.</p>
    </footer>
  </div>
  <script type="application/json" id="kitchen-data">${kitchenData}</script>
  <script type="module" src="/recipes/kitchen.js?v=${kitchenStamp}"></script>
</body>
</html>
`;
}

// ---------- the list page (recipes/index.html, between markers) ----------
function cardMeta(r) {
  const serves = r.servings && (plainServings(r.servings) ? `serves ${r.servings}` : r.servings);
  const rest = [serves, r.calories && `${r.calories} cal`].filter(Boolean).join(', ');
  return [r.totalTime && `<b>${esc(r.totalTime)}</b>`, esc(rest)].filter(Boolean).join(' · ');
}

function card(r, feature) {
  const search = [r.title, ...r.tags, ...r.groups.flatMap((g) => g.items)].join(' ').toLowerCase();
  let ph = '';
  if (feature && r.photo) {
    const size = imageSize(r.photo);
    ph = `<span class="rc-ph"><img src="${escAttr(localPath(r.photo))}" alt=""${size ? ` width="${size.w}" height="${size.h}"` : ''} fetchpriority="high" decoding="async"></span>`;
  } else if (r.photo) {
    const src = r.photoSquare || r.photo;
    const big = thumb(src, 640);
    const small = thumb(src, 192);
    const img = big
      ? `<img src="${big}" alt="" width="640" height="480" loading="lazy" decoding="async">`
      : `<img src="${escAttr(localPath(src))}" alt="" loading="lazy" decoding="async">`;
    ph = `<picture class="rc-ph">${small ? `<source media="(max-width: 720px)" srcset="${small}" width="192" height="192">` : ''}${img}</picture>`;
  }
  return `      <a class="recipe-card${feature ? ' is-feature' : ''}" href="/recipes/${r.slug}/" data-tags="${escAttr(r.tags.join(' '))}" data-search="${escAttr(search)}">
        ${ph}
        <div class="rc-tx">${feature ? '<span class="rc-new">Newest</span>' : ''}<h2>${esc(r.title)}</h2><p class="meta">${cardMeta(r)}</p></div>
      </a>`;
}

function writeIndex(recipes) {
  const path = resolve(DIR, 'index.html');
  let html = readFileSync(path, 'utf8');
  // Newest first (the last recipe added to recipes.md), then A to Z.
  const newest = recipes.at(-1);
  const rest = recipes.slice(0, -1).sort((a, b) => a.title.localeCompare(b.title));
  const ordered = [newest, ...rest];
  const tags = [...new Set(recipes.flatMap((r) => r.tags))].sort();
  const chips = [`<button type="button" class="filter-btn" data-tag="" aria-pressed="true">all ${recipes.length}</button>`,
    ...tags.map((t) => `<button type="button" class="filter-btn" data-tag="${escAttr(t)}" aria-pressed="false">${esc(t)}</button>`)];
  const itemList = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: ordered.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/recipes/${r.slug}/` })),
  }, null, 2).replace(/</g, '\\u003c');
  const blocks = {
    'RECIPE-FILTERS': chips.map((c) => `          ${c}`).join('\n'),
    'RECIPE-CARDS': ordered.map((r, i) => card(r, i === 0)).join('\n'),
    'RECIPE-ITEMLIST': `  <script type="application/ld+json">\n${itemList}\n  </script>`,
  };
  for (const [name, body] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- ${name}:START[^>]*-->)[\\s\\S]*?(\\s*<!-- ${name}:END -->)`);
    if (!re.test(html)) throw new Error(`recipes/index.html has no ${name} markers`);
    html = html.replace(re, (_, a, b) => `${a}\n${body}${b}`);
  }
  writeFileSync(path, html);
}

// ---------- build ----------
const recipes = parseRecipes(readFileSync(resolve(DIR, 'recipes.md'), 'utf8'));
const css = stamp('fv.css');
const kitchenStamp = stamp('recipes/kitchen.js');
const slugs = new Set(recipes.map((r) => r.slug));
if (slugs.size !== recipes.length) throw new Error('Two recipes share a slug; rename one.');

for (const r of recipes) {
  if (!r.groups.length || !r.steps.length) throw new Error(`${r.title}: missing ingredients or steps`);
  mkdirSync(resolve(DIR, r.slug), { recursive: true });
  writeFileSync(resolve(DIR, r.slug, 'index.html'), page(r, css, kitchenStamp));
}

// Remove pages for recipes that were deleted or renamed. Only touches folders
// this script made (they hold a generated index.html and nothing else).
for (const d of readdirSync(DIR, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name === 'images' || slugs.has(d.name)) continue;
  const f = readdirSync(resolve(DIR, d.name));
  if (f.length === 1 && f[0] === 'index.html' && readFileSync(resolve(DIR, d.name, 'index.html'), 'utf8').includes('"@type": "Recipe"')) {
    rmSync(resolve(DIR, d.name), { recursive: true });
  }
}

writeIndex(recipes);

// Sitemap: replace the block between the markers.
const smPath = resolve(ROOT, 'sitemap.xml');
if (existsSync(smPath)) {
  const sm = readFileSync(smPath, 'utf8');
  const block = recipes.map((r) => `  <url>\n    <loc>${SITE}/recipes/${r.slug}/</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`).join('\n');
  const re = /(  <!-- RECIPE-PAGES:START[^>]*-->\n)[\s\S]*?(  <!-- RECIPE-PAGES:END -->)/;
  if (re.test(sm)) writeFileSync(smPath, sm.replace(re, `$1${block}\n$2`));
  else console.warn('sitemap.xml has no RECIPE-PAGES markers; skipped');
}

console.log(`Wrote ${recipes.length} recipe pages.`);
