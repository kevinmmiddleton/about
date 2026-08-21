#!/usr/bin/env node
// collect.mjs - the collector. Zero dependencies.
//
// Fetches every source, normalises to one record shape, mints identity once,
// writes data/collected.json, and hands that to tombstones.mjs, which produces
// data/screenings.json for build.mjs.
//
//   sources -> collect.mjs -> data/collected.json
//                                  |
//                                  v
//                          tombstones.mjs -> data/screenings.json -> build.mjs
//
// Identity is minted HERE and stored, never recomputed downstream:
//
//   uid / hash / id_tuple   venue_slug + film_key + local date + local time,
//                           hashed by tombstones.mjs's own mintUid so there is
//                           one implementation, not two.
//   run_key / run_guid      so the RSS renderer can collapse a five-night run
//                           into one item without minting an identity in a
//                           renderer, which output-spec.md section 1.4 warns
//                           against at length.
//   first_emitted_at        so RSS items age one-directionally. Once set for a
//                           uid it is read back out of the committed dataset
//                           and never moves, so an item that drops out of the
//                           50-item cap and returns does not re-notify.
//   venue / programmer      separate fields. The room you go to, and who put it
//                           on. PROGRAMMERS.md: A24 programmes Cherry Lane and
//                           other rooms; Rooftop Films programmes a cemetery,
//                           a school and a plaza. Identity stays venue-based so
//                           a programmer rename cannot duplicate an event.
//
// Failure policy, which is deliberately asymmetric:
//
//   A source that ERRORS keeps its last good data and is marked stale. The run
//   continues and the site keeps working. (rule 5)
//
//   A source that SUCCEEDS and returns zero where it previously returned many
//   aborts the whole run and writes nothing. That is the Film Forum trap: a
//   clean parse, a confident success, and an empty calendar. Publishing an
//   empty day is worse than publishing nothing at all, because subscribers
//   would see every screening cancelled. (rule 2)
//
// Security, per ARCHITECTURE.md:
//
//   Every URL this collector will ever fetch is a compile-time constant in this
//   repository - the Elevent tenant allowlist, the Luma calendar ids, the two
//   API bases, the Paris homepage. Nothing in a response body can add a source,
//   redirect the crawl, or change what is published. Text found in fetched
//   files that appears to address an automated reader is logged at the end of
//   the run as a curiosity and otherwise ignored. Cross-domain redirects are
//   refused in common.mjs rather than followed.
//
// Usage:
//   node build/collect/collect.mjs [--data-dir data] [--only a,b] [--skip a,b]
//                                  [--simulate-empty <source>] [--accept-zero <source>]
//                                  [--dry-run] [--list-elevent-tenants]
//
// Env:
//   ONO_NOW   ISO instant used as "now". Test hook, for reproducible runs.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { reconcile } from '../tombstones.mjs';
import {
  openCache, writeJsonAtomic, readJson, now as clockNow, isoStamp, localDate,
  shiftDate, mintIdentity, runGuidFor, sha16, filmKey, LOCAL_RE, CARRY_BACK_DAYS,
  USER_AGENT, fetchText, curiosities, localStampNow,
} from './common.mjs';
import { venueEntry, canonicalSlug } from './venue-book.mjs';

import * as elevent from './source-elevent.mjs';
import * as repertoryNyc from './source-repertory-nyc.mjs';
import * as nycParks from './source-nyc-parks.mjs';
import * as parisTheater from './source-paris-theater.mjs';
import * as luma from './source-luma.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// Priority order. First one to claim a UID keeps it; later sources are treated
// as duplicates of the same screening, not as a second screening.
const SOURCES = [elevent, repertoryNyc, nycParks, parisTheater, luma];

const GUARD = {
  // A source that has ever produced at least this many records may never
  // silently return zero.
  zeroFloor: 1,
  // A source whose previous good run produced at least this many records must
  // not drop below `collapseRatio` of it without a human saying so.
  collapseFloor: 8,
  collapseRatio: 0.25,
  // Days between two showings of the same film at the same venue that still
  // count as one run for RSS collapsing.
  runGapDays: 7,
  // The one-night-only filter. A film that plays this many distinct dates or
  // fewer at a venue is a limited engagement. See assignLimited().
  limitedMaxDates: 2,
  // The series clause. A film on this many dates or fewer still qualifies as
  // long as no single date carries more than `seriesMaxPerDate` showtimes.
  // Three scattered single showings is a repertory series; three days of four
  // showings each is a run.
  seriesMaxDates: 3,
  seriesMaxPerDate: 1,
  // The vintage rule. A film counts as repertory if it was released at least
  // this many calendar years before the year the collector is running in.
  //
  // 2 means: run in 2026, a 2026 or 2025 release is first-run and a 2024
  // release or older is repertory. Written as an AGE rather than as a fixed
  // cutoff year on purpose, so it ages correctly on 1 January without anyone
  // editing this file. See assignVintage().
  vintageMinAgeYears: 2,
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const a = {
    dataDir: null, only: null, skip: [], simulateEmpty: [], acceptZero: [],
    dryRun: false, listTenants: false,
  };
  const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--data-dir') a.dataDir = argv[++i];
    else if (arg === '--only') a.only = list(argv[++i]);
    else if (arg === '--skip') a.skip = list(argv[++i]);
    else if (arg === '--simulate-empty') a.simulateEmpty = a.simulateEmpty.concat(list(argv[++i]));
    else if (arg === '--accept-zero') a.acceptZero = a.acceptZero.concat(list(argv[++i]));
    else if (arg === '--dry-run') a.dryRun = true;
    else if (arg === '--list-elevent-tenants') a.listTenants = true;
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0); }
    else { process.stderr.write(`collect: unknown argument ${arg}\n`); process.exit(2); }
  }
  if (process.env.ONO_ACCEPT_ZERO) a.acceptZero = a.acceptZero.concat(list(process.env.ONO_ACCEPT_ZERO));
  return a;
}

