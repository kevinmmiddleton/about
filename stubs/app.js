// Stubs: a movie diary with shared watchlists and NYC screening alerts.
// Static page + Supabase (auth, Postgres with RLS, Realtime, edge functions).
// Only the publishable key lives here; every rule is enforced by RLS.

const SB_URL = 'https://jpwwsvvtfufocvteysuh.supabase.co';
const SB_KEY = 'sb_publishable_11Hjf5DvCNEhnu-h5ugK0Q_yQZzumXd';
const FN = `${SB_URL}/functions/v1/`;
const APP_URL = 'https://middleton.io/stubs/';

const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, storageKey: 'stubs-auth' },
});

const FILM = 'id,title,year,director,runtime_min,genres,overview,poster_url,source,wikidata_id';
const LIST = 'id,owner_id,name,description,kind,is_public,lb_synced_at,lb_last_diff,created_at';
const PROFILE = 'id,handle,display_name,bio,is_demo';

const S = { session: null, me: null, unread: 0, channels: [] };
const main = document.getElementById('main');

// ------------------------------------------------------------------ helpers
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => S.session?.user?.id ?? null;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function hue(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 6; }
function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join(''); }
function avatar(p, extra = '') {
  if (!p) return '';
  return `<a class="avatar hue-${hue(p.id)} ${extra}" href="#/u/${esc(p.handle)}" title="${esc(p.display_name)}" aria-label="${esc(p.display_name)}">${esc(initials(p.display_name))}</a>`;
}
// Plain (non-link) avatar for use inside another link.
const face = (p) => p ? `<span class="avatar hue-${hue(p.id)}" aria-hidden="true">${esc(initials(p.display_name))}</span>` : '';
const nameLink = (p) => p ? `<a class="who" href="#/u/${esc(p.handle)}">${face(p)}${esc(p.display_name)}</a>` : '';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
// Dates are wall-clock strings (YYYY-MM-DD or YYYY-MM-DDTHH:MM); never shift them by time zone.
function parts(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const hh = s.length > 11 ? Number(s.slice(11, 13)) : null;
  const mm = s.length > 11 ? s.slice(14, 16) : null;
  const time = hh == null ? '' : `${hh % 12 || 12}${mm !== '00' ? ':' + mm : ''}${hh < 12 ? 'AM' : 'PM'}`;
  return { y, m, d, mon: MONTHS[m - 1], dow: DOW[dt.getUTCDay()], time };
}
function nyToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function nyNow() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}
function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  const p = parts(new Date(iso).toISOString());
  return `${p.mon} ${p.d}`;
}

function starIcons(r) {
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += r >= i ? '<i class="ph-fill ph-star"></i>' : r >= i - 0.5 ? '<i class="ph-fill ph-star-half"></i>' : '<i class="ph ph-star"></i>';
  }
  return out;
}
const starsView = (r) => r == null ? '' : `<span class="stars" role="img" aria-label="${r} out of 5 stars">${starIcons(r)}</span>`;

function poster(f, { flag = false, eager = false } = {}) {
  if (!f) return '<div class="poster blank"></div>';
  const fl = flag ? '<span class="flag">IN NYC</span>' : '';
  if (f.poster_url) {
    return `<div class="poster"><img src="${esc(f.poster_url)}" alt="Poster for ${esc(f.title)}" ${eager ? '' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer" data-title="${esc(f.title)}" data-year="${esc(f.year ?? '')}">${fl}</div>`;
  }
  return `<div class="poster blank" role="img" aria-label="${esc(f.title)}"><b>${esc(f.title)}</b><span>${esc(f.year ?? '')}</span>${fl}</div>`;
}
// Broken poster image: swap in the typographic stand-in.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.closest('.poster')) return;
  const box = img.closest('.poster');
  box.classList.add('blank');
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', img.dataset.title || 'Film');
  img.replaceWith(Object.assign(document.createElement('b'), { textContent: img.dataset.title || '' }),
    Object.assign(document.createElement('span'), { textContent: img.dataset.year || '' }));
}, true);

const filmLine = (f) => `${esc(f.title)}${f.year ? ` <span class="y">${f.year}</span>` : ''}`;
const skeleton = (n = 4) => `<div class="stubs">${'<div class="sk sk-stub"></div>'.repeat(n)}</div>`;
const empty = (icon, text, action = '') => `<div class="empty"><i class="ph ph-${icon}" aria-hidden="true"></i><p>${text}</p>${action}</div>`;

async function fn(name, body) {
  const r = await fetch(FN + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !j.message) throw new Error(j.error || `Something went wrong (${r.status})`);
  return j;
}
const must = ({ data, error }) => { if (error) throw error; return data; };

function needSignIn(why) {
  store.set('stubs-next', location.hash);
  return `<section class="signin"><h1>Sign in first</h1><p class="lede" style="margin-top:12px">${why}</p><p style="margin-top:22px"><a class="btn primary" href="#/signin">Sign in</a></p></section>`;
}

// ------------------------------------------------------------------- sheet
const sheetWrap = document.getElementById('sheet');
const sheet = sheetWrap.querySelector('.sheet');
let sheetReturn = null;
function openSheet(html) {
  sheetReturn = document.activeElement;
  sheet.innerHTML = `<button class="icon-btn close" type="button" data-close aria-label="Close"><i class="ph ph-x" aria-hidden="true"></i></button>${html}`;
  sheetWrap.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => ($('[autofocus]', sheet) || $('input,button:not(.close),textarea', sheet) || sheet).focus(), 30);
}
function closeSheet() {
  sheetWrap.hidden = true;
  sheet.innerHTML = '';
  document.body.style.overflow = '';
  sheetReturn?.focus?.();
}
sheetWrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheetWrap.hidden) closeSheet(); });

// --------------------------------------------------------------- the chrome
function paintChrome(route) {
  const key = route.startsWith('/film') || route.startsWith('/search') ? 'search'
    : route.startsWith('/list') || route.startsWith('/join') || route.startsWith('/import') ? 'lists'
    : route.startsWith('/inbox') ? 'inbox'
    : route.startsWith('/diary') || (S.me && route === `/u/${S.me.handle}`) ? 'diary'
    : route === '/' ? 'home' : '';
  $$('[data-nav]').forEach((a) => { if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const who = document.getElementById('who');
  who.innerHTML = S.me ? avatar(S.me) : S.session ? '<a class="btn small quiet" href="#/welcome">Pick a handle</a>' : '<a class="btn small" href="#/signin">Sign in</a>';
  const n = S.unread;
  for (const id of ['badge', 'badge-tab']) {
    const b = document.getElementById(id);
    b.hidden = !n;
    b.textContent = n > 9 ? '9+' : String(n);
  }
  document.getElementById('bell').setAttribute('aria-label', n ? `Alerts, ${n} unread` : 'Alerts');
}

const themeBtn = document.getElementById('theme-btn');
function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function paintTheme() {
  const dark = currentTheme() === 'dark';
  themeBtn.innerHTML = `<i class="ph ph-${dark ? 'sun' : 'moon-stars'}" aria-hidden="true"></i>`;
  themeBtn.setAttribute('aria-label', dark ? 'Switch to light' : 'Switch to dark');
}
themeBtn.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('stubs-theme', next);
  paintTheme();
});
paintTheme();

async function refreshUnread() {
  if (!S.me) { S.unread = 0; return; }
  const { count } = await sb.from('stubs_alerts').select('id', { count: 'exact', head: true }).eq('user_id', S.me.id).is('read_at', null);
  S.unread = count ?? 0;
  paintChrome(route());
}

let alertChannel = null;
function watchAlerts() {
  if (alertChannel) { sb.removeChannel(alertChannel); alertChannel = null; }
  if (!S.me) return;
  alertChannel = sb.channel(`alerts-${S.me.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stubs_alerts', filter: `user_id=eq.${S.me.id}` }, (p) => {
      S.unread += 1;
      paintChrome(route());
      if (p.new?.kind === 'added' && !route().startsWith(`/list/${p.new.list_id}`)) toast(p.new.title);
    })
    .subscribe();
}

async function loadMe() {
  S.me = null;
  if (!uid()) return;
  const { data } = await sb.from('stubs_profiles').select(PROFILE).eq('id', uid()).maybeSingle();
  S.me = data ?? null;
}

// ------------------------------------------------------------------ router
const route = () => (location.hash.replace(/^#/, '') || '/').split('?')[0] || '/';
const query = () => new URLSearchParams(location.hash.split('?')[1] || '');

function stopChannels() { for (const c of S.channels) sb.removeChannel(c); S.channels = []; }

async function render() {
  const r = route();
  if (r.startsWith('access_token') || r.startsWith('error')) return;
  stopChannels();
  paintChrome(r);
  window.scrollTo(0, 0);
  const [, a, b] = r.split('/');
  try {
    if (S.session && !S.me && !['welcome', 'signin', 'join'].includes(a)) { location.hash = '#/welcome'; return; }
    if (!a) await viewHome();
    else if (a === 'search') await viewSearch();
    else if (a === 'film') await viewFilm(Number(b));
    else if (a === 'u') await viewProfile(decodeURIComponent(b || ''));
    else if (a === 'diary') { if (S.me) { location.replace(`#/u/${S.me.handle}`); return; } main.innerHTML = needSignIn('Your diary is where every film you log ends up, with your stats on top.'); }
    else if (a === 'lists') await viewLists();
    else if (a === 'list') await viewList(b);
    else if (a === 'join') await viewJoin(b);
    else if (a === 'inbox') await viewInbox();
    else if (a === 'import') await viewImport();
    else if (a === 'signin') viewSignin();
    else if (a === 'welcome') viewWelcome();
    else main.innerHTML = empty('film-slate', 'That page is not showing anywhere.', '<a class="btn" href="#/">Back to the lobby</a>');
  } catch (e) {
    console.error(e);
    main.innerHTML = empty('warning', `Something broke while loading this page. ${esc(e.message || '')}`, '<a class="btn" href="#/">Back home</a>');
  }
  document.title = (main.querySelector('h1')?.textContent?.trim() ? `${main.querySelector('h1').textContent.trim()} · ` : '') + 'Stubs';
}
window.addEventListener('hashchange', render);

