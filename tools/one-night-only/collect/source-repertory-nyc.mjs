#!/usr/bin/env node
// source-repertory-nyc.mjs - repertory.nyc's open JSON API. The cinema core.
//
// This is the one aggregator DECISIONS.md says we may consume: their robots.txt
// explicitly allows ClaudeBot, and their times were spot-checked against Film
// Forum's own listings and matched exactly, including the 12-hour-to-24-hour
// conversion that Film Forum's own markup leaves ambiguous. Screen Slate, by
// contrast, is off limits and is not touched anywhere in this collector.
//
// Two rules from the research that are load-bearing here:
//
//  * Use /api/screenings/week ONLY. /api/screenings?date= is hard-capped at 100
//    records even when you pass limit=500, so a busy NYC Friday truncates
//    silently. Silent truncation is the same class of harm as a wrong showtime.
//  * film_year is null on ~26% of records, film_director on ~25%, format on
//    ~35%. Those are omitted, not filled in. A missing field is a missing field.
//
// The API returns weeks, so a longer horizon costs one request per fortnight.
// We take one, and the reason is volume: see WINDOWS below.

import {
  fetchText, tidy, slugify, localStamp, dateOnly, parseClock12, timeOfDay,
  localDate, shiftDate, assertParsedTimes, assertDateSpread, filmKey,
} from './common.mjs';

export const id = 'repertory-nyc';
export const label = 'repertory.nyc';
export const credit = {
  name: 'repertory.nyc',
  url: 'https://www.repertory.nyc/',
  note: 'Cinema showtimes via their open API, used with their robots.txt permission.',
};

const BASE = 'https://www.repertory.nyc';

/**
 * Fortnights to request. Each is one conditional GET.
 *
 * THREE. This was 1, and the reason was the 1,000-VEVENT calendar cap: NYC's
 * dedicated cinemas alone overflowed it inside two weeks, and because the cap
 * keeps the SOONEST events, what it evicted was the far-future non-cinema
 * programming this site exists for. The one-night-only filter removed that
 * pressure by dropping runs before they ever reach the calendar, so the number
 * is now set by filter accuracy instead.
 *
 * A longer horizon makes the filter more accurate, because `assignLimited()`
 * can only count the dates it can see. A run that begins on the last day or two
 * of the window looks like a one-off and is published as one. Measured
 * 2026-08-20, qualifying repertory.nyc groups whose last date fell inside the
 * final two days of the window:
 *
 *   WINDOWS=1   185 qualifying groups,  18 at the edge   (9.7%)
 *   WINDOWS=2   246 qualifying groups,  10 at the edge   (4.1%)
 *   WINDOWS=3   288 qualifying groups,   4 at the edge   (1.4%)
 *
 * The cost is bounded and was measured, not assumed: 526 VEVENTs of the 1,000
 * cap and 369 KiB of the 900 KiB budget. index.html, which carries everything
 * rather than only the qualifying set, grows to about 1.4 MiB and is the one
 * number here worth watching.
 *
 * Not four: repertory.nyc's third fortnight already returns markedly less than
 * its second (+85 records against +169), so a fourth buys little accuracy and
 * still costs page weight.
 */
export const WINDOWS = 3;
const WINDOW_DAYS = 14;

