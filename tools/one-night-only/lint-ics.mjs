#!/usr/bin/env node
// lint-ics.mjs - zero-dependency RFC 5545 structural linter.
//
// This is the CI gate. No maintained offline tool checks RFC 5545 conformance,
// and the parsers that exist (ical.js, python icalendar) silently accept
// structural corruption such as END:VEVENTX. So we check it ourselves.
//
// Checks, per output-spec.md section 3.3:
//   1.  No bare LF and no bare CR anywhere in the file.
//   2.  The file ends with CRLF.
//   3.  No NUL bytes.
//   4.  Every physical line is <= 75 octets (Buffer.byteLength, not String.length).
//   5.  Unfold, then match BEGIN:/END: with a stack. Report mismatches and
//       anything left unclosed.
//   6.  First logical line is BEGIN:VCALENDAR, last is END:VCALENDAR.
//   7.  VERSION:2.0, PRODID: and CALSCALE:GREGORIAN are all present.
//   8.  Every VEVENT has UID, DTSTAMP, DTSTART and SUMMARY.
//   9.  Every UID is unique across the file. No external validator does this,
//       and it is the check that protects subscribers from permanent duplicates.
//   10. Every VEVENT DTSTART/DTEND carries TZID=America/New_York, never floating,
//       never a trailing Z. DTSTARTs inside VTIMEZONE are exempt: those are
//       defined by RFC 5545 to be local to the offset rule that contains them.
//   11. Every DTSTAMP/CREATED/LAST-MODIFIED ends in Z and carries no TZID.
//
// Usage:  node lint-ics.mjs <file.ics> [more.ics ...]
// Exit 0 on a clean file, 1 on any error.

import { readFileSync } from 'node:fs';
import process from 'node:process';

const TZID = 'America/New_York';
const MAX_OCTETS = 75;

const UTC_ONLY = new Set(['DTSTAMP', 'CREATED', 'LAST-MODIFIED']);
const REQUIRED_CAL = [
  { name: 'VERSION', exact: 'VERSION:2.0' },
  { name: 'PRODID', prefix: 'PRODID:' },
  { name: 'CALSCALE', exact: 'CALSCALE:GREGORIAN' },
];
const REQUIRED_EVENT = ['UID', 'DTSTAMP', 'DTSTART', 'SUMMARY'];