// ------------------------------------------------------------------- data
async function upcomingFor(filmIds, limit = 200) {
  if (!filmIds.length) return [];
  return must(await sb.from('stubs_screenings')
    .select('uid,film_id,venue_name,venue_address,starts_at,url,format,run_key')
    .in('film_id', filmIds.slice(0, 300)).gte('starts_at', nyNow()).order('starts_at').limit(limit));
}
function firstShowPerFilm(shows) {
  const seen = new Map();
  for (const s of shows) if (!seen.has(s.film_id)) seen.set(s.film_id, { ...s, count: 0 });
  for (const s of shows) seen.get(s.film_id).count++;
  return [...seen.values()];
}
function ticket(s, f, cls = '') {
  const p = parts(s.starts_at);
  return `<a class="ticket ${cls}" href="${s.url ? esc(s.url) : `#/film/${f.id}`}" ${s.url ? 'target="_blank" rel="noopener"' : ''}>
    <span class="k">ADMIT ONE · NYC</span>
    <span class="f">${esc(f.title)}</span>
    <span class="v">${esc(s.venue_name)}${s.count > 1 ? ` · ${s.count} shows` : ''}</span>
    <span class="when"><b>${p.d}</b>${p.dow} ${p.mon}<br>${p.time}</span>
  </a>`;
}
function stubRow(l, { who = false, link = true } = {}) {
  const f = l.stubs_films;
  const p = parts(l.watched_on);
  const meta = [
    starsView(l.rating),
    l.liked ? '<i class="ph-fill ph-heart heart" role="img" aria-label="Loved it"></i>' : '',
    l.rewatch ? '<span class="mono">REWATCH</span>' : '',
    who ? nameLink(l.stubs_profiles) : '',
  ].filter(Boolean).join('');
  const own = S.me && l.user_id === S.me.id;
  const edit = own && !link;
  // Rows hold other links (the person), so the row itself is never an <a>.
  return `<div class="stub${link ? ' linked' : ''}" ${edit ? `data-log="${l.id}"` : ''}>
    ${link ? `<a href="#/film/${f.id}" tabindex="-1" aria-hidden="true">${poster(f)}</a>` : poster(f)}
    <div class="main">
      <div class="title">${link ? `<a class="film-link" href="#/film/${f.id}">${filmLine(f)}</a>` : filmLine(f)}</div>
      <div class="meta">${meta}</div>
      ${l.review ? `<p class="review">${esc(l.review)}</p>` : ''}
    </div>
    <div class="date" aria-label="Watched ${p.mon} ${p.d}, ${p.y}"><span>${p.dow}</span><b>${p.d}</b><span>${p.mon}</span></div>
  </div>`;
}

// ------------------------------------------------------------------- home
async function viewHome() {
  if (S.me) return viewFeed();
  // Hero copy needs no data, so paint it now; posters and sections fill in after.
  const heroHtml = (demo, fanHtml) => `
  <section class="hero">
    <div>
      <h1>Keep a stub for <em>every</em> movie.</h1>
      <p class="lede">Log what you watched. Plan what's next with friends. Hear when your watchlist is playing in New York.</p>
      <div class="row">
        <a class="btn primary" href="${demo ? `#/list/${demo.id}` : '#/lists'}"><i class="ph ph-users-three" aria-hidden="true"></i>See a shared list</a>
        <a class="btn" href="#/signin">Sign in</a>
      </div>
      <p class="hero-note">New accounts join through a friend's list link.</p>
    </div>
    <div class="fan" aria-hidden="true">${fanHtml}</div>
  </section>`;
  main.innerHTML = heroHtml(null, '');
  const demo = must(await sb.from('stubs_lists').select(`${LIST}, stubs_list_items(film_id, stubs_films(${FILM}))`)
    .eq('is_public', true).eq('kind', 'shared').order('created_at').limit(1)).at(0);
  const films = (demo?.stubs_list_items ?? []).map((i) => i.stubs_films).filter(Boolean);
  const withPosters = films.filter((f) => f.poster_url);
  const shows = firstShowPerFilm(await upcomingFor(films.map((f) => f.id), 300));
  const byId = new Map(films.map((f) => [f.id, f]));
  const recent = must(await sb.from('stubs_logs').select(`id,user_id,watched_on,rating,liked,rewatch,review,created_at, stubs_films(${FILM}), stubs_profiles(${PROFILE})`)
    .order('created_at', { ascending: false }).limit(6));
  const fan = withPosters.slice(0, 5);
  const rots = [[-14, -62], [-6, -30], [2, 0], [9, 32], [16, 62]];
  const next = shows[0];

  main.innerHTML = `${heroHtml(demo, `
      ${fan.map((f, i) => `<div class="poster" style="--rot:${rots[i][0]}deg;--x:${rots[i][1]}%;--d:${i * 70}ms;z-index:${i === 2 ? 5 : i}"><img src="${esc(f.poster_url)}" alt="" referrerpolicy="no-referrer"></div>`).join('')}
      ${next ? ticket(next, byId.get(next.film_id)) : ''}`)}

  ${shows.length ? `<section class="section">
    <div class="section-head"><h2>Playing in NYC soon</h2><p>From the demo list, matched to real showtimes twice a day.</p></div>
    <div class="tickets">${shows.slice(0, 8).map((s) => ticket(s, byId.get(s.film_id), 'paper')).join('')}</div>
  </section>` : ''}

  <section class="section how">
    <div class="panel">
      <h2>Movie night, decided</h2>
      <ol>
        <li><div><b>Make a list together.</b><span class="muted">Share one link. Everyone adds films and votes on what they want to see.</span></div></li>
        <li><div><b>Get a heads-up.</b><span class="muted">When a film on the list plays at Film Forum, IFC, Metrograph or anywhere else in the city, it lands in your alerts and your calendar.</span></div></li>
        <li><div><b>Let the reel pick.</b><span class="muted">Can't agree? Spin for tonight's film. More votes, better odds.</span></div></li>
      </ol>
    </div>
    <div class="panel ink">
      <h2>Your Letterboxd watchlist, on alert</h2>
      <p class="muted" style="margin-top:10px">Upload your Letterboxd export and Stubs watches it for NYC screenings. Upload a newer one any time and see exactly what changed.</p>
      <div class="minilist">${films.slice(5, 10).map((f) => poster(f)).join('')}</div>
      <p style="margin-top:18px"><a class="btn primary" href="#/import">Import a watchlist</a></p>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Fresh stubs</h2><p>What people logged lately.</p></div>
    <div class="stubs">${recent.length ? recent.map((l) => stubRow(l, { who: true })).join('') : empty('ticket', 'No stubs yet.')}</div>
  </section>`;
}

async function viewFeed() {
  main.innerHTML = skeleton(5);
  const following = must(await sb.from('stubs_follows').select('followee_id').eq('follower_id', S.me.id)).map((r) => r.followee_id);
  const ids = [S.me.id, ...following];
  const [logs, adds, mem] = await Promise.all([
    sb.from('stubs_logs').select(`id,user_id,watched_on,rating,liked,rewatch,review,created_at, stubs_films(${FILM}), stubs_profiles(${PROFILE})`)
      .in('user_id', ids).order('created_at', { ascending: false }).limit(30).then(must),
    sb.from('stubs_alerts').select(`id,list_id,created_at,title,film_id, stubs_films(${FILM}), actor:stubs_profiles!stubs_alerts_actor_id_fkey(${PROFILE})`)
      .eq('user_id', S.me.id).eq('kind', 'added').order('created_at', { ascending: false }).limit(15).then(must),
    sb.from('stubs_list_members').select(`role, stubs_lists(${LIST}, stubs_list_items(film_id))`).eq('user_id', S.me.id).then(must),
  ]);
  const myFilmIds = [...new Set(mem.flatMap((m) => (m.stubs_lists?.stubs_list_items ?? []).map((i) => i.film_id)))];
  const shows = firstShowPerFilm(await upcomingFor(myFilmIds, 300)).slice(0, 8);
  const films = shows.length ? must(await sb.from('stubs_films').select(FILM).in('id', shows.map((s) => s.film_id))) : [];
  const byId = new Map(films.map((f) => [f.id, f]));
  const feed = [
    ...logs.map((l) => ({ at: l.created_at, html: stubRow(l, { who: true }) })),
    ...adds.filter((a) => a.stubs_films).map((a) => ({ at: a.created_at, html: `<div class="stub linked">${poster(a.stubs_films)}<div class="main"><div class="title"><a class="film-link" href="#/list/${a.list_id}">${esc(a.title)}</a></div><div class="meta">${nameLink(a.actor)}<span class="mono">LIST ADD</span></div></div><div class="date"><span>${ago(a.created_at).toUpperCase()}</span></div></div>` })),
  ].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 30);
  const suggest = following.length ? '' : `<div class="note" style="margin-bottom:16px">Your feed fills up when you follow people. Try <a class="link" href="#/u/assistant">Assistant</a>, the demo account.</div>`;
  main.innerHTML = `
    <div class="section-head" style="margin-bottom:8px"><h1 style="font-size:clamp(40px,6vw,64px)">Hi, ${esc(S.me.display_name.split(' ')[0])}.</h1>
      <div class="row"><a class="btn primary" href="#/search"><i class="ph ph-plus" aria-hidden="true"></i>Log a film</a></div></div>
    ${shows.length ? `<section class="section" style="margin-top:28px"><div class="section-head"><h2>Playing soon from your lists</h2><a class="link" href="#/inbox">All alerts</a></div>
      <div class="tickets">${shows.map((s) => ticket(s, byId.get(s.film_id))).join('')}</div></section>` : ''}
    <section class="section" style="margin-top:36px"><div class="section-head"><h2>Your feed</h2></div>${suggest}
      <div class="stubs">${feed.length ? feed.map((x) => x.html).join('') : empty('ticket', 'Nothing here yet. Log a film you saw recently and it shows up here.', '<a class="btn" href="#/search">Find a film</a>')}</div></section>`;
  bindLogEdits();
}

// ----------------------------------------------------------------- search
async function viewSearch() {
  const q = query().get('q') || '';
  main.innerHTML = `
    <h1>Find a film</h1>
    <form class="search-box" style="margin-top:20px" role="search" id="sform">
      <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
      <label class="sr" for="q">Search films</label>
      <input class="input" id="q" name="q" type="search" placeholder="Title, like Paris, Texas" value="${esc(q)}" autocomplete="off" enterkeyhint="search">
    </form>
    <div id="results" style="margin-top:26px"></div>`;
  const input = $('#q');
  const results = $('#results');
  let seq = 0;
  async function run(term) {
    const my = ++seq;
    if (term.trim().length < 2) {
      const recent = must(await sb.from('stubs_films').select(FILM).not('poster_url', 'is', null).order('updated_at', { ascending: false }).limit(18));
      if (my !== seq) return;
      results.innerHTML = `<div class="section-head"><h2>Recently on Stubs</h2></div><div class="grid-posters">${recent.map(card).join('')}</div>`;
      return;
    }
    results.innerHTML = `<div class="grid-posters">${'<div><div class="poster sk"></div><div class="sk sk-line"></div></div>'.repeat(6)}</div>`;
    try {
      const { films = [] } = await fn('stubs-films', { action: 'search', q: term });
      if (my !== seq) return;
      results.innerHTML = films.length ? `<div class="grid-posters">${films.map(card).join('')}</div>`
        : empty('film-slate', `No films match "${esc(term)}". Try the original title or fewer words.`);
    } catch (e) {
      if (my === seq) results.innerHTML = empty('warning', 'Search is having a moment. Try again in a few seconds.');
    }
  }
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { history.replaceState(null, '', `#/search${input.value ? '?q=' + encodeURIComponent(input.value) : ''}`); run(input.value); }, 450); });
  $('#sform').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(t); run(input.value); });
  run(q);
  if (!q) input.focus();
}
const card = (f) => `<a class="film-card" href="#/film/${f.id}">${poster(f)}<span class="t">${esc(f.title)}</span><span class="y">${esc(f.year ?? '')}${f.director ? ` · ${esc(f.director.split(',')[0])}` : ''}</span></a>`;