/**
 * The film catalog, read only to fill in a MISSING release year.
 *
 * `/api/screenings/week` leaves `film_year` null on about a fifth of its rows,
 * and a record with no year cannot be classified as repertory or as first-run.
 * That matters now that the vintage rule exists: see assignVintage() in
 * collect.mjs.
 *
 * `/api/films` is the same film table, so a row whose `film_year` is null is
 * null here too. What makes this worth a request is that the catalog carries
 * DUPLICATE rows for one film under different title spellings, and the
 * duplicates do not agree about what is missing. Measured 2026-08-20:
 *
 *   "THE GODFATHER PART II"          year null
 *   "The Godfather Part II"          year 1974
 *   "DEAD MAN"                       year null   /  "Dead Man"        1995
 *   "STRANGERS ON A TRAIN"           year null   /  ...on a Train     1951
 *   "Freefall: A Reckoning for Boeing"           null
 *   "Freefall: A Reckoning for Boeing (Open Captioning)"   2026
 *
 * Normalising both sides with the project's own `filmKey()` collapses those
 * pairs and recovers a year for 19 of the 174 films that had none, including
 * every one of the IFC Center first-run documentaries that prompted the rule.
 *
 * Two safety rules, both enforced below:
 *   * A film_key that resolves to MORE THAN ONE year in the catalog is dropped
 *     rather than guessed at. 31 keys are ambiguous; a wrong year here would
 *     quietly delete a genuine revival from the calendar.
 *   * The index is advisory. A record it cannot resolve keeps `year: null` and
 *     is still published. Nothing is dropped for want of a match.
 *
 * The endpoint is unpaginated by default and caps `limit` at 100, so the whole
 * catalog is `CATALOG_MAX_PAGES` GETs. It offers neither ETag nor
 * Last-Modified, so these cannot be conditional requests and cost roughly a
 * megabyte per scheduled run. That is the price of the field, and it is bounded
 * by the page cap rather than by trusting the server to stop.
 */
const CATALOG_PAGE = 100;
const CATALOG_MAX_PAGES = 60; // 6,000 films. The catalog was 3,926 on 2026-08-20.

export async function collect(ctx) {
  const notes = [];

  const theatersRes = await fetchText(`${BASE}/api/theaters`, {
    cache: ctx.cache, expect: /application\/json/i, accept: 'application/json',
  });
  const theaters = JSON.parse(theatersRes.body);
  if (!Array.isArray(theaters) || theaters.length === 0) {
    throw new Error('repertory-nyc: /api/theaters returned no theaters');
  }
  const bySlug = new Map(theaters.map((t) => [t.slug, t]));

  const today = localDate(ctx.now);
  const rows = [];
  const seenIds = new Set();
  for (let i = 0; i < WINDOWS; i++) {
    const start = shiftDate(today, i * WINDOW_DAYS);
    const end = shiftDate(today, (i + 1) * WINDOW_DAYS - 1);
    const url = `${BASE}/api/screenings/week?start=${start}&end=${end}`;
    const res = await fetchText(url, {
      cache: ctx.cache, expect: /application\/json/i, accept: 'application/json',
    });
    const batch = JSON.parse(res.body);
    if (!Array.isArray(batch)) {
      throw new Error(`repertory-nyc: ${url} did not return an array`);
    }
    for (const row of batch) {
      if (row && row.id && seenIds.has(row.id)) continue;
      if (row && row.id) seenIds.add(row.id);
      rows.push(row);
    }
    if (i === 0 && batch.length === 0) {
      notes.push('the first fortnight returned zero rows; the zero guard will decide');
    }
  }

  const screenings = [];
  const venues = [];
  let droppedNoTime = 0;
  let droppedNoTheater = 0;

  for (const row of rows) {
    const theater = bySlug.get(row.theater_slug);
    const venueName = tidy(row.theater_name || (theater && theater.name) || '');
    if (!venueName) { droppedNoTheater++; continue; }

    const date = dateOnly(row.date);
    // `time` is a 24-hour "HH:MM" on every row observed. A 12-hour label with a
    // meridiem is accepted too. Anything else is dropped, never assumed.
    const t = /^\d{1,2}:\d{2}$/.test(String(row.time || '').trim())
      ? timeOfDay(`T${String(row.time).trim().padStart(5, '0')}`)
      : parseClock12(row.time);
    const start = date && t ? localStamp(date, t.hour, t.minute) : null;
    if (!start) { droppedNoTime++; continue; }

    const slug = slugify(venueName);
    venues.push({
      slug,
      name: venueName,
      address: theater && theater.address ? tidy(theater.address) : null,
      url: theater && theater.website ? theater.website : null,
      geo: theater && Number.isFinite(theater.latitude) && Number.isFinite(theater.longitude)
        ? [theater.latitude, theater.longitude]
        : null,
    });

    screenings.push({
      venue_slug: slug,
      programmer: null, // the room is the programmer for the cinema core
      title: tidy(row.film_title || ''),
      year: Number.isInteger(row.film_year) ? row.film_year : null,
      director: tidy(row.film_director || '') || null,
      runtime_min: Number.isInteger(row.film_runtime_minutes) && row.film_runtime_minutes > 0
        ? row.film_runtime_minutes : null,
      start_local: start,
      end_local: null, // build.mjs derives from runtime; never guessed here
      url: cleanUrl(row.ticket_url) || (theater && theater.website) || BASE,
      format: tidy(row.format || '') || null,
      series: null,
      // special_event is an OBJECT ({event_type, guests, description}), not a
      // string. Stringifying it yields "[object Object]", which is the kind of
      // thing that ships quietly. Take the human sentence or nothing.
      note: specialEventNote(row.special_event),
      source: id,
    });
  }

  assertParsedTimes(id, rows.length, screenings, droppedNoTime);
  assertDateSpread(id, screenings);
  if (droppedNoTheater > 0) notes.push(`${droppedNoTheater} rows had no theater name`);

  const catalog = await filmYearIndex(ctx, notes);

  return {
    screenings,
    venues,
    // Advisory: film_key -> release year, for records whose source left the
    // year blank. collect.mjs merges this across sources and uses it in
    // assignVintage(). Never used to overwrite a year a source did supply.
    filmYears: catalog.years,
    stats: {
      raw: rows.length, kept: screenings.length, droppedNoTime, droppedNoTheater,
      theaters: theaters.length, windows: WINDOWS,
      catalogFilms: catalog.films, catalogPages: catalog.pages,
      catalogYears: Object.keys(catalog.years).length, catalogAmbiguous: catalog.ambiguous,
    },
    notes,
  };
}

