// stubs-films: film search, lookup and Letterboxd-row matching for Stubs.
//
// Data source: Wikidata (facts) + English Wikipedia (poster thumbnail and a
// short summary). If a TMDB_API_KEY secret is ever set, TMDB is used instead:
// it has better posters and coverage, and the rest of the app does not care
// which one filled the row (stubs_films.source says).
//
// Public endpoint (verify_jwt=false): it only reads public film data and
// caches it in stubs_films. Inputs are capped so it can't be used to hammer
// Wikidata on our behalf.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const UA = 'Stubs/1.0 (https://middleton.io/stubs/; assistant@middleton.io)';
const TMDB = Deno.env.get('TMDB_API_KEY') || '';
// film, animated feature, documentary, TV film, short film
const FILM_TYPES = 'haswbstatement:P31=Q11424|P31=Q29168811|P31=Q202866|P31=Q93204|P31=Q506240|P31=Q24862';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type Film = {
  wikidata_id?: string | null; tmdb_id?: number | null; title: string; year: number | null;
  director: string | null; runtime_min: number | null; genres: string[]; overview: string | null;
  poster_url: string | null; backdrop_url?: string | null; wiki_title: string | null; source: string;
};

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
const TMDB_IMG = 'https://image.tmdb.org/t/p/';
async function tmdb(path: string, params: Record<string, string> = {}) {
  const u = new URL(`https://api.themoviedb.org/3${path}`);
  u.search = new URLSearchParams({ api_key: TMDB, language: 'en-US', ...params }).toString();
  return getJSON(u.toString());
}
async function tmdbFilm(id: number): Promise<Film> {
  const m = await tmdb(`/movie/${id}`, { append_to_response: 'credits' });
  const dirs = (m.credits?.crew ?? []).filter((c: any) => c.job === 'Director').slice(0, 2).map((c: any) => c.name);
  return {
    tmdb_id: m.id, title: m.title, year: m.release_date ? parseInt(m.release_date.slice(0, 4), 10) : null,
    director: dirs.join(', ') || null, runtime_min: m.runtime || null,
    genres: (m.genres ?? []).slice(0, 3).map((g: any) => g.name), overview: m.overview || null,
    poster_url: m.poster_path ? `${TMDB_IMG}w500${m.poster_path}` : null,
    backdrop_url: m.backdrop_path ? `${TMDB_IMG}w1280${m.backdrop_path}` : null,
    wiki_title: null, source: 'tmdb',
  };
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
  const key = TMDB ? 'tmdb_id' : 'wikidata_id';
  const rows = films.map((f) => ({ ...f, updated_at: new Date().toISOString() }));
  const { data, error } = await admin.from('stubs_films').upsert(rows, { onConflict: key }).select(COLS);
  if (error) throw error;
  return data ?? [];
}

async function search(q: string) {
  if (TMDB) {
    const ids = await tmdbSearch(q, null, 10);
    return upsert(await Promise.all(ids.map(tmdbFilm)));
  }
  const [wp, wd] = await Promise.all([wpSearch(`${q} film`, 12).catch(() => []), wdSearch(q, 8).catch(() => [])]);
  const qids = [...new Set([...wp, ...wd])].slice(0, 16);
  const rows = await upsert((await wdFilms(qids)).slice(0, 12));
  const order = new Map(qids.map((q, i) => [q, i]));
  return rows.sort((a: any, b: any) => (order.get(a.wikidata_id) ?? 99) - (order.get(b.wikidata_id) ?? 99));
}

// Letterboxd rows -> film ids. Year must agree within a year when given.
async function resolveOne(name: string, year: number | null): Promise<number | null> {
  const key = `${TMDB ? 't' : 'w'}:${norm(name)}:${year ?? ''}`;
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
    if (TMDB) {
      const ids = await tmdbSearch(name, year, 3);
      const films = await upsert(await Promise.all(ids.map(tmdbFilm)));
      id = pick(films)?.id ?? null;
    } else {
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
      if (f.tmdb_id && TMDB) await upsert([await tmdbFilm(f.tmdb_id)]);
      else if (f.wikidata_id) await upsert(await wdFilms([f.wikidata_id]));
      return json({ ok: true });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e).slice(0, 200) }, 502);
  }
});