// ------------------------------------------------------------------- film
async function viewFilm(id) {
  main.innerHTML = `<div class="film"><div class="poster sk"></div><div><div class="sk sk-line" style="height:60px;width:70%"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:80%"></div></div></div>`;
  const f = must(await sb.from('stubs_films').select(FILM).eq('id', id).maybeSingle());
  if (!f) { main.innerHTML = empty('film-slate', 'We could not find that film.', '<a class="btn" href="#/search">Search films</a>'); return; }
  const [logs, shows] = await Promise.all([
    sb.from('stubs_logs').select(`id,user_id,watched_on,rating,liked,rewatch,review,created_at, stubs_films(${FILM}), stubs_profiles(${PROFILE})`)
      .eq('film_id', id).order('created_at', { ascending: false }).limit(40).then(must),
    upcomingFor([id], 60),
  ]);
  const rated = logs.filter((l) => l.rating != null);
  const avg = rated.length ? (rated.reduce((s, l) => s + Number(l.rating), 0) / rated.length) : null;
  const mine = S.me ? logs.filter((l) => l.user_id === S.me.id) : [];
  const facts = [f.year, f.director ? `Directed by ${f.director}` : '', f.runtime_min ? `${f.runtime_min} min` : ''].filter(Boolean);
  const wiki = f.source === 'wikidata' && f.wikidata_id ? `https://www.wikidata.org/wiki/${esc(f.wikidata_id)}` : '';
  main.innerHTML = `
  <article class="film">
    ${poster(f, { flag: shows.length > 0, eager: true })}
    <div>
      <h1>${esc(f.title)}</h1>
      <div class="facts">${facts.map((x) => `<span>${esc(x)}</span>`).join('')}</div>
      ${f.genres?.length ? `<div class="chips">${f.genres.map((g) => `<span class="chip">${esc(g)}</span>`).join('')}</div>` : ''}
      ${f.overview ? `<p class="overview">${esc(f.overview)} ${wiki ? `<a class="src link" href="${wiki}" target="_blank" rel="noopener">Source</a>` : ''}</p>` : ''}
      <div class="row actions">
        <button class="btn primary" id="log-btn" type="button"><i class="ph ph-ticket" aria-hidden="true"></i>${mine.length ? 'Log it again' : 'Log it'}</button>
        <button class="btn" id="add-btn" type="button"><i class="ph ph-list-plus" aria-hidden="true"></i>Add to a list</button>
      </div>
      <div class="scoreline">
        <div><b>${logs.length}</b><span>Stubs</span></div>
        <div><b>${avg ? avg.toFixed(1) : '-'}</b><span>Avg rating</span></div>
        <div><b>${logs.filter((l) => l.liked).length}</b><span>Hearts</span></div>
        <div><b>${shows.length}</b><span>NYC shows</span></div>
      </div>
      ${shows.length ? `<section class="section" style="margin-top:32px"><div class="section-head"><h2>Playing in NYC</h2><p>Showtimes from One Night Only. Tap for tickets.</p></div>
        <div class="showlist">${shows.slice(0, 12).map((s) => { const p = parts(s.starts_at); return `<a class="show" href="${esc(s.url || '#')}" target="_blank" rel="noopener"><span class="d"><b>${p.mon} ${p.d}</b>${p.dow} ${p.time}</span><span class="v">${esc(s.venue_name)}<small>${esc([s.format, s.venue_address].filter(Boolean).join(' · '))}</small></span><i class="ph ph-arrow-up-right" aria-hidden="true"></i></a>`; }).join('')}</div>
        ${shows.length > 12 ? `<p class="muted" style="margin-top:10px">${shows.length - 12} more showtimes. Add it to a list to get them all in your calendar.</p>` : ''}</section>` : ''}
      <section class="section" style="margin-top:36px"><div class="section-head"><h2>Stubs</h2></div>
        <div class="stubs">${logs.length ? logs.map((l) => stubRow(l, { who: true, link: false })).join('') : empty('ticket', 'Nobody has logged this one yet. Be first.')}</div></section>
    </div>
  </article>`;
  $('#log-btn').addEventListener('click', () => S.me ? logSheet(f) : (location.hash = '#/signin', store.set('stubs-next', `#/film/${id}`)));
  $('#add-btn').addEventListener('click', () => S.me ? addToListSheet(f) : (location.hash = '#/signin', store.set('stubs-next', `#/film/${id}`)));
  bindLogEdits();
}

function bindLogEdits() {
  $$('[data-log]', main).forEach((el) => {
    el.style.cursor = 'pointer';
    el.title = 'Edit this stub';
    el.addEventListener('click', async () => {
      const l = must(await sb.from('stubs_logs').select(`id,user_id,film_id,watched_on,rating,liked,rewatch,review, stubs_films(${FILM})`).eq('id', el.dataset.log).single());
      logSheet(l.stubs_films, l);
    });
  });
}

function rateControl(initial) {
  return `<div class="field"><span class="label" id="rate-l">Rating</span>
    <div class="row"><div class="rate" id="rate" role="slider" tabindex="0" aria-labelledby="rate-l" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${initial ?? 0}" aria-valuetext="${initial ? `${initial} stars` : 'No rating'}" data-v="${initial ?? 0}">${starIcons(initial ?? 0)}</div>
    <button class="btn small quiet" type="button" id="rate-clear">Clear</button></div>
    <small>Tap the left half of a star for a half.</small></div>`;
}
function bindRate() {
  const el = $('#rate');
  const set = (v) => {
    v = Math.max(0, Math.min(5, Math.round(v * 2) / 2));
    el.dataset.v = v; el.innerHTML = starIcons(v);
    el.setAttribute('aria-valuenow', v); el.setAttribute('aria-valuetext', v ? `${v} stars` : 'No rating');
  };
  const fromX = (x) => { const r = el.getBoundingClientRect(); return Math.ceil(((x - r.left) / r.width) * 10) / 2; };
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); set(fromX(e.clientX)); });
  el.addEventListener('pointermove', (e) => { if (e.buttons) set(fromX(e.clientX)); });
  el.addEventListener('keydown', (e) => {
    const v = Number(el.dataset.v);
    if (['ArrowRight', 'ArrowUp'].includes(e.key)) { set(v + 0.5); e.preventDefault(); }
    if (['ArrowLeft', 'ArrowDown'].includes(e.key)) { set(v - 0.5); e.preventDefault(); }
  });
  $('#rate-clear').addEventListener('click', () => set(0));
}

