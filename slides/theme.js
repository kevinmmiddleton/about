// Slides theme toggle. Wires up the .theme-toggle button.
// FOUC prevention happens inline in the document <head>; this script
// only handles user interaction.
(function () {
  function attach() {
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      if (!current) {
        var prefersLight = window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: light)').matches;
        current = prefersLight ? 'light' : 'dark';
      }
      var next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('slides-theme', next); } catch (e) { /* private mode, ignore */ }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
