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
  const CLIP_SHAPES = [
    { id: 'none', label: 'None' },
    { id: 'circle', label: 'Circle' },
    { id: 'star', label: 'Star' },
    { id: 'heart', label: 'Heart' },
    { id: 'diamond', label: 'Diamond' },
    { id: 'torn', label: 'Magazine Cut' },
    { id: 'polaroid', label: 'Polaroid' },
  ];

  function getClipPath(shapeId, width, height) {
    // Use pixel-based inset for shapes that need to stay undistorted
    const min = Math.min(width, height);
    const cx = width / 2, cy = height / 2;
    switch (shapeId) {
      case 'circle':
        return `circle(${min * 0.45}px at ${cx}px ${cy}px)`;
      case 'star': {
        // Generate a 5-point star centered, using pixel coords
        const outerR = min * 0.48, innerR = min * 0.2;
        const pts = [];
        for (let i = 0; i < 5; i++) {
          const outerAngle = (i * 72 - 90) * Math.PI / 180;
          const innerAngle = ((i * 72) + 36 - 90) * Math.PI / 180;
          pts.push(`${cx + outerR * Math.cos(outerAngle)}px ${cy + outerR * Math.sin(outerAngle)}px`);
          pts.push(`${cx + innerR * Math.cos(innerAngle)}px ${cy + innerR * Math.sin(innerAngle)}px`);
        }
        return `polygon(${pts.join(', ')})`;
      }
      case 'heart': {
        // Heart using SVG path approach — approximate with polygon
        const r = min * 0.45;
        const pts = [];
        for (let i = 0; i <= 30; i++) {
          const t = (i / 30) * 2 * Math.PI;
          const x = 16 * Math.pow(Math.sin(t), 3);
          const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
          pts.push(`${cx + x * r / 17}px ${cy + y * r / 17 - r * 0.1}px`);
        }
        return `polygon(${pts.join(', ')})`;
      }
      case 'diamond': {
        return `polygon(${cx}px ${cy - min*0.48}px, ${cx + min*0.48}px ${cy}px, ${cx}px ${cy + min*0.48}px, ${cx - min*0.48}px ${cy}px)`;
      }
      case 'torn':
        return generateTornPath();
      default:
        return '';
    }
  }
  const TEXT_PHRASES = ['Dream big', 'Make it happen', 'You got this', 'Believe', 'Manifest it'];
  const INTENTION_PROMPTS = [
    'What does this represent for you?',
    'Why does this inspire you?',
    'How does this connect to your goals?',
    'What feeling does this bring up?',
    'What would achieving this mean to you?',
  ];

  // ===== State =====
  let elements = [];
  let selectedId = null;
  let nextId = 1;
  let maxZ = 0;
  let currentBg = BACKGROUNDS[0];
  let sidebarTab = null;
  let searchTimeout = null;
  let saveTimeout = null;
  let mode = 'freeform'; // 'intentional' or 'freeform'
  let pendingElement = null; // element waiting for intention note
  let intentionsPanelOpen = false;
  let showIntentionsOnBoard = false;
  let undoStack = []; // history of states for undo
  const MAX_UNDO = 30;

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
  const btnIntentions = $('#btn-intentions');
  const welcomeModal = $('#welcome-modal');
  const intentionModal = $('#intention-modal');
  const intentionInput = $('#intention-input');
  const intentionPromptText = $('#intention-prompt-text');
  const intentionsPanel = $('#intentions-panel');
  const intentionsList = $('#intentions-list');
  const intentionsCount = $('#intentions-count');
  const intentionsEmpty = $('#intentions-empty');

  // ===== Init =====
  function init() {
    loadBoard();
    renderStickers();
    renderBackgrounds();
    bindEvents();
    updateUI();

    // Show welcome modal if no mode has been chosen yet
    if (!localStorage.getItem('visionbort-mode')) {
      welcomeModal.classList.remove('hidden');
    } else {
      mode = localStorage.getItem('visionbort-mode') || 'freeform';
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
        customBgImage,
        boardTitle: boardTitle.value,
        mode,
        showIntentionsOnBoard,
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
      if (data.mode) mode = data.mode;
      if (data.customBgImage) customBgImage = data.customBgImage;
      if (data.showIntentionsOnBoard) {
        showIntentionsOnBoard = true;
        canvas.classList.add('show-intentions');
        const toggle = $('#toggle-show-intentions');
        if (toggle) toggle.checked = true;
      }
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
    customBgImage = null;
    currentBg = BACKGROUNDS[0];
    applyBackground();
    canvas.querySelectorAll('.canvas-element').forEach(el => el.remove());
    // Clear any active drawing
    const drawCanvas = $('#draw-canvas');
    if (drawCanvas) {
      const ctx = drawCanvas.getContext('2d');
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }
    drawStrokes = [];
    if (!$('#draw-overlay').classList.contains('hidden')) {
      $('#draw-overlay').classList.add('hidden');
      $('#toolbar-bottom').style.display = 'flex';
    }
    drawCtx = null;
    localStorage.removeItem('visionbort-mode');
    localStorage.removeItem(STORAGE_KEY);
    if (intentionsPanelOpen) {
      intentionsPanelOpen = false;
      intentionsPanel.classList.add('hidden');
      btnIntentions.classList.remove('active-outline');
    }
    closeSidebar();
    updateUI();
    welcomeModal.classList.remove('hidden');
  }

  // ===== Undo =====
  function pushUndo() {
    const snapshot = {
      elements: JSON.parse(JSON.stringify(elements)),
      customBgImage: customBgImage ? { ...customBgImage } : null,
      bgId: currentBg.id,
      nextId,
      maxZ,
    };
    undoStack.push(snapshot);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    updateUndoButton();
  }

  function undo() {
    if (undoStack.length === 0) return;
    const snapshot = undoStack.pop();

    // Restore state
    elements = snapshot.elements;
    customBgImage = snapshot.customBgImage;
    const bg = BACKGROUNDS.find(b => b.id === snapshot.bgId);
    if (bg) currentBg = bg;
    nextId = snapshot.nextId;
    maxZ = snapshot.maxZ;
    selectedId = null;

    // Re-render all elements
    canvas.querySelectorAll('.canvas-element').forEach(el => el.remove());
    elements.forEach(el => renderElement(el));
    applyBackground();
    updateUI();
    updateUndoButton();
    saveBoard();
  }

  function updateUndoButton() {
    const btn = $('#btn-undo');
    btn.style.display = undoStack.length > 0 ? 'inline-flex' : 'none';
  }

  // ===== Element CRUD =====
  function addElement(props) {
    if (mode === 'intentional' && !props._skipIntention && props.type !== 'text') {
      // Show intention prompt before adding
      pendingElement = { ...props };
      intentionPromptText.textContent = INTENTION_PROMPTS[Math.floor(Math.random() * INTENTION_PROMPTS.length)];
      intentionInput.value = '';
      // Show "use as background" toggle only for images
      const bgToggleWrap = $('#bg-toggle-wrap');
      const bgCheckbox = $('#intention-set-bg');
      if (props.type === 'image') {
        bgToggleWrap.classList.remove('hidden');
        bgCheckbox.checked = false;
      } else {
        bgToggleWrap.classList.add('hidden');
      }
      intentionModal.classList.remove('hidden');
      setTimeout(() => intentionInput.focus(), 100);
      return null;
    }

    delete props._skipIntention;
    pushUndo();
    // Ensure new element is always on top
    maxZ = Math.max(maxZ, ...elements.map(e => e.zIndex || 0)) + 1;
    const el = {
      id: 'el-' + nextId++,
      x: props.x ?? randomInt(40, canvasContainer.offsetWidth - (props.width || 200) - 40),
      y: props.y ?? randomInt(40, canvasContainer.offsetHeight - (props.height || 200) - 40),
      width: props.width || 200,
      height: props.height || 200,
      rotation: props.rotation ?? randomInt(-8, 8),
      zIndex: maxZ,
      intention: props.intention || '',
      ...props,
      zIndex: maxZ, // ensure this isn't overridden by spread
    };
    elements.push(el);
    renderElement(el);
    selectElement(el.id);
    updateUI();
    renderIntentionsPanel();
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
    pushUndo();
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
      if (el.clipShape === 'polaroid') {
        const frame = document.createElement('div');
        frame.className = 'polaroid-frame';
        const img = document.createElement('img');
        img.src = el.src;
        img.draggable = false;
        img.alt = el.label || '';
        frame.appendChild(img);
        content.appendChild(frame);
      } else {
        const img = document.createElement('img');
        img.src = el.src;
        img.draggable = false;
        img.alt = el.label || '';
        if (el.clipShape && el.clipPath) {
          img.style.clipPath = el.clipPath;
        }
        content.appendChild(img);
      }
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

    // Intention tooltip
    if (el.intention) {
      dom.title = el.intention;
      // Add or update intention label for export
      let intentLabel = dom.querySelector('.intention-label');
      if (!intentLabel) {
        intentLabel = document.createElement('div');
        intentLabel.className = 'intention-label';
        dom.querySelector('.element-content').appendChild(intentLabel);
      }
      intentLabel.textContent = el.intention;
    } else {
      dom.title = '';
      const existing = dom.querySelector('.intention-label');
      if (existing) existing.remove();
    }

    // Clip path / polaroid for images
    if (el.type === 'image') {
      const hasPolaroid = !!dom.querySelector('.polaroid-frame');
      const needsPolaroid = el.clipShape === 'polaroid';
      if (hasPolaroid !== needsPolaroid) {
        // Structure changed, re-render
        renderElement(el);
        return;
      }
      if (!needsPolaroid) {
        const img = dom.querySelector('img');
        if (img) img.style.clipPath = (el.clipShape && el.clipPath) ? el.clipPath : '';
      }
    }

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

    // Image-specific actions
    if (el.type === 'image') {
      // Shape clipping
      const shapeBtn = makeActionBtn(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 19 8.5 17 17.5 7 17.5 5 8.5"/></svg>',
        'Change shape',
        () => toggleShapeSelector(actions, el.id)
      );
      actions.appendChild(shapeBtn);
    }

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

  function toggleShapeSelector(actionsEl, elId) {
    let dropdown = actionsEl.querySelector('.font-selector');
    if (dropdown) {
      dropdown.classList.toggle('hidden');
      return;
    }
    dropdown = document.createElement('div');
    dropdown.className = 'font-selector';
    const el = elements.find(e => e.id === elId);
    CLIP_SHAPES.forEach(shape => {
      const btn = document.createElement('button');
      btn.className = 'font-option';
      if (el && el.clipShape === shape.id) btn.classList.add('active');
      btn.textContent = shape.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (shape.id === 'none') {
          updateElement(elId, { clipShape: null, clipPath: '' });
        } else if (shape.id === 'polaroid') {
          // Make it square-ish for polaroid
          const size = Math.max(el.width, el.height);
          updateElement(elId, { clipShape: 'polaroid', clipPath: '', width: size, height: size * 1.15 });
        } else {
          const clipPath = getClipPath(shape.id, el.width, el.height);
          updateElement(elId, { clipShape: shape.id, clipPath });
        }
        dropdown.classList.add('hidden');
        selectElement(elId);
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
      // Auto-open intentions panel if it's closed and mode is intentional (desktop only)
      const isMobile = window.innerWidth <= 768;
      if (!intentionsPanelOpen && mode === 'intentional' && !isMobile) {
        intentionsPanelOpen = true;
        intentionsPanel.classList.remove('hidden');
        btnIntentions.classList.add('active-outline');
      }
      if (intentionsPanelOpen) {
        renderIntentionsPanel();
        // Scroll to selected item
        const selectedItem = intentionsList.querySelector('.intention-item.selected');
        if (selectedItem) selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    if (resizeState) {
      // Recalculate clip path for new dimensions
      const el = elements.find(e => e.id === resizeState.id);
      if (el && el.clipShape) {
        el.clipPath = getClipPath(el.clipShape, el.width, el.height);
        const dom = canvas.querySelector(`[data-id="${el.id}"]`);
        if (dom) applyElementStyle(dom, el);
      }
    }
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
      if (intentionsPanelOpen) renderIntentionsPanel();
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

  let nextFontIndex = 0;

  function addText() {
    const phrase = TEXT_PHRASES[Math.floor(Math.random() * TEXT_PHRASES.length)];
    const font = FONTS[nextFontIndex % FONTS.length];
    nextFontIndex++;
    const darkBgs = ['midnight'];
    const textColor = darkBgs.includes(currentBg.id) ? '#f8fafc' : '#1a1a2e';
    addElement({
      type: 'text',
      content: phrase,
      fontSize: 32,
      fontFamily: font.family,
      color: textColor,
      fontWeight: 'bold',
      fontStyle: 'normal',
      width: 220,
      height: 60,
      rotation: 0,
    });
  }

  // ===== Background =====
  const BG_STYLES = {
    warm: '#faf9f6',
    cork: '#d4b896',
    midnight: '#1a1a2e',
    blush: 'linear-gradient(to bottom right, #fce4ec, #f3e5f5)',
    ocean: 'linear-gradient(to bottom right, #e0f7fa, #e8eaf6)',
    sunset: 'linear-gradient(to bottom right, #fff3e0, #fce4ec)',
    forest: 'linear-gradient(to bottom right, #e8f5e9, #f1f8e9)',
    lavender: 'linear-gradient(to bottom right, #ede7f6, #e8eaf6)',
  };

  let customBgImage = null; // { src, intention }

  function applyBackground() {
    if (customBgImage) {
      canvas.style.background = `url("${customBgImage.src}") center/cover no-repeat`;
    } else {
      const style = BG_STYLES[currentBg.id] || '#faf9f6';
      canvas.style.background = style;
    }
    // Update bg grid selection
    document.querySelectorAll('.bg-card').forEach(card => {
      card.classList.toggle('active', !customBgImage && card.dataset.bgId === currentBg.id);
    });
  }

  function setImageBackground(src, intention) {
    pushUndo();
    customBgImage = { src, intention: intention || '' };
    applyBackground();
    updateUI();
    saveBoard();
  }

  function clearImageBackground() {
    customBgImage = null;
    applyBackground();
    saveBoard();
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
          if (window.innerWidth <= 768) closeSidebar();
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

  // ===== Background Search =====
  async function searchBgImages(query) {
    if (!UNSPLASH_PROXY) return;
    const resultsDiv = $('#bg-search-results');
    resultsDiv.innerHTML = '<div class="panel-empty"><div class="spinner"></div><p>Searching...</p></div>';

    try {
      const res = await fetch(`${UNSPLASH_PROXY}/search?query=${encodeURIComponent(query)}&per_page=12`);
      const data = await res.json();
      resultsDiv.innerHTML = '';

      if (!data.results || data.results.length === 0) {
        resultsDiv.innerHTML = '<div class="panel-empty"><p>No images found</p></div>';
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
          setImageBackground(photo.urls.regular, '');
          if (window.innerWidth <= 768) closeSidebar();
        });
        resultsDiv.appendChild(item);
      });
    } catch (e) {
      resultsDiv.innerHTML = '<div class="panel-empty"><p>Search failed</p></div>';
    }
  }

  // ===== Export =====
  function renderAsWallpaper(sourceDataUrl) {
    return new Promise((resolve) => {
      const WALLPAPER_W = 1170;
      const WALLPAPER_H = 2532;

      const img = new Image();
      img.onload = () => {
        const wpCanvas = document.createElement('canvas');
        wpCanvas.width = WALLPAPER_W;
        wpCanvas.height = WALLPAPER_H;
        const ctx = wpCanvas.getContext('2d');

        // Fill background with the current canvas background
        if (customBgImage) {
          // Draw custom bg image to fill
          const bgImg = new Image();
          bgImg.onload = () => {
            // Cover fill
            const scale = Math.max(WALLPAPER_W / bgImg.width, WALLPAPER_H / bgImg.height);
            const w = bgImg.width * scale;
            const h = bgImg.height * scale;
            ctx.drawImage(bgImg, (WALLPAPER_W - w) / 2, (WALLPAPER_H - h) / 2, w, h);
            // Draw board content centered
            drawBoardOnWallpaper(ctx, img, WALLPAPER_W, WALLPAPER_H);
            resolve(wpCanvas.toDataURL('image/png'));
          };
          bgImg.src = customBgImage.src;
        } else {
          // Solid/gradient background — sample from the canvas style
          const bgStyle = BG_STYLES[currentBg.id] || '#faf9f6';
          if (bgStyle.includes('gradient')) {
            // Parse gradient colors for a simple fill
            const colors = bgStyle.match(/#[a-fA-F0-9]{6}/g) || ['#faf9f6'];
            const grad = ctx.createLinearGradient(0, 0, WALLPAPER_W, WALLPAPER_H);
            colors.forEach((c, i) => grad.addColorStop(i / Math.max(colors.length - 1, 1), c));
            ctx.fillStyle = grad;
          } else {
            ctx.fillStyle = bgStyle;
          }
          ctx.fillRect(0, 0, WALLPAPER_W, WALLPAPER_H);
          // Draw board content centered
          drawBoardOnWallpaper(ctx, img, WALLPAPER_W, WALLPAPER_H);
          resolve(wpCanvas.toDataURL('image/png'));
        }
      };
      img.src = sourceDataUrl;
    });
  }

  function drawBoardOnWallpaper(ctx, sourceImg, wpW, wpH) {
    // Scale the board to fit the wallpaper width with some padding
    const padding = wpW * 0.05;
    const availW = wpW - padding * 2;
    const scale = availW / sourceImg.width;
    const drawW = sourceImg.width * scale;
    const drawH = sourceImg.height * scale;
    // Center vertically
    const x = (wpW - drawW) / 2;
    const y = (wpH - drawH) / 2;
    ctx.drawImage(sourceImg, x, y, drawW, drawH);
  }

  async function exportBoard() {
    const hasContent = elements.length > 0 || customBgImage;
    if (!hasContent) return;

    const isMobile = window.innerWidth <= 768;

    // Deselect and close sidebars to show full canvas
    const prevSelected = selectedId;
    selectElement(null);
    const sidebarWasOpen = sidebarTab;
    const intentionsWasOpen = intentionsPanelOpen;
    if (sidebarTab) closeSidebar();
    if (intentionsPanelOpen) {
      intentionsPanelOpen = false;
      intentionsPanel.classList.add('hidden');
      btnIntentions.classList.remove('active-outline');
    }

    // Hide empty state and show intention labels for export
    emptyState.classList.add('hidden');
    canvas.querySelectorAll('.intention-label').forEach(l => l.style.opacity = '1');

    try {
      // Capture the canvas as-is
      const canvasDataUrl = await htmlToImage.toPng(canvas, {
        quality: 1,
        pixelRatio: 2,
        filter: (node) => {
          if (node.dataset && node.dataset.noExport !== undefined) return false;
          return true;
        },
      });

      let finalDataUrl = canvasDataUrl;

      // On mobile, render into wallpaper dimensions
      if (isMobile) {
        finalDataUrl = await renderAsWallpaper(canvasDataUrl);
      }

      const link = document.createElement('a');
      link.download = `${boardTitle.value || 'vision-board'}${isMobile ? '-wallpaper' : ''}.png`;
      link.href = finalDataUrl;
      link.click();
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed. Try again.');
    }

    // Reset intention labels to hover-only
    canvas.querySelectorAll('.intention-label').forEach(l => l.style.opacity = '');

    // Restore sidebars
    if (sidebarWasOpen) openSidebar(sidebarWasOpen);
    if (intentionsWasOpen) {
      intentionsPanelOpen = true;
      intentionsPanel.classList.remove('hidden');
      btnIntentions.classList.add('active-outline');
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
      btn.addEventListener('click', () => {
        addSticker(emoji);
        if (window.innerWidth <= 768) closeSidebar();
      });
      grid.appendChild(btn);
    });
  }

  function renderBackgrounds() {
    const grid = $('#bg-grid');
    const darkBgs = ['midnight', 'cork'];
    BACKGROUNDS.forEach(bg => {
      const card = document.createElement('div');
      card.className = 'bg-card';
      card.style.background = BG_STYLES[bg.id] || '#faf9f6';
      card.dataset.bgId = bg.id;
      if (bg.id === currentBg.id) card.classList.add('active');

      const label = document.createElement('span');
      label.className = 'bg-card-label';
      label.textContent = bg.label;
      if (darkBgs.includes(bg.id)) {
        label.style.color = 'rgba(255,255,255,0.7)';
        label.style.textShadow = '0 1px 2px rgba(0,0,0,0.4)';
      }
      card.appendChild(label);

      const check = document.createElement('div');
      check.className = 'check-mark';
      check.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
      card.appendChild(check);

      card.addEventListener('click', () => {
        currentBg = bg;
        customBgImage = null; // Clear custom image when picking a preset
        applyBackground();
        saveBoard();
        if (window.innerWidth <= 768) closeSidebar();
      });

      grid.appendChild(card);
    });
  }

  // ===== UI Updates =====
  function updateUI() {
    const hasContent = elements.length > 0 || customBgImage;
    emptyState.classList.toggle('hidden', hasContent);
    btnClear.style.display = hasContent ? 'inline-flex' : 'none';
    btnExport.disabled = !hasContent;
    btnIntentions.style.display = hasContent ? 'inline-flex' : 'none';
    if (intentionsPanelOpen) renderIntentionsPanel();
  }

  // ===== Event Binding =====
  function bindEvents() {
    // Welcome modal — mode selection
    $('#welcome-intentional').addEventListener('click', () => {
      mode = 'intentional';
      welcomeModal.classList.add('hidden');
      localStorage.setItem('visionbort-mode', 'intentional');
      saveBoard();
    });
    $('#welcome-freeform').addEventListener('click', () => {
      mode = 'freeform';
      welcomeModal.classList.add('hidden');
      localStorage.setItem('visionbort-mode', 'freeform');
      saveBoard();
    });

    // Intention prompt
    $('#intention-save').addEventListener('click', () => {
      commitPendingElement(intentionInput.value.trim());
    });
    $('#intention-skip').addEventListener('click', () => {
      commitPendingElement('');
    });
    intentionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitPendingElement(intentionInput.value.trim());
      }
    });

    // Intentions panel toggle
    btnIntentions.addEventListener('click', toggleIntentionsPanel);

    // Show intentions on board toggle
    $('#toggle-show-intentions').addEventListener('change', (e) => {
      showIntentionsOnBoard = e.target.checked;
      canvas.classList.toggle('show-intentions', showIntentionsOnBoard);
      saveBoard();
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
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        undo();
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
    $('#tool-draw').addEventListener('click', () => enterDrawMode());
    $('#tool-text').addEventListener('click', () => addText());
    $('#tool-backgrounds').addEventListener('click', () => openSidebar('backgrounds'));

    // Background upload
    const bgFileInput = $('#bg-file-input');
    $('#bg-upload').addEventListener('click', () => bgFileInput.click());
    bgFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImageBackground(ev.target.result, '');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    // Background search
    const bgSearchWrap = $('#bg-search-wrap');
    $('#bg-search').addEventListener('click', () => {
      bgSearchWrap.classList.toggle('hidden');
      if (!bgSearchWrap.classList.contains('hidden')) {
        setTimeout(() => $('#bg-search-input').focus(), 100);
      }
    });

    let bgSearchTimeout = null;
    $('#bg-search-input').addEventListener('input', (e) => {
      clearTimeout(bgSearchTimeout);
      const query = e.target.value.trim();
      if (query.length < 2) return;
      bgSearchTimeout = setTimeout(() => searchBgImages(query), 400);
    });

    // Drawing toolbar
    $('#draw-done').addEventListener('click', () => exitDrawMode(true));
    $('#draw-cancel').addEventListener('click', () => exitDrawMode(false));
    $('#draw-undo').addEventListener('click', drawUndo);
    document.querySelectorAll('.stroke-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        drawSize = parseInt(btn.dataset.size);
        document.querySelectorAll('.stroke-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Top toolbar
    btnClear.addEventListener('click', clearBoard);
    $('#btn-undo').addEventListener('click', undo);
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

  // ===== Drawing =====
  let isDrawing = false;
  let drawCtx = null;
  let drawStrokes = []; // array of stroke arrays for undo
  let currentStroke = [];
  let drawColor = '#ffffff';
  let drawSize = 6;
  const DRAW_COLORS = [
    '#ffffff', '#000000', '#ef4444', '#f97316', '#facc15',
    '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#06b6d4',
  ];

  function enterDrawMode() {
    const overlay = $('#draw-overlay');
    const drawCanvas = $('#draw-canvas');
    overlay.classList.remove('hidden');
    emptyState.classList.add('hidden');
    $('#toolbar-bottom').style.display = 'none';

    // Size canvas to match container
    const rect = overlay.getBoundingClientRect();
    drawCanvas.width = rect.width * 2; // retina
    drawCanvas.height = rect.height * 2;
    drawCanvas.style.width = rect.width + 'px';
    drawCanvas.style.height = rect.height + 'px';

    drawCtx = drawCanvas.getContext('2d');
    drawCtx.scale(2, 2);
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';
    drawStrokes = [];
    currentStroke = [];

    // Render color swatches
    const colorRow = $('#draw-colors');
    colorRow.innerHTML = '';
    DRAW_COLORS.forEach(c => {
      const swatch = document.createElement('button');
      swatch.className = 'draw-color-swatch';
      if (c === drawColor) swatch.classList.add('active');
      swatch.style.background = c;
      if (c === '#ffffff') swatch.style.border = '2px solid #d1d5db';
      swatch.addEventListener('click', () => {
        drawColor = c;
        colorRow.querySelectorAll('.draw-color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        if (c === '#ffffff') swatch.style.border = '';
      });
      colorRow.appendChild(swatch);
    });

    // Pointer events
    drawCanvas.addEventListener('pointerdown', drawStart);
    drawCanvas.addEventListener('pointermove', drawMove);
    drawCanvas.addEventListener('pointerup', drawEnd);
    drawCanvas.addEventListener('pointerleave', drawEnd);
  }

  function exitDrawMode(save) {
    const overlay = $('#draw-overlay');
    const drawCanvas = $('#draw-canvas');

    drawCanvas.removeEventListener('pointerdown', drawStart);
    drawCanvas.removeEventListener('pointermove', drawMove);
    drawCanvas.removeEventListener('pointerup', drawEnd);
    drawCanvas.removeEventListener('pointerleave', drawEnd);

    if (save && drawStrokes.length > 0) {
      // Calculate bounding box of all strokes
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      drawStrokes.forEach(stroke => {
        const pad = stroke.size * 3; // account for glow
        stroke.points.forEach(pt => {
          minX = Math.min(minX, pt.x - pad);
          minY = Math.min(minY, pt.y - pad);
          maxX = Math.max(maxX, pt.x + pad);
          maxY = Math.max(maxY, pt.y + pad);
        });
      });
      minX = Math.max(0, minX);
      minY = Math.max(0, minY);
      const cropW = maxX - minX;
      const cropH = maxY - minY;

      // Create a cropped canvas
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropW * 2;
      cropCanvas.height = cropH * 2;
      const cropCtx = cropCanvas.getContext('2d');
      cropCtx.scale(2, 2);
      cropCtx.lineCap = 'round';
      cropCtx.lineJoin = 'round';

      // Redraw strokes offset to the crop origin
      drawStrokes.forEach(stroke => {
        cropCtx.strokeStyle = stroke.color;
        cropCtx.lineWidth = stroke.size;
        cropCtx.shadowColor = stroke.color;
        cropCtx.shadowBlur = stroke.size * 2;
        cropCtx.beginPath();
        stroke.points.forEach((pt, i) => {
          const x = pt.x - minX;
          const y = pt.y - minY;
          if (i === 0) cropCtx.moveTo(x, y);
          else {
            cropCtx.lineTo(x, y);
            cropCtx.stroke();
            cropCtx.beginPath();
            cropCtx.moveTo(x, y);
          }
        });
      });

      const dataUrl = cropCanvas.toDataURL('image/png');

      overlay.classList.add('hidden');
      $('#toolbar-bottom').style.display = 'flex';

      addElement({
        type: 'image',
        src: dataUrl,
        x: Math.round(minX),
        y: Math.round(minY),
        width: Math.round(cropW),
        height: Math.round(cropH),
        rotation: 0,
        label: 'Drawing',
      });
    } else {
      overlay.classList.add('hidden');
      $('#toolbar-bottom').style.display = 'flex';
    }

    drawCtx = null;
  }

  function drawStart(e) {
    isDrawing = true;
    btnClear.style.display = 'inline-flex';
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    currentStroke = [{ x, y }];
    drawCtx.strokeStyle = drawColor;
    drawCtx.lineWidth = drawSize;
    drawCtx.shadowColor = drawColor;
    drawCtx.shadowBlur = drawSize * 2;
    drawCtx.beginPath();
    drawCtx.moveTo(x, y);
  }

  function drawMove(e) {
    if (!isDrawing) return;
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    currentStroke.push({ x, y });
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
    drawCtx.beginPath();
    drawCtx.moveTo(x, y);
  }

  function drawEnd() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentStroke.length > 0) {
      drawStrokes.push({ points: currentStroke, color: drawColor, size: drawSize });
      currentStroke = [];
    }
  }

  function drawUndo() {
    if (drawStrokes.length === 0) return;
    drawStrokes.pop();
    redrawStrokes();
  }

  function redrawStrokes() {
    const drawCanvas = $('#draw-canvas');
    const rect = drawCanvas.getBoundingClientRect();
    drawCtx.clearRect(0, 0, rect.width, rect.height);
    drawStrokes.forEach(stroke => {
      drawCtx.strokeStyle = stroke.color;
      drawCtx.lineWidth = stroke.size;
      drawCtx.shadowColor = stroke.color;
      drawCtx.shadowBlur = stroke.size * 2;
      drawCtx.beginPath();
      stroke.points.forEach((pt, i) => {
        if (i === 0) drawCtx.moveTo(pt.x, pt.y);
        else {
          drawCtx.lineTo(pt.x, pt.y);
          drawCtx.stroke();
          drawCtx.beginPath();
          drawCtx.moveTo(pt.x, pt.y);
        }
      });
    });
  }

  // ===== Intentions =====
  function commitPendingElement(intention) {
    if (!pendingElement) return;
    const setAsBg = $('#intention-set-bg').checked && pendingElement.type === 'image';
    if (setAsBg) {
      setImageBackground(pendingElement.src, intention || '');
      pendingElement = null;
      intentionModal.classList.add('hidden');
      return;
    }
    pendingElement.intention = intention || '';
    pendingElement._skipIntention = true;
    addElement(pendingElement);
    pendingElement = null;
    intentionModal.classList.add('hidden');
  }

  function renderIntentionsPanel() {
    if (!intentionsList) return;
    // Don't rebuild if user is editing an intention
    const activeEl = document.activeElement;
    if (activeEl && activeEl.classList.contains('intention-edit')) return;
    intentionsList.innerHTML = '';

    const withNotes = elements.filter(e => e.intention);
    intentionsCount.textContent = `${withNotes.length} / ${elements.length}`;
    intentionsEmpty.classList.toggle('hidden', elements.length > 0);

    elements.forEach(el => {
      const item = document.createElement('div');
      item.className = 'intention-item';
      if (el.id === selectedId) item.classList.add('selected');

      const preview = document.createElement('div');
      preview.className = 'intention-item-preview';

      const thumb = document.createElement('div');
      thumb.className = 'intention-thumb';
      if (el.type === 'image') {
        const img = document.createElement('img');
        img.src = el.src;
        img.alt = '';
        thumb.appendChild(img);
      } else if (el.type === 'sticker') {
        thumb.textContent = el.src;
      } else if (el.type === 'text') {
        thumb.textContent = 'T';
        thumb.style.fontWeight = '700';
        thumb.style.color = '#6b7280';
        thumb.style.fontSize = '16px';
      }
      preview.appendChild(thumb);

      const label = document.createElement('span');
      label.className = 'intention-item-label';
      if (el.type === 'text') label.textContent = el.content;
      else if (el.type === 'sticker') label.textContent = stickerName(el.src);
      else label.textContent = el.label || 'Image';
      preview.appendChild(label);

      item.appendChild(preview);

      // Editable intention textarea
      const noteWrap = document.createElement('div');
      noteWrap.className = 'intention-edit-wrap';
      const textarea = document.createElement('textarea');
      textarea.className = 'intention-edit';
      textarea.placeholder = 'Add an intention...';
      textarea.value = el.intention || '';
      textarea.rows = 2;
      textarea.addEventListener('input', () => {
        updateElement(el.id, { intention: textarea.value });
      });
      textarea.addEventListener('blur', () => {
        updateElement(el.id, { intention: textarea.value.trim() });
      });
      textarea.addEventListener('pointerdown', (e) => e.stopPropagation());
      textarea.addEventListener('click', (e) => e.stopPropagation());
      textarea.addEventListener('focus', (e) => e.stopPropagation());
      noteWrap.appendChild(textarea);
      item.appendChild(noteWrap);

      item.addEventListener('click', (e) => {
        // Don't re-select if clicking inside the textarea
        if (e.target.closest('.intention-edit')) return;
        selectElement(el.id);
      });
      intentionsList.appendChild(item);
    });
  }

  // Give stickers friendly names instead of showing duplicate emojis
  const STICKER_NAMES = {
    '⭐':'Star','✨':'Sparkles','💫':'Dizzy','🌟':'Glow','💖':'Heart','🔥':'Fire',
    '🌈':'Rainbow','🎯':'Target','🏆':'Trophy','💪':'Strength','🚀':'Rocket','🌸':'Blossom',
    '🦋':'Butterfly','🌺':'Hibiscus','🍀':'Clover','💎':'Gem','👑':'Crown','🎨':'Art',
    '🎵':'Music','📸':'Camera','✈️':'Travel','🏠':'Home','🌍':'World','💰':'Wealth',
    '📚':'Books','🧘':'Zen','❤️':'Love','🎉':'Party','🌅':'Sunrise','🏔️':'Mountain',
    '🌊':'Wave','🎭':'Theater','🥂':'Cheers','🎓':'Graduate','💐':'Bouquet','🕊️':'Peace',
    '🌻':'Sunflower','⚡':'Energy','🎪':'Circus','🗝️':'Key'
  };
  function stickerName(emoji) {
    return STICKER_NAMES[emoji] || 'Sticker';
  }

  function toggleIntentionsPanel() {
    intentionsPanelOpen = !intentionsPanelOpen;
    intentionsPanel.classList.toggle('hidden', !intentionsPanelOpen);
    btnIntentions.classList.toggle('active-outline', intentionsPanelOpen);
    if (intentionsPanelOpen) renderIntentionsPanel();
  }

  // ===== Helpers =====
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generateTornPath() {
    const pts = [];
    const steps = 16;
    // Top edge — subtle tear (1-3% variation)
    for (let i = 0; i <= steps; i++) pts.push(`${(i/steps*100).toFixed(1)}% ${randomInt(0,3)}%`);
    // Right edge
    for (let i = 1; i <= steps; i++) pts.push(`${randomInt(97,100)}% ${(i/steps*100).toFixed(1)}%`);
    // Bottom edge
    for (let i = steps; i >= 0; i--) pts.push(`${(i/steps*100).toFixed(1)}% ${randomInt(97,100)}%`);
    // Left edge
    for (let i = steps - 1; i >= 1; i--) pts.push(`${randomInt(0,3)}% ${(i/steps*100).toFixed(1)}%`);
    return `polygon(${pts.join(', ')})`;
  }

  // ===== Boot =====
  init();
})();
