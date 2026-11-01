// stubs-watch: twice a day, ask TMDB about every film on a Stubs list.
//
//   In theaters (anywhere in the US): the film is in TMDB's now_playing for
//   region US, or has a US theatrical or limited release (release_dates type
//   2 or 3) in the past week. One alert per person per theatrical run, linking
//   to Fandango and to showtimes near their ZIP.
//   Streaming: TMDB watch providers for the US (data from JustWatch). Alerts
//   only on change: a new streaming service, or a first rent/buy listing. The
//   first time a film is seen is the baseline and sends nothing.
//
// Also fills in tmdb_id and TMDB posters for films that came from Wikidata.
// Called by pg_cron job "stubs-watch" with the shared secret.
// Body: { dry?: true, films?: number[] }. A dry run records what TMDB says but
// sends nothing and returns the alerts it would send (stubs_watch_preview).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { addDays, daysBetween, filmFromTmdb, joinNames, norm, nyToday, tmdb } from '../_shared/tmdb.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const MAX_FILMS = 1500;       // per run; oldest-checked first
const MAX_RESOLVE = 300;      // Wikidata films mapped to TMDB per run

type Prov = { id: number; name: string; logo: string | null };

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

// Add-on channels ("HBO Max Amazon Channel") repeat the real service, so skip them.
// deno-lint-ignore no-explicit-any
function providers(list: any[] | undefined): Prov[] {
  return (list ?? []).filter((p) => !/\bchannel$/i.test(String(p.provider_name ?? '')))
    .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path ?? null }));
}
function merge(...lists: Prov[][]): Prov[] {
  const seen = new Set<number>(); const out: Prov[] = [];
  for (const l of lists) for (const p of l) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
  return out;
}

async function findTmdbId(f: { title: string; year: number | null; wikidata_id: string | null }): Promise<number | null> {
  if (f.wikidata_id) {
    const d = await tmdb(admin, `/find/${f.wikidata_id}`, { external_source: 'wikidata_id' });
    const m = d.movie_results?.[0];
    if (m?.id) return m.id;
  }
  const p: Record<string, string> = { query: f.title, include_adult: 'false' };
  if (f.year) p.year = String(f.year);
  const d = await tmdb(admin, '/search/movie', p);
  const n = norm(f.title);
  // deno-lint-ignore no-explicit-any
  const hit = (d.results ?? []).find((r: any) => norm(r.title) === n || norm(r.original_title ?? '') === n);
  return hit?.id ?? null;
}

