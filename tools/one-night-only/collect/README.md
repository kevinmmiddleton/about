# tools/one-night-only/collect/

The input layer for One Night Only. Fetches every source, normalises to one
record shape, mints identity once, and hands the result to `tombstones.mjs`.

Node only, no npm packages. Written against v25.2.1.

```
sources -> collect.mjs -> one-night-only/_data/collected.json
                                |
                                v
     tombstones.mjs -> one-night-only/_data/screenings.json -> build.mjs
```

## Files

| File | What it does |
| --- | --- |
| `collect.mjs` | Orchestrator and CLI. Guards, identity, carry-forward, the one-night-only filter, the title-variant merge, the ledger handoff. |
| `common.mjs` | HTTP with robots/redirect/content-type policy, time parsing, identity, the validators. |
| `venue-book.mjs` | Address book and canonical-slug aliases. Plain data; adding a venue is one line. |
| `source-elevent.mjs` | goelevent.com, ~85 tenants, NYC allowlist. |
| `source-repertory-nyc.mjs` | repertory.nyc's open JSON API. The cinema core. |
| `source-nyc-parks.mjs` | NYC Open Data `w3wp-dpdi`. Free outdoor screenings. |
| `source-paris-theater.mjs` | The Paris, via the RSC flight payload on its own homepage. |
| `source-luma.mjs` | Luma calendars. The programmer tier. |

## Running it

From the repo root:

```bash
node tools/one-night-only/collect/collect.mjs   # writes one-night-only/_data/*.json, then the ledger
node tools/one-night-only/build.mjs             # one-night-only/{index.html,feed.xml,calendar.ics}
node tools/one-night-only/lint-ics.mjs one-night-only/calendar.ics   # the CI gate
```

| Flag | Effect |
| --- | --- |
| `--data-dir <dir>` | Where the dataset lives. Default `one-night-only/_data`, resolved from this file. |
| `--only a,b` / `--skip a,b` | Restrict the source list. A source that does not run has its stored screenings carried forward, not tombstoned. |
| `--simulate-empty <src>` | Pretend a source returned nothing. Exercises the zero guard. |
| `--accept-zero <src>` | Acknowledge a genuinely empty source. Also `ONO_ACCEPT_ZERO`. |
| `--dry-run` | Print the report, write nothing. |
| `--list-elevent-tenants` | Print the live Elevent directory, for extending the allowlist. |

`ONO_NOW` pins the instant used as "now", for reproducible runs. It is a test
hook; nothing derived from it reaches an output file.

## Outputs

| File | Committed? | Churns per run? |
| --- | --- | --- |
| `one-night-only/_data/collected.json` | yes | only when a source's data changes |
| `one-night-only/_data/screenings.json` | yes | only when a record's rendered body changes |
| `one-night-only/_data/sources.json` | yes | only when the credits change |
| `one-night-only/_data/source-state.json` | yes | only when a source's count or status changes |
| `one-night-only/_data/.cache/http-cache.json` | **no** (`.gitignore`) | every run |

The first four are byte-stable across consecutive runs when nothing upstream
moved, so the Action's `git diff --quiet` check does the right thing. That is
why `source-state.json` records `last_change_at` rather than "last run at": a
per-run timestamp would put a junk diff in every scheduled commit, which is the
same failure `build.mjs`'s DTSTAMP design exists to avoid.

## Identity, minted here and stored

`build.mjs` reads stored identity and throws if it is missing. It never computes
one. Everything below is written into the dataset on first discovery and then
left alone.

| Field | Derived from | Why it must not be recomputed |
| --- | --- | --- |
| `uid`, `hash`, `id_tuple` | `venue_slug \| film_key \| YYYYMMDD \| HHMM`, hashed by `tombstones.mjs`'s own `mintUid` | A changed UID is a permanent duplicate on every subscriber's calendar and there is no way to clean it up. |
| `guid` | the hash | The RSS item identity. |
| `run_key`, `run_guid` | venue + film + the first local date of the run | Lets the RSS renderer collapse a five-night run into one item without an identity function landing in a renderer. Sticky: once a uid has one it keeps it, so a run that grows an earlier night does not re-notify. |
| `first_emitted_at` | the run that first saw the uid | One-directional ageing. An item that drops out of the 50-item cap and comes back does not re-notify. |