function usage() {
  process.stdout.write(
    'usage: node build/collect/collect.mjs [options]\n' +
    '  --data-dir <dir>          where data/ lives (default ../../data)\n' +
    '  --only a,b                run only these sources\n' +
    '  --skip a,b                skip these sources\n' +
    '  --simulate-empty <src>    pretend a source returned nothing (guard test)\n' +
    '  --accept-zero <src>       acknowledge a genuine empty source (Parks in winter)\n' +
    '  --dry-run                 print the report, write nothing\n' +
    '  --list-elevent-tenants    print the live Elevent tenant directory and exit\n' +
    `sources: ${SOURCES.map((s) => s.id).join(', ')}\n`
  );
}

// ---------------------------------------------------------------------------
// Run one source
// ---------------------------------------------------------------------------

async function runSource(mod, ctx, args) {
  const started = Date.now();
  if (args.simulateEmpty.includes(mod.id)) {
    return {
      id: mod.id, ok: true, simulated: true,
      screenings: [], venues: [], filmYears: null,
      stats: { raw: 0, kept: 0 }, notes: ['SIMULATED EMPTY'],
      ms: 0,
    };
  }
  try {
    const out = await mod.collect(ctx);
    return {
      id: mod.id, ok: true,
      screenings: out.screenings || [], venues: out.venues || [],
      filmYears: out.filmYears || null,
      stats: out.stats || {}, notes: out.notes || [], ms: Date.now() - started,
    };
  } catch (err) {
    return {
      id: mod.id, ok: false, error: err && err.message ? err.message : String(err),
      screenings: [], venues: [], filmYears: null, stats: {}, notes: [],
      ms: Date.now() - started,
    };
  }
}

// ---------------------------------------------------------------------------
// Identity assignment
// ---------------------------------------------------------------------------

/**
 * run_key / run_guid.
 *
 * A run is the same film at the same venue on nights no more than runGapDays
 * apart. The key is venue + film + the first local date of that run, exactly as
 * build/README.md's "Known gaps" section proposes.
 *
 * The important property is that it is STICKY. Once a uid has a run_guid in the
 * committed dataset it keeps it forever, so a run that grows an earlier night
 * does not change identity and re-notify every RSS subscriber. Only genuinely
 * new uids that join no existing run get a freshly minted one.
 */