function lint(path) {
  const errors = [];
  const err = (line, message) => errors.push({ line, message });

  let buf;
  try {
    buf = readFileSync(path);
  } catch (e) {
    return { path, errors: [{ line: 0, message: `cannot read file: ${e.message}` }], events: 0, uids: 0 };
  }

  // ---- byte-level checks (1, 2, 3) ------------------------------------
  if (buf.length === 0) {
    return { path, errors: [{ line: 0, message: 'file is empty' }], events: 0, uids: 0 };
  }

  // Physical line numbers for byte offsets, counted by LF so the numbers line
  // up with what an editor shows even when the CRLF discipline is broken.
  let physLine = 1;
  let bareLf = 0, bareLfFirst = 0;
  let bareCr = 0, bareCrFirst = 0;
  let nul = 0, nulFirst = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x00) {
      if (!nul++) nulFirst = physLine;
    }
    if (b === 0x0d) {
      if (buf[i + 1] !== 0x0a && !bareCr++) bareCrFirst = physLine;
    } else if (b === 0x0a) {
      if (buf[i - 1] !== 0x0d && !bareLf++) bareLfFirst = physLine;
      physLine++;
    }
  }
  if (nul) err(nulFirst, `NUL byte in file (${nul} occurrence(s), first here)`);
  if (bareCr) err(bareCrFirst, `bare CR, 0x0D not followed by 0x0A (${bareCr} occurrence(s), first here)`);
  if (bareLf) {
    err(bareLfFirst,
      `bare LF, 0x0A not preceded by 0x0D (${bareLf} occurrence(s), first here). ` +
      'RFC 5545 3.1 requires CRLF on every line.');
  }

  // A file that is not CRLF-delimited has no meaningful line structure, so
  // every downstream check would report garbage. Say the one useful thing and
  // stop. In practice this is git's text=auto normalisation stripping the CRs
  // between an author's machine and the deploy; the fix is `*.ics -text` in
  // .gitattributes.
  if (bareLf || bareCr) {
    err(0, 'line-ending discipline is broken, so structural checks were skipped. ' +
      'Fix CRLF first, then re-run. Check .gitattributes for `*.ics -text`.');
    return { path, errors: errors.sort((a, b) => a.line - b.line), events: 0, uids: 0, partial: true };
  }

  if (!(buf[buf.length - 2] === 0x0d && buf[buf.length - 1] === 0x0a)) {
    err(physLine, 'file does not end with CRLF after END:VCALENDAR');
  }

  // ---- physical lines and the 75-octet rule (4) ------------------------
  const text = buf.toString('utf8');
  const physical = text.split('\r\n');
  // A well-formed file ends with CRLF, so the final split element is ''.
  if (physical.length && physical[physical.length - 1] === '') physical.pop();

  physical.forEach((line, i) => {
    const octets = Buffer.byteLength(line, 'utf8');
    if (octets > MAX_OCTETS) {
      err(i + 1, `line is ${octets} octets, limit is ${MAX_OCTETS}; it was not folded`);
    }
  });

  // ---- unfold (5) ------------------------------------------------------
  // A continuation line starts with a single SPACE or HTAB. Unfolding removes
  // the CRLF and that one whitespace character.
  const logical = [];
  physical.forEach((line, i) => {
    if ((line.startsWith(' ') || line.startsWith('\t')) && logical.length) {
      logical[logical.length - 1].value += line.slice(1);
    } else {
      logical.push({ value: line, line: i + 1 });
    }
  });

  if (logical.length === 0) {
    return { path, errors: errors.concat([{ line: 0, message: 'no content lines' }]), events: 0, uids: 0 };
  }

  // ---- structure: BEGIN/END stack (5), envelope (6) --------------------
  const stack = [];
  const componentPath = [];
  let eventCount = 0;
  const uidSeen = new Map();
  const calProps = new Set();
  let currentEvent = null;

  const first = logical[0].value;
  const last = logical[logical.length - 1].value;
  if (first !== 'BEGIN:VCALENDAR') {
    err(logical[0].line, `first line is "${truncate(first)}", expected BEGIN:VCALENDAR`);
  }
  if (last !== 'END:VCALENDAR') {
    err(logical[logical.length - 1].line, `last line is "${truncate(last)}", expected END:VCALENDAR`);
  }

  for (const { value, line } of logical) {
    const colon = value.indexOf(':');
    if (colon < 0) {
      err(line, `content line has no colon: "${truncate(value)}"`);
      continue;
    }
    const rawName = value.slice(0, colon);
    const body = value.slice(colon + 1);
    const semi = rawName.indexOf(';');
    const name = (semi < 0 ? rawName : rawName.slice(0, semi)).toUpperCase();
    const params = semi < 0 ? '' : rawName.slice(semi + 1);

    if (!/^[A-Za-z0-9-]+$/.test(name)) {
      err(line, `invalid property name "${truncate(rawName)}"`);
      continue;
    }

    if (name === 'BEGIN') {
      stack.push({ component: body, line });
      componentPath.push(body);
      if (body === 'VEVENT') {
        eventCount++;
        currentEvent = { line, props: new Set() };
      }
      continue;
    }

    if (name === 'END') {
      const open = stack.pop();
      if (!open) {
        err(line, `END:${truncate(body, 30)} with no matching BEGIN`);
        continue;
      }
      if (open.component !== body) {
        err(line, `mismatched BEGIN and END (BEGIN:${truncate(open.component, 30)} at line ${open.line}, END:${truncate(body, 30)})`);
      }
      componentPath.pop();
      if (open.component === 'VEVENT') {
        if (currentEvent) {
          for (const required of REQUIRED_EVENT) {
            if (!currentEvent.props.has(required)) {
              err(currentEvent.line, `VEVENT beginning here is missing ${required}`);
            }
          }
        }
        currentEvent = null;
      }
      continue;
    }

    const inside = componentPath[componentPath.length - 1] || null;
    const inVevent = inside === 'VEVENT';
    const inTimezone = componentPath.includes('VTIMEZONE');

    if (inside === 'VCALENDAR') calProps.add(value);
    if (currentEvent && inVevent) currentEvent.props.add(name);

    // (9) UID uniqueness across the whole file.
    if (name === 'UID') {
      if (uidSeen.has(body)) {
        err(line, `duplicate UID "${truncate(body)}" (first seen at line ${uidSeen.get(body)})`);
      } else {
        uidSeen.set(body, line);
      }
    }

    // (10) DTSTART/DTEND in a VEVENT must be TZID-qualified local time.
    if ((name === 'DTSTART' || name === 'DTEND') && inVevent) {
      if (!/(^|;)TZID=/i.test(params)) {
        err(line, `${name} has no TZID parameter; it will be treated as floating local time`);
      } else if (!new RegExp(`(^|;)TZID=${TZID}(;|$)`, 'i').test(params)) {
        err(line, `${name} carries TZID="${params}", expected TZID=${TZID}`);
      }
      if (body.endsWith('Z')) {
        err(line, `${name} is both TZID-qualified and UTC-suffixed with Z; pick one`);
      }
      if (!/^\d{8}T\d{6}$/.test(body)) {
        err(line, `${name} value "${truncate(body)}" is not YYYYMMDDTHHMMSS local time`);
      }
    }

    // A DTSTART inside VTIMEZONE is exempt from (10) by design. Assert only
    // that it is a bare local time, which is what RFC 5545 requires there.
    if (name === 'DTSTART' && inTimezone && !inVevent) {
      if (body.endsWith('Z') || /TZID=/i.test(params)) {
        err(line, 'DTSTART inside VTIMEZONE must be a bare local time with no TZID and no Z');
      }
    }

    // (11) UTC-only properties.
    if (UTC_ONLY.has(name)) {
      if (/TZID=/i.test(params)) err(line, `${name} must not carry a TZID parameter`);
      if (!/^\d{8}T\d{6}Z$/.test(body)) {
        err(line, `${name} value "${truncate(body)}" is not YYYYMMDDTHHMMSSZ`);
      }
    }
  }

  for (const open of stack) {
    err(open.line, `BEGIN:${truncate(open.component, 30)} was never closed`);
  }

  // (7) required calendar-level properties.
  for (const req of REQUIRED_CAL) {
    const present = req.exact
      ? calProps.has(req.exact)
      : [...calProps].some((p) => p.startsWith(req.prefix));
    if (!present) {
      err(1, `calendar is missing ${req.exact || req.prefix + '...'}`);
    }
  }

  errors.sort((a, b) => a.line - b.line);
  return { path, errors, events: eventCount, uids: uidSeen.size };
}

