// stubs-films: film search, lookup and Letterboxd-row matching for Stubs.
//
// Data source: TMDB first (posters, details), read server side with the token
// from Supabase Vault (see ../_shared/tmdb.ts). If TMDB is not set up or fails,
// Wikidata (facts) + English Wikipedia (poster thumbnail and a short summary)
// fill in. The rest of the app does not care which one filled the row
// (stubs_films.source says). A TMDB result that matches an existing Wikidata
// row (by tmdb_id or wikidata_id) updates that row, so lists never split.
//
// Public endpoint (verify_jwt=false): it only reads public film data and
// caches it in stubs_films. Inputs are capped so it can't be used to hammer
// Wikidata on our behalf.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { filmFromTmdb, tmdb as tmdbGet, tmdbToken, type Film } from '../_shared/tmdb.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const UA = 'Stubs/1.0 (https://middleton.io/stubs/; assistant@middleton.io)';
// film, animated feature, documentary, TV film, short film
const FILM_TYPES = 'haswbstatement:P31=Q11424|P31=Q29168811|P31=Q202866|P31=Q93204|P31=Q506240|P31=Q24862';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);


export const norm = (s: string) => s.toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

async function getJSON(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
  return r.json();
}

// ------------------------------------------------------------ Wikidata path
async function wdSearch(q: string, limit = 10): Promise<string[]> {
  const u = new URL('https://www.wikidata.org/w/api.php');
  u.search = new URLSearchParams({
    action: 'query', list: 'search', srsearch: `${q} ${FILM_TYPES}`, srlimit: String(limit),
    format: 'json', origin: '*',
  }).toString();
  const d = await getJSON(u.toString());
  return (d?.query?.search ?? []).map((x: { title: string }) => x.title);
}

// English Wikipedia's search ranks famous films far better than Wikidata's, so
// search there and map pages to Wikidata items. Callers keep only films.
async function wpSearch(q: string, limit = 12): Promise<string[]> {
  const u = new URL('https://en.wikipedia.org/w/api.php');
  u.search = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: q, gsrlimit: String(limit), gsrnamespace: '0',
    prop: 'pageprops', ppprop: 'wikibase_item', format: 'json', formatversion: '2', origin: '*',
  }).toString();
  const d = await getJSON(u.toString());
  return (d?.query?.pages ?? []).sort((a: any, b: any) => a.index - b.index)
    .map((p: any) => p.pageprops?.wikibase_item).filter(Boolean);
}

const NOT_FILMS = new Set(['Q5398426', 'Q581714', 'Q21191270', 'Q1259759', 'Q117467246', 'Q15416', 'Q7725634', 'Q482994', 'Q134556']);
const isFilm = (e: any) => {
  const types = claimIds(e, 'P31');
  if (types.some((t) => NOT_FILMS.has(t))) return false;
  return (e?.claims?.P57?.length ?? 0) > 0 && (e?.claims?.P577?.length ?? 0) > 0;
};

async function wdEntities(ids: string[], props = 'labels|claims|sitelinks') {
  const out: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const u = new URL('https://www.wikidata.org/w/api.php');
    u.search = new URLSearchParams({
      action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props,
      languages: 'en|mul', sitefilter: 'enwiki', format: 'json', origin: '*',
    }).toString();
    const d = await getJSON(u.toString());
    Object.assign(out, d.entities ?? {});
  }
  return out;
}

const claimIds = (e: any, p: string): string[] =>
  (e?.claims?.[p] ?? []).map((c: any) => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);

function wdYear(e: any): number | null {
  const ys = (e?.claims?.P577 ?? [])
    .map((c: any) => c?.mainsnak?.datavalue?.value?.time as string | undefined)
    .filter(Boolean).map((t: string) => parseInt(t.slice(1, 5), 10)).filter((n: number) => n > 1870);
  return ys.length ? Math.min(...ys) : null;
}

