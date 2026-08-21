#!/usr/bin/env node
// tombstones.mjs - the ledger. Zero dependencies.
//
// This is the single most important piece of machinery in the pipeline, and
// output-spec.md section 1.5 is explicit that it cannot be retrofitted: by the
// time you notice you need it, the data it needed to capture is already gone.
// So it exists before the collector does.
//
// What it does, in order:
//
//   1. Mints identity for genuinely new screenings, exactly once. The UID is
//      sha256(venue_slug|film_key|YYYYMMDD|HHMM) truncated to 16 hex chars plus
//      the UID domain. It is written into the dataset on first discovery and
//      never recomputed, so an improvement to the film-key normaliser cannot
//      retroactively change the identity of an already-published screening.
//   2. Diffs the incoming collection against the stored dataset by UID.
//   3. Advances updated_at only when the rendered VEVENT body actually changes,
//      which is what keeps DTSTAMP, and therefore the whole file, byte-stable.
//   4. Turns a UID that was present last run and is absent this run into a
//      TOMBSTONE rather than letting it evaporate: status cancelled,
//      cancelled_at set, SEQUENCE incremented. Clients vary in how they handle
//      a UID that simply vanishes, and Apple in particular keeps it forever, so
//      a subscriber can show up to a screening that was cancelled weeks ago.
//   5. Un-cancels a tombstone whose screening comes back, bumping SEQUENCE
//      again so clients accept the revision.
//   6. Prunes tombstones more than 30 days past their event date. By then every
//      subscriber on any plausible refresh cadence has seen the cancellation.
//
// The output is the dataset build.mjs reads. Commit it: a pull request that
// changes a UID is then visible as exactly what it is, a deletion plus an
// insertion, rather than a silent duplicate on every subscriber's calendar.
//
// Usage:
//   node tombstones.mjs --incoming <collected.json> [--dataset data/screenings.json]
//                       [--out <path>] [--dry-run]
//
// --incoming is what the collector produced this run. --dataset is the previous
// run's committed state; a missing file is treated as an empty first run.
// Without --out the dataset is updated in place.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { CONFIG, renderEventBody, hydrate } from './build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

// The join separator is a frozen constant. Changing it rewrites every UID.
const TUPLE_SEP = '|';

const LEADING_ARTICLE = /^(the|a|an)[- ]/;

// Normalise a display title into a stable film key.
//
// "Boogie Nights (1997) [35mm]" and "BOOGIE NIGHTS" must both give
// "boogie-nights", because a year or a format annotation appearing in the
// scraped title next Tuesday must not create a second calendar entry.
export function filmKey(title) {
  let s = String(title);
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' '); // parenthesised year / format
  s = s.toLowerCase();
  s = s.normalize('NFD').replace(/\p{M}+/gu, '');               // strip diacritics
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();                     // strip all punctuation
  s = s.replace(/\s+/g, '-');
  s = s.replace(LEADING_ARTICLE, '');                           // strip a leading article
  return s;
}

// Mint the UID for a screening. Called once, on first discovery, and never
// again. Nothing that a human might correct next Tuesday is allowed in here:
// no display title, no venue display name, no ticket URL, no scrape id, no
// price, no format, no run date, no array index, and obviously nothing random.
export function mintUid(venueSlug, key, startLocal) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(startLocal);
  if (!m) throw new Error(`bad start_local: ${JSON.stringify(startLocal)}`);
  const date = `${m[1]}${m[2]}${m[3]}`;
  const time = `${m[4]}${m[5]}`;
  const tuple = [venueSlug, key, date, time].join(TUPLE_SEP);
  const hash = createHash('sha256').update(tuple, 'utf8').digest('hex').slice(0, 16);
  return { hash, uid: `${hash}@${CONFIG.uidDomain}`, tuple };
}

const guidFor = (hash) => `tag:${CONFIG.tagAuthority},${CONFIG.tagYear}:screening/${hash}`;

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

