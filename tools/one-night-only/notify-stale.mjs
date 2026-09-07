#!/usr/bin/env node
// notify-stale.mjs - tell a human when the collector has stopped publishing.
//
// WHY THIS EXISTS
//
// On 2026-08-22 the luma source returned zero screenings. The zero guard did
// exactly what it was built to do and refused to publish, which is the right
// call in isolation: a clean parse that yields nothing cancels every screening
// on every subscriber's calendar. But nothing told anyone. The site went on
// serving 22 August for FIFTEEN DAYS, and behind that refusal a second,
// unrelated bug (NYC Open Data dropped the `startdate` column, so Parks 400'd
// on every request) sat undetected the whole time.
//
// A red run in the Actions tab is not a notification. This is.
//
// It fires only after the collector has been refusing for MORE THAN A DAY, so
// a single transient upstream hiccup stays silent and does not train anyone to
// ignore it. At twice-daily that is a streak of three.
//
// It never fails the run. The job is already red for the real reason; a broken
// notifier that turns one failure into two failures is worse than no notifier.

const API = process.env.GITHUB_API_URL || 'https://api.github.com';
const SERVER = process.env.GITHUB_SERVER_URL || 'https://github.com';
const REPO = process.env.GITHUB_REPOSITORY || '';
const TOKEN = process.env.GITHUB_TOKEN || '';
const RUN_ID = process.env.GITHUB_RUN_ID || '';
const WORKFLOW = process.env.ONO_WORKFLOW_FILE || 'one-night-only.yml';

// A streak this long means the collector has refused across more than one
// calendar day at the twice-daily cadence. Below it, stay quiet.
const STREAK = 3;
// Do not comment on an existing issue more than once a day. The point is to be
// noticed, and a thread that grows every twelve hours stops being noticed.
const RENOTIFY_HOURS = 20;

const TITLE = 'One Night Only: the collector has stopped publishing';
const MARKER = '<!-- ono-stale-notifier -->';

const api = async (path, init = {}) => {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${TOKEN}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'one-night-only-notifier',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> HTTP ${res.status} ${await res.text()}`);
  return res.json();
};

// How long the published site has been serving the same data. source-state.json
// is only written by a run that actually published, so the newest
// last_change_at across sources IS the last successful publish. No new field,
// no per-run timestamp, and so no junk commit on a quiet day.
async function lastPublish() {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { join, dirname } = await import('node:path');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  try {
    const state = JSON.parse(await readFile(join(root, 'one-night-only/_data/source-state.json'), 'utf8'));
    const stamps = Object.values(state.sources || {})
      .map((s) => s && s.last_change_at)
      .filter(Boolean)
      .sort();
    return stamps.length ? stamps[stamps.length - 1] : null;
  } catch {
    return null;
  }
}

async function openIssue() {
  // Matched on title, not on label. The label is applied at creation as a
  // convenience, but filtering the lookup by it would mean a hand-removed label
  // silently spawns a duplicate issue every run.
  const open = await api(`/repos/${REPO}/issues?state=open&per_page=100`).catch(() => []);
  return (Array.isArray(open) ? open : []).find((i) => i.title === TITLE && !i.pull_request);
}

// Called on a successful run. Closing the issue is what keeps this honest: an
// alert nobody has to clear by hand is an alert that stays open forever and
// stops meaning anything.
async function resolve() {
  const existing = await openIssue();
  if (!existing) return;
  await api(`/repos/${REPO}/issues/${existing.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      body: `Recovered. ${SERVER}/${REPO}/actions/runs/${RUN_ID} published successfully.`,
    }),
  });
  await api(`/repos/${REPO}/issues/${existing.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
  });
  console.log(`notify-stale: closed ${existing.html_url}`);
}

async function main() {
  if (!TOKEN || !REPO) {
    console.log('notify-stale: no GITHUB_TOKEN or GITHUB_REPOSITORY. Nothing to do.');
    return;
  }

  if (process.argv.includes('--resolved')) return resolve();

  // Completed runs of this workflow, newest first. The run calling this is
  // still in progress and is not in the list, so it is counted separately.
  const runs = await api(
    `/repos/${REPO}/actions/workflows/${encodeURIComponent(WORKFLOW)}/runs` +
    '?status=completed&per_page=20'
  );
  let streak = 1; // this run
  for (const r of runs.workflow_runs || []) {
    if (String(r.id) === String(RUN_ID)) continue;
    if (r.conclusion === 'success') break;
    if (r.conclusion === 'cancelled' || r.conclusion === 'skipped') continue;
    streak++;
  }

  console.log(`notify-stale: consecutive failing runs = ${streak} (threshold ${STREAK}).`);
  if (streak < STREAK) {
    console.log('notify-stale: one bad run is not an outage. Staying quiet.');
    return;
  }

  const since = await lastPublish();
  const days = since
    ? Math.floor((Date.now() - Date.parse(since)) / 86400000)
    : null;
  const runUrl = `${SERVER}/${REPO}/actions/runs/${RUN_ID}`;

  const body = [
    MARKER,
    `The One Night Only collector has failed **${streak} runs in a row**, which is more than a day at the twice-daily cadence.`,
    '',
    since
      ? `The site is still serving the last good data, published **${since}** (${days} day(s) ago). Nothing is broken for visitors yet, but the listings are that stale and subscribers' calendars are frozen at the same point.`
      : 'Could not read `one-night-only/_data/source-state.json`, so the age of the published data is unknown.',
    '',
    `Latest run: ${runUrl}`,
    '',
    'Usual causes, most likely first:',
    '',
    '1. **A source returned zero and tripped the zero guard.** The log names it. If the source is genuinely empty, re-run with `--accept-zero <source>`; if it is not, fix the parser.',
    '2. **A source changed its schema.** Look for an HTTP 400 in the log. NYC Open Data has dropped columns before.',
    '3. **A source is behind a new block.** HTTP 403 or a challenge page.',
    '',
    'This issue closes itself the next time a run succeeds.',
  ].join('\n');

  const existing = await openIssue();

  if (!existing) {
    const issue = await api(`/repos/${REPO}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: TITLE, body, labels: ['one-night-only'] }),
    });
    console.log(`notify-stale: opened ${issue.html_url}`);
    return;
  }

  const age = (Date.now() - Date.parse(existing.updated_at)) / 3600000;
  if (age < RENOTIFY_HOURS) {
    console.log(
      `notify-stale: ${existing.html_url} was updated ${age.toFixed(1)}h ago. ` +
      `Not commenting again until ${RENOTIFY_HOURS}h.`
    );
    return;
  }
  await api(`/repos/${REPO}/issues/${existing.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: `Still failing. ${streak} runs in a row now.\n\n${runUrl}` }),
  });
  console.log(`notify-stale: commented on ${existing.html_url}`);
}

// Never fail the run. See the note at the top.
main().catch((err) => {
  console.log(`notify-stale: could not notify (${err.message}). The run is already red; not making it redder.`);
});
