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
  
  // Check for hash on load
  if (window.location.hash) {
    const slug = window.location.hash.slice(1);
    const recipe = recipes.find(r => slugify(r.title) === slug);
    if (recipe) {
      renderDetail(recipe);
      return;
    }
  }
  
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
  const detail = document.getElementById('recipe-detail');

  detail.classList.remove('visible');
  container.classList.remove('hidden');
  
  // Clear hash when returning to list
  if (window.location.hash) {
    history.pushState(null, '', window.location.pathname);
  }

  const filtered = getFilteredRecipes();

  if (filtered.length === 0) {
    container.innerHTML = '<p class="no-results">No recipes match your search.</p>';
    return;
  }

  container.innerHTML = filtered.map((r, i) => `
    <div class="recipe-card" data-index="${recipes.indexOf(r)}" style="animation-delay: ${i * 0.05}s">
      <div class="card-content">
        <h2>${r.title}</h2>
        <div class="meta">${r.servings ? `Serves ${r.servings}` : ''}</div>
        <div class="tags">${r.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
      </div>
      ${r.photo ? `<img class="card-thumb" src="${r.photo}" alt="${r.title}">` : ''}
    </div>
  `).join('');

  container.querySelectorAll('.recipe-card').forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index);
      renderDetail(recipes[index]);
    });
  });
}

function renderDetail(recipe) {
  const container = document.getElementById('recipe-list');
  const detail = document.getElementById('recipe-detail');

  container.classList.add('hidden');
  detail.classList.add('visible');

  // Update URL hash
  const slug = slugify(recipe.title);
  history.pushState(null, '', `#${slug}`);

  const ingredientsHtml = parseIngredients(recipe.ingredientsRaw);
  const instructionsHtml = parseInstructions(recipe.instructionsRaw);

  const backIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;

  detail.innerHTML = `
    <button class="back-btn">${backIcon} Back to recipes</button>
    <div class="detail-header">
      <div class="detail-header-content">
        <h1>${recipe.title}</h1>
        <hr class="title-rule">
        <div class="meta">
          ${recipe.servings ? `Serves ${recipe.servings}` : ''}
          ${recipe.source ? ` · <a href="${recipe.source}" target="_blank">Adapted from source</a>` : ''}
        </div>
      </div>
      ${recipe.photo ? `<img class="detail-thumb" src="${recipe.photo}" alt="${recipe.title}">` : ''}
    </div>
    ${recipe.intro ? `<p class="intro">${recipe.intro}</p>` : ''}
    <h2>Ingredients</h2>
    ${ingredientsHtml}
    <h2>Instructions</h2>
    ${instructionsHtml}
    ${recipe.notes ? `<div class="notes"><strong>Notes:</strong> ${recipe.notes}</div>` : ''}
  `;

  detail.querySelector('.back-btn').addEventListener('click', () => {
    renderList();
    // Smooth scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function parseIngredients(raw) {
  const lines = raw.split('\n');
  let html = '';
  let inList = false;

  lines.forEach(line => {
    if (line.startsWith('### ')) {
      if (inList) html += '</ul>';
      html += `<h3>${line.slice(4)}</h3>`;
      inList = false;
    } else if (line.startsWith('- ')) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${line.slice(2)}</li>`;
    }
  });

  if (inList) html += '</ul>';
  return html;
}

function parseInstructions(raw) {
  const lines = raw.split('\n').filter(l => l.match(/^\d+\./));
  return '<ol>' + lines.map(l => `<li>${l.replace(/^\d+\.\s*/, '')}</li>`).join('') + '</ol>';
}

// Handle browser back/forward
window.addEventListener('popstate', () => {
  if (window.location.hash) {
    const slug = window.location.hash.slice(1);
    const recipe = recipes.find(r => slugify(r.title) === slug);
    if (recipe) {
      renderDetail(recipe);
      return;
    }
  }
  renderList();
});

document.addEventListener('DOMContentLoaded', init);