function assignRuns(records, priorByUid) {
  const groups = new Map();
  for (const r of records) {
    const g = `${r.venue_slug}\u0000${r.film_key}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  for (const [, members] of groups) {
    members.sort((a, b) => (a.start_local < b.start_local ? -1 : a.start_local > b.start_local ? 1 : 0));
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const inherited = run
        .map((r) => priorByUid.get(r.uid))
        .find((p) => p && p.run_guid && p.run_key);
      const key = inherited
        ? inherited.run_key
        : `${run[0].venue_slug}|${run[0].film_key}|${run[0].start_local.slice(0, 10)}`;
      const guid = inherited ? inherited.run_guid : runGuidFor(sha16(key));
      for (const r of run) { r.run_key = key; r.run_guid = guid; }
      run = [];
    };
    for (const r of members) {
      if (!run.length) { run.push(r); continue; }
      const prev = run[run.length - 1].start_local.slice(0, 10);
      const gap = daysBetween(prev, r.start_local.slice(0, 10));
      if (gap <= GUARD.runGapDays) run.push(r);
      else { flush(); run.push(r); }
    }
    flush();
  }
  return records;
}

/**
 * limited / dates_at_venue - the one-night-only filter.
 *
 * POSITIONING.md, "The overflow": a film playing sixteen showtimes over a
 * fortnight at Film Forum is not a one-night-only screening. It is a run, three
 * other aggregators already cover it, and it is not what this site is for.
 *
 * A screening qualifies if its film plays on two or fewer DISTINCT DATES at
 * that venue inside the collection window, OR on three dates with no more than
 * one showtime on any of them. Four showtimes on one Saturday is one date and
 * qualifies. A Friday-and-Saturday pairing qualifies. A week-long run does not.
 *
 * The three-date clause is an amendment (POSITIONING.md, "Amendment, after the
 * first live run"). The flat two-date rule dropped MAD DOG MORGAN at Anthology:
 * three scattered dates, one showtime on each. That is a repertory series, not
 * an engagement, and it is precisely the thing someone misses. What separates a
 * run from a series is showtimes per day, not days. Seven dates and twenty-six
 * showtimes is an engagement; three dates and three showtimes is a series you
 * attend once. The clause deliberately does not extend to four dates: at four
 * the pattern stops being distinguishable from a light weekly booking, and the
 * cost of a wrong call there is a run in a calendar that promises one-offs.
 *
 * Matched on venue_slug + film_key, the same basis as the UID tuple, so a
 * screening's qualification and its identity are computed off the same idea of
 * "the same film in the same room". Nothing here touches the UID.
 *
 * Computed over EVERY record in the collection, carried-forward past dates
 * included. That matters at the window boundary: repertory.nyc publishes a
 * rolling fortnight, so a run that started before the window would otherwise
 * look like a one-off on its last two nights. Once the dataset has history the
 * earlier dates are still there and the count is right.
 *
 * Recomputed every run rather than made sticky, deliberately. A screening
 * demoted from limited to a run simply stops appearing in the calendar and the
 * feed. That is safe here in a way a vanished CANCELLED event would not be: the
 * screening still happens, at the same time, in the same room, so a subscriber
 * whose client keeps the stale entry is holding a correct one. The alternative,
 * publishing a demotion as a cancellation, would be a lie.
 *
 * The residual inaccuracy is the far edge of the window: a run that begins on
 * the last day or two we can see looks limited until the next fortnight
 * arrives. Measured on the first live collection, 10 of 256 qualifying groups
 * touched that edge.
 */
/**
 * Collapse one screening that a source described twice under variant titles.
 *
 * repertory.nyc emits some rows twice: once under the film's own title and
 * once with the series name appended or the programme name prepended.
 *
 *   "Crank - 35MM"              /  "Crank - 35MM | 2006 Movies"
 *   "PGM 2: ENCORE SCREENINGS"  /  "GANZ + STREETER, PGM 2: ENCORE SCREENINGS"
 *
 * They normalise to different film_keys, so they mint different UIDs and the
 * exact-match dedupe in main() never sees them. Measured on the first live
 * collection: 13 such pairs in 1,133 records.
 *
 * This runs deliberately late, over the whole set including carried-forward
 * records. Running it before carry-forward would drop a duplicate and then let
 * carry-forward resurrect it from the stored dataset on the next run.
 *
 * FOUR conditions, all required. Merging two genuinely different screenings is
 * much worse than leaving a duplicate, so this is built to under-merge:
 *
 *   1. Same venue_slug.
 *   2. Same start_local, to the minute. Two rows disagreeing about the time are
 *      NOT merged; picking one would be inventing a showtime, which is the one
 *      thing this collector never does. See the note below.
 *   3. One film_key is a strict prefix or a strict suffix of the other at a
 *      token boundary. Substring-anywhere is not enough.
 *   4. Byte-identical `url`. This is the condition that makes the rest safe.
 *      For repertory.nyc the URL carries the ticketing system's own showing id
 *      (`.../purchase/7681`, `...#showing-61615`), and two different films
 *      cannot share one. Without it, a token-boundary prefix test would happily
 *      merge "Alien" with "Alien 3", or a suffix test "Dracula" with "Bram
 *      Stoker's Dracula", if a multiplex ever started them in the same minute.
 *
 * The shorter film_key wins, because the extra material is programme or series
 * decoration and the bare film title is the one that will match the same film
 * at another venue. The loser is dropped whole; no field is copied across, so
 * nothing about the surviving record changes and its updated_at does not move.
 *
 * Known residue, left alone on purpose. Some of these pairs ALSO appear with
 * the two rows disagreeing about the start time by half an hour (Crank at Roxy
 * on 22 Aug, 16:30 against 17:00, both under ticket id 7681). Condition 2
 * refuses those. They stay as two listings, which is honest: the source gives
 * two times and we have no basis to choose. Reporting them is the fix, not
 * guessing.
 */
function collapseTitleVariants(records, log) {
  const byInstant = new Map();
  for (const r of records) {
    const k = `${r.venue_slug}|${r.start_local}`;
    if (!byInstant.has(k)) byInstant.set(k, []);
    byInstant.get(k).push(r);
  }

  const drop = new Set();
  const merges = [];
  for (const group of byInstant.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (drop.has(a.uid) || drop.has(b.uid)) continue;
        if (!a.url || !b.url || a.url !== b.url) continue;
        if (!isTitleVariant(a.film_key, b.film_key)) continue;
        // Shorter key wins; length ties cannot happen for a strict prefix or
        // suffix, but tie-break lexicographically anyway so the choice is
        // deterministic whatever the input order.
        const [keep, lose] = a.film_key.length !== b.film_key.length
          ? (a.film_key.length < b.film_key.length ? [a, b] : [b, a])
          : (a.film_key < b.film_key ? [a, b] : [b, a]);
        drop.add(lose.uid);
        merges.push({ keep, lose });
      }
    }
  }

  if (log && merges.length) {
    log(`\n  title-variant duplicates merged: ${merges.length}`);
    for (const m of merges) {
      log(`    ${m.keep.venue_slug} ${m.keep.start_local}`);
      log(`      kept    "${m.keep.title}"  [${m.keep.film_key}]`);
      log(`      dropped "${m.lose.title}"  [${m.lose.film_key}]`);
      log(`      both at ${m.keep.url}`);
    }
  }

  return { records: records.filter((r) => !drop.has(r.uid)), merges };
}

/** Strict prefix or strict suffix at a token boundary. Never a bare substring. */
function isTitleVariant(a, b) {
  if (!a || !b || a === b) return false;
  return b.startsWith(`${a}-`) || a.startsWith(`${b}-`) ||
         b.endsWith(`-${a}`) || a.endsWith(`-${b}`);
}

