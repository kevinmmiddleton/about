// Shared TMDB helpers for the Stubs edge functions. Server side only: the
// read token comes from the TMDB_READ_TOKEN function secret if one is set,
// else from Supabase Vault (stubs_tmdb_token, read through a service-role-only
// RPC). It never reaches the browser; image.tmdb.org URLs are fine to show.
//
// This product uses the TMDB API but is not endorsed or certified by TMDB.
// Watch-provider data on TMDB comes from JustWatch and must be credited.

// deno-lint-ignore no-explicit-any
type Admin = any;

export const TMDB_IMG = 'https://image.tmdb.org/t/p/';
let cached: string | null = null;

export async function tmdbToken(admin: Admin): Promise<string> {
  if (cached !== null) return cached;
  let t = Deno.env.get('TMDB_READ_TOKEN') || '';
  if (!t) {
    const { data, error } = await admin.rpc('stubs_tmdb_token');
    if (!error && typeof data === 'string') t = data;
  }
  cached = t;
  return t;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function tmdb(admin: Admin, path: string, params: Record<string, string> = {}) {
  const t = await tmdbToken(admin);
  if (!t) throw new Error('TMDB is not set up');
  const u = new URL(`https://api.themoviedb.org/3${path}`);
  u.search = new URLSearchParams({ language: 'en-US', ...params }).toString();
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(u, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' } });
    if ((r.status === 429 || r.status >= 500) && attempt < 3) { await sleep(800 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} from TMDB ${path.split('?')[0]}`);
    return r.json();
  }
}

export type Film = {
  wikidata_id?: string | null; tmdb_id?: number | null; title: string; year: number | null;
  director: string | null; runtime_min: number | null; genres: string[]; overview: string | null;
  poster_url: string | null; backdrop_url?: string | null; wiki_title: string | null; source: string;
};

// A /movie/{id} response (with credits and external_ids appended) as a stubs_films row.
// deno-lint-ignore no-explicit-any
export function filmFromTmdb(m: any): Film {
  const dirs = (m.credits?.crew ?? []).filter((c: any) => c.job === 'Director').slice(0, 2).map((c: any) => c.name);
  const wd = m.external_ids?.wikidata_id;
  return {
    tmdb_id: m.id, title: m.title, year: m.release_date ? parseInt(m.release_date.slice(0, 4), 10) : null,
    director: dirs.join(', ') || null, runtime_min: m.runtime || null,
    genres: (m.genres ?? []).slice(0, 3).map((g: any) => g.name), overview: m.overview || null,
    poster_url: m.poster_path ? `${TMDB_IMG}w500${m.poster_path}` : null,
    backdrop_url: m.backdrop_path ? `${TMDB_IMG}w1280${m.backdrop_path}` : null,
    wikidata_id: typeof wd === 'string' && /^Q\d+$/.test(wd) ? wd : null,
    wiki_title: null, source: 'tmdb',
  };
}

export const norm = (s: string) => s.toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[’']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

export function nyToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}
export function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400_000);
}

// "Netflix", "Netflix and Max", "Netflix, Max and Hulu", "Netflix, Max and 3 more"
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