`limited`, `dates_at_venue`, `max_showtimes_per_date`, `vintage`,
`vintage_year` and `vintage_year_from` are computed here too,
every run, and are deliberately **not** identity. None of them reaches the
rendered VEVENT body, so a record whose qualification changes does not move its
`updated_at` and does not re-notify a subscriber. Verified on the run that
introduced the amended rule: 46 records flipped `limited`, zero `updated_at`
moved.

The same holds for the vintage rule. Filling in a missing release year was
deliberately routed to `vintage_year` rather than to `year`, because `year`
renders into the VEVENT SUMMARY: writing 103 recovered years into `year` would
have moved `updated_at` on 103 records and re-notified every subscriber. Verified
on the run that introduced the rule: 1,373 records reconciled, **0 updated, 0
UIDs added, 0 UIDs lost**.

`venue` and `programmer` are separate fields (PROGRAMMERS.md). The programmer is
metadata and is deliberately outside the UID tuple: a programmer rename must not
duplicate an event for every subscriber. Rooftop Films programmes a cemetery, a
plaza and a high school; BxICC programmes eleven Bronx rooms including a bank
branch. Those are one programmer and many venues, and only Elevent and Luma hand
the split over as two structured fields.

## The rules, and where each one lives

1. **Never invent or infer a showtime.** `localStamp()` and `parseClock12()`
   return `null` rather than a default, and every caller treats `null` as "drop
   this record and count it". `parseClock12` refuses a bare `7:00` with no
   meridiem outright.
2. **Zero where there were many fails loudly.** `collect.mjs` compares each
   source against its stored `high_water` and `last_ok_count`. A violation
   prints, writes nothing, and exits 1. A genuinely empty source needs
   `--accept-zero`, so it is a human decision on the record.
3. **Content-type, never status code alone.** `fetchText()` asserts the
   content-type and fails a 200 with the wrong body. Soft-404s are endemic here.
4. **robots.txt, honest identification, conditional requests.** One robots.txt
   per host per run, `Crawl-delay` honoured (Socrata asks for 1s), a descriptive
   User-Agent with a contact URL, and a conditional request wherever the last
   response offered a validator. Measured, second run:

   | Host | Validator offered | Result |
   | --- | --- | --- |
   | `data.cityofnewyork.us` | weak ETag + Last-Modified | **304**, body reused |
   | `www.paristheaternyc.com` | ETag | **304**, body reused |
   | `www.goelevent.com` | Last-Modified, but set to *now* on every response | 200, unavoidable |
   | `www.repertory.nyc`, `api.lu.ma` | none | 200 |

   Only one validator is sent, and Last-Modified wins when both are offered.
   RFC 9110 makes a server ignore If-Modified-Since whenever If-None-Match is
   present, and Socrata's ETag is weak and varies with content-encoding, so
   sending both meant never getting a 304. See the comment in `fetchText()`.
5. **A failing source keeps its last good data.** Its stored screenings are
   carried forward, including future ones, and it is marked `stale: true` in
   `source-state.json`. Records are not mutated, so nothing churns.
6. **Every screening links back to the venue's own page.**

## The one-night-only filter

`assignLimited()` counts the distinct local dates each film plays at each venue,
and the showtimes on each of those dates, across every record in the collection
including carried-forward past ones. It writes `dates_at_venue`,
`max_showtimes_per_date` and `limited` onto the record.

A screening qualifies if its film plays on **two or fewer distinct dates** at
that venue, **or on three dates with no more than one showtime on any of them**.
The three-date clause is the amendment in POSITIONING.md: the flat two-date rule
dropped MAD DOG MORGAN at Anthology, three scattered dates with a single showing
each, which is a repertory series rather than an engagement. What separates a run
from a series is showtimes per day, not days.
`index.html` keeps everything and says which is which. Nothing downstream
recomputes it. `calendar.ics` and `feed.xml` publish a screening only if it is
**also** `vintage`; see the next section.

Matched on `venue_slug + film_key`, the same basis as the UID tuple. Nothing
here touches a UID.

Recomputed every run rather than made sticky. A screening demoted from limited
to a run simply stops appearing in the calendar, which is safe in a way a
vanished cancellation would not be: the screening still happens, at the same
time, in the same room, so a stale entry on a subscriber's calendar is a correct
one. Publishing a demotion as a cancellation would be a lie.

