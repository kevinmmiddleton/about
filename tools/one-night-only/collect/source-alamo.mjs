#!/usr/bin/env node
// source-alamo.mjs - Alamo Drafthouse, the three NYC rooms.
//
// One request returns the whole market: every session at Lower Manhattan,
// Downtown Brooklyn and Staten Island, with the presentations they belong to.
// No pagination, no per-title fetch, no HTML. robots.txt is Allow: / and the
// endpoint needs no key.
//
// Why this source is worth having beyond its size: it is the first one that
// reports a print. 70mm and 35mm arrive as a field rather than as a word
// somewhere in a blurb, which is the only way the rarity ramp in identity.html
// can be trusted. It is also the first source that names its own series, so
// `series` stops being a column that is almost always null.

import {
  fetchText,
  tidy,
  assertParsedTimes,
} from './common.mjs';

export const id = 'alamo';
export const label = 'Alamo Drafthouse';
export const credit = null;

const MARKET = 'nyc';
const API = `https://drafthouse.com/s/mother/v2/schedule/market/${MARKET}`;
const SHOW_URL = (slug) => `https://drafthouse.com/${MARKET}/show/${slug}`;

/** Alamo's cinema slug -> our venue slug. Namespaced: "lower-manhattan" alone
 *  is a neighbourhood half the city could claim. */
const venueSlug = (cinemaSlug) => `alamo-${cinemaSlug}`;

// Only a print is a format. `2d-digital`, `hdr` and `open-caption` are a file,
// a colour pipeline and an accessibility option respectively, and identity.html
// is explicit that a digital file is a fact for the credit line rather than a
// badge. Writing "DCP" here because a screening is digital would be inventing a
// detail the payload never claimed.
const FORMAT_BY_SLUG = { '70mm': '70mm', '35mm': '35mm' };

// A collection slug is the series. Rendered from the slug rather than from a
// lookup table so a new strand appears the week Alamo invents it instead of
// silently arriving as null.
function seriesLabel(slug) {
  if (!slug) return null;
  const pretty = String(slug).split('-').map((w) => {
    if (w === 'agfa') return 'AGFA';
    if (w === '101') return '101';
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
  return pretty || null;
}

/** A year in the title, e.g. "Halloween (1978)". Alamo publishes no year
 *  field, so this recovers the ones that are stated and leaves the rest null
 *  rather than guessing from a release date that means something else. */
function yearIn(title) {
  const m = String(title || '').match(/\((19|20)\d{2}\)/);
  return m ? Number(m[0].slice(1, 5)) : null;
}

export async function collect(ctx) {
  const notes = [];

  const res = await fetchText(API, {
    cache: ctx.cache, expect: /application\/json/i, accept: 'application/json',
  });

  let payload;
  try {
    payload = JSON.parse(res.body);
  } catch {
    throw new Error('alamo: market schedule was not JSON');
  }

  const data = payload && payload.data;
  const sessions = (data && data.sessions) || [];
  const presentations = (data && data.presentations) || [];
  const market = (data && data.market && data.market[0]) || null;

  if (!market || !Array.isArray(market.cinemas) || market.cinemas.length === 0) {
    throw new Error('alamo: market payload carried no cinemas');
  }
  if (!Array.isArray(sessions)) {
    throw new Error('alamo: market payload carried no sessions array');
  }

  const cinemaById = new Map(market.cinemas.map((c) => [String(c.id), c]));
  const presBySlug = new Map(presentations.map((p) => [p.slug, p]));

  const venues = market.cinemas.map((c) => ({
    slug: venueSlug(c.slug),
    name: `Alamo Drafthouse ${c.name}`,
    address: [c.street1, c.city, c.state, c.postalCode].filter(Boolean).join(', '),
    url: `https://drafthouse.com/${MARKET}/theater/${c.slug}`,
    geo: (Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
      ? [c.latitude, c.longitude]
      : undefined,
  }));

  const screenings = [];
  let droppedNoTime = 0;
  let droppedPast = 0;
  let droppedHidden = 0;
  let droppedNoCinema = 0;
  let droppedNoTitle = 0;

  for (const s of sessions) {
    // PAST is Alamo's own word for a showtime that has already happened. It is
    // not an error and it is not news; the ledger handles history.
    if (s.status === 'PAST') { droppedPast++; continue; }
    if (s.isHidden) { droppedHidden++; continue; }

    const cinema = cinemaById.get(String(s.cinemaId));
    if (!cinema) { droppedNoCinema++; continue; }

    // showTimeClt is already cinema-local wall time: "2026-12-15T18:00:00".
    // Trim to the minute to match LOCAL_RE rather than reparsing it through a
    // Date, which would drag a timezone into a string that does not have one.
    const raw = String(s.showTimeClt || '');
    const start = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) ? raw.slice(0, 16) : null;
    if (!start) { droppedNoTime++; continue; }

    const pres = presBySlug.get(s.presentationSlug);
    const title = tidy((pres && pres.show && pres.show.title) || '');
    if (!title) { droppedNoTitle++; continue; }

    const runtime = pres && pres.event && Number(pres.event.runtimeMinutes);

    screenings.push({
      venue_slug: venueSlug(cinema.slug),
      programmer: null, // Alamo programmes its own rooms
      title,
      year: yearIn(title),
      director: null, // not in the payload; a guess here is a wrong credit
      runtime_min: Number.isFinite(runtime) && runtime > 0 ? runtime : null,
      start_local: start,
      end_local: null,
      url: s.presentationSlug ? SHOW_URL(s.presentationSlug) : `https://drafthouse.com/${MARKET}`,
      format: FORMAT_BY_SLUG[s.formatSlug] || null,
      series: seriesLabel(pres && pres.primaryCollectionSlug),
      note: null,
      source: id,
      // sessionId is stable per showtime and survives a title being re-slugged.
      source_ref: s.sessionId ? String(s.sessionId) : null,
    });
  }

  assertParsedTimes(id, sessions.length - droppedPast, screenings, droppedNoTime);

  const prints = screenings.filter((r) => r.format).length;
  const seried = screenings.filter((r) => r.series).length;
  notes.push(`${prints} screening(s) on a print, ${seried} in a named series`);
  if (droppedNoCinema > 0) {
    notes.push(`${droppedNoCinema} session(s) named a cinema absent from the market payload`);
  }
  if (droppedNoTitle > 0) {
    notes.push(`${droppedNoTitle} session(s) had no presentation title and were dropped`);
  }

  return {
    screenings,
    venues,
    stats: {
      raw: sessions.length,
      kept: screenings.length,
      droppedPast,
      droppedHidden,
      droppedNoTime,
      droppedNoCinema,
      droppedNoTitle,
    },
    notes,
  };
}
