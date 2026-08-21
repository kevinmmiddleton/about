#!/usr/bin/env node
// source-luma.mjs - Luma calendars, the multi-programmer shortcut.
//
// research/programmers.md §5.1: two unauthenticated endpoints let one
// integration follow any number of programmers, and api.lu.ma/robots.txt is an
// explicit allow (`User-agent: *` / `Disallow: /insights/`, and nothing here is
// under /insights/). Eventbrite, which looks similar, is OFF LIMITS: its ToS
// §13 bans automated extraction by name.
//
// Why this source matters out of proportion to its row count:
//
//   It is the ONLY source in the project that hands over the programmer and the
//   venue as two separate structured fields. `calendar.name` (or, when a
//   programmer runs a free "Personal" calendar with no slug, our own configured
//   label) is the PROGRAMMER; `geo_address_info` is the ROOM. That is exactly
//   the split PROGRAMMERS.md asks for, and BxICC proves the point: one calendar
//   id yields eleven Bronx rooms, among them a bank branch and a photo studio,
//   which will never appear in any venue-indexed listing anywhere.
//
//   It also corrects a census error. venues-bronx.md lists Inspiration Point,
//   Scan Harbor and SoBro Garden as three separate venues whose only listing
//   URL is a Luma link. All three slugs resolve to ONE calendar, BxICC's. They
//   are three events from one programmer in three rooms, not three sources, and
//   they are collected here as one calendar id.
//
// Collect by CALENDAR ID, never by calendar page. BxICC's calendar is a
// free-plan "Personal" calendar with slug: null - there is no luma.com/<slug>
// page for it at all, and a crawler walking calendar pages would miss it
// entirely. Most small programmers look like this.
//
// One filter is required. These calendars mix screenings with industry
// programming - "Industry Panel", "Developing Your Script", "Fundraising
// Workshop", "Cinematography Workshop" are all in BxICC's set and none is a
// screening. Publishing a fundraising workshop as a one-night-only screening
// would be a visible quality failure, so the deny list is aggressive and a
// human eye is still wanted during festival weeks.
//
// Not built, deliberately:
//   * api.lu.ma/ics/get rejects every public entity id. Do not build on it.
//   * The citywide discovery sweep (discover/get-place?slug=nyc) is a weekly
//     human-reviewed queue, not a collection path: 10 film events in 467. The
//     eight calendar ids it found are seeded below, commented, for a human to
//     confirm before promotion.

import {
  fetchText, tidy, slugify, localStamp, assertParsedTimes, TZ,
} from './common.mjs';

export const id = 'luma';
export const label = 'Luma calendars (programmer tier)';
export const credit = null;

const API = 'https://api.lu.ma';

/**
 * Followed calendars. Add one line per programmer; onboarding costs one pasted
 * event link, resolved once with `--resolve-luma <slug>`.
 *
 * `programmer` is configured rather than read from calendar.name because a
 * free-plan calendar is literally named "Personal".
 */
export const CALENDARS = [
  { id: 'cal-QXGgyIP2tD9rRCc', programmer: 'Bronx Independent Cinema Center' },
  { id: 'cal-zMxTHdEeWEyojiC', programmer: 'Alcove Cinema' },
  { id: 'cal-z7oZsQiyVI0WUh7', programmer: 'Black August Movie Night' },
  // Found by the discovery sweep and NOT yet confirmed as film programmers.
  // Promote after a human looks. Leaving them off is the safe default.
  // { id: 'cal-dcwoDSFo62JDEGS', programmer: 'Unemployed Mascots' },
  // { id: 'cal-vrhuyzOA2cHnAUX', programmer: 'Better in Person' },
];

