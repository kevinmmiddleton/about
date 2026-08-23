/* Inline PDF viewer for blog posts.
 *
 * Loaded as type="module", which is the whole no-JS story: a browser without
 * module support never runs this file, never sets .is-ready, and so never shows
 * a "View document" button that could not work. What that reader gets is the
 * poster with Download and Open in new tab, which are plain anchors and need
 * nothing from this file. Same outcome if the network eats this request.
 *
 * Nothing here fetches the PDF or the library on pageview. The deck is a few MB
 * and pdf.js is another ~1.7MB; both are fetched on the click and not before.
 *
 * pdf.js is served from this site, NOT from cdnjs like the rest of the site's
 * third-party script, and that is not a preference. pdf.js parses in a Web
 * Worker, and a Worker script must be same-origin: a cdnjs workerSrc throws
 * SecurityError and the viewer hangs instead of failing loudly. Full account in
 * js/pdfjs-6.2.108/README.md. Do not "fix" these back to a CDN URL.
 *
 * Being same-origin does not make the load infallible, so the failure path is a
 * real feature here rather than a formality: see fail() below.
 */

const PDFJS = '6.2.108';
const BASE = `/js/pdfjs-${PDFJS}/`;

/* One load for the page however many embeds it carries. */
let libPromise = null;
function lib() {
  if (!libPromise) {
    libPromise = import(`${BASE}pdf.min.mjs`).then((m) => {
      const api = m && m.getDocument ? m : m.default;
      if (!api || !api.getDocument) throw new Error('pdf.js did not export getDocument');
      api.GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.min.mjs`;
      return api;
    });
    /* Otherwise the first failure is cached and a retry can never succeed. */
    libPromise.catch(() => { libPromise = null; });
  }
  return libPromise;
}

const DPR_CAP = 2;   // beyond this the canvases cost more memory than they show

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* The poster's own Download / Open anchors, cloned so the viewer header and the
   error state carry the same two controls the poster had. Cloning rather than
   moving keeps the Plausible classes and the download filename in one place. */
function controls(embed, primary) {
  const out = [];
  embed.querySelectorAll('.pdf-poster .pdf-actions a').forEach((a) => {
    const c = a.cloneNode(true);
    c.classList.toggle('pdf-btn-primary', primary && c.classList.contains('pdf-dl'));
    out.push(c);
  });
  return out;
}

function fail(embed, stage, msg) {
  stage.textContent = '';
  const note = el('p', 'pdf-note pdf-note-err', msg);
  const back = el('div', 'pdf-fallback');
  controls(embed, true).forEach((c) => back.appendChild(c));
  stage.appendChild(note);
  stage.appendChild(back);
}

function view(embed, stage, doc, title) {
  const total = doc.numPages;
  let current = 1;

  const bar = el('div', 'pdf-bar');
  bar.appendChild(el('span', 'pdf-bar-title', title));

  const pager = el('div', 'pdf-pager');
  const prev = el('button', 'pdf-btn pdf-step', '‹');
  const next = el('button', 'pdf-btn pdf-step', '›');
  const count = el('span', 'pdf-count', `Page 1 of ${total}`);
  prev.type = next.type = 'button';
  prev.setAttribute('aria-label', 'Previous page');
  next.setAttribute('aria-label', 'Next page');
  /* The indicator is the live region rather than the scroller: announcing the
     page number on change is useful, announcing every canvas is not. */
  count.setAttribute('aria-live', 'polite');
  pager.append(prev, count, next);
  bar.appendChild(pager);
  controls(embed, false).forEach((c) => bar.appendChild(c));

  const scroll = el('div', 'pdf-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'document');
  scroll.setAttribute('aria-label', `${title}, ${total} pages`);

  stage.textContent = '';
  stage.append(bar, scroll);

  /* Every page gets its box at the right aspect ratio up front, so the
     scrollbar is honest from the first frame and does not jump around as pages
     rasterize underneath the reader. */
  const pages = [];
  for (let n = 1; n <= total; n++) {
    const box = el('div', 'pdf-page');
    box.dataset.page = String(n);
    scroll.appendChild(box);
    pages.push({ box, n, ratio: 0, done: false, busy: false, task: null });
  }

  function width() {
    const cs = getComputedStyle(scroll);
    return Math.max(120, scroll.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  }

  /* Sizing runs before rendering and again on resize. getPage is cheap and
     cached by pdf.js, so asking for the viewport twice is not a real cost. */
  async function measure() {
    const w = width();
    await Promise.all(pages.map(async (p) => {
      if (!p.ratio) {
        const page = await doc.getPage(p.n);
        const vp = page.getViewport({ scale: 1 });
        p.ratio = vp.height / vp.width;
      }
      p.box.style.width = `${w}px`;
      p.box.style.height = `${Math.round(w * p.ratio)}px`;
    }));
  }

  async function draw(p) {
    if (p.busy) return;
    p.busy = true;
    try {
      const page = await doc.getPage(p.n);
      const w = width();
      const base = page.getViewport({ scale: 1 });
      const scale = w / base.width;
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const vp = page.getViewport({ scale: scale * dpr });
      const canvas = el('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      /* The box already holds the layout height; the canvas fills it. */
      p.box.style.height = `${Math.round(w * p.ratio)}px`;
      if (p.task) p.task.cancel();
      p.task = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp });
      await p.task.promise;
      p.box.textContent = '';
      p.box.appendChild(canvas);
      p.done = true;
    } catch (e) {
      /* A cancelled render is the resize path doing its job, not an error. */
      if (!e || e.name !== 'RenderingCancelledException') p.done = false;
    } finally {
      p.busy = false;
      p.task = null;
    }
  }

  /* Rasterize what is near the viewport, not the whole deck at once. The margin
     is one scroller of pages either side; 200% was the first try and rasterized
     about twelve pages before the reader had moved at all, which is a lot of
     canvas to hold on a phone for a document they may never scroll. */
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const p = pages[Number(entry.target.dataset.page) - 1];
      if (p && !p.done) draw(p);
    });
  }, { root: scroll, rootMargin: '100% 0px' });


  /* "Which page am I on" is the topmost page that has reached the top of the
     scroller, measured. It was a second IntersectionObserver picking the largest
     intersectionRatio, which is wrong whenever more than one page fits on screen
     at once: at this height roughly two and a half do, so two of them sit at
     ratio 1.0 and the winner came down to the order the observer happened to
     batch its entries in. Next then jumped two pages and Prev could not move at
     all, because it was stepping back from a number that was already ahead. */
  function mark(n) {
    if (n === current) return;
    current = n;
    count.textContent = `Page ${n} of ${total}`;
    prev.disabled = n <= 1;
    next.disabled = n >= total;
  }
  function pageAtTop() {
    /* Scrolled to the end means on the last page. Without this the last page is
       unreachable: there is not a full scroller of content beneath it, so the
       scroll clamps, its top never gets to the top edge, and the count sticks
       one short however far down the reader goes. */
    if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2) return total;
    const top = scroll.getBoundingClientRect().top + 8;
    let n = 1;
    for (let k = 0; k < pages.length; k++) {
      if (pages[k].box.getBoundingClientRect().top <= top) n = k + 1;
      else break;
    }
    return n;
  }
  let ticking = 0;
  scroll.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = requestAnimationFrame(() => { ticking = 0; mark(pageAtTop()); });
  }, { passive: true });

  function go(n) {
    const t = Math.min(total, Math.max(1, n));
    /* Mark before the scroll rather than waiting for it to settle, so a second
       press of Next steps from where the reader just asked to be and not from
       wherever a smooth scroll has got to so far. */
    mark(t);
    pages[t - 1].box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  prev.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current + 1));
  prev.disabled = true;
  next.disabled = total <= 1;

  scroll.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { go(current + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(current - 1); e.preventDefault(); }
    else if (e.key === 'Home') { go(1); e.preventDefault(); }
    else if (e.key === 'End') { go(total); e.preventDefault(); }
  });

  /* Rotating a phone changes the column width, and a canvas rendered for the
     old width is a blurry canvas. Re-measure, then redraw what had been drawn. */
  let t = 0;
  let last = width();
  const onResize = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const w = width();
      if (Math.abs(w - last) < 8) return;
      last = w;
      await measure();
      pages.forEach((p) => { if (p.done) { p.done = false; draw(p); } });
    }, 200);
  };
  window.addEventListener('resize', onResize, { passive: true });

  /* Observe only AFTER measure() has given every box its height. Observing
     first meant observing fifteen zero-height boxes stacked at the same offset,
     so the observer's opening callback reported all of them as intersecting and
     the whole deck rasterized before the reader had scrolled a pixel. */
  measure().then(() => {
    pages.forEach((p) => seen.observe(p.box));
    draw(pages[0]);
  });
  scroll.focus({ preventScroll: true });
}

async function open(embed) {
  const stage = embed.querySelector('.pdf-stage');
  const src = embed.dataset.src;
  const title = embed.dataset.title || 'Document';
  if (!stage || !src) return;

  embed.classList.add('is-open');
  stage.textContent = '';
  stage.appendChild(el('p', 'pdf-note', 'Loading document…'));

  try {
    const api = await lib();
    /* isEvalSupported:false closes the font-driven script-execution path that
       has bitten pdf.js before. Nothing in these decks needs eval. */
    const doc = await api.getDocument({ url: src, isEvalSupported: false }).promise;
    view(embed, stage, doc, title);
  } catch (e) {
    fail(embed, stage, 'The viewer could not load this document. It is still downloadable, and opens in a new tab.');
  }
}

document.querySelectorAll('.pdf-embed').forEach((embed) => {
  const btn = embed.querySelector('.pdf-open');
  if (!btn) return;
  /* Only now does the button exist as far as the reader is concerned. */
  embed.classList.add('is-ready');
  btn.addEventListener('click', () => open(embed));
});
