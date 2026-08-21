#!/usr/bin/env node
// source-nyc-parks.mjs - NYC Parks screenings via NYC Open Data.
//
// research/programmers.md settled the endpoint question, and this module
// follows it exactly. The short version:
//
//  * nycgovparks.org itself is uncollectable. It sits behind AWS WAF and
//    answers every request with HTTP 202 and x-amzn-waf-action: challenge, and
//    its robots.txt disallows /*json, /*xml and parkrss.php anyway. We do not
//    fight that, and we do not go near it.
//  * The Socrata resource w3wp-dpdi, "Public Events - Upcoming 14 Days", is
//    automated, refreshed daily, unauthenticated, offers ETag and
//    Last-Modified, and is simultaneously the only compliant route and the only
//    technically viable one.
//  * Seven sibling Parks datasets look more attractive and are abandoned
//    archives, last refreshed in 2021. They are not used here.
//
// THE TRAP, and it fails silently:
//
//    `starttime` carries the RIGHT TIME and the WRONG DATE. Its date component
//    is pinned to the feed's generation date on every single row - 90.5% of
//    rows disagree with `startdate`. A collector that parses `starttime` as a
//    datetime stacks a fortnight of screenings onto today. It does not error,
//    it does not return zero rows, and it looks fine.
//
//    So: the DATE comes from `startdate`, the TIME OF DAY comes from
//    `starttime`, and assertDateSpread() refuses to publish a run in which
//    everything collapsed onto one date.
//
// The window is a hard rolling fifteen days, so this source alone can never see
// further than a fortnight ahead. collect.mjs carries past screenings forward
// out of the committed dataset rather than letting them evaporate, which is
// what keeps the archive from developing a hole every time the window rolls.

import {
  fetchText, tidy, slugify, https, localStamp, dateOnly, timeOfDay,
  localDate, shiftDate, assertParsedTimes, assertDateSpread, assertWindow,
} from './common.mjs';

export const id = 'nyc-parks';
export const label = 'NYC Parks (NYC Open Data w3wp-dpdi)';
export const credit = {
  name: 'NYC Open Data',
  url: 'https://data.cityofnewyork.us/d/w3wp-dpdi',
  note: 'NYC Parks public events, updated daily.',
};

const RESOURCE = 'https://data.cityofnewyork.us/resource/w3wp-dpdi.json';

const SELECT = [
  'guid', 'title', 'startdate', 'enddate', 'starttime', 'endtime',
  'parknames', 'parkids', 'location', 'coordinates', 'categories',
  'description', 'link', 'image',
].join(',');

// The union of these three category tokens. Filtering on "Movies Under the
// Stars" alone loses 11 of 53 rows, and those eleven are every non-Parks
// programmer, i.e. exactly the tier this project exists to cover.
const CATEGORIES = ['Film', 'Free Summer Movies', 'Movies Under the Stars'];

/**
 * Title prefix -> programmer. The live feed has no organizer field at all; the
 * one that existed (jk6k-yab4) was abandoned in 2021. Stripping a known prefix
 * also yields the film title, which is what the listing actually needs.
 *
 * Deliberately NOT derived from "presented by" / "in partnership with" prose in
 * the description: across the observed rows that pattern returns sponsors
 * (Persol, NewYork-Presbyterian) far more often than programmers, and putting a
 * sunglasses brand in the programmer field would be worse than leaving it null.
 */
export const PROGRAMMER_BY_PREFIX = {
  'movies under the stars': 'NYC Parks Movies Under the Stars',
  muts: 'NYC Parks Movies Under the Stars',
  'summer movies in the park': 'NYC Parks Movies Under the Stars',
  'summer on the hudson': 'Summer on the Hudson',
  'summerstarz 2026 free movies': 'Summerstarz',
  summerstarz: 'Summerstarz',
  'bryant park movie nights': 'Bryant Park',
  'reel talks at bryant park': 'Bryant Park',
  'movie nights at bella abzug park': 'Bella Abzug Park',
  'dyckman marina movie nights': 'Dyckman Marina',
};

/** Titles with no colon that are nonetheless a known series, not a film. */
export const SERIES_TITLES = [
  { match: /^brooklyn bridge park movies with a view/i, programmer: 'Brooklyn Bridge Park' },
  { match: /^movies with a view/i, programmer: 'Brooklyn Bridge Park' },
];

const DEFAULT_PROGRAMMER = 'NYC Parks';