function assignLimited(records) {
  // venue+film -> Map(date -> showtimes on that date)
  const groups = new Map();
  for (const r of records) {
    const k = `${r.venue_slug} ${r.film_key}`;
    if (!groups.has(k)) groups.set(k, new Map());
    const perDate = groups.get(k);
    const date = r.start_local.slice(0, 10);
    perDate.set(date, (perDate.get(date) || 0) + 1);
  }
  for (const r of records) {
    const perDate = groups.get(`${r.venue_slug} ${r.film_key}`);
    const n = perDate.size;
    const maxPerDate = Math.max(...perDate.values());
    r.dates_at_venue = n;
    r.max_showtimes_per_date = maxPerDate;
    r.limited = n <= GUARD.limitedMaxDates ||
      (n <= GUARD.seriesMaxDates && maxPerDate <= GUARD.seriesMaxPerDate);
  }
  return records;
}

/**
 * vintage - the repertory rule.
 *
 * The product is repertory: an old film returning to a screen. A first-run
 * release playing a one-off preview is not that, however limited the
 * engagement. `limited` already removes most first-run, because a new release
 * plays a run, but it lets through the previews, the festival premieres and the
 * single-night documentary bookings.
 *
 * A screening is vintage if its film was released at least
 * `GUARD.vintageMinAgeYears` calendar years before the year this run happens
 * in. The current year and the previous one are first-run; everything older is
 * repertory. The previous year is included because a film released in December
 * is still touring first-run screens the following autumn.
 *
 * THREE FIELDS ARE WRITTEN, and the second two exist so the call is auditable:
 *
 *   vintage           true / false
 *   vintage_year      the year the decision was made on, omitted if unknown
 *   vintage_year_from 'source' | 'title' | 'catalog', omitted if unknown
 *
 * The year is taken from, in order:
 *   1. `year` on the record, as the source supplied it.
 *   2. A four-digit year in parentheses inside the title. NYC Parks writes
 *      "The Princess and the Frog (2009) - Rated G" and repertory.nyc passes
 *      through "Metropolis (1927)". Read ONLY, never stripped: the title feeds
 *      film_key, which feeds the UID, so editing it here would duplicate the
 *      event on every subscriber's calendar.
 *   3. repertory.nyc's film catalog, keyed by film_key. See filmYearIndex() in
 *      source-repertory-nyc.mjs for why that recovers years the screening rows
 *      do not carry, and for the ambiguity rule.
 *
 * `year` itself is left exactly as the source gave it. The recovered year lives
 * in `vintage_year` instead, and deliberately so: `year` is rendered into the
 * VEVENT SUMMARY, so writing to it would move `updated_at` and re-notify
 * subscribers for 103 records over a field they cannot see the point of.
 * `vintage_year` renders nowhere, exactly like `dates_at_venue`.
 *
 * UNKNOWN YEAR IS PUBLISHED, NOT DROPPED. This was the open question, and the
 * obvious answer turned out to be wrong, so it is worth writing down why.
 *
 * The worry was that a missing year means a film too new to have been
 * catalogued, which would make "keep the unknowns" keep exactly what this rule
 * exists to remove. Four titles suggested it: Freefall: A Reckoning for Boeing,
 * Wild Inside, Maddie's Secret, Union County. All four are IFC Center.
 *
 * A random sample of 50 of the unknown-year films was looked up one by one
 * rather than assumed. The result does not support the worry:
 *
 *   20 of 50   are NOT A SINGLE FILM at all: a shorts programme, a festival
 *              day, a series banner, a double bill, a book launch. Of those,
 *              7 screen pre-2000 archival work, 6 screen contemporary work,
 *              5 are mixed, 2 could not be determined (one is a surprise
 *              screening by design).
 *   30 of 50   are a single film, and the era split is almost flat:
 *              12 pre-2000, 9 from 2000-2024, 9 from 2025 or later.
 *
 * So a missing year does not correlate with recency. It correlates with not
 * being one film with one release date, and secondarily with house style:
 * Anthology omits the year on everything it programmes, canon or premiere. The
 * genuinely-recent slice is real but small and venue-shaped - NYC Parks' new
 * family blockbusters and a handful of arthouse premieres - and step 3 above
 * resolves a good part of it, including all four of the titles that raised the
 * question.
 *
 * Dropping unknowns would therefore cost far more than it saves. 195 of the 550
 * records that pass `limited` still have no year after all three lookups, and
 * 101 of those 195 are Anthology Film Archives, with Film Forum's Coppola
 * season, BAM's archival double bills and the Paris's introduced revivals
 * making up much of the rest. On the sampled proportions that trade would
 * delete roughly four repertory listings to remove one first-run listing.
 *
 * The two failure modes are not symmetric either. Publishing a first-run
 * preview is a listing a reader can see and ignore. Deleting a Dreyer
 * retrospective from a calendar that exists to carry exactly that is the product
 * failing silently. build.mjs's `qualifies()` resolves the same asymmetry the
 * same way: when one of two failure modes is unrecoverable, default towards the
 * other one.
 *
 * An unknown-year record is therefore `vintage: true` with `vintage_year: null`,
 * which build.mjs renders as "Year unknown" so nobody mistakes it for a checked
 * claim. The known, accepted cost: Scandinavia House's "New Nordic Cinema" is
 * new films and publishes anyway, because Elevent's tenants leave `ReleaseYear`
 * null on every event even though the field exists and this collector reads it.
 * Written down rather than papered over with a venue blocklist, which is the
 * proxy POSITIONING.md already rejected once.
 *
 * Recomputed every run and NOT identity, exactly like `limited`. A record whose
 * vintage flips simply stops appearing in the calendar and the feed; the
 * screening still happens, so a subscriber holding the stale entry holds a
 * correct one.
 */
