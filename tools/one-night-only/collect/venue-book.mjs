#!/usr/bin/env node
// venue-book.mjs - the venue address book, and the canonical-slug alias table.
//
// Two problems this file solves.
//
// 1. build.mjs renders LOCATION as "<venue name>, <venue address>". Some
//    sources hand over an address (repertory.nyc, NYC Parks) and some hand over
//    nothing at all (Elevent gives a screen-level venue name and no street).
//    A guessed street address is the same class of error as a guessed showtime:
//    it sends someone to the wrong place. So an unknown venue gets a
//    borough-level address, which is true, and no GEO, so no map pin is wrong.
//    Every such venue is reported at the end of a run under
//    "venues with no street address" so the book is easy to extend.
//
// 2. Two sources can name the same room differently. A venue slug is part of
//    the UID tuple, so a mismatch publishes the same screening twice. ALIASES
//    maps a source's spelling onto the canonical slug.
//
// Both tables are plain data. Adding a venue is one line and no code changes.

/** slug -> { name?, address, url?, geo? }. `address` is required. */
export const ADDRESS_BOOK = {
  // Elevent tenants, verified rooms.
  'maysles-cinema': {
    name: 'Maysles Cinema',
    address: '343 Lenox Ave, New York, NY 10027',
    url: 'https://www.maysles.org/',
  },
  'scandinavia-house': {
    name: 'Scandinavia House',
    address: '58 Park Ave, New York, NY 10016',
    url: 'https://www.scandinaviahouse.org/',
  },
  'green-wood-cemetery': {
    name: 'Green-Wood Cemetery',
    address: '500 25th St, Brooklyn, NY 11232',
    url: 'https://www.green-wood.com/',
  },
  'industry-city': {
    name: 'Industry City',
    address: '220 36th St, Brooklyn, NY 11232',
    url: 'https://industrycity.com/',
  },
  'snug-harbor-cultural-center': {
    name: 'Snug Harbor Cultural Center',
    address: '1000 Richmond Terrace, Staten Island, NY 10301',
    url: 'https://snug-harbor.org/',
  },

  // The seed venue.
  'paris-theater': {
    name: 'Paris Theater',
    address: '4 W 58th St, New York, NY 10019',
    url: 'https://www.paristheaternyc.com/',
  },
};

/**
 * Rooms inside a larger building. The screen-level name is what a ticket says,
 * so it stays as the venue name, but the address is the building's.
 */
export const ROOM_PARENT = {
  'volvo-hall': 'scandinavia-house',
  'victor-borge-hall': 'scandinavia-house',
  'halldor-laxness-library': 'scandinavia-house',
  "heimbold-family-children-s-playing-and-learning-center": 'scandinavia-house',
};

/** Source spelling -> canonical slug, so one room is one venue everywhere. */
export const ALIASES = {
  // repertory.nyc theater slugs whose display name differs from other sources.
  'bam-rose-cinemas': 'bam-rose-cinemas',
  'maysles-documentary-center': 'maysles-cinema',
  'the-paris-theater': 'paris-theater',
  'paris-theatre': 'paris-theater',
};

/**
 * When nothing better is known. True, unhelpful, and safe. Never paired with a
 * GEO, so no client can put a pin in the wrong place.
 */
/**
 * slug -> neighborhood. The field that lets the page answer "what is on near
 * me" without a map. Hand-maintained, and deliberately incomplete: a venue
 * whose neighborhood is not stated here renders without one, which is honest.
 * A guessed neighborhood is the same class of error as a guessed address.
 *
 * Only rooms whose street address makes the answer unambiguous are listed. The
 * NYC Parks venues are mostly a lawn with a name and no street, so they are
 * omitted rather than approximated from their coordinates.
 */
export const NEIGHBORHOODS = {
  'anthology-film-archives': 'East Village',
  'bam-rose-cinemas': 'Fort Greene',
  'brooklyn-bridge-park': 'Brooklyn Heights',
  'brooklyn-peace-center': 'Bedford-Stuyvesant',
  'bryant-park': 'Midtown',
  'film-at-lincoln-center': 'Lincoln Square',
  'film-forum': 'Hudson Square',
  'green-wood-cemetery': 'Greenwood Heights',
  'halldor-laxness-library': 'Murray Hill',
  "heimbold-family-children-s-playing-and-learning-center": 'Murray Hill',
  'ifc-center': 'Greenwich Village',
  'industry-city': 'Sunset Park',
  'maysles-cinema': 'Harlem',
  'metrograph': 'Lower East Side',
  'new-plaza-cinema': 'Upper West Side',
  'nitehawk-cinema-prospect-park': 'Park Slope',
  'nitehawk-cinema-williamsburg': 'Williamsburg',
  'paris-theater': 'Midtown',
  'quad-cinema': 'Greenwich Village',
  'roxy-cinema': 'Tribeca',
  'scandinavia-house': 'Murray Hill',
  'snug-harbor-cultural-center': 'Staten Island',
  'the-bronx-museum-of-the-arts': 'Concourse',
  'union-square-park': 'Union Square',
  'victor-borge-hall': 'Murray Hill',
  'volvo-hall': 'Murray Hill',
};

/** The neighborhood for a slug, following ROOM_PARENT. null when unknown. */
export function neighborhoodOf(slug) {
  const s = canonicalSlug(slug);
  return NEIGHBORHOODS[s] || NEIGHBORHOODS[ROOM_PARENT[s]] || null;
}

export const FALLBACK_ADDRESS = 'New York, NY';

export function canonicalSlug(slug) {
  return ALIASES[slug] || slug;
}

/**
 * Build the venue entry a dataset needs.
 * @param {{slug:string, name:string, address?:string, url?:string, geo?:number[]}} v
 * @returns {{entry:object, needsAddress:boolean}}
 */
export function venueEntry(v) {
  const slug = canonicalSlug(v.slug);
  const book = ADDRESS_BOOK[slug] || ADDRESS_BOOK[ROOM_PARENT[slug]] || null;

  let address = v.address || (book && book.address) || null;
  const needsAddress = !address;
  if (!address) address = FALLBACK_ADDRESS;

  const entry = {
    name: (book && book.name && !v.name ? book.name : v.name) || slug,
    address,
    url: v.url || (book && book.url) || null,
  };
  if (Array.isArray(v.geo) && v.geo.length === 2 &&
      Number.isFinite(v.geo[0]) && Number.isFinite(v.geo[1])) {
    entry.geo = [Number(v.geo[0]), Number(v.geo[1])];
  }
  if (!entry.url) delete entry.url;
  const nabe = neighborhoodOf(slug);
  if (nabe) entry.neighborhood = nabe;
  return { slug, entry, needsAddress };
}
