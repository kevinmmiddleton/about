#!/usr/bin/env node
// Static blog generator for middleton.io
// Reads published rows from Supabase `blog_posts`, renders each through the
// site's blog template, and writes static HTML into ../blog/. The blog never
// reads Supabase at runtime — this runs at publish time; commit+push deploys.
//
// Usage:  node tools/blog-generate.mjs        (from the repo root)
//
// The anon key below is the PUBLIC, SELECT-only key (same one the board uses
// client-side). No write access. Safe to commit.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = 'https://drtyjjegimjocxvjdszh.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRydHlqamVnaW1qb2N4dmpkc3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTYxNTQsImV4cCI6MjA4NTIzMjE1NH0.Bcq9FH7nNlhbQDExwnHXjzwPw39HeMsFqJaKZZuZ1QI';
const SITE = 'https://middleton.io';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BLOG_DIR = resolve(ROOT, 'blog');

// ---------- helpers ----------
const esc = (s='') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escAttr = (s='') => esc(s).replace(/"/g,'&quot;');
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
function isoDate(iso) { return iso ? new Date(iso).toISOString().slice(0,10) : ''; }

// ---------- mini markdown ----------
function inline(text) {
  let s = esc(text);
  // inline code
  s = s.replace(/`([^`]+)`/g, (_,c)=>`<code>${c}</code>`);
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_,t,u)=>`<a href="${u}">${t}</a>`);
  // bold **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, (_,t)=>`<strong>${t}</strong>`);
  // italic *text*
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, (_,p,t)=>`${p}<em>${t}</em>`);
  return s;
}
const IMG_LINE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/;

function renderMarkdown(md='') {
  const lines = md.replace(/\r\n/g,'\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    let line = lines[i];
    if (line.trim() === '') { i++; continue; }
    // fenced code / prompt block
    if (line.trim().startsWith('```')) {
      i++; const buf = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++; }
      i++; // closing fence
      out.push(`<div class="prompt-block">${esc(buf.join('\n'))}</div>`);
      continue;
    }
    // standalone image -> figure
    const im = line.trim().match(IMG_LINE);
    if (im) {
      const [, alt, src, cap] = im;
      out.push(`<figure>\n  <img src="${escAttr(src)}" alt="${escAttr(alt)}" loading="lazy">${cap?`\n  <figcaption>${inline(cap)}</figcaption>`:''}\n</figure>`);
      i++; continue;
    }
    // heading
    let h = line.match(/^(#{2,3})\s+(.*)$/);
    if (h) { const lvl = h[1].length; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); i++; continue; }
    // list
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^[-*]\s+/,''))}</li>`); i++; }
      out.push(`<ul>\n${items.join('\n')}\n</ul>`);
      continue;
    }
    // paragraph (gather until blank / block start)
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].trim().startsWith('```')
           && !/^(#{2,3})\s+/.test(lines[i]) && !/^[-*]\s+/.test(lines[i]) && !lines[i].trim().match(IMG_LINE)) {
      para.push(lines[i]); i++;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n\n');
}

// ---------- series cross-links ----------
function seriesCallouts(post, all) {
  if (!post.series) return { top:'', bottom:'' };
  const sibs = all.filter(p => p.series === post.series).sort((a,b)=>(a.series_order||0)-(b.series_order||0));
  const idx = sibs.findIndex(p => p.id === post.id);
  const part = post.series_order || (idx+1);
  const first = sibs[0];
  const next = sibs[idx+1];
  let top;
  if (idx === 0) top = `This is Part 1 of a series on ${esc(post.series)}.`;
  else top = `Part ${part} of a series on ${esc(post.series)}. Start at the beginning: <a href="/blog/${first.slug}/">${esc(first.title)}</a>.`;
  let bottom;
  if (next) bottom = `Next in the series: <a href="/blog/${next.slug}/">${esc(next.title)}</a>.`;
  else bottom = `That's the series so far. Start over at <a href="/blog/${first.slug}/">Part 1</a>, or browse everything on the <a href="/blog/">blog</a>.`;
  return { top: `<p class="callout">${top}</p>`, bottom: `<p class="callout">${bottom}</p>` };
}

// ---------- shared chrome ----------
const HEAD_LINKS = `    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Epilogue:wght@700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles-merged.css">
    <link rel="stylesheet" href="/blog/blog.css">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`;