// Hash of the rendered VEVENT body with the timestamp lines excluded. If this
// is unchanged, updated_at must not move, or the Action commits a junk diff on
// every run and every subscriber re-downloads a file that did not change.
function contentHash(record, venues) {
  const lines = renderEventBody(hydrate(record, venues));
  return createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

const nowIso = () => {
  const override = process.env.NABE_NOW || process.env.ONO_NOW;
  const d = override ? new Date(override) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error(`bad NABE_NOW: ${override}`);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
};

// Fields the collector owns. Identity and lifecycle fields are the ledger's and
// are never taken from the incoming record.
const COLLECTED_FIELDS = [
  'venue_slug', 'title', 'year', 'director', 'runtime_min',
  'start_local', 'end_local', 'url', 'format', 'series', 'note', 'source',
  // Minted by the collector and carried through unchanged. These are not
  // recomputed here and must not be: README.md's "Known gaps" section asks the
  // collector to emit a stored run_key/run_guid so the RSS renderer can collapse
  // a multi-night run without an identity function landing in a renderer, and a
  // stored first_emitted_at so items age one-directionally instead of
  // re-notifying when they drop out of the 50-item cap and come back.
  // `programmer` is metadata, deliberately outside the UID tuple (PROGRAMMERS.md):
  // who put the screening on, which may differ from the room it happens in.
  // `limited` and `dates_at_venue` are the one-night-only filter, computed once
  // in the collector over the whole collection and stored. calendar.ics and
  // feed.xml publish only the qualifying ones; index.html keeps everything. The
  // renderer reads the stored value and never recomputes it, for the same
  // reason it never recomputes a UID.
  // `vintage`, `vintage_year` and `vintage_year_from` are the repertory rule,
  // computed alongside `limited` and stored the same way. `vintage_year` is
  // deliberately separate from `year`: `year` renders into the VEVENT SUMMARY,
  // so a recovered year written there would move updated_at and re-notify every
  // subscriber. These three render nowhere. See assignVintage() in collect.mjs.
  'programmer', 'run_key', 'run_guid', 'first_emitted_at', 'id_tuple', 'source_ref',
  'limited', 'dates_at_venue', 'max_showtimes_per_date',
  'vintage', 'vintage_year', 'vintage_year_from',
];

// ---------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------

/**
 * @param {{venues:object, screenings:Array}} previous  last run's committed dataset
 * @param {{venues:object, screenings:Array}} incoming  what the collector found now
 * @returns {{dataset:object, report:object}}
 */
export function reconcile(previous, incoming, opts = {}) {
  const now = opts.now || nowIso();
  const nowMs = new Date(now).getTime();
  const retentionDays = opts.retentionDays ?? CONFIG.tombstoneRetentionDays;

  // Keep every venue we have ever seen. A tombstone still needs its venue's
  // name and address to render, and the collector may have dropped the source.
  const venues = { ...(previous.venues || {}), ...(incoming.venues || {}) };

  const prev = new Map();
  for (const s of previous.screenings || []) prev.set(s.uid, s);

  const report = {
    added: [], updated: [], unchanged: [], tombstoned: [], revived: [], pruned: [],
  };
  const out = new Map();
  const seen = new Set();

  // --- incoming: new, changed, unchanged, revived -------------------------
  for (const raw of incoming.screenings || []) {
    if (!raw.venue_slug) throw new Error(`incoming record has no venue_slug: ${JSON.stringify(raw)}`);
    if (!venues[raw.venue_slug]) throw new Error(`unknown venue_slug "${raw.venue_slug}"`);
    if (!raw.start_local) throw new Error(`incoming record has no start_local: ${JSON.stringify(raw)}`);

    // Reuse a stored film_key if the collector carried one through. Only mint
    // when it is genuinely absent.
    const key = raw.film_key || filmKey(raw.title);
    const minted = raw.uid
      ? { uid: raw.uid, hash: raw.hash || String(raw.uid).split('@')[0] }
      : mintUid(raw.venue_slug, key, raw.start_local);

    if (seen.has(minted.uid)) {
      // Two collected records claiming one identity. Refusing is correct: the
      // alternative is publishing whichever one happened to be last.
      throw new Error(
        `two incoming screenings share UID ${minted.uid}\n` +
        `  ${raw.venue_slug} / ${key} / ${raw.start_local}\n` +
        '  Same venue, same film, same start time is one screening, not two.'
      );
    }
    seen.add(minted.uid);

    const existing = prev.get(minted.uid);
    const base = {};
    for (const f of COLLECTED_FIELDS) if (raw[f] !== undefined) base[f] = raw[f];

    if (!existing) {
      const record = {
        uid: minted.uid,
        hash: minted.hash,
        guid: guidFor(minted.hash),
        film_key: key,
        ...base,
        status: (raw.status || 'confirmed').toLowerCase(),
        sequence: 0,
        created_at: now,
        updated_at: now,
      };
      out.set(record.uid, record);
      report.added.push(record.uid);
      continue;
    }

    // Identity fields are taken from the stored record, never recomputed.
    const merged = {
      ...existing,
      ...base,
      film_key: existing.film_key || key,
      guid: existing.guid || guidFor(minted.hash),
      hash: existing.hash || minted.hash,
    };

    const wasCancelled = (existing.status || '').toLowerCase() === 'cancelled';
    if (wasCancelled) {
      // The screening came back. Un-cancel it and bump SEQUENCE again so
      // clients accept the revision over the tombstone they already stored.
      merged.status = (raw.status || 'confirmed').toLowerCase();
      merged.sequence = (existing.sequence || 0) + 1;
      merged.cancelled_at = null;
      merged.cancel_reason = null;
      merged.updated_at = now;
      out.set(merged.uid, merged);
      report.revived.push(merged.uid);
      continue;
    }

    merged.status = (raw.status || existing.status || 'confirmed').toLowerCase();
    const before = contentHash(existing, venues);
    const after = contentHash(merged, venues);
    if (before === after) {
      // Nothing that renders has changed, so updated_at must not move.
      out.set(merged.uid, { ...merged, updated_at: existing.updated_at });
      report.unchanged.push(merged.uid);
    } else {
      merged.updated_at = now;
      out.set(merged.uid, merged);
      report.updated.push(merged.uid);
    }
  }

  // --- gone from the source: tombstone, do not delete ---------------------
  for (const [uid, existing] of prev) {
    if (out.has(uid)) continue;
    const alreadyCancelled = (existing.status || '').toLowerCase() === 'cancelled';

    if (alreadyCancelled) {
      // Already a tombstone. Prune it once it is safely past.
      const startMs = new Date(`${existing.start_local}Z`).getTime();
      const ageMs = nowMs - startMs;
      if (Number.isFinite(ageMs) && ageMs > retentionDays * DAY_MS) {
        report.pruned.push(uid);
        continue;
      }
      out.set(uid, existing); // carry it forward untouched, timestamps included
      continue;
    }

    const record = {
      ...existing,
      status: 'cancelled',
      // SEQUENCE must increment. A client that already stored SEQUENCE:0 uses
      // the bump to decide the incoming version wins; without it some clients
      // keep the stale copy.
      sequence: (existing.sequence || 0) + 1,
      cancelled_at: now,
      updated_at: now,
    };
    // DTSTART and DTEND are deliberately left alone. The tombstone stays where
    // it was so the subscriber recognises the entry that is being struck out.
    out.set(uid, record);
    report.tombstoned.push(uid);
  }

  const screenings = [...out.values()].sort((a, b) => {
    if (a.start_local !== b.start_local) return a.start_local < b.start_local ? -1 : 1;
    return a.uid < b.uid ? -1 : 1;
  });

  return {
    dataset: { version: 1, venues, screenings },
    report,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseArgs(argv) {
  const args = { incoming: null, dataset: null, out: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--incoming') args.incoming = argv[++i];
    else if (a === '--dataset' || a === '--previous') args.dataset = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'usage: node tombstones.mjs --incoming <collected.json> ' +
        '[--dataset data/screenings.json] [--out <path>] [--dry-run]\n'
      );
      process.exit(0);
    } else {
      process.stderr.write(`tombstones: unknown argument ${a}\n`);
      process.exit(2);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.incoming) {
    process.stderr.write('tombstones: --incoming <collected.json> is required.\n');
    process.exit(2);
  }
  const datasetPath = resolve(args.dataset || join(HERE, '..', 'data', 'screenings.json'));
  const outPath = resolve(args.out || datasetPath);

  const previous = readJson(datasetPath, { version: 1, venues: {}, screenings: [] });
  const incoming = readJson(resolve(args.incoming), null);
  if (!incoming) {
    process.stderr.write(`tombstones: cannot read ${args.incoming}\n`);
    process.exit(2);
  }

  const { dataset, report } = reconcile(previous, incoming);

  const line = (label, list) =>
    `  ${label.padEnd(11)} ${String(list.length).padStart(4)}` +
    (list.length && list.length <= 5 ? `  ${list.join(' ')}` : '');

  process.stdout.write(
    `tombstones: ${previous.screenings.length} stored, ` +
    `${(incoming.screenings || []).length} incoming, ${dataset.screenings.length} after merge\n` +
    line('added', report.added) + '\n' +
    line('updated', report.updated) + '\n' +
    line('unchanged', report.unchanged) + '\n' +
    line('tombstoned', report.tombstoned) + '\n' +
    line('revived', report.revived) + '\n' +
    line('pruned', report.pruned) + '\n'
  );

  if (args.dryRun) {
    process.stdout.write('tombstones: --dry-run, nothing written.\n');
    return;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(dataset, null, 2) + '\n');
  process.stdout.write(`tombstones: wrote ${outPath}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
