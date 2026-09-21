#!/usr/bin/env node
// source-rooftop.mjs - Rooftop Cinema Club, Midtown.
//
// Their only New York room: a third-floor terrace on 37th Street, open in
// season. robots.txt disallows /cdn-cgi/ and nothing else, and the listing
// pages are server-rendered, so this is a plain fetch and a parse.
//
// The shape of the fetch is the whole design decision here. There is no API and
// no feed. Three ways in were measured:
//
//   the venue page                  1 request,  about a week
//   the sitemap, then each screening  151 requests, the whole season
//   /screenings?date=YYYY-MM-DD     1 request per day, the whole season
//
// The third wins because the day page already carries the title, the time and
// the link, so the per-screening pages are never needed. It walks forward from
// today and stops after a fortnight of empty days, which is how the end of the
// season announces itself: this is an outdoor cinema and there is no programme
// in January. A hard cap backs that up in case an empty day ever means
// something else.
//
// What it does not carry: the day page has no runtime and no year. Both live on
// the individual screening page, and fetching 118 of those to fill two optional
// fields is not a trade worth making. The catalog recovers the years it can.

import {
  fetchText,
  tidy,
  htmlUnescape,
  localDate,
  shiftDate,
  localStamp,
  parseClock12,
  assertParsedTimes,
} from './common.mjs';

export const id = 'rooftop';
export const label = 'Rooftop Cinema Club';
export const credit = null;

// Shown on sources.html. Exported here rather than kept in a list somewhere
// else so a source cannot be wired in without saying what it is, and cannot
// be removed while still being advertised.
export const profile = {
  name: "Rooftop Cinema Club",
  url: "https://rooftopcinemaclub.com/us/new-york/midtown",
  covers:
    "Their Midtown terrace, in season. Outdoor, and digital, so no format is ever claimed.",
};

const DAY_URL = (ymd) =>
  `https://rooftopcinemaclub.com/us/new-york/midtown/screenings?date=${ymd}`;

/** How far ahead to look at all. */
const MAX_DAYS = 120;
/** Consecutive empty days that mean the season is over rather than quiet. */
const EMPTY_RUN = 14;

export const VENUE = {
  slug: 'rooftop-cinema-club-midtown',
  name: 'Rooftop Cinema Club Midtown',
  address: '60 W 37th St, New York, NY 10018',
  url: 'https://rooftopcinemaclub.com/us/new-york/midtown',
  geo: [40.750836, -73.985859],
};

const SCREENING_HREF = /\/us\/new-york\/midtown\/screenings\/([a-z0-9-]+)/gi;

/** A year stated in the title, e.g. "Halloween (1978)". Recovers the ones the
 *  programmer bothered to disambiguate and leaves the rest to the catalog,
 *  rather than inventing one. */
function yearIn(title) {
  const m = String(title || '').match(/\((19|20)\d{2}\)/);
  return m ? Number(m[0].slice(1, 5)) : null;
}

/**
 * One card per screening.
 *
 * Two layouts have to survive here, because the same card is marked up
 * differently on the day page and on the venue page:
 *
 *   day page    <h3><a href="...">Pride &amp; Prejudice</a></h3>
 *   venue page  <a href="..."><img ...></a> ... <h3>Pride &amp; Prejudice</h3>
 *
 * The first version of this only handled the second, matched nothing on the
 * page it actually fetches, and reported a cheerful zero. So: find the title in
 * the link text when it is there, fall back to the nearest heading when it is
 * not, and take the window from a little BEFORE the href so an enclosing tag is
 * inside it either way.
 *
 * Split on the href rather than a class name: the markup is Tailwind, so every
 * class is a paragraph of utilities that churns the first time someone nudges a
 * margin. The link is the stable thing on the page.
 */
const CTA = /^(get info|book now|buy tickets|more info|NR|G|PG|PG-13|R)$/i;
// Badges live in headings too, and a heading that is only badges is not a
// title. "Sold Out 16+" got as far as being emitted as a film once.
// No trailing \b: "16+" ends in a non-word character, so a boundary after
// it never matches and the badge survived the strip.
const BADGE = /(\bsold\s*out\b|\b\d+\+|\bfamily[- ]friendly\b)/gi;

const textOf = (frag) => tidy(htmlUnescape(String(frag).replace(/<[^>]*>/g, ' ')));

