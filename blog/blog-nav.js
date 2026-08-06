// Shared header behavior for /blog/ pages.
// Mirrors the homepage nav (styles come from styles-merged.css) but keeps the
// name lockup ever-present, so we do NOT toggle `.name-visible` here — it's set
// statically in the markup.
(function () {
  var header = document.querySelector('.header');

  // Sticky-header shadow on scroll (matches the homepage `.scrolled` treatment).
  function onScroll() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 50);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu toggle.
  var toggle = document.getElementById('menu-toggle');
  var menu = document.getElementById('menu');
  if (toggle && menu) {
    toggle.addEventListener('click', function () { menu.classList.toggle('active'); });
    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target) && !toggle.contains(e.target)) menu.classList.remove('active');
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.classList.remove('active'); });
    });
  }

  // Figure lightbox (article pages only; no-ops on the index where there are no figures).
  var lb = document.getElementById('lightbox');
  if (lb) {
    var img = document.getElementById('lightbox-image');
    var close = lb.querySelector('.close-lightbox');
    document.querySelectorAll('.article-body figure img').forEach(function (el) {
      el.addEventListener('click', function () { if (img) img.src = el.src; lb.classList.add('active'); });
    });
    var hide = function () { lb.classList.remove('active'); };
    lb.addEventListener('click', hide);
    if (close) close.addEventListener('click', hide);
  }

  // Plausible custom goal: fire once when the reader reaches the end of an article's body.
  // (Office Hours CTA + post-card clicks are tagged via CSS classes in the markup instead.)
  var articleBody = document.querySelector('.article-body');
  if (articleBody && 'IntersectionObserver' in window) {
    var m = location.pathname.match(/\/blog\/([^/]+)\//);
    var slug = m ? m[1] : location.pathname;
    var sentinel = document.createElement('span');
    sentinel.setAttribute('aria-hidden', 'true');
    articleBody.appendChild(sentinel);
    var sent = false;
    var io = new IntersectionObserver(function (entries) {
      if (sent) return;
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          sent = true;
          if (typeof window.plausible === 'function') {
            window.plausible('Read Complete', { props: { post: slug } });
          }
          io.disconnect();
          break;
        }
      }
    });
    io.observe(sentinel);
  }

  // Copy button on code / prompt blocks — lets readers grab a prompt or snippet
  // in one tap to paste into their AI of choice. Progressive enhancement: the
  // button only appears where the Clipboard API is available.
  var blocks = document.querySelectorAll('.article-body .prompt-block');
  if (blocks.length && navigator.clipboard) {
    var copySlug = (location.pathname.match(/\/blog\/([^/]+)\//) || [])[1] || location.pathname;
    blocks.forEach(function (block) {
      var code = block.textContent; // capture the code BEFORE we add the button
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      /* No static aria-label. One used to sit here reading "Copy to clipboard",
         which permanently overrode the visible text, so when the label changed
         to "Copied!" a screen reader still announced "Copy to clipboard" and
         the user got no confirmation at all. The visible text is the accessible
         name, and aria-live announces it when it changes. */
      btn.setAttribute('aria-live', 'polite');
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(code).then(function () {
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          if (typeof window.plausible === 'function') {
            window.plausible('Copy Code', { props: { post: copySlug } });
          }
          setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1800);
        }).catch(function () {
          btn.textContent = 'Press ⌘C';
          setTimeout(function () { btn.textContent = 'Copy'; }, 1800);
        });
      });
      block.appendChild(btn);
    });
  }
})();

/* ---------------------------------------------------------------------------
   Section contents: active-section tracking, and gating the margin rail.

   The rail is position:fixed rather than sticky because body.p-post carries
   overflow:hidden auto, which makes the body its own scroll container; a sticky
   child pins to that instead of to the page and never engages. So the rail is
   fixed and shown only while the prose is on screen, which keeps it off the
   cover art at the top and off Read Next at the foot.

   Below 1180px the same nav is an inline card in normal flow: no gating, no
   active state, nothing to do here. matchMedia keeps the work off phones.
   --------------------------------------------------------------------------- */
(function () {
  var toc = document.querySelector('.toc');
  var body = document.querySelector('.article-body');
  if (!toc || !body) return;
  var heads = [].slice.call(body.querySelectorAll('h2.sec'));
  if (!heads.length) return;
  var links = [].slice.call(toc.querySelectorAll('a'));
  var rail = window.matchMedia('(min-width: 1180px)');

  function update() {
    if (!rail.matches) { toc.classList.remove('is-on'); return; }
    var r = body.getBoundingClientRect();
    // on only between the end of the lede and the start of Read Next
    toc.classList.toggle('is-on', r.top < 120 && r.bottom > 260);
    /* The active section is the one covering the most of the screen right now,
       not the last heading to pass some fixed line.

       A fixed line 140px from the top made the highlight LAG: a section you
       were already reading stayed dark until the next heading arrived, which is
       what Kevin reported. Moving the line to the viewport middle fixed that at
       laptop heights but then ran AHEAD on a 1080px-tall window, because a short
       section's heading crosses the halfway mark while the previous section
       still fills most of the glass. Measuring coverage has no such tuning
       constant and behaves the same at every viewport height. */
    /* Coverage is measured over the TOP 70% of the glass, not all of it. Plain
       coverage tripped on a short section: parked at heading 5, section 5 held
       404px and section 6 held 412, so section 6 lit by an 8px margin while the
       reader was sitting on heading 5. Where the coverage falls matters, and
       the eye is in the upper part of the screen. */
    var vt = window.scrollY, vb = vt + window.innerHeight * 0.7;
    var bodyBottom = body.getBoundingClientRect().bottom + window.scrollY;
    var best = 0, bestCover = -1;
    for (var i = 0; i < heads.length; i++) {
      var top = heads[i].getBoundingClientRect().top + window.scrollY;
      var end = (i + 1 < heads.length)
        ? heads[i + 1].getBoundingClientRect().top + window.scrollY
        : bodyBottom;
      var cover = Math.min(end, vb) - Math.max(top, vt);
      if (cover > bestCover) { bestCover = cover; best = i; }
    }
    /* A short final section can end before it ever wins the upper band, so at
       the very bottom of the page the last one takes it outright. */
    var doc = document.documentElement;
    if (window.scrollY + window.innerHeight >= doc.scrollHeight - 4) best = heads.length - 1;
    for (var j = 0; j < links.length; j++) {
      links[j].classList.toggle('is-active', j === best);
    }
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  if (rail.addEventListener) rail.addEventListener('change', update);
})();
