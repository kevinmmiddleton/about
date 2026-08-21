#!/usr/bin/env node
// build.mjs - reads data/screenings.json, writes dist/index.html, dist/feed.xml,
// dist/calendar.ics. Zero dependencies.
//
// Implements output-spec.md. The rules that carry the risk, and where they live:
//
//   * UID is read from the dataset, never recomputed here. See uidOf().
//     Minting happens once, in tombstones.mjs, on first discovery.
//   * DTSTAMP / LAST-MODIFIED come from the record's stored updated_at, and
//     CREATED from created_at. No build timestamp appears anywhere in any
//     output file, so a regeneration that finds no change writes byte-identical
//     bytes and GitHub Pages keeps serving the same ETag.
//   * METHOD is deliberately omitted. RFC 5545 3.8.7.2 then makes DTSTAMP mean
//     "when this event last changed", which is exactly what we publish.
//   * Cancellations are tombstones, not deletions: same UID, STATUS:CANCELLED,
//     SEQUENCE incremented, SUMMARY prefixed with "CANCELLED: ".
//   * VEVENTs are sorted ascending by start. calendar-limits.md documents a
//     Google subscribe-by-URL bug that truncates by position in the file, so
//     the events that survive truncation must be the soonest ones.
//   * calendar.ics and feed.xml carry only screenings the collector marked BOTH
//     `limited` and `vintage`. index.html carries everything and says which is
//     which, with a checkbox for each subset. Both flags are READ, never
//     computed here; see qualifies().
//   * Source credits are read from sources.json next to the dataset and
//     rendered in the HTML, the ICS description and the RSS channel
//     description. repertory.nyc is owed them.
//
// Usage:
//   node build.mjs [--data <path>] [--out <dir>]
//
// Env:
//   NABE_NOW   ISO 8601 instant used as "now". Test hook only. Pin it to make
//              window boundaries deterministic across runs.

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { neighborhoodOf } from './collect/venue-book.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration. Everything user-facing that names the project lives here.
// ---------------------------------------------------------------------------

const CONFIG = {
  // The published home of the subsite. One trailing slash, absolute, final.
  // Never route the feed through a redirect or a shortener.
  siteBase: 'https://middleton.io/one-night-only/',

  productName: 'One Night Only',
  calendarDescription: 'One-night-only film screenings and revivals in New York City.',

  // A screening qualifies for the calendar and the feed if its film plays this
  // many distinct dates or fewer at that venue, or on `seriesMaxDates` dates
  // with no more than one showtime on any of them. These numbers are here for
  // the reader-facing copy only. The decision itself is made once in the
  // collector and stored on the record; nothing downstream recomputes it.
  limitedMaxDates: 2,
  seriesMaxDates: 3,

  // The vintage rule's age threshold, mirrored from GUARD.vintageMinAgeYears in
  // collect/collect.mjs. Same standing as the two numbers above: HERE FOR THE
  // READER-FACING COPY ONLY. The decision is made once in the collector and
  // stored on the record as `vintage`, and nothing downstream recomputes it. If
  // the two ever drift, the checkbox label is wrong and the listings are still
  // right, which is the correct way round for a duplicated constant.
  vintageMinAgeYears: 2,

  // PRODID must be globally unique to this software and must NOT carry a
  // version number that changes per build; that would break byte stability.
  prodId: '-//middleton.io//One Night Only//EN',
  generator: 'one-night-only',

  // Identity constants. These are load-bearing and must never change.
  //
  // uidDomain: the right-hand side of every ICS UID. Deliberately boring and
  // decoupled from the product name. Renaming the project must not touch it,
  // because a changed UID is a permanent duplicate on every subscriber's
  // calendar and there is no way to clean it up afterwards. It does not need
  // to resolve in DNS.
  uidDomain: 'screenings.middleton.io',

  // tagYear: the RFC 4151 tag-URI date part. A constant, NOT the current year.
  // Letting this roll over on 1 January would re-notify every subscriber.
  tagAuthority: 'middleton.io',
  tagYear: '2026',

  tz: 'America/New_York',

  // Windows.
  icsForwardDays: 183,       // roughly 6 months, the reported client truncation horizon
  tombstoneRetentionDays: 30, // a tombstone must outlive the slowest subscriber refresh
  icsMaxEvents: 1000,        // safety valve; a breach is a bug to investigate
  rssForwardDays: 60,
  rssMaxItems: 50,
  rssTombstoneDays: 7,

  // Hard budget. calendar-limits.md: Google's only documented cap is a 1 MB
  // *import* limit, and subscribe-by-URL truncates silently. Stay well under.
  maxIcsBytes: 900 * 1024,

  defaultRuntimeMinutes: 120, // used only when the runtime is genuinely unknown
  trailerPaddingMinutes: 15,
};

// The VTIMEZONE block is a hardcoded golden constant. Do not compute it, do not
// fetch it. A typo here silently shifts every showtime and no validator or
// parser will tell you: changing TZOFFSETTO:-0400 to -0700 in testing moved the
// resolved UTC instant by three hours with zero complaints.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'X-LIC-LOCATION:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZNAME:EDT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZNAME:EST',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const DAY_MS = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------------------------------------------------------------------------
// Local time. Zero dependencies, so America/New_York arithmetic goes through
// Intl.DateTimeFormat, which is the only tz database Node ships.
// ---------------------------------------------------------------------------

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: CONFIG.tz,
  hourCycle: 'h23', // explicitly h23: some ICU builds render midnight as hour 24 under hour12:false
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function zonedParts(date) {
  const out = {};
  for (const p of partsFmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

// Offset of the zone from UTC, in milliseconds, at a given absolute instant.
function zoneOffsetMs(date) {
  const p = zonedParts(date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

// Parse "YYYY-MM-DDTHH:MM[:SS]" as a wall clock in America/New_York and return
// the absolute instant. Two passes: guess with the offset at the naive instant,
// then correct with the offset at the guessed instant. This is exact except
// inside the one repeated hour of a fall-back transition, where it resolves to
// the first occurrence, which is what RFC 5545 also prescribes for TZID.
function localToInstant(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) throw new Error(`bad local timestamp: ${JSON.stringify(local)}`);
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  let guess = naive - zoneOffsetMs(new Date(naive));
  guess = naive - zoneOffsetMs(new Date(guess));
  return new Date(guess);
}

// Wall-clock arithmetic on a local timestamp string. Adding 120 minutes to
// 23:50 gives 01:50 the next day, which is what a midnight show needs, and it
// stays wall-clock across a DST boundary rather than drifting by an hour.
function addLocalMinutes(local, minutes) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) throw new Error(`bad local timestamp: ${JSON.stringify(local)}`);
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi + minutes, s || 0));
  return [
    String(t.getUTCFullYear()).padStart(4, '0'), '-',
    pad2(t.getUTCMonth() + 1), '-', pad2(t.getUTCDate()), 'T',
    pad2(t.getUTCHours()), ':', pad2(t.getUTCMinutes()), ':', pad2(t.getUTCSeconds()),
  ].join('');
}

const pad2 = (n) => String(n).padStart(2, '0');

// "2026-09-04T19:30:00" -> "20260904T193000"
function icsLocal(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) throw new Error(`bad local timestamp: ${JSON.stringify(local)}`);
  const [, y, mo, d, h, mi, s] = m;
  return `${y}${mo}${d}T${h}${mi}${s || '00'}`;
}

// "2026-08-12T14:00:00Z" -> "20260812T140000Z". UTC only, no TZID, per spec 1.7.
function icsUtc(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`bad UTC timestamp: ${JSON.stringify(iso)}`);
  return [
    d.getUTCFullYear(), pad2(d.getUTCMonth() + 1), pad2(d.getUTCDate()), 'T',
    pad2(d.getUTCHours()), pad2(d.getUTCMinutes()), pad2(d.getUTCSeconds()), 'Z',
  ].join('');
}