export async function collect(ctx) {
  const notes = [];
  const where = CATEGORIES.map((c) => `categories like '%${c}%'`).join(' OR ');
  const url = `${RESOURCE}?$select=${encodeURIComponent(SELECT)}` +
    `&$where=${encodeURIComponent(where)}` +
    '&$order=startdate&$limit=1000';

  const res = await fetchText(url, {
    cache: ctx.cache, expect: /application\/json/i, accept: 'application/json',
    minDelayMs: 1000, // robots.txt on data.cityofnewyork.us sets Crawl-delay: 1
  });
  const rows = JSON.parse(res.body);
  if (!Array.isArray(rows)) throw new Error('nyc-parks: response was not an array');

  const screenings = [];
  const venues = [];
  let droppedNoTime = 0;
  let reviewFlags = 0;

  for (const row of rows) {
    // DATE from startdate. TIME OF DAY from starttime. Never the other way.
    const date = dateOnly(row.startdate);
    const t = timeOfDay(row.starttime);
    const start = date && t ? localStamp(date, t.hour, t.minute) : null;
    if (!start) { droppedNoTime++; continue; }

    const endDate = dateOnly(row.enddate) || date;
    const et = timeOfDay(row.endtime);
    let end = endDate && et ? localStamp(endDate, et.hour, et.minute) : null;
    if (end && end <= start) end = null;

    const rawTitle = tidy(row.title || '');
    if (!rawTitle) continue;
    const split = splitProgrammer(rawTitle);

    const venueName = tidy(row.parknames || '') || firstLine(tidy(row.location || ''));
    if (!venueName) continue;
    const slug = slugify(venueName);
    venues.push({
      slug,
      name: venueName,
      address: cleanLocation(row.location) || null,
      geo: parseCoords(row.coordinates),
    });

    // Sponsors hide in the description prose. Flag, never auto-attribute.
    if (/presented by|in partnership with|co-presented/i.test(String(row.description || ''))) {
      reviewFlags++;
    }

    screenings.push({
      venue_slug: slug,
      programmer: split.programmer,
      title: split.title,
      year: split.year,
      director: null,
      runtime_min: null,
      start_local: start,
      end_local: end,
      // Links are http:// on every row. Upgrade before publishing.
      url: https(row.link && row.link.url) || 'https://www.nycgovparks.org/events',
      format: null,
      series: split.series,
      note: null,
      source: id,
      source_ref: String(row.guid || '') || null,
    });
  }

  assertParsedTimes(id, rows.length, screenings, droppedNoTime);
  // The one assertion that catches the fake-date trap.
  assertDateSpread(id, screenings, 2);
  // The feed is a rolling fifteen days. Anything outside that is a parse bug.
  const today = localDate(ctx.now);
  assertWindow(id, screenings, shiftDate(today, -3), shiftDate(today, 21));

  if (reviewFlags) {
    notes.push(
      `${reviewFlags} rows mention a presenter or partner in the description; ` +
      'those are sponsors as often as programmers and are left for a human'
    );
  }

  return {
    screenings, venues,
    stats: {
      raw: rows.length, kept: screenings.length, droppedNoTime,
      distinctVenues: new Set(screenings.map((s) => s.venue_slug)).size,
      reviewFlags,
    },
    notes,
  };
}

/**
 * "Movies Under the Stars: Shrek (2001)" -> programmer "NYC Parks Movies Under
 * the Stars", title "Shrek", year 2001. An unrecognised prefix is left alone:
 * the whole string stays as the title and the programmer falls back to NYC
 * Parks, because inventing a split is worse than not splitting.
 */
export function splitProgrammer(rawTitle) {
  for (const s of SERIES_TITLES) {
    if (s.match.test(rawTitle)) {
      return { programmer: s.programmer, title: rawTitle, series: rawTitle, year: null };
    }
  }
  const idx = rawTitle.indexOf(':');
  if (idx > 0) {
    const prefix = rawTitle.slice(0, idx).trim();
    const rest = rawTitle.slice(idx + 1).trim();
    const programmer = PROGRAMMER_BY_PREFIX[prefix.toLowerCase().replace(/\s+/g, ' ')];
    if (programmer && rest) {
      const { title, year } = pullYear(rest);
      return { programmer, title, series: prefix, year };
    }
  }
  const { title, year } = pullYear(rawTitle);
  return { programmer: DEFAULT_PROGRAMMER, title, series: null, year };
}

function pullYear(s) {
  const m = /\((\d{4})\)\s*$/.exec(s);
  if (!m) return { title: s, year: null };
  const year = Number(m[1]);
  if (year < 1880 || year > 2100) return { title: s, year: null };
  return { title: s.slice(0, m.index).trim() || s, year };
}

function parseCoords(text) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(text || ''));
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  // A pin outside the New York bounding box is a bad pin, and a bad pin sends
  // someone to the wrong place. Drop it rather than publish it.
  if (lat < 40.4 || lat > 41.1 || lon < -74.3 || lon > -73.6) return null;
  return [lat, lon];
}

function cleanLocation(text) {
  const s = tidy(text || '').replace(/\s*\(in [^)]*\)\s*$/i, '').trim();
  return s || null;
}

const firstLine = (s) => String(s || '').split(/[,(]/)[0].trim();
