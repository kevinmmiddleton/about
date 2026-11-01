// Kitchen mode for middleton.io/recipes/<slug>/ pages.
//
// A layer over the normal recipe page: the page, its plain lists, and its
// Recipe JSON-LD stay exactly as they are. "Start cooking" opens a full-screen
// view with an ingredient checklist, 1x/2x/3x scaling of the amounts, one step
// at a time in big type, and tap-to-start timers for any step that names a
// time. While it is open the screen is kept awake (Screen Wake Lock) without
// any label: Kevin's call, so it is silent where the API is missing.
//
// The pure helpers below are exported for tests/kitchen.test.mjs and for
// tools/recipes-generate.mjs (splitQuantity draws the grams column). The DOM
// part only runs in a browser.

const UNIT = '(?:kg|mg|ml|g)';
const NUM = '\\d+(?:\\.\\d+)?';

// "0.5" -> "0.5", 1.5 -> "1.5", 690 -> "690", 13.499999 -> "13.5".
export function formatAmount(n) {
  const r = Math.round(n * 10) / 10;
  return String(r).replace(/\.0$/, '');
}

// Splits an ingredient line into its leading amount and the rest:
// "345g chicken breast tenderloins" -> { qty: "345g", name: "chicken breast tenderloins" }
// "2 large eggs (about 100g)"      -> { qty: "2", name: "large eggs (about 100g)" }
// "Black pepper to taste"          -> { qty: "", name: "Black pepper to taste" }
export function splitQuantity(text) {
  const m = String(text).match(new RegExp(`^(~?${NUM}(?:-${NUM})?(?:\\s?${UNIT}\\b)?)\\s+(.+)$`));
  return m ? { qty: m[1], name: m[2] } : { qty: '', name: String(text) };
}

