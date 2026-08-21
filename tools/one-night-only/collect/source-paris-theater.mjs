#!/usr/bin/env node
// source-paris-theater.mjs - The Paris Theater, the seed venue.
//
// The Paris is the venue this whole project started from, it is a Netflix-run
// single-screen 1948 landmark, and it is covered by nothing: absent from
// repertory.nyc's registry, absent from every platform parser, and its
// ticketing subdomain (tickets.paristheaternyc.com, Vista) answers a blanket
// Cloudflare 403 to anything that is not a browser.
//
// We do not fight that. No headless browser, no proxy, no spoofed User-Agent.
// Cloudflare's 403 is an enforceable statement of intent and BRIEF.md says to
// respect it.
//
// What is collectable politely, and what this module actually reads:
//
//   www.paristheaternyc.com is a Next.js App Router site. robots.txt is
//   Allow: /. The page ships its React Server Component flight payload inline
//   in self.__next_f.push([1,"..."]) chunks, and inside that payload is the
//   site's Strapi CMS response, server-rendered, no JavaScript required. It
//   carries a featuredEventsData collection whose records are exactly the
//   one-night-only tier this project exists for:
//
//       EventName  "WHITE NIGHTS (1985) | Q&A with Isabella Rossellini"
//       EventDate  "2026-09-15"
//       EventTime  "6:30 PM"
//       TicketLink https://tickets.paristheaternyc.com/order/showtimes/2001-2968/seats
//
//   Five such events were present on the day this was written, running two
//   months out. That is a real collection path for a venue the research round
//   concluded needed "either a headless render or a conversation with whoever
//   runs the site for Netflix."
//
// WHAT IS STILL MISSING, stated plainly rather than papered over:
//
//   The Paris's ORDINARY daily showtimes are not here. The flight payload
//   carries a films collection with OpeningDate and ClosingDate - a run, not a
//   schedule - and the per-day times live only behind the Vista ticketing
//   subdomain. Turning a run into showtimes would mean inventing them, which
//   rule 1 forbids outright. So this source publishes the special engagements
//   and nothing else, and the site should say so.
//
//   There are no per-event pages: /events/<slug>, /film/<slug>,
//   /special-engagements/<slug> and /series-and-events/<slug> all 404, and the
//   sitemap lists eleven static pages and no event URLs. So every record links
//   to https://www.paristheaternyc.com/special-engagements, which is the
//   venue's own page for exactly this programming and is verified 200.

import {
  fetchText, tidy, localStamp, dateOnly, parseClock12, stripTags,
  assertParsedTimes,
} from './common.mjs';

export const id = 'paris-theater';
export const label = 'The Paris Theater';
export const credit = null;

const HOME = 'https://www.paristheaternyc.com/';
const LISTING = 'https://www.paristheaternyc.com/special-engagements';

export const VENUE = {
  slug: 'paris-theater',
  name: 'Paris Theater',
  address: '4 W 58th St, New York, NY 10019',
  url: 'https://www.paristheaternyc.com/',
  geo: [40.764506, -73.973914],
};

/** Reassemble the RSC flight payload from the inline push() chunks. */
export function flightBuffer(html) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)];
  let out = '';
  for (const m of chunks) {
    try { out += JSON.parse(m[1]); } catch { /* a chunk we cannot decode is skipped */ }
  }
  return out;
}

/** Brace/bracket scan that respects string literals. Returns the JSON slice. */
function scanBalanced(buf, start) {
  let depth = 0, inStr = false, esc = false;
  for (let k = start; k < buf.length; k++) {
    const c = buf[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return buf.slice(start, k + 1);
    }
  }
  return null;
}

/** Every distinct {"EventName":...} object in the payload. */
export function parseEvents(buf) {
  const out = [];
  const seen = new Set();
  const re = /\{"EventName":/g;
  let m;
  while ((m = re.exec(buf)) !== null) {
    const slice = scanBalanced(buf, m.index);
    if (!slice) continue;
    let obj;
    try { obj = JSON.parse(slice); } catch { continue; }
    const key = `${obj.EventName}|${obj.EventDate}|${obj.EventTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(obj);
  }
  return out;
}

export async function collect(ctx) {
  const notes = [];
  const res = await fetchText(HOME, {
    cache: ctx.cache, expect: /text\/html/i, accept: 'text/html,*/*',
  });
  const buf = flightBuffer(res.body);
  if (!buf) {
    throw new Error(
      'paris-theater: no RSC flight payload found in the homepage. ' +
      'The site has changed framework or gone client-only; this needs a human.'
    );
  }
  const raw = parseEvents(buf);

  const screenings = [];
  let droppedNoTime = 0;

  for (const e of raw) {
    const date = dateOnly(e.EventDate);
    // EventTime is a human 12-hour label: "7 PM", "5:45 PM", "6:30 PM".
    // parseClock12 refuses anything without a meridiem rather than guessing,
    // which is the same discipline the Elevent JSON-LD trap demands.
    const t = parseClock12(e.EventTime);
    const start = date && t ? localStamp(date, t.hour, t.minute) : null;
    if (!start) {
      droppedNoTime++;
      notes.push(`unparseable time ${JSON.stringify(e.EventTime)} for ${JSON.stringify(e.EventName)}`);
      continue;
    }

    const name = tidy(e.EventName || '');
    if (!name) continue;

    screenings.push({
      venue_slug: VENUE.slug,
      programmer: null, // the Paris programmes its own room
      title: name,
      year: yearIn(name),
      director: null,
      runtime_min: null,
      start_local: start,
      end_local: null,
      url: LISTING,
      format: /\b70\s?mm\b/i.test(name) ? '70mm'
        : /\b35\s?mm\b/i.test(name) ? '35mm' : null,
      series: null,
      note: shortDetail(e.EventDetails),
      source: id,
      source_ref: e.Slug ? String(e.Slug) : null,
    });
  }

  assertParsedTimes(id, raw.length, screenings, droppedNoTime);
  notes.push('daily repertory showtimes are NOT collected: they live only behind ' +
    'the Cloudflare-protected Vista ticketing subdomain. Special engagements only.');

  return {
    screenings,
    venues: [VENUE],
    stats: { raw: raw.length, kept: screenings.length, droppedNoTime },
    notes,
  };
}

function yearIn(name) {
  const m = /\((\d{4})\)/.exec(name);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1880 && y <= 2100 ? y : null;
}

/** EventDetails is sometimes a price ("$26") and sometimes a block of HTML. */
function shortDetail(v) {
  const s = tidy(stripTags(String(v || '')));
  if (!s) return null;
  if (s.length > 200) return null; // a synopsis, not a note; leave it out
  return s;
}
