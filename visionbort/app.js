/* ===== Visionbort — Vanilla JS Vision Board ===== */

(function () {
  'use strict';

  // ===== Config =====
  const UNSPLASH_PROXY = 'https://unsplash-proxy.kevin-middleton.workers.dev';
  const STORAGE_KEY = 'visionbort-lite';
  const MAX_IMAGE_SIZE = 300;
  const STICKERS = [
    '⭐','✨','💫','🌟','💖','🔥','🌈','🎯',
    '🏆','💪','🚀','🌸','🦋','🌺','🍀','💎',
    '👑','🎨','🎵','📸','✈️','🏠','🌍','💰',
    '📚','🧘','❤️','🎉','🌅','🏔️','🌊','🎭',
    '🥂','🎓','💐','🕊️','🌻','⚡','🎪','🗝️'
  ];
  const FONTS = [
    { id: 'helvetica', label: 'Helvetica', family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
    { id: 'playfair', label: 'Playfair', family: "'Playfair Display', serif" },
    { id: 'dancing', label: 'Dancing Script', family: "'Dancing Script', cursive" },
    { id: 'bebas', label: 'Bebas Neue', family: "'Bebas Neue', sans-serif" },
    { id: 'caveat', label: 'Caveat', family: "'Caveat', cursive" },
    { id: 'cormorant', label: 'Cormorant', family: "'Cormorant Garamond', serif" },
  ];
  const BACKGROUNDS = [
    { id: 'warm', label: 'Warm', cls: 'bg-warm' },
    { id: 'cork', label: 'Cork', cls: 'bg-cork' },
    { id: 'midnight', label: 'Midnight', cls: 'bg-midnight' },
    { id: 'blush', label: 'Blush', cls: 'bg-blush' },
    { id: 'ocean', label: 'Ocean', cls: 'bg-ocean' },
    { id: 'sunset', label: 'Sunset', cls: 'bg-sunset' },
    { id: 'forest', label: 'Forest', cls: 'bg-forest' },
    { id: 'lavender', label: 'Lavender', cls: 'bg-lavender' },
  ];
  const TEXT_PHRASES = ['Dream big', 'Make it happen', 'You got this', 'Believe', 'Manifest it'];

  // ===== State =====
  let elements = [];
  let selectedId = null;
  let nextId = 1;
  let maxZ = 0;
  let currentBg = BACKGROUNDS[0];
  let sidebarTab = null;
  let searchTimeout = null;
  let saveTimeout = null;

  // ===== DOM refs =====
  const $ = (sel) => document.querySelector(sel);
  const canvas = $('#canvas');
  const canvasContainer = $('#canvas-container');
  const emptyState = $('#canvas-empty');
  const dropOverlay = $('#drop-overlay');
  const sidebar = $('#sidebar');
  const sidebarTitle = $('#sidebar-title');
  const fileInput = $('#file-input');
  const boardTitle = $('#board-title');
  const btnClear = $('#btn-clear');
  const btnExport = $('#btn-export');
  const welcomeModal = $('#welcome-modal');

  // ===== Init =====
  function init() {
    loadBoard();
    renderStickers();
    renderBackgrounds();
    bindEvents();
    updateUI();

    // Show welcome modal if first visit
    if (!localStorage.getItem('visionbort-visited')) {
      welcomeModal.classList.remove('hidden');
    } else {
      welcomeModal.classList.add('hidden');
    }
  }

  // ===== Persistence =====
  function saveBoard() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const data = {
        elements: elements.map(el => {
          // Don't save huge data URLs for performance; keep them for session
          return { ...el };
        }),
        backgroundId: currentBg.id,
        boardTitle: boardTitle.value,
        nextId,
        maxZ,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn('Save failed:', e);
      }
    }, 500);
  }

  function loadBoard() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      elements = data.elements || [];
      nextId = data.nextId || elements.length + 1;
      maxZ = data.maxZ || 0;
      boardTitle.value = data.boardTitle || 'My Vision Board';
      const bg = BACKGROUNDS.find(b => b.id === data.backgroundId);
      if (bg) currentBg = bg;
      applyBackground();
      elements.forEach(el => renderElement(el));
    } catch (e) {
      console.warn('Load failed:', e);
    }
  }

  function clearBoard() {
    if (!confirm('Clear the entire board? This cannot be undone.')) return;
    elements = [];
    selectedId = null;
    nextId = 1;
    maxZ = 0;
    canvas.querySelectorAll('.canvas-element').forEach(el => el.remove());
    updateUI();
    saveBoard();
  }

  // ===== Element CRUD =====
  function addElement(props) {
    maxZ++;
    const el = {
      id: 'el-' + nextId++,
      x: props.x ?? randomInt(40, canvasContainer.offsetWidth - (props.width || 200) - 40),
      y: props.y ?? randomInt(40, canvasContainer.offsetHeight - (props.height || 200) - 40),
      width: props.width || 200,
      height: props.height || 200,
      rotation: props.rotation ?? randomInt(-8, 8),
      zIndex: maxZ,
      ...props,
    };
    elements.push(el);
    renderElement(el);
    selectElement(el.id);
    updateUI();
    saveBoard();
    return el;
  }

  function updateElement(id, updates) {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    Object.assign(el, updates);
    const dom = canvas.querySelector(`[data-id="${id}"]`);
    if (dom) applyElementStyle(dom, el);
    saveBoard();
  }

  function removeElement(id) {
    elements = elements.filter(e => e.id !== id);
    const dom = canvas.querySelector(`[data-id="${id}"]`);
    if (dom) dom.remove();
    if (selectedId === id) selectedId = null;
    updateUI();
    saveBoard();
  }

  function bringToFront(id) {
    maxZ++;
    updateElement(id, { zIndex: maxZ });
  }

  function sendToBack(id) {
    const minZ = Math.min(...elements.map(e => e.zIndex));
    updateElement(id, { zIndex: minZ - 1 });
  }

  // ===== Rendering =====
  function renderElement(el) {
    // Remove existing DOM if re-rendering
    const existing = canvas.querySelector(`[data-id="${el.id}"]`);
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'canvas-element pop-in';
    div.dataset.id = el.id;
    div.dataset.type = el.type;

    const content = document.createElement('div');
    content.className = 'element-content';

    if (el.type === 'image') {
      const img = document.createElement('img');
      img.src = el.src;
      img.draggable = false;
      img.alt = el.label || '';
      content.appendChild(img);
    } else if (el.type === 'sticker') {
      const span = document.createElement('div');
      span.className = 'sticker-content';
      span.style.fontSize = Math.min(el.width, el.height) * 0.75 + 'px';
      span.textContent = el.src;
      content.appendChild(span);
    } else if (el.type === 'text') {
      const textDiv = document.createElement('div');
      textDiv.className = 'text-content';
      textDiv.textContent = el.content;
      textDiv.style.fontSize = (el.fontSize || 32) + 'px';
      textDiv.style.fontFamily = el.fontFamily || 'serif';
      textDiv.style.color = el.color || '#1a1a2e';
      textDiv.style.fontWeight = el.fontWeight || 'bold';
      textDiv.style.fontStyle = el.fontStyle || 'normal';
      content.appendChild(textDiv);
    }

    div.appendChild(content);
    canvas.appendChild(div);
    applyElementStyle(div, el);

    // Event listeners
    div.addEventListener('pointerdown', (e) => handlePointerDown(e, el.id));
    div.addEventListener('dblclick', (e) => handleDoubleClick(e, el.id));
  }

  function applyElementStyle(dom, el) {
    dom.style.left = el.x + 'px';
    dom.style.top = el.y + 'px';
    dom.style.width = el.width + 'px';
    dom.style.height = el.height + 'px';
    dom.style.zIndex = el.zIndex;
    dom.style.transform = `rotate(${el.rotation || 0}deg)`;

    // Update inner content styles
    if (el.type === 'sticker') {
      const sc = dom.querySelector('.sticker-content');
      if (sc) sc.style.fontSize = Math.min(el.width, el.height) * 0.75 + 'px';
    }
    if (el.type === 'text') {
      const tc = dom.querySelector('.text-content');
      if (tc) {
        tc.style.fontSize = (el.fontSize || 32) + 'px';
        tc.style.fontFamily = el.fontFamily || 'serif';
        tc.style.color = el.color || '#1a1a2e';
        tc.style.fontWeight = el.fontWeight || 'bold';
        tc.style.fontStyle = el.fontStyle || 'normal';
      }
    }

    // Selection UI
    dom.classList.toggle('selected', el.id === selectedId);
    updateSelectionUI(dom, el);
  }

  function updateSelectionUI(dom, el) {
    // Remove old handles and action bar
    dom.querySelectorAll('.resize-handle, .rotate-handle, .element-actions').forEach(h => h.remove());

    if (el.id !== selectedId) return;

    // Resize handles
    ['nw', 'ne', 'sw', 'se'].forEach(pos => {
      const handle = document.createElement('div');
      handle.className = `resize-handle ${pos}`;
      handle.dataset.noExport = 'true';
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        startResize(e, el.id, pos);
      });
      dom.querySelector('.element-content').appendChild(handle);
    });

    // Rotate handle
    const rotateHandle = document.createElement('div');
    rotateHandle.className = 'rotate-handle';
    rotateHandle.dataset.noExport = 'true';
    rotateHandle.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e07caa" stroke-width="2.5"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/></svg>';
    rotateHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      startRotate(e, el.id);
    });
    dom.querySelector('.element-content').appendChild(rotateHandle);

    // Action bar
    const actions = document.createElement('div');
    actions.className = 'element-actions';
    actions.dataset.noExport = 'true';

    // Bring to front
    actions.appendChild(makeActionBtn(
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>',
      'Bring to front',
      () => bringToFront(el.id)
    ));

    // Send to back
    actions.appendChild(makeActionBtn(
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>',
      'Send to back',
      () => sendToBack(el.id)
    ));

    // Text-specific actions
    if (el.type === 'text') {
      // Font selector
      const fontBtn = makeActionBtn(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
        'Change font',
        () => toggleFontSelector(actions, el.id)
      );
      actions.appendChild(fontBtn);

      // Bold toggle
      const boldBtn = makeActionBtn(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>',
        'Toggle bold',
        () => {
          const newWeight = el.fontWeight === 'bold' ? 'normal' : 'bold';
          updateElement(el.id, { fontWeight: newWeight });
        }
      );
      actions.appendChild(boldBtn);

      // Italic toggle
      const italicBtn = makeActionBtn(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>',
        'Toggle italic',
        () => {
          const newStyle = el.fontStyle === 'italic' ? 'normal' : 'italic';
          updateElement(el.id, { fontStyle: newStyle });
        }
      );
      actions.appendChild(italicBtn);

      // Color picker
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'color-input';
      colorInput.value = el.color || '#1a1a2e';
      colorInput.title = 'Text color';
      colorInput.addEventListener('input', (e) => {
        updateElement(el.id, { color: e.target.value });
      });
      colorInput.addEventListener('pointerdown', (e) => e.stopPropagation());
      actions.appendChild(colorInput);
    }

    // Duplicate
    actions.appendChild(makeActionBtn(
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      'Duplicate',
      () => {
        const clone = { ...el, x: el.x + 20, y: el.y + 20 };
        delete clone.id;
        delete clone.zIndex;
        addElement(clone);
      }
    ));

    // Delete
    const deleteBtn = makeActionBtn(
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
      'Delete',
      () => removeElement(el.id)
    );
    deleteBtn.classList.add('danger');
    actions.appendChild(deleteBtn);

    dom.querySelector('.element-content').appendChild(actions);
  }

  function makeActionBtn(svg, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.innerHTML = svg;
    btn.title = title;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    return btn;
  }

  function toggleFontSelector(actionsEl, elId) {
    let dropdown = actionsEl.querySelector('.font-selector');
    if (dropdown) {
      dropdown.classList.toggle('hidden');
      return;
    }
    dropdown = document.createElement('div');
    dropdown.className = 'font-selector';
    const el = elements.find(e => e.id === elId);
    FONTS.forEach(font => {
      const btn = document.createElement('button');
      btn.className = 'font-option';
      if (el && el.fontFamily === font.family) btn.classList.add('active');
      btn.style.fontFamily = font.family;
      btn.textContent = font.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateElement(elId, { fontFamily: font.family });
        dropdown.classList.add('hidden');
        selectElement(elId); // Re-render actions
      });
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      dropdown.appendChild(btn);
    });
    actionsEl.appendChild(dropdown);
  }

  function selectElement(id) {
    const prev = selectedId;
    selectedId = id;

    // Update previous
    if (prev && prev !== id) {
      const prevEl = elements.find(e => e.id === prev);
      const prevDom = canvas.querySelector(`[data-id="${prev}"]`);
      if (prevDom && prevEl) {
        // If text was being edited, save content
        const tc = prevDom.querySelector('.text-content[contenteditable="true"]');
        if (tc) {
          tc.contentEditable = 'false';
          updateElement(prev, { content: tc.textContent });
        }
        prevDom.classList.remove('selected');
        prevDom.querySelectorAll('.resize-handle, .rotate-handle, .element-actions').forEach(h => h.remove());
      }
    }

    // Update current
    if (id) {
      const el = elements.find(e => e.id === id);
      const dom = canvas.querySelector(`[data-id="${id}"]`);
      if (dom && el) {
        dom.classList.add('selected');
        updateSelectionUI(dom, el);
      }
    }
  }

  // ===== Drag =====
  let dragState = null;

  function handlePointerDown(e, id) {
    if (e.target.closest('.element-actions') || e.target.closest('.resize-handle') || e.target.closest('.rotate-handle')) return;
    if (e.target.closest('.text-content[contenteditable="true"]')) return;

    e.preventDefault();
    selectElement(id);

    const el = elements.find(e => e.id === id);
    if (!el) return;

    const canvasRect = canvas.getBoundingClientRect();
    dragState = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
    };

    document.addEventListener('pointermove', handleDragMove);
    document.addEventListener('pointerup', handleDragEnd);
  }

  function handleDragMove(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const el = elements.find(e => e.id === dragState.id);
    if (!el) return;

    el.x = dragState.origX + dx;
    el.y = dragState.origY + dy;

    const dom = canvas.querySelector(`[data-id="${dragState.id}"]`);
    if (dom) {
      dom.style.left = el.x + 'px';
      dom.style.top = el.y + 'px';
    }
  }

  function handleDragEnd() {
    if (dragState) {
      saveBoard();
      dragState = null;
    }
    document.removeEventListener('pointermove', handleDragMove);
    document.removeEventListener('pointerup', handleDragEnd);
  }

  // ===== Resize =====
  let resizeState = null;

  function startResize(e, id, corner) {
    e.preventDefault();
    const el = elements.find(e => e.id === id);
    if (!el) return;

    resizeState = {
      id,
      corner,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      origW: el.width,
      origH: el.height,
      aspect: el.type !== 'text' ? el.width / el.height : 0,
    };

    document.addEventListener('pointermove', handleResizeMove);
    document.addEventListener('pointerup', handleResizeEnd);
  }

  function handleResizeMove(e) {
    if (!resizeState) return;
    const { id, corner, startX, startY, origX, origY, origW, origH, aspect } = resizeState;
    let dx = e.clientX - startX;
    let dy = e.clientY - startY;
    let newX = origX, newY = origY, newW = origW, newH = origH;

    if (corner === 'se') {
      newW = Math.max(40, origW + dx);
      newH = aspect ? newW / aspect : Math.max(30, origH + dy);
    } else if (corner === 'sw') {
      newW = Math.max(40, origW - dx);
      newH = aspect ? newW / aspect : Math.max(30, origH + dy);
      newX = origX + origW - newW;
    } else if (corner === 'ne') {
      newW = Math.max(40, origW + dx);
      newH = aspect ? newW / aspect : Math.max(30, origH - dy);
      newY = origY + origH - newH;
    } else if (corner === 'nw') {
      newW = Math.max(40, origW - dx);
      newH = aspect ? newW / aspect : Math.max(30, origH - dy);
      newX = origX + origW - newW;
      newY = origY + origH - newH;
    }

    const el = elements.find(e => e.id === id);
    if (!el) return;
    el.x = newX;
    el.y = newY;
    el.width = newW;
    el.height = newH;

    const dom = canvas.querySelector(`[data-id="${id}"]`);
    if (dom) applyElementStyle(dom, el);
  }

  function handleResizeEnd() {
    resizeState = null;
    saveBoard();
    document.removeEventListener('pointermove', handleResizeMove);
    document.removeEventListener('pointerup', handleResizeEnd);
  }

  // ===== Rotate =====
  let rotateState = null;

  function startRotate(e, id) {
    e.preventDefault();
    const dom = canvas.querySelector(`[data-id="${id}"]`);
    if (!dom) return;

    const rect = dom.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const el = elements.find(e => e.id === id);

    rotateState = {
      id,
      centerX,
      centerY,
      startAngle,
      origRotation: el ? el.rotation : 0,
    };

    document.addEventListener('pointermove', handleRotateMove);
    document.addEventListener('pointerup', handleRotateEnd);
  }

  function handleRotateMove(e) {
    if (!rotateState) return;
    const { id, centerX, centerY, startAngle, origRotation } = rotateState;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const delta = (angle - startAngle) * (180 / Math.PI);
    const el = elements.find(e => e.id === id);
    if (!el) return;

    el.rotation = origRotation + delta;
    const dom = canvas.querySelector(`[data-id="${id}"]`);
    if (dom) dom.style.transform = `rotate(${el.rotation}deg)`;
  }

  function handleRotateEnd() {
    rotateState = null;
    saveBoard();
    document.removeEventListener('pointermove', handleRotateMove);
    document.removeEventListener('pointerup', handleRotateEnd);
  }

  // ===== Double-click (text edit) =====
  function handleDoubleClick(e, id) {
    const el = elements.find(e => e.id === id);
    if (!el || el.type !== 'text') return;

    const dom = canvas.querySelector(`[data-id="${id}"]`);
    const tc = dom.querySelector('.text-content');
    if (!tc) return;

    tc.contentEditable = 'true';
    tc.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(tc);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    tc.addEventListener('blur', () => {
      tc.contentEditable = 'false';
      updateElement(id, { content: tc.textContent || 'Text' });
    }, { once: true });

    tc.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        tc.blur();
      }
    });
  }

  // ===== Image adding =====
  function addImageFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(MAX_IMAGE_SIZE / img.width, MAX_IMAGE_SIZE / img.height, 1);
        addElement({
          type: 'image',
          src: e.target.result,
          width: Math.round(img.width * ratio),
          height: Math.round(img.height * ratio),
          label: file.name,
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function addImageFromUrl(url, w, h) {
    const ratio = Math.min(MAX_IMAGE_SIZE / (w || 300), MAX_IMAGE_SIZE / (h || 300), 1);
    addElement({
      type: 'image',
      src: url,
      width: Math.round((w || 300) * ratio),
      height: Math.round((h || 300) * ratio),
      label: '',
    });
  }

  function addSticker(emoji) {
    addElement({ type: 'sticker', src: emoji, width: 80, height: 80, rotation: 0 });
  }

  function addText() {
    const phrase = TEXT_PHRASES[Math.floor(Math.random() * TEXT_PHRASES.length)];
    addElement({
      type: 'text',
      content: phrase,
      fontSize: 32,
      fontFamily: FONTS[0].family,
      color: '#1a1a2e',
      fontWeight: 'bold',
      fontStyle: 'normal',
      width: 220,
      height: 60,
      rotation: 0,
    });
  }

  // ===== Background =====
  function applyBackground() {
    // Remove all bg classes
    BACKGROUNDS.forEach(b => canvas.classList.remove(b.cls));
    canvas.classList.add(currentBg.cls);
    // Update bg grid selection
    document.querySelectorAll('.bg-card').forEach(card => {
      card.classList.toggle('active', card.dataset.bgId === currentBg.id);
    });
  }

  // ===== Search =====
  async function searchImages(query) {
    const resultsDiv = $('#search-results');
    const emptyDiv = $('#search-empty');
    const loadingDiv = $('#search-loading');

    if (!UNSPLASH_PROXY) {
      emptyDiv.querySelector('p').textContent = 'Image search coming soon! For now, drag & drop or upload images.';
      emptyDiv.classList.remove('hidden');
      return;
    }
    if (!query.trim()) return;

    emptyDiv.classList.add('hidden');
    loadingDiv.classList.remove('hidden');
    resultsDiv.innerHTML = '';

    try {
      const res = await fetch(`${UNSPLASH_PROXY}/search?query=${encodeURIComponent(query)}&per_page=20`);
      const data = await res.json();

      loadingDiv.classList.add('hidden');

      if (!data.results || data.results.length === 0) {
        emptyDiv.querySelector('p').textContent = 'No images found. Try a different search.';
        emptyDiv.classList.remove('hidden');
        return;
      }

      data.results.forEach(photo => {
        const item = document.createElement('div');
        item.className = 'image-grid-item';

        const img = document.createElement('img');
        img.src = photo.urls.small;
        img.alt = photo.alt_description || '';
        img.loading = 'lazy';
        item.appendChild(img);

        const credit = document.createElement('div');
        credit.className = 'credit';
        credit.textContent = photo.user.name;
        item.appendChild(credit);

        item.addEventListener('click', () => {
          addImageFromUrl(photo.urls.regular, photo.width, photo.height);
        });

        resultsDiv.appendChild(item);
      });
    } catch (e) {
      loadingDiv.classList.add('hidden');
      emptyDiv.querySelector('p').textContent = 'Search failed. Please try again.';
      emptyDiv.classList.remove('hidden');
      console.error('Search error:', e);
    }
  }

  // ===== Export =====
  async function exportBoard() {
    if (elements.length === 0) return;

    // Deselect to hide UI
    const prevSelected = selectedId;
    selectElement(null);

    // Hide empty state and other non-export elements
    emptyState.classList.add('hidden');

    try {
      const dataUrl = await htmlToImage.toPng(canvas, {
        quality: 1,
        pixelRatio: 2,
        filter: (node) => {
          if (node.dataset && node.dataset.noExport !== undefined) return false;
          return true;
        },
      });

      const link = document.createElement('a');
      link.download = `${boardTitle.value || 'vision-board'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed. Try again.');
    }

    updateUI();
  }

  // ===== Sidebar =====
  function openSidebar(tab) {
    if (sidebarTab === tab) {
      closeSidebar();
      return;
    }
    sidebarTab = tab;
    sidebar.classList.remove('hidden');

    // Update title
    const titles = { search: 'Search Images', stickers: 'Stickers', backgrounds: 'Backgrounds' };
    sidebarTitle.textContent = titles[tab] || tab;

    // Show correct panel
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.add('hidden'));
    $(`#panel-${tab}`).classList.remove('hidden');

    // Update tool buttons
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    $(`#tool-${tab}`).classList.add('active');

    // Focus search input
    if (tab === 'search') {
      setTimeout(() => $('#search-input').focus(), 100);
    }
  }

  function closeSidebar() {
    sidebarTab = null;
    sidebar.classList.add('hidden');
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  }

  // ===== Render sidebar panels =====
  function renderStickers() {
    const grid = $('#sticker-grid');
    STICKERS.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'sticker-btn';
      btn.textContent = emoji;
      btn.addEventListener('click', () => addSticker(emoji));
      grid.appendChild(btn);
    });
  }

  function renderBackgrounds() {
    const grid = $('#bg-grid');
    BACKGROUNDS.forEach(bg => {
      const card = document.createElement('div');
      card.className = `bg-card ${bg.cls}`;
      card.dataset.bgId = bg.id;
      if (bg.id === currentBg.id) card.classList.add('active');

      const label = document.createElement('span');
      label.className = 'bg-card-label';
      label.textContent = bg.label;
      card.appendChild(label);

      const check = document.createElement('div');
      check.className = 'check-mark';
      check.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
      card.appendChild(check);

      card.addEventListener('click', () => {
        currentBg = bg;
        applyBackground();
        saveBoard();
      });

      grid.appendChild(card);
    });
  }

  // ===== UI Updates =====
  function updateUI() {
    const hasElements = elements.length > 0;
    emptyState.classList.toggle('hidden', hasElements);
    btnClear.style.display = hasElements ? 'inline-flex' : 'none';
    btnExport.disabled = !hasElements;
  }

  // ===== Event Binding =====
  function bindEvents() {
    // Welcome modal
    $('#welcome-start').addEventListener('click', () => {
      welcomeModal.classList.add('hidden');
      localStorage.setItem('visionbort-visited', 'true');
    });

    // Canvas click (deselect)
    canvas.addEventListener('pointerdown', (e) => {
      if (e.target === canvas || e.target === emptyState || e.target.closest('#canvas-empty')) {
        selectElement(null);
      }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        removeElement(selectedId);
      }
      if (e.key === 'Escape') {
        selectElement(null);
        closeSidebar();
      }
    });

    // File input
    fileInput.addEventListener('change', (e) => {
      Array.from(e.target.files).forEach(f => {
        if (f.type.startsWith('image/')) addImageFromFile(f);
      });
      e.target.value = '';
    });

    // Toolbar buttons
    $('#tool-upload').addEventListener('click', () => fileInput.click());
    $('#tool-search').addEventListener('click', () => openSidebar('search'));
    $('#tool-stickers').addEventListener('click', () => openSidebar('stickers'));
    $('#tool-text').addEventListener('click', () => addText());
    $('#tool-backgrounds').addEventListener('click', () => openSidebar('backgrounds'));

    // Top toolbar
    btnClear.addEventListener('click', clearBoard);
    btnExport.addEventListener('click', exportBoard);
    boardTitle.addEventListener('input', () => saveBoard());

    // Sidebar close
    $('#sidebar-close').addEventListener('click', closeSidebar);

    // Search
    $('#search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();
      if (query.length < 2) return;
      searchTimeout = setTimeout(() => searchImages(query), 400);
    });

    // Drag & drop on canvas
    canvasContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropOverlay.classList.remove('hidden');
    });
    canvasContainer.addEventListener('dragleave', (e) => {
      if (!canvasContainer.contains(e.relatedTarget)) {
        dropOverlay.classList.add('hidden');
      }
    });
    canvasContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      dropOverlay.classList.add('hidden');
      Array.from(e.dataTransfer.files).forEach(f => {
        if (f.type.startsWith('image/')) addImageFromFile(f);
      });
    });
  }

  // ===== Helpers =====
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ===== Boot =====
  init();
})();
