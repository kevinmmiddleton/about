# tools/one-night-only/

The output layer for One Night Only. Takes one normalised dataset and emits the
three published artefacts, plus the linter that gates them in CI.

Node only, no npm packages. `node --version` here was v25.2.1; anything with
`Intl.DateTimeFormat` and `node:crypto` will do.

Nothing in here collects anything. A separate agent owns collection. This layer
consumes `one-night-only/_data/screenings.json` and does not care where it came from.

## Files

| File | What it does |
| --- | --- |
| `build.mjs` | Reads the dataset, writes `one-night-only/{index.html,feed.xml,calendar.ics}`. |
| `lint-ics.mjs` | RFC 5545 structural linter. The CI gate. Exit 1 on any error. |
| `tombstones.mjs` | The ledger. Mints identity once, diffs runs, turns disappearances into cancellations. |
| `fixtures/` | Hand-written test data. See below. |

## Running it

Run everything from the repo root.

```bash
# collect, reconcile into the committed dataset, and write the site
node tools/one-night-only/collect/collect.mjs
node tools/one-night-only/build.mjs
node tools/one-night-only/lint-ics.mjs one-night-only/calendar.ics
```

With no arguments, `build.mjs` reads `one-night-only/_data/screenings.json` and
writes `one-night-only/`. Both defaults resolve from the script's own location,
not the working directory, so they hold wherever you run from. `tombstones.mjs`
updates the dataset in place unless given `--out`, and `--dry-run` prints the
diff without writing. `collect.mjs` calls it for you.

`.github/workflows/one-night-only.yml` runs exactly these three commands on a
schedule and commits only when the output changed.

`build.mjs` prints the size of `calendar.ics` on every run and exits 1 if it
goes over 900 KB. It also exits 1, before writing anything, if the dataset is
empty or if the calendar would carry zero VEVENTs. Both budgets are asserted,
not assumed, and the zero guard is the second CI gate after the linter.

### Against the fixtures

```bash
cd tools/one-night-only
NABE_NOW=2026-08-20T12:00:00Z node build.mjs --data fixtures/screenings.json --out /tmp/ono-dist
node lint-ics.mjs /tmp/ono-dist/calendar.ics
```

`NABE_NOW` is a test hook. It pins the instant used for the rolling window so
fixture output is reproducible. It is not a build timestamp and nothing derived
from it reaches any output file. In production it is unset.

### Byte stability

```bash
node build.mjs --data fixtures/screenings.json --out /tmp/a
node build.mjs --data fixtures/screenings.json --out /tmp/b
diff -r /tmp/a /tmp/b     # must be silent
```

This is the whole point of the DTSTAMP and `lastBuildDate` design. If it ever
fails, a build timestamp has leaked into an output file, and the consequence is
a junk commit on every scheduled run, a new ETag, and every subscriber
re-downloading a file that did not change.

In the Action, check `git diff --quiet` before committing and skip the commit
step on exit 0.

## The three windows

They are deliberately different. One dataset, three granularities, on purpose.

| Artefact | Window | Cap | Contents | Sort |
| --- | --- | --- | --- | --- |
| `calendar.ics` | now to +6 months | 1000 VEVENT | `limited` **and** `vintage` | start ascending, UID tiebreak |
| `feed.xml` | now to +60 days | 50 items | `limited` **and** `vintage` | pubDate descending, start ascending |
| `index.html` | -30 days to +6 months | none | everything | start ascending |

Past screenings drop out of the calendar once they have ended. Tombstones are
the exception: a cancelled screening stays for 30 days past its event date, then
disappears. It has to outlive the slowest realistic subscriber refresh, and
Google can go 24 to 48 hours between fetches.

VEVENTs sort ascending by start because `research/calendar-limits.md` documents
a Google subscribe-by-URL bug that drops events silently and by position in the
file. If a client truncates, the screenings that survive should be the soonest
ones, which are the only ones a subscriber can still act on.

## The two publication filters

`calendar.ics` and `feed.xml` carry only screenings the collector marked **both**
`limited` and `vintage`. `index.html` carries everything, badges the qualifying
ones, says of every excluded listing why it is excluded, and has one checkbox
per filter so each subset can be read on its own.

* **`limited`** - the film plays few enough dates at that venue to be a one-off
  rather than a run. The one-night-only filter, below.
* **`vintage`** - the film is old enough to be a revival rather than a first
  run. The repertory filter, below.

Both are computed once in the collector and stored. Both are read here and never
recomputed.