Measured 2026-08-20, with the amended rule and `WINDOWS = 3`:

| Source | Collected | Qualify | Dropped |
| --- | --- | --- | --- |
| repertory-nyc | 1285 | 461 | 824 |
| nyc-parks | 53 | 53 | 0 |
| elevent | 26 | 26 | 0 |
| luma | 5 | 5 | 0 |
| paris-theater | 5 | 5 | 0 |
| **total** | **1374** | **550** | **824** |

`WINDOWS` in `source-repertory-nyc.mjs` was 1, set only to stop the cinema core
overflowing the 1,000-event cap. The filter removed that pressure, so the number
is now set by filter accuracy instead and is **3**. Qualifying repertory.nyc
groups whose last date fell in the final two days of the window, where a run is
indistinguishable from a one-off: 18 of 185 at `WINDOWS = 1`, 10 of 246 at 2,
4 of 288 at 3. The cost was measured, not assumed: 526 VEVENTs of the 1,000 cap
and 369 KiB of the 900 KiB budget. See the comment on `WINDOWS` for the numbers.

The correction is observable. Raising 1 to 3 demoted *The Lake House* at Roxy
from limited to a run: two dates visible inside one fortnight, four across
three.

## The repertory filter

`assignVintage()` decides whether a screening is a revival or a first run. A
screening is `vintage` if its film was released at least
`GUARD.vintageMinAgeYears` calendar years before the year the collector runs in.
That number is **2**: running in 2026, a 2024 release or older is repertory and
2025 or 2026 is first-run. It is expressed as an age rather than as a fixed
cutoff year so it ages correctly on 1 January without anyone editing the file.
The previous year is excluded as well as the current one because a December
release is still touring first-run screens the following autumn.

`limited` alone already removed most first-run, because a new release plays a
run. What it let through was the previews and the premiere-plus-Q&A nights: the
Roxy's Musclefest, IFC's first-run documentaries, NYC Parks' summer
blockbusters. Those are the 77 records the rule removes.

Three fields are stored, the second two so the call is auditable:

| Field | Value |
| --- | --- |
| `vintage` | `true` / `false` |
| `vintage_year` | the year the decision was made on, or `null` |
| `vintage_year_from` | `source` / `title` / `catalog`, or `null` |

The year is taken from, in order: the source's own `year`; a four-digit year in
parentheses inside the title, read but **never stripped**, because the title
feeds `film_key` which feeds the UID; and repertory.nyc's `/api/films` catalog,
keyed by `film_key`.

`year` itself is never overwritten. It renders into the VEVENT SUMMARY, so a
recovered year written there would move `updated_at` on every enriched record
and re-notify every subscriber over a field they did not ask about. The
recovered year lives in `vintage_year`, which renders nowhere.

### Enriching a missing year from repertory.nyc's catalog

`/api/screenings/week` leaves `film_year` null on about a fifth of its rows, and
`/api/films` is the same film table, so a row that is null there is null here
too. What makes the extra request worth making is that the catalog holds
**duplicate rows for one film under different title spellings, and the duplicates
disagree about what is missing**:

```
"THE GODFATHER PART II"                                 null
"The Godfather Part II"                                 1974
"DEAD MAN"                        null   /  "Dead Man"  1995
"Freefall: A Reckoning for Boeing"                      null
"Freefall: A Reckoning for Boeing (Open Captioning)"    2026
```

Normalising both sides with the project's own `filmKey()` collapses those pairs.
Measured 2026-08-21: 19 of the 174 year-less films resolved, covering 103
records, including every one of the IFC Center first-run documentaries that
prompted the rule.

A `film_key` the catalog spells **two different years** for is left unresolved
rather than guessed at. 31 keys are ambiguous. A wrong year here would quietly
delete a genuine revival from the calendar, which is the expensive direction.

The catalog costs 40 GETs per run and cannot be conditional: `/api/films` offers
neither ETag nor Last-Modified. The page count is bounded by `CATALOG_MAX_PAGES`
rather than by trusting the server to stop. A failure is **not** a source
failure; it is caught, noted, and degrades a few records to "year unknown".

Two other enrichment routes were tried and rejected on measurement, not taste:

