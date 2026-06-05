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
})();