A screening qualifies if its film plays on **two or fewer distinct dates at that
venue** inside the collection window, **or on three dates with no more than one
showtime on any of them**. Four showtimes on one Saturday is one date and
qualifies. A week-long run does not. POSITIONING.md has the argument; the short
version is that a film playing sixteen showtimes over a fortnight at Film Forum
is a run, three other aggregators already list it, and it was crowding the
non-cinema tier out of the calendar through the 1,000-event cap. The three-date
clause is the amendment: what separates a run from a series is showtimes per
day, not days, and three scattered single showings is a series you attend once.

The decision is made **once, in the collector**, over the whole collection, and
stored on the record as `limited`, `dates_at_venue` and `max_showtimes_per_date`. This layer reads it and
never recomputes it, for the same reason it never recomputes a UID. See
`qualifies()` in `build.mjs` and `assignLimited()` in `collect/collect.mjs`.

`qualifies()` tests `limited !== false`, not `limited === true`. A missing flag
publishes too much, the cap warns, and a human looks. The other way round, a
missing flag would empty the calendar and cancel every screening on every
subscriber's calendar. Measured 2026-08-20 with the amended rule and
`WINDOWS = 3`: 1,374 collected, 550 qualifying, 526 inside the calendar window,
369 KiB of the 900 KiB budget and 526 of the 1,000 VEVENTs.

None of the three stored filter fields reaches the rendered VEVENT body, so a
record that changes qualification does not move its `updated_at`. That is what
lets the filter be recomputed every run without churning the feed.

## The repertory filter

The product is repertory: an old film returning to a screen. A first-run release
playing a one-off preview is not that, however limited the engagement, and
`limited` alone lets those through - Roxy's premiere-and-Q&A nights, IFC's
first-run documentaries, NYC Parks' summer blockbusters.

A screening is `vintage` if its film was released at least
`GUARD.vintageMinAgeYears` (2) calendar years before the year the collector runs
in. Running in 2026, that means 2024 or earlier is repertory and 2025 or 2026 is
first-run. It is written as an **age**, not as a fixed cutoff year, so it ages
correctly on 1 January with nobody editing anything. The previous year is
excluded as well as the current one because a December release is still touring
first-run screens the following autumn.

Three fields are stored: `vintage`, plus `vintage_year` and `vintage_year_from`
so the call is auditable. The year is taken from the source's own `year`, else a
`(1974)` inside the title, else repertory.nyc's film catalog keyed by
`film_key`. `year` itself is never overwritten: it renders into the VEVENT
SUMMARY, so writing a recovered year there would move `updated_at` and
re-notify subscribers. `vintage_year` renders nowhere, exactly like
`dates_at_venue`.

**An unknown year is published, marked, and never dropped.** The reasoning, the
sample that produced it, and the residual cost are in the `assignVintage()`
docstring in `collect/collect.mjs`; the short version is that a missing year
turned out to correlate with *not being a single film* rather than with being a
new one, and that dropping unknowns would delete roughly four repertory listings
to remove one first-run listing. `qualifies()` tests `vintage !== false` for the
same reason it tests `limited !== false`.

Measured 2026-08-21: 1,374 records, 550 `limited`, 681 `vintage`, **473 both**.
The calendar went from 526 VEVENTs to 465 and from 369 KiB to 326 KiB, so the
1,000-event cap and the 900 KiB budget both got further away, not closer.

## Source credits

`sources.json` is read from the directory the dataset lives in (`one-night-only/_data/`). Its entries are
rendered in three places: a `Sources` footer on `index.html`, and a sentence
appended to `DESCRIPTION` / `X-WR-CALDESC` in the ICS and to the RSS channel
`description`. repertory.nyc's robots.txt permits this collector by name and
their data is a large share of the listings, so this is an obligation.

A missing `sources.json` is not an error, so a fixture build without one still
works. `fixtures/sources.json` exists so the credit path is exercised anyway.

## Identity

Three constants in `CONFIG` are load-bearing and must never change:

- `uidDomain: 'screenings.middleton.io'`, the right hand side of every ICS UID.
  Deliberately decoupled from the product name. The project was called Nabe when
  this was written and is now called One Night Only; the UID domain did not move,
  and it must not move again. A changed UID is a permanent duplicate on every
  subscriber's calendar and there is no way to clean it up.
- `tagAuthority` and `tagYear`, the RFC 4151 tag URI for RSS guids,
  `tag:middleton.io,2026:screening/<hash>`. The year is a constant, not the
  current year. Letting it roll over on 1 January re-notifies every subscriber.
- The `VTIMEZONE` block, a hardcoded golden constant. A typo in it silently
  shifts every showtime and no validator or parser will tell you.

`siteBase` is not identity. It is safe to change: it only affects `URL`,
`SOURCE`, the RSS `link` and the HTML. It is currently
`https://middleton.io/one-night-only/`.

UIDs are minted once, by `tombstones.mjs`, on first discovery, and written into
the dataset. `build.mjs` reads the stored value and throws if it is missing. It
never computes one. That makes UID stability a property of a committed file you
can read in a diff, rather than a property of a function nobody re-reads.

