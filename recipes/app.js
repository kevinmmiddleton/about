const RECIPES_URL = 'recipes.md';

let recipes = [];
let allTags = new Set();
let activeFilters = new Set();
let searchQuery = '';

async function init() {
  const md = await fetch(RECIPES_URL).then(r => r.text());
  recipes = parseRecipes(md);
  allTags = new Set(recipes.flatMap(r => r.tags));
  
  renderFilters();
  setupSearch();
  setupClearFilters();
  
  // Old share links were /recipes/#slug; each recipe now has its own page.
  if (redirectHash()) return;

  renderList();
}

function parseRecipes(md) {
  const blocks = md.split(/^# /m).filter(b => b.trim());
  return blocks.map(block => {
    const lines = block.split('\n');
    const title = lines[0].trim();

    const fmStart = lines.findIndex(l => l.trim() === '---');
    const fmEnd = lines.findIndex((l, i) => i > fmStart && l.trim() === '---');

    let tags = [];
    let servings = '';
    let source = '';
    let photo = '';
    let notes = '';
    let totalTime = '';

    if (fmStart !== -1 && fmEnd !== -1) {
      const fm = lines.slice(fmStart + 1, fmEnd);
      fm.forEach(line => {
        const [key, ...rest] = line.split(':');
        const val = rest.join(':').trim();
        if (key.trim() === 'tags') {
          tags = val.replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean);
        } else if (key.trim() === 'servings') {
          servings = val;
        } else if (key.trim() === 'source') {
          source = val;
        } else if (key.trim() === 'photo') {
          photo = val;
        } else if (key.trim() === 'notes') {
          notes = val;
        } else if (key.trim() === 'total_time') {
          totalTime = val;
        }
      });
    }

    const contentStart = fmEnd !== -1 ? fmEnd + 1 : 1;
    const content = lines.slice(contentStart).join('\n').trim();

    const firstHeading = content.search(/^## /m);
    const intro = firstHeading > 0 ? content.slice(0, firstHeading).trim() : '';

    const ingredientsMatch = content.match(/## Ingredients\n([\s\S]*?)(?=\n## |$)/);
    const ingredientsRaw = ingredientsMatch ? ingredientsMatch[1].trim() : '';

    const instructionsMatch = content.match(/## Instructions\n([\s\S]*?)(?=\n## |$)/);
    const instructionsRaw = instructionsMatch ? instructionsMatch[1].trim() : '';

    return {
      title,
      tags,
      servings,
      source,
      photo,
      notes,
      totalTime,
      intro,
      ingredientsRaw,
      instructionsRaw
    };
  });
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function setupSearch() {
  const searchInput = document.getElementById('search');
  searchInput.addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderList();
  });
}

function setupClearFilters() {
  const clearBtn = document.getElementById('clear-filters');
  clearBtn.addEventListener('click', () => {
    activeFilters.clear();
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    updateClearButton();
    renderList();
  });
}

function updateClearButton() {
  const clearBtn = document.getElementById('clear-filters');
  if (activeFilters.size > 0) {
    clearBtn.classList.add('visible');
  } else {
    clearBtn.classList.remove('visible');
  }
}

function renderFilters() {
  const container = document.getElementById('filters');
  const sortedTags = [...allTags].sort();

  container.innerHTML = sortedTags.map(tag => `
    <button class="filter-btn" data-tag="${tag}">${tag}</button>
  `).join('');

  container.addEventListener('click', e => {
    if (e.target.classList.contains('filter-btn')) {
      const tag = e.target.dataset.tag;
      if (activeFilters.has(tag)) {
        activeFilters.delete(tag);
        e.target.classList.remove('active');
      } else {
        activeFilters.add(tag);
        e.target.classList.add('active');
      }
      updateClearButton();
      renderList();
    }
  });
}

function getFilteredRecipes() {
  let filtered = recipes;

  // Apply tag filters
  if (activeFilters.size > 0) {
    filtered = filtered.filter(r => [...activeFilters].every(f => r.tags.includes(f)));
  }

  // Apply search
  if (searchQuery) {
    filtered = filtered.filter(r => 
      r.title.toLowerCase().includes(searchQuery) ||
      r.tags.some(t => t.toLowerCase().includes(searchQuery)) ||
      r.ingredientsRaw.toLowerCase().includes(searchQuery)
    );
  }

  // Sort alphabetically
  filtered = filtered.sort((a, b) => a.title.localeCompare(b.title));

  return filtered;
}

function renderList() {
  const container = document.getElementById('recipe-list');
  const filtered = getFilteredRecipes();

  if (filtered.length === 0) {
    container.innerHTML = '<p class="no-results">No recipes match your search.</p>';
    return;
  }

  container.innerHTML = filtered.map((r, i) => `
    <a class="recipe-card" href="/recipes/${slugify(r.title)}/" style="animation-delay: ${i * 0.05}s">
      <div class="card-content">
        <h2>${r.title}</h2>
        <div class="meta">${[r.servings && `Serves ${r.servings}`, r.totalTime].filter(Boolean).join(' · ')}</div>
        <div class="tags">${r.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
      </div>
      ${r.photo ? `<img class="card-thumb" src="${r.photo}" alt="${r.title}">` : ''}
    </a>
  `).join('');
}

function redirectHash() {
  const slug = window.location.hash.slice(1);
  if (slug && recipes.some(r => slugify(r.title) === slug)) {
    window.location.replace(`/recipes/${slug}/`);
    return true;
  }
  return false;
}

window.addEventListener('hashchange', redirectHash);

document.addEventListener('DOMContentLoaded', init);