// RFC 822 with a four-digit year, per the RSS 2.0 amendment.
// Always +0000: the RSS Best Practices Profile found only +0000, -0000 and GMT
// worked across all 18 aggregators tested. The reader-facing showtime lives in
// the title and description, so there is nothing to gain from an Eastern offset.
// The weekday is derived, never hardcoded: a wrong one is a hard validator error.
function rfc822(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`bad timestamp: ${JSON.stringify(iso)}`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ` +
    `${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:` +
    `${pad2(d.getUTCSeconds())} +0000`;
}

// ISO 8601 with a real offset, for schema.org startDate: 2026-09-04T19:30:00-04:00
function isoWithOffset(local) {
  const instant = localToInstant(local);
  const offMin = zoneOffsetMs(instant) / 60000;
  const sign = offMin < 0 ? '-' : '+';
  const abs = Math.abs(offMin);
  return `${normalizeLocal(local)}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

function normalizeLocal(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s || '00'}`;
}

function localFields(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local);
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
}

function weekdayIndex(local) {
  const f = localFields(local);
  return new Date(Date.UTC(f.y, f.mo - 1, f.d)).getUTCDay();
}

function clockLabel(local) {
  const { h, mi } = localFields(local);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad2(mi)} ${suffix}`;
}

// "Fri Sep 4"
function shortDateLabel(local) {
  const f = localFields(local);
  return `${WEEKDAYS[weekdayIndex(local)]} ${MONTHS[f.mo - 1]} ${f.d}`;
}

// "Friday, September 4, 2026"
function longDateLabel(local) {
  const f = localFields(local);
  return `${WEEKDAYS_LONG[weekdayIndex(local)]}, ${MONTHS_LONG[f.mo - 1]} ${f.d}, ${f.y}`;
}

const localDateKey = (local) => normalizeLocal(local).slice(0, 10);

// ---------------------------------------------------------------------------
// ICS text mechanics: strip, escape, fold. Order matters everywhere here.
// ---------------------------------------------------------------------------

// Scraped venue copy contains control characters. Strip everything below 0x20
// except the newlines we are about to convert, plus DEL.
function stripControl(s) {
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

// TEXT escaping, RFC 5545 3.3.11. Backslash MUST be first or you double-escape
// the escapes you just inserted.
//
// Deliberately NOT escaped, because the `text` production admits them and
// escaping them leaves visible junk like `7\:30` and broken ticket URLs:
//   :  colon        "  double quote
// And this is not XML, so no &amp; and no &#39; anywhere.
function escText(s) {
  return stripControl(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// URI-valued properties (URL, SOURCE) take a URI, not TEXT. A URL containing a
// comma or a semicolon goes in raw; escaping it corrupts the link.
function escUri(s) {
  return stripControl(s);
}

// CATEGORIES is a comma-separated list. The separating commas are structural
// and stay bare; a comma inside one category value must be escaped. So escape
// each member individually, then join with an unescaped comma.
function escCategories(list) {
  return list.filter(Boolean).map(escText).join(',');
}

// Fold at 75 octets, RFC 5545 3.1. Three traps, all handled here:
//   1. Measure octets, not characters. An accented venue name or a Japanese
//      title costs more octets than characters.
//   2. The continuation line's leading space counts toward its 75 octets, so
//      the first line takes 75 and every continuation takes 74.
//   3. Never split inside a UTF-8 multi-octet sequence. After choosing a split
//      point, walk back over continuation bytes (b & 0xC0) === 0x80.
//
// Folding runs LAST, on the fully assembled and escaped line including the
// property name and parameters. Never fold a value and then prepend a name.
function fold(line) {
  const buf = Buffer.from(line, 'utf8');
  if (buf.length <= 75) return line;

  const pieces = [];
  let start = 0;
  let limit = 75;
  while (start < buf.length) {
    let end = Math.min(start + limit, buf.length);
    if (end < buf.length) {
      while (end > start && (buf[end] & 0xc0) === 0x80) end--;
    }
    pieces.push(buf.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuations pay one octet for the leading space
  }
  return pieces.join('\r\n ');
}

// ---------------------------------------------------------------------------
// Dataset access
// ---------------------------------------------------------------------------

function loadDataset(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const venues = raw.venues || {};
  const screenings = raw.screenings || [];
  for (const s of screenings) {
    if (!s.uid) {
      throw new Error(
        `screening has no stored uid: ${JSON.stringify(s.title || s)}\n` +
        '  UIDs are minted once, on first discovery, by tombstones.mjs.\n' +
        '  build.mjs must never compute one, because a recomputed UID that\n' +
        '  differs from the published one duplicates the event permanently.'
      );
    }
    if (!venues[s.venue_slug]) {
      throw new Error(`screening ${s.uid} references unknown venue_slug "${s.venue_slug}"`);
    }
  }
  return { venues, screenings };
}

// The stored UID, always. Never recomputed.
const uidOf = (s) => s.uid;

// The 16 hex characters shared by the ICS UID, the RSS guid and the HTML
// anchor. One identity function, three outputs.
const hashOf = (s) => s.hash || String(s.uid).split('@')[0];

const guidOf = (s) =>
  s.guid || `tag:${CONFIG.tagAuthority},${CONFIG.tagYear}:screening/${hashOf(s)}`;

// The two publication filters, READ from the record. The collector computes
// both once over the whole collection and stores them; this layer never
// recomputes either, for the same reason it never recomputes a UID. See
// build/collect/collect.mjs, assignLimited() and assignVintage().
//
//   isLimited  the film plays few enough dates at that venue to be a one-off
//              rather than a run
//   isVintage  the film is old enough to be a revival rather than a first run
//
// A screening reaches calendar.ics and feed.xml only if BOTH are true. Those
// are the two surfaces where somebody asked to be told, and the promise made
// there is "an old film, showing once". index.html carries everything.
//
// Every test is `!== false`, not `=== true`, on purpose, and the two fields
// carry that default for different reasons that happen to point the same way.
// For `limited`: a missing field means the calendar publishes too much, the
// 1000-event cap warns, and a human looks, whereas the other way round an empty
// calendar cancels every screening on every subscriber's calendar. For
// `vintage`: the collector already writes `true` for a film whose year it could
// not establish, so `!== false` here means a record that predates the vintage
// rule entirely is treated the same as one the rule could not classify. Both
// are published and neither is a silent deletion. When one of two failure modes
// is unrecoverable, default towards the other one.
const isLimited = (s) => s.limited !== false;
const isVintage = (s) => s.vintage !== false;
const qualifies = (s) => isLimited(s) && isVintage(s);

// True when the collector published this record without being able to check its
// year. Rendered as an explicit "Year unknown" so an unverified listing is never
// mistaken for a checked claim.
const yearUnverified = (s) => s.vintage !== false && s.vintage_year == null;

// "One night only" / "Two dates only" / null. Derived from the stored count, so
// a record that predates the filter carries no claim rather than a wrong one.
function limitedLabel(s) {
  if (s.dates_at_venue === 1) return 'One night only';
  if (s.dates_at_venue === 2) return 'Two dates only';
  // Three dates qualifies only via the series clause, which requires a single
  // showtime on each. Read from the stored count, so a record collected before
  // the amendment carries no claim rather than a wrong one.
  if (s.dates_at_venue === 3 && s.max_showtimes_per_date === 1) return 'Three dates only';
  return null;
}

// ---------------------------------------------------------------------------
// Source credits
//
// data/sources.json is written by the collector from each source module's
// `credit` export. repertory.nyc's robots.txt explicitly permits us and their
// data is a large share of this site, so the credit is an obligation. It is
// rendered in three places: the HTML, the ICS calendar description, and the RSS
// channel description.
// ---------------------------------------------------------------------------

function loadCredits(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return []; // no credits file (the fixtures have none) is not an error
  }
  return (raw.credits || []).filter((c) => c && c.name && c.url);
}

// "Listings include data from repertory.nyc (https://www.repertory.nyc/) and
//  NYC Open Data (https://data.cityofnewyork.us/d/w3wp-dpdi)."
// One flat sentence. It has to survive being read aloud by a calendar client
// that renders no markup at all.
function creditSentence(credits) {
  if (!credits.length) return '';
  const parts = credits.map((c) => `${c.name} (${c.url})`);
  const list = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Listings include data from ${list}.`;
}

function describedCalendar(credits) {
  const credit = creditSentence(credits);
  return credit ? `${CONFIG.calendarDescription} ${credit}` : CONFIG.calendarDescription;
}

function endLocalOf(s) {
  if (s.end_local) return normalizeLocal(s.end_local);
  // DTEND is required in practice. An event with neither DTEND nor DURATION is
  // defined as zero-length and renders as a bare point, which looks broken.
  // With a known runtime, add 15 minutes for trailers and an introduction.
  // Without one, use a flat two hours and do not pretend otherwise.
  const minutes = s.runtime_min
    ? s.runtime_min + CONFIG.trailerPaddingMinutes
    : CONFIG.defaultRuntimeMinutes;
  return addLocalMinutes(s.start_local, minutes);
}

function summaryOf(s) {
  const base = s.year ? `${s.title} (${s.year})` : s.title;
  return `${base} at ${s.venue_name}`;
}

function descriptionLines(s) {
  const bits = [];
  if (s.format) bits.push(s.format);
  if (s.director) bits.push(`Dir. ${s.director}`);
  if (s.runtime_min) bits.push(`${s.runtime_min} min`);
  const parts = [];
  if (bits.length) parts.push(bits.join('. ') + '.');
  if (s.series) parts.push(`Part of ${s.series}.`);
  if (s.note) parts.push(s.note);
  const head = parts.join(' ');
  return s.url ? `${head}\n\nTickets: ${s.url}` : head;
}

// Hydrate a raw record with its venue and the derived fields the renderers use.
function hydrate(s, venues) {
  const v = venues[s.venue_slug];
  const start_local = normalizeLocal(s.start_local);
  const rec = {
    ...s,
    start_local,
    end_local: endLocalOf({ ...s, start_local }),
    venue_name: v.name,
    venue_address: v.address,
    venue_url: v.url,
    venue_geo: v.geo || null,
    status: (s.status || 'confirmed').toLowerCase(),
    sequence: Number.isInteger(s.sequence) ? s.sequence : 0,
  };
  rec.start_instant = localToInstant(rec.start_local);
  rec.end_instant = localToInstant(rec.end_local);
  return rec;
}

// ---------------------------------------------------------------------------
// ICS
// ---------------------------------------------------------------------------

// The VEVENT body with the three timestamp lines omitted. This is the string
// tombstones.mjs hashes to decide whether updated_at should advance, so that a
// rebuild which changes nothing leaves every DTSTAMP alone.
export function renderEventBody(rec) {
  const cancelled = rec.status === 'cancelled';
  const lines = [];
  const p = (name, value) => lines.push(`${name}:${value}`);

  p('UID', escText(uidOf(rec)));
  p(`DTSTART;TZID=${CONFIG.tz}`, icsLocal(rec.start_local));
  p(`DTEND;TZID=${CONFIG.tz}`, icsLocal(rec.end_local));

  // Prefix CANCELLED even though STATUS says so. Client behaviour varies: Apple
  // strikes through, Google often just hides. The prefix guarantees the user
  // sees the truth on a client that ignores STATUS. Never rely on STATUS alone.
  let summary = summaryOf(rec);
  if (cancelled) {
    summary = `CANCELLED: ${summary}` + (rec.cancel_reason ? ` (${rec.cancel_reason})` : '');
  }
  p('SUMMARY', escText(summary));

  p('LOCATION', escText(`${rec.venue_name}, ${rec.venue_address}`));

  // GEO only with real coordinates. A wrong GEO sends someone to the wrong
  // place, which the brief forbids outright.
  if (Array.isArray(rec.venue_geo) && rec.venue_geo.length === 2) {
    const [lat, lon] = rec.venue_geo;
    p('GEO', `${round6(lat)};${round6(lon)}`);
  }

  const desc = descriptionLines(rec);
  if (desc) p('DESCRIPTION', escText(desc));
  if (rec.url) p('URL', escUri(rec.url));

  p('CATEGORIES', escCategories(['Film', 'Repertory', rec.venue_name, rec.format]));

  const status = cancelled ? 'CANCELLED' : (rec.status === 'tentative' ? 'TENTATIVE' : 'CONFIRMED');
  p('STATUS', status);
  p('SEQUENCE', String(rec.sequence));
  p('TRANSP', 'OPAQUE');

  // No ORGANIZER and no ATTENDEE: they turn a published event into a scheduling
  // object and can trigger RSVP UI and email traffic.
  // No VALARM: alarming somebody's phone is the subscriber's call, not ours.
  return lines;
}

const round6 = (n) => String(Number(Number(n).toFixed(6)));

function renderEvent(rec) {
  const body = renderEventBody(rec);
  const stamp = icsUtc(rec.updated_at || rec.created_at);
  const out = ['BEGIN:VEVENT'];
  // UID first, then the timestamps, then the rest, matching spec 1.11.
  out.push(body[0]);
  out.push(`DTSTAMP:${stamp}`);
  if (rec.created_at) out.push(`CREATED:${icsUtc(rec.created_at)}`);
  out.push(`LAST-MODIFIED:${stamp}`);
  out.push(...body.slice(1));
  out.push('END:VEVENT');
  return out;
}

function buildIcs(records, credits = []) {
  const name = CONFIG.productName;
  const description = describedCalendar(credits);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${CONFIG.prodId}`,
    'CALSCALE:GREGORIAN',
    // METHOD is omitted on purpose. See the header comment.
    `NAME:${escText(name)}`,
    `X-WR-CALNAME:${escText(name)}`,
    `DESCRIPTION:${escText(description)}`,
    `X-WR-CALDESC:${escText(description)}`,
    `X-WR-TIMEZONE:${CONFIG.tz}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', // VALUE=DURATION is required, not decoration
    'X-PUBLISHED-TTL:PT6H',
    'COLOR:darkred',
    `SOURCE;VALUE=URI:${escUri(CONFIG.siteBase + 'calendar.ics')}`,
    `URL:${escUri(CONFIG.siteBase)}`,
    // No X-WR-RELCALID: legacy, adds nothing, and if it ever changes some
    // clients treat the feed as an entirely different calendar.
    ...VTIMEZONE,
  ];

  for (const rec of records) lines.push(...renderEvent(rec));
  lines.push('END:VCALENDAR');

  // Fold last, on the final assembled bytes, then join with CRLF and terminate
  // with CRLF. Never let a template literal introduce a bare newline.
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// RSS 2.0
// ---------------------------------------------------------------------------

function xmlEscape(s) {
  return stripControl(s)
    .replace(/&/g, '&amp;')   // & first
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const xmlAttr = (s) => xmlEscape(s).replace(/"/g, '&quot;');

function itemDescription(rec) {
  // An HTML fragment that then gets XML-escaped once. Note the deliberate
  // double escape: `&amp;` written here becomes `&amp;amp;` in the file, which
  // a reader unescapes once as XML and once as HTML to get a literal `&`.
  const when = `${longDateLabel(rec.start_local)} at ${clockLabel(rec.start_local)}`;
  const parts = [
    `<p><strong>${xmlEscape(when)}</strong> at ${xmlEscape(rec.venue_name)}, ` +
    `${xmlEscape(rec.venue_address)}.</p>`,
  ];
  const body = descriptionLines({ ...rec, url: null });
  if (body) parts.push(`<p>${xmlEscape(body)}</p>`);
  if (rec.url) {
    parts.push(`<p><a href="${xmlAttr(rec.url)}">Tickets &amp; showtimes</a></p>`);
  }
  // Readers strip anything richer than p / strong / a, so we do not emit it.
  return xmlEscape(parts.join(''));
}

function renderItem(rec) {
  const hash = hashOf(rec);
  const cancelled = rec.status === 'cancelled';
  // Date-led title. It is the only field every reader renders, and in a
  // chronological list a date-led title is the only thing that reads correctly.
  let title = `${shortDateLabel(rec.start_local)}, ${clockLabel(rec.start_local)} - ${summaryOf(rec)}`;
  if (cancelled) title = `CANCELLED: ${title}`;

  const out = [
    '    <item>',
    `      <title>${xmlEscape(title)}</title>`,
    // link points at our site, deep-linked to the anchor, not at the venue.
    // The venue's ticket link lives inside the description.
    `      <link>${xmlEscape(CONFIG.siteBase)}#s-${hash}</link>`,
    // isPermaLink is written explicitly. Its default is "true", which would
    // tell readers the guid is a resolvable URL and some will fetch it.
    `      <guid isPermaLink="false">${xmlEscape(guidOf(rec))}</guid>`,
    // pubDate is the discovery timestamp, stored once and never updated. Not
    // the event date: a future-dated pubDate makes some readers hide the item
    // and others treat the whole feed as broken.
    `      <pubDate>${rfc822(rec.created_at)}</pubDate>`,
    `      <description>${itemDescription(rec)}</description>`,
  ];
  for (const cat of [rec.venue_name, rec.format].filter(Boolean)) {
    out.push(`      <category>${xmlEscape(cat)}</category>`);
  }
  out.push('    </item>');
  return out;
}

function buildRss(records, credits = []) {
  // lastBuildDate is the newest item's pubDate, never the build time, so a
  // no-op rebuild does not change a byte.
  const newest = records.reduce(
    (acc, r) => (acc === null || new Date(r.created_at) > new Date(acc) ? r.created_at : acc),
    null
  );

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>', // first line, no BOM, no leading whitespace
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xmlEscape(CONFIG.productName)}</title>`,
    `    <link>${xmlEscape(CONFIG.siteBase)}</link>`,
    `    <description>${xmlEscape(describedCalendar(credits))}</description>`,
    '    <language>en-us</language>',
  ];
  if (newest) lines.push(`    <lastBuildDate>${rfc822(newest)}</lastBuildDate>`);
  lines.push(
    `    <generator>${xmlEscape(CONFIG.generator)}</generator>`,
    '    <docs>https://www.rssboard.org/rss-specification</docs>',
    '    <ttl>360</ttl>',
    `    <atom:link href="${xmlAttr(CONFIG.siteBase + 'feed.xml')}" rel="self" type="application/rss+xml"/>`
    // No channel-level pubDate: it duplicates lastBuildDate with no added
    // meaning and is one more thing to keep byte-stable.
    // No skipHours / skipDays: effectively dead.
  );
  for (const rec of records) lines.push(...renderItem(rec));
  lines.push('  </channel>', '</rss>');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const htmlEscape = xmlEscape;

// Same registrable domain, approximated as the last two labels. Used only to
// decide whether a ticket link already points at the venue's own site, so a
// wrong answer costs one redundant link and nothing else.
function sameSite(a, b) {
  try {
    const reg = (u) => new URL(u).hostname.toLowerCase().split('.').slice(-2).join('.');
    return reg(a) === reg(b);
  } catch {
    return false;
  }
}

// Social preview tags. One card image for the whole subsite: the mark is the
// subject, and it does not change per page or per build, so it is a committed
// PNG rather than something rendered at build time. og:image must be an
// absolute URL and must be a raster format; every major scraper ignores SVG.
function socialTags(title, description, url) {
  const img = CONFIG.siteBase + 'og.png';
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${xmlAttr(CONFIG.productName)}">`,
    `<meta property="og:title" content="${xmlAttr(title)}">`,
    `<meta property="og:description" content="${xmlAttr(description)}">`,
    `<meta property="og:url" content="${xmlAttr(url)}">`,
    `<meta property="og:image" content="${xmlAttr(img)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Rated O. Contains screenings that happen once.">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${xmlAttr(title)}">`,
    `<meta name="twitter:description" content="${xmlAttr(description)}">`,
    `<meta name="twitter:image" content="${xmlAttr(img)}">`,
  ];
}

// ---------------------------------------------------------------------------
// Presentation
//
// The page is a design artifact, not a dump. Its rules live in DESIGN.md next
// to this file: the mark, the plate, the type roles, the listing unit, the
// structure at this volume, and every measurement behind them. The stylesheet
// below is that design verbatim; the four functions above it are the transforms
// the design needs and the collected data does not already carry.
// ---------------------------------------------------------------------------

// Format, normalised. Two outputs, because the design treats them differently:
// a PRINT is a rarity signal and earns a badge, and anything else is a fact for
// the credit line. A 4K restoration is a digital file, so it is a fact, not a
// print, however much a venue wants it to feel like one.
//
// The junk cases are real: the collector has put an admission price and a
// runtime in this field. They are dropped here and counted, so the number shows
// up in the build log rather than on the page.
const PRINT_FORMATS = new Set(['70mm', '35mm', '16mm']);
function normalizeFormat(raw) {
  if (!raw) return { print: null, note: null, junk: false };
  const s = String(raw).trim();
  // A trailing asterisk is a venue's own footnote marker, not part of the gauge.
  const bare = s.replace(/\*+$/, '').trim();
  const lower = bare.toLowerCase();
  if (PRINT_FORMATS.has(lower)) return { print: lower, note: null, junk: false };
  // Junk from other fields: anything with a currency symbol, or a bare runtime.
  if (/\$|^\d+\s*m(in)?$/i.test(bare)) return { print: null, note: null, junk: true };
  if (/^4k\s+restoration$/i.test(bare)) return { print: null, note: '4K restoration', junk: false };
  if (/^4k\s+dcp$/i.test(bare)) return { print: null, note: '4K DCP', junk: false };
  if (/^dcp$/i.test(bare)) return { print: null, note: 'DCP', junk: false };
  if (/^digital$/i.test(bare)) return { print: null, note: 'Digital', junk: false };
  return { print: null, note: bare, junk: false };
}

// Some venues type their listings in capitals. Anthology does it for every
// title, which at 124 listings makes a whole column shout.
//
// Only a title that is ENTIRELY upper case is touched, and only when it has
// more than one word, so a legitimately capitalised one-word title is left
// alone. Short particles lower-case, the first and last words never do, and a
// word with internal punctuation is capitalised on each part, so O'BRIEN and
// JEAN-LUC survive. Every change is logged by the caller.
const MINOR_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for',
  'from', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'v', 'vs', 'with']);