/** True when the text carries nothing but calls to action and badges. */
function notATitle(t) {
  if (!t || CTA.test(t)) return true;
  return tidy(t.replace(BADGE, '')) === '';
}

export function parseDay(html) {
  const out = [];
  const marks = [...html.matchAll(SCREENING_HREF)];
  if (marks.length === 0) return out;

  // First occurrence of each slug, in document order.
  const firsts = [];
  const seen = new Set();
  for (const m of marks) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    firsts.push({ slug: m[1], at: m.index });
  }

  const LOOKBEHIND = 400;
  for (let i = 0; i < firsts.length; i++) {
    const { slug, at } = firsts[i];
    const from = Math.max(0, at - LOOKBEHIND);
    const to = i + 1 < firsts.length
      ? Math.max(from + 1, firsts[i + 1].at - LOOKBEHIND)
      : Math.min(html.length, at + 4000);
    const block = html.slice(from, to);

    // Anchor text for this screening, if the link wraps the title.
    let title = null;
    const anchors = [...block.matchAll(/<a[^>]*href="[^"]*\/screenings\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const a of anchors) {
      if (a[1] !== slug) continue;
      const t = textOf(a[2]);
      if (!notATitle(t)) { title = tidy(t.replace(BADGE, '')); break; }
    }

    // Otherwise the nearest heading that is not an age rating.
    if (!title) {
      const headings = [...block.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
        .map((m) => textOf(m[1]))
        .filter((t) => !notATitle(t))
        .map((t) => tidy(t.replace(BADGE, '')))
        .filter(Boolean);
      title = headings[0] || null;
    }

    const timeMatch = block.slice(Math.max(0, at - from)).match(/\b(\d{1,2}:\d{2}\s?(?:AM|PM))\b/i)
      || block.match(/\b(\d{1,2}:\d{2}\s?(?:AM|PM))\b/i);

    if (!title || !timeMatch) continue;
    out.push({ slug, title, time: timeMatch[1] });
  }
  return out;
}

export async function collect(ctx) {
  const notes = [];
  const screenings = [];
  const today = localDate(ctx.now);

  let emptyRun = 0;
  let daysFetched = 0;
  let droppedNoTime = 0;
  let rawCards = 0;
  let lastWithScreenings = null;

  for (let i = 0; i < MAX_DAYS && emptyRun < EMPTY_RUN; i++) {
    const ymd = shiftDate(today, i);
    const res = await fetchText(DAY_URL(ymd), {
      cache: ctx.cache, expect: /text\/html/i, accept: 'text/html,*/*',
    });
    daysFetched++;

    const cards = parseDay(res.body);
    if (cards.length === 0) { emptyRun++; continue; }
    emptyRun = 0;
    lastWithScreenings = ymd;
    rawCards += cards.length;

    for (const c of cards) {
      const t = parseClock12(c.time);
      if (!t) {
        droppedNoTime++;
        notes.push(`unparseable time ${JSON.stringify(c.time)} for ${JSON.stringify(c.title)}`);
        continue;
      }
      screenings.push({
        venue_slug: VENUE.slug,
        programmer: null,
        title: c.title,
        year: yearIn(c.title), // only when the title states it; the catalog fills the rest
        director: null,
        runtime_min: null,
        start_local: localStamp(ymd, t.hour, t.minute),
        end_local: null,
        url: `https://rooftopcinemaclub.com/us/new-york/midtown/screenings/${c.slug}`,
        // Outdoor digital projection. There is no print here and never will be,
        // so claiming one would be the same class of error as a guessed time.
        format: null,
        series: null,
        note: null,
        source: id,
        // The trailing number in the slug is the screening id and is stable.
        source_ref: c.slug,
      });
    }
  }

  assertParsedTimes(id, rawCards, screenings, droppedNoTime);

  notes.push(`walked ${daysFetched} day page(s) from ${today}` +
    (lastWithScreenings ? `, last programmed day seen ${lastWithScreenings}` : ', none programmed'));
  if (screenings.length === 0) {
    notes.push('no screenings at all: out of season is the normal reason, and the ' +
      'zero guard decides whether that is believable');
  }

  return {
    screenings,
    venues: [VENUE],
    stats: { raw: rawCards, kept: screenings.length, daysFetched, droppedNoTime },
    notes,
  };
}
