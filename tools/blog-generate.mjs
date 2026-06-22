#!/usr/bin/env node
// Static blog generator for middleton.io
// Reads markdown posts from blog/_posts/ (authored via Sveltia CMS at /admin),
// renders each through the site's blog template, and writes static HTML into
// ../blog/. Runs at publish time via GitHub Actions; commit+push deploys.
//
// Usage:  node tools/blog-generate.mjs        (from the repo root)

import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

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
  // backslash-escaped punctuation (\` \* \[ etc., e.g. from CMS paste-escaping)
  // renders as the literal character with no formatting, per markdown spec
  const lit = [];
  let s = String(text).replace(/\\([\\`*_\[\](){}#+\-.!>~])/g, (_, c) => { lit.push(c); return `\x00${lit.length - 1}\x01`; });
  s = esc(s);
  // inline code
  s = s.replace(/`([^`]+)`/g, (_,c)=>`<code>${c}</code>`);
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_,t,u)=>`<a href="${u}">${t}</a>`);
  // bold **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, (_,t)=>`<strong>${t}</strong>`);
  // italic *text*
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, (_,p,t)=>`${p}<em>${t}</em>`);
  s = s.replace(/\x00(\d+)\x01/g, (_, n) => esc(lit[+n]));
  return s;
}
const IMG_LINE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/;
// linked image: [![alt](src "title")](url) -> figure whose image is a link
const IMG_LINK_LINE = /^\[!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\]\(([^)\s]+)\)$/;