const PLAUSIBLE = `    <!-- Privacy-friendly analytics by Plausible -->
    <script async src="https://plausible.io/js/pa-CycHtdoRKtjDMtDpjBTA4.js"></script>
    <script>
    window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
    plausible.init()
    </script>`;
const HEADER = `    <header class="header name-visible">
        <nav class="nav-container has-cta">
            <a href="/" class="logo">
                <span class="logo-text visible" id="header-name">
                    <span class="logo-name">Kevin Middleton</span>
                    <span class="logo-subtitle">Full Stack Product Manager</span>
                </span>
            </a>
            <button id="menu-toggle" class="menu-toggle" aria-label="Toggle menu">
                <span></span><span></span><span></span>
            </button>
            <ul id="menu" class="nav-menu">
                <li><a href="/#building">Building</a></li>
                <li><a href="/#about">About</a></li>
                <li><a href="/#experience">Experience</a></li>
                <li><a href="/#projects">Case Studies</a></li>
                <li><a href="/blog/">Blog</a></li>
                <li><a href="/#connect">Let's Talk</a></li>
                <li class="nav-cta-mobile"><a href="/officehours/">Office Hours</a></li>
            </ul>
            <a href="/officehours/" class="header-cta">Office Hours</a>
        </nav>
    </header>`;
const FOOTER = `    <footer id="footer" class="footer">
        <div class="container footer-content">
            <p class="footer-text">&copy;2026 Kevin Middleton. 👋</p>
        </div>
    </footer>`;
const LIGHTBOX = `    <div id="lightbox" class="lightbox">
        <span class="close-lightbox">&times;</span>
        <div class="lightbox-content">
            <img id="lightbox-image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="">
        </div>
    </div>`;

// ---------- article page ----------
function articlePage(post, all) {
  const url = `${SITE}/blog/${post.slug}/`;
  const cover = post.cover_image || `${SITE}/images/kevin-middleton-og.png`;
  const coverAbs = cover.startsWith('http') ? cover : `${SITE}${cover.startsWith('/')?'':'/'}${cover}`;
  const pub = isoDate(post.published_at);
  const mod = isoDate(post.updated_at) || pub;
  const { top, bottom } = seriesCallouts(post, all);
  const metaLink = post.linkedin_url
    ? `\n            <span class="dot">·</span>\n            <a href="${escAttr(post.linkedin_url)}" target="_blank" rel="noopener">First published on LinkedIn</a>` : '';
  const article = {
    "@context":"https://schema.org","@type":"Article",
    headline: post.title, description: post.excerpt,
    author:{"@type":"Person",name:"Kevin Middleton",url:SITE,sameAs:"https://www.linkedin.com/in/kevinmiddleton"},
    publisher:{"@type":"Person",name:"Kevin Middleton",url:SITE},
    mainEntityOfPage:{"@type":"WebPage","@id":url}, url, image: coverAbs,
    articleSection:"Blog", keywords: post.tags||[],
    datePublished: pub, dateModified: mod };
  const crumbs = {
    "@context":"https://schema.org","@type":"BreadcrumbList",
    itemListElement:[
      {"@type":"ListItem",position:1,name:"Home",item:`${SITE}/`},
      {"@type":"ListItem",position:2,name:"Blog",item:`${SITE}/blog/`},
      {"@type":"ListItem",position:3,name:post.title,item:url}]};
  const body = [top, renderMarkdown(post.body_markdown), bottom,
    `<div class="article-bio">\n  <p>Kevin Middleton is a Full Stack Product Manager who builds systems that help product teams not lose their minds. Currently looking for his next role in NYC. More at <a href="https://middleton.io">middleton.io</a> and <a href="https://middleton.io/officehours/">middleton.io/officehours</a>.</p>\n</div>`
  ].filter(Boolean).join('\n\n');
  // every link in the article body opens in a new tab
  const bodyLinked = body.replace(/<a (?![^>]*\btarget=)/g, '<a target="_blank" rel="noopener" ');

  return `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#4A6A8C">
    <title>${esc(post.title)} | Kevin Middleton</title>
    <meta name="description" content="${escAttr(post.excerpt)}">

    <link rel="canonical" href="${url}">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${escAttr(post.title)}">
    <meta property="og:description" content="${escAttr(post.excerpt)}">
    <meta property="og:image" content="${escAttr(coverAbs)}">
    <meta property="og:site_name" content="Kevin Middleton">
    <meta property="article:published_time" content="${pub}">
    <meta property="article:author" content="Kevin Middleton">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escAttr(post.title)}">
    <meta name="twitter:description" content="${escAttr(post.excerpt)}">
    <meta name="twitter:image" content="${escAttr(coverAbs)}">

${HEAD_LINKS}

    <!-- JSON-LD: Article -->
    <script type="application/ld+json">
    ${JSON.stringify(article, null, 4).replace(/\n/g,'\n    ')}
    </script>

    <!-- JSON-LD: Breadcrumb -->
    <script type="application/ld+json">
    ${JSON.stringify(crumbs, null, 4).replace(/\n/g,'\n    ')}
    </script>

${PLAUSIBLE}
</head>
<body>
${HEADER}

    <main>
    <article class="article">
        <p class="article-eyebrow">${esc(post.topic||'')}</p>
        <h1 class="article-title">${esc(post.title)}</h1>
        <div class="article-meta">
            <span>By Kevin Middleton</span>
            <span class="dot">·</span>
            <span>${fmtDate(post.published_at)}</span>${metaLink}
        </div>

        <img class="article-hero" src="${escAttr(post.cover_image||'')}" alt="${escAttr(post.cover_alt||post.title)}">

        <div class="article-body">
${bodyLinked}
        </div>
    </article>
    </main>

${FOOTER}

${LIGHTBOX}

    <script src="/blog/blog-nav.js"></script>
</body>
</html>
`;
}

// ---------- hub page ----------
function hubPage(posts) {
  const blogLd = {
    "@context":"https://schema.org","@type":"Blog",name:"Kevin Middleton's Blog",url:`${SITE}/blog/`,
    author:{"@type":"Person",name:"Kevin Middleton",url:SITE},
    blogPost: posts.map(p=>({"@type":"BlogPosting",headline:p.title,url:`${SITE}/blog/${p.slug}/`,datePublished:isoDate(p.published_at)}))};
  const crumbs = {"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[
    {"@type":"ListItem",position:1,name:"Home",item:`${SITE}/`},
    {"@type":"ListItem",position:2,name:"Blog",item:`${SITE}/blog/`}]};
  const cards = posts.map(p=>`            <a class="post-card" href="/blog/${p.slug}/">
                <img class="post-card__thumb" src="${escAttr(p.cover_image||'')}" alt="" loading="lazy">
                <div class="post-card__body">
                    <p class="post-eyebrow">${esc(p.topic||'')}</p>
                    <h2>${esc(p.title)}</h2>
                    <p>${esc(p.excerpt||'')}</p>
                    <span class="post-date">${fmtDate(p.published_at)}</span>
                </div>
            </a>`).join('\n\n');
  return `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#4A6A8C">
    <title>Blog | Kevin Middleton</title>
    <meta name="description" content="Kevin Middleton on building with AI, product, and the systems in between. Essays on AI workflows, automation, privacy, and where personal AI is headed.">

    <link rel="canonical" href="${SITE}/blog/">

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${SITE}/blog/">
    <meta property="og:title" content="Blog | Kevin Middleton">
    <meta property="og:description" content="Essays on building with AI, product, and the systems in between.">
    <meta property="og:image" content="${SITE}/images/kevin-middleton-og.png">
    <meta property="og:site_name" content="Kevin Middleton">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Blog | Kevin Middleton">
    <meta name="twitter:description" content="Essays on building with AI, product, and the systems in between.">
    <meta name="twitter:image" content="${SITE}/images/kevin-middleton-og.png">

${HEAD_LINKS}

    <!-- JSON-LD: Blog + posts -->
    <script type="application/ld+json">
    ${JSON.stringify(blogLd, null, 4).replace(/\n/g,'\n    ')}
    </script>

    <!-- JSON-LD: Breadcrumb -->
    <script type="application/ld+json">
    ${JSON.stringify(crumbs, null, 4).replace(/\n/g,'\n    ')}
    </script>

${PLAUSIBLE}
</head>
<body>
${HEADER}

    <main>
    <section class="blog-index">
        <div class="blog-index-header">
            <h1>Blog</h1>
            <p>Essays on building with AI, product, and the systems in between. Long-form, hands-on, and occasionally about what broke.</p>
        </div>

        <div class="post-list">
${cards}
        </div>
    </section>
    </main>

${FOOTER}

    <script src="/blog/blog-nav.js"></script>
</body>
</html>
`;
}

// ---------- sitemap + llms (replace marked blog region) ----------
function replaceRegion(text, start, end, replacement) {
  const s = text.indexOf(start), e = text.indexOf(end);
  if (s === -1 || e === -1) return null;
  return text.slice(0, s+start.length) + '\n' + replacement + '\n' + text.slice(e);
}
function updateSitemap(posts) {
  const f = resolve(ROOT,'sitemap.xml');
  let xml = readFileSync(f,'utf8');
  // deterministic hub lastmod = most recent post date (so re-runs with an
  // unchanged DB produce no diff — safe for a scheduled/auto job)
  const latest = posts.map(p => isoDate(p.updated_at) || isoDate(p.published_at)).filter(Boolean).sort().pop() || '';
  const entries = [`  <url>\n    <loc>${SITE}/blog/</loc>\n    <lastmod>${latest}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`]
    .concat(posts.map(p=>`  <url>\n    <loc>${SITE}/blog/${p.slug}/</loc>\n    <lastmod>${isoDate(p.updated_at)||isoDate(p.published_at)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`)).join('\n');
  const out = replaceRegion(xml, '<!-- BLOG:START -->', '<!-- BLOG:END -->', entries);
  if (out) { writeFileSync(f, out); return true; }
  console.warn('  ! sitemap markers not found; skipped'); return false;
}
function updateLlms(posts) {
  const f = resolve(ROOT,'llms.txt');
  let txt = readFileSync(f,'utf8');
  const lines = [`- [Blog index](${SITE}/blog/): Essays on building with AI, product, and the systems in between.`]
    .concat(posts.map(p=>`- [${p.title}](${SITE}/blog/${p.slug}/): ${p.excerpt||''}`)).join('\n');
  const out = replaceRegion(txt, '<!-- BLOG:START -->', '<!-- BLOG:END -->', lines);
  if (out) { writeFileSync(f, out); return true; }
  console.warn('  ! llms.txt markers not found; skipped'); return false;
}

// ---------- localize Supabase-hosted images into the repo ----------
// Board uploads land in Supabase Storage (blog-images). At publish we pull them
// into blog/<slug>/ and rewrite the refs so the live site serves them from
// middleton.io (same-origin). Uploaded filenames are unique, so skip-if-exists.
const STORAGE_MARK = '/storage/v1/object/public/blog-images/';
async function localizeImages(post) {
  const dir = resolve(BLOG_DIR, post.slug);
  mkdirSync(dir, { recursive: true });
  const cache = new Map();
  async function pull(url) {
    if (cache.has(url)) return cache.get(url);
    const base = decodeURIComponent(url.split(STORAGE_MARK)[1].split('/').pop().split('?')[0]);
    const dest = resolve(dir, base);
    if (!existsSync(dest)) {
      const r = await fetch(url);
      if (!r.ok) { console.warn(`    ! image ${url} -> ${r.status}`); cache.set(url, url); return url; }
      writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      console.log(`    localized -> blog/${post.slug}/${base}`);
    }
    cache.set(url, base); return base; // relative to the page
  }
  if (post.cover_image && post.cover_image.includes(STORAGE_MARK)) {
    const ref = await pull(post.cover_image);
    post.cover_image = ref.startsWith('http') ? ref : `/blog/${post.slug}/${ref}`;
  }
  const urls = [...new Set([...(post.body_markdown || '').matchAll(/\((https?:\/\/[^)\s"]*\/storage\/v1\/object\/public\/blog-images\/[^)\s"]+)/g)].map(m => m[1]))];
  for (const url of urls) {
    const ref = await pull(url);
    if (ref !== url) post.body_markdown = post.body_markdown.split(url).join(ref);
  }
}

// ---------- main ----------
async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?status=eq.published&select=*&order=published_at.desc`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }});
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const posts = await res.json();
  console.log(`Fetched ${posts.length} published post(s).`);
  for (const p of posts) {
    const dir = resolve(BLOG_DIR, p.slug);
    mkdirSync(dir, { recursive: true });
    await localizeImages(p);
    writeFileSync(resolve(dir,'index.html'), articlePage(p, posts));
    console.log(`  wrote blog/${p.slug}/index.html`);
  }
  writeFileSync(resolve(BLOG_DIR,'index.html'), hubPage(posts));
  console.log('  wrote blog/index.html (hub)');
  updateSitemap(posts);
  updateLlms(posts);
  console.log('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });
