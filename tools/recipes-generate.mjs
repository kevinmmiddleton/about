#!/usr/bin/env node
// Static recipe pages for middleton.io/recipes/
// Reads recipes/recipes.md (the same file the /recipes/ list renders from) and
// writes one real page per recipe at recipes/<slug>/index.html, each carrying a
// schema.org Recipe in JSON-LD. That markup is what Google's recipe results and
// Safari's "Start Cooking" mode (Apple HomeView, 2026-10-13) read. The list page
// is drawn by JavaScript, so nothing there is visible to either.
// Also keeps the recipe URLs in sitemap.xml between the RECIPE-PAGES markers.
//
// Usage:  node tools/recipes-generate.mjs        (from the repo root)

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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
      notes: fm.notes || '',
      prepTime: fm.prep_time || '',
      cookTime: fm.cook_time || '',
      totalTime: fm.total_time || '',
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
  if (r.photo) schema.image = [r.photo];
  if (r.servings) schema.recipeYield = /^\d+(-\d+)?$/.test(r.servings) ? `${r.servings} servings` : r.servings;
  for (const k of ['prepTime', 'cookTime', 'totalTime']) if (isoDuration(r[k])) schema[k] = isoDuration(r[k]);
  const course = r.tags.find((t) => COURSES[t]);
  if (course) schema.recipeCategory = COURSES[course];
  if (r.tags.includes('asian')) schema.recipeCuisine = 'Asian';
  if (r.tags.includes('vegetarian')) schema.suitableForDiet = 'https://schema.org/VegetarianDiet';
  if (r.tags.length) schema.keywords = r.tags.join(', ');
  schema.recipeIngredient = r.groups.flatMap((g) => g.items);
  schema.recipeInstructions = r.steps.map((text, i) => ({
    '@type': 'HowToStep', position: i + 1, text, url: `${url}#step-${i + 1}`,
  }));
  if (r.source) schema.isBasedOn = r.source;
  return JSON.stringify(schema, null, 2).replace(/</g, '\\u003c');
}

const BACK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;

function page(r, css) {
  const url = `${SITE}/recipes/${r.slug}/`;
  const desc = r.intro || `${r.title}. Measured in grams, no life story.`;
  const image = r.photo || `${SITE}/recipes/images/recipes.png`;
  const ingredients = r.groups.map((g) =>
    `${g.name ? `<h3>${esc(g.name)}</h3>\n      ` : ''}<ul>\n${g.items.map((i) => `        <li>${esc(i)}</li>`).join('\n')}\n      </ul>`
  ).join('\n      ');
  const steps = r.steps.map((s, i) => `        <li id="step-${i + 1}">${esc(s)}</li>`).join('\n');

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

  <meta name="theme-color" content="#fefcfd" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0d0d0f" media="(prefers-color-scheme: dark)">

  <link rel="icon" href="${SITE}/recipes/images/chef-technologist.webp">
  <link rel="apple-touch-icon" href="${SITE}/recipes/images/chef-technologist.webp">
  <link rel="stylesheet" href="/fv.css?v=${css}">
  <style>
    body.p-recipes a.back-btn, body.p-recipes a.back-btn-bottom, body.p-recipes .header-home { text-decoration: none; color: inherit; }
    body.p-recipes a.back-btn, body.p-recipes a.back-btn-bottom { color: var(--color-text-light); }
  </style>
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
    <header>
      <a class="header-home" href="/recipes/">
        <div class="header-title">
          <img src="${SITE}/recipes/images/chef-technologist.webp" alt="" class="header-emoji">
          <div class="header-text">
            <h1><span class="title-line title-top">Cook Like a</span><span class="title-line title-pm">PM</span></h1>
            <p class="subtitle">MEASURED. TESTED. MINIMAL SCROLLING.</p>
          </div>
        </div>
      </a>
    </header>

    <main>
      <article class="recipe-detail visible">
      <a class="back-btn" href="/recipes/">${BACK_ICON} All recipes</a>
      <div class="detail-header">
        <div class="detail-header-content">
          <h1>${esc(r.title)}</h1>
          <hr class="title-rule">
          <div class="meta">${r.servings ? `Serves ${esc(r.servings)}` : ''}${r.source ? `${r.servings ? ' · ' : ''}<a href="${escAttr(r.source)}" target="_blank" rel="noopener">Adapted from source</a>` : ''}</div>
        </div>
        ${r.photo ? `<img class="detail-thumb" src="${escAttr(r.photo)}" alt="${escAttr(r.title)}">` : ''}
      </div>
      ${r.intro ? `<p class="intro">${esc(r.intro)}</p>` : ''}
      <h2>Ingredients</h2>
      ${ingredients}
      <h2>Instructions</h2>
      <ol>
${steps}
      </ol>
      ${r.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(r.notes)}</div>` : ''}
      <a class="back-btn-bottom" href="/recipes/">${BACK_ICON} All recipes</a>
      </article>
    </main>

    <footer>
      <p>Made by <a href="https://middleton.io">Kevin</a>. Say hi. I also do product stuff.</p>
    </footer>
  </div>
</body>
</html>
`;
}

// ---------- build ----------
const recipes = parseRecipes(readFileSync(resolve(DIR, 'recipes.md'), 'utf8'));
const css = stamp('fv.css');
const slugs = new Set(recipes.map((r) => r.slug));
if (slugs.size !== recipes.length) throw new Error('Two recipes share a slug; rename one.');

for (const r of recipes) {
  if (!r.groups.length || !r.steps.length) throw new Error(`${r.title}: missing ingredients or steps`);
  mkdirSync(resolve(DIR, r.slug), { recursive: true });
  writeFileSync(resolve(DIR, r.slug, 'index.html'), page(r, css));
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