function logSheet(f, existing = null) {
  openSheet(`
    <h2 id="sheet-title">${existing ? 'Edit stub' : 'Log it'}</h2>
    <p class="muted">${filmLine(f)}</p>
    <form id="log-form">
      <div class="field"><label for="w">Watched on</label><input class="input" id="w" type="date" required max="${nyToday()}" value="${esc(existing?.watched_on ?? nyToday())}"></div>
      ${rateControl(existing?.rating != null ? Number(existing.rating) : null)}
      <div class="row" style="gap:22px">
        <label class="toggle"><input type="checkbox" id="lk" ${existing?.liked ? 'checked' : ''}><i class="ph-fill ph-heart heart" aria-hidden="true"></i>Loved it</label>
        <label class="toggle"><input type="checkbox" id="rw" ${existing?.rewatch ? 'checked' : ''}>Rewatch</label>
      </div>
      <div class="field"><label for="rv">Short review <span class="muted">(optional)</span></label><textarea class="input" id="rv" maxlength="1000" placeholder="What stuck with you?">${esc(existing?.review ?? '')}</textarea></div>
      <p class="error" id="log-err" hidden></p>
      <div class="row"><button class="btn primary" type="submit"><i class="ph ph-ticket" aria-hidden="true"></i>${existing ? 'Save changes' : 'Save stub'}</button>
      ${existing ? '<button class="btn quiet" type="button" id="del-log">Delete</button>' : ''}</div>
    </form>`);
  bindRate();
  $('#log-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    const v = Number($('#rate').dataset.v);
    const row = { watched_on: $('#w').value, rating: v || null, liked: $('#lk').checked, rewatch: $('#rw').checked, review: $('#rv').value.trim() || null };
    const res = existing
      ? await sb.from('stubs_logs').update(row).eq('id', existing.id)
      : await sb.from('stubs_logs').insert({ ...row, user_id: S.me.id, film_id: f.id });
    if (res.error) { $('#log-err').hidden = false; $('#log-err').textContent = res.error.message; btn.disabled = false; return; }
    closeSheet();
    toast(existing ? 'Stub updated.' : 'Stub saved. Find it in your diary.');
    render();
  });
  $('#del-log')?.addEventListener('click', async () => {
    if (!confirm('Delete this stub? This cannot be undone.')) return;
    must(await sb.from('stubs_logs').delete().eq('id', existing.id));
    closeSheet(); toast('Stub deleted.'); render();
  });
}

async function addToListSheet(f) {
  const mem = must(await sb.from('stubs_list_members').select(`role, stubs_lists(${LIST}, stubs_list_items(film_id))`)
    .eq('user_id', S.me.id).in('role', ['owner', 'editor']));
  const lists = mem.map((m) => m.stubs_lists).filter((l) => l && l.kind !== 'letterboxd');
  openSheet(`
    <h2 id="sheet-title">Add to a list</h2><p class="muted">${filmLine(f)}</p>
    <div style="display:grid;gap:8px;margin-top:16px">
      ${lists.length ? lists.map((l) => { const on = l.stubs_list_items.some((i) => i.film_id === f.id); return `<button class="btn quiet ${on ? 'on' : ''}" type="button" data-l="${l.id}" style="justify-content:space-between"><span>${esc(l.name)}</span><i class="ph ph-${on ? 'check' : 'plus'}" aria-hidden="true"></i></button>`; }).join('')
        : '<p class="muted">You are not on any lists yet.</p>'}
    </div>
    <form id="nl" style="margin-top:18px"><div class="field"><label for="nl-name">Or start a new list</label><input class="input" id="nl-name" maxlength="80" placeholder="Like Friday double features"></div><button class="btn" type="submit">Create and add</button></form>`);
  $$('[data-l]', sheet).forEach((b) => b.addEventListener('click', async () => {
    const on = b.classList.contains('on');
    const res = on ? await sb.from('stubs_list_items').delete().eq('list_id', b.dataset.l).eq('film_id', f.id)
      : await sb.from('stubs_list_items').insert({ list_id: b.dataset.l, film_id: f.id, added_by: S.me.id });
    if (res.error) return toast(res.error.message);
    b.classList.toggle('on', !on);
    b.querySelector('i').className = `ph ph-${on ? 'plus' : 'check'}`;
    toast(on ? 'Removed.' : `Added to ${b.querySelector('span').textContent}.`);
  }));
  $('#nl').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#nl-name').value.trim(); if (!name) return;
    const l = must(await sb.from('stubs_lists').insert({ owner_id: S.me.id, name, kind: 'shared' }).select('id').single());
    must(await sb.from('stubs_list_items').insert({ list_id: l.id, film_id: f.id, added_by: S.me.id }));
    closeSheet(); location.hash = `#/list/${l.id}`;
  });
}

// ---------------------------------------------------------------- profile
async function viewProfile(handle) {
  main.innerHTML = skeleton(4);
  const p = must(await sb.from('stubs_profiles').select(PROFILE).eq('handle', handle.toLowerCase()).maybeSingle());
  if (!p) { main.innerHTML = empty('user', 'Nobody here by that name.'); return; }
  const [logs, followers, following, iFollow, lists] = await Promise.all([
    sb.from('stubs_logs').select(`id,user_id,watched_on,rating,liked,rewatch,review,created_at, stubs_films(${FILM})`).eq('user_id', p.id)
      .order('watched_on', { ascending: false }).order('created_at', { ascending: false }).limit(500).then(must),
    sb.from('stubs_follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', p.id),
    sb.from('stubs_follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', p.id),
    S.me ? sb.from('stubs_follows').select('followee_id').eq('follower_id', S.me.id).eq('followee_id', p.id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('stubs_list_members').select(`role, stubs_lists(${LIST}, stubs_list_items(film_id, stubs_films(poster_url,title,year,id)))`).eq('user_id', p.id).neq('role', 'follower').then(must),
  ]);
  const me = S.me?.id === p.id;
  const year = nyToday().slice(0, 4);
  const rated = logs.filter((l) => l.rating != null);
  const hist = Array(10).fill(0); rated.forEach((l) => hist[Math.round(l.rating * 2) - 1]++);
  const max = Math.max(1, ...hist);
  let month = '';
  const diary = logs.map((l) => {
    const m = l.watched_on.slice(0, 7);
    const head = m !== month ? `<div class="month">${parts(l.watched_on).mon} ${l.watched_on.slice(0, 4)}</div>` : '';
    month = m;
    return head + stubRow({ ...l, stubs_profiles: p }, { link: !me });
  }).join('');
  main.innerHTML = `
  <section class="profile-head">
    <span class="avatar hue-${hue(p.id)}" aria-hidden="true">${esc(initials(p.display_name))}</span>
    <div><h1>${esc(p.display_name)}${p.is_demo ? '<span class="demo-tag">DEMO</span>' : ''}</h1>
      <p class="muted" style="margin-top:6px">@${esc(p.handle)} · ${followers.count ?? 0} ${followers.count === 1 ? 'follower' : 'followers'} · ${following.count ?? 0} following</p>
      ${p.bio ? `<p style="margin-top:8px;max-width:60ch">${esc(p.bio)}</p>` : ''}</div>
    <div class="row">${me ? '<button class="btn quiet" id="edit-p" type="button">Edit profile</button><button class="btn quiet" id="out" type="button">Sign out</button>'
      : S.me ? `<button class="btn ${iFollow.data ? 'on' : 'primary'}" id="follow" type="button">${iFollow.data ? 'Following' : 'Follow'}</button>` : ''}</div>
  </section>
  <section class="stats" aria-label="Stats">
    <div><b>${new Set(logs.map((l) => l.film_id ?? l.stubs_films.id)).size}</b><span>Films</span></div>
    <div><b>${logs.filter((l) => l.watched_on.startsWith(year)).length}</b><span>In ${year}</span></div>
    <div><b>${rated.length ? (rated.reduce((s, l) => s + Number(l.rating), 0) / rated.length).toFixed(1) : '-'}</b><span>Avg rating</span></div>
    <div><b>${logs.filter((l) => l.liked).length}</b><span>Hearts</span></div>
    <div><div class="hist" role="img" aria-label="Ratings spread">${hist.map((n) => `<i style="height:${Math.round((n / max) * 100)}%"></i>`).join('')}</div><div class="hist-axis"><span>½</span><span>RATINGS</span><span>5</span></div></div>
  </section>
  ${lists.length ? `<section class="section"><div class="section-head"><h2>Lists</h2></div><div class="list-cards">${lists.map((m) => listCard(m.stubs_lists)).join('')}</div></section>` : ''}
  <section class="section"><div class="section-head"><h2>Diary</h2>${me ? '<a class="btn small primary" href="#/search"><i class="ph ph-plus" aria-hidden="true"></i>Log a film</a>' : ''}</div>
    ${logs.length ? `<div class="stubs">${diary}</div>` : empty('ticket', me ? 'Your diary is empty. Log the last film you saw.' : 'No stubs yet.', me ? '<a class="btn" href="#/search">Find a film</a>' : '')}</section>`;
  if (me) {
    bindLogEdits();
    $('#out').addEventListener('click', async () => { await sb.auth.signOut(); location.hash = '#/'; });
    $('#edit-p').addEventListener('click', () => profileSheet());
  }
  $('#follow')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; const on = b.classList.contains('on');
    const res = on ? await sb.from('stubs_follows').delete().eq('follower_id', S.me.id).eq('followee_id', p.id)
      : await sb.from('stubs_follows').insert({ follower_id: S.me.id, followee_id: p.id });
    if (res.error) return toast(res.error.message);
    b.classList.toggle('on', !on); b.classList.toggle('primary', on); b.textContent = on ? 'Follow' : 'Following';
  });
}