/**
 * Build film_key -> year from /api/films. See the CATALOG_PAGE comment above.
 *
 * A failure here is NOT a source failure. The catalog only ever fills in a
 * field that was already missing, so losing it degrades the vintage rule to
 * "year unknown" on a few more records and degrades nothing else. Throwing
 * would take the cinema core off the site over an optional lookup.
 */
async function filmYearIndex(ctx, notes) {
  const seen = new Map(); // film_key -> Set(year)
  let films = 0;
  let pages = 0;
  try {
    for (let page = 0; page < CATALOG_MAX_PAGES; page++) {
      const url = `${BASE}/api/films?limit=${CATALOG_PAGE}&offset=${page * CATALOG_PAGE}`;
      const res = await fetchText(url, {
        cache: ctx.cache, expect: /application\/json/i, accept: 'application/json',
      });
      const batch = JSON.parse(res.body);
      if (!Array.isArray(batch)) {
        throw new Error(`${url} did not return an array`);
      }
      pages++;
      films += batch.length;
      for (const f of batch) {
        if (!f || !Number.isInteger(f.year)) continue;
        if (f.year < 1880 || f.year > 2100) continue;
        const k = filmKey(f.title || '');
        if (!k) continue;
        if (!seen.has(k)) seen.set(k, new Set());
        seen.get(k).add(f.year);
      }
      if (batch.length < CATALOG_PAGE) break;
      if (page === CATALOG_MAX_PAGES - 1) {
        notes.push(`the film catalog hit the ${CATALOG_MAX_PAGES}-page cap; ` +
          'raise CATALOG_MAX_PAGES or the index is incomplete');
      }
    }
  } catch (err) {
    notes.push(`film catalog lookup failed, years not enriched: ${err && err.message ? err.message : err}`);
    return { years: {}, films, pages, ambiguous: 0 };
  }

  // A key the catalog spells two different years for is NOT resolved. Guessing
  // between them could delete a genuine revival from the calendar.
  const years = {};
  let ambiguous = 0;
  for (const k of [...seen.keys()].sort()) {
    const s = seen.get(k);
    if (s.size !== 1) { ambiguous++; continue; }
    years[k] = [...s][0];
  }
  return { years, films, pages, ambiguous };
}

function specialEventNote(se) {
  if (!se || typeof se !== 'object') return null;
  const desc = tidy(se.description || '');
  if (desc) return desc.length > 240 ? null : desc;
  const type = tidy(se.event_type || '').replace(/_/g, ' ');
  return type ? type.replace(/\bq and a\b/i, 'Q&A') : null;
}

function cleanUrl(u) {
  const s = String(u || '').trim();
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}