// Tokens that must survive the pass with their capitals intact.
//
// This is a TABLE and not a heuristic, on purpose. Inside an all-caps title
// there is no case signal left, so NYC and THE look identical to any rule, and
// every vowel-based test for an initialism breaks on SKY, WHY, DRY and SPY.
// A roman-numeral regex is no better: it also matches MIX, DIM and CIVIC.
//
// Shipped once without this, which published "The Godfather Part Ii",
// "Mix Nyc Presents" and sixteen rows of "Ec:".
const KEEP_CASE = new Set([
  // Roman numerals, written out rather than matched.
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
  // Initialisms seen in the listings. The build reports every short token it
  // recased, so this table grows from evidence rather than from guessing.
  'EC',   // Anthology's Essential Cinema strand, 14 listings
  'PGM',  // "program", as the venue prints it, 11 listings
  'NYC',
  // NOT 'BAM'. It appears as "BAM BAM + BUBBLING BABY", where it is a noise
  // rather than the venue, and preserving it would be the same class of error
  // this table exists to prevent.
]);

// Short tokens that were recased, reported at the end of a build so a new
// initialism surfaces instead of quietly turning into Title Case.
const recasedShortTokens = new Set();

function titleCase(raw) {
  const s = String(raw);
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2 || s !== s.toUpperCase()) return s;
  const parts = s.split(/(\s+)/);
  const wordIdx = parts.map((w, i) => (i % 2 === 0 && w ? i : -1)).filter((i) => i >= 0);
  if (wordIdx.length < 2) return s;
  const first = wordIdx[0];
  const last = wordIdx[wordIdx.length - 1];
  return parts.map((w, i) => {
    if (i % 2 === 1) return w;
    const bare = w.replace(/[^A-Za-z]/g, '');
    if (KEEP_CASE.has(bare)) return w;
    if (bare.length >= 1 && bare.length <= 4) recasedShortTokens.add(bare);
    const lower = w.toLowerCase();
    if (i !== first && i !== last && MINOR_WORDS.has(lower.replace(/[^a-z]/g, ''))) return lower;
    return lower.replace(/\p{L}+/gu, (m) => m[0].toUpperCase() + m.slice(1));
  }).join('');
}

// One row per film per venue per day, which is what a reader is choosing
// between. A four-showtime engagement rendered as four rows pushes the
// one-night-only screenings it is competing with off the screen, which inverts
// the point of the page.
//
// The key is derived here and NOT taken from the record's own `run_key`.
// run_key is an ENGAGEMENT key: venue + film + the FIRST date of the run, which
// 851 of 1,374 records share with a date that is not their own. Grouping on it
// collapses a week-long engagement into a single row on its opening day and
// removes those screenings from the days they actually play.
function collapseRuns(records) {
  const byRun = new Map();
  for (const rec of records) {
    const key = `${rec.venue_slug}\u0000${rec.film_key}\u0000${localDateKey(rec.start_local)}`;
    if (!byRun.has(key)) byRun.set(key, []);
    byRun.get(key).push(rec);
  }
  const runs = [];
  for (const [key, group] of byRun) {
    group.sort(byStartThenUid);
    // The primary carries the row. A run whose first showtime is cancelled but
    // whose later ones are not is still a run that is happening, so the row is
    // struck through only when every showtime in it is cancelled.
    const live = group.filter((r) => r.status !== 'cancelled');
    const primary = live.length ? live[0] : group[0];
    runs.push({
      key,
      primary,
      showtimes: group,
      extra: group.filter((r) => r !== primary),
      cancelled: live.length === 0,
      partlyCancelled: live.length > 0 && live.length < group.length,
    });
  }
  runs.sort((a, b) => byStartThenUid(a.primary, b.primary));
  return runs;
}

// One JSON-LD graph for the whole page instead of one script element per row.
// At this volume the per-row form was the majority of the page bytes, and most
// of those bytes were the same venue address repeated. Venues are hoisted to
// @id nodes and every event references one.
function jsonLdGraph(runs, siteBase) {
  const places = new Map();
  const events = [];
  for (const run of runs) {
    // The graph describes the DEFAULT view, which is the filtered one. Emitting
    // all 1,374 listings put more weight on the wire than the entire visible
    // page: 51 KiB gzipped against 41 KiB for everything a reader can see. The
    // listings that do not qualify are context for a reader, not a claim about
    // an event worth indexing.
    if (!qualifies(run.primary)) continue;
    const rec = run.primary;
    const placeId = `${siteBase}#venue-${rec.venue_slug}`;
    if (!places.has(placeId)) {
      const place = {
        '@type': 'Place',
        '@id': placeId,
        name: rec.venue_name,
        address: { '@type': 'PostalAddress', streetAddress: rec.venue_address },
      };
      if (rec.venue_url) place.url = rec.venue_url;
      places.set(placeId, place);
    }
    // Every showtime is its own ScreeningEvent. Collapsing is a decision about
    // the page, not about the facts, and a machine reader wants the showtimes.
    for (const s of run.showtimes) {
      const doc = {
        '@type': 'ScreeningEvent',
        '@id': `${siteBase}#s-${hashOf(s)}`,
        name: summaryOf(s),
        startDate: isoWithOffset(s.start_local),
        endDate: isoWithOffset(s.end_local),
        eventStatus: s.status === 'cancelled'
          ? 'https://schema.org/EventCancelled'
          : 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@id': placeId },
      };
      if (s.url) doc.url = s.url;
      events.push(doc);
    }
  }
  const graph = { '@context': 'https://schema.org', '@graph': [...places.values(), ...events] };
  // Escape the closing-tag sequence so the JSON can never terminate the script
  // element early. This is the one HTML injection risk in a JSON-LD block.
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}

// Design commentary is documentation, so it lives in the source above rather
// than on the wire. At this page's size the comments were about 10 KiB on every
// load. Comment syntax only: no selector, value or whitespace rewriting, so a
// stripped stylesheet cannot compute differently from the authored one.
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// The stylesheet. Authored in design/page-proto.html and carried here
// verbatim; the prototype remains the reference artifact and this is the
// shipped copy. String.raw because the CSS uses backslash escapes that a
// plain template literal would reject.
const PAGE_CSS = String.raw`
/* ===========================================================================
   TOKENS
   Neutrals are the fv.css values verbatim, so the page computes to the same
   colours as the rest of middleton.io. Green plate tokens are identity.md 1.6.
   Every colour has a light value and a dark value. The dark values are declared
   twice: once under prefers-color-scheme, once under [data-theme="dark"], so
   both the system setting and an explicit override work. Contrast is measured
   and the number is in the comment.
   ========================================================================= */
:root{
  color-scheme:light dark;
  --sans:"Helvetica Neue",Helvetica,Arial,sans-serif;
  --mono:"SF Mono",Menlo,ui-monospace,"Cascadia Mono",Consolas,monospace;

  --bg:#F4F4F5; --bg2:#E9E9EC;
  --ink:#111113;          /* 17.16:1 on --bg */
  --ink2:#5B5B62;         /*  6.13:1 on --bg,  5.56:1 on --bg2 */
  --rule:#D8D8DD;         /*  1.29:1. Hairline. Decorative separators only. */
  --rule-strong:#8B8B90;  /*  3.08:1. Anything that has to read as an object. */
  --c2-text:#AB3142;      /*  5.88:1 on --bg. Cancellation, and nothing else. */
  --tint-soft:rgba(0,0,0,.05);

  /* identity.md: the mark draws itself out of the page and inverts for free. */
  --ono-ink:var(--ink);
  --ono-field:var(--bg);

  /* identity.md 1.6. A plate carries its own ground, so per DESIGN.md rule 3 it
     gets NO dark-mode override. */
  --ono-green:#14432F;       /* 10.20:1 vs the light page, 1.71:1 vs the dark page */
  --ono-on-green:#FFFFFF;    /* 11.21:1 on the plate */
  --ono-green-mute:#C9DED2;  /*  7.93:1 on the plate */
  --ono-green-tint:#205A41;  /*  1.39:1. Watermark. Carries nothing. */

  --bar:3.25rem;             /* the sticky bar. Day headers stick under it. */
  --tcol:5.5rem;             /* the time column. The spine of the whole page. */
  --gut:clamp(.8rem,2vw,1.25rem);
  --wrap:70rem;
  --pad:clamp(1rem,4vw,2.5rem);
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --bg:#0F0F12; --bg2:#17171B;
    --ink:#F2F2F4;        /* 17.12:1 on --bg */
    --ink2:#A2A2AC;       /*  7.56:1 on --bg,  7.07:1 on --bg2 */
    --rule:#2C2C33;       /*  1.38:1 */
    --rule-strong:#656570;/*  3.33:1 */
    --c2-text:#E8697C;    /*  6.14:1 on --bg */
    --tint-soft:rgba(255,255,255,.06);
  }
}
:root[data-theme="dark"]{
  --bg:#0F0F12; --bg2:#17171B; --ink:#F2F2F4; --ink2:#A2A2AC;
  --rule:#2C2C33; --rule-strong:#656570; --c2-text:#E8697C;
  --tint-soft:rgba(255,255,255,.06);
}

*,*::before,*::after{box-sizing:border-box}
html{
  scroll-behavior:smooth;
  scroll-padding-top:calc(var(--bar) + .25rem);   /* a jumped-to day clears the bar */
  -webkit-text-size-adjust:100%;
}
body{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
h1,h2,h3,p,ol,ul,figure{margin:0;padding:0}
ol,ul{list-style:none}
a{color:inherit}
:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.skip{position:absolute;left:-9999px;top:0;background:var(--ink);color:var(--bg);
  padding:.7rem 1rem;font:700 .8rem/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;z-index:9}
.skip:focus{left:0}
.wrap{max-width:var(--wrap);margin:0 auto;padding-inline:var(--pad)}

/* ===========================================================================
   THE MARK  (identity.md 1.3, lifted, not redesigned)
   ========================================================================= */
:root{
  --ono-h:clamp(104px,13vw,150px);
  --ono-rule:max(2px,calc(var(--ono-h) * .021));
  --ono-ring-d:calc(var(--ono-h) * .49);
  --ono-name-fs:calc(var(--ono-h) * .095);
}
.ono-block{height:var(--ono-h);aspect-ratio:2.315;display:grid;
  grid-template-columns:33.8% 1fr;grid-template-rows:13.2% 1fr 14.7%;gap:var(--ono-rule);
  background:var(--ono-ink);border:var(--ono-rule) solid var(--ono-ink);border-radius:0;
  color:var(--ono-ink);overflow:hidden}
.ono-block > *{background:var(--ono-field)}
.ono-block__name{grid-area:1/1/2/2;background:var(--ono-ink);color:var(--ono-field);
  font-family:var(--mono);font-size:var(--ono-name-fs);font-weight:700;letter-spacing:.12em;
  text-transform:uppercase;white-space:nowrap;display:grid;place-items:center;text-indent:.12em}
.ono-block__letter{grid-area:2/1/3/2;display:grid;place-items:center}
.ono-ring{display:block;width:var(--ono-ring-d);aspect-ratio:1;border-radius:50%;
  border:calc(var(--ono-ring-d) * .24) solid var(--ono-ring-colour,currentColor)}
.ono-block__desc{grid-area:1/2/3/3;display:grid;align-content:center;
  padding-inline:calc(var(--ono-h) * .06);font-family:var(--sans);
  font-size:calc(var(--ono-h) * .125);font-weight:800;line-height:.98;
  letter-spacing:-.01em;text-transform:uppercase}
.ono-block__foot{grid-area:3/1/4/3;display:grid;grid-template-columns:1fr auto;
  gap:var(--ono-rule);background:var(--ono-ink)}
.ono-block__foot > *{background:var(--ono-field);display:grid;align-content:center;
  padding-inline:calc(var(--ono-h) * .035);font-family:var(--sans);
  font-size:max(9px,calc(var(--ono-h) * .072));font-weight:700;line-height:1;white-space:nowrap}
.ono-block__cell{font-family:var(--mono);font-size:max(8.5px,calc(var(--ono-h) * .058));
  letter-spacing:.1em;text-transform:uppercase;justify-items:center}
.ono-stamp{height:var(--ono-h);aspect-ratio:1;display:grid;place-items:center;
  background:var(--ono-field);border:var(--ono-rule) solid var(--ono-ink);
  color:var(--ono-ink);--ono-ring-d:calc(var(--ono-h) * .62)}

/* ===========================================================================
   THE MASTHEAD
   The plate is the announcement, exactly as identity.md 1.6 places it: sub-line,
   the block reversed out of the green, the three-line lead, and the utility slot
   bottom-left carrying the subscribe link. The frame is required: the plate
   measures 1.71:1 against the dark page and its edges dissolve without it.
   ========================================================================= */
.ono-band{background:var(--ono-green);color:var(--ono-on-green);
  border:2px solid var(--ono-ink);border-radius:0;position:relative;overflow:hidden;
  padding:clamp(1.4rem,4vw,2.6rem);text-align:center;margin-top:1.4rem}
.ono-band::before{content:"";position:absolute;inset:50% auto auto 50%;translate:-50% -50%;
  width:min(78%,34rem);aspect-ratio:1;border-radius:50%;
  border:min(9%,3.6rem) solid var(--ono-green-tint);pointer-events:none}
.ono-band > *{position:relative}
.ono-band .ono-block{--ono-ink:var(--ono-on-green);--ono-field:var(--ono-green);
  margin-inline:auto}
.ono-band__sub{font-family:var(--mono);font-size:.62rem;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ono-green-mute);margin-bottom:1rem}
.ono-band__lead{font-family:var(--sans);font-weight:800;text-transform:uppercase;
  letter-spacing:-.01em;line-height:1.18;font-size:clamp(.94rem,2.4vw,1.5rem);
  max-width:34ch;margin:1.15rem auto 0}
.ono-band__lead span{font-weight:400;font-size:.74em}
/* The utility slot. On the MPA card this is where www.filmratings.com sits, so
   it is the correct home for the calendar. It is left-aligned against the plate
   while the announcement above it is centred, which is what the original does. */
.ono-band__util{margin-top:clamp(1.2rem,3vw,1.9rem);padding-top:1rem;
  border-top:2px solid var(--ono-on-green);text-align:left;
  display:flex;flex-wrap:wrap;gap:.6rem .9rem;align-items:center}
.btn{font:700 .66rem/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;
  color:var(--ono-green);background:var(--ono-on-green);text-decoration:none;
  padding:.75rem .9rem;min-height:44px;display:inline-flex;align-items:center;
  border:2px solid var(--ono-on-green);transition:background .12s ease,color .12s ease}
.btn--ghost{background:transparent;color:var(--ono-on-green)}
.btn:hover{background:transparent;color:var(--ono-on-green)}
.btn--ghost:hover{background:var(--ono-on-green);color:var(--ono-green)}
.btn:focus-visible{outline:3px solid var(--ono-on-green);outline-offset:2px}
.ono-band__stat{font-family:var(--mono);font-size:.6rem;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ono-green-mute);flex:1 1 16rem;text-align:left}

/* The masthead line. fv.css's .sec-h verbatim: baseline-aligned title and meta
   over a 2px --ink rule. It names the site, which the block deliberately does
   not (identity.md 1.2: the name bar says RATED O, not ONE NIGHT ONLY). */
.mast{display:flex;align-items:baseline;justify-content:space-between;gap:.4rem 1.2rem;
  flex-wrap:wrap;border-bottom:2px solid var(--ink);padding-bottom:.7rem;
  margin-top:clamp(1.2rem,3vw,2rem)}
.mast h1{font:800 clamp(1.6rem,3.4vw,2.5rem)/1.05 var(--sans);letter-spacing:-.03em;color:var(--ink)}
.mast p{font:700 .62rem/1.5 var(--mono);letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink2);text-align:right;max-width:52ch}

/* ---- the rest of the subscribe copy, on the page rather than the plate ---- */
.subx{margin:1.1rem 0 1.5rem}
.subx summary{font:700 .66rem/1.4 var(--mono);letter-spacing:.09em;text-transform:uppercase;
  color:var(--ink);cursor:pointer;min-height:24px;display:flex;align-items:center;gap:.4rem;list-style:none}
.subx summary::-webkit-details-marker{display:none}
.subx summary::before{content:"+";font-weight:800;font-size:1rem;line-height:1}
.subx[open] summary::before{content:"\2013"}
.subx p{margin-top:.6rem;font:400 .84rem/1.55 var(--sans);color:var(--ink2);max-width:70ch}
.url{margin-top:.5rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.url code{font:400 .78rem/1.5 var(--mono);color:var(--ink);overflow-wrap:anywhere}
.copy{font:700 .62rem/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;
  background:transparent;color:var(--ink);border:2px solid var(--rule-strong);
  min-height:24px;padding:.4rem .6rem;cursor:pointer}
.copy:hover{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.copy[hidden]{display:none}

/* ===========================================================================
   THE STICKY BAR
   Deliberately NOT green. identity.md 1.6 gives the plate two jobs, the masthead
   and the subscribe callout, and reserving it for those is what keeps it an
   announcement. A green bar pinned to the viewport for 80,000 pixels would make
   green the page furniture instead.
   --bg2 with a 2px --ink rule is the house's own way of making a band without
   shadow. No backdrop-filter: a blurred sticky bar re-composites everything
   behind it every frame, and behind it there are 1,374 rows.
   ========================================================================= */
/* The idle chip outline is --ink2, NOT --rule-strong. --rule-strong is the 3:1
   token against --bg, but this bar is --bg2, where it measures 2.80:1 and fails.
   --ink2 measures 5.56 light and 7.07 dark on that ground. This is the
   two-ground problem from DESIGN.md, one step sideways. */
.bar{position:sticky;top:0;z-index:5;background:var(--bg2);border-bottom:2px solid var(--ink)}
.bar-in{max-width:var(--wrap);margin:0 auto;padding-inline:var(--pad);
  height:var(--bar);display:flex;align-items:center;gap:.7rem}
.bar .ono-stamp{--ono-h:26px;flex:0 0 auto}
.bmark{flex:0 0 auto;display:inline-flex;min-height:26px;text-decoration:none}
/* One nowrap scrolling row rather than a wrapping one. The pattern is fv.css's
   mobile nav: a control bar that wraps grows taller than the day header it has
   to sit above, and the sticky offset stops matching. */
.bscroll{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:.45rem;
  overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;white-space:nowrap}
.bscroll::-webkit-scrollbar{display:none}
.tog{position:relative;display:inline-flex;flex:0 0 auto}
.tog input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.tog label{font:700 .62rem/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink);border:2px solid var(--ink2);padding:.45rem .6rem;
  min-height:32px;display:inline-flex;align-items:center;gap:.35rem;cursor:pointer;
  transition:background .12s ease,color .12s ease,border-color .12s ease}
.tog label b{font-weight:700;color:var(--ink2)}
/* State is never colour alone: the checked chip also grows a tick. */
.tog input:checked + label::before{content:"\2713";font-weight:800}
.tog input:checked + label{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.tog input:checked + label b{color:var(--bg)}
.tog input:focus-visible + label{outline:3px solid var(--ink);outline-offset:2px}
.months{display:flex;gap:.1rem;flex:0 0 auto;margin-left:.35rem}
.months a{font:700 .62rem/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink2);text-decoration:none;padding:.5rem .55rem;min-height:32px;
  display:inline-flex;align-items:center;border:2px solid transparent}
.months a:hover{color:var(--ink);border-color:var(--ink2)}
.bsub{flex:0 0 auto;font:700 .62rem/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;
  background:var(--ink);color:var(--bg);text-decoration:none;border:2px solid var(--ink);
  padding:.5rem .7rem;min-height:32px;display:inline-flex;align-items:center}
.bsub:hover{background:transparent;color:var(--ink)}

/* ===========================================================================
   THE LEGEND AND THE DAY
   ========================================================================= */
main{padding-bottom:4rem}
/* The one place the two filters are explained. A legend on a notice board, not a
   tooltip repeated on 1,374 rows. */
.legend{margin-top:1.6rem;padding-left:.9rem;border-left:2px solid var(--ink);
  font:400 .84rem/1.55 var(--sans);color:var(--ink2);max-width:74ch;text-wrap:pretty}
.day{margin-top:2.4rem}
/* The biggest render win at this volume: an off-screen day is not laid out at
   all, and contain-intrinsic-size keeps the scrollbar honest. One line to revert
   if find-in-page misbehaves, so verify Cmd-F in Safari before shipping it. */
.day{content-visibility:auto;contain-intrinsic-size:auto 900px}
.day-h{position:sticky;top:var(--bar);z-index:2;background:var(--bg);
  padding:.85rem 0 .5rem;display:flex;flex-wrap:wrap;align-items:baseline;gap:.2rem .9rem;
  border-bottom:1px solid var(--rule-strong)}
/* The weekend is the heavy line. Two channels and no colour: a thicker rule and
   a darker label. The printed calendar's own device. */
.wknd .day-h{border-bottom:2px solid var(--ink)}
.day-d{font:700 .78rem/1.3 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink2)}
.wknd .day-d{color:var(--ink);font-weight:700}
.day-n{margin-left:auto;font:700 .62rem/1.3 var(--mono);letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink2)}
/* The count has to stay true when a filter is on, and CSS cannot count. The
   generator emits all four and the filter picks one. */
.day-n .n-o,.day-n .n-v,.day-n .n-ov{display:none}

/* ===========================================================================
   THE LISTING UNIT
   Two grid items, never three. A third 'auto' column for the marks would be
   sized by the widest pair in that day's list, so the middle column would change
   width from one day to the next.
   'grid-row: 1 / -1' is deliberately not used: with no explicit rows, -1
   resolves to line 1 and the span silently collapses (DESIGN.md, known traps).
   The body lines are wrapped in one element instead, so each column is one item.
   ========================================================================= */
.s{display:grid;grid-template-columns:var(--tcol) minmax(0,1fr);
  border-bottom:1px solid var(--rule);transition:background .12s ease}
.s:hover{background:var(--tint-soft)}
.s-t{align-self:stretch;padding:.7rem var(--gut) .7rem 0;text-align:right;white-space:nowrap;
  border-right:2px solid var(--rule-strong);
  font:700 .95rem/1.35 var(--mono);letter-spacing:-.01em;
  font-variant-numeric:tabular-nums;color:var(--ink)}
.s-t span{display:block;font-size:.6rem;letter-spacing:.1em;color:var(--ink2)}
/* The one signal on the page, and it is achromatic. A qualifying screening
   darkens its own rule from --rule-strong (3.08:1) to --ink (17.16:1). Down 812
   rows that reads as a broken spine, which is exactly the information. */
.is-o .s-t{border-right-color:var(--ink)}
.is-x .s-t{border-right-color:var(--c2-text)}
.s-b{min-width:0;padding:.7rem 0 .75rem var(--gut)}

/* identity.md 3.1: the film title is the 'card' step from DESIGN.md, verbatim. */
.s-h{font:800 1.2rem/1.25 var(--sans);letter-spacing:-.02em;color:var(--ink);
  overflow-wrap:break-word;text-wrap:pretty}
.s-h a{text-decoration:none;
  /* padding on an inline box grows the hit area and the reported rect without
     changing layout, because it lands inside the leading. The bare inline box
     measured under the 24px floor. */
  padding-block:.12rem}
.s-h a:hover{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}
/* identity.md 4.1: the year is part of the title, in the ledger mono, never a badge. */
.s-yr{font-family:var(--mono);font-size:.62rem;font-weight:700;letter-spacing:.09em;
  color:var(--ink2);vertical-align:.32em;margin-left:.5em}
/* A year the venue did not print, resolved from the repertory.nyc film catalog.
   Shown because it is real, marked because its provenance is different. */
.s-yr-cat{border-bottom:1px dotted var(--rule-strong)}
.s-h .ono-stamp{--ono-h:24px;display:inline-grid;vertical-align:middle;margin-left:.35em}
/* identity.md 4.2: format is a rarity ramp in WEIGHT, not in hue. Prints only.
   A 4K restoration is not a print, so it is a fact for the credit line. */
.fmt{display:inline-flex;align-items:center;min-height:24px;padding:.18em .5em;
  font-family:var(--mono);font-size:.58rem;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;text-indent:.1em;
  border:1px solid transparent;vertical-align:middle;margin-left:.35em}
.fmt[data-fmt="70mm"]{background:var(--ink);color:var(--bg)}
.fmt[data-fmt="35mm"]{border:2px solid var(--ink);color:var(--ink)}
.fmt[data-fmt="16mm"]{border-color:var(--rule-strong);color:var(--ink2)}
.s-can{font-family:var(--mono);font-size:.58rem;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:var(--c2-text);border:2px solid var(--c2-text);
  border-radius:3px;padding:.18em .5em;min-height:24px;display:inline-flex;
  align-items:center;vertical-align:.06em;margin-left:.35em}
.is-x .s-h a{color:var(--ink2);text-decoration:line-through;text-decoration-thickness:2px}

/* The venue line is a ledger field: a place label that repeats 267 times, so it
   earns the mono register. The credit line below is not. A director's name is a
   name, and 1,374 proper nouns in tracked capitals is punishing to read. */
.s-v{margin-top:.34rem;display:flex;flex-wrap:wrap;align-items:center;gap:0 .45rem;
  font:700 .62rem/1.4 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ink2)}
/* The separator belongs to the field it precedes, never to itself. As its own
   flex child it wrapped onto a line alone, leaving an orphan dot above a
   wrapped programmer credit at 390. */
.s-v > * + *::before,.s-l time + .s-why::before{content:"\00B7";margin-right:.45rem;
  color:var(--rule-strong)}
.s-vn{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--rule-strong);
  min-height:24px;display:inline-flex;align-items:center}
.s-vn:hover{border-bottom-color:var(--ink)}
.s-pg::before{content:"Presented by "}
.s-l{margin-top:.28rem;display:flex;flex-wrap:wrap;align-items:center;gap:0 .5rem;
  font:700 .62rem/1.5 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ink2)}
.s-l time{color:var(--ink);font-variant-numeric:tabular-nums}
.s-c{margin-top:.34rem;font:400 .84rem/1.5 var(--sans);color:var(--ink2);
  max-width:66ch;text-wrap:pretty}

/* ===========================================================================
   THE FILTERS
   CSS-only, so they work with scripting off. Rows hide by class. Whole days hide
   on a build-time COUNT on the section, never on ':has(descendant)': a
   descendant :has() would be evaluated against 1,374 subtrees on every toggle,
   while an integer attribute selector is read straight off the element.
   The body.f-* duplicates are the fallback for a browser without :has().
   ========================================================================= */
body:has(#f-o:checked) .s:not(.is-o){display:none}
body:has(#f-v:checked) .s:not(.is-v){display:none}
body:has(#f-o:checked) .day[data-o="0"]{display:none}
body:has(#f-v:checked) .day[data-v="0"]{display:none}
body:has(#f-o:checked):has(#f-v:checked) .day[data-ov="0"]{display:none}
.months-off{opacity:.4;cursor:default}
body.f-o .s:not(.is-o){display:none}
body.f-v .s:not(.is-v){display:none}
body.f-o .day[data-o="0"]{display:none}
body.f-v .day[data-v="0"]{display:none}
body.f-o.f-v .day[data-ov="0"]{display:none}
/* Inside the Rated O view every row is rated O, so the stamp says nothing. The
   blackened time rule still carries it. */
body:has(#f-o:checked) .s-h .ono-stamp,body.f-o .s-h .ono-stamp{display:none}
body:has(#f-o:checked) .day-n .n-all,body.f-o .day-n .n-all{display:none}
body:has(#f-v:checked) .day-n .n-all,body.f-v .day-n .n-all{display:none}
body:has(#f-o:checked) .day-n .n-o,body.f-o .day-n .n-o{display:inline}
body:has(#f-v:checked) .day-n .n-v,body.f-v .day-n .n-v{display:inline}
body:has(#f-o:checked):has(#f-v:checked) .day-n .n-o,body.f-o.f-v .day-n .n-o{display:none}
body:has(#f-o:checked):has(#f-v:checked) .day-n .n-v,body.f-o.f-v .day-n .n-v{display:none}
body:has(#f-o:checked):has(#f-v:checked) .day-n .n-ov,body.f-o.f-v .day-n .n-ov{display:inline}

/* ===========================================================================
   FOOTER
   ========================================================================= */
footer{border-top:2px solid var(--ink);margin-top:3rem;padding:1.2rem 0 0}
footer h2{font:700 .68rem/1.2 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink)}
footer li,footer p{margin-top:.55rem;font:400 .82rem/1.6 var(--sans);color:var(--ink2);max-width:66ch}
footer a{color:var(--ink);min-height:24px;display:inline-flex;align-items:center}

/* ===========================================================================
   NARROW
   Nothing reflows into a different structure. The time column narrows, gutters
   tighten, the month jumps leave the bar. Checked at 390 and 1440 in both
   schemes: no horizontal overflow, because every grid child carries
   minmax(0,1fr) or min-width:0 and both long-string fields break.
   ========================================================================= */
@media (max-width:44rem){
  /* identity.md 1.3 tolerance 2: aspect-ratio plus a definite height means the
     block's width is COMPUTED, so a container narrower than that width clips it
     rather than shrinking it. Measured at 390: --ono-h 101px produced a 235px
     block whose footer cell lost the last four characters of middleton.io.
     These two steps are the fitted values, not taste. */
  :root{--tcol:4.4rem;--bar:3rem;--ono-h:118px}
  .ono-band{padding:1.1rem}
  .months{display:none}
  /* Measured at 390: the bar wants 285px for its controls and has 221px, so the
     second chip clipped mid-word and read as a bug rather than as a scroll.
     The Subscribe button goes, not the counts: it duplicates a 44px call to
     action that is one tap away through the mark beside it, and the counts are
     information the chips are the only place to carry. */
  .bsub{display:none}
  .tog label{padding:.45rem .5rem;letter-spacing:.07em}
  .s-h{font-size:1.08rem}
  .ono-band__lead{font-size:clamp(.9rem,4vw,1.2rem)}
}
@media (max-width:26rem){
  :root{--tcol:4.1rem}
  .s-c{font-size:.8rem}
}
@media (max-width:22rem){
  :root{--ono-h:112px;--pad:.75rem}
  .ono-band{padding:.75rem}
}

@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .s,.tog label,.btn,.copy,.months a,.bsub{transition:none}
}
@media print{
  .bar,.ono-band__util,.subx,.copy{display:none}
  .day{content-visibility:visible}
}

/* ===========================================================================
   GENERATOR ADDITIONS
   Two things the prototype could not have: a month nav over real months, and
   the anchors it jumps to.
   ========================================================================= */
/* The month anchor is an empty span placed between day sections rather than an
   id on a section. A filter can hide a section, and an anchor inside a
   display:none element is not a scroll target, which is how the month jumps
   broke: every month after the first landed nowhere. */
.manchor{display:block;height:0;overflow:hidden}
/* A month with nothing left under the current filter says so instead of
   scrolling somebody into a blank stretch. CSS cannot count across sections, so
   the generator emits the same counts here that it emits on a day. */
body:has(#f-o:checked) .months a[data-o="0"],
body.f-o .months a[data-o="0"],
body:has(#f-v:checked) .months a[data-v="0"],
body.f-v .months a[data-v="0"],
body:has(#f-o:checked):has(#f-v:checked) .months a[data-ov="0"],
body.f-o.f-v .months a[data-ov="0"]{opacity:.45;pointer-events:none}

`;

// "11:00" and "AM", separately, because the design sets the meridiem smaller
// and on its own line under the hour.
function clockParts(local) {
  const { h, mi } = localFields(local);
  return { hm: `${h % 12 === 0 ? 12 : h % 12}:${pad2(mi)}`, ap: h < 12 ? 'AM' : 'PM' };
}

// "Saturday 29 August". The day header, where the year is already established
// by the month nav and would only add noise 180 times.
function dayHeading(local) {
  const f = localFields(local);
  return `${WEEKDAYS_LONG[weekdayIndex(local)]} ${f.d} ${MONTHS_LONG[f.mo - 1]}`;
}

// "20 August 2026". Used once, for the freshness line.
function plainDate(local) {
  const f = localFields(local);
  return `${f.d} ${MONTHS_LONG[f.mo - 1]} ${f.y}`;
}

const groupDigits = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// The freshness line is taken from the DATA, not from the build clock. A build
// timestamp would change every run, so every run would produce a commit, a
// deploy, and a changed page for readers whose listings had not moved. This
// changes when the listings change, which is the only time it should.
function lastUpdatedLocal(records) {
  let newest = null;
  for (const r of records) {
    const stamp = r.updated_at || r.first_emitted_at || null;
    if (stamp && (!newest || stamp > newest)) newest = stamp;
  }
  if (!newest) return null;
  const parts = zonedParts(new Date(newest));
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T00:00`;
}

function buildHtml(records, credits = [], venues = {}, now = Date.now(), opts = {}) {
  const icsUrl = CONFIG.siteBase + 'calendar.ics';
  const rssUrl = CONFIG.siteBase + 'feed.xml';
  const webcal = icsUrl.replace(/^https?:/, 'webcal:');
  const notes = { titlesRecased: [], formatsDropped: 0 };

  // Mirrored constant, copy only. See CONFIG.vintageMinAgeYears.
  const newestVintageYear = new Date(now).getFullYear() - CONFIG.vintageMinAgeYears;

  const runs = collapseRuns(records);
  const rowOfRun = (run) => ({
    o: isLimited(run.primary),
    v: isVintage(run.primary),
  });
  const rowsO = runs.filter((r) => rowOfRun(r).o).length;
  const rowsV = runs.filter((r) => rowOfRun(r).v).length;
  const unverifiedRows = runs.filter((r) => yearUnverified(r.primary)).length;
  const venueCount = new Set(runs.map((r) => r.primary.venue_slug)).size;
  const icsCount = Number.isInteger(opts.icsCount) ? opts.icsCount : records.filter(qualifies).length;

  // Days, in order, each carrying the four counts the filters read.
  const byDate = new Map();
  for (const run of runs) {
    const key = localDateKey(run.primary.start_local);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(run);
  }

  // Months, for the jump nav. Each carries the same four counts, so a month
  // with nothing left under the current filter can say so rather than scroll
  // somebody to a blank stretch of page.
  const months = [];
  const monthIndex = new Map();
  for (const [key, group] of byDate) {
    const ym = key.slice(0, 7);
    if (!monthIndex.has(ym)) {
      const entry = { ym, first: key, all: 0, o: 0, v: 0, ov: 0 };
      monthIndex.set(ym, entry);
      months.push(entry);
    }
    const m = monthIndex.get(ym);
    for (const run of group) {
      const f = rowOfRun(run);
      m.all += 1;
      if (f.o) m.o += 1;
      if (f.v) m.v += 1;
      if (f.o && f.v) m.ov += 1;
    }
  }

  const out = [];
  // Variadic: a one-argument sink silently drops all but the first tag when
  // called with a spread, which is how the page shipped with og:type alone.
  const w = (...lines) => out.push(...lines);
  const esc = htmlEscape;

  w('<!DOCTYPE html>');
  w('<html lang="en">');
  w('<head>');
  w('<meta charset="utf-8">');
  // Without a viewport meta the browser lays out at 980px and every mobile
  // breakpoint silently never fires.
  w('<meta name="viewport" content="width=device-width,initial-scale=1">');
  w(`<title>${esc(CONFIG.productName)}</title>`);
  w(`<meta name="description" content="${xmlAttr(CONFIG.calendarDescription)}">`);
  w(`<link rel="canonical" href="${xmlAttr(CONFIG.siteBase)}">`);
  w(...socialTags(CONFIG.productName, CONFIG.calendarDescription, CONFIG.siteBase));
  w(`<link rel="alternate" type="application/rss+xml" title="${xmlAttr(CONFIG.productName)}" href="${xmlAttr(rssUrl)}">`);
  w(`<link rel="alternate" type="text/calendar" title="${xmlAttr(CONFIG.productName)}" href="${xmlAttr(icsUrl)}">`);
  w('<style>');
  w(stripCssComments(PAGE_CSS));
  w('</style>');
  w('</head>');
  w('<body id="top">');
  w('<a class="skip" href="#listings">Skip to the listings</a>');

  // ---- masthead ----------------------------------------------------------
  w('<header class="wrap">');
  w('<div class="mast">');
  w(`<h1>${esc(CONFIG.productName)}</h1>`);
  w(`<p>New York City &middot; ${groupDigits(runs.length)} listings at ${venueCount} venues</p>`);
  w('</div>');

  // The plate. The announcement, and the only place the mark appears at size.
  w('<div class="ono-band" id="subscribe">');
  w('<span class="ono-band__sub">The screenings listed have been rated</span>');
  w('<figure class="ono-block" role="img" aria-label="Rated O. Contains screenings that happen once. Two dates or fewer at the same venue. middleton.io.">');
  w('<div class="ono-block__name">Rated O</div>');
  w('<div class="ono-block__letter"><span class="ono-ring"></span></div>');
  w('<p class="ono-block__desc">Contains<br>screenings that<br>happen once</p>');
  w('<div class="ono-block__foot">');
  w('<span>Two Dates or Fewer at the Same Venue</span>');
  w('<span class="ono-block__cell">middleton.io</span>');
  w('</div>');
  w('</figure>');
  w('<p class="ono-band__lead">');
  w('<span>The following listing has been</span><br>');
  w('approved for all audiences<br>');
  w('<span>in New York City</span>');
  w('</p>');
  w('<span class="ono-band__util">');
  w(`<a class="btn" href="${xmlAttr(webcal)}">Add to Apple Calendar or Outlook</a>`);
  w(`<a class="btn btn--ghost" href="${xmlAttr(rssUrl)}">RSS</a>`);
  const updated = lastUpdatedLocal(records);
  w(`<span class="ono-band__stat">${groupDigits(icsCount)} screenings in the calendar. ` +
    'Subscribe once and it fills in as venues announce.' +
    (updated ? ` Listings last updated ${esc(plainDate(updated))}.` : '') + '</span>');
  w('</span>');
  w('</div>');

  // The rest of the subscribe copy, folded away. Everything a reader needs to
  // subscribe is on the plate; this is what they need if the plate did not work.
  w('<details class="subx">');
  w('<summary>Google Calendar, and what is in the feed</summary>');
  // Google Calendar's "Add calendar > From URL" field takes http and https
  // only, not webcal://. A Google user given only a webcal button is stuck.
  w('<p>Google Calendar takes an https address, not a webcal one. Paste this into Add calendar &gt; From URL.</p>');
  w(`<p class="url"><code id="ics-url">${esc(icsUrl)}</code> ` +
    '<button class="copy" type="button" id="copy-ics" hidden>Copy</button></p>');
  w(`<p>The calendar and the feed carry the ${groupDigits(icsCount)} screenings that are ` +
    'both rated O and revivals. Calendar apps refresh on their own schedule, so a ' +
    'change here can take a day to reach yours.</p>');
  w('</details>');
  w('</header>');

  // ---- the sticky bar ----------------------------------------------------
  w('<div class="bar">');
  w('<div class="bar-in">');
  w('<a class="bmark" href="#subscribe" aria-label="One Night Only, back to the calendar">');
  w('<span class="ono-stamp" aria-hidden="true"><span class="ono-ring"></span></span>');
  w('</a>');
  w('<div class="bscroll">');
  // Both boxes start checked. The unfiltered page is the audit view: it exists
  // so the collector's own work can be read, and it is not what anybody came
  // for. What they came for is what is in the calendar.
  w(`<span class="tog"><input type="checkbox" id="f-o" checked>` +
    `<label for="f-o">One night only <b>${groupDigits(rowsO)}</b></label></span>`);
  w(`<span class="tog"><input type="checkbox" id="f-v" checked>` +
    `<label for="f-v">Revivals <b>${groupDigits(rowsV)}</b></label></span>`);
  if (months.length > 1) {
    w('<nav class="months" aria-label="Jump to month">');
    for (const m of months) {
      const [y, mo] = m.ym.split('-');
      w(`<a href="#m-${esc(m.ym)}" data-o="${m.o}" data-v="${m.v}" data-ov="${m.ov}">` +
        `${esc(MONTHS[+mo - 1])}${months.length > 12 ? ` ${esc(y.slice(2))}` : ''}</a>`);
    }
    w('</nav>');
  }
  w('</div>');
  w(`<a class="bsub" href="${xmlAttr(webcal)}">Subscribe</a>`);
  w('</div>');
  w('</div>');

  // ---- the listings ------------------------------------------------------
  w('<main class="wrap" id="listings">');
  w(`<p class="legend">One night only means the film plays once or twice at that ` +
    `venue, or on ${CONFIG.seriesMaxDates} dates with a single showtime each. ` +
    `Revivals means it was released ${newestVintageYear} or earlier, rather than a ` +
    `first run` +
    (unverifiedRows ? `, and includes ${groupDigits(unverifiedRows)} listings whose venue ` +
      'printed no year at all' : '') +
    '. The calendar and the feed carry the screenings that are both. Turn either ' +
    'off to see everything playing.</p>');

  if (byDate.size === 0) {
    w('<p class="legend">No screenings listed right now.</p>');
  }

  let lastMonth = null;
  for (const [key, group] of byDate) {
    const first = group[0].primary;
    const ym = key.slice(0, 7);
    // The month anchor sits OUTSIDE the day section on purpose. A filter can
    // hide the section, and an anchor inside a display:none element is not a
    // scroll target, which is exactly how the month nav broke.
    if (ym !== lastMonth) {
      w(`<span class="manchor" id="m-${esc(ym)}" aria-hidden="true"></span>`);
      lastMonth = ym;
    }
    let dO = 0, dV = 0, dOV = 0;
    for (const run of group) {
      const f = rowOfRun(run);
      if (f.o) dO += 1;
      if (f.v) dV += 1;
      if (f.o && f.v) dOV += 1;
    }
    const wd = weekdayIndex(key + 'T00:00');
    const weekend = wd === 0 || wd === 5 || wd === 6;
    w(`<section class="day${weekend ? ' wknd' : ''}" id="d-${esc(key)}" data-month="${esc(ym)}"` +
      ` data-o="${dO}" data-v="${dV}" data-ov="${dOV}">`);
    w(`<h2 class="day-h"><span class="day-d">${esc(dayHeading(first.start_local))}</span>` +
      `<span class="day-n">` +
      `<b class="n-all">${groupDigits(group.length)} listings</b>` +
      `<b class="n-o">${groupDigits(dO)} listings</b>` +
      `<b class="n-v">${groupDigits(dV)} listings</b>` +
      `<b class="n-ov">${groupDigits(dOV)} listings</b>` +
      '</span></h2>');
    w('<ol class="rows">');

    for (const run of group) {
      const rec = run.primary;
      const flags = rowOfRun(run);
      const cls = ['s'];
      if (flags.o) cls.push('is-o');
      if (flags.v) cls.push('is-v');
      if (run.cancelled) cls.push('is-x');
      w(`<li class="${cls.join(' ')}" id="s-${esc(hashOf(rec))}">`);

      const t = clockParts(rec.start_local);
      w(`<p class="s-t"><time datetime="${xmlAttr(normalizeLocal(rec.start_local))}">` +
        `${esc(t.hm)}<span>${esc(t.ap)}</span></time></p>`);
      w('<div class="s-b">');

      // Title. The venue is NOT baked in here: it has its own aligned field
      // below, and repeating it in the heading makes 267 rows start with the
      // same 20 characters. summaryOf() keeps the venue for the ICS and the
      // JSON-LD, where there is no second field to carry it.
      const shown = titleCase(rec.title);
      if (shown !== rec.title) notes.titlesRecased.push(rec.title);
      const year = rec.year || rec.vintage_year || null;
      const fromCatalog = !rec.year && rec.vintage_year && rec.vintage_year_from === 'catalog';
      const fmt = normalizeFormat(rec.format);
      if (fmt.junk) notes.formatsDropped += 1;

      const bits = [];
      bits.push(rec.url
        ? `<a href="${xmlAttr(rec.url)}">${esc(shown)}</a>`
        : `<span>${esc(shown)}</span>`);
      if (year) {
        bits.push(`<span class="s-yr${fromCatalog ? ' s-yr-cat' : ''}"` +
          (fromCatalog ? ' title="Year from the repertory.nyc film catalog. The venue printed none."' : '') +
          `>${esc(String(year))}</span>`);
      }
      // The stamp is the row's own claim to the rating on the plate. Inside the
      // one-night-only view every row carries it, so CSS hides it there.
      if (flags.o) {
        bits.push(' <span class="ono-stamp" role="img" aria-label="Rated O">' +
          '<span class="ono-ring"></span></span>');
      }
      if (fmt.print) {
        bits.push(` <span class="fmt" data-fmt="${esc(fmt.print)}">${esc(fmt.print)}</span>`);
      }
      if (run.cancelled) bits.push(' <span class="s-can">Cancelled</span>');
      else if (rec.status === 'tentative') bits.push(' <span class="s-can">Unconfirmed</span>');
      w(`<h3 class="s-h">${bits.join('')}</h3>`);

      // The venue line.
      const vparts = [];
      vparts.push(rec.venue_url
        ? `<a class="s-vn" href="${xmlAttr(rec.venue_url)}">${esc(rec.venue_name)}</a>`
        : `<span class="s-vn">${esc(rec.venue_name)}</span>`);
      const nabe = (venues[rec.venue_slug] || {}).neighborhood || null;
      if (nabe) vparts.push(`<span>${esc(nabe)}</span>`);
      if (rec.programmer && rec.programmer !== rec.venue_name) {
        vparts.push(`<span class="s-pg">${esc(rec.programmer)}</span>`);
      }
      w(`<p class="s-v">${vparts.join(' ')}</p>`);

      // The ledger line: the other showtimes today, then why this is or is not
      // in the calendar. Stated, never left to be inferred.
      const ledger = [];
      if (run.extra.length) {
        // Each folded-in showtime keeps its own anchor. The feed deep-links to
        // #s-<hash> per SHOWTIME, and collapsing runs would otherwise leave
        // those links pointing at an id that no longer exists on the page.
        const times = run.extra.map((s) => {
          const p = clockParts(s.start_local);
          const label = p.ap === t.ap ? p.hm : `${p.hm} ${p.ap}`;
          return `<time id="s-${esc(hashOf(s))}" datetime="${xmlAttr(normalizeLocal(s.start_local))}">` +
            `${esc(label)}</time>`;
        });
        ledger.push(`Also ${times.join(' ')}`);
      }
      const why = [];
      if (!flags.o && Number.isInteger(rec.dates_at_venue)) {
        why.push(`Runs ${rec.dates_at_venue} dates here.`);
      }
      if (!flags.v) {
        why.push(Number.isInteger(rec.vintage_year)
          ? `Released ${rec.vintage_year}, a first run.`
          : 'A first run, not a revival.');
      }
      if (why.length) why.push('Not in the calendar.');
      else if (yearUnverified(rec)) why.push('Year unknown, listed anyway.');
      if (run.partlyCancelled) why.unshift('Some showtimes cancelled.');
      if (why.length) ledger.push(`<span class="s-why">${why.join(' ')}</span>`);
      if (ledger.length) w(`<p class="s-l">${ledger.join(' ')}</p>`);

      // The credit line. Sentence case and the reading face, because a
      // director's name is a name, not a ledger field.
      const credit = [];
      if (rec.director) credit.push(`Dir. ${rec.director}`);
      if (rec.runtime_min) credit.push(`${rec.runtime_min} min`);
      if (fmt.note) credit.push(fmt.note);
      const tail = [];
      if (credit.length) tail.push(credit.join('. ') + '.');
      if (rec.series) tail.push(`Part of ${rec.series}.`);
      if (rec.note) tail.push(rec.note);
      if (tail.length) w(`<p class="s-c">${esc(tail.join(' '))}</p>`);

      w('</div>');
      w('</li>');
    }
    w('</ol>');
    w('</section>');
  }

  // Source credits. An obligation, not a nicety: repertory.nyc's robots.txt
  // permits this collector by name and their data is a large share of what is
  // listed above.
  w('<footer>');
  if (credits.length) {
    w('<h2>Sources</h2>');
    w('<ul>');
    for (const c of credits) {
      w(`<li><a href="${xmlAttr(c.url)}">${esc(c.name)}</a>` +
        (c.note ? `. ${esc(c.note)}` : '') + '</li>');
    }
    w('</ul>');
  }
  w('<p>Showtimes and ticket links belong to the venues. Check the venue before you travel.</p>');
  w('<p>There is no search box on this page on purpose. Everything is in the ' +
    "document, so your browser's own find searches all of it.</p>");
  w(`<p><a href="${xmlAttr(CONFIG.siteBase + 'identity.html')}">How the Rated O mark works</a>` +
    ', if you are the sort of person who wonders.</p>');
  w('</footer>');
  w('</main>');

  // One graph for the page. See jsonLdGraph().
  w(`<script type="application/ld+json">${jsonLdGraph(runs, CONFIG.siteBase)}</script>`);

  w('<script>');
  w('/* Two jobs, both of which the page survives without. The copy button is');
  w('   emitted hidden and revealed here, so a reader with no scripting is never');
  w('   shown a button that does nothing. The second is the :has() fallback,');
  w('   which is harmless where :has() already works. */');
  w('(function(){');
  w('var btn=document.getElementById("copy-ics");');
  w('if(btn&&navigator.clipboard){btn.hidden=false;btn.addEventListener("click",function(){');
  w('navigator.clipboard.writeText(document.getElementById("ics-url").textContent)');
  w('.then(function(){var o=btn.textContent;btn.textContent="Copied";');
  w('setTimeout(function(){btn.textContent=o},2000)})});}');
  w('["f-o","f-v"].forEach(function(k){var el=document.getElementById(k);if(!el)return;');
  w('var sync=function(){document.body.classList.toggle(k,el.checked)};');
  w('el.addEventListener("change",sync);sync();});');
  w('})();');
  w('</script>');
  w('</body>');
  w('</html>');

  if (opts.report) {
    opts.report.rows = runs.length;
    opts.report.titlesRecased = notes.titlesRecased;
    opts.report.formatsDropped = notes.formatsDropped;
    opts.report.shortTokens = [...recasedShortTokens].sort();
  }
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// The identity sheet
//
// Published rather than kept in a folder, and generated from PAGE_CSS rather
// than hand-written, so every specimen on it is drawn by the same rules that
// draw the listings. A proof sheet that can drift from the thing it documents
// is worse than no proof sheet.
// ---------------------------------------------------------------------------

const IDENTITY_CSS = String.raw`
/* The compact block: the same grid with the description and footer dropped, so
   the name bar and the ring carry it alone. Only the identity sheet and the
   social card use it, so it lives here rather than in PAGE_CSS. */
.ono-block--compact{aspect-ratio:.782;grid-template-columns:1fr;grid-template-rows:15.4% 1fr;
  --ono-ring-d:calc(var(--ono-h) * .62)}
.idw{max-width:56rem}
.id-h{border-bottom:2px solid var(--ink);padding-bottom:.7rem;margin-top:clamp(1.2rem,3vw,2rem);
  display:flex;align-items:baseline;justify-content:space-between;gap:.4rem 1.2rem;flex-wrap:wrap}
.id-h h1{font:800 clamp(1.6rem,3.4vw,2.5rem)/1.05 var(--sans);letter-spacing:-.03em}
.id-h p{font:700 .62rem/1.5 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ink2)}
.id-s{margin-top:2.6rem}
.id-s > h2{font:700 .68rem/1.2 var(--mono);letter-spacing:.14em;text-transform:uppercase;
  color:var(--ink2);border-bottom:1px solid var(--rule-strong);padding-bottom:.5rem}
.id-s > p{margin-top:.9rem;font:400 .95rem/1.6 var(--sans);color:var(--ink);max-width:66ch;text-wrap:pretty}
.id-s > p + p{margin-top:.7rem}
.id-s .quiet{color:var(--ink2);font-size:.86rem}
.id-plate{display:flex;flex-wrap:wrap;gap:1.6rem;align-items:flex-end;margin-top:1.4rem;
  padding:1.6rem;background:var(--bg2);border:2px solid var(--ink)}
.id-plate figcaption{font:700 .58rem/1.4 var(--mono);letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink2);margin-top:.6rem}
.id-spec{display:flex;flex-direction:column;align-items:flex-start}
.id-chips{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-top:1.2rem}
.id-chips .fmt{margin-left:0}
.id-tok{width:100%;border-collapse:collapse;margin-top:1.1rem;
  font:400 .82rem/1.5 var(--sans);color:var(--ink)}
.id-tok th{text-align:left;font:700 .58rem/1.4 var(--mono);letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink2);border-bottom:1px solid var(--rule-strong);padding:.5rem .6rem .5rem 0}
.id-tok td{border-bottom:1px solid var(--rule);padding:.55rem .6rem .55rem 0;vertical-align:middle}
.id-tok code{font:400 .78rem/1.5 var(--mono)}
.id-sw{display:inline-block;width:1.6rem;height:1.6rem;border:1px solid var(--rule-strong);
  vertical-align:middle;margin-right:.5rem}
.id-back{margin-top:2.6rem;display:inline-flex;align-items:center;min-height:44px;
  font:700 .66rem/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;
  background:var(--ink);color:var(--bg);text-decoration:none;padding:.75rem .9rem;border:2px solid var(--ink)}
.id-back:hover{background:transparent;color:var(--ink)}
@media (max-width:44rem){.id-plate{padding:1rem;gap:1.1rem}}
`;

function buildIdentity() {
  const out = [];
  // Variadic: a one-argument sink silently drops all but the first tag when
  // called with a spread, which is how the page shipped with og:type alone.
  const w = (...lines) => out.push(...lines);
  const esc = htmlEscape;
  const block = (h, compact) => {
    const cls = 'ono-block' + (compact ? ' ono-block--compact' : '');
    const rows = [`<figure class="${cls}" style="--ono-h:${h}px" role="img" ` +
      `aria-label="Rated O.${compact ? '' : ' Contains screenings that happen once.'}">`,
      '<div class="ono-block__name">Rated O</div>',
      '<div class="ono-block__letter"><span class="ono-ring"></span></div>'];
    if (!compact) {
      rows.push('<p class="ono-block__desc">Contains<br>screenings that<br>happen once</p>');
      rows.push('<div class="ono-block__foot"><span>Two Dates or Fewer at the Same Venue</span>' +
        '<span class="ono-block__cell">middleton.io</span></div>');
    }
    rows.push('</figure>');
    return rows.join('');
  };

  w('<!DOCTYPE html>');
  w('<html lang="en">');
  w('<head>');
  w('<meta charset="utf-8">');
  w('<meta name="viewport" content="width=device-width,initial-scale=1">');
  w(`<title>The Rated O mark &middot; ${esc(CONFIG.productName)}</title>`);
  w('<meta name="description" content="How the Rated O mark works: one rating, its forms, ' +
    'the format ramp, and the colours and type behind them.">');
  w(`<link rel="canonical" href="${xmlAttr(CONFIG.siteBase + 'identity.html')}">`);
  w(...socialTags('The Rated O mark',
    'One rating, its forms, the format ramp, and the colours and type behind them.',
    CONFIG.siteBase + 'identity.html'));
  w('<style>');
  w(stripCssComments(PAGE_CSS));
  w(stripCssComments(IDENTITY_CSS));
  w('</style>');
  w('</head>');
  w('<body id="top">');
  w('<header class="wrap idw">');
  w('<div class="id-h"><h1>The Rated O mark</h1><p>One Night Only &middot; Identity</p></div>');
  w('</header>');
  w('<main class="wrap idw">');

  w('<section class="id-s">');
  w('<h2>One rating</h2>');
  w('<p>Every listing on this site is either rated O or it is not, and that is the ' +
    'whole system. O means the film plays once or twice at that venue, or on ' +
    `${CONFIG.seriesMaxDates} dates with a single showtime each. There is no second ` +
    'grade, no scale, and nothing to interpret.</p>');
  w('<p>The form is borrowed from the green card that runs before a trailer, because ' +
    'that card is doing the same job: a small, official-looking block that tells you ' +
    'one fact about what you are looking at before you look at it. The ring is the ' +
    'letter O and the hole in a reel, which is the only joke on the site.</p>');
  w('<figure class="id-plate" style="background:var(--ono-green);border-color:var(--ono-ink)">');
  w('<div class="id-spec ono-band" style="border:0;padding:0;background:none">');
  w(block(150, false));
  w('</div>');
  w('</figure>');
  // A sentence-length caption goes in the reading face. The mono caps register
  // is for a two-word label, and three tracked lines of it is punishing.
  w('<p class="quiet">The block reversed out of the green plate, at 150px. ' +
    'The plate carries its own ground, so it does not change in dark mode.</p>');
  w('</section>');

  w('<section class="id-s">');
  w('<h2>Three forms, one construction</h2>');
  w('<p>The block, the compact block and the stamp are the same grid at three sizes. ' +
    'Everything scales from a single height variable, so nothing is redrawn and ' +
    'nothing can be redrawn slightly wrong.</p>');
  w('<div class="id-plate">');
  w(`<figure class="id-spec">${block(104, false)}<figcaption>Block &middot; 104px</figcaption></figure>`);
  w(`<figure class="id-spec">${block(96, true)}<figcaption>Compact &middot; 96px</figcaption></figure>`);
  w('<figure class="id-spec"><span class="ono-stamp" style="--ono-h:48px" role="img" ' +
    'aria-label="Rated O"><span class="ono-ring"></span></span>' +
    '<figcaption>Stamp &middot; 48px</figcaption></figure>');
  w('<figure class="id-spec"><span class="ono-stamp" style="--ono-h:24px" role="img" ' +
    'aria-label="Rated O"><span class="ono-ring"></span></span>' +
    '<figcaption>Stamp &middot; 24px, on a row</figcaption></figure>');
  w('</div>');
  w('<p class="quiet">The 24px stamp is the one that appears in the listings, beside a ' +
    'film title. It is hidden inside the filtered view, where every row is rated O and ' +
    'the stamp would say nothing.</p>');
  w('</section>');

  w('<section class="id-s">');
  w('<h2>Format is a rarity ramp, not a colour</h2>');
  w('<p>A print is rarer than a file, so the badge gets heavier as the format gets ' +
    'rarer: 70mm is solid, 35mm is a two-pixel rule, 16mm is a hairline. No hue is ' +
    'involved, which means the ramp survives being printed, being colour-blind, and ' +
    'being viewed in either scheme.</p>');
  w('<p>A 4K restoration is a digital file however it is advertised, so it is a fact ' +
    'for the credit line rather than a badge.</p>');
  w('<div class="id-chips">');
  for (const f of ['70mm', '35mm', '16mm']) {
    w(`<span class="fmt" data-fmt="${f}">${f}</span>`);
  }
  w('</div>');
  w('</section>');

  w('<section class="id-s">');
  w('<h2>What was deliberately not taken</h2>');
  w('<p>The rating card is the reference. The rating <em>scale</em> is not. G, PG, ' +
    'PG-13, R and NC-17 are a judgement about content, made by somebody else, and this ' +
    'site knows nothing about the content of any film it lists. An earlier draft of ' +
    'this page showed those badges and it was wrong: the data has no rating field, so ' +
    'every one of them would have been invented.</p>');
  w('<p>O is not a content rating. It is a scarcity rating, and it is the only claim ' +
    'the site is in a position to make.</p>');
  w('</section>');

  w('<section class="id-s">');
  w('<h2>Colour</h2>');
  w('<p>The neutrals are the same tokens as the rest of middleton.io, so this subsite ' +
    'computes to the same greys as everything else. The green belongs to the plate ' +
    'alone. Every pair below is measured, not estimated.</p>');
  w('<table class="id-tok">');
  w('<tr><th>Token</th><th>Light</th><th>Dark</th><th>Job</th></tr>');
  const toks = [
    ['--bg', '#F4F4F5', '#0F0F12', 'The page'],
    ['--ink', '#111113', '#F2F2F4', 'Titles and anything that has to be read first'],
    ['--ink2', '#5B5B62', '#A2A2AC', 'Ledger fields and credits. 6.13:1 light, 7.56:1 dark'],
    ['--rule-strong', '#8B8B90', '#656570', 'Anything that has to read as an object. 3.08:1'],
    ['--c2-text', '#AB3142', '#E8697C', 'Cancellation, and nothing else'],
    ['--ono-green', '#14432F', '#14432F', 'The plate. Carries its own ground, so it never flips'],
  ];
  for (const [name, light, dark, job] of toks) {
    w(`<tr><td><code>${esc(name)}</code></td>` +
      `<td><span class="id-sw" style="background:${light}"></span><code>${light}</code></td>` +
      `<td><span class="id-sw" style="background:${dark}"></span><code>${dark}</code></td>` +
      `<td>${esc(job)}</td></tr>`);
  }
  w('</table>');
  w('</section>');

  w('<section class="id-s">');
  w('<h2>Type</h2>');
  w('<p>Two faces doing two jobs. Helvetica for anything a person reads as language: ' +
    'film titles, this paragraph, a director credit. A monospace for anything that ' +
    'behaves like a field in a ledger: times, venues, counts, the rating itself. A ' +
    'venue name repeats hundreds of times down the page and earns the ledger register; ' +
    "a director's name is a name and does not.</p>");
  w('</section>');

  w(`<a class="id-back" href="${xmlAttr(CONFIG.siteBase)}">Back to the listings</a>`);
  w('</main>');
  w('</body>');
  w('</html>');
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Windowing
// ---------------------------------------------------------------------------

function selectForIcs(records, now) {
  const forwardBound = now + CONFIG.icsForwardDays * DAY_MS;
  const tombstoneFloor = now - CONFIG.tombstoneRetentionDays * DAY_MS;

  let keep = records.filter((r) => {
    // The calendar carries only limited engagements. A subscriber asked to be
    // told about screenings they would otherwise miss, not about the fifth
    // showtime of a two-week run three aggregators already list.
    //
    // Tombstones included. A cancelled record keeps the `limited` value it had
    // when the collector last saw it, so a screening that was published here
    // and then cancelled still gets its cancellation, and a run that was never
    // published here does not announce one for an event no subscriber holds.
    if (!qualifies(r)) return false;
    const start = r.start_instant.getTime();
    if (start > forwardBound) return false;
    if (r.status === 'cancelled') {
      // A tombstone must outlive the slowest realistic subscriber refresh, so
      // it survives 30 days past the event date and then disappears. Never
      // silently delete: a dropped UID can sit on an Apple calendar forever.
      return start >= tombstoneFloor;
    }
    // Live past screenings drop out. This is a listings feed, not an archive.
    // "Past" means the screening has ended, so an event does not vanish from
    // your calendar while you are sitting in the theatre watching it.
    return r.end_instant.getTime() >= now;
  });

  // Sort ascending by start, then by UID as a tiebreak. Ordering is
  // semantically irrelevant to clients but essential for byte-stable output and
  // readable diffs, and calendar-limits.md documents a Google truncation bug
  // that cuts by position, so soonest-first is what survives it.
  keep.sort(byStartThenUid);

  if (keep.length > CONFIG.icsMaxEvents) {
    process.stdout.write(
      `  warning: ${keep.length} events exceeds the ${CONFIG.icsMaxEvents} cap. ` +
      'Dropping the furthest out. Investigate this as a bug.\n'
    );
    keep = keep.slice(0, CONFIG.icsMaxEvents);
  }
  return keep;
}

function byStartThenUid(a, b) {
  const d = a.start_instant - b.start_instant;
  if (d !== 0) return d;
  return uidOf(a) < uidOf(b) ? -1 : uidOf(a) > uidOf(b) ? 1 : 0;
}

function selectForRss(records, now) {
  const forwardBound = now + CONFIG.rssForwardDays * DAY_MS;

  let keep = records.filter((r) => {
    // Same rule as the calendar, and for the same reason: these are the two
    // surfaces where somebody asked to be told.
    if (!qualifies(r)) return false;
    const start = r.start_instant.getTime();
    if (r.status === 'cancelled') {
      // A cancellation is news, so it publishes even for an event outside the
      // 60-day window, but only for 7 days after the cancellation itself.
      if (start < now) return false;
      const at = r.cancelled_at ? new Date(r.cancelled_at).getTime() : start;
      return now - at <= CONFIG.rssTombstoneDays * DAY_MS;
    }
    return r.end_instant.getTime() >= now && start <= forwardBound;
  });

  // The cap drops the furthest-out screenings, not the oldest discoveries, so
  // the feed always carries the soonest things a subscriber can still act on.
  if (keep.length > CONFIG.rssMaxItems) {
    keep = keep.slice().sort(byStartThenUid).slice(0, CONFIG.rssMaxItems);
  }

  // Newest discoveries first, which is what readers expect. The event-start
  // tiebreak makes a batch of 40 items sharing one discovery timestamp appear
  // in chronological screening order, which is the only order that reads.
  keep.sort((a, b) => {
    const d = new Date(b.created_at) - new Date(a.created_at);
    if (d !== 0) return d;
    return byStartThenUid(a, b);
  });
  return keep;
}

// The website is the archive, so it carries the full forward window and keeps
// live past events for 30 days rather than emptying its own past.
function selectForHtml(records, now) {
  const forwardBound = now + CONFIG.icsForwardDays * DAY_MS;
  const floor = now - CONFIG.tombstoneRetentionDays * DAY_MS;
  return records
    .filter((r) => r.start_instant.getTime() <= forwardBound && r.start_instant.getTime() >= floor)
    .sort(byStartThenUid);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { data: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data') args.data = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write('usage: node build.mjs [--data data/screenings.json] [--out dist]\n');
      process.exit(0);
    } else {
      process.stderr.write(`build: unknown argument ${argv[i]}\n`);
      process.exit(2);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  // Defaults are the published layout of the `about` repo, resolved from this
  // file rather than from the working directory, so `node
  // tools/one-night-only/build.mjs` does the right thing from the repo root and
  // from anywhere else. HERE is tools/one-night-only, so '..', '..' is the root.
  const dataPath = resolve(args.data ||
    join(HERE, '..', '..', 'one-night-only', '_data', 'screenings.json'));
  const outDir = resolve(args.out || join(HERE, '..', '..', 'one-night-only'));

  // NABE_NOW exists so tests can pin the window boundaries. Production has no
  // build timestamp anywhere in the output, so this only affects which records
  // fall inside the rolling window.
  const nowIso = process.env.NABE_NOW || process.env.ONO_NOW;
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  if (Number.isNaN(now)) throw new Error(`bad NABE_NOW: ${nowIso}`);

  const { venues, screenings } = loadDataset(dataPath);
  // The venue registry in the dataset is written by the collector, which only
  // learned about neighborhoods on its next run. Overlaying here means the page
  // carries them immediately, and a collected registry that already has them is
  // left alone.
  for (const [slug, v] of Object.entries(venues)) {
    if (!v.neighborhood) {
      const nabe = neighborhoodOf(slug);
      if (nabe) v.neighborhood = nabe;
    }
  }
  // sources.json sits next to the dataset and is written by the collector.
  const credits = loadCredits(join(dirname(dataPath), 'sources.json'));
  const records = screenings.map((s) => hydrate(s, venues));

  const icsRecords = selectForIcs(records, now);
  const rssRecords = selectForRss(records, now);
  const htmlRecords = selectForHtml(records, now);

  // An empty calendar is the failure this project is most afraid of, and it is
  // silent: every guard upstream can pass, every file can be well formed, and
  // the published result cancels every screening on every subscriber's
  // calendar. A dataset with records in it that yields no VEVENT means the
  // filter, the window or the `limited` flag has gone wrong.
  //
  // Checked BEFORE anything is written, so a failed run leaves the previous
  // good output in place rather than an empty file for someone to commit by
  // accident.
  if (screenings.length === 0 || icsRecords.length === 0) {
    process.stderr.write(
      `\nbuild: FAIL calendar.ics would carry ${icsRecords.length} VEVENT ` +
      `from ${screenings.length} record(s) in the dataset. Nothing was written.\n` +
      '  An empty calendar is not an empty week. Publishing one cancels every\n' +
      "  screening on every subscriber's calendar, and there is no way to undo it.\n" +
      '  Check the collector run, the `limited` flag and the forward window\n' +
      '  before publishing anything.\n'
    );
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const ics = buildIcs(icsRecords, credits);
  const rss = buildRss(rssRecords, credits);
  const report = {};
  const html = buildHtml(htmlRecords, credits, venues, now,
    { icsCount: icsRecords.length, report });

  writeFileSync(join(outDir, 'calendar.ics'), Buffer.from(ics, 'utf8'));
  writeFileSync(join(outDir, 'feed.xml'), Buffer.from(rss, 'utf8'));
  const identity = buildIdentity();
  // This shipped once with og:type and nothing else, because the line writer
  // took a single argument and the tags arrive as a spread. A social card that
  // is silently absent looks exactly like one that is present until somebody
  // pastes a link, so assert the count rather than trust the call.
  for (const [name, doc] of [['index.html', html], ['identity.html', identity]]) {
    const n = (doc.match(/<meta (?:property="og:|name="twitter:)/g) || []).length;
    if (n < 13) {
      process.stderr.write(`\nbuild: FAIL ${name} carries ${n} social tag(s), expected 13.\n`);
      process.exit(1);
    }
  }
  writeFileSync(join(outDir, 'index.html'), Buffer.from(html, 'utf8'));
  writeFileSync(join(outDir, 'identity.html'), Buffer.from(identity, 'utf8'));

  const icsBytes = statSync(join(outDir, 'calendar.ics')).size;
  const qualifying = records.filter(qualifies).length;
  const limitedOnly = records.filter(isLimited).length;
  const vintageOnly = records.filter(isVintage).length;
  const unverified = records.filter(yearUnverified).length;
  const unmarked = records.filter((r) => r.limited === undefined).length;
  const unmarkedVintage = records.filter((r) => r.vintage === undefined).length;
  process.stdout.write(
    `build: ${screenings.length} record(s) in dataset, ` +
    `${limitedOnly} limited, ${vintageOnly} vintage, ` +
    `${qualifying} both (${unverified} of them with an unverified year)\n` +
    `  calendar.ics  ${icsRecords.length} VEVENT  ${icsBytes} bytes ` +
    `(${(icsBytes / 1024).toFixed(1)} KiB of a ${(CONFIG.maxIcsBytes / 1024).toFixed(0)} KiB budget)\n` +
    `  feed.xml      ${rssRecords.length} item(s)  ${statSync(join(outDir, 'feed.xml')).size} bytes\n` +
    `  index.html    ${htmlRecords.length} listing(s)  ${statSync(join(outDir, 'index.html')).size} bytes\n` +
    `  identity.html ${statSync(join(outDir, 'identity.html')).size} bytes\n` +
    `  credits       ${credits.length} source(s) rendered\n`
  );
  process.stdout.write(
    `  page          ${report.rows} row(s) after collapsing runs, ` +
    `${new Set(htmlRecords.map((r) => r.venue_slug)).size} venue(s)\n`
  );
  if (report.titlesRecased && report.titlesRecased.length) {
    const sample = report.titlesRecased.slice(0, 3).join(', ');
    process.stdout.write(
      `  titles        ${report.titlesRecased.length} all-caps title(s) recased for the page ` +
      `(e.g. ${sample})\n    The ICS and the feed carry the venue's own spelling.\n`
    );
    // Short tokens are where this pass goes wrong: an initialism inside an
    // all-caps title is indistinguishable from a word. Listed so a new one can
    // be added to KEEP_CASE rather than discovered on the live site.
    if (report.shortTokens && report.shortTokens.length) {
      process.stdout.write(
        `    short tokens recased (check for an initialism): ${report.shortTokens.join(' ')}\n`
      );
    }
  }
  if (report.formatsDropped) {
    process.stdout.write(
      `  warning: ${report.formatsDropped} format value(s) were not a format and were dropped.\n` +
      '    A price or a runtime in this field is a collector bug. See normalizeFormat().\n'
    );
  }
  if (unmarked) {
    process.stdout.write(
      `  warning: ${unmarked} record(s) carry no \`limited\` flag and are published ` +
      'anyway.\n    The collector should be setting it. See assignLimited().\n'
    );
  }
  if (unmarkedVintage) {
    process.stdout.write(
      `  warning: ${unmarkedVintage} record(s) carry no \`vintage\` flag and are ` +
      'published anyway.\n    The collector should be setting it. See assignVintage().\n'
    );
  }

  // Assert the budget rather than assuming it.
  if (icsBytes > CONFIG.maxIcsBytes) {
    process.stderr.write(
      `\nbuild: FAIL calendar.ics is ${icsBytes} bytes, over the ${CONFIG.maxIcsBytes} byte budget.\n` +
      '  Google subscribe-by-URL truncates large feeds silently and by position.\n' +
      '  Shrink the forward window or split into per-borough feeds.\n'
    );
    process.exit(1);
  }
}

export {
  CONFIG, VTIMEZONE, fold, escText, escUri, escCategories, stripControl,
  localToInstant, addLocalMinutes, icsLocal, icsUtc, rfc822,
  buildIcs, buildRss, buildHtml, buildIdentity, hydrate, loadDataset, uidOf, hashOf, guidOf,
};

if (import.meta.url === `file://${process.argv[1]}`) main();