- **`/api/films?search=`** works, but needs one request per unresolved title.
  155 requests against 40. Worse.
- **The catalog's `description` field** sometimes reads `Dir. X. 2025, 99 mins.`
  Only 137 of 1,115 year-less catalog rows have a description at all, and
  **zero** of them match that pattern. Dead end.

Elevent already reads `ReleaseYear` from the `Events[]` payload, and no fix is
available there: Scandinavia House returns `null` on all 41 of its events. The
field exists and the collector reads it; the tenant does not fill it in.

### Unknown years are published, marked, and never dropped

343 records carried no year at all. The obvious worry was that a missing year
means a film too new to have been catalogued, which would make "keep the
unknowns" keep exactly what this rule exists to remove. Four titles suggested
it, all four of them IFC Center.

A random sample of 50 year-less films was looked up one at a time rather than
assumed:

| Bucket | Count |
| --- | --- |
| Not a single film (shorts programme, festival day, series banner, double bill, book launch) | 20 |
| A single film, released pre-2000 | 12 |
| A single film, 2000-2024 | 9 |
| A single film, 2025 or later | 9 |

**A missing year does not correlate with recency.** It correlates with not being
one film with one release date, and secondarily with house style: Anthology
omits the year on everything it programmes, canon or premiere. Of the 20 that
are not single films, 7 screen pre-2000 archival work, 6 screen contemporary
work, 5 are mixed and 2 could not be determined.

Of the 550 records in the dataset that pass `limited`, 195 still have no year
after all three lookups, and **101 of those are Anthology Film Archives** - the Essential Cinema
canon and filmmaker retrospectives, the most repertory programme in the city -
with Film Forum's Coppola season, BAM's archival double bills and the Paris's
introduced revivals making up much of the rest. On the sampled proportions,
dropping unknowns would delete roughly four repertory listings to remove one
first-run listing.

The failure modes are not symmetric either. Publishing a first-run preview is a
listing a reader can see and ignore. Deleting a Dreyer retrospective from a
calendar that exists to carry exactly that is the product failing silently. So
an unknown-year record is `vintage: true` with `vintage_year: null`, and
`build.mjs` prints "Year unknown, so we could not check whether this is a
revival. Listed anyway." next to it. Nothing is dropped for being
unclassifiable.

The known, accepted cost: Scandinavia House's "New Nordic Cinema" is new films
and publishes anyway. That is written down rather than papered over with a venue
blocklist, which is the proxy POSITIONING.md already rejected once.

Measured 2026-08-21, over the records that pass `limited`:

| Source | Limited | Published | First-run | Year unknown |
| --- | --- | --- | --- | --- |
| elevent | 26 | 25 | 1 | 24 |
| luma | 4 | 4 | 0 | 4 |
| nyc-parks | 53 | 35 | 18 | 24 |
| paris-theater | 5 | 5 | 0 | 4 |
| repertory-nyc | 461 | 403 | 58 | 138 |
| **total** | **549** | **472** | **77** | **194** |

(549 rather than 550, and 194 rather than 195, because the collector's table
counts the live collection and the dataset also holds one cancelled tombstone.)

Year provenance across all 1,373 records: 1,031 from the source, 3 from the
title, 103 from the catalog, 236 unknown.

The calendar went from 526 VEVENTs and 369 KiB to **465 VEVENTs and 326 KiB**,
so both the 1,000-event cap and the 900 KiB budget got further away.

## Three traps this collector is built around

They are the same failure class three times: **bad times in this domain arrive
well-formed.** A schema check passes, no exception is thrown, and the output is
wrong.

- **Film Forum** emits perfect `ScreeningEvent` JSON-LD in which every
  `startDate` is an empty string. `assertParsedTimes()` fails a source that
  produced raw items and zero usable start times.
- **Elevent** writes a 12-hour clock as 24-hour with no meridiem in its JSON-LD,
  so every evening screening is twelve hours wrong. We never read that JSON-LD;
  only the `model` attribute, which carries correct wall-clock times.
- **NYC Parks** pins the date component of `starttime` to the feed's generation
  date on 90% of rows. The date comes from `startdate`, the time-of-day from
  `starttime`, and `assertDateSpread()` refuses a run that collapsed onto one
  date.

## Two security rules