## fixtures/

- `collected-run1.json`. Hand-written collector output. Nine screenings, each
  annotated with the case it covers.
- `collected-run2.json`. Run 1 with `Meshes of the Afternoon` removed, so the
  ledger has something to tombstone.
- `screenings.json`. The dataset, produced by running the ledger over run 1 and
  then run 2. This is what `build.mjs` reads.
- `sources.json`. A stand-in for `one-night-only/_data/sources.json`, so the credit path runs.

Regenerate it with:

```bash
cd tools/one-night-only
rm -f fixtures/screenings.json
NABE_NOW=2026-08-18T09:00:00Z node tombstones.mjs --incoming fixtures/collected-run1.json \
  --dataset fixtures/screenings.json --out fixtures/screenings.json
NABE_NOW=2026-08-20T09:00:00Z node tombstones.mjs --incoming fixtures/collected-run2.json \
  --dataset fixtures/screenings.json --out fixtures/screenings.json
```

The UIDs in `fixtures/screenings.json` are the UID stability test. Any diff to
them in a pull request is either a deliberate, reviewable act or a bug.

What the fixtures cover:

| Case | Record |
| --- | --- |
| Normal evening screening | Boogie Nights, Paris Theater, 4 Sep 19:30 |
| Double feature, same venue, same night | Chungking Express 19:00 and Fallen Angels 21:30, Metrograph, 12 Sep |
| Comma, semicolon, apostrophe, colon and backslash in a title | `Sex, Lies; and Videotape: A Projectionist's Cut \ Reel 2`, Spectacle |
| Very long title, accented Latin plus CJK, forces multi-octet-safe folding | Cherry Lane, 8 Oct |
| Midnight show crossing the date boundary | Texas Chain Saw Massacre, 19 Sep 23:50, ends 20 Sep 01:50 |
| Cancelled tombstone | Meshes of the Afternoon, Anthology, 17 Oct |
| `STATUS:TENTATIVE` | the Cherry Lane long-title screening |
| Comma inside a venue name, so inside a CATEGORIES member | Nitehawk Cinema, Prospect Park |
| DST fall-back | Daughters of the Dust, 1 Nov 18:00, must resolve to 23:00Z not 22:00Z |
| A run, `limited: false` | Jeanne Dielman, Metrograph, 30 Sep. In the HTML, out of the ICS and the feed |
| A day with no qualifying listing | 30 Sep, which renders `data-limited="0"` and hides under the filter |

The fixtures predate the `vintage` field and therefore carry none, which
`qualifies()` reads as `vintage !== false` and publishes. That is the intended
default and is itself the regression test for a record collected before the
rule existed.

Spring-forward is not covered. 8 March 2026 is in the past and 13 March 2027 is
outside the 6-month forward window from the pinned fixture date, so a
spring-forward fixture could not be both realistic and inside the window. The
fall-back case exercises the same code path.

## Validators

Steps 1 to 4 are offline and must pass. Steps 5 and 6 hit the network and should
warn rather than block if the service is unreachable. Do not make the build
depend on a third-party site being up.

### 1. ICS structure, local linter, the actual gate

```bash
node tools/one-night-only/lint-ics.mjs one-night-only/calendar.ics
```

Catches the class of bug that real parsers accept silently: `END:VEVENTX`,
duplicate UIDs, unfolded over-length lines, bare LF, a floating `DTSTART`, a
`DTSTAMP` without `Z`. Exit 0 clean, 1 on any error.

### 2. ICS semantics, ical.js

Not a conformance validator. It parses `END:VEVENTX` without complaint. Use it
for the one thing it is good at: confirming a real client resolves your times to
the instants you intended, against your embedded `VTIMEZONE`.

```bash
npm install ical.js
```

```js
const ICAL = require('ical.js'), fs = require('fs');
const comp = new ICAL.Component(ICAL.parse(fs.readFileSync('calendar.ics', 'utf8')));
for (const v of comp.getAllSubcomponents('vevent')) {
  const e = new ICAL.Event(v);
  console.log(e.startDate.toJSDate().toISOString(), e.startDate.zone.tzid,
              v.getFirstPropertyValue('status'));
}
```

`zone.tzid` must be `America/New_York`. If it says `floating`, the `VTIMEZONE`
block is missing or the `TZID` parameter was dropped, and every subscriber
outside New York is seeing the wrong time.

### 3. Feed well-formedness

```bash
xmllint --noout one-night-only/feed.xml
```

### 4. HTML, Nu HTML Checker

Run it locally. `validator.nu` returns 502 and the hosted
`validator.w3.org/nu/` sits behind a Cloudflare challenge that rejects scripted
POSTs.