async function nowPlayingUS(): Promise<Set<number>> {
  const ids = new Set<number>();
  for (let page = 1; page <= 40; page++) {
    const d = await tmdb(admin, '/movie/now_playing', { region: 'US', page: String(page) });
    for (const r of d.results ?? []) ids.add(r.id);
    if (page >= (d.total_pages ?? 1)) break;
  }
  return ids;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('STUBS_CRON_SECRET');
  if (!secret || req.headers.get('x-stubs-cron') !== secret) return new Response('forbidden', { status: 403 });
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const dry = body.dry === true;
  const only: number[] | null = Array.isArray(body.films) ? body.films.map(Number).filter(Boolean).slice(0, 50) : null;
  const detail: Record<string, unknown> = { dry };
  const today = nyToday();
  try {
    // Films on any list.
    type F = { id: number; title: string; year: number | null; tmdb_id: number | null; wikidata_id: string | null; poster_url: string | null; overview: string | null };
    const films: F[] = [];
    for (let from = 0; ; from += 1000) {
      let q = admin.from('stubs_films')
        .select('id,title,year,tmdb_id,wikidata_id,poster_url,overview,stubs_list_items!inner(id)');
      if (only) q = q.in('id', only);
      const { data, error } = await q.range(from, from + 999);
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      for (const f of (data ?? []) as any[]) films.push({ id: f.id, title: f.title, year: f.year, tmdb_id: f.tmdb_id, wikidata_id: f.wikidata_id, poster_url: f.poster_url, overview: f.overview });
      if (!data || data.length < 1000) break;
    }
    const prevRows = new Map<number, any>();
    for (let i = 0; i < films.length; i += 300) {
      const { data, error } = await admin.from('stubs_film_watch').select('*').in('film_id', films.slice(i, i + 300).map((f) => f.id));
      if (error) throw error;
      for (const r of data ?? []) prevRows.set(r.film_id, r);
    }
    films.sort((a, b) => String(prevRows.get(a.id)?.checked_at ?? '').localeCompare(String(prevRows.get(b.id)?.checked_at ?? '')));
    const batch = films.slice(0, MAX_FILMS);
    detail.films_on_lists = films.length;
    detail.checked = batch.length;

    // Map Wikidata films to TMDB.
    const tmdbOf = new Map<number, number>();
    const need: F[] = [];
    for (const f of batch) {
      if (f.tmdb_id) tmdbOf.set(f.id, f.tmdb_id);
      else if (prevRows.get(f.id)?.tmdb_id) tmdbOf.set(f.id, prevRows.get(f.id).tmdb_id);
      else if (need.length < MAX_RESOLVE) need.push(f);
    }
    let resolved = 0;
    await pool(need, 5, async (f) => {
      const id = await findTmdbId(f).catch(() => null);
      if (id) { tmdbOf.set(f.id, id); resolved++; }
    });
    detail.resolved = resolved;
    detail.unresolved = need.length - resolved;

    const playing = await nowPlayingUS();
    detail.now_playing_us = playing.size;

    const weekAgo = addDays(today, -6);
    const states: any[] = [];
    const events: any[] = [];
    let enriched = 0;
    let failed = 0;
    await pool(batch.filter((f) => tmdbOf.has(f.id)), 6, async (f) => {
      const tid = tmdbOf.get(f.id)!;
      const enrich = !f.tmdb_id;
      let m;
      try {
        m = await tmdb(admin, `/movie/${tid}`, {
          append_to_response: `release_dates,watch/providers${enrich ? ',credits,external_ids' : ''}`,
        });
      } catch { failed++; return; }

      // Posters and details from TMDB for a Wikidata row (keeps Wikipedia's
      // poster and summary when TMDB has none).
      if (enrich && !dry) {
        const t = filmFromTmdb(m);
        const { error } = await admin.from('stubs_films').update({
          tmdb_id: tid, source: 'tmdb', poster_url: t.poster_url ?? f.poster_url,
          backdrop_url: t.backdrop_url ?? null, overview: t.overview ?? f.overview,
          updated_at: new Date().toISOString(),
        }).eq('id', f.id);
        if (!error) enriched++;
      }

      // deno-lint-ignore no-explicit-any
      const us = (m.release_dates?.results ?? []).find((r: any) => r.iso_3166_1 === 'US');
      const theatrical = (us?.release_dates ?? [])
        // deno-lint-ignore no-explicit-any
        .filter((d: any) => d.type === 2 || d.type === 3)
        // deno-lint-ignore no-explicit-any
        .map((d: any) => String(d.release_date).slice(0, 10)).sort();
      const openedThisWeek = theatrical.some((d: string) => d >= weekAgo && d <= today);
      const inTheaters = playing.has(tid) || openedThisWeek;

      const wp = m['watch/providers']?.results?.US ?? {};
      const stream = merge(providers(wp.flatrate), providers(wp.free), providers(wp.ads));
      const rentBuy = merge(providers(wp.rent), providers(wp.buy));

      const prev = prevRows.get(f.id);
      let since: string | null = prev?.theaters_since ?? null;
      if (inTheaters && !prev?.in_theaters) {
        // Back within 45 days counts as the same run (no second alert).
        const last = prev?.theaters_last_seen;
        if (!(since && last && daysBetween(last, today) <= 45)) since = today;
      }
      states.push({
        film_id: f.id, tmdb_id: tid, in_theaters: inTheaters, theaters_since: since,
        theaters_last_seen: inTheaters ? today : prev?.theaters_last_seen ?? null,
        us_release: theatrical[0] ?? null, stream, rent_buy: rentBuy,
        watch_link: wp.link ?? null, checked_at: new Date().toISOString(),
      });

      if (prev) {
        const had = new Set<number>((prev.stream ?? []).map((p: Prov) => p.id));
        const added = stream.filter((p) => !had.has(p.id));
        if (added.length) {
          events.push({ film_id: f.id, kind: 'stream', label: joinNames(added.map((p) => p.name)), providers: added,
            key: `stream:${f.id}:${added.map((p) => p.id).sort((a, b) => a - b).join('-')}` });
        }
        if (!(prev.rent_buy ?? []).length && rentBuy.length) {
          events.push({ film_id: f.id, kind: 'rent_buy', label: joinNames(rentBuy.map((p) => p.name)), providers: rentBuy.slice(0, 6),
            key: `rent_buy:${f.id}` });
        }
      }
    });
    detail.enriched = enriched;
    detail.tmdb_failed = failed;
    detail.in_theaters = states.filter((s) => s.in_theaters).length;
    detail.streaming = states.filter((s) => s.stream.length).length;
    detail.events = events.map((e) => e.key);

    for (let i = 0; i < states.length; i += 500) {
      const { error } = await admin.from('stubs_film_watch').upsert(states.slice(i, i + 500), { onConflict: 'film_id' });
      if (error) throw error;
    }
    if (events.length) {
      const { error } = await admin.from('stubs_watch_events').upsert(events, { onConflict: 'key', ignoreDuplicates: true });
      if (error) throw error;
    }

    if (dry) {
      const { data, error } = await admin.rpc('stubs_watch_preview');
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      const pending = (data ?? []).filter((a: any) => !a.already_sent);
      detail.would_send = pending.length;
      await admin.from('stubs_runs').insert({ job: 'watch', ok: true, detail });
      return Response.json({ ok: true, ...detail, preview: pending });
    }
    const { data: n, error: fanErr } = await admin.rpc('stubs_run_watch_fanout');
    if (fanErr) throw fanErr;
    detail.new_alerts = n;
    await admin.from('stubs_runs').insert({ job: 'watch', ok: true, detail });
    return Response.json({ ok: true, ...detail });
  } catch (e) {
    detail.error = String((e as Error).message ?? e).slice(0, 300);
    await admin.from('stubs_runs').insert({ job: 'watch', ok: false, detail });
    return Response.json({ ok: false, ...detail }, { status: 500 });
  }
});
