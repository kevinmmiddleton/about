// stubs-match: twice a day, find NYC screenings of films that sit on any Stubs
// list and turn them into alerts.
//
// Source: One Night Only's published screenings.json (middleton.io), matched by
// normalized title + year (within one year; a screening with no year matches
// on title alone). Called by pg_cron job "stubs-match" with a shared secret.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SRC = 'https://middleton.io/one-night-only/_data/screenings.json';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// "Hannah and Her Sisters - 35MM", "Halloween (1978)", "Ken Russell's The Devils"
export function cleanTitle(t: string) {
  return t
    .replace(/\s*\((19|20)\d{2}\)\s*$/, '')
    .replace(/\s*[-:|]\s*(35\s?mm|70\s?mm|16\s?mm|4k( restoration)?|in 35mm|in 70mm|imax|3d|dcp|restored|new restoration|sing-?along|quote-?along)\s*$/i, '')
    .replace(/\s+\((35mm|70mm|4k|subtitled|dubbed)\)\s*$/i, '')
    .trim();
}
export const norm = (s: string) => s.toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2019']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const stripThe = (n: string) => n.replace(/^(the|a|an)(?=[a-z0-9]{3,})/, '');

function screeningYear(s: any): number | null {
  if (s.year) return s.year;
  const m = String(s.title).match(/\(((19|20)\d{2})\)\s*$/);
  if (m) return parseInt(m[1], 10);
  if (s.vintage && s.vintage_year && s.vintage_year_from !== 'source') return s.vintage_year;
  return null;
}

function nyNow() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('STUBS_CRON_SECRET');
  if (!secret || req.headers.get('x-stubs-cron') !== secret) {
    return new Response('forbidden', { status: 403 });
  }
  const started = new Date().toISOString();
  const detail: Record<string, unknown> = {};
  try {
    // Films on any list (paged; lists are small but be safe).
    const films: { id: number; title: string; year: number | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from('stubs_films')
        .select('id,title,year,stubs_list_items!inner(id)').range(from, from + 999);
      if (error) throw error;
      for (const f of data ?? []) films.push({ id: f.id, title: f.title, year: f.year });
      if (!data || data.length < 1000) break;
    }
    const byTitle = new Map<string, typeof films>();
    for (const f of films) {
      for (const k of new Set([norm(f.title), stripThe(norm(f.title))])) {
        if (!byTitle.has(k)) byTitle.set(k, []);
        byTitle.get(k)!.push(f);
      }
    }
    detail.films_on_lists = films.length;

    const r = await fetch(SRC, { headers: { 'User-Agent': 'Stubs matcher (middleton.io/stubs)' } });
    if (!r.ok) throw new Error(`screenings.json ${r.status}`);
    const data = await r.json();
    const venues: Record<string, { name: string; address?: string }> = data.venues ?? {};
    const now = nyNow();
    const rows: any[] = [];
    let considered = 0;
    for (const s of data.screenings ?? []) {
      if (s.status !== 'confirmed' || !s.start_local || s.start_local < now) continue;
      considered++;
      const n = norm(cleanTitle(s.title));
      const cands = byTitle.get(n) ?? byTitle.get(stripThe(n));
      if (!cands) continue;
      const sy = screeningYear(s);
      const f = cands.find((c) => !sy || !c.year || Math.abs(c.year - sy) <= 1);
      if (!f) continue;
      const v = venues[s.venue_slug] ?? { name: s.venue_slug };
      rows.push({
        uid: s.uid, film_id: f.id, venue_slug: s.venue_slug, venue_name: v.name,
        venue_address: v.address ?? null, starts_at: s.start_local, url: s.url ?? null,
        format: s.format ?? null, run_key: s.run_key ?? `${s.venue_slug}|${s.film_key}`,
        title_raw: s.title, seen_at: started,
      });
    }
    detail.upcoming_screenings = considered;
    detail.matched_screenings = rows.length;
    detail.matched_films = new Set(rows.map((x) => x.film_id)).size;

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from('stubs_screenings').upsert(rows.slice(i, i + 500), { onConflict: 'uid' });
      if (error) throw error;
    }
    // Anything not seen this run is past, cancelled, or no longer on a list.
    const { error: delErr } = await admin.from('stubs_screenings').delete().lt('seen_at', started);
    if (delErr) throw delErr;

    const { data: n, error: fanErr } = await admin.rpc('stubs_run_fanout');
    if (fanErr) throw fanErr;
    detail.new_alerts = n;
    await admin.from('stubs_runs').insert({ job: 'match', ok: true, detail });
    return Response.json({ ok: true, ...detail });
  } catch (e) {
    detail.error = String((e as Error).message ?? e).slice(0, 300);
    await admin.from('stubs_runs').insert({ job: 'match', ok: false, detail });
    return Response.json({ ok: false, ...detail }, { status: 500 });
  }
});