/** Industry programming, not screenings. */
const DENY_TITLE = /\b(panel|workshop|masterclass|class|seminar|fundrais\w*|mixer|networking|pitch|q\s*&\s*a session|table read|writers?'? room|developing your script|cinematography workshop|industry|meetup|office hours|open call|submission)\b/i;

/** Positive film evidence. These calendars are not exclusively film. */
const FILM_TITLE = /\b(film|films|cinema|screening|screenings|movie|movies|shorts|documentary|doc|premiere|double feature|retrospective|festival)\b/i;

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

/**
 * Luma gives an absolute UTC instant plus a separate IANA timezone. Convert to
 * a New York wall clock, which is what the whole pipeline speaks. Never read
 * the string's digits directly: they are UTC, and a 7pm Brooklyn screening is
 * published as T23:00Z.
 */
export function nyWallClock(utcIso) {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return null;
  const p = {};
  for (const part of partsFmt.formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return localStamp(`${p.year}-${p.month}-${p.day}`, Number(p.hour), Number(p.minute));
}

function streetAddress(geo, venueName) {
  let full = tidy(geo.full_address || '');
  const name = tidy(venueName);
  if (full && name && full.toLowerCase().startsWith(name.toLowerCase())) {
    full = full.slice(name.length).replace(/^\s*,\s*/, '').trim();
  }
  full = full.replace(/,\s*USA$/i, '');
  return full || tidy(geo.short_address || '') || null;
}

export async function collect(ctx) {
  const notes = [];
  const screenings = [];
  const venues = [];
  const perCalendar = {};
  let raw = 0;
  let droppedNoTime = 0;
  let filtered = 0;
  let droppedVirtual = 0;

  for (const cal of CALENDARS) {
    const url = `${API}/calendar/get-items?calendar_api_id=${encodeURIComponent(cal.id)}` +
      '&period=future&pagination_limit=50';
    const res = await fetchText(url, {
      cache: ctx.cache, expect: /application\/json/i, accept: 'application/json',
    });
    const body = JSON.parse(res.body);
    const entries = Array.isArray(body.entries) ? body.entries : [];
    let kept = 0;

    for (const entry of entries) {
      raw++;
      const e = entry.event || {};
      const name = tidy(e.name || '');
      if (!name) { filtered++; continue; }
      if (DENY_TITLE.test(name) || !FILM_TITLE.test(name)) { filtered++; continue; }
      if (e.visibility && e.visibility !== 'public') { filtered++; continue; }

      const geo = e.geo_address_info || null;
      if (e.location_type === 'online' || !geo) {
        // An online-only event is not a room you can go to.
        droppedVirtual++;
        continue;
      }

      const start = nyWallClock(e.start_at);
      if (!start) { droppedNoTime++; continue; }
      const end = e.end_at ? nyWallClock(e.end_at) : null;

      const venueName = tidy(geo.address || geo.full_address || '') ||
        tidy(geo.city_state || '');
      if (!venueName) { filtered++; continue; }

      const slug = slugify(venueName);
      venues.push({
        slug,
        name: venueName,
        // full_address repeats the venue name as its first component, and
        // build.mjs renders LOCATION as "<name>, <address>". Left alone that
        // reads "The Bronx Museum of the Arts, The Bronx Museum of the Arts,
        // 1040 Grand Concourse...". Strip the duplicated prefix.
        address: streetAddress(geo, venueName),
        geo: e.coordinate &&
          Number.isFinite(e.coordinate.latitude) && Number.isFinite(e.coordinate.longitude)
          ? [e.coordinate.latitude, e.coordinate.longitude] : null,
      });

      screenings.push({
        venue_slug: slug,
        // The whole reason this source is here.
        programmer: cal.programmer,
        title: name,
        year: null,
        director: null,
        runtime_min: null,
        start_local: start,
        end_local: end && end > start ? end : null,
        url: e.url ? `https://luma.com/${e.url}` : `https://luma.com/`,
        format: null,
        series: null,
        note: null,
        source: id,
        source_ref: e.api_id || null,
      });
      kept++;
    }
    perCalendar[cal.programmer] = kept;
  }

  assertParsedTimes(id, raw, screenings, droppedNoTime);
  notes.push(
    'title-filtered aggressively: these calendars mix screenings with industry ' +
    'programming, and a fundraising workshop published as a screening is a visible failure'
  );
  if (droppedVirtual) notes.push(`${droppedVirtual} online-only or address-less event(s) dropped`);

  return {
    screenings, venues,
    stats: {
      raw, kept: screenings.length, filtered, droppedNoTime, droppedVirtual,
      calendars: perCalendar,
    },
    notes,
  };
}
