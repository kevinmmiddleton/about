#!/usr/bin/env node
// source-fathom.mjs - Fathom Entertainment's one-night events at the chains.
//
// Fathom books the anniversary revivals, the Met Opera encores and the anime
// premieres that play AMC, Regal and Cinemark for a night or two. None of the
// other sources reach a chain multiplex, so without this one the page only
// knew about the independent rooms.
//
// Two requests per event, both public JSON on api.fathomentertainment.com,
// which serves no robots.txt (a 404, which common.mjs reads as permission):
//
//   /api/events                       every event Fathom has, Active or Archive
//   /api/events/showtimes?eventID=..  the theaters nearest a point, by date
//
// The second one is the same call the "Get Tickets" box on each release page
// makes. It is asked once per Active event, from Midtown, and everything
// outside the five boroughs is dropped here.
//
// The chains' own sites were checked first and are not used: regmovies.com
// answers a plain request with a Cloudflare block page, and amctheatres.com
// redirects robots.txt itself. Fathom's listing is the source those chains
// publish from for these events anyway.

import {
  fetchText,
  tidy,
  slugify,
  parseClock12,
  localStamp,
  assertParsedTimes,
} from './common.mjs';

export const id = 'fathom';
export const label = 'Fathom Entertainment';
export const credit = null;

export const profile = {
  name: 'Fathom Entertainment',
  url: 'https://www.fathomentertainment.com/releases/',
  covers:
    'One-night and short-run events at AMC, Regal and Cinemark in the five boroughs: ' +
    'anniversary revivals, Met Opera encores, anime and concert films.',
};

const API = 'https://api.fathomentertainment.com/api/events';
// Midtown. maxTheaters is generous because the API ranks by distance across
// three states; the borough filter below does the real narrowing.
const ORIGIN = { lat: 40.7484, lng: -73.9857 };
const MAX_THEATERS = 60;
const SHOWTIMES = (eventId) =>
  `${API}/showtimes?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&eventID=${eventId}&maxTheaters=${MAX_THEATERS}`;

// The site's release slugs are the API slug with punctuation dropped:
// "the-metropolitan-opera-carmen-encore-(2026)" lives at
// /releases/the-metropolitan-opera-carmen-encore-2026/.
const releaseUrl = (slug) => {
  const clean = String(slug || '').toLowerCase()
    .replace(/[^a-z0-9-]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return clean
    ? `https://www.fathomentertainment.com/releases/${clean}/`
    : 'https://www.fathomentertainment.com/releases/';
};

// The API spells a borough address the way the theater does, so Queens rooms
// arrive under their neighbourhood. State alone would let in Westchester and
// Long Island.
const NYC_CITIES = new Set([
  'new york', 'manhattan', 'brooklyn', 'bronx', 'the bronx', 'staten island', 'queens',
  'long island city', 'astoria', 'flushing', 'jamaica', 'forest hills', 'rego park',
  'elmhurst', 'jackson heights', 'woodside', 'sunnyside', 'ridgewood', 'bayside',
  'college point', 'fresh meadows', 'kew gardens', 'howard beach', 'ozone park',
  'far rockaway', 'rockaway park', 'middle village', 'glendale', 'maspeth',
  'corona', 'whitestone', 'douglaston', 'little neck', 'richmond hill',
]);

// The chains only. Fathom also books independents (Nitehawk, Village East,
// Cobble Hill), and repertory.nyc and Elevent already carry those rooms under
// their own spelling of the event, so taking them here would list one
// screening twice. The chains are the gap this source exists to fill.
const CHAIN = /^(amc|regal|cinemark)\b/i;

/** The building, not the listing. The two spellings of one room differ in a
 *  screen count or a premium-format suffix, never in the chain or the place
 *  name, so those are what the key keeps. Coordinates were tried first and the
 *  duplicates sit a few hundred feet apart in Fathom's data. */
function roomKey(name) {
  return String(name).toLowerCase()
    .replace(/&|\b(screenx|4dx|rpx|imax|ua|loews|dine-in|crossing|cinemas?|\d+(st|nd|rd|th)?)\b/g, ' ')
    .replace(/[^a-z]+/g, ' ').trim();
}

// Fathom keeps internal test events in the public list.
const isTest = (title) => /\btest\b/i.test(title);

/** "Rocky 50th Anniversary" -> { title: "Rocky", year: 1976 } when the event's
 *  own year says so. Only an explicit anniversary or a year in parentheses is
 *  read; anything else stays null rather than borrowing the event date. */
function titleAndYear(rawTitle, firstDate) {
  let title = tidy(rawTitle);
  let year = null;
  const paren = title.match(/\((19|20)\d{2}\b[^)]*\)/);
  if (paren) year = Number(paren[0].slice(1, 5));
  const anni = title.match(/\s+(\d{1,3})(?:st|nd|rd|th)\s+Anniversary\s*$/i);
  const eventYear = Number(String(firstDate || '').slice(0, 4));
  if (anni && Number.isInteger(eventYear) && eventYear > 1900) {
    year = year ?? eventYear - Number(anni[1]);
    title = title.slice(0, anni.index).trim();
  }
  return { title, year };
}

