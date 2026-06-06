#!/usr/bin/env node
// Migrate the 7 `content_pipeline` drafting articles into `blog_posts` as
// status='draft'. Splits the lead-in feed post off, strips the drafting
// scaffolding (## ARTICLE, ### Title options), keeps [IMAGE: ...] prompts as
// visible markers. content_pipeline rows are left untouched (the lead-in lives
// there as the feed post). These land as DRAFTS — they still need a chosen
// title, real cover/inline images, and a review pass before publish.
//
// Dry run (default): prints parsed result, writes nothing.
//   node tools/blog-migrate-drafts.mjs
// Apply (upsert to blog_posts):
//   APPLY=1 node tools/blog-migrate-drafts.mjs

const SUPABASE_URL = 'https://drtyjjegimjocxvjdszh.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRydHlqamVnaW1qb2N4dmpkc3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTYxNTQsImV4cCI6MjA4NTIzMjE1NH0.Bcq9FH7nNlhbQDExwnHXjzwPw39HeMsFqJaKZZuZ1QI';

const slugify = s => s.toLowerCase().replace(/[''".,:;!?()]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60).replace(/-+$/,'');

function parse(row) {
  let body = (row.body || '').replace(/\r\n/g,'\n').trim();
  // split lead-in vs article at the "## ARTICLE" marker (fallback: first '---')
  let article = body, leadIn = '';
  const am = body.match(/\n##\s*ARTICLE\s*\n/i);
  if (am) { leadIn = body.slice(0, am.index).trim(); article = body.slice(am.index + am[0].length).trim(); }
  else { const dash = body.indexOf('\n---\n'); if (dash !== -1) { leadIn = body.slice(0,dash).trim(); article = body.slice(dash+5).trim(); } }
  leadIn = leadIn.replace(/^##\s*LEAD-IN POST[^\n]*\n+/i,'').trim();
  // strip a leading "### Title options" block; capture first option as the title
  let title = (row.title||'').replace(/^Article:\s*/i,'').trim();
  const to = article.match(/^###\s*Title options\s*\n([\s\S]*?)(?=\n###\s|\n\*\*\[IMAGE|\n[A-Z])/i);
  if (to) {
    const first = to[1].split('\n').map(l=>l.replace(/^[-*]\s*/,'').trim()).filter(Boolean)[0];
    if (first) title = first;
    article = article.slice(to.index + to[0].length).trim();
  }
  // also strip a stray leading "## ARTICLE" if present
  article = article.replace(/^##\s*ARTICLE\s*\n+/i,'').trim();
  // trailing lone '---'
  article = article.replace(/\n+---\s*$/,'').trim();
  // excerpt: first real prose paragraph (skip image prompts / headings)
  const paras = article.split(/\n\n+/).map(p=>p.trim());
  const firstProse = paras.find(p => p && !p.startsWith('**[IMAGE') && !p.startsWith('#') && !p.startsWith('!['));
  let excerpt = (firstProse||'').replace(/\s+/g,' ').slice(0,180);
  if (excerpt.length === 180) excerpt = excerpt.replace(/\s+\S*$/,'') + '…';
  return { slug: slugify(title), title, excerpt, topic: 'Building with AI', status: 'draft',
           cover_image: null, cover_alt: null, series: null, series_order: row.sort_order||null,
           linkedin_url: null, published_at: null, sort_order: row.sort_order||0,
           tags: row.topic ? [row.topic] : [], body_markdown: article, _leadIn: leadIn };
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/content_pipeline?type=eq.article&status=eq.drafting&select=title,topic,body,sort_order&order=sort_order`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }});
const drafts = await res.json();
const rows = drafts.map(parse);

for (const r of rows) {
  console.error(`\n— ${r.slug}\n   title:   ${r.title}\n   excerpt: ${r.excerpt}\n   body:    ${r.body_markdown.length} chars, ${(r.body_markdown.match(/\*\*\[IMAGE/g)||[]).length} image prompt(s)\n   leadIn:  ${r._leadIn.slice(0,80)}...`);
}

if (process.env.APPLY) {
  const payload = rows.map(({_leadIn, ...r}) => r);
  const up = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?on_conflict=slug`, {
    method:'POST', headers:{ apikey:ANON, Authorization:`Bearer ${ANON}`, 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload) });
  console.error(`\nUPSERT status ${up.status}`); if(!up.ok) console.error(await up.text());
} else {
  console.error('\n(dry run — set APPLY=1 to upsert)');
}