function assignVintage(records, filmYears, runYear) {
  const newestVintageYear = runYear - GUARD.vintageMinAgeYears;
  const counts = { source: 0, title: 0, catalog: 0, unknown: 0, vintage: 0, recent: 0 };
  for (const r of records) {
    let year = null;
    let from = null;
    if (Number.isInteger(r.year) && r.year >= 1880 && r.year <= 2100) {
      year = r.year; from = 'source';
    } else {
      const inTitle = yearInTitle(r.title);
      if (inTitle) { year = inTitle; from = 'title'; }
      else {
        const cat = filmYears.get(r.film_key);
        if (Number.isInteger(cat)) { year = cat; from = 'catalog'; }
      }
    }

    if (year === null) {
      // Unclassifiable. Published and marked, never dropped.
      //
      // Written as explicit nulls rather than left absent. tombstones.mjs
      // copies a collected field only when it is not `undefined`, so an absent
      // field would let a PREVIOUS run's year survive on the stored record: a
      // failed catalog lookup would leave "Released 2026" printed beside a
      // record this run is publishing as repertory. See KEEP_NULL in
      // orderFields().
      r.vintage = true;
      r.vintage_year = null;
      r.vintage_year_from = null;
      counts.unknown++;
      counts.vintage++;
      continue;
    }
    r.vintage = year <= newestVintageYear;
    r.vintage_year = year;
    r.vintage_year_from = from;
    counts[from]++;
    if (r.vintage) counts.vintage++; else counts.recent++;
  }
  return { counts, newestVintageYear };
}

/**
 * A four-digit year in parentheses anywhere in the title. READ ONLY.
 *
 * The title is never rewritten here. `filmKey(title)` feeds the UID, and a
 * changed UID is a permanent duplicate on every subscriber's calendar. NYC
 * Parks' own splitProgrammer() does strip a trailing "(2001)" at parse time,
 * which is fine because it happens before identity is minted; this does not,
 * because it happens after.
 */