function wdRuntime(e: any): number | null {
  for (const c of e?.claims?.P2047 ?? []) {
    const v = c?.mainsnak?.datavalue?.value;
    if (!v) continue;
    const amt = Math.abs(parseFloat(v.amount));
    if (v.unit?.endsWith('Q7727')) return Math.round(amt);           // minute
    if (v.unit?.endsWith('Q11574')) return Math.round(amt / 60);     // second
    if (v.unit?.endsWith('Q25235')) return Math.round(amt * 60);     // hour
  }
  return null;
}

async function wikiExtras(titles: string[]) {
  const out: Record<string, { poster: string | null; extract: string | null }> = {};
  for (let i = 0; i < titles.length; i += 20) {
    const u = new URL('https://en.wikipedia.org/w/api.php');
    u.search = new URLSearchParams({
      action: 'query', prop: 'pageimages|extracts', piprop: 'thumbnail', pithumbsize: '500', pilicense: 'any',
      exintro: '1', explaintext: '1', exsentences: '3', redirects: '1',
      titles: titles.slice(i, i + 20).join('|'), format: 'json', formatversion: '2', origin: '*',
    }).toString();
    const d = await getJSON(u.toString());
    const back: Record<string, string> = {};
    for (const n of d?.query?.normalized ?? []) back[n.to] = n.from;
    for (const r of d?.query?.redirects ?? []) back[r.to] = back[r.from] ?? r.from;
    for (const p of d?.query?.pages ?? []) {
      const key = back[p.title] ?? p.title;
      out[key] = { poster: p.thumbnail?.source ? String(p.thumbnail.source).split('?')[0] : null, extract: p.extract ?? null };
    }
  }
  return out;
}

async function wdFilms(qids: string[]): Promise<Film[]> {
  if (!qids.length) return [];
  const ents = await wdEntities(qids);
  const extra = new Set<string>();
  for (const q of qids) {
    for (const id of claimIds(ents[q], 'P57').slice(0, 2)) extra.add(id);
    for (const id of claimIds(ents[q], 'P136').slice(0, 3)) extra.add(id);
  }
  const labels = extra.size ? await wdEntities([...extra], 'labels') : {};
  const lab = (id: string) => (labels[id]?.labels?.en?.value ?? labels[id]?.labels?.mul?.value) as string | undefined;
  const wikiTitles = qids.map((q) => ents[q]?.sitelinks?.enwiki?.title).filter(Boolean);
  const wiki = wikiTitles.length ? await wikiExtras(wikiTitles) : {};
  const films: Film[] = [];
  for (const q of qids) {
    const e = ents[q];
    const wt = e?.sitelinks?.enwiki?.title ?? null;
    // Many items only carry a "mul" label now; the Wikipedia title is a good fallback.
    const title = e?.labels?.en?.value ?? e?.labels?.mul?.value
      ?? (wt ? wt.replace(/\s*\((\d{4} )?film\)$/, '') : null);
    if (!title || !isFilm(e)) continue;
    const w = wt ? wiki[wt] : undefined;
    const genres = claimIds(e, 'P136').slice(0, 3).map(lab).filter(Boolean)
      .map((g) => g!.replace(/ film$/, '')) as string[];
    const dirs = claimIds(e, 'P57').slice(0, 2).map(lab).filter(Boolean) as string[];
    films.push({
      wikidata_id: q, title, year: wdYear(e), director: dirs.join(', ') || null,
      runtime_min: wdRuntime(e), genres, overview: w?.extract?.slice(0, 900) ?? null,
      poster_url: w?.poster ?? null, wiki_title: wt, source: 'wikidata',
    });
  }
  return films;
}

// ---------------------------------------------------------------- TMDB path
const tmdb = (path: string, params: Record<string, string> = {}) => tmdbGet(admin, path, params);
const hasTmdb = async () => !!(await tmdbToken(admin));
async function tmdbFilm(id: number): Promise<Film> {
  return filmFromTmdb(await tmdb(`/movie/${id}`, { append_to_response: 'credits,external_ids' }));
}
async function tmdbSearch(q: string, year?: number | null, limit = 10): Promise<number[]> {
  const p: Record<string, string> = { query: q, include_adult: 'false' };
  if (year) p.year = String(year);
  const d = await tmdb('/search/movie', p);
  return (d.results ?? []).slice(0, limit).map((r: any) => r.id);
}