/** "11/7/2026" -> "2026-11-07". */
function ymdOf(mdY) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(mdY || '').trim());
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

export async function collect(ctx) {
  const notes = [];
  const res = await fetchText(API, {
    cache: ctx.cache, expect: /application\/json/i, accept: 'application/json',
  });
  let payload;
  try { payload = JSON.parse(res.body); } catch { throw new Error('fathom: event list was not JSON'); }
  const events = (payload && payload.Events) || [];
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('fathom: event list carried no events');
  }

  const active = events.filter((e) => e && e.Status === 'Active' && e.EventID && !isTest(e.Title || ''));
  const venues = new Map();
  const screenings = [];
  let raw = 0, droppedNoTime = 0, droppedOutside = 0, droppedCovered = 0, eventsWithNyc = 0;
  // Fathom carries some rooms twice under two TheaterIDs and two spellings
  // ("Regal Union Square 14" and "Regal Union Square ScreenX & 4DX"), both
  // selling the same 7pm. One building is one venue: key the room by where it
  // stands (roomKey) and keep the first spelling seen.
  const slugByPlace = new Map();
  const seen = new Set();

  for (const ev of active) {
    const st = await fetchText(SHOWTIMES(ev.EventID), {
      cache: ctx.cache, expect: /application\/json/i, accept: 'application/json',
    });
    let days;
    try { days = JSON.parse(st.body); } catch { throw new Error(`fathom: showtimes for ${ev.EventID} were not JSON`); }
    if (!Array.isArray(days)) continue;

    const { title, year } = titleAndYear(ev.Title, ev.FirstDate);
    if (!title) continue;
    const url = releaseUrl(ev.Slug);
    let nycHere = 0;

    for (const day of days) {
      const ymd = ymdOf(day && day.Date);
      for (const th of (day && day.Theaters) || []) {
        for (const show of th.Showtimes || []) raw++;
        const city = String(th.City || '').trim().toLowerCase();
        if (String(th.State || '').toUpperCase() !== 'NY' || !NYC_CITIES.has(city)) {
          droppedOutside += (th.Showtimes || []).length;
          continue;
        }
        const name = tidy(th.TheaterName);
        if (!CHAIN.test(name)) { droppedCovered += (th.Showtimes || []).length; continue; }
        const place = roomKey(name);
        if (!slugByPlace.has(place)) slugByPlace.set(place, slugify(name));
        const slug = slugByPlace.get(place);
        if (!slug) continue;
        if (!venues.has(slug)) {
          venues.set(slug, {
            slug,
            name,
            address: [tidy(th.Address1), tidy(th.City), th.State, th.PostalCode].filter(Boolean).join(', '),
            geo: (Number.isFinite(th.Lat) && Number.isFinite(th.Lon)) ? [th.Lat, th.Lon] : undefined,
          });
        }
        for (const show of th.Showtimes || []) {
          const clock = parseClock12(show.Time);
          const start = ymd && clock ? localStamp(ymd, clock.hour, clock.minute) : null;
          if (!start) { droppedNoTime++; continue; }
          const key = `${ev.EventID}|${slug}|${start}`;
          if (seen.has(key)) continue;
          seen.add(key);
          nycHere++;
          screenings.push({
            venue_slug: slug,
            programmer: 'Fathom Entertainment',
            title,
            year,
            director: null, // not in the payload
            runtime_min: Number.isFinite(ev.RunTime) && ev.RunTime > 0 ? ev.RunTime : null,
            start_local: start,
            end_local: null,
            url,
            format: null,
            series: null,
            note: null,
            source: id,
            source_ref: `${ev.EventID}:${th.TheaterID}:${start}`,
          });
        }
      }
    }
    if (nycHere) eventsWithNyc++;
  }

  assertParsedTimes(id, raw - droppedOutside - droppedCovered, screenings, droppedNoTime);

  notes.push(`${active.length} active event(s), ${eventsWithNyc} with a showtime in the five boroughs`);
  notes.push(`${venues.size} chain room(s): ${[...venues.values()].map((v) => v.name).join('; ')}`);
  if (droppedCovered) notes.push(`${droppedCovered} showtime(s) at independent rooms left to the sources that already list them`);

  return {
    screenings,
    venues: [...venues.values()],
    stats: { raw, kept: screenings.length, droppedOutside, droppedCovered, droppedNoTime },
    notes,
  };
}
