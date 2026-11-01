// Every generated recipe page must carry valid schema.org Recipe JSON-LD: it is
// what Google's recipe results and Safari's "Start Cooking" read. Also checks the
// list page's ItemList and the one-h1 rule. Run after tools/recipes-generate.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://middleton.io';
const ISO = /^P(T(\d+H)?(\d+M)?)$/;
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const slugs = readdirSync(resolve(ROOT, 'recipes'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(resolve(ROOT, 'recipes', d.name, 'index.html')))
  .map((d) => d.name);
const localFile = (url) => resolve(ROOT, url.replace(`${SITE}/`, ''));

test('there are recipe pages', () => assert.ok(slugs.length >= 10));

for (const slug of slugs) {
  test(`${slug}: Recipe JSON-LD`, () => {
    const html = readFileSync(resolve(ROOT, 'recipes', slug, 'index.html'), 'utf8');
    const recipes = ldBlocks(html).filter((b) => b['@type'] === 'Recipe');
    assert.equal(recipes.length, 1, 'exactly one Recipe');
    const r = recipes[0];
    assert.equal(r['@context'], 'https://schema.org');
    assert.equal(r.url, `${SITE}/recipes/${slug}/`);
    assert.ok(r.name && typeof r.name === 'string');
    assert.ok(typeof r.description === 'string' && r.description.length > 0);
    assert.equal(r.author?.['@type'], 'Person');
    // Google requires image; each must be a real file on the site.
    assert.ok(Array.isArray(r.image) && r.image.length >= 1);
    for (const img of r.image) {
      assert.ok(img.startsWith(`${SITE}/`), img);
      assert.ok(existsSync(localFile(img)), `missing ${img}`);
    }
    // og:image is the first (wide) one.
    assert.ok(html.includes(`<meta property="og:image" content="${r.image[0]}">`));
    for (const k of ['prepTime', 'cookTime', 'totalTime']) if (r[k]) assert.match(r[k], ISO, k);
    assert.ok(typeof r.recipeYield === 'string' && r.recipeYield);
    if (r.nutrition) {
      assert.equal(r.nutrition['@type'], 'NutritionInformation');
      assert.match(r.nutrition.calories, /^\d+ calories$/);
      for (const k of ['proteinContent', 'carbohydrateContent', 'fatContent']) if (r.nutrition[k]) assert.match(r.nutrition[k], /^\d+(\.\d+)? g$/);
    }
    assert.ok(r.recipeIngredient.length > 0 && r.recipeIngredient.every((s) => typeof s === 'string' && s.trim()));
    assert.ok(r.recipeInstructions.length > 0);
    r.recipeInstructions.forEach((s, i) => {
      assert.equal(s['@type'], 'HowToStep');
      assert.equal(s.position, i + 1);
      assert.ok(s.text && s.name);
      assert.equal(s.url, `${SITE}/recipes/${slug}/#step-${i + 1}`);
      assert.ok(html.includes(`id="step-${i + 1}"`), `step anchor ${i + 1}`);
    });
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'one h1');
    assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ''), /[\u2014\u2013]/, 'no em or en dashes');
  });
}

test('list page: ItemList matches the recipe pages, cards are server-rendered', () => {
  const html = readFileSync(resolve(ROOT, 'recipes/index.html'), 'utf8');
  const list = ldBlocks(html).find((b) => b['@type'] === 'ItemList');
  assert.ok(list);
  const urls = list.itemListElement.map((e, i) => { assert.equal(e.position, i + 1); return e.url; });
  assert.deepEqual([...urls].sort(), slugs.map((s) => `${SITE}/recipes/${s}/`).sort());
  for (const s of slugs) assert.ok(html.includes(`href="/recipes/${s}/"`), s);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'one h1');
  for (const img of html.matchAll(/<img [^>]*>/g)) {
    assert.match(img[0], /width="\d+" height="\d+"/, img[0]);
    assert.match(img[0], /alt=""/, img[0]);
  }
});