// ------------------------------------------------------------------ caching
const COLS = 'id,title,year,director,runtime_min,genres,overview,poster_url,backdrop_url,source,wikidata_id,tmdb_id';
async function upsert(films: Film[]) {
  if (!films.length) return [];
  // Rows TMDB already filled stay as they are (Wikidata is only the fallback).
  const wids = films.map((f) => f.wikidata_id).filter(Boolean) as string[];
  const { data: kept } = wids.length
    ? await admin.from('stubs_films').select(COLS).eq('source', 'tmdb').in('wikidata_id', wids)
    : { data: [] as any[] };
  const keep = new Set((kept ?? []).map((k: any) => k.wikidata_id));
  const rows = films.filter((f) => !keep.has(f.wikidata_id)).map((f) => ({ ...f, updated_at: new Date().toISOString() }));
  if (!rows.length) return kept ?? [];
  const { data, error } = await admin.from('stubs_films').upsert(rows, { onConflict: 'wikidata_id' }).select(COLS);
  if (error) throw error;
  return [...(data ?? []), ...(kept ?? [])];
}

// TMDB films: update the row we already have (same tmdb_id, or same Wikidata
// item from an older import), else insert. Keeps a Wikipedia poster or summary
// when TMDB has none. Returns rows in the order given.
async function saveTmdb(films: Film[]) {
  if (!films.length) return [];
  const tids = films.map((f) => f.tmdb_id).filter(Boolean);
  const wids = films.map((f) => f.wikidata_id).filter(Boolean) as string[];
  const filter = [`tmdb_id.in.(${tids.join(',')})`, ...(wids.length ? [`wikidata_id.in.(${wids.join(',')})`] : [])].join(',');
  const { data: have, error } = await admin.from('stubs_films').select('id,tmdb_id,wikidata_id,poster_url,overview').or(filter);
  if (error) throw error;
  const out: any[] = [];
  for (const f of films) {
    const ex = (have ?? []).find((h: any) => h.tmdb_id === f.tmdb_id)
      ?? (have ?? []).find((h: any) => f.wikidata_id && h.wikidata_id === f.wikidata_id);
    const row: any = { ...f, poster_url: f.poster_url ?? ex?.poster_url ?? null, overview: f.overview ?? ex?.overview ?? null,
      updated_at: new Date().toISOString() };
    // Never move a Wikidata id between rows (it is unique).
    if (!f.wikidata_id || (ex && ex.wikidata_id) || (have ?? []).some((h: any) => h !== ex && h.wikidata_id === f.wikidata_id)) delete row.wikidata_id;
    if (ex) delete row.wiki_title;
    const res = ex
      ? await admin.from('stubs_films').update(row).eq('id', ex.id).select(COLS).single()
      : await admin.from('stubs_films').insert(row).select(COLS).single();
    if (res.error) {
      // Lost a race to another insert: use whatever is there now.
      const { data: again } = await admin.from('stubs_films').select(COLS).eq('tmdb_id', f.tmdb_id!).maybeSingle();
      if (again) out.push(again);
      continue;
    }
    out.push(res.data);
  }
  return out;
}

async function search(q: string) {
  if (await hasTmdb()) {
    try {
      const ids = await tmdbSearch(q, null, 10);
      return await saveTmdb(await Promise.all(ids.map(tmdbFilm)));
    } catch (e) {
      console.error('tmdb search failed, using wikidata', String(e));
    }
  }
  const [wp, wd] = await Promise.all([wpSearch(`${q} film`, 12).catch(() => []), wdSearch(q, 8).catch(() => [])]);
  const qids = [...new Set([...wp, ...wd])].slice(0, 16);
  const rows = await upsert((await wdFilms(qids)).slice(0, 12));
  const order = new Map(qids.map((q, i) => [q, i]));
  return rows.sort((a: any, b: any) => (order.get(a.wikidata_id) ?? 99) - (order.get(b.wikidata_id) ?? 99));
}

// Letterboxd rows -> film ids. Year must agree within a year when given.
async function resolveOne(name: string, year: number | null): Promise<number | null> {
  const useTmdb = await hasTmdb();
  const key = `${useTmdb ? 't' : 'w'}:${norm(name)}:${year ?? ''}`;
  const { data: hit } = await admin.from('stubs_film_lookup').select('film_id').eq('key', key).maybeSingle();
  if (hit) return hit.film_id;
  const n = norm(name);
  // Prefer the well-known film (has a poster / Wikipedia page) among same-name matches.
  const rank = (films: any[]) => films.map((f, i) => ({ f, i }))
    .sort((a, b) => (b.f.poster_url ? 1 : 0) - (a.f.poster_url ? 1 : 0) || a.i - b.i).map((x) => x.f);
  const pick = (films: any[]) => {
    const r = rank(films);
    return r.find((f) => norm(f.title) === n && (!year || !f.year || Math.abs(f.year - year) <= 1))
      ?? r.find((f) => year && f.year && Math.abs(f.year - year) <= 1)
      ?? (year ? null : r[0]);
  };
  let id: number | null = null;
  // Already in the catalogue?
  {
    const { data } = await admin.from('stubs_films').select('id,title,year,poster_url').eq('norm_title', n).limit(5);
    const f = (data ?? []).filter((x: any) => x.poster_url).length ? pick(data ?? []) : null;
    if (f) id = f.id;
  }
  if (!id) {
    if (useTmdb) {
      try {
        const ids = await tmdbSearch(name, year, 3);
        const films = await saveTmdb(await Promise.all(ids.map(tmdbFilm)));
        id = pick(films)?.id ?? null;
      } catch (e) {
        console.error('tmdb resolve failed', String(e));
      }
    }
    if (!id) {
      const clean = name.replace(/"/g, '');
      const [wp, wd] = await Promise.all([
        wpSearch(`${clean} ${year ?? ''} film`, 6).catch(() => []),
        wdSearch(`"${clean}"`, 5).catch(() => []),
      ]);
      const qids = [...new Set([...wp, ...wd])].slice(0, 10);
      const order = new Map(qids.map((q, i) => [q, i]));
      const films = (await upsert(await wdFilms(qids)))
        .sort((a: any, b: any) => (order.get(a.wikidata_id) ?? 99) - (order.get(b.wikidata_id) ?? 99));
      id = pick(films)?.id ?? null;
    }
  }
  await admin.from('stubs_film_lookup').upsert({ key, film_id: id });
  return id;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  try {
    if (body.action === 'search') {
      const q = String(body.q ?? '').trim().slice(0, 80);
      if (q.length < 2) return json({ films: [] });
      return json({ films: await search(q) });
    }
    if (body.action === 'resolve') {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 30)
        .map((x: any) => ({ name: String(x?.name ?? '').trim().slice(0, 150), year: parseInt(x?.year, 10) || null }))
        .filter((x: any) => x.name);
      const ids = await pool(items, 5, (x: any) => resolveOne(x.name, x.year).catch(() => null));
      return json({ ids });
    }
    if (body.action === 'refresh') {
      // Re-fetch one film's details (e.g., a row cached before a poster existed).
      const id = parseInt(body.id, 10);
      const { data: f } = await admin.from('stubs_films').select('id,wikidata_id,tmdb_id,updated_at').eq('id', id).maybeSingle();
      if (!f) return json({ error: 'not found' }, 404);
      if (Date.now() - new Date(f.updated_at).getTime() < 86400_000) return json({ ok: true, fresh: true });
      if (f.tmdb_id && await hasTmdb()) await saveTmdb([await tmdbFilm(f.tmdb_id)]);
      else if (f.wikidata_id) await upsert(await wdFilms([f.wikidata_id]));
      return json({ ok: true });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e).slice(0, 200) }, 502);
  }
});