```bash
npm install --save-dev vnu-jar
java -jar ./node_modules/vnu-jar/build/dist/vnu.jar \
  --skip-non-html --errors-only --format gnu ./one-night-only/
```

`--skip-non-html` matters, because the output directory also holds
`calendar.ics` and `feed.xml`. A pass is silent output and exit code 0. There is
no success message. This needs a JRE on the machine; the npm package ships the
jar, not the runtime.

There is no usable schema.org validation API, so the JSON-LD is asserted
structurally instead: parse each `<script type="application/ld+json">` block,
assert valid JSON, `@context` of `https://schema.org`, `@type` of `Event`, and
the presence of `name`, `startDate` and `endDate` with a real offset,
`eventStatus`, and `location` with a nested `Place` and `address`.

### 5. ICS conformance, icalendar.org

```bash
curl -sS --max-time 60 -X POST "https://icalendar.org/validator.html" \
  --form "jform[ical_text]=<calendar.ics" \
  --form "jform[task]=validate" \
  -o result.html
```

**The `<` in `--form "field=<file"` is load-bearing.** It tells curl to read the
file's bytes as the field value.

Do **not** write `--form "jform[ical_text]=$(cat calendar.ics)"`. Shell command
substitution strips the carriage returns, and you get three bogus errors about a
missing colon and a missing `END:VCALENDAR` that have nothing to do with your
file. Re-confirmed against a known-good `calendar.ics`: the `<` form returned
`Success`, the `$(cat ...)` form returned `Problem! Found 3 errors`.

Grepping the verdict: the page markup is
`<strong>Success</strong>! No errors found.`, so the string `Success ! No errors
found` does not appear in the raw HTML. It only reads that way once the tags are
stripped. Grep for `No errors found` and fail on `Problem!`, both of which do
appear literally.

Over-length lines come back as warnings, not errors. Treat them as failures in
CI anyway.

### 6. Feed conformance, W3C

```bash
curl -sS --max-time 40 -X POST "https://validator.w3.org/feed/check.cgi" \
  --data-urlencode "rawdata@feed.xml" \
  --data "manual=1&output=soap12"
```

Gate on `<m:validity>true</m:validity>` and `<m:errorcount>0</m:errorcount>`.

One warning is expected and safe to ignore: `SelfDoesntMatchLocation`. It is
unavoidable when validating by raw data, because there is no document location
to compare the `atom:link rel="self"` href against, and it disappears once you
validate the deployed URL:

```bash
curl -sS "https://validator.w3.org/feed/check.cgi?url=https%3A%2F%2Fmiddleton.io%2Fone-night-only%2Ffeed.xml&output=soap12"
```

Fallback, same API shape, for when the W3C service is down. Note that the
commonly cited `validator.rssboard.org` is NXDOMAIN; this is the live endpoint:

```bash
curl -sS --max-time 40 -X POST "https://www.rssboard.org/rss-validator/check.cgi" \
  --data-urlencode "rawdata@feed.xml" --data "output=soap12"
```

Feed warnings that are hard failures: `IncorrectDOW`, `InvalidRFC2822Date`,
`MissingDescription`, `MissingGuid`, any XML well-formedness error. Weekday names
are always derived from the date here, never hardcoded, because a wrong one
flips validity to false.

## Line endings

`.gitattributes` at the repo root carries `*.ics -text`. It is there; check before assuming. Without it, git's
`text=auto` normalisation strips the CRs between an author's machine and the
deploy and the published feed goes out LF-only. This has happened to a live
GitHub Pages feed. The linter catches it, but only if the linter runs on the
bytes that actually ship.

## Known gaps

- **RSS run collapse is not implemented.** Section 2.6 of the spec suggests
  emitting one item for a film that plays the same venue on five consecutive
  nights, with a guid derived from `venue + film + first_date`. That guid is a
  new identity, and this layer does not mint identities: the ledger does, once,
  and stores them. Implementing collapse here would put an identity function in
  the renderer, which is the exact failure mode the spec spends section 1.4
  warning about. If it is wanted, the collector should emit a stored `run_key`
  and `run_guid` per record and the renderer should group on those.
- **RSS item churn is bounded but not eliminated.** The 50-item cap drops the
  furthest-out screenings, so an item dropped for being too far out re-enters
  the feed as its date approaches, and a reader will re-notify. Truly
  one-directional ageing needs a `first_emitted_at` stamp in the dataset, which
  is the ledger's job to add. At realistic NYC volume inside a 60-day window the
  cap is unlikely to bind.
- **The fall-back repeated hour resolves to the first occurrence.** A screening
  starting between 01:00 and 02:00 on a fall-back Sunday is ambiguous. RFC 5545
  resolves TZID the same way, so this matches what clients do, but it is a real
  ambiguity rather than a solved problem.