function profileSheet() {
  openSheet(`<h2 id="sheet-title">Edit profile</h2>
    <form id="pf">
      <div class="field"><label for="dn">Name</label><input class="input" id="dn" maxlength="40" required value="${esc(S.me.display_name)}"></div>
      <div class="field"><label for="hd">Handle</label><input class="input" id="hd" maxlength="20" required pattern="[a-z0-9_]{2,20}" value="${esc(S.me.handle)}"><small>Lowercase letters, numbers and underscores.</small></div>
      <div class="field"><label for="bio">Bio</label><textarea class="input" id="bio" maxlength="200">${esc(S.me.bio ?? '')}</textarea></div>
      <p class="error" id="pf-err" hidden></p>
      <button class="btn primary" type="submit">Save</button>
    </form>`);
  $('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = { display_name: $('#dn').value.trim(), handle: $('#hd').value.trim().toLowerCase(), bio: $('#bio').value.trim() || null };
    const { error } = await sb.from('stubs_profiles').update(row).eq('id', S.me.id);
    if (error) { $('#pf-err').hidden = false; $('#pf-err').textContent = error.code === '23505' ? 'That handle is taken.' : error.message; return; }
    Object.assign(S.me, row); closeSheet(); location.hash = `#/u/${row.handle}`; render();
  });
}

// ------------------------------------------------------------------ lists
function listCard(l) {
  if (!l) return '';
  const films = (l.stubs_list_items ?? []).map((i) => i.stubs_films).filter(Boolean);
  const kind = l.kind === 'letterboxd' ? 'Letterboxd watchlist' : l.kind === 'personal' ? 'Personal' : 'Shared list';
  return `<a class="list-card" href="#/list/${l.id}">
    <div class="strip">${films.slice(0, 5).map((f) => poster(f)).join('')}${'<div class="poster blank"></div>'.repeat(Math.max(0, 5 - films.length))}</div>
    <h3>${esc(l.name)}</h3>
    <div class="meta"><span>${(l.stubs_list_items ?? []).length} films</span><span class="kind">${kind}${l.is_public ? ' · public' : ''}</span></div>
  </a>`;
}

async function viewLists() {
  main.innerHTML = skeleton(3);
  const pub = must(await sb.from('stubs_lists').select(`${LIST}, stubs_list_items(film_id, stubs_films(id,title,year,poster_url))`).eq('is_public', true).order('created_at').limit(12));
  let mine = [];
  if (S.me) {
    mine = must(await sb.from('stubs_list_members').select(`role, stubs_lists(${LIST}, stubs_list_items(film_id, stubs_films(id,title,year,poster_url)))`).eq('user_id', S.me.id))
      .map((m) => m.stubs_lists).filter(Boolean);
  }
  const mineIds = new Set(mine.map((l) => l.id));
  main.innerHTML = `
    <div class="section-head"><h1>Lists</h1>${S.me ? '<div class="row"><a class="btn" href="#/import"><i class="ph ph-upload-simple" aria-hidden="true"></i>Import from Letterboxd</a><button class="btn primary" id="new-list" type="button"><i class="ph ph-plus" aria-hidden="true"></i>New list</button></div>' : ''}</div>
    ${S.me ? `<section class="section" style="margin-top:24px"><div class="section-head"><h2>Yours</h2><p>Lists you made, joined or follow.</p></div>
      ${mine.length ? `<div class="list-cards">${mine.map(listCard).join('')}</div>` : empty('users-three', 'No lists yet. Start one and send the link to a friend.')}</section>`
      : `<div class="note" style="margin-top:20px">Sign in to start your own lists. A friend's invite link gets you in.</div>`}
    <section class="section"><div class="section-head"><h2>Public lists</h2><p>Anyone can look. Follow one to get its screening alerts.</p></div>
      <div class="list-cards">${pub.filter((l) => !mineIds.has(l.id)).map(listCard).join('') || '<p class="muted">Nothing else public right now.</p>'}</div></section>`;
  $('#new-list')?.addEventListener('click', () => {
    openSheet(`<h2 id="sheet-title">New list</h2><p class="muted">Make it, then share the invite link with friends.</p>
      <form id="lf">
        <div class="field"><label for="ln">Name</label><input class="input" id="ln" maxlength="80" required placeholder="Like Halloween at the Metrograph"></div>
        <div class="field"><label for="ld">What it's for <span class="muted">(optional)</span></label><input class="input" id="ld" maxlength="300"></div>
        <label class="toggle"><input type="checkbox" id="lp">Public: anyone can see and follow it</label>
        <button class="btn primary" type="submit">Create list</button>
      </form>`);
    $('#lf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const l = must(await sb.from('stubs_lists').insert({ owner_id: S.me.id, name: $('#ln').value.trim(), description: $('#ld').value.trim() || null, is_public: $('#lp').checked, kind: 'shared' }).select('id').single());
      closeSheet(); location.hash = `#/list/${l.id}`;
    });
  });
}

