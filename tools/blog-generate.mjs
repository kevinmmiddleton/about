#!/usr/bin/env node
// Static blog generator for middleton.io
// Reads markdown posts from blog/_posts/ (authored via Sveltia CMS at /admin),
// renders each through the site's blog template, and writes static HTML into
// ../blog/. Runs at publish time via GitHub Actions; commit+push deploys.
//
// Usage:  node tools/blog-generate.mjs        (from the repo root)

import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { createHash } from 'node:crypto';

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
  const lit = [];   // backslash-escaped literals
  const code = [];  // inline-code spans (pre-escaped, shielded from further processing)
  let s = String(text);
  // Inline code FIRST — before emphasis and before the escape pass — so * and _
  // inside a span aren't mangled. Accept real backticks (`x`) AND Sveltia's
  // paste-escaped backticks (\`x\`), which is what the CMS actually emits.
  s = s.replace(/\\?`([^`\n]+?)\\?`/g, (_, c) => {
    const unesc = c.replace(/\\([\\`*_\[\](){}#+\-.!>~])/g, '$1'); // undo CMS escaping inside the span
    const e = unesc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    code.push(e);
    return `\x02${code.length - 1}\x03`;
  });
  // remaining backslash-escaped punctuation (\* \[ etc.) renders as the literal char
  s = s.replace(/\\([\\`*_\[\](){}#+\-.!>~])/g, (_, c) => { lit.push(c); return `\x00${lit.length - 1}\x01`; });
  s = esc(s);
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_,t,u)=>`<a href="${u}">${t}</a>`);
  // bold **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, (_,t)=>`<strong>${t}</strong>`);
  // italic *text*
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, (_,p,t)=>`${p}<em>${t}</em>`);
  // bold __text__ / italic _text_ (underscore style, as Sveltia emits). The
  // (^|[^\w]) / (?!\w) guards keep underscores intraword (file_name, URLs) literal.
  s = s.replace(/(^|[^\w])__([^_]+)__(?!\w)/g, (_,p,t)=>`${p}<strong>${t}</strong>`);
  s = s.replace(/(^|[^\w])_([^_]+)_(?!\w)/g, (_,p,t)=>`${p}<em>${t}</em>`);
  s = s.replace(/\x00(\d+)\x01/g, (_, n) => esc(lit[+n]));
  s = s.replace(/\x02(\d+)\x03/g, (_, n) => `<code>${code[+n]}</code>`);
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
      out.push(`<figure>\n  <a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer"><img src="${escAttr(src)}"${dimAttrs(src)} alt="${escAttr(alt)}" loading="lazy"></a>${cap?`\n  <figcaption>${inline(cap)}</figcaption>`:''}\n</figure>`);
      i++; continue;
    }
    // standalone image -> figure
    const im = line.trim().match(IMG_LINE);
    if (im) {
      const [, alt, src, cap] = im;
      out.push(`<figure>\n  <img src="${escAttr(src)}"${dimAttrs(src)} alt="${escAttr(alt)}" loading="lazy">${cap?`\n  <figcaption>${inline(cap)}</figcaption>`:''}\n</figure>`);
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
// A title that already ends a sentence does not need another period after it.
// Eight of the sixteen published titles do, so "Try this one." was rendering as
// "Try this one.." wherever a callout linked to it.
//
// The trailing class allows anything non-alphanumeric after the punctuation, so
// a title that ends in an emoji or a closing bracket still counts as terminated:
// "An AI tool for us? 🙈" needs no period, while "...audiences (yet)" does.
const endsSentence = (t) => /[.!?…][^\p{L}\p{N}]*$/u.test(String(t).trim());
const stop = (t) => (endsSentence(t) ? '' : '.');

// Topic -> hue. The six triads already exist for the homepage sector pills.
// Every one was measured against BOTH the card ground and the page ground, in
// BOTH modes: minimum 4.98:1. c2 is the fallback so an unrecognised topic still
// resolves rather than rendering an empty custom property.
const TOPIC_HUE = {
  'Building with AI': 4, 'Product': 5, 'Career': 1,
  'Leadership': 3, 'Tech & Society': 6,
};
const hueClass = (topic) => `hue-${TOPIC_HUE[topic] || 2}`;

const seriesMembers = (post, all) =>
  all.filter((p) => p.series && p.series === post.series)
     .sort((a, b) => (a.series_order || 0) - (b.series_order || 0));

// The series, made visible at the top of the piece. Replaces the old prose
// callout: same information, but it reads as packaging rather than a sentence.
// The pips are decorative, so the position is stated in text for screen readers
// and the pips carry aria-hidden.
function seriesRibbon(post, all) {
  if (!post.series) return '';
  const sibs = seriesMembers(post, all);
  const idx = sibs.findIndex((p) => p.id === post.id);
  const part = post.series_order || (idx + 1);
  const first = sibs[0];
  const pips = sibs.map((_, i) => `<i class="pip${i < part ? ' on' : ''}"></i>`).join('');
  const start = idx === 0 ? ''
    : `\n            <a class="ser-start" href="/blog/${first.slug}/">Start at Part 1</a>`;
  return `<div class="series-ribbon">
            <span class="ser-nm">${esc(post.series)}</span>
            <span class="ser-pos">Part ${part} of ${sibs.length}</span>
            <span class="ser-pips" aria-hidden="true">${pips}</span>${start}
        </div>`;
}

// Every post gets an exit. Eight of the sixteen had none: only the series posts
// carried onward links, and purely by accident of having a mechanism. Order is
// next-in-series first, then same-topic newest, then newest on the site, so a
// post can never end in a dead end regardless of its metadata.
function readNext(post, all) {
  const picks = [];
  const taken = new Set([post.id]);
  if (post.series) {
    const sibs = seriesMembers(post, all);
    const idx = sibs.findIndex((p) => p.id === post.id);
    const next = sibs[idx + 1];
    if (next) {
      picks.push({ p: next, kicker: `Part ${next.series_order || idx + 2} of ${sibs.length}` });
      taken.add(next.id);
    }
  }
  for (const p of all) {
    if (picks.length >= 2) break;
    if (taken.has(p.id) || p.topic !== post.topic) continue;
    picks.push({ p, kicker: `More in ${p.topic}` });
    taken.add(p.id);
  }
  for (const p of all) {
    if (picks.length >= 2) break;
    if (taken.has(p.id)) continue;
    picks.push({ p, kicker: 'From the blog' });
    taken.add(p.id);
  }
  if (!picks.length) return '';
  const inSeries = picks[0].kicker.startsWith('Part');
  const cards = picks.map((c) => `            <a class="rn ${hueClass(c.p.topic)}" href="/blog/${c.p.slug}/">
                <span class="rn-k">${esc(c.kicker)}</span>
                <span class="rn-t">${esc(c.p.title)}</span>
                <span class="rn-x">${esc(c.p.excerpt || '')}</span>
            </a>`).join('\n');
  return `<nav class="readnext" aria-label="Read next">
        <p class="rn-lbl">${inSeries ? 'Next in this series' : 'Read next'}</p>
        <div class="rn-grid">
${cards}
        </div>
    </nav>`;
}


// ---------- shared chrome ----------
// Cache stamps are COMPUTED, never hardcoded. They were literal strings here
// until 2026-08-01, pinned at fv.css?v=3bb54490. fv.css had moved on, so every
// regenerated post shipped a dead stamp and silently undid the cache-busting
// the rest of the site relies on. Worse, it was invisible: tools/stamp-assets.mjs
// only ever saw the already-correct committed pages, because nothing had been
// regenerated since. Same md5-head-8 that stamp-assets.mjs uses, so the two
// agree by construction rather than by anyone remembering.
const stamp = (rel) => createHash('md5')
  .update(readFileSync(resolve(ROOT, rel)))
  .digest('hex').slice(0, 8);

const HEAD_LINKS = `    <!-- One stylesheet for the whole site. No webfont request: fv.css uses a
         system stack, which is also why the old Inter/Epilogue links are gone. -->
    <link rel="stylesheet" href="/fv.css?v=${stamp('fv.css')}">
    <link rel="stylesheet" href="/blog/blog.css?v=${stamp('blog/blog.css')}">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <!-- Identity verification. Same three profiles the homepage claims, so every
         page resolves to one entity rather than a separate author blob.
         Wikidata is the disambiguating anchor. -->
    <link rel="me" href="https://www.linkedin.com/in/kevinmiddleton/">
    <link rel="me" href="https://github.com/kevinmmiddleton">
    <link rel="me" href="https://www.wikidata.org/wiki/Q140389537">`;
const PLAUSIBLE = `    <!-- Privacy-friendly analytics by Plausible -->
    <script async src="https://plausible.io/js/pa-CycHtdoRKtjDMtDpjBTA4.js"></script>
    <script>
    window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
    plausible.init()
    </script>`;
const HEADER = `    <nav class="nav pad">
        <a class="mk" href="/">Kevin Middleton<small>Full Stack Product Manager &middot; New York City</small></a>
        <span class="nav-l">
          <a href="/#building">Building</a>
          <a href="/#about">About</a>
          <a href="/#record">Experience</a>
          <a href="/#cases">Case Studies</a>
          <a href="/blog/" target="_blank" rel="noopener noreferrer">Blog</a>
        </span>
        <a class="cta plausible-event-name=Header+OfficeHours" href="/officehours/">Office Hours</a>
      </nav>`;
const FOOTER = `    <footer id="footer" class="footer">
        <div class="container footer-content">
            <p class="footer-text">&copy;2026 Kevin Middleton. 👋</p>
        </div>
    </footer>`;
// The lightbox markup used to be emitted here. Its only CSS lives in fv.css
// scoped `body.p-case`, and blog articles carry no such class, so none of it
// applied: the container sat in normal flow and painted a bare 10x19px "×"
// glyph BELOW the footer on all 16 posts, plus 26px of dead page. blog.css also
// advertised `cursor: zoom-in` on figures for a zoom that could never happen.
// Removed rather than wired up, because a real lightbox owes a dialog role,
// Escape, focus return and a keyboard path to open it, and none of that is in
// scope here. Figures are plain images again.

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
  const ribbon = seriesRibbon(post, all);
  const next = readNext(post, all);
  const metaLink = post.linkedin_url
    ? `\n            <span class="dot" aria-hidden="true">·</span>\n            <a href="${escAttr(post.linkedin_url)}" target="_blank" rel="noopener">First published on LinkedIn</a>` : '';
  const article = {
    "@context":"https://schema.org","@type":"Article",
    headline: post.title, description: post.excerpt,
    author:{"@type":"Person","@id":"https://middleton.io/#kevin",name:"Kevin Middleton",url:SITE,sameAs:["https://www.linkedin.com/in/kevinmiddleton/","https://github.com/kevinmmiddleton","https://www.wikidata.org/wiki/Q140389537"]},
    publisher:{"@type":"Person","@id":"https://middleton.io/#kevin",name:"Kevin Middleton",url:SITE},
    mainEntityOfPage:{"@type":"WebPage","@id":url}, url, image: coverAbs,
    articleSection:"Blog", keywords: post.tags||[],
    wordCount: (post.body_markdown||'').split(/\s+/).filter(Boolean).length,
    datePublished: pub, dateModified: mod };
  const crumbs = {
    "@context":"https://schema.org","@type":"BreadcrumbList",
    itemListElement:[
      {"@type":"ListItem",position:1,name:"Home",item:`${SITE}/`},
      {"@type":"ListItem",position:2,name:"Blog",item:`${SITE}/blog/`},
      {"@type":"ListItem",position:3,name:post.title,item:url}]};
  const body = [renderMarkdown(post.body_markdown)].filter(Boolean).join('\n\n');
  const bio =
    // Says nothing about employment status in either direction, per the rule
    // adopted 2026-07-31. This line read "Currently looking for his next role
    // in NYC" until 2026-08-01: the sweep that stripped the homepage, KevinOS,
    // llms.txt and the KevBot worker missed the generator, so the claim stayed
    // live at the foot of all 16 posts after it stopped being true. Keep it
    // status-free, and avoid implying a current role indirectly too.
    `<div class="article-bio">\n  <p>Kevin Middleton is a Full Stack Product Manager in New York who builds systems that help product teams not lose their minds. More at <a href="https://middleton.io">middleton.io</a> and <a href="https://middleton.io/officehours/">middleton.io/officehours</a>.</p>\n</div>`;
  // every link in the article body opens in a new tab
  const bodyLinked = body.replace(/<a (?![^>]*\btarget=)/g, '<a target="_blank" rel="noopener" ');

  return `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#F4F4F5" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0F0F12" media="(prefers-color-scheme: dark)">
    <!-- No " | Kevin Middleton" suffix: it cost 18 chars of a ~60 char budget and
         pushed real titles past the truncation point. og:title, twitter:title, the
         h1, the blog card and the RSS item all use post.title directly, so nothing
         visible changes. -->
    <title>${esc(post.title)}</title>
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
<body class="p-post">
    <a class="skip" href="#content">Skip to content</a>
${HEADER}

    <main id="content" tabindex="-1">
    <article class="article ${hueClass(post.topic)}">
        <a class="article-back" href="/blog/"><span class="arw-back" aria-hidden="true"></span>Back to the Blog</a>
        ${ribbon}
        <!-- The lede. The headline sits ON the art rather than after it: the
             image used to arrive below the eyebrow, title, dek and byline, at
             exactly the text column's width, so it read as an illustration
             dropped into the queue instead of an opening.

             The hero is the LCP element on every post, so it is never lazy and
             always high priority. alt is empty because the headline beside it
             carries the meaning; a descriptive alt here would be read out
             immediately before the same words in the h1. -->
        <div class="article-lede">
            <img class="article-hero" src="${escAttr(post.cover_image||'')}"${dimAttrs(post.cover_image)} alt="" fetchpriority="high" decoding="async">
            <div class="article-lede-in">
                <p class="article-eyebrow">${esc(post.topic||'')}</p>
                <h1 class="article-title">${esc(post.title)}</h1>
                <!-- The dek. Already written for every post as the excerpt
                     field, already used on the index card and in
                     og:description, and previously thrown away on the page
                     where it does the most work. -->
                <p class="article-dek">${esc(post.excerpt||'')}</p>
                <!-- No byline. It is a single-author blog, the name is in the
                     nav lockup and again in the bio at the foot, so a third
                     printing of it only cost a line in the band. -->
                <div class="article-meta">
                    <span>${fmtDate(post.published_at)}</span>${metaLink}
                </div>
            </div>
        </div>

        <div class="article-body">
${bodyLinked}
        </div>
${next}
        ${bio}
        <a class="article-back article-back-bottom" href="/blog/"><span class="arw-back" aria-hidden="true"></span>Back to the Blog</a>
    </article>
    </main>

${FOOTER}

    <script src="/blog/blog-nav.js"></script>
</body>
</html>
`;
}

// ---------- hub page ----------
function hubPage(posts) {
  const blogLd = {
    "@context":"https://schema.org","@type":"Blog",name:"Kevin Middleton's Blog",url:`${SITE}/blog/`,
    author:{"@type":"Person","@id":"https://middleton.io/#kevin",name:"Kevin Middleton",url:SITE},
    blogPost: posts.map(p=>({"@type":"BlogPosting",headline:p.title,url:`${SITE}/blog/${p.slug}/`,datePublished:isoDate(p.published_at)}))};
  const crumbs = {"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[
    {"@type":"ListItem",position:1,name:"Home",item:`${SITE}/`},
    {"@type":"ListItem",position:2,name:"Blog",item:`${SITE}/blog/`}]};
  // The first row is above the fold at every width, so those three are the LCP
  // candidates and must not be lazy. Lazy-loading an in-viewport image defers
  // the request behind the main parse, which is a straight LCP regression.
  const cards = posts.map((p, i) => {
    const sibs = p.series ? posts.filter((q) => q.series === p.series) : [];
    const part = p.series
      ? ` <span class="part">&middot; Part ${p.series_order || ''} of ${sibs.length}</span>` : '';
    const eager = i < 3;
    return `            <a class="post-card ${hueClass(p.topic)} plausible-event-name=Blog+Card+Click plausible-event-post=${p.slug}" href="/blog/${p.slug}/">
                <img class="post-card__thumb" src="${escAttr(p.cover_image||'')}"${dimAttrs(p.cover_image)} alt=""${eager ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"'}>
                <div class="post-card__body">
                    <p class="post-eyebrow">${esc(p.topic||'')}${part}</p>
                    <h2>${esc(p.title)}</h2>
                    <p>${esc(p.excerpt||'')}</p>
                </div>
            </a>`;
  }).join('\n\n');
  return `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#F4F4F5" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0F0F12" media="(prefers-color-scheme: dark)">
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
<body class="p-blog">
    <a class="skip" href="#content">Skip to content</a>
${HEADER}

    <main id="content" tabindex="-1">
    <section class="blog-index">
        <div class="blog-index-header">
            <div class="blog-index-top">
                <p class="eyebrow">Blog</p>
                <a class="blog-rss" href="/blog/feed.xml">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6.18" cy="17.82" r="2.18"/><path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z"/></svg>
                    Subscribe via RSS
                </a>
            </div>
            <h1>Product, He Built</h1>
            <p class="subhead">Essays on product, AI, leadership, and building. Long-form, hands-on, and occasionally about what broke.</p>
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
const IMG_MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', avif:'image/avif' };
// The post's hero image, resolved for the feed: absolute URL, mime type, and
// real byte length. Without this readers guess by scraping the first <img> in
// the body — which is often an inline screenshot, not the hero. SVG or missing
// covers fall back to the branded raster (same rule as the OG tags).
function feedImage(p) {
  let path = p.cover_image;
  if (!path || /\.svg(\?|#|$)/i.test(path)) path = '/images/kevin-middleton-og.png';
  const abs = path.startsWith('http') ? path : `${SITE}${path.startsWith('/') ? '' : '/'}${path}`;
  const ext = (abs.toLowerCase().replace(/[?#].*$/, '').match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const type = IMG_MIME[ext] || 'image/png';
  let length = 0;
  if (!path.startsWith('http')) {
    try { length = statSync(resolve(ROOT, path.replace(/^\//, ''))).size; } catch {}
  }
  return { abs, type, length };
}
function writeFeed(posts) {
  const items = posts.slice(0, 20).map(p => {
    const url = `${SITE}/blog/${p.slug}/`;
    const html = absolutize(renderMarkdown(p.body_markdown));
    const img = feedImage(p);
    return `    <item>
      <title>${esc(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(p.published_at)}</pubDate>
      <description>${esc(p.excerpt || '')}</description>
      <enclosure url="${escAttr(img.abs)}" type="${img.type}" length="${img.length}"/>
      <media:content url="${escAttr(img.abs)}" medium="image" type="${img.type}"/>
      <media:thumbnail url="${escAttr(img.abs)}"/>
      <content:encoded>${cdata(html)}</content:encoded>
    </item>`;
  }).join('\n');
  // posts arrives sorted newest-first, so the head post carries the latest date.
  // Derive lastBuildDate from it (not now()) so re-runs stay byte-identical.
  const built = posts.length ? posts[0].published_at : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
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
// Homepage "Writing on AI & Work" card: featured posts first (newest first),
// topped up with the newest non-featured, 6 total. Injected between WRITING markers in
// index.htm so the homepage never goes stale.
function updateWriting(posts) {
  const f = resolve(ROOT, 'index.htm');
  let html = readFileSync(f, 'utf8');
  const featured = posts.filter(p => p.featured);
  const rest = posts.filter(p => !p.featured);
  const picks = featured.concat(rest).slice(0, 6);

  // Two markups, chosen by sniffing the target rather than by anyone remembering
  // to flip a switch on relaunch day. The Full Volume homepage styles its dots
  // with .d1-.d6 -> --dot-1..6 so they follow dark mode; the legacy homepage
  // styles .writing-item/.writing-dot and needs the inline hex. Emitting the
  // wrong one silently breaks the card, and this function also runs unattended
  // from a daily cron, so it must not depend on deploy ordering.
  const isFullVolume = html.includes('<div class="fv"') || html.includes('class="posts"');
  let items;
  if (isFullVolume) {
    items = picks.map((p, i) =>
      `          <a href="/blog/${p.slug}/" class="plausible-event-name=Writing+Click plausible-event-post=${p.slug}"><i class="d${i + 1}"></i>${esc(p.title)}</a>`).join('\n');
  } else {
    const colors = ['#3b82f6', '#e07caa', '#f59e0b', '#7c5ce0', '#14b8a6', '#f97316'];
    items = picks.map((p, i) =>
      `                        <a href="/blog/${p.slug}/" class="writing-item plausible-event-name=Writing+Click plausible-event-post=${p.slug}">\n` +
      `                            <span class="writing-dot" style="background:${colors[i % colors.length]}"></span>${esc(p.title)}\n` +
      `                        </a>`).join('\n');
  }
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

// ---------- image optimization ----------
// Keep full-size originals in the repo (blog/images/_originals/), serve resized
// copies from blog/images/. An image is optimized only when it's BOTH wide
// (> MAX_IMG_W) AND heavy (> MAX_IMG_BYTES): heavy is the real cost, and "wide
// too" guarantees resizing has room to actually shrink it — so the result is
// always smaller and <= MAX_IMG_W, which means re-runs skip it (idempotent) and
// CI/Linux and a local Mac never fight over bytes. A small-but-wide graphic
// (e.g. a 60KB banner) is left untouched, so we never bloat an already-lean file.
// A re-upload (fresh heavy+wide file at the same name) re-triggers and refreshes
// its original. As a final guard the resized copy is only adopted if it's
// genuinely smaller. Format is preserved so a cover_image / inline ref never
// breaks. Resilient: if sharp is missing, optimization is skipped and the blog
// still publishes.
const MAX_IMG_W = 1600;
const MAX_IMG_BYTES = 500 * 1024;
// Mean absolute per-channel difference, 0-255, above which a palette-quantized
// PNG is rejected as visibly degraded. Flat illustration lands near 0.5; a
// photograph does not.
const PALETTE_MAX_ERR = 2;

// Both buffers are compared after normalising to RGBA, because a palette PNG
// decodes to a different channel count than the RGBA original and a raw
// byte-length comparison would just report a mismatch.
async function meanChannelError(sharp, aBuf, bBuf) {
  const [a, b] = await Promise.all([
    sharp(aBuf).ensureAlpha().raw().toBuffer(),
    sharp(bBuf).ensureAlpha().raw().toBuffer(),
  ]);
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}
const IMG_DIR = resolve(BLOG_DIR, 'images');
const IMG_ORIGINALS = resolve(IMG_DIR, '_originals');
async function optimizeImages() {
  if (!existsSync(IMG_DIR)) return;
  let sharp;
  try { sharp = (await import('sharp')).default; }
  catch { console.warn('  ! sharp not installed; skipping image optimization'); return; }
  let changed = 0;
  for (const name of readdirSync(IMG_DIR)) {
    if (!/\.(png|jpe?g)$/i.test(name)) continue; // skips _originals/ (a dir) too
    const file = resolve(IMG_DIR, name);
    const bytes = statSync(file).size;
    if (bytes <= MAX_IMG_BYTES) continue; // already lean -> leave it (idempotent)
    let width;
    try { ({ width } = await sharp(file).metadata()); } catch { continue; }
    // Was `width <= MAX_IMG_W`, which permanently exempted any file exactly
    // 1600px wide however heavy it was. Four covers had been resized to exactly
    // 1600 by an earlier run and were excluded from every run after, so the
    // index shipped 4.4MB in two PNGs. Recompression alone is worth taking, and
    // the "only adopt if genuinely smaller" guard below already makes a no-op
    // re-encode safe and idempotent.
    if (!width) continue;
    // resize + recompress, keeping the same format/extension
    const ext = name.toLowerCase().match(/\.(png|jpe?g)$/)[1];
    const targetW = Math.min(width, MAX_IMG_W);
    const pipe = () => sharp(file).resize({ width: targetW, withoutEnlargement: true });
    let buf;
    if (ext === 'png') {
      // compressionLevel 9 alone does nothing to an already-compressed PNG:
      // all four heavy covers came back byte-identical, which is why the
      // "only adopt if smaller" guard kept declining them. What actually works
      // is palette quantization, which is the right container for flat
      // illustration and the wrong one for a photograph.
      //
      // Rather than classify by hand, quantize and then MEASURE: adopt only if
      // the mean per-channel error against the plain re-encode is negligible.
      // A photograph banded by a 256-colour palette fails that test on its own.
      // Measured across the nine heavy PNGs here, every one came in under
      // 0.53/255 and the set went 9.79MB -> 3.91MB.
      const plain = await pipe().png({ compressionLevel: 9 }).toBuffer();
      const pal = await pipe().png({ compressionLevel: 9, effort: 10, palette: true, quality: 100 }).toBuffer();
      buf = plain;
      if (pal.length < plain.length) {
        const err = await meanChannelError(sharp, plain, pal);
        if (err < PALETTE_MAX_ERR) buf = pal;
        else console.log(`  kept ${name} unquantized (mean error ${err.toFixed(2)} exceeds ${PALETTE_MAX_ERR})`);
      }
    } else {
      buf = await pipe().jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    }
    // Must be a MEANINGFUL win, not any win. A palette re-encode of an already
    // palette-quantized PNG comes back a few bytes smaller every time, so a
    // plain `>=` comparison re-triggered on every run and the job was never
    // idempotent.
    if (buf.length >= bytes * 0.98) continue;
    mkdirSync(IMG_ORIGINALS, { recursive: true });
    // Preserve the full-size original, and NEVER replace a preserved original
    // with an already-optimized copy. Without this guard the second run copied
    // the 734KB optimized file over the 4.9MB source and the original was gone.
    // A genuine re-upload is larger than what is stored, so it still refreshes.
    const keep = resolve(IMG_ORIGINALS, name);
    if (!existsSync(keep) || statSync(keep).size < bytes) copyFileSync(file, keep);
    writeFileSync(file, buf);
    changed++;
    console.log(`  optimized blog/images/${name} (${width}px/${Math.round(bytes/1024)}KB -> ${MAX_IMG_W}px/${Math.round(buf.length/1024)}KB; original kept in _originals/)`);
  }
  if (!changed) console.log('  images: all web-sized, nothing to optimize');
}

// Intrinsic dimensions for blog images so rendered <img> can reserve space and
// avoid layout shift (CLS). Read once after optimization; paired with the CSS
// (width:100%; height:auto) this keeps images responsive AND stable.
let IMG_DIMS = {};
async function loadImageDims() {
  if (!existsSync(IMG_DIR)) return;
  let sharp;
  try { sharp = (await import('sharp')).default; } catch { return; }
  for (const name of readdirSync(IMG_DIR)) {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(name)) continue;
    try {
      const { width, height } = await sharp(resolve(IMG_DIR, name)).metadata();
      if (width && height) IMG_DIMS[name] = { w: width, h: height };
    } catch {}
  }
}
function dimAttrs(src) {
  if (!src) return '';
  const base = src.split('/').pop().split('?')[0].split('#')[0];
  const d = IMG_DIMS[base];
  return d ? ` width="${d.w}" height="${d.h}"` : '';
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
  await optimizeImages(); // resize oversized images before anything reads their size
  await loadImageDims();  // then capture final dimensions for CLS-safe <img> tags
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