function renderMarkdown(md='') {
  const lines = md.replace(/\r\n/g,'\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    let line = lines[i];
    if (line.trim() === '') { i++; continue; }
    // fenced code / prompt block
    if (line.trim().startsWith('```')) {
      const t = line.trim();
      // single-line fence: ``` content ```
      if (t.length > 6 && t.endsWith('```')) {
        out.push(`<div class="prompt-block">${esc(t.slice(3, -3).trim())}</div>`);
        i++; continue;
      }
      i++; const buf = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++; }
      i++; // closing fence
      out.push(`<div class="prompt-block">${esc(buf.join('\n'))}</div>`);
      continue;
    }
    // linked image -> figure with the image wrapped in a link (check first;
    // its pattern is a superset of the standalone image)
    const iml = line.trim().match(IMG_LINK_LINE);
    if (iml) {
      const [, alt, src, cap, url] = iml;
      out.push(`<figure>\n  <a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer"><img src="${escAttr(src)}" alt="${escAttr(alt)}" loading="lazy"></a>${cap?`\n  <figcaption>${inline(cap)}</figcaption>`:''}\n</figure>`);
      i++; continue;
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
    // list (unordered) — tolerates blank lines between items (one list, not many)
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length) {
        if (/^[-*]\s+/.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^[-*]\s+/,''))}</li>`); i++; }
        else if (lines[i].trim() === '') { let j = i; while (j < lines.length && lines[j].trim() === '') j++; if (/^[-*]\s+/.test(lines[j] || '')) i = j; else break; }
        else break;
      }
      out.push(`<ul>\n${items.join('\n')}\n</ul>`);
      continue;
    }
    // list (ordered) — tolerates blank lines between items so numbering stays continuous
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length) {
        if (/^\d+\.\s+/.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/,''))}</li>`); i++; }
        else if (lines[i].trim() === '') { let j = i; while (j < lines.length && lines[j].trim() === '') j++; if (/^\d+\.\s+/.test(lines[j] || '')) i = j; else break; }
        else break;
      }
      out.push(`<ol>\n${items.join('\n')}\n</ol>`);
      continue;
    }
    // blockquote (> ...) — one or more lines, blank-line-separated paragraphs inside
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      const inner = buf.join('\n').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
        .map(s => `<p>${inline(s.replace(/\n/g, ' '))}</p>`).join('\n  ');
      out.push(`<blockquote>\n  ${inner}\n</blockquote>`);
      continue;
    }
    // paragraph (gather until blank / block start)
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].trim().startsWith('```')
           && !/^(#{2,3})\s+/.test(lines[i]) && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !lines[i].trim().match(IMG_LINE) && !lines[i].trim().match(IMG_LINK_LINE)) {
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
                <li class="nav-cta-mobile"><a href="/officehours/" class="plausible-event-name=Office+Hours plausible-event-location=blog">Office Hours</a></li>
            </ul>
            <a href="/officehours/" class="header-cta plausible-event-name=Office+Hours plausible-event-location=blog">Office Hours</a>
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
  // OG/Twitter share images must be raster (JPG/PNG). SVG or missing covers fall back to the
  // branded default so a shared link never previews blank.
  const ogImage = (post.cover_image && !/\.svg(\?|#|$)/i.test(post.cover_image))
    ? coverAbs : `${SITE}/images/kevin-middleton-og.png`;
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
    <link rel="alternate" type="application/rss+xml" title="Kevin Middleton" href="${SITE}/blog/feed.xml">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${escAttr(post.title)}">
    <meta property="og:description" content="${escAttr(post.excerpt)}">
    <meta property="og:image" content="${escAttr(ogImage)}">
    <meta property="og:site_name" content="Kevin Middleton">
    <meta property="article:published_time" content="${pub}">
    <meta property="article:author" content="Kevin Middleton">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escAttr(post.title)}">
    <meta name="twitter:description" content="${escAttr(post.excerpt)}">
    <meta name="twitter:image" content="${escAttr(ogImage)}">

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
  const cards = posts.map(p=>`            <a class="post-card plausible-event-name=Blog+Card+Click plausible-event-post=${p.slug}" href="/blog/${p.slug}/">
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
    <link rel="alternate" type="application/rss+xml" title="Kevin Middleton" href="${SITE}/blog/feed.xml">

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
            <p class="eyebrow">Blog</p>
            <h1>Product, He Built</h1>
            <p class="subhead">Essays on product, AI, leadership, and building. Long-form, hands-on, and occasionally about what broke.</p>
            <a class="blog-rss" href="/blog/feed.xml">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6.18" cy="17.82" r="2.18"/><path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z"/></svg>
                Subscribe via RSS
            </a>
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
// RSS 2.0 feed at /blog/feed.xml — full-content (content:encoded), newest first.
// Reader apps (and QuietFeed) subscribe to this. lastBuildDate is derived from
// the newest post date, not now(), so re-runs stay byte-identical (idempotent).
function rfc822(iso) { return iso ? new Date(iso).toUTCString() : ''; }
// make relative src/href absolute so the content reads correctly inside a reader
function absolutize(html) {
  return html.replace(/(\b(?:src|href)=")(\/[^"]*)"/g, (_, p, path) => `${p}${SITE}${path}"`);
}
function cdata(s) { return `<![CDATA[${String(s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`; }
function writeFeed(posts) {
  const items = posts.slice(0, 20).map(p => {
    const url = `${SITE}/blog/${p.slug}/`;
    const html = absolutize(renderMarkdown(p.body_markdown));
    return `    <item>
      <title>${esc(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(p.published_at)}</pubDate>
      <description>${esc(p.excerpt || '')}</description>
      <content:encoded>${cdata(html)}</content:encoded>
    </item>`;
  }).join('\n');
  // posts arrives sorted newest-first, so the head post carries the latest date.
  // Derive lastBuildDate from it (not now()) so re-runs stay byte-identical.
  const built = posts.length ? posts[0].published_at : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Kevin Middleton</title>
    <link>${SITE}/blog/</link>
    <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Essays on building with AI, product, and the systems in between.</description>
    <language>en-us</language>
    <lastBuildDate>${rfc822(built)}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  writeFileSync(resolve(BLOG_DIR, 'feed.xml'), xml);
  return true;
}
// Homepage "Writing on AI" card: featured posts first (newest first), topped up
// with the newest non-featured, 4 total. Injected between WRITING markers in
// index.htm so the homepage never goes stale.
function updateWriting(posts) {
  const f = resolve(ROOT, 'index.htm');
  let html = readFileSync(f, 'utf8');
  const featured = posts.filter(p => p.featured);
  const rest = posts.filter(p => !p.featured);
  const picks = featured.concat(rest).slice(0, 4);
  const colors = ['#3b82f6', '#e07caa', '#f59e0b', '#7c5ce0'];
  const trim = t => t.length > 64 ? t.slice(0, 64).replace(/\s+\S*$/, '') + '…' : t;
  const items = picks.map((p, i) =>
    `                        <a href="/blog/${p.slug}/" class="writing-item plausible-event-name=Writing+Click plausible-event-post=${p.slug}">\n` +
    `                            <span class="writing-dot" style="background:${colors[i % colors.length]}"></span>${esc(trim(p.title))}\n` +
    `                        </a>`).join('\n');
  const out = replaceRegion(html, '<!-- WRITING:START -->', '<!-- WRITING:END -->', items);
  if (out) { writeFileSync(f, out); return true; }
  console.warn('  ! index.htm WRITING markers not found; skipped'); return false;
}
// KevinOS writing/ window: latest 5 published posts between KEVINOS-WRITING markers.
function updateKevinosWriting(posts) {
  const f = resolve(ROOT, 'kevinos', 'index.html');
  if (!existsSync(f)) return false;
  let html = readFileSync(f, 'utf8');
  const shortDate = iso => { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`; };
  // "unread" = the two newest posts, positionally — deterministic, so re-runs stay diff-free
  const items = posts.slice(0, 5).map((p, i) =>
    `                        <a href="${SITE}/blog/${p.slug}/?from=kevinos" target="_blank" class="kos-feed-row${i < 2 ? ' unread' : ''} plausible-event-name=Writing+Click plausible-event-post=${p.slug}">\n` +
    `                            <span class="kos-feed-dot" aria-hidden="true"></span>\n` +
    `                            <span class="kos-feed-info">\n` +
    `                                <span class="kos-feed-row-title">${esc(p.title)}</span>\n` +
    `                                <span class="kos-feed-excerpt">${esc(p.excerpt || '')}</span>\n` +
    `                                <span class="kos-feed-date">${shortDate(p.published_at)}</span>\n` +
    `                            </span>\n` +
    `                        </a>`).join('\n');
  const out = replaceRegion(html, '<!-- KEVINOS-WRITING:START -->', '<!-- KEVINOS-WRITING:END -->', items);
  if (out) { writeFileSync(f, out); return true; }
  console.warn('  ! kevinos KEVINOS-WRITING markers not found; skipped'); return false;
}

// ---------- load posts from markdown (blog/_posts/*.md) ----------
// Source of truth is markdown-in-repo (edited via Sveltia CMS at /admin).
// Slug = frontmatter `slug` field (falls back to filename for older posts).
// Frontmatter -> post fields; document body -> body_markdown.
const POSTS_DIR = resolve(BLOG_DIR, '_posts');
function loadPosts() {
  if (!existsSync(POSTS_DIR)) return [];
  return readdirSync(POSTS_DIR).filter(f => f.endsWith('.md')).map(f => {
    const { data, content } = matter(readFileSync(resolve(POSTS_DIR, f), 'utf8'));
    const slug = (data.slug || f.replace(/\.md$/, '')).toString().trim();
    return { ...data, slug, id: slug, body_markdown: content };
  });
}

// ---------- main ----------
async function main() {
  const all = loadPosts();
  const skipped = all.filter(p => p.status === 'published' && !p.published_at);
  for (const p of skipped) console.warn(`  ! SKIPPED "${p.slug}": status=published but published_at is empty — set a date to publish.`);
  const posts = all
    .filter(p => p.status === 'published' && p.published_at)
    .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));
  console.log(`Loaded ${all.length} post file(s); ${posts.length} published.`);
  for (const p of posts) {
    const dir = resolve(BLOG_DIR, p.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'index.html'), articlePage(p, posts));
    console.log(`  wrote blog/${p.slug}/index.html`);
  }
  writeFileSync(resolve(BLOG_DIR, 'index.html'), hubPage(posts));
  console.log('  wrote blog/index.html (hub)');
  // Clean up article dirs whose post was unpublished or renamed. Only dirs that
  // contain just a generated index.html are removed; anything else is left alone.
  const keep = new Set([...posts.map(p => p.slug), 'images', '_posts']);
  for (const entry of readdirSync(BLOG_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || keep.has(entry.name)) continue;
    const dir = resolve(BLOG_DIR, entry.name);
    const contents = readdirSync(dir);
    if (contents.length <= 1 && (contents.length === 0 || contents[0] === 'index.html')) {
      rmSync(dir, { recursive: true });
      console.log(`  removed stale blog/${entry.name}/`);
    } else {
      console.warn(`  ! blog/${entry.name}/ is not a published post but has extra files — left in place.`);
    }
  }
  updateSitemap(posts);
  updateLlms(posts);
  if (writeFeed(posts)) console.log('  wrote blog/feed.xml');
  if (updateWriting(posts)) console.log('  updated index.htm writing card');
  if (updateKevinosWriting(posts)) console.log('  updated kevinos writing window');
  console.log('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });
