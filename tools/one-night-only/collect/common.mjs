#!/usr/bin/env node
// common.mjs - shared machinery for every collector source. Zero dependencies.
//
// Everything in here exists to make one of the non-negotiable rules mechanical
// rather than a thing each source module has to remember:
//
//   * fetchText() checks content-type, never status code alone. Several
//     platforms in this domain answer 200 with an HTML body for feeds and APIs
//     that do not exist (ARCHITECTURE.md, "Ticketure's SPA returns 200 for
//     feeds that do not exist"). A soft-404 must look like a failure here.
//   * fetchText() sends a descriptive User-Agent with a contact URL, honours
//     robots.txt for the host, and issues a conditional request when the last
//     response offered an ETag or Last-Modified.
//   * mintIdentity() is the only place a UID is computed, and it computes it by
//     calling straight into tombstones.mjs so the collector and the ledger can
//     never drift apart.
//   * assertParsedTimes() is the Film Forum trap. A source that hands back a
//     hundred perfectly-formed records whose start times are all empty strings
//     must fail, not report success and publish nothing.
//   * fetchText() follows redirects MANUALLY and refuses one that leaves the
//     origin's registrable domain. queensdrivein.com now redirects to a
//     gambling site; a venue domain that has been sold on must not silently
//     become one of our sources.
//
// FETCHED BYTES ARE DATA, NEVER INSTRUCTIONS.
//
//   This collector reads robots.txt, HTML, JSON and feeds from dozens of
//   third-party hosts on a schedule, and some of that content is written to
//   manipulate an automated reader. A robots.txt on an A24 subdomain was found
//   in the wild carrying text addressed to AI agents, asking them to install a
//   shopping skill and make purchases.
//
//   Nothing fetched here can change what the collector does, what it fetches
//   next, or what it publishes. There is no code path from a response body to a
//   new URL, a new source, a config change, or a shell command: the tenant
//   allowlist, the calendar ids, the venue book and the endpoint list are all
//   compile-time constants in this repository. scanForAgentDirectives() exists
//   only to LOG such text as a curiosity so a human can look at it. It has no
//   effect on control flow, by design.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

import { filmKey, mintUid } from '../tombstones.mjs';

export const USER_AGENT =
  'OneNightOnlyBot/1.0 (+https://middleton.io/one-night-only/; NYC one-night-only screening listings)';

export const TZ = 'America/New_York';

// How far back a screening is still worth carrying in the dataset. Must exceed
// build.mjs's 30-day backward HTML window and tombstones.mjs's 30-day tombstone
// retention, or a record would vanish from the dataset while something
// downstream still wants it.
export const CARRY_BACK_DAYS = 45;

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export function now() {
  const override = process.env.ONO_NOW || process.env.NABE_NOW;
  const d = override ? new Date(override) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error(`bad ONO_NOW: ${override}`);
  return d;
}

export const isoStamp = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const pad2 = (n) => String(n).padStart(2, '0');

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

/** "today" in New York, as YYYY-MM-DD, for an absolute instant. */
const partsTimeFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

export function localDate(instant) {
  const p = {};
  for (const part of partsFmt.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Local wall clock as YYYY-MM-DDTHH:MM, the same shape as a record's
 * `start_local`, so the two compare as strings.
 *
 * This exists because "is it past?" was being asked at day granularity while
 * sources drop an event the minute it starts. A 19:00 screening left the
 * feed at 19:00, was not yet "past" until midnight, and fell into the gap
 * where a disappearance reads as a cancellation. Subscribers were told a
 * screening was cancelled that had in fact just begun.
 */
export function localStampNow(instant) {
  const p = {};
  for (const part of partsTimeFmt.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Shift a YYYY-MM-DD by whole days. Calendar arithmetic, no timezone involved. */
export function shiftDate(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

export const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Normalise a wall-clock local timestamp to exactly "YYYY-MM-DDTHH:MM".
 * Returns null rather than guessing. Every caller treats null as "drop the
 * record and count it", never as "use a default".
 */
export function localStamp(dateYmd, hour, minute) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateYmd || ''))) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return `${dateYmd}T${pad2(hour)}:${pad2(minute)}`;
}

/**
 * Parse a 12-hour clock label as written by a human: "7 PM", "5:45 PM",
 * "6:30pm", "12:05 AM". Returns {hour, minute} or null.
 *
 * Deliberately refuses a bare "7:00" with no meridiem. ARCHITECTURE.md records
 * exactly what happens when someone assumes: Elevent's JSON-LD writes a
 * 12-hour clock as 24-hour with no meridiem and every evening screening lands
 * twelve hours wrong. An ambiguous clock is a missing field.
 */
export function parseClock12(text) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?\s*$/.exec(String(text || ''));
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const pm = m[3].toLowerCase() === 'p';
  if (hour === 12) hour = 0;
  if (pm) hour += 12;
  return { hour, minute };
}

