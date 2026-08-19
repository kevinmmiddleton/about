# Change log

Chronological record of changes to this bundle, newest first.

## 2026-08-18 — migrated to OKF v0.2

- Replaced `timestamp` with `generated` (`by` + ISO 8601 `at`) on all ten
  concept files. Dates are backdated honestly: files whose content did not
  change keep 2026-06-30.
- Declared `okf_version: "0.2"` on `index.md`, and removed the rest of that
  file's frontmatter, which had never conformed (index files carry no
  frontmatter except the version at the bundle root).
- Added `verified` with a `human:` actor, which places the bundle in the
  human-reviewed trust tier. Every file was re-read in this pass.
- Added `status: stable` and an absolute `stale_after` to each concept.
  Profile, skills, and case studies expire 2027-02-17; contact 2027-12-31;
  everything else 2027-06-30.
- Added `sources` to the four concepts derived from specific blog posts.
- Content: replaced present-tense job-search framing with a description of
  what the system does, per the site-wide rule that no surface states
  employment status in either direction. Dropped a running application count
  for the same reason.
- Removed a banned word from a section heading in `how-i-work.md`.

## 2026-07-28 — identity consolidation

- Added the Identity section to `index.md`: Wikidata Q140389537 as the
  canonical entity, plus LinkedIn and GitHub, so agents resolve the right
  Kevin Middleton.

## 2026-06-30 — first published

- Eleven concept files deployed to middleton.io/okf/ and pointed to from
  llms.txt.
