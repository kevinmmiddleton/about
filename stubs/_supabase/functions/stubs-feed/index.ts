// stubs-feed: a person's private calendar (iCal) and alerts (RSS), by secret
// token. GET ?t=<token>&f=ics|rss. The token is the only credential, so it is
// a random UUID the owner can rotate from the Alerts page.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const APP = 'https://middleton.io/stubs/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const xml = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// RFC 5545 text escaping + 75-octet folding.
const ics = (s: unknown) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;')
  .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}
const icsLocal = (ts: string) => ts.replace(/[-:]/g, '').slice(0, 13) + '00';   // 2026-11-07T19:00 -> 20261107T190000
const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const VTZ = [
  'BEGIN:VTIMEZONE', 'TZID:America/New_York',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD', 'END:VTIMEZONE',
];

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const t = u.searchParams.get('t') ?? '';
  const f = u.searchParams.get('f') === 'rss' ? 'rss' : 'ics';
  if (!UUID.test(t)) return new Response('not found', { status: 404 });
  const { data: tok } = await admin.from('stubs_feed_tokens').select('user_id').eq('token', t).maybeSingle();
  if (!tok) return new Response('not found', { status: 404 });
  const uid = tok.user_id;
  const { data: prof } = await admin.from('stubs_profiles').select('display_name').eq('id', uid).single();

  if (f === 'rss') {
    const { data: alerts } = await admin.from('stubs_alerts')
      .select('id,kind,title,body,url,created_at,film_id,list_id')
      .eq('user_id', uid).order('created_at', { ascending: false }).limit(60);
    const items = (alerts ?? []).map((a) => `<item>
  <title>${xml(a.title)}</title>
  <link>${xml(a.url || `${APP}#/film/${a.film_id}`)}</link>
  <guid isPermaLink="false">stubs-alert-${a.id}</guid>
  <pubDate>${new Date(a.created_at).toUTCString()}</pubDate>
  <description>${xml(a.body ?? '')}</description>
</item>`).join('\n');
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Stubs alerts for ${xml(prof?.display_name ?? 'you')}</title>
<link>${APP}#/inbox</link>
<description>Films on your lists playing in NYC, and what your friends add.</description>
${items}
</channel></rss>`;
    return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'max-age=900' } });
  }

  // Calendar: every upcoming screening of a film on a list you're on.
  const { data: mem } = await admin.from('stubs_list_members').select('list_id').eq('user_id', uid);
  const listIds = (mem ?? []).map((m) => m.list_id);
  let events: string[] = [];
  if (listIds.length) {
    const { data: items } = await admin.from('stubs_list_items').select('film_id,list_id,stubs_lists(name)').in('list_id', listIds);
    const listName = new Map<number, string>();
    for (const i of items ?? []) if (!listName.has(i.film_id)) listName.set(i.film_id, (i as any).stubs_lists?.name ?? 'your list');
    const filmIds = [...listName.keys()];
    if (filmIds.length) {
      const { data: shows } = await admin.from('stubs_screenings')
        .select('uid,film_id,venue_name,venue_address,starts_at,url,format,stubs_films(title,year,runtime_min)')
        .in('film_id', filmIds.slice(0, 1000)).order('starts_at').limit(400);
      const stamp = icsUtc(new Date());
      events = (shows ?? []).flatMap((s: any) => {
        const film = s.stubs_films ?? {};
        const mins = film.runtime_min && film.runtime_min > 20 ? film.runtime_min : 120;
        const desc = `On ${listName.get(s.film_id)}.${s.format ? ` ${s.format}.` : ''}${s.url ? `\nTickets: ${s.url}` : ''}\nFrom Stubs: ${APP}#/film/${s.film_id}`;
        return [
          'BEGIN:VEVENT', `UID:${s.uid.replace('@screenings.middleton.io', '')}@stubs.middleton.io`, `DTSTAMP:${stamp}`,
          `DTSTART;TZID=America/New_York:${icsLocal(s.starts_at)}`, `DURATION:PT${mins}M`,
          `SUMMARY:${ics(`${film.title}${film.year ? ` (${film.year})` : ''} at ${s.venue_name}`)}`,
          `LOCATION:${ics([s.venue_name, s.venue_address].filter(Boolean).join(', '))}`,
          `DESCRIPTION:${ics(desc)}`, ...(s.url ? [`URL:${s.url}`] : []), 'TRANSP:TRANSPARENT', 'END:VEVENT',
        ];
      });
    }
  }
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//middleton.io//Stubs//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${ics(`Stubs: ${prof?.display_name ?? 'my'} watchlist in NYC`)}`,
    'X-WR-TIMEZONE:America/New_York', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
    ...VTZ, ...events, 'END:VCALENDAR',
  ];
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=900' },
  });
});
