#!/usr/bin/env node
// source-elevent.mjs - goelevent.com, the one genuine multi-tenant win.
//
// One GET of https://www.goelevent.com/ server-renders a directory of every
// client organisation. Each tenant's entire catalogue then lives at
// https://www.goelevent.com/{SLUG}/e/Search as HTML-escaped JSON in a
// model="..." attribute on #event-search-module. No key, no cookie, no JS.
//
// Three things this module will not do, each for a documented reason.
//
//  1. It never touches Elevent's JSON-LD. Elevent writes a 12-hour clock as
//     24-hour with no meridiem, so a 19:00 screening is published as T07:00 and
//     every evening show is twelve hours wrong. The model attribute carries
//     correct local wall-clock times and is the only thing read here.
//  2. A tenant that renders no model attribute is EMPTY, not broken. Tenants go
//     quiet between festivals. Seven of the ten NYC tenants were quiet on the
//     day this was written. Treating that as an error would make the whole
//     source fail every ordinary week.
//  3. It never publishes a non-film event. Scandinavia House sells concerts,
//     book talks, workshops and children's-centre reservations through the same
//     tenant as its film programme. Publishing a stitching circle as a
//     one-night-only screening is a visible quality failure, so mixed-use
//     tenants must show positive film evidence before anything is listed.
//
// The venue/programmer split falls out for free and is the reason this source
// matters beyond its row count: the tenant is the PROGRAMMER (Rooftop Films)
// and Showtimes[].VenueDisplayName is the VENUE (Green-Wood Cemetery, Industry
// City, Brower Park). PROGRAMMERS.md asks for exactly that, and Elevent is one
// of only two sources in the project that hands it over as two fields.

import {
  fetchText, htmlUnescape, tidy, slugify, localStamp, dateOnly, timeOfDay,
  assertParsedTimes,
} from './common.mjs';

export const id = 'elevent';
export const label = 'Elevent (goelevent.com)';
export const credit = null;

const BASE = 'https://www.goelevent.com';

// ---------------------------------------------------------------------------
// Config. Extend these, not the code.
// ---------------------------------------------------------------------------

/**
 * NYC-area tenants we collect.
 *
 *   mode 'film-org'  the whole tenant is a film organisation. Take everything
 *                    except what the deny rules reject.
 *   mode 'mixed'     the tenant also sells non-film programming. Take nothing
 *                    without positive film evidence.
 *
 * Confirm additions against the live directory (`--list-tenants`) rather than
 * trusting this list; Elevent's roster changes.
 */
export const TENANTS = [
  { slug: 'maysles', mode: 'film-org', programmer: 'Maysles Documentary Center' },
  { slug: 'RooftopFilms', mode: 'film-org', programmer: 'Rooftop Films' },
  { slug: 'ScandinaviaHouse', mode: 'mixed', programmer: 'Scandinavia House' },
  { slug: 'NYICFF', mode: 'film-org', programmer: "New York International Children's Film Festival" },
  { slug: 'aaiff', mode: 'film-org', programmer: 'Asian American International Film Festival' },
  { slug: 'CineKink', mode: 'film-org', programmer: 'CineKink' },
  { slug: 'NewFest', mode: 'film-org', programmer: 'NewFest' },
  { slug: 'HellenicFilmSociety', mode: 'film-org', programmer: 'Hellenic Film Society USA' },
  { slug: 'Pipeline', mode: 'film-org', programmer: 'Pipeline Artists' },
  { slug: 'TheActorsStudio', mode: 'film-org', programmer: "The Actors Studio" },
];

/** Event-type names that are never a screening, whatever the tenant. */
const DENY_TYPE = /(workshop|panel|book talk|class|lecture|reception|gala|party|tour|reservations?|children's\s+center|concert|conversation series|fundrais)/i;

/** Titles that are never a screening even at a film organisation. */
const DENY_TITLE = /(treasure hunt|stitching circle|basket weaving|curator walkthrough|artist talk|book talk|reservations|membership|donation|gift card|workshop|masterclass|trivia|karaoke)/i;

/** Positive film evidence, required for a mixed-use tenant. */
const FILM_TYPE = /(film|screening|cinema|movie|shorts|documentary|premiere|matinee|opening night|closing night)/i;
const FILM_TITLE = /\b(film|films|cinema|screening|screenings|movie|movies|shorts|doc|documentary|premiere|double feature|retrospective)\b/i;

// ---------------------------------------------------------------------------

/** Pull and decode the model attribute. Returns null when the tenant is quiet. */
export function parseModel(html) {
  const tag = /<[^>]*\bid="event-search-module"[^>]*>/i.exec(html);
  if (!tag) return null;
  const attr = /\bmodel="([^"]*)"/i.exec(tag[0]);
  if (!attr) return null;
  const json = htmlUnescape(attr[1]);
  try {
    return JSON.parse(json);
  } catch (err) {
    // A model attribute that is present and unparseable IS an error: the page
    // shape changed. Only an absent attribute means "nothing on sale".
    throw new Error(`elevent: model attribute present but unparseable: ${err.message}`);
  }
}

/** Every tenant slug the directory mentions, from any /{SLUG}/... link. */
export function parseDirectory(html) {
  const slugs = new Set();
  for (const m of html.matchAll(/location\.href\s*=\s*'\/([A-Za-z0-9_-]{2,60})\//g)) {
    slugs.add(m[1]);
  }
  return [...slugs].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
}

function isScreening(tenant, event, typeName) {
  const title = event.EventName || '';
  if (DENY_TITLE.test(title)) return false;
  if (typeName && DENY_TYPE.test(typeName)) return false;

  if (tenant.mode === 'mixed') {
    // Positive evidence only. Untyped events at a mixed venue are not assumed
    // to be films just because the venue also shows films.
    return Boolean((typeName && FILM_TYPE.test(typeName)) || FILM_TITLE.test(title));
  }
  // film-org: an untyped event with no runtime at all is not confirmable as a
  // screening (this is what "Rooftop Treasure Hunt" looks like).
  if (!typeName && !(event.LengthInMinutes > 0)) return false;
  return true;
}

export async function collect(ctx) {
  const notes = [];
  const dir = await fetchText(`${BASE}/`, {
    cache: ctx.cache, expect: /text\/html/i, accept: 'text/html,*/*',
  });
  const directory = parseDirectory(dir.body);
  if (directory.length < 10) {
    throw new Error(
      `elevent: directory listed only ${directory.length} tenants. ` +
      'The homepage markup has changed; refusing to trust the roster.'
    );
  }

  const known = new Set(TENANTS.map((t) => t.slug.toLowerCase()));
  const unknown = directory.filter((s) => !known.has(s.toLowerCase()));
  ctx.report('directory', `${directory.length} tenants listed, ${TENANTS.length} on the NYC allowlist`);

  const screenings = [];
  const venues = [];
  const tenantCounts = {};
  let rawCount = 0;
  let droppedNoTime = 0;
  let filtered = 0;

  for (const tenant of TENANTS) {
    if (!directory.some((s) => s.toLowerCase() === tenant.slug.toLowerCase())) {
      notes.push(`tenant "${tenant.slug}" is on the allowlist but absent from the live directory`);
    }
    const url = `${BASE}/${tenant.slug}/e/Search`;
    const res = await fetchText(url, {
      cache: ctx.cache, expect: /text\/html/i, accept: 'text/html,*/*',
    });
    const model = parseModel(res.body);
    if (!model) {
      tenantCounts[tenant.slug] = 0;
      continue; // quiet tenant, not a failure
    }

    const typeNames = new Map(
      (model.EventTypes || []).map((t) => [t.EventTypeId, tidy(t.Name || t.DisplayName || '')])
    );
    const events = new Map((model.Events || []).map((e) => [e.EventId, e]));
    const venueUrls = new Map(
      (model.AvailableVenues || []).map((v) => [v.VenueId, v.Url ? String(v.Url) : null])
    );
    const programmer = tenant.programmer || tidy(model.ClientName || tenant.slug);

    let kept = 0;
    for (const st of model.Showtimes || []) {
      rawCount++;
      if (st.IsOnSale === false && st.IsSoldOut !== true) {
        // Not yet on sale. The showtime is real but the tenant is not
        // advertising it; skip rather than publish something unbookable.
        filtered++;
        continue;
      }
      const event = events.get(st.EventId) || {};
      // The Showtime's own EventTypeId is 0 on a large share of rows; the Event
      // record carries the real one. Join, do not trust the denormalised copy.
      const typeId = event.EventTypeId || st.EventTypeId || 0;
      const typeName = typeNames.get(typeId) || null;

      const merged = { ...event, EventName: st.EventName || event.EventName };
      if (!isScreening(tenant, merged, typeName)) { filtered++; continue; }

      // model carries correct local wall-clock times. Never the JSON-LD.
      const d = dateOnly(st.StartDateTime);
      const t = timeOfDay(st.StartDateTime);
      const start = d && t ? localStamp(d, t.hour, t.minute) : null;
      if (!start) { droppedNoTime++; continue; }

      const ed = dateOnly(st.EndDateTime);
      const et = timeOfDay(st.EndDateTime);
      const end = ed && et ? localStamp(ed, et.hour, et.minute) : null;

      const venueName = tidy(st.VenueDisplayName || '') || programmer;
      const venueSlug = slugify(venueName);
      venues.push({
        slug: venueSlug,
        name: venueName,
        url: normaliseVenueUrl(venueUrls.get(st.VenueId)),
      });

      const eventPath = event.EventUrl ? String(event.EventUrl).replace(/^\/+/, '') : null;
      const runtime = Number(event.LengthInMinutes) > 0 ? Number(event.LengthInMinutes) : null;

      screenings.push({
        venue_slug: venueSlug,
        programmer: programmer === venueName ? null : programmer,
        title: tidy(st.EventName || event.EventName || ''),
        year: yearOf(event.ReleaseYear),
        director: tidy(event.DirectorString || '') || null,
        runtime_min: runtime,
        start_local: start,
        end_local: end && end > start ? end : null,
        url: eventPath ? `${BASE}/${eventPath}` : `${BASE}/${tenant.slug}/e/Search`,
        format: null,
        series: null,
        note: null,
        source: id,
      });
      kept++;
    }
    tenantCounts[tenant.slug] = kept;
  }

  assertParsedTimes(id, rawCount, screenings, droppedNoTime);

  return {
    screenings,
    venues,
    stats: {
      raw: rawCount, kept: screenings.length, filtered, droppedNoTime,
      tenants: tenantCounts,
      directorySize: directory.length,
      unknownTenants: unknown.length,
    },
    notes,
  };
}

function yearOf(v) {
  const n = Number(String(v || '').trim());
  return Number.isInteger(n) && n >= 1880 && n <= 2100 ? n : null;
}

function normaliseVenueUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return `https://${s}`;
  return null;
}