// Quote a fragment of the file safely into an error message: control characters
// become escapes so a mangled file cannot spray raw bytes across the terminal,
// and long values are cut short.
function truncate(s, n = 60) {
  const flat = String(s)
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/[\u0000-\u001F\u007F]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
  return flat.length <= n ? flat : flat.slice(0, n) + '...';
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    process.stderr.write('usage: node lint-ics.mjs <file.ics> [more.ics ...]\n');
    process.exit(2);
  }

  const MAX_SHOWN = 25;
  let failed = 0;
  for (const file of files) {
    const r = lint(file);
    const status = r.errors.length === 0 ? 'ok' : 'FAIL';
    process.stdout.write(
      `${r.path}: ${r.events} VEVENT, ${r.uids} unique UID, ${r.errors.length} error(s)  ${status}` +
      `${r.partial ? '  (structural checks skipped)' : ''}\n`
    );
    for (const e of r.errors.slice(0, MAX_SHOWN)) {
      // line 0 means "about the file as a whole", not a position in it.
      process.stdout.write(e.line ? `  line ${e.line}: ${e.message}\n` : `  ${e.message}\n`);
    }
    if (r.errors.length > MAX_SHOWN) {
      process.stdout.write(`  ... and ${r.errors.length - MAX_SHOWN} more. Fix these first.\n`);
    }
    if (r.errors.length) failed++;
  }

  if (failed) {
    process.stdout.write(`\nlint-ics: ${failed} file(s) failed RFC 5545 checks.\n`);
    process.exit(1);
  }
  process.stdout.write('lint-ics: all files passed.\n');
  process.exit(0);
}

export { lint };

if (import.meta.url === `file://${process.argv[1]}`) main();
