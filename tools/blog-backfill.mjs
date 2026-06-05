#!/usr/bin/env node
// One-time backfill: read the 4 existing hand-built blog pages, reverse the
// template into blog_posts row data (markdown body), and print SQL INSERTs.
// Run:  node tools/blog-backfill.mjs > /tmp/blog-backfill.sql
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLUGS = ['ai-job-search-assistant','owning-your-context','ai-job-scanner-daily','ai-tools-non-technical'];

const unesc = s => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const m1 = (re, s) => { const m = s.match(re); return m ? m[1] : null; };

function inlineToMd(html) {
  let s = html;
  s = s.replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_,u,t)=>`[${unesc(t)}](${u})`);
  s = s.replace(/<strong>([\s\S]*?)<\/strong>/g, (_,t)=>`**${unesc(t)}**`);
  s = s.replace(/<em>([\s\S]*?)<\/em>/g, (_,t)=>`*${unesc(t)}*`);
  s = s.replace(/<code>([\s\S]*?)<\/code>/g, (_,t)=>`\`${unesc(t)}\``);
  return unesc(s).trim();
}

function bodyToMd(inner) {
  const blocks = [];
  const re = /<figure>[\s\S]*?<\/figure>|<div class="prompt-block">[\s\S]*?<\/div>|<p class="prompt-block">[\s\S]*?<\/p>|<p class="callout">[\s\S]*?<\/p>|<div class="article-bio">[\s\S]*?<\/div>|<h2>[\s\S]*?<\/h2>|<h3>[\s\S]*?<\/h3>|<ul>[\s\S]*?<\/ul>|<p>[\s\S]*?<\/p>/g;
  let mm;
  while ((mm = re.exec(inner)) !== null) {
    const el = mm[0];
    if (el.startsWith('<p class="callout"') || el.startsWith('<div class="article-bio"')) continue; // generated, skip
    if (el.startsWith('<p class="prompt-block"')) {
      const inner2 = m1(/<p class="prompt-block">([\s\S]*?)<\/p>/, el);
      blocks.push('```\n' + unesc(inner2) + '\n```');
    } else if (el.startsWith('<figure>')) {
      const src = m1(/<img\s+src="([^"]*)"/, el);
      const alt = m1(/<img[^>]*\salt="([^"]*)"/, el) || '';
      const cap = m1(/<figcaption>([\s\S]*?)<\/figcaption>/, el);
      blocks.push(`![${unesc(alt)}](${src}${cap?` "${unesc(cap).replace(/"/g,'')}"`:''})`);
    } else if (el.startsWith('<div class="prompt-block"')) {
      const inner2 = m1(/<div class="prompt-block">([\s\S]*?)<\/div>/, el);
      blocks.push('```\n' + unesc(inner2) + '\n```');
    } else if (el.startsWith('<h2>')) blocks.push('## ' + inlineToMd(m1(/<h2>([\s\S]*?)<\/h2>/, el)));
    else if (el.startsWith('<h3>')) blocks.push('### ' + inlineToMd(m1(/<h3>([\s\S]*?)<\/h3>/, el)));
    else if (el.startsWith('<ul>')) {
      const items = [...el.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x=>'- ' + inlineToMd(x[1]));
      blocks.push(items.join('\n'));
    } else if (el.startsWith('<p>')) blocks.push(inlineToMd(m1(/<p>([\s\S]*?)<\/p>/, el)));
  }
  return blocks.join('\n\n');
}

const SUPABASE_URL = 'https://drtyjjegimjocxvjdszh.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRydHlqamVnaW1qb2N4dmpkc3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTYxNTQsImV4cCI6MjA4NTIzMjE1NH0.Bcq9FH7nNlhbQDExwnHXjzwPw39HeMsFqJaKZZuZ1QI';

const rows = [];
for (const slug of SLUGS) {
  const html = readFileSync(resolve(ROOT,'blog',slug,'index.html'),'utf8');
  const title = unesc(m1(/<h1 class="article-title">([\s\S]*?)<\/h1>/, html));
  const excerpt = unesc(m1(/<meta name="description" content="([^"]*)"/, html));
  const topic = unesc(m1(/<p class="article-eyebrow">([^<]*)<\/p>/, html));
  const cover_alt = unesc(m1(/<img class="article-hero"[^>]*\salt="([^"]*)"/, html) || title);
  const linkedin_url = m1(/<a href="([^"]*)"[^>]*>First published on LinkedIn/, html);
  const published_at = m1(/"datePublished":\s*"([^"]*)"/, html);
  const updated_at = m1(/"dateModified":\s*"([^"]*)"/, html);
  const kw = m1(/"keywords":\s*(\[[^\]]*\])/, html);
  const tags = kw ? JSON.parse(kw) : [];
  const calloutTop = m1(/<p class="callout">([\s\S]*?)<\/p>/, html) || '';
  let series_order = 1;
  const pm = calloutTop.match(/Part (\d+)/); if (pm) series_order = +pm[1];
  const inner = m1(/<div class="article-body">([\s\S]*)<\/div>\s*<\/article>/, html);
  const body_markdown = bodyToMd(inner);
  rows.push({ slug, title, excerpt, topic, cover_image:`/blog/${slug}/cover.jpg`, cover_alt,
    tags, status:'published', series:'Building with AI', series_order, linkedin_url,
    published_at, updated_at, sort_order: series_order, body_markdown });
}

// Upsert via PostgREST (merge on slug)
const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?on_conflict=slug`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json',
             Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(rows)
});
console.log(`Upsert status ${res.status}. Rows: ${rows.length}. body lengths: ${rows.map(r=>r.body_markdown.length).join(', ')}`);
if (!res.ok) console.error(await res.text());