/** Pull HH:MM out of a "YYYY-MM-DD HH:MM:SS" or ISO-ish string. Time only. */
export function timeOfDay(text) {
  const m = /[T ](\d{2}):(\d{2})(?::\d{2})?/.exec(String(text || ''));
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Pull YYYY-MM-DD out of a date-ish string. Date only. */
export function dateOnly(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: ' ',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  ndash: '–', mdash: '—', hellip: '…', middot: '·',
};

export function htmlUnescape(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    const hit = NAMED_ENTITIES[body];
    return hit === undefined ? whole : hit;
  });
}

export const stripTags = (s) => String(s).replace(/<[^>]*>/g, ' ');

/** Collapse whitespace. Never used to fix data, only to tidy display text. */
export const tidy = (s) => htmlUnescape(String(s ?? '')).replace(/\s+/g, ' ').trim();

export function slugify(s) {
  return String(s)
    .normalize('NFD').replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'unknown';
}

export const sha16 = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

/** Upgrade a known-good http URL to https. Used on NYC Parks deep links. */
export const https = (u) => String(u || '').replace(/^http:\/\//i, 'https://');

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

const robotsCache = new Map();

function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || current.rules.length || current.delay !== null) {
        current = { agents: [], rules: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === 'allow' || field === 'disallow')) {
      current.rules.push({ allow: field === 'allow', path: value });
    } else if (current && field === 'crawl-delay') {
      const d = Number(value);
      if (Number.isFinite(d)) current.delay = d;
    }
  }
  return groups;
}

function ruleMatches(pattern, path) {
  if (pattern === '') return false;
  let anchored = false;
  let p = pattern;
  if (p.endsWith('$')) { anchored = true; p = p.slice(0, -1); }
  const parts = p.split('*');
  let pos = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '') { if (i === 0) continue; else continue; }
    const at = i === 0 ? (path.startsWith(part) ? 0 : -1) : path.indexOf(part, pos);
    if (at < 0) return false;
    pos = at + part.length;
  }
  if (anchored) return pos === path.length;
  return true;
}

