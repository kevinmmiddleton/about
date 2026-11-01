// Search and tag filters for middleton.io/recipes/.
// The cards, chips and ItemList JSON-LD are written into index.html by
// tools/recipes-generate.mjs, so the list works (and is crawlable) without
// this file. Here we only show and hide what is already on the page.

const list = document.getElementById('recipe-list');
const cards = [...list.querySelectorAll('.recipe-card')];
const chips = [...document.querySelectorAll('#filters .filter-btn')];
const search = document.getElementById('search');
const empty = document.getElementById('no-results');
const feature = list.querySelector('.recipe-card.is-feature');
const active = new Set();

function apply() {
  const q = search.value.toLowerCase().trim();
  let shown = 0;
  for (const card of cards) {
    const tags = card.dataset.tags.split(' ');
    const ok = [...active].every((t) => tags.includes(t)) && (!q || card.dataset.search.includes(q));
    card.hidden = !ok;
    if (ok) shown++;
  }
  // The newest recipe is a big tile only on the unfiltered list.
  feature?.classList.toggle('is-feature', !active.size && !q);
  empty.hidden = shown > 0;
  for (const chip of chips) {
    const tag = chip.dataset.tag;
    chip.setAttribute('aria-pressed', String(tag ? active.has(tag) : active.size === 0));
  }
}

document.getElementById('filters').addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-btn');
  if (!chip) return;
  const tag = chip.dataset.tag;
  if (!tag) active.clear();
  else if (active.has(tag)) active.delete(tag);
  else active.add(tag);
  apply();
});
search.addEventListener('input', apply);

// Old share links were /recipes/#slug; each recipe now has its own page.
function redirectHash() {
  const slug = decodeURIComponent(location.hash.slice(1));
  if (slug && cards.some((c) => c.getAttribute('href') === `/recipes/${slug}/`)) {
    location.replace(`/recipes/${slug}/`);
  }
}
window.addEventListener('hashchange', redirectHash);
redirectHash();