async function viewList(id) {
  main.innerHTML = skeleton(3);
  const l = must(await sb.from('stubs_lists').select(LIST).eq('id', id).maybeSingle());
  if (!l) { main.innerHTML = S.session ? empty('lock', 'This list is private, or it no longer exists. Ask whoever sent it for a fresh invite link.') : needSignIn('This list is private. Sign in to see it.'); return; }
  const state = { l, items: [], members: [], votes: [], shows: [] };
  const fresh = new Set();

  async function load() {
    const [items, members, votes] = await Promise.all([
      sb.from('stubs_list_items').select(`id,film_id,added_by,added_at,note, stubs_films(${FILM}), stubs_profiles!stubs_list_items_added_by_fkey(${PROFILE})`).eq('list_id', id).order('added_at', { ascending: false }).limit(1000).then(must),
      sb.from('stubs_list_members').select(`user_id,role,joined_at, stubs_profiles(${PROFILE})`).eq('list_id', id).order('joined_at').then(must),
      sb.from('stubs_votes').select('item_id,user_id').eq('list_id', id).then(must),
    ]);
    Object.assign(state, { items, members, votes });
    state.shows = await upcomingFor(items.map((i) => i.film_id), 1000);
  }
  await load();
  const myRole = () => state.members.find((m) => m.user_id === uid())?.role;
  const canEdit = () => ['owner', 'editor'].includes(myRole());
  const isLB = l.kind === 'letterboxd';

  function itemsHtml() {
    const playing = new Set(state.shows.map((s) => s.film_id));
    const votesBy = new Map();
    for (const v of state.votes) { if (!votesBy.has(v.item_id)) votesBy.set(v.item_id, []); votesBy.get(v.item_id).push(v.user_id); }
    const filter = $('#only-nyc')?.checked;
    const rows = state.items.filter((i) => i.stubs_films && (!filter || playing.has(i.film_id)))
      .sort((a, b) => (votesBy.get(b.id)?.length ?? 0) - (votesBy.get(a.id)?.length ?? 0) || b.added_at.localeCompare(a.added_at));
    if (!rows.length) return empty('film-reel', filter ? 'Nothing on this list is playing in NYC right now. We check twice a day.' : 'This list is empty. Add the first film.');
    const names = new Map(state.members.map((m) => [m.user_id, m.stubs_profiles?.display_name]));
    return rows.map((i) => {
      const f = i.stubs_films; const vs = votesBy.get(i.id) ?? []; const mine = vs.includes(uid());
      const voters = vs.map((u) => names.get(u) || 'someone').join(', ');
      return `<div class="item ${fresh.has(i.id) ? 'fresh' : ''}" data-item="${i.id}">
        <a href="#/film/${f.id}" aria-label="${esc(f.title)}">${poster(f, { flag: playing.has(f.id) })}</a>
        <a class="t" href="#/film/${f.id}">${esc(f.title)} <span>${esc(f.year ?? '')}</span></a>
        ${!isLB && i.stubs_profiles ? `<span class="by">${avatar(i.stubs_profiles)}Added by ${esc(i.stubs_profiles.display_name)}</span>` : ''}
        ${!isLB ? `<div class="acts">
          <button class="vote ${mine ? 'on' : ''}" type="button" data-vote="${i.id}" ${canEdit() ? '' : 'disabled'} aria-pressed="${mine}" title="${vs.length ? `Want to see: ${esc(voters)}` : 'Want to see'}"><i class="ph${mine ? '-fill' : ''} ph-hand-heart" aria-hidden="true"></i>${vs.length}<span class="sr"> want to see${mine ? ', including you' : ''}</span></button>
          ${canEdit() ? `<button class="icon-btn icon-sm" type="button" data-remove="${i.id}" aria-label="Remove ${esc(f.title)}"><i class="ph ph-trash" aria-hidden="true"></i></button>` : ''}
        </div>` : ''}
      </div>`;
    }).join('');
  }
  function paintItems() {
    $('#items').innerHTML = itemsHtml();
    $('#count').textContent = `${state.items.length} films · ${new Set(state.shows.map((s) => s.film_id)).size} playing in NYC${isLB ? '' : ' · tap the hand on what you want to see'}`;
    bindItems();
  }
  function bindItems() {
    $$('[data-vote]').forEach((b) => b.addEventListener('click', async () => {
      const itemId = Number(b.dataset.vote); const on = b.classList.contains('on');
      const res = on ? await sb.from('stubs_votes').delete().eq('item_id', itemId).eq('user_id', uid())
        : await sb.from('stubs_votes').insert({ item_id: itemId, list_id: id, user_id: uid() });
      if (res.error) return toast(res.error.message);
      state.votes = on ? state.votes.filter((v) => !(v.item_id === itemId && v.user_id === uid())) : [...state.votes, { item_id: itemId, user_id: uid() }];
      paintItems();
    }));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      const res = await sb.from('stubs_list_items').delete().eq('id', b.dataset.remove);
      if (res.error) return toast(res.error.message);
      state.items = state.items.filter((i) => i.id !== Number(b.dataset.remove)); paintItems(); toast('Removed from the list.');
    }));
  }

  const diff = l.lb_last_diff;
  main.innerHTML = `
  <section class="list-head">
    <div>
      <h1>${esc(l.name)}</h1>
      <p class="desc">${l.description ? `${esc(l.description)} ` : ''}<span class="kind">${isLB ? 'Letterboxd watchlist' : l.is_public ? 'Shared list · public' : 'Shared list · members only'}</span></p>
      <div class="members">${state.members.filter((m) => m.role !== 'follower').map((m) => `<a class="member" href="#/u/${esc(m.stubs_profiles?.handle)}">${face(m.stubs_profiles)}<span>${esc(m.stubs_profiles?.display_name)}${m.stubs_profiles?.is_demo ? ' <small>(demo)</small>' : ''} <small>${m.role === 'owner' ? 'owner' : ''}</small></span></a>`).join('')}
        ${state.members.some((m) => m.role === 'follower') ? `<span class="muted">+ ${state.members.filter((m) => m.role === 'follower').length} following</span>` : ''}</div>
    </div>
    <div class="row">
      ${!isLB && state.items.length ? '<button class="btn primary" type="button" id="pick"><i class="ph ph-shuffle" aria-hidden="true"></i>Pick one for tonight</button>' : ''}
      ${canEdit() && !isLB ? '<button class="btn" type="button" id="invite"><i class="ph ph-link" aria-hidden="true"></i>Invite</button>' : ''}
      ${isLB && myRole() === 'owner' ? `<a class="btn primary" href="#/import?list=${l.id}"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Refresh from a new export</a>` : ''}
      ${S.me && !myRole() && l.is_public ? '<button class="btn" type="button" id="follow-list"><i class="ph ph-bell-simple" aria-hidden="true"></i>Follow for alerts</button>' : ''}
      ${!S.session && !isLB ? '<a class="btn" href="#/signin">Sign in to vote</a>' : ''}
      ${myRole() && myRole() !== 'owner' ? '<button class="btn quiet" type="button" id="leave">Leave</button>' : ''}
    </div>
  </section>
  ${isLB && diff ? `<p class="note" style="margin-top:18px">Last refreshed ${ago(diff.at)}: ${diff.added?.length ?? 0} added, ${diff.removed?.length ?? 0} removed, ${diff.kept ?? 0} unchanged${diff.unmatched ? `, ${diff.unmatched} we couldn't match` : ''}.</p>` : ''}
  <div class="toolbar">
    ${canEdit() && !isLB ? `<div class="grow"><form class="search-box" id="add-form"><i class="ph ph-plus" aria-hidden="true"></i><label class="sr" for="add-q">Add a film</label><input class="input" id="add-q" placeholder="Add a film to this list" autocomplete="off"></form><div class="add-results" id="add-results"></div></div>` : '<div class="grow"></div>'}
    <label class="toggle"><input type="checkbox" id="only-nyc">Only what's playing in NYC</label>
    <span class="live" title="Changes from other members show up here as they happen">LIVE</span>
  </div>
  <p class="muted" id="count" style="margin-top:14px"></p>
  <div class="items" id="items"></div>`;
  paintItems();
  $('#only-nyc').addEventListener('change', paintItems);

  // Realtime: other members' adds, removes and votes appear without a reload.
  let t;
  const reload = (p) => {
    if (p?.eventType === 'INSERT' && p.table === 'stubs_list_items') fresh.add(p.new.id);
    clearTimeout(t);
    t = setTimeout(async () => { await load(); paintItems(); setTimeout(() => fresh.clear(), 1800); }, 250);
  };
  const ch = sb.channel(`list-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stubs_list_items', filter: `list_id=eq.${id}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stubs_votes', filter: `list_id=eq.${id}` }, reload)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'stubs_votes' }, reload)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'stubs_list_items' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stubs_list_members', filter: `list_id=eq.${id}` }, () => render())
    .subscribe();
  S.channels.push(ch);

  // Inline add.
  const aq = $('#add-q');
  if (aq) {
    let st, seq = 0;
    const out = $('#add-results');
    const run = async () => {
      const my = ++seq; const term = aq.value.trim();
      if (term.length < 2) { out.innerHTML = ''; return; }
      out.innerHTML = '<p class="muted">Searching...</p>';
      try {
        const { films = [] } = await fn('stubs-films', { action: 'search', q: term });
        if (my !== seq) return;
        const have = new Set(state.items.map((i) => i.film_id));
        out.innerHTML = films.slice(0, 6).map((f) => `<button type="button" data-add="${f.id}" ${have.has(f.id) ? 'disabled' : ''}>${poster(f)}<span><b>${esc(f.title)}</b> <span class="muted">${esc(f.year ?? '')}${f.director ? ` · ${esc(f.director.split(',')[0])}` : ''}</span></span><span class="mono">${have.has(f.id) ? 'ON LIST' : 'ADD'}</span></button>`).join('') || '<p class="muted">No matches.</p>';
        $$('[data-add]', out).forEach((b) => b.addEventListener('click', async () => {
          b.disabled = true;
          const res = await sb.from('stubs_list_items').insert({ list_id: id, film_id: Number(b.dataset.add), added_by: uid() }).select('id').single();
          if (res.error) { b.disabled = false; return toast(res.error.code === '23505' ? 'Already on the list.' : res.error.message); }
          fresh.add(res.data.id); aq.value = ''; out.innerHTML = '';
          await load(); paintItems(); toast('Added. Everyone on the list gets a heads-up.');
        }));
      } catch { out.innerHTML = '<p class="muted">Search is having a moment. Try again.</p>'; }
    };
    aq.addEventListener('input', () => { clearTimeout(st); st = setTimeout(run, 400); });
    $('#add-form').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(st); run(); });
  }

  $('#invite')?.addEventListener('click', async () => {
    const token = must(await sb.rpc('stubs_invite_token', { p_list: id }));
    const link = `${APP_URL}#/join/${token}`;
    openSheet(`<h2 id="sheet-title">Invite friends</h2><p class="muted">Anyone with this link can join the list, add films and vote. New people can make an account from it.</p>
      <div class="field" style="margin-top:16px"><label for="inv">Invite link</label><input class="input mono" id="inv" readonly value="${esc(link)}"></div>
      <div class="row" style="margin-top:14px"><button class="btn primary" type="button" id="copy"><i class="ph ph-copy" aria-hidden="true"></i>Copy link</button>
      ${myRole() === 'owner' ? '<button class="btn quiet" type="button" id="reset">Make a new link</button>' : ''}</div>`);
    $('#copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#inv').value); toast('Copied. Send it to a friend.'); } catch { $('#inv').select(); } });
    $('#reset')?.addEventListener('click', async () => {
      const t2 = must(await sb.rpc('stubs_reset_invite', { p_list: id }));
      $('#inv').value = `${APP_URL}#/join/${t2}`; toast('New link made. The old one stops working.');
    });
  });
  $('#follow-list')?.addEventListener('click', async () => {
    must(await sb.from('stubs_list_members').insert({ list_id: id, user_id: uid(), role: 'follower' }));
    toast('Following. Screening alerts for this list go to your inbox.'); render();
  });
  $('#leave')?.addEventListener('click', async () => {
    if (!confirm('Leave this list?')) return;
    must(await sb.from('stubs_list_members').delete().eq('list_id', id).eq('user_id', uid()));
    location.hash = '#/lists';
  });
  $('#pick')?.addEventListener('click', () => pickSheet(state));
}