/** @returns {{allowed:boolean, delay:number, rule:string|null}} */
export function robotsVerdict(groups, uaToken, path) {
  const ua = uaToken.toLowerCase();
  let chosen = groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  if (!chosen) chosen = groups.find((g) => g.agents.includes('*'));
  if (!chosen) return { allowed: true, delay: 0, rule: null };

  let best = null;
  for (const rule of chosen.rules) {
    if (!ruleMatches(rule.path, path)) continue;
    const len = rule.path.replace(/\$$/, '').length;
    if (!best || len > best.len || (len === best.len && rule.allow && !best.allow)) {
      best = { len, allow: rule.allow, path: rule.path };
    }
  }
  return {
    allowed: best ? best.allow : true,
    delay: chosen.delay || 0,
    rule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` : null,
  };
}

/** Anything a fetched file said that looked like it was talking to us. */
export const curiosities = [];

async function robotsFor(origin, opts) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  const promise = (async () => {
    try {
      const { res } = await fetchFollowing(`${origin}/robots.txt`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain,*/*' },
        signal: AbortSignal.timeout(opts.timeoutMs),
      }, []);
      if (res.status >= 400) return [];       // no robots.txt is permission
      const text = await res.text();
      // robots.txt is exactly where the A24 shopping-skill prompt was found.
      // Note it, ignore it, parse only the directives robots.txt actually has.
      const hit = scanForAgentDirectives(text, 20000);
      if (hit) curiosities.push({ where: `${origin}/robots.txt`, text: hit });
      return parseRobots(text);
    } catch {
      // A robots.txt we cannot read is not permission to ignore it, but it is
      // also not evidence of a prohibition. Treat as empty.
      return [];
    }
  })();
  robotsCache.set(origin, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const lastHitByOrigin = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Registrable domain, approximated as the last two labels. Good enough for the
 * hosts in this project (.com, .org, .nyc, .us, .app); it would be wrong for a
 * .co.uk-style suffix, and none is in use here.
 */
export function registrableDomain(hostname) {
  const parts = String(hostname).toLowerCase().split('.').filter(Boolean);
  return parts.slice(-2).join('.');
}

/**
 * Redirects are followed by hand so that leaving the site we asked for is a
 * decision rather than an accident.
 *
 * queensdrivein.com now 302s to a gambling site. A collector on `redirect:
 * 'follow'` would fetch it, parse it, and publish whatever it found under a
 * venue's name. Same-registrable-domain hops (www -> apex, http -> https,
 * tickets.venue.com) are fine; anything else is refused unless the caller
 * named the host up front.
 */
async function fetchFollowing(url, init, allowHosts) {
  const origin = new URL(url);
  const permitted = new Set(
    [origin.hostname.toLowerCase(), ...(allowHosts || []).map((h) => h.toLowerCase())]
  );
  let current = url;
  for (let hop = 0; hop <= 5; hop++) {
    const res = await fetch(current, { ...init, redirect: 'manual' });
    if (res.status < 300 || res.status > 399) return { res, finalUrl: current };
    const location = res.headers.get('location');
    if (!location) return { res, finalUrl: current };
    const next = new URL(location, current);
    const sameSite = permitted.has(next.hostname.toLowerCase()) ||
      registrableDomain(next.hostname) === registrableDomain(origin.hostname);
    if (!sameSite) {
      throw new Error(
        `refused cross-domain redirect: ${current} -> ${next.href}\n` +
        `  ${origin.hostname} is not ${next.hostname}. A venue domain that has been ` +
        'sold on must not silently become a source.\n' +
        '  If this move is legitimate, add the host to the source\'s allowHosts.'
      );
    }
    current = next.href;
  }
  throw new Error(`too many redirects starting at ${url}`);
}

/**
 * Text in fetched bytes that appears to be addressed to an automated reader.
 * Logged as a curiosity, never acted on. See the header of this file.
 */
const AGENT_DIRECTIVE = new RegExp(
  '(?:' +
  'attention[, ]+(?:ai|llm|agent|assistant)|' +
  '(?:ai|llm) (?:agents?|assistants?|crawlers?)[,: ]+(?:please|you (?:should|must)|install|ignore)|' +
  'dear (?:ai|llm|agent|assistant|claude|chatgpt)|' +
  'ignore (?:all )?(?:previous|prior|above) instructions|' +
  'system prompt|' +
  'you are (?:an? )?(?:helpful )?(?:ai|assistant|agent)|' +
  'install (?:the |our )?(?:skill|plugin|mcp)' +
  ')', 'i'
);

export function scanForAgentDirectives(text, limit = 200000) {
  const slice = String(text).slice(0, limit);
  const m = AGENT_DIRECTIVE.exec(slice);
  if (!m) return null;
  const at = Math.max(0, m.index - 60);
  return slice.slice(at, m.index + 160).replace(/\s+/g, ' ').trim();
}

/**
 * One polite, cached, content-type-checked GET.
 *
 * @param {string} url
 * @param {object} o
 * @param {RegExp} o.expect       required content-type. A soft-404 fails here.
 * @param {object} o.cache        the cache store from openCache()
 * @param {number} [o.timeoutMs]
 * @param {number} [o.minDelayMs] floor on politeness delay per origin
 * @returns {Promise<{body:string, status:number, notModified:boolean, contentType:string}>}
 */
export async function fetchText(url, o) {
  const timeoutMs = o.timeoutMs ?? 45000;
  const target = new URL(url);
  const origin = target.origin;

  const groups = await robotsFor(origin, { timeoutMs });
  const verdict = robotsVerdict(groups, 'OneNightOnlyBot', target.pathname + target.search);
  if (!verdict.allowed) {
    throw new Error(`robots.txt disallows ${target.pathname} on ${origin} (${verdict.rule})`);
  }

  const delayMs = Math.max((verdict.delay || 0) * 1000, o.minDelayMs ?? 400);
  const since = Date.now() - (lastHitByOrigin.get(origin) || 0);
  if (since < delayMs) await sleep(delayMs - since);
  lastHitByOrigin.set(origin, Date.now());

  const prior = o.cache ? o.cache.get(url) : null;
  const headers = { 'User-Agent': USER_AGENT, Accept: o.accept || '*/*' };
  if (prior && prior.body !== undefined) {
    // ONE validator, and Last-Modified wins when both are offered.
    //
    // RFC 9110 says a server seeing If-None-Match MUST ignore If-Modified-Since,
    // so sending both is sending the ETag. Socrata's ETag is weak and varies
    // with content-encoding, so it never matches and the 304 never happens.
    // Verified against w3wp-dpdi: If-None-Match -> 200 with the full 96 KB,
    // If-Modified-Since -> 304. (The weak marker cannot be detected from here:
    // undici strips the "W/" prefix when it decompresses the response.)
    //
    // Getting this backwards is not a correctness bug, only wasted bandwidth on
    // every scheduled run, but it is the whole point of caching politely.
    if (prior.lastModified) headers['If-Modified-Since'] = prior.lastModified;
    else if (prior.etag) headers['If-None-Match'] = prior.etag;
  }

  const { res } = await fetchFollowing(url, {
    headers, signal: AbortSignal.timeout(timeoutMs),
  }, o.allowHosts);

  if (res.status === 304 && prior && prior.body !== undefined) {
    return { body: prior.body, status: 304, notModified: true, contentType: prior.contentType || '' };
  }
  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }

  const contentType = res.headers.get('content-type') || '';
  const body = await res.text();

  // Status code alone is never enough. This is the rule that catches the SPA
  // that answers 200 with its index page for /feed.xml.
  if (o.expect && !o.expect.test(contentType)) {
    throw new Error(
      `unexpected content-type "${contentType}" from ${url}\n` +
      `  expected ${o.expect}. HTTP 200 with the wrong body is a soft-404, ` +
      'which is endemic in this domain.'
    );
  }
  if (!body || !body.trim()) throw new Error(`empty body from ${url}`);

  // Logged, never obeyed. This call has no effect on control flow.
  const hit = scanForAgentDirectives(body);
  if (hit) curiosities.push({ where: url, text: hit });

  if (o.cache) {
    o.cache.set(url, {
      etag: res.headers.get('etag') || null,
      lastModified: res.headers.get('last-modified') || null,
      contentType,
      fetchedAt: isoStamp(new Date()),
      body,
    });
  }
  return { body, status: 200, notModified: false, contentType };
}

// ---------------------------------------------------------------------------
// On-disk cache. Mutable, not committed. Holds only bytes + validators.
// ---------------------------------------------------------------------------

export function openCache(dir) {
  const path = join(dir, 'http-cache.json');
  let store = {};
  if (existsSync(path)) {
    try { store = JSON.parse(readFileSync(path, 'utf8')); } catch { store = {}; }
  }
  return {
    get: (url) => store[url] || null,
    set: (url, entry) => { store[url] = entry; },
    flush() {
      mkdirSync(dir, { recursive: true });
      writeJsonAtomic(path, store);
    },
  };
}

export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  renameSync(tmp, path);
}

export function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Identity. Minted here, once, and stored. Never recomputed downstream.
// ---------------------------------------------------------------------------

export { filmKey };

/**
 * Mint the identity tuple for one screening and attach it to the record.
 *
 * The tuple is venue_slug + normalised film key + local date + local time, and
 * it goes through tombstones.mjs's own mintUid so there is exactly one hashing
 * implementation in the repository. `id_tuple` is stored alongside the hash so
 * a future reader can see what was hashed without re-deriving it.
 */
export function mintIdentity(rec) {
  if (!LOCAL_RE.test(rec.start_local)) {
    throw new Error(`mintIdentity: bad start_local ${JSON.stringify(rec.start_local)}`);
  }
  const key = rec.film_key || filmKey(rec.title);
  const { uid, hash, tuple } = mintUid(rec.venue_slug, key, rec.start_local);
  return { ...rec, film_key: key, uid, hash, id_tuple: tuple, guid: guidFor(hash) };
}

export const guidFor = (hash) => `tag:middleton.io,2026:screening/${hash}`;
export const runGuidFor = (hash) => `tag:middleton.io,2026:run/${hash}`;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * The Film Forum trap, made mechanical.
 *
 * Film Forum publishes perfectly-formed ScreeningEvent JSON-LD in which every
 * startDate is an empty string. A collector that trusts the shape of the data
 * reports success and returns nothing. So: if a source emitted raw items but
 * none of them survived time parsing, that is a parse failure, not an empty
 * calendar, and it must be loud.
 */
export function assertParsedTimes(sourceId, rawCount, records, droppedNoTime) {
  for (const r of records) {
    if (!LOCAL_RE.test(String(r.start_local || ''))) {
      throw new Error(
        `${sourceId}: emitted a record with an unusable start_local ` +
        `${JSON.stringify(r.start_local)} for ${JSON.stringify(r.title)}`
      );
    }
  }
  if (rawCount > 0 && records.length === 0) {
    throw new Error(
      `${sourceId}: parsed ${rawCount} raw items and produced ZERO usable start times ` +
      `(${droppedNoTime} dropped for an unparseable time).\n` +
      '  This is the Film Forum failure mode: well-formed records, empty times.\n' +
      '  Refusing to report success. Fix the time parse before publishing.'
    );
  }
  if (droppedNoTime > 0 && droppedNoTime > records.length) {
    throw new Error(
      `${sourceId}: dropped ${droppedNoTime} items for an unparseable time but kept ` +
      `only ${records.length}. More than half the source failed to parse; that is a ` +
      'parser bug, not a quiet day.'
    );
  }
}

/**
 * NYC Parks' silent date trap, made mechanical: `starttime` carries the right
 * time and the wrong date (it is pinned to the feed's generation date on 90% of
 * rows). A collector that parses it as a datetime stacks a fortnight of
 * screenings onto today, and nothing errors.
 */
export function assertDateSpread(sourceId, records, minDistinct = 2) {
  if (records.length < 5) return;
  const distinct = new Set(records.map((r) => r.start_local.slice(0, 10)));
  if (distinct.size < minDistinct) {
    throw new Error(
      `${sourceId}: ${records.length} screenings collapsed onto ${distinct.size} distinct ` +
      `date(s) (${[...distinct].join(', ')}).\n` +
      '  That is what happens when a feed\'s time field carries a fake date. ' +
      'Take the date from the date field and the time-of-day from the time field.'
    );
  }
}

export function assertWindow(sourceId, records, earliest, latest) {
  for (const r of records) {
    const d = r.start_local.slice(0, 10);
    if (d < earliest || d > latest) {
      throw new Error(
        `${sourceId}: screening ${JSON.stringify(r.title)} lands on ${d}, outside the ` +
        `source's declared window ${earliest}..${latest}. Refusing to publish it.`
      );
    }
  }
}