// Multiplies every amount in an ingredient line: weights and volumes anywhere
// ("about 300g", "(8g Better Than Bouillon in 330g water)", ranges like
// "150-200g"), plus a leading count ("2 eggs", "1 pie crust"). Text with no
// amount ("Salt to taste") comes back unchanged.
export function scaleText(text, factor) {
  if (factor === 1) return text;
  const f = (s) => formatAmount(Number(s) * factor);
  let out = String(text).replace(
    new RegExp(`(${NUM})(?:-(${NUM}))?(\\s?)(${UNIT})\\b`, 'g'),
    (_, a, b, sp, u) => `${f(a)}${b ? `-${f(b)}` : ''}${sp}${u}`,
  );
  let single = false;
  out = out.replace(
    new RegExp(`^(~?)(${NUM})(?:-(${NUM}))?(?=\\s)(?!\\s${UNIT}\\b)`),
    (_, t, a, b) => {
      single = Number(a) === 1 && !b;
      return `${t}${f(a)}${b ? `-${f(b)}` : ''}`;
    },
  );
  // "1 egg" at 2x reads "2 eggs": pluralize the last word of the noun, the
  // words before a comma or parenthesis ("1 pie crust, blind baked").
  if (single) out = out.replace(/^(~?\S+\s+)([^,(]*?[a-z])(?=\s*(?:[,(]|$))/i, (_, lead, noun) => lead + pluralizeLast(noun));
  return out;
}

function pluralizeLast(phrase) {
  return phrase.replace(/([a-z]+)$/i, (w) => {
    if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
    if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
    return `${w}s`;
  });
}

// Finds the times in a step so each can become a timer. A range ("2 to 3
// minutes", "18-22 minutes") starts at its low end: check early, not late.
// Returns [{ seconds, text }] in reading order.
export function parseTimers(step) {
  const re = new RegExp(
    `(${NUM})(?:\\s*(?:-|to)\\s*(${NUM}))?\\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\\b`, 'gi');
  const out = [];
  for (const m of String(step).matchAll(re)) {
    const unit = m[3].toLowerCase();
    const mult = unit.startsWith('h') ? 3600 : unit.startsWith('m') ? 60 : 1;
    const seconds = Math.round(Number(m[1]) * mult);
    if (seconds > 0) out.push({ seconds, text: m[0] });
  }
  return out;
}

// 480 -> "8:00", 3725 -> "1:02:05".
export function formatClock(total) {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// ---------------------------------------------------------------- browser UI
if (typeof document !== 'undefined') {
  const ready = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());
  ready(setup);
}

function setup() {
  const dataEl = document.getElementById('kitchen-data');
  const startBtn = document.querySelector('.km-start');
  if (!dataEl || !startBtn) return;
  let data;
  try { data = JSON.parse(dataEl.textContent); } catch { return; }
  if (!data.steps?.length) return;

  const CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const key = `km:${location.pathname}`;
  const total = data.groups.reduce((n, g) => n + g.items.length, 0);

  let state = { scale: 1, step: 0, checked: [] };
  try { Object.assign(state, JSON.parse(sessionStorage.getItem(key)) || {}); } catch { /* storage blocked */ }
  const save = () => { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* storage blocked */ } };
  if (state.step >= data.steps.length) state.step = 0;

  const root = document.createElement('div');
  root.className = 'km';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'km-title');
  let n = 0;
  const qw = Math.max(3, ...data.groups.flatMap((g) => g.items.map((i) => splitQuantity(scaleText(i, 3)).qty.length)));
  root.innerHTML = `
    <div class="km-wrap">
      <div class="km-bar">
        <h2 id="km-title">${esc(data.title)}</h2>
        <button type="button" class="km-x" aria-label="Close kitchen mode">${CLOSE}</button>
      </div>
      <div class="km-tray" aria-live="polite"></div>
      <div class="km-row">
        <fieldset class="km-seg"><legend class="visually-hidden">Batch size</legend>
          ${[1, 2, 3].map((x) => `<label><input type="radio" name="km-scale" value="${x}"${x === state.scale ? ' checked' : ''}><span>${x}x</span></label>`).join('')}
        </fieldset>
        <span class="km-hint" hidden>Amounts in the steps are for 1x.</span>
      </div>
      <details class="km-sec km-ings"${state.step === 0 ? ' open' : ''}>
        <summary>Ingredients, <span class="km-count"></span> of ${total} ready</summary>
        ${data.groups.map((g) => `${g.name ? `<p class="km-grp">${esc(g.name)}</p>` : ''}
        <ul class="km-ing" style="--qw:${qw}ch">${g.items.map((item) => {
          const i = n++;
          return `<li data-text="${esc(item)}"><label><input type="checkbox" data-i="${i}"${state.checked.includes(i) ? ' checked' : ''}><span class="km-q"></span><span class="km-n"></span></label></li>`;
        }).join('')}</ul>`).join('')}
      </details>
      <p class="km-lbl" aria-live="polite"></p>
      <div class="km-step">
        <p class="km-text" tabindex="-1"></p>
        <div class="km-timers"></div>
        <p class="km-next"></p>
      </div>
    </div>
    <div class="km-nav">
      <button type="button" class="km-prev">Back</button>
      <button type="button" class="km-primary km-fwd">Next step</button>
    </div>`;
  document.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const stepText = $('.km-text');
  const prevBtn = $('.km-prev');
  const nextBtn = $('.km-fwd');
  const tray = $('.km-tray');
  let opener = null;
  let wakeLock = null;

  function renderIngredients() {
    root.querySelectorAll('.km-ing li').forEach((li) => {
      const { qty, name } = splitQuantity(scaleText(li.dataset.text, state.scale));
      li.querySelector('.km-q').textContent = qty;
      li.querySelector('.km-n').textContent = name;
    });
    $('.km-count').textContent = state.checked.length;
    $('.km-hint').hidden = state.scale === 1 || !data.steps.some((s) => new RegExp(`\\d\\s?${UNIT}\\b`).test(s));
  }

  // ---- timers: keyed by step + index so a running one survives step changes
  const timers = new Map();
  function timerLabel(t) {
    if (t.done) return `Done: step ${t.step + 1}`;
    if (t.end) return formatClock((t.end - Date.now()) / 1000);
    return `Start ${formatClock(t.seconds)} timer`;
  }
  function chime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [0, 0.35, 0.7].forEach((at) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.25);
        o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.3);
      });
    } catch { /* no audio */ }
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* no vibration */ }
  }
  function tick() {
    let running = false;
    for (const t of timers.values()) {
      if (t.end && !t.done) {
        if (Date.now() >= t.end) { t.done = true; t.end = 0; chime(); } else running = true;
      }
    }
    paintTimers();
    if (running) setTimeout(tick, 250);
  }
  function toggleTimer(id, seconds, step) {
    const t = timers.get(id) || { seconds, step };
    if (t.done) { timers.delete(id); paintTimers(); return; }
    if (t.end) { t.end = 0; timers.delete(id); paintTimers(); return; }
    t.end = Date.now() + seconds * 1000;
    timers.set(id, t);
    tick();
  }
  function paintTimers() {
    root.querySelectorAll('.km-timer[data-id]').forEach((b) => {
      const t = timers.get(b.dataset.id) || { seconds: +b.dataset.s, step: +b.dataset.step };
      b.textContent = timerLabel(t);
      b.classList.toggle('is-running', !!t.end);
      b.classList.toggle('is-done', !!t.done);
      b.setAttribute('aria-pressed', t.end || t.done ? 'true' : 'false');
    });
    // The tray shows timers from other steps, so they stay in sight.
    const away = [...timers.entries()].filter(([, t]) => t.step !== state.step && (t.end || t.done));
    tray.innerHTML = away.map(([id, t]) => `<button type="button" class="km-timer${t.done ? ' is-done' : ' is-running'}" data-id="${id}" data-s="${t.seconds}" data-step="${t.step}">Step ${t.step + 1}: ${timerLabel(t)}</button>`).join('');
  }

  function renderStep() {
    const i = state.step;
    const text = data.steps[i];
    stepText.textContent = text;
    $('.km-lbl').textContent = `Step ${i + 1} of ${data.steps.length}`;
    $('.km-timers').innerHTML = parseTimers(text).map((t, k) =>
      `<button type="button" class="km-timer" data-id="${i}-${k}" data-s="${t.seconds}" data-step="${i}" aria-label="Timer for ${esc(t.text)}"></button>`).join('');
    const next = data.steps[i + 1];
    $('.km-next').textContent = next ? `Next: ${next}` : '';
    $('.km-next').hidden = !next;
    prevBtn.disabled = i === 0;
    nextBtn.textContent = next ? 'Next step' : 'Done';
    paintTimers();
  }

  function go(delta) {
    const to = state.step + delta;
    if (to >= data.steps.length) { close(); return; }
    if (to < 0) return;
    state.step = to;
    if (to > 0) $('.km-ings').open = false;
    save();
    renderStep();
    root.scrollTo?.({ top: 0 });
    stepText.focus({ preventScroll: true });
  }

  async function lockScreen() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; }
  }
  function onVisible() { if (!root.hidden && document.visibilityState === 'visible') lockScreen(); }

  function open() {
    // Safari does not focus a tapped button, so fall back to the Start button.
    opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : startBtn;
    root.hidden = false;
    document.body.classList.add('km-open');
    renderIngredients();
    renderStep();
    lockScreen();
    document.addEventListener('visibilitychange', onVisible);
    $('.km-x').focus();
  }
  function close() {
    root.hidden = true;
    document.body.classList.remove('km-open');
    document.removeEventListener('visibilitychange', onVisible);
    try { wakeLock?.release(); } catch { /* already released */ }
    wakeLock = null;
    (opener || startBtn).focus();
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.classList.contains('km-x')) close();
    else if (t.classList.contains('km-prev')) go(-1);
    else if (t.classList.contains('km-fwd')) go(1);
    else if (t.dataset.id) toggleTimer(t.dataset.id, +t.dataset.s, +t.dataset.step);
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.name === 'km-scale') { state.scale = +el.value; save(); renderIngredients(); }
    else if (el.dataset.i !== undefined) {
      const i = +el.dataset.i;
      state.checked = el.checked ? [...new Set([...state.checked, i])] : state.checked.filter((x) => x !== i);
      save();
      $('.km-count').textContent = state.checked.length;
    }
  });
  // On document, not the dialog: Safari leaves focus on <body> after a tap.
  document.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const typing = e.target.matches('input[type="radio"]');
    if (!typing && e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (!typing && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const f = [...root.querySelectorAll('button:not(:disabled), input, summary')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  });

  startBtn.hidden = false;
  startBtn.addEventListener('click', open);
}