function pickSheet(state) {
  const votes = new Map();
  for (const v of state.votes) votes.set(v.item_id, (votes.get(v.item_id) ?? 0) + 1);
  const pool = state.items.filter((i) => i.stubs_films).map((i) => ({ f: i.stubs_films, w: 1 + (votes.get(i.id) ?? 0) }));
  const total = pool.reduce((s, x) => s + x.w, 0);
  const spin = () => {
    let r = Math.random() * total; let win = pool[0];
    for (const x of pool) { r -= x.w; if (r <= 0) { win = x; break; } }
    const strip = Array.from({ length: 18 }, () => pool[Math.floor(Math.random() * pool.length)].f);
    strip.push(win.f);
    openSheet(`<div class="reel">
      <span class="kind">Tonight's film</span>
      <div class="reel-window"><div class="reel-strip" id="strip">${strip.map((f) => poster(f, { eager: true })).join('')}</div></div>
      <h3 id="win-t" style="opacity:0">${esc(win.f.title)}</h3>
      <p class="odds" id="win-o" style="opacity:0">${win.w} IN ${total} CHANCE · ${win.w - 1} VOTE${win.w - 1 === 1 ? '' : 'S'}</p>
      <div class="row" style="justify-content:center"><a class="btn primary" href="#/film/${win.f.id}" data-close>Open the film</a><button class="btn" type="button" id="again">Spin again</button></div>
    </div>`);
    const s = $('#strip'); const h = $('.reel-window').offsetHeight;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.animate([{ transform: 'translateY(0)' }, { transform: `translateY(-${h * (strip.length - 1)}px)` }],
      { duration: reduce ? 1 : 2400, easing: 'cubic-bezier(0.15, 0.85, 0.25, 1)', fill: 'forwards' })
      .finished.then(() => { $('#win-t').style.opacity = 1; $('#win-o').style.opacity = 1; });
    $('#again').addEventListener('click', spin);
  };
  spin();
}

// ------------------------------------------------------------------- join
async function viewJoin(token) {
  const prev = must(await sb.rpc('stubs_invite_preview', { p_token: token })).at(0);
  if (!prev) { main.innerHTML = empty('link-break', 'That invite link does not work anymore. Ask for a fresh one.'); return; }
  store.set('stubs-invite', token);
  if (S.me && S.session) {
    main.innerHTML = `<section class="signin"><h1>${esc(prev.name)}</h1>
      <p class="lede" style="margin-top:12px">You're invited. ${esc(prev.owner_name)} wants you on this list. ${prev.films} films, ${prev.members} ${prev.members === 1 ? 'member' : 'members'} so far.</p>
      <p style="margin-top:22px"><button class="btn primary" id="join" type="button">Join the list</button></p></section>`;
    $('#join').addEventListener('click', async () => {
      const id = must(await sb.rpc('stubs_join_list', { p_token: token }));
      store.set('stubs-invite', null); toast(`You're on ${prev.name}.`); location.hash = `#/list/${id}`;
    });
    return;
  }
  store.set('stubs-next', `#/join/${token}`);
  viewSignin(prev);
}