function yearInTitle(title) {
  const m = /\((1[89]\d\d|20\d\d)\)/.exec(String(title || ''));
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1880 && y <= 2100 ? y : null;
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // The published layout of the `about` repo, resolved from this file. HERE is
  // tools/one-night-only/collect, so three levels up is the repo root.
  const dataDir = resolve(args.dataDir ||
    join(HERE, '..', '..', '..', 'one-night-only', '_data'));
  const cacheDir = join(dataDir, '.cache');
  const datasetPath = join(dataDir, 'screenings.json');
  const collectedPath = join(dataDir, 'collected.json');
  const statePath = join(dataDir, 'source-state.json');
  const sourcesPath = join(dataDir, 'sources.json');

  const nowDate = clockNow();
  const nowIso = isoStamp(nowDate);
  const today = localDate(nowDate);
  const cache = openCache(cacheDir);
  const ctx = {
    now: nowDate, today, cache,
    report: (tag, msg) => log(`  ${tag}: ${msg}`),
  };

  const out = [];
  const log = (s) => out.push(s);
  ctx.report = (tag, msg) => log(`    ${tag}: ${msg}`);

  log(`collect: ${nowIso}  (New York date ${today})`);
  log(`  user-agent: ${USER_AGENT}`);

  if (args.listTenants) {
    const res = await fetchText('https://www.goelevent.com/', {
      cache, expect: /text\/html/i, accept: 'text/html,*/*',
    });
    const slugs = elevent.parseDirectory(res.body);
    process.stdout.write(`${slugs.length} Elevent tenants:\n${slugs.join('\n')}\n`);
    cache.flush();
    return;
  }

  const previous = readJson(datasetPath, { version: 1, venues: {}, screenings: [] });
  const state = readJson(statePath, { version: 1, sources: {} });
  state.sources = state.sources || {};

  const priorByUid = new Map();
  for (const s of previous.screenings || []) priorByUid.set(s.uid, s);

  // --- fetch -------------------------------------------------------------
  const selected = SOURCES.filter((m) =>
    (!args.only || args.only.includes(m.id)) && !args.skip.includes(m.id));
  const notRun = SOURCES.filter((m) => !selected.includes(m)).map((m) => m.id);

  const results = [];
  for (const mod of selected) {
    log(`\n  [${mod.id}] ${mod.label}`);
    const r = await runSource(mod, ctx, args);
    results.push(r);
    if (r.ok) {
      log(`    ok: ${r.stats.kept ?? r.screenings.length} screening(s) from ` +
        `${r.stats.raw ?? '?'} raw item(s) in ${r.ms}ms`);
      if (r.stats.tenants) {
        const live = Object.entries(r.stats.tenants).filter(([, n]) => n > 0);
        log(`    tenants with a catalogue: ${live.map(([k, n]) => `${k}=${n}`).join(', ') || 'none'}`);
      }
      if (r.stats.droppedNoTime) log(`    dropped for an unparseable time: ${r.stats.droppedNoTime}`);
      if (r.stats.filtered) log(`    filtered as not-a-screening: ${r.stats.filtered}`);
    } else {
      log(`    FAILED: ${r.error}`);
    }
    for (const n of r.notes) log(`    note: ${n}`);
  }
  cache.flush();

  // --- the zero guard, before anything is written ------------------------
  const violations = [];
  for (const r of results) {
    if (!r.ok) continue;
    const prior = state.sources[r.id] || {};
    const n = r.screenings.length;
    const lastOk = prior.last_ok_count || 0;
    const high = prior.high_water || 0;
    const acked = args.acceptZero.includes(r.id);
    if (n === 0 && high >= GUARD.zeroFloor && !acked) {
      violations.push(
        `${r.id}: returned ZERO screenings. It has previously returned as many as ${high} ` +
        `(last good run: ${lastOk}, ${prior.last_change_at || 'unknown'}).\n` +
        '    A clean parse that yields nothing is the most dangerous failure in this domain:\n' +
        '    it reports success and cancels every screening on every subscriber\'s calendar.\n' +
        `    If this is genuinely an empty source, re-run with --accept-zero ${r.id}.`
      );
    } else if (n > 0 && lastOk >= GUARD.collapseFloor &&
               n < Math.ceil(lastOk * GUARD.collapseRatio) && !acked) {
      violations.push(
        `${r.id}: returned ${n} screening(s), down from ${lastOk} on the last good run ` +
        `(under ${Math.round(GUARD.collapseRatio * 100)}%).\n` +
        '    That is a collapse, not a quiet week. Check the parser before publishing.\n' +
        `    To publish anyway: --accept-zero ${r.id}.`
      );
    }
  }

  if (violations.length) {
    process.stdout.write(out.join('\n') + '\n');
    process.stderr.write(
      '\ncollect: REFUSING TO PUBLISH\n' +
      violations.map((v) => `  ${v}`).join('\n\n') + '\n\n' +
      '  Nothing was written. The committed dataset is untouched and the site\n' +
      '  keeps serving the last good data.\n'
    );
    process.exit(1);
  }

  // --- normalise, mint identity ------------------------------------------
  const venuesRaw = new Map();
  const needAddress = new Set();
  const addVenue = (v) => {
    if (!v || !v.slug) return;
    const { slug, entry, needsAddress } = venueEntry(v);
    const existing = venuesRaw.get(slug);
    if (!existing) venuesRaw.set(slug, entry);
    else {
      // Prefer a real street address and real coordinates over a fallback.
      if (existing.address === 'New York, NY' && entry.address !== 'New York, NY') {
        existing.address = entry.address;
      }
      if (!existing.geo && entry.geo) existing.geo = entry.geo;
      if (!existing.url && entry.url) existing.url = entry.url;
    }
    if (needsAddress) needAddress.add(slug);
    return slug;
  };

  const byUid = new Map();
  const collisions = [];
  const okSourceIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
  const failedSourceIds = new Set(results.filter((r) => !r.ok).map((r) => r.id));

  for (const r of results) {
    if (!r.ok) continue;
    for (const v of r.venues) addVenue(v);
    for (const raw of r.screenings) {
      if (!raw.title || !LOCAL_RE.test(String(raw.start_local || ''))) {
        throw new Error(`${r.id}: record failed final validation: ${JSON.stringify(raw)}`);
      }
      const slug = canonicalSlug(raw.venue_slug);
      if (!venuesRaw.has(slug)) addVenue({ slug, name: raw.venue_slug });
      const rec = mintIdentity({ ...raw, venue_slug: slug });
      const prior = byUid.get(rec.uid);
      if (prior) {
        // Same room, same film, same minute. One screening, however many
        // records described it. Cross-source this is the two aggregators
        // agreeing; within one source it is that source's own duplicate row
        // (repertory.nyc emits some films twice with differing film_year).
        collisions.push(
          `${prior.source === rec.source ? 'within ' + rec.source : `${prior.source} over ${rec.source}`}` +
          `: ${rec.title} @ ${rec.venue_slug} ${rec.start_local}`
        );
        continue;
      }
      byUid.set(rec.uid, rec);
    }
  }

  // --- carry forward -----------------------------------------------------
  // Two reasons a stored screening is re-emitted even though no source
  // returned it this run:
  //   1. It is in the PAST. NYC Parks' window is a rolling fifteen days and
  //      repertory.nyc's is a fortnight, so yesterday's screening simply falls
  //      out of the feed. Dropping it would tombstone it, and telling a
  //      subscriber that last Tuesday's screening was cancelled is nonsense.
  //   2. Its source FAILED or was not run. Rule 5: keep the last good data and
  //      mark it stale rather than letting the venue vanish from the site.
  const carryFloor = shiftDate(today, -CARRY_BACK_DAYS);
  const nowLocal = localStampNow(nowDate);
  let carriedPast = 0;
  let carriedStale = 0;
  let expired = 0;

  for (const stored of previous.screenings || []) {
    if (byUid.has(stored.uid)) continue;
    if ((stored.status || '').toLowerCase() === 'cancelled') continue; // tombstones owns these
    const date = String(stored.start_local || '').slice(0, 10);
    if (!date) continue;
    if (date < carryFloor) { expired++; continue; }

    const src = stored.source || '';
    const sourceDown = failedSourceIds.has(src) || notRun.includes(src) || !okSourceIds.has(src);
    // Minute granularity, not day. A screening that has already STARTED has not
    // disappeared, it has happened, and tombstoning it publishes CANCELLED to
    // every subscriber for a film that actually screened. Comparing dates alone
    // left a window from a screening's start time until midnight where exactly
    // that happened, and it was observed live.
    const isPast = String(stored.start_local || '') < nowLocal;
    if (!isPast && !sourceDown) continue; // a genuine disappearance: let it tombstone

    const rec = {
      venue_slug: stored.venue_slug,
      programmer: stored.programmer ?? null,
      title: stored.title,
      year: stored.year ?? null,
      director: stored.director ?? null,
      runtime_min: stored.runtime_min ?? null,
      start_local: stored.start_local,
      end_local: stored.end_local ?? null,
      url: stored.url,
      format: stored.format ?? null,
      series: stored.series ?? null,
      note: stored.note ?? null,
      source: src || 'carried',
      film_key: stored.film_key || filmKey(stored.title),
      uid: stored.uid,
      hash: stored.hash,
      guid: stored.guid,
      id_tuple: stored.id_tuple,
      carried: true,
    };
    byUid.set(rec.uid, rec);
    if (isPast) carriedPast++; else carriedStale++;
    const vslug = canonicalSlug(rec.venue_slug);
    if (!venuesRaw.has(vslug) && previous.venues && previous.venues[vslug]) {
      venuesRaw.set(vslug, previous.venues[vslug]);
    }
  }

  // --- run identity + first_emitted_at -----------------------------------
  let screenings = [...byUid.values()];
  const variantMerge = collapseTitleVariants(screenings, log);
  screenings = variantMerge.records;
  assignLimited(screenings);

  // The release-year index every source that has one contributed, merged into
  // one map. Only repertory.nyc publishes one today. A source that failed or
  // was skipped contributes nothing, which degrades a few records to
  // "year unknown" and degrades nothing else; see assignVintage().
  const filmYears = new Map();
  for (const r of results) {
    if (!r.ok || !r.filmYears) continue;
    for (const [k, y] of Object.entries(r.filmYears)) {
      if (!filmYears.has(k)) filmYears.set(k, y);
    }
  }
  const vintage = assignVintage(screenings, filmYears, Number(today.slice(0, 4)));

  assignRuns(screenings, priorByUid);
  for (const r of screenings) {
    const prior = priorByUid.get(r.uid);
    r.first_emitted_at = (prior && prior.first_emitted_at) || nowIso;
  }

  screenings.sort((a, b) =>
    a.start_local !== b.start_local ? (a.start_local < b.start_local ? -1 : 1)
      : (a.uid < b.uid ? -1 : 1));

  const venues = {};
  for (const slug of [...venuesRaw.keys()].sort()) venues[slug] = venuesRaw.get(slug);

  const collected = {
    version: 1,
    generated_by: 'build/collect/collect.mjs',
    venues,
    screenings: screenings.map(orderFields),
  };

  // --- source state ------------------------------------------------------
  const nextState = { version: 1, sources: {} };
  for (const mod of SOURCES) {
    const prior = state.sources[mod.id] || {};
    const r = results.find((x) => x.id === mod.id);
    if (!r) { nextState.sources[mod.id] = { ...prior, skipped_last_run: true }; continue; }
    if (r.ok) {
      const n = r.screenings.length;
      // last_change_at, NOT "last run at". A per-run timestamp here would put a
      // diff in every scheduled commit even when nothing upstream moved, which
      // is the same junk-commit failure build/README.md's DTSTAMP design exists
      // to avoid. This only advances when the source's output actually changes.
      const unchanged = prior.status === 'ok' && prior.last_ok_count === n;
      nextState.sources[mod.id] = {
        label: mod.label,
        status: 'ok',
        stale: false,
        last_change_at: unchanged ? (prior.last_change_at || nowIso) : nowIso,
        last_ok_count: n,
        high_water: Math.max(prior.high_water || 0, n),
        consecutive_failures: 0,
        last_error: null,
      };
    } else {
      nextState.sources[mod.id] = {
        label: mod.label,
        status: 'failed',
        stale: true,
        last_change_at: prior.last_change_at || null,
        last_ok_count: prior.last_ok_count || 0,
        high_water: prior.high_water || 0,
        consecutive_failures: (prior.consecutive_failures || 0) + 1,
        last_error: r.error,
      };
    }
  }

  const credits = SOURCES.filter((m) => m.credit).map((m) => ({ source: m.id, ...m.credit }));

  // --- report ------------------------------------------------------------
  log('\n  per-source counts');
  for (const mod of SOURCES) {
    const r = results.find((x) => x.id === mod.id);
    const st = nextState.sources[mod.id];
    const mark = !r ? 'not run' : r.ok ? `${r.screenings.length}` : `FAILED (stale, using last good data)`;
    log(`    ${mod.id.padEnd(16)} ${mark}`);
    if (st && st.stale && st.last_ok_at) {
      log(`      last good: ${st.last_ok_count} on ${st.last_change_at}`);
    }
  }
  log(`  carried forward: ${carriedPast} past, ${carriedStale} from a down source, ${expired} expired past ${CARRY_BACK_DAYS} days`);
  if (collisions.length) {
    log(`  cross-source duplicates merged: ${collisions.length}`);
    for (const c of collisions.slice(0, 5)) log(`    ${c}`);
  }
  log(`  venues: ${Object.keys(venues).length}` +
    (needAddress.size ? `, ${needAddress.size} with no street address` : ''));
  if (needAddress.size) {
    log('    add these to build/collect/venue-book.mjs (they list as "New York, NY" and carry no GEO):');
    for (const s of [...needAddress].sort()) log(`      ${s}`);
  }
  log(`  total screenings: ${screenings.length}`);

  // The one-night-only filter, per source. `limited` is what calendar.ics and
  // feed.xml carry; index.html keeps everything.
  const limitedBySource = new Map();
  for (const r of screenings) {
    const e = limitedBySource.get(r.source) || { all: 0, limited: 0 };
    e.all++;
    if (r.limited) e.limited++;
    limitedBySource.set(r.source, e);
  }
  const limitedTotal = screenings.filter((r) => r.limited).length;
  log(`\n  one-night-only filter (<= ${GUARD.limitedMaxDates} distinct dates for a film ` +
    `at a venue, or ${GUARD.seriesMaxDates} dates with <= ${GUARD.seriesMaxPerDate} showtime each)`);
  for (const [src, e] of [...limitedBySource.entries()].sort()) {
    log(`    ${src.padEnd(16)} ${String(e.all).padStart(5)} collected  ` +
      `${String(e.limited).padStart(5)} qualify  ${String(e.all - e.limited).padStart(5)} dropped`);
  }
  log(`    ${'TOTAL'.padEnd(16)} ${String(screenings.length).padStart(5)} collected  ` +
    `${String(limitedTotal).padStart(5)} qualify  ` +
    `${String(screenings.length - limitedTotal).padStart(5)} dropped`);

  // The vintage rule, per source, over the records that already pass `limited`.
  // Both flags have to be true for a screening to reach calendar.ics or
  // feed.xml, so this table is the one that predicts the calendar's size.
  const vintageBySource = new Map();
  for (const r of screenings) {
    if (!r.limited) continue;
    const e = vintageBySource.get(r.source) || { all: 0, kept: 0, unknown: 0 };
    e.all++;
    if (r.vintage) e.kept++;
    if (r.vintage_year == null) e.unknown++;
    vintageBySource.set(r.source, e);
  }
  const published = screenings.filter((r) => r.limited && r.vintage).length;
  log(`\n  vintage rule (released ${vintage.newestVintageYear} or earlier; ` +
    `${vintage.newestVintageYear + 1} and later is first-run), over the limited set`);
  for (const [src, e] of [...vintageBySource.entries()].sort()) {
    log(`    ${src.padEnd(16)} ${String(e.all).padStart(5)} limited  ` +
      `${String(e.kept).padStart(5)} published  ${String(e.all - e.kept).padStart(5)} first-run  ` +
      `${String(e.unknown).padStart(5)} year unknown`);
  }
  log(`    ${'TOTAL'.padEnd(16)} ${String(limitedTotal).padStart(5)} limited  ` +
    `${String(published).padStart(5)} published  ` +
    `${String(limitedTotal - published).padStart(5)} first-run`);
  log(`    year from: ${vintage.counts.source} source, ${vintage.counts.title} title, ` +
    `${vintage.counts.catalog} catalog, ${vintage.counts.unknown} unknown ` +
    '(unknown is published and marked, never dropped)');

  // Fetched bytes are data, never instructions. Anything a third-party file
  // said that looked like it was addressed to an automated reader is printed
  // here for a human and has had no effect on anything above.
  if (curiosities.length) {
    log(`  text addressed to automated readers, logged and ignored: ${curiosities.length}`);
    for (const c of curiosities.slice(0, 5)) log(`    ${c.where}\n      ${c.text}`);
  }

  if (args.dryRun) {
    process.stdout.write(out.join('\n') + '\n  --dry-run, nothing written.\n');
    return;
  }

  writeJsonAtomic(collectedPath, collected);
  writeJsonAtomic(statePath, nextState);
  writeJsonAtomic(sourcesPath, { version: 1, credits });
  log(`\n  wrote ${collectedPath}`);

  // --- hand off to the ledger --------------------------------------------
  const { dataset, report } = reconcile(previous, collected, { now: nowIso });
  writeJsonAtomic(datasetPath, dataset);
  log(`  wrote ${datasetPath}`);
  log(`  ledger: added ${report.added.length}, updated ${report.updated.length}, ` +
    `unchanged ${report.unchanged.length}, tombstoned ${report.tombstoned.length}, ` +
    `revived ${report.revived.length}, pruned ${report.pruned.length}`);

  const stale = Object.entries(nextState.sources).filter(([, s]) => s.stale);
  process.stdout.write(out.join('\n') + '\n');
  if (stale.length) {
    process.stderr.write(
      '\ncollect: STALE SOURCES\n' +
      stale.map(([k, s]) =>
        `  ${k}: ${s.consecutive_failures} consecutive failure(s), last good ` +
        `${s.last_ok_count} on ${s.last_change_at || 'never'}\n    ${s.last_error}`).join('\n') +
      '\n  Their last good screenings are still in the dataset and marked stale in ' +
      'data/source-state.json.\n'
    );
  }
}

// Fields where `null` is a fact rather than an absence, so it must survive into
// collected.json. tombstones.mjs copies a collected field only when it is not
// `undefined`; dropping these two would let a previous run's value persist
// after the year stopped being knowable. See assignVintage().
const KEEP_NULL = new Set(['vintage_year', 'vintage_year_from']);

/** Stable field order, so a diff of collected.json reads like a diff. */
function orderFields(r) {
  const o = {};
  for (const k of [
    'uid', 'hash', 'guid', 'id_tuple', 'film_key', 'run_key', 'run_guid',
    'first_emitted_at', 'limited', 'dates_at_venue', 'max_showtimes_per_date',
    'vintage', 'vintage_year', 'vintage_year_from',
    'venue_slug', 'programmer',
    'title', 'year', 'director', 'runtime_min', 'start_local', 'end_local', 'url',
    'format', 'series', 'note', 'source', 'source_ref',
  ]) {
    if (r[k] === undefined) continue;
    if (r[k] === null && !KEEP_NULL.has(k)) continue;
    o[k] = r[k];  // false is kept
  }
  return o;
}

main().catch((err) => {
  process.stderr.write(`collect: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