Both are in `common.mjs` and are enforced, not documented.

**Fetched bytes are data, never instructions.** Every URL this collector will
ever fetch is a compile-time constant in this repository: the Elevent tenant
allowlist, the Luma calendar ids, two API bases, one homepage. There is no code
path from a response body to a new URL, a new source, or a config change. A
`robots.txt` on an A24 subdomain was found in the wild carrying text addressed
to AI agents asking them to install a shopping skill and make purchases;
`scanForAgentDirectives()` logs that class of text at the end of a run as a
curiosity and has no effect on control flow.

**Cross-domain redirects are refused.** Redirects are followed by hand.
`queensdrivein.com` now redirects to a gambling site; a venue domain that has
been sold on must not silently become a source. Same-registrable-domain hops
(`www` to apex, http to https, `tickets.venue.com`) are fine; anything else
throws unless the source named the host in `allowHosts`.

## Extending it

- **A new Elevent tenant:** add a line to `TENANTS` in `source-elevent.mjs`.
  `--list-elevent-tenants` prints the live roster. Set `mode: 'mixed'` for a
  venue that also sells concerts and workshops; mixed tenants must show positive
  film evidence before anything is published.
- **A new programmer:** get one Luma event link, resolve it once with
  `https://api.lu.ma/url?url=<slug>` to a `calendar_api_id`, and add a line to
  `CALENDARS` in `source-luma.mjs`. That is the whole onboarding cost.
- **A venue address:** one line in `venue-book.mjs`. The run prints every venue
  currently falling back to `New York, NY`.
- **A new source:** a module exporting `id`, `label`, `credit` and
  `collect(ctx)`, returning `{screenings, venues, stats, notes}`, then one entry
  in `SOURCES` in `collect.mjs`. Position in that array is the dedupe priority.

## What is off limits

- **Screen Slate.** Not fetched, not parsed, not ingested. Settled in
  DECISIONS.md: we do not need it.
- **Eventbrite.** ToS §13 bans automated extraction by name.
- **nycgovparks.org.** AWS WAF challenges everything, and its robots.txt
  disallows its own `/*json` and `/*xml`. Open Data is the only route.
- **Cloudflare-blocked hosts** (`tickets.paristheaternyc.com`, MoMI, MoMA). No
  headless browser, no proxy, no spoofed User-Agent. Those are enforceable
  statements of intent.

## Known gaps

- **The Paris's ordinary daily showtimes are not collected.** Only its special
  engagements are. The daily times live solely behind the Cloudflare-protected
  Vista subdomain, and the CMS payload carries an `OpeningDate`/`ClosingDate`
  run rather than a schedule. Turning a run into showtimes would mean inventing
  them.
- **Title variants that disagree about the time are not merged.**
  `collapseTitleVariants()` merges a screening a source described twice under
  variant titles, but only when the venue, the start minute and the `url` all
  match exactly. repertory.nyc sometimes emits the pair with the two rows
  disagreeing about the time as well: Crank at Roxy on 22 Aug is listed at 16:30
  and at 17:00 under the one ticket id 7681, and Click on 22 Aug at 14:00 and
  14:45 under 7685. Merging those would mean choosing a showtime, which this
  collector never does. They still list twice, and that is the honest outcome
  until the source is fixed or a venue is asked.
- **The filter is still blind at the far edge of the collection window**, just
  less so. A run that begins on the last day or two we can see looks like a
  one-off until the next fortnight arrives. `WINDOWS = 3` cuts this from 18 of
  185 qualifying repertory.nyc groups to 4 of 288. The near edge self-corrects
  once the dataset has history, because carried-forward past dates still count.
- **A merge keeps the shorter title and loses the longer one's extra words.**
  Right for "Crank - 35MM" over "Crank - 35MM | 2006 Movies", and right for
  "JERKER" over "NARROW ROOMS: JERKER". Lossy for "PGM 1: NEW DISCOVERIES" over
  "GANZ + STREETER, PGM 1: NEW DISCOVERIES", where the dropped prefix names the
  filmmakers. The clean fix is for the merge to write the dropped fragment into
  the record's `series` field, which already exists and which repertory.nyc
  never populates. Not done: it changes the rendered body and would move
  `updated_at` on every merged record, and it wanted more test than a final
  round had room for.