// ------------------------------------------------------------------ inbox
async function viewInbox() {
  if (!S.me) { main.innerHTML = needSignIn('Alerts tell you when a film on your lists plays in NYC, and when a friend adds something.'); return; }
  main.innerHTML = skeleton(4);
  const [alerts, tok] = await Promise.all([
    sb.from('stubs_alerts').select(`id,kind,title,body,url,created_at,read_at,starts_at,film_id,list_id, stubs_films(${FILM})`).eq('user_id', S.me.id).order('created_at', { ascending: false }).limit(80).then(must),
    sb.from('stubs_feed_tokens').select('token').eq('user_id', S.me.id).maybeSingle().then(must),
  ]);
  // One card per film for screening alerts found in the same run; list adds stay one per add.
  const groups = []; const byKey = new Map();
  for (const a of alerts) {
    const k = a.kind === 'screening' ? `s:${a.film_id}:${a.created_at.slice(0, 13)}` : `x:${a.id}`;
    if (!byKey.has(k)) { byKey.set(k, []); groups.push(byKey.get(k)); }
    byKey.get(k).push(a);
  }
  groups.forEach((g) => g.sort((x, y) => (x.starts_at || '').localeCompare(y.starts_at || '')));
  // Newest batch first; inside a batch, the soonest showtime first.
  groups.sort((x, y) => y[0].created_at.slice(0, 13).localeCompare(x[0].created_at.slice(0, 13))
    || (x[0].starts_at || '9').localeCompare(y[0].starts_at || '9'));
  const ics = tok ? `${FN}stubs-feed?t=${tok.token}&f=ics` : '';
  const rss = tok ? `${FN}stubs-feed?t=${tok.token}&f=rss` : '';
  main.innerHTML = `
    <div class="section-head"><h1>Alerts</h1><p>${alerts.filter((a) => !a.read_at).length} new</p></div>
    <div class="alerts" style="margin-top:12px">${groups.length ? groups.map((g) => {
      const a = g[0];
      const many = g.length > 1;
      const href = a.kind === 'screening' ? (many || !a.url ? `#/film/${a.film_id}` : a.url) : a.kind === 'added' ? `#/list/${a.list_id}` : `#/film/${a.film_id}`;
      const venues = g.map((x) => x.title.split(' is playing at ')[1]).filter(Boolean);
      const title = many ? `${a.stubs_films?.title ?? 'A film'} is playing at ${g.length} NYC theaters` : a.title;
      const body = many ? `${venues.slice(0, 3).join(', ')}${venues.length > 3 ? ` and ${venues.length - 3} more` : ''}. ${a.body.split('.')[0]}.` : a.body;
      return `<a class="alert ${g.some((x) => !x.read_at) ? 'unread' : ''}" href="${esc(href)}" ${href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>
        ${poster(a.stubs_films)}
        <div><div class="k">${a.kind === 'screening' ? 'Playing in NYC' : a.kind === 'added' ? 'List add' : 'Import'}</div><div class="t">${esc(title)}</div>${body ? `<div class="b">${esc(body)}</div>` : ''}</div>
        <time datetime="${esc(a.created_at)}">${ago(a.created_at)}</time></a>`;
    }).join('') : empty('bell-simple', 'Nothing yet. Add films to a list and we will tell you when they play in New York.')}</div>
    <section class="section"><div class="section-head"><h2>Take it with you</h2><p>Private links. Anyone with them can read your alerts, so keep them to yourself.</p></div>
      <div class="feeds">
        <div class="feed-box"><b><i class="ph ph-calendar-blank" aria-hidden="true"></i> Calendar</b><p class="muted">Every upcoming NYC showtime for films on your lists, in Apple Calendar, Google or Outlook. It refreshes on its own.</p><code>${esc(ics)}</code>
          <div class="row"><a class="btn small primary" href="${esc(ics.replace(/^https:/, 'webcal:'))}">Subscribe</a><button class="btn small quiet" type="button" data-copy="${esc(ics)}">Copy link</button></div></div>
        <div class="feed-box"><b><i class="ph ph-rss" aria-hidden="true"></i> RSS</b><p class="muted">These alerts in any feed reader.</p><code>${esc(rss)}</code>
          <div class="row"><button class="btn small quiet" type="button" data-copy="${esc(rss)}">Copy link</button></div></div>
      </div>
      <p style="margin-top:12px"><button class="btn small quiet" type="button" id="rotate">Shared a link by mistake? Make new ones</button></p>
    </section>`;
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied.'); } catch { toast('Copy did not work. Long-press the link instead.'); } }));
  $('#rotate').addEventListener('click', async () => { must(await sb.rpc('stubs_rotate_feed_token')); toast('New links made. The old ones stop working.'); render(); });
  if (alerts.some((a) => !a.read_at)) {
    await sb.from('stubs_alerts').update({ read_at: new Date().toISOString() }).eq('user_id', S.me.id).is('read_at', null);
    S.unread = 0; paintChrome(route());
  }
}

// ----------------------------------------------------------------- import
// Letterboxd export: Settings > Data > Export Your Data gives a zip with
// watchlist.csv (Date,Name,Year,Letterboxd URI). We never fetch letterboxd.com.
function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim().replace(/^﻿/, '').toLowerCase());
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

async function readExport(file) {
  if (/\.zip$/i.test(file.name) || file.type.includes('zip')) {
    const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
    const zip = await JSZip.loadAsync(file);
    const wl = Object.values(zip.files).find((f) => /(^|\/)watchlist\.csv$/i.test(f.name));
    if (!wl) throw new Error('That zip has no watchlist.csv in it. Is it the Letterboxd export?');
    const prof = Object.values(zip.files).find((f) => /(^|\/)profile\.csv$/i.test(f.name));
    let username = '';
    if (prof) username = parseCSV(await prof.async('string'))[0]?.username || '';
    if (!username) username = (file.name.match(/letterboxd-([^-]+)-/i) || [])[1] || '';
    return { rows: parseCSV(await wl.async('string')), username };
  }
  return { rows: parseCSV(await file.text()), username: '' };
}

async function viewImport() {
  if (!S.me) { main.innerHTML = needSignIn('Import your Letterboxd watchlist and we watch it for NYC screenings.'); return; }
  const target = query().get('list');
  const mine = must(await sb.from('stubs_lists').select(LIST).eq('owner_id', S.me.id).eq('kind', 'letterboxd').order('created_at'));
  const tgt = mine.find((l) => l.id === target);
  main.innerHTML = `
    <h1>${tgt ? 'Refresh your watchlist' : 'Track your Letterboxd watchlist'}</h1>
    <p class="lede" style="margin-top:12px">Stubs watches it for NYC screenings and sends them to your alerts and calendar. Upload a newer export any time to refresh it.</p>
    <div class="steps">
      <div><b>1</b><p>On Letterboxd, open <a class="link" href="https://letterboxd.com/settings/data/" target="_blank" rel="noopener">Settings, then Data</a>. You need to be signed in there.</p></div>
      <div><b>2</b><p>Tap <strong>Export your data</strong>. Letterboxd downloads a .zip file to your device.</p></div>
      <div><b>3</b><p>Drop that .zip here. Or unzip it and pick <strong>watchlist.csv</strong>. It never leaves your browser except as titles.</p></div>
    </div>
    <div class="field" style="margin-top:22px;max-width:520px">
      <label for="target">Save to</label>
      <select class="input" id="target">
        <option value="">A new list</option>
        ${mine.map((l) => `<option value="${l.id}" ${l.id === target ? 'selected' : ''}>Refresh "${esc(l.name)}"</option>`).join('')}
      </select>
    </div>
    <div class="field" style="margin-top:14px;max-width:520px" id="name-field"><label for="lbname">Letterboxd username</label><input class="input" id="lbname" maxlength="40" placeholder="We fill this in from the export if we can"><small>Only used for the list name.</small></div>
    <label class="drop" id="drop" for="file">
      <i class="ph ph-file-zip" aria-hidden="true"></i>
      <b>Drop your Letterboxd export here</b>
      <span class="muted">or tap to choose a .zip or watchlist.csv</span>
      <input class="sr" id="file" type="file" accept=".zip,.csv,application/zip,text/csv">
    </label>
    <div id="imp-out" aria-live="polite"></div>`;
  const sel = $('#target');
  const nameField = $('#name-field');
  const syncName = () => { nameField.hidden = !!sel.value; };
  sel.addEventListener('change', syncName); syncName();
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) runImport(f); });
  $('#file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) runImport(f); });

  async function runImport(file) {
    const out = $('#imp-out');
    out.innerHTML = '<p style="margin-top:18px">Reading your export...</p>';
    try {
      const { rows, username } = await readExport(file);
      const films = rows.map((r) => ({ name: r.name, year: parseInt(r.year, 10) || null, ref: r['letterboxd uri'] || '' })).filter((r) => r.name);
      if (!films.length) throw new Error('That file has no films in it. Is it watchlist.csv from the Letterboxd export?');
      if (films.length > 3000) throw new Error('That watchlist has more than 3,000 films. Stubs tops out at 3,000 for now.');
      if (username && !$('#lbname').value) $('#lbname').value = username;
      out.innerHTML = `<p style="margin-top:18px"><b>${films.length} films found.</b> Matching them to our catalogue. Big watchlists take a minute.</p><div class="progress"><i id="bar"></i></div><p class="muted" id="prog" style="margin-top:6px"></p>`;
      const ids = new Array(films.length).fill(null);
      const B = 25;
      for (let i = 0; i < films.length; i += B) {
        const chunk = films.slice(i, i + B);
        let res;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { res = await fn('stubs-films', { action: 'resolve', items: chunk }); break; } catch (e) { if (attempt === 2) throw e; await new Promise((r) => setTimeout(r, 1500)); }
        }
        (res.ids || []).forEach((id, k) => { ids[i + k] = id; });
        const done = Math.min(films.length, i + B);
        $('#bar').style.width = `${Math.round((done / films.length) * 100)}%`;
        $('#prog').textContent = `${done} of ${films.length}`;
      }
      const matched = []; const refs = []; const unmatched = [];
      films.forEach((f, k) => { if (ids[k]) { matched.push(ids[k]); refs.push(f.ref); } else unmatched.push(f); });
      const before = sel.value ? must(await sb.from('stubs_list_items').select('film_id').eq('list_id', sel.value)).map((x) => x.film_id) : [];
      const diff = must(await sb.rpc('stubs_sync_letterboxd', {
        p_list: sel.value || null, p_name: $('#lbname').value.trim() || username || 'my watchlist',
        p_films: matched, p_refs: refs, p_unmatched: unmatched.length,
      }));
      const touched = [...diff.added, ...diff.removed];
      const names = touched.length ? new Map(must(await sb.from('stubs_films').select('id,title,year').in('id', touched.slice(0, 200))).map((f) => [f.id, f])) : new Map();
      const li = (ids2) => ids2.slice(0, 12).map((x) => names.get(x)).filter(Boolean).map((f) => `<li>${esc(f.title)} ${f.year ? `(${f.year})` : ''}</li>`).join('');
      const firstTime = !before.length && !sel.value;
      out.innerHTML = `
        <h2 style="margin-top:30px">${firstTime ? 'Your watchlist is on alert' : 'Here is what changed'}</h2>
        <div class="diff">
          <div><b>${diff.added.length}</b><span>${firstTime ? 'Films tracked' : 'Added'}</span>${!firstTime && diff.added.length ? `<ul>${li(diff.added)}</ul>` : ''}</div>
          <div><b>${diff.removed.length}</b><span>Removed</span>${diff.removed.length ? `<ul>${li(diff.removed)}</ul>` : ''}</div>
          <div><b>${firstTime ? unmatched.length : diff.kept}</b><span>${firstTime ? 'No match' : 'Unchanged'}</span></div>
        </div>
        ${unmatched.length ? `<details style="margin-top:14px"><summary>${unmatched.length} we couldn't match</summary><ul class="muted">${unmatched.slice(0, 60).map((u) => `<li>${esc(u.name)} ${u.year ? `(${u.year})` : ''}</li>`).join('')}</ul></details>` : ''}
        <p style="margin-top:20px"><a class="btn primary" href="#/list/${diff.list_id}">Open the list</a></p>`;
      toast('Import done.');
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      out.innerHTML = `<p class="error" style="margin-top:18px">${esc(e.message || 'That file did not work.')}</p>`;
    }
  }
}

// ----------------------------------------------------------------- sign in
function viewSignin(invite = null) {
  const inv = invite ? '' : store.get('stubs-invite');
  main.innerHTML = `<section class="signin">
    ${invite ? `<h1>${esc(invite.name)}</h1><p class="lede" style="margin-top:12px">You're invited. ${esc(invite.owner_name)} wants you on this list. Sign in or make an account with your email to join.</p>`
      : '<h1>Sign in</h1><p class="lede" style="margin-top:12px">We email you a link. No password.</p>'}
    <form id="si">
      <div class="field"><label for="em">Email</label><input class="input" id="em" type="email" required autocomplete="email" inputmode="email" placeholder="you@example.com" autofocus></div>
      <button class="btn primary" type="submit"><i class="ph ph-envelope-simple" aria-hidden="true"></i>Email me a link</button>
      <p id="si-msg" role="status"></p>
    </form>
    ${!invite && !inv ? '<p class="muted" style="margin-top:22px">New here? Accounts start from a friend\'s list invite link.</p>' : ''}
  </section>`;
  $('#si').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    const msg = $('#si-msg');
    try {
      const r = await fn('stubs-login', { email: $('#em').value, invite: store.get('stubs-invite') || '' });
      msg.className = r.ok ? 'note' : 'error';
      msg.textContent = r.message;
    } catch (err) { msg.className = 'error'; msg.textContent = err.message; }
    btn.disabled = false;
  });
}

function viewWelcome() {
  if (!S.session) { location.hash = '#/signin'; return; }
  if (S.me) { location.hash = '#/'; return; }
  const guess = (S.session.user.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  main.innerHTML = `<section class="signin"><h1>One last thing</h1><p class="lede" style="margin-top:12px">Pick the name your friends see.</p>
    <form id="wf">
      <div class="field"><label for="dn">Your name</label><input class="input" id="dn" maxlength="40" required autofocus autocomplete="name"></div>
      <div class="field"><label for="hd">Handle</label><input class="input" id="hd" maxlength="20" required pattern="[a-z0-9_]{2,20}" value="${esc(guess)}"><small>Lowercase letters, numbers and underscores. It's in your profile link.</small></div>
      <p class="error" id="wf-err" hidden></p>
      <button class="btn primary" type="submit">Start my diary</button>
    </form></section>`;
  $('#wf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = { id: uid(), display_name: $('#dn').value.trim(), handle: $('#hd').value.trim().toLowerCase() };
    const { error } = await sb.from('stubs_profiles').insert(row);
    if (error) { $('#wf-err').hidden = false; $('#wf-err').textContent = error.code === '23505' ? 'That handle is taken. Try another.' : error.message; return; }
    await loadMe(); watchAlerts(); refreshUnread();
    const invite = store.get('stubs-invite');
    if (invite) {
      try { const id = must(await sb.rpc('stubs_join_list', { p_token: invite })); store.set('stubs-invite', null); location.hash = `#/list/${id}`; return; } catch { /* fall through */ }
    }
    location.hash = '#/';
  });
}

// ------------------------------------------------------------------- boot
async function boot() {
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  await loadMe();
  watchAlerts();
  refreshUnread();
  sb.auth.onAuthStateChange(async (ev, session) => {
    const was = S.session?.user?.id; S.session = session;
    if (was !== session?.user?.id) { await loadMe(); watchAlerts(); refreshUnread(); render(); }
  });
  if (/^#(access_token|error)/.test(location.hash) || (!location.hash && S.session && store.get('stubs-next'))) {
    const next = store.get('stubs-next'); store.set('stubs-next', null);
    history.replaceState(null, '', location.pathname + (next || '#/'));
  }
  if (S.session && store.get('stubs-next') && route() === '/') {
    const next = store.get('stubs-next'); store.set('stubs-next', null); location.hash = next; return;
  }
  render();
}
boot();
