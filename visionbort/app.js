/* ===== Visionbort — Vanilla JS Vision Board ===== */

(function () {
  'use strict';

  // ===== Config =====
  const UNSPLASH_PROXY = 'https://unsplash-proxy.kevin-middleton.workers.dev';
  const STORAGE_KEY = 'visionbort-lite';
  const MAX_IMAGE_SIZE = 300;          // longest display edge, px
  const IMAGE_STORE_SCALE = 2;         // store at 2x display size (retina export)
  const IMAGE_STORE_QUALITY = 0.85;    // JPEG quality for re-encoded images
  const MAX_BG_STORE_SIZE = 2000;      // longest stored edge for canvas backgrounds
  const PLACEMENT_EDGE_INSET = 24;     // keep new items off the canvas edges
  const PLACEMENT_BOTTOM_INSET = 90;   // keep new items clear of the floating toolbar
  const MIN_VISIBLE = 40;              // px of an element that must stay on canvas
  const MAX_IMAGE_UNDO = 8;            // snapshots allowed to carry image bytes
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
  let quotaWarned = false; // avoid stacking identical quota toasts
  let modalReturnFocus = null;
  let relayoutTimer = null;

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
      openModal(welcomeModal, $('#welcome-intentional'));
    } else {
      mode = localStorage.getItem('visionbort-mode') || 'freeform';
      welcomeModal.classList.add('hidden');
    }
  }

  // ===== Toasts =====
  // Storage and export failures used to go to console.warn only, which is
  // invisible to anyone actually using the app.
  function showToast(message, kind, ms) {
    const region = $('#toast-region');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = 'toast' + (kind === 'error' ? ' error' : '');
    toast.textContent = message;
    region.appendChild(toast);
    setTimeout(() => toast.remove(), ms || 4500);
  }

  // ===== Modals =====
  function openModal(overlay, focusTarget) {
    modalReturnFocus = document.activeElement;
    overlay.classList.remove('hidden');
    setTimeout(() => {
      const target = focusTarget || overlay.querySelector('button, textarea, input, [href]');
      if (target) target.focus();
    }, 60);
  }

  function closeModal(overlay) {
    overlay.classList.add('hidden');
    if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') {
      try { modalReturnFocus.focus(); } catch (e) { /* element may be gone */ }
    }
    modalReturnFocus = null;
  }

  function openModalOverlay() {
    if (!intentionModal.classList.contains('hidden')) return intentionModal;
    if (!welcomeModal.classList.contains('hidden')) return welcomeModal;
    return null;
  }

  // aria-modal is a promise that Tab stays inside the dialog. Keep it.
  function trapFocus(container, e) {
    const nodes = Array.from(container.querySelectorAll(
      'button, [href], input:not([type="hidden"]), textarea, select, [tabindex]:not([tabindex="-1"])'
    )).filter(n => !n.disabled && n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ===== Geometry =====
  // The canvas box shrinks when a side panel opens, so every placement and
  // clamp decision has to read the live rect rather than the window width.
  function canvasBounds() {
    const r = canvas.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }

  // Positions are stored as fractions of the canvas box (fx/fy) and multiplied
  // on render, so a board composed at 1280px still lands inside a 375px
  // viewport. el.x/el.y hold the resolved px for the current box; drag and
  // resize write px, then call syncFractions().
  function resolvePosition(el) {
    const b = canvasBounds();
    const x = typeof el.fx === 'number' ? el.fx * b.width : (el.x || 0);
    const y = typeof el.fy === 'number' ? el.fy * b.height : (el.y || 0);
    const clamped = clampPosition(x, y, el.width, el.height, b);
    el.x = clamped.x;
    el.y = clamped.y;
    return clamped;
  }

  function syncFractions(el) {
    const b = canvasBounds();
    if (b.width > 0) el.fx = el.x / b.width;
    if (b.height > 0) el.fy = el.y / b.height;
  }

  // Drag/render clamp: at least MIN_VISIBLE px stays on canvas on each axis, so
  // nothing can be dragged (or restored) somewhere it can never be grabbed again.
  function clampPosition(x, y, w, h, b) {
    b = b || canvasBounds();
    const minX = -(Math.max(w || 0, MIN_VISIBLE) - MIN_VISIBLE);
    const minY = -(Math.max(h || 0, MIN_VISIBLE) - MIN_VISIBLE);
    return {
      x: Math.min(Math.max(x, minX), Math.max(minX, b.width - MIN_VISIBLE)),
      y: Math.min(Math.max(y, minY), Math.max(minY, b.height - MIN_VISIBLE)),
    };
  }

  // Placement clamp is stricter: a brand-new item must be fully in view and
  // clear of the floating toolbar.
  function clampPlacement(x, y, w, h, b) {
    b = b || canvasBounds();
    const maxX = Math.max(PLACEMENT_EDGE_INSET, b.width - w - PLACEMENT_EDGE_INSET);
    const maxY = Math.max(PLACEMENT_EDGE_INSET, b.height - h - PLACEMENT_BOTTOM_INSET);
    return {
      x: Math.round(Math.min(Math.max(x, PLACEMENT_EDGE_INSET), maxX)),
      y: Math.round(Math.min(Math.max(y, PLACEMENT_EDGE_INSET), maxY)),
    };
  }

  // A caller-supplied position (a drawing, a duplicate) keeps its spot but is
  // pulled fully inside the canvas.
  function clampInside(x, y, w, h, b) {
    b = b || canvasBounds();
    return {
      x: Math.round(Math.min(Math.max(x, 0), Math.max(0, b.width - w))),
      y: Math.round(Math.min(Math.max(y, 0), Math.max(0, b.height - h))),
    };
  }

  // Deterministic phyllotaxis spiral outward from the middle of the usable
  // canvas. Replaces the random placement that regularly dropped the first item
  // off-canvas or under the toolbar.
  function nextPlacement(w, h) {
    const b = canvasBounds();
    const usableH = Math.max(h + PLACEMENT_EDGE_INSET * 2, b.height - PLACEMENT_BOTTOM_INSET);
    const n = elements.length;
    const step = Math.min(b.width, usableH) * 0.17;
    const angle = n * 2.39996323; // golden angle, radians
    const radius = step * Math.sqrt(n);
    const x = b.width / 2 + radius * Math.cos(angle) - w / 2;
    const y = usableH / 2 + radius * Math.sin(angle) - h / 2;
    return clampPlacement(x, y, w, h, b);
  }

  // Any panel that is about to open changes the canvas box, so settle panel
  // state BEFORE choosing a position. selectElement() used to open the 300px
  // Intentions panel after the position was already picked.
  function ensureModePanels() {
    const isMobile = window.innerWidth <= 768;
    if (!intentionsPanelOpen && mode === 'intentional' && !isMobile) {
      intentionsPanelOpen = true;
      intentionsPanel.classList.remove('hidden');
      btnIntentions.style.display = 'inline-flex';
      btnIntentions.classList.add('active-outline');
      void canvas.offsetWidth; // force reflow so the rect below is the new one
    }
  }

  // Re-resolve every element from its fractions. Called whenever the canvas box
  // changes: panel open/close, window resize, orientation change.
  function relayoutElements() {
    elements.forEach(el => {
      const dom = canvas.querySelector(`[data-id="${el.id}"]`);
      if (dom) applyElementStyle(dom, el);
    });
  }

  function scheduleRelayout() {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(relayoutElements, 60);
  }

  // ===== Persistence =====
  function saveBoard() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(writeBoard, 500);
  }

  function writeBoard() {
    const bounds = canvasBounds();
    const data = {
      // Elements carry their image data URLs so a reloaded board still renders
      // with no network. Those bytes are downscaled on the way in (prepareImage)
      // rather than stored at full resolution.
      elements: elements.map(el => ({ ...el })),
      backgroundId: currentBg.id,
      customBgImage,
      boardTitle: boardTitle.value,
      mode,
      showIntentionsOnBoard,
      nextId,
      maxZ,
      // Canvas size at save time, so pre-fraction boards can be migrated.
      canvasW: bounds.width,
      canvasH: bounds.height,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      quotaWarned = false;
    } catch (e) {
      console.warn('Save failed:', e);
      if (!quotaWarned) {
        quotaWarned = true;
        showToast(
          'This board is too large to save on this device. Recent changes will be lost if you reload. Deleting a couple of images will fix it.',
          'error',
          10000
        );
      }
    }
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

      // One-time migration: boards saved before fractional positions existed
      // only have px. Convert using the canvas size they were saved at.
      const live = canvasBounds();
      const savedW = data.canvasW || live.width;
      const savedH = data.canvasH || live.height;
      elements.forEach(el => {
        if (typeof el.fx !== 'number' && savedW > 0) el.fx = (el.x || 0) / savedW;
        if (typeof el.fy !== 'number' && savedH > 0) el.fy = (el.y || 0) / savedH;
      });

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
    openModal(welcomeModal, $('#welcome-intentional'));
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
    while (undoStack.length > MAX_UNDO) undoStack.shift();
    // Image bytes are heavy — 30 deep clones of a board full of photos is tens
    // of megabytes. Cap how many snapshots may carry them.
    while (undoStack.filter(snapshotHasImages).length > MAX_IMAGE_UNDO) undoStack.shift();
    updateUndoButton();
  }

  function isDataUrl(src) {
    return typeof src === 'string' && src.slice(0, 5) === 'data:';
  }

  function snapshotHasImages(snap) {
    if (snap.customBgImage && isDataUrl(snap.customBgImage.src)) return true;
    return snap.elements.some(el => el.type === 'image' && isDataUrl(el.src));
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
      openModal(intentionModal, intentionInput);
      return null;
    }

    delete props._skipIntention;

    // Settle panel state first: opening the Intentions panel narrows the canvas,
    // and placing before that is what pushed items off-screen.
    ensureModePanels();

    pushUndo();
    // Ensure new element is always on top
    maxZ = Math.max(maxZ, ...elements.map(e => e.zIndex || 0)) + 1;
    const width = props.width || 200;
    const height = props.height || 200;
    const spot = (props.x != null && props.y != null)
      ? clampInside(props.x, props.y, width, height)
      : nextPlacement(width, height);
    const el = {
      rotation: props.rotation ?? randomInt(-8, 8),
      intention: props.intention || '',
      ...props,
      id: 'el-' + nextId++,
      width,
      height,
      x: spot.x,
      y: spot.y,
      zIndex: maxZ, // ensure this isn't overridden by spread
    };
    syncFractions(el);
    elements.push(el);
    renderElement(el, true);
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
  // `animate` is opt-in: pop-in used to be baked into every render, so it
  // replayed on every page load and on every structural re-render.
  function renderElement(el, animate) {
    // Remove existing DOM if re-rendering
    const existing = canvas.querySelector(`[data-id="${el.id}"]`);
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'canvas-element' + (animate ? ' pop-in' : '');
    if (animate) {
      const clearPop = () => div.classList.remove('pop-in');
      div.addEventListener('animationend', clearPop, { once: true });
      // animationend never fires if the animation is paused (hidden tab) or
      // suppressed (prefers-reduced-motion), and the 0% keyframe is scale(0.5).
      // The timer guarantees the class comes off either way.
      setTimeout(clearPop, 600);
    }
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
    const pos = resolvePosition(el);
    dom.style.left = pos.x + 'px';
    dom.style.top = pos.y + 'px';
    dom.style.width = el.width + 'px';
    dom.style.height = el.height + 'px';
    dom.style.zIndex = el.zIndex;
    // --el-rot lets the pop-in keyframes carry the tilt instead of flattening it
    dom.style.setProperty('--el-rot', (el.rotation || 0) + 'deg');
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
      // Edit text button
      const editBtn = makeActionBtn(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        'Edit text',
        () => handleDoubleClick({ stopPropagation: () => {} }, el.id)
      );
      actions.appendChild(editBtn);

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
    positionActionBar(dom, el);
  }

  // Keep the action bar reachable. Above the element it slides under the fixed
  // top toolbar when the element sits near the canvas top, and centring it pushes
  // it past the canvas edge for elements near the left/right sides.
  function positionActionBar(dom, el) {
    const actions = dom.querySelector('.element-actions');
    if (!actions) return;
    const cvRect = canvas.getBoundingClientRect();
    const barH = actions.offsetHeight || 40;

    // Vertical: flip below when there is no room above.
    actions.classList.toggle('below', el.y < barH + 8);

    // Horizontal: start centred, then correct by the measured overflow. Measuring
    // rather than computing from el.x keeps this correct for rotated elements,
    // whose rendered bar is offset from the unrotated geometry. Two passes is
    // enough to converge.
    actions.classList.remove('shifted');
    actions.style.left = '50%';
    const inset = 4;
    for (let pass = 0; pass < 2; pass++) {
      const bar = actions.getBoundingClientRect();
      let shift = 0;
      if (bar.left < cvRect.left + inset) shift = (cvRect.left + inset) - bar.left;
      else if (bar.right > cvRect.right - inset) shift = (cvRect.right - inset) - bar.right;
      if (Math.abs(shift) < 0.5) break;
      const currentLeft = actions.classList.contains('shifted')
        ? parseFloat(actions.style.left) || 0
        : el.width / 2 - bar.width / 2;
      actions.classList.add('shifted');
      actions.style.left = (currentLeft + shift) + 'px';
    }
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
          const size = Math.min(el.width, el.height);
          updateElement(elId, { clipShape: 'polaroid', clipPath: '', width: size, height: size * 1.15 });
        } else if (shape.id === 'torn') {
          // Torn keeps original dimensions
          const clipPath = getClipPath('torn', el.width, el.height);
          updateElement(elId, { clipShape: 'torn', clipPath });
        } else {
          // Circle, star, heart, diamond — make square so shape isn't distorted
          const size = Math.min(el.width, el.height);
          const clipPath = getClipPath(shape.id, size, size);
          updateElement(elId, { clipShape: shape.id, clipPath, width: size, height: size });
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
          if (tc.textContent !== prevEl.content) pushUndo();
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
      const wasOpen = intentionsPanelOpen;
      ensureModePanels();
      if (!wasOpen && intentionsPanelOpen) relayoutElements();
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
    const wasSelected = selectedId === id;
    selectElement(id);

    const el = elements.find(e => e.id === id);
    if (!el) return;

    // On mobile, tap already-selected text to edit
    if (wasSelected && el.type === 'text' && window.innerWidth <= 768) {
      dragState = { id, tapToEdit: true, startX: e.clientX, startY: e.clientY };
      document.addEventListener('pointermove', handleDragMove);
      document.addEventListener('pointerup', handleDragEnd);
      return;
    }

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
    // The tap-to-edit state carries no origX/origY; running the drag maths
    // against it wrote `left: NaNpx`.
    if (dragState.tapToEdit) return;

    const el = elements.find(x => x.id === dragState.id);
    if (!el) return;

    // Snapshot on the first real movement, while the element still holds its
    // pre-drag position.
    if (!dragState.moved) {
      dragState.moved = true;
      pushUndo();
    }

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const spot = clampPosition(dragState.origX + dx, dragState.origY + dy, el.width, el.height);
    el.x = spot.x;
    el.y = spot.y;
    syncFractions(el);

    const dom = canvas.querySelector(`[data-id="${dragState.id}"]`);
    if (dom) {
      dom.style.left = el.x + 'px';
      dom.style.top = el.y + 'px';
      positionActionBar(dom, el);
    }
  }

  function handleDragEnd(e) {
    if (dragState) {
      // Check if this was a tap (barely moved) on a text element for edit
      if (dragState.tapToEdit && e) {
        const dx = Math.abs(e.clientX - dragState.startX);
        const dy = Math.abs(e.clientY - dragState.startY);
        if (dx < 5 && dy < 5) {
          handleDoubleClick({}, dragState.id);
        }
      }
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
    if (!resizeState.moved) {
      resizeState.moved = true;
      pushUndo(); // element still holds its pre-resize geometry
    }
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
    const spot = clampPosition(newX, newY, newW, newH);
    el.x = spot.x;
    el.y = spot.y;
    el.width = newW;
    el.height = newH;
    syncFractions(el);

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
    if (!rotateState.moved) {
      rotateState.moved = true;
      pushUndo(); // element still holds its pre-rotation angle
    }
    const { id, centerX, centerY, startAngle, origRotation } = rotateState;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const delta = (angle - startAngle) * (180 / Math.PI);
    const el = elements.find(e => e.id === id);
    if (!el) return;

    el.rotation = origRotation + delta;
    const dom = canvas.querySelector(`[data-id="${id}"]`);
    if (dom) {
      dom.style.setProperty('--el-rot', el.rotation + 'deg');
      dom.style.transform = `rotate(${el.rotation}deg)`;
    }
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
      const next = tc.textContent || 'Text';
      if (next !== el.content) pushUndo(); // snapshot still has the old string
      updateElement(id, { content: next });
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

  // Re-encode an image down to roughly 2x its display size before it can reach
  // localStorage. Storing originals is what blew the quota: a single Unsplash
  // add took the store from 395 to 264,316 characters.
  function prepareImage(src, maxW, maxH) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
          const targetW = Math.max(1, Math.round(img.naturalWidth * scale));
          const targetH = Math.max(1, Math.round(img.naturalHeight * scale));
          const off = document.createElement('canvas');
          off.width = targetW;
          off.height = targetH;
          const ctx = off.getContext('2d');
          ctx.drawImage(img, 0, 0, targetW, targetH);
          // JPEG flattens alpha, so keep PNG for anything that is see-through.
          resolve(hasTransparency(ctx, targetW, targetH)
            ? off.toDataURL('image/png')
            : off.toDataURL('image/jpeg', IMAGE_STORE_QUALITY));
        } catch (e) {
          resolve(src); // tainted canvas or unsupported codec — keep the original
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }

  function hasTransparency(ctx, w, h) {
    try {
      const data = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < data.length; i += 4 * 7) { // sample every 7th pixel
        if (data[i] < 250) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function measureImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('not an image'));
      img.src = src;
    });
  }

  function addImageFromFile(file) {
    readFileAsDataUrl(file)
      .then(measureImage)
      .then(img => {
        const ratio = Math.min(MAX_IMAGE_SIZE / img.width, MAX_IMAGE_SIZE / img.height, 1);
        const width = Math.round(img.width * ratio);
        const height = Math.round(img.height * ratio);
        return prepareImage(img.src, width * IMAGE_STORE_SCALE, height * IMAGE_STORE_SCALE)
          .then(src => addElement({ type: 'image', src, width, height, label: file.name }));
      })
      .catch(() => showToast('That file could not be read as an image.', 'error'));
  }

  function addImageFromUrl(url, w, h, label) {
    const ratio = Math.min(MAX_IMAGE_SIZE / (w || 300), MAX_IMAGE_SIZE / (h || 300), 1);
    const width = Math.round((w || 300) * ratio);
    const height = Math.round((h || 300) * ratio);

    // Convert to a data URL so export isn't blocked by CORS, then downscale.
    fetch(url)
      .then(res => res.blob())
      .then(readFileAsDataUrl)
      .then(dataUrl => prepareImage(dataUrl, width * IMAGE_STORE_SCALE, height * IMAGE_STORE_SCALE))
      .then(src => addElement({ type: 'image', src, width, height, label: label || '' }))
      .catch(() => {
        // Fallback to direct URL if fetch fails
        addElement({ type: 'image', src: url, width, height, label: label || '' });
      });
  }

  // Backgrounds cover the whole canvas, so they get their own (larger) budget.
  function prepareBackground(src) {
    const b = canvasBounds();
    const maxW = Math.min(MAX_BG_STORE_SIZE, Math.max(1200, Math.round(b.width * IMAGE_STORE_SCALE)));
    const maxH = Math.min(MAX_BG_STORE_SIZE, Math.max(1200, Math.round(b.height * IMAGE_STORE_SCALE)));
    return prepareImage(src, maxW, maxH);
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

  // ===== Search =====
  async function searchImages(query) {
    const resultsDiv = $('#search-results');
    const emptyDiv = $('#search-empty');
    const loadingDiv = $('#search-loading');

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
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'image-grid-item';
        const description = photo.alt_description || 'Untitled';
        item.setAttribute('aria-label', `Add image: ${description}, by ${photo.user.name}`);

        const img = document.createElement('img');
        img.src = photo.urls.small;
        img.alt = '';
        img.loading = 'lazy';
        item.appendChild(img);

        const credit = document.createElement('div');
        credit.className = 'credit';
        credit.textContent = photo.user.name;
        item.appendChild(credit);

        item.addEventListener('click', () => {
          // Carry the description through so the board element has a real alt
          addImageFromUrl(photo.urls.regular, photo.width, photo.height, photo.alt_description || '');
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
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'image-grid-item';
        const description = photo.alt_description || 'Untitled';
        item.setAttribute('aria-label', `Use as background: ${description}, by ${photo.user.name}`);
        const img = document.createElement('img');
        img.src = photo.urls.small;
        img.alt = '';
        img.loading = 'lazy';
        item.appendChild(img);
        const credit = document.createElement('div');
        credit.className = 'credit';
        credit.textContent = photo.user.name;
        item.appendChild(credit);
        item.addEventListener('click', () => {
          // Convert to data URL for export compatibility, downscaled for storage
          fetch(photo.urls.regular)
            .then(res => res.blob())
            .then(readFileAsDataUrl)
            .then(prepareBackground)
            .then(src => setImageBackground(src, ''))
            .catch(() => setImageBackground(photo.urls.regular, ''));
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

      // This promise must always settle. It used to resolve only from
      // img.onload, so any decode failure (e.g. an empty capture) left the
      // export hanging forever with the button stuck disabled.
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const bail = () => finish(sourceDataUrl); // fall back to the plain export
      setTimeout(bail, 10000);

      const img = new Image();
      img.onerror = bail;
      img.onload = () => {
        const wpCanvas = document.createElement('canvas');
        wpCanvas.width = WALLPAPER_W;
        wpCanvas.height = WALLPAPER_H;
        const ctx = wpCanvas.getContext('2d');

        // Fill background with the current canvas background
        if (customBgImage) {
          // Draw custom bg image to fill
          const bgImg = new Image();
          bgImg.onerror = bail;
          bgImg.onload = () => {
            // Cover fill
            const scale = Math.max(WALLPAPER_W / bgImg.width, WALLPAPER_H / bgImg.height);
            const w = bgImg.width * scale;
            const h = bgImg.height * scale;
            ctx.drawImage(bgImg, (WALLPAPER_W - w) / 2, (WALLPAPER_H - h) / 2, w, h);
            // Draw board content centered
            drawBoardOnWallpaper(ctx, img, WALLPAPER_W, WALLPAPER_H);
            finish(wpCanvas.toDataURL('image/png'));
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
          finish(wpCanvas.toDataURL('image/png'));
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

  let exportIdleHTML = null;

  // Export takes ~half a second on a small board and longer on a full one, with
  // no feedback before this. Disable the button and show a spinner.
  function setExportBusy(busy) {
    if (exportIdleHTML === null) exportIdleHTML = btnExport.innerHTML;
    btnExport.disabled = busy;
    btnExport.setAttribute('aria-busy', busy ? 'true' : 'false');
    btnExport.innerHTML = busy
      ? '<span class="btn-spinner" aria-hidden="true"></span><span class="btn-label">Exporting</span>'
      : exportIdleHTML;
  }

  async function exportBoard() {
    if (btnExport.getAttribute('aria-busy') === 'true') return;
    const hasContent = elements.length > 0 || customBgImage;
    if (!hasContent) return;

    // A zero-area canvas captures to an empty image, which is a useless download.
    const area = canvasBounds();
    if (area.width < 1 || area.height < 1) {
      showToast('The board has no size to export yet. Try again in a moment.', 'error');
      return;
    }

    setExportBusy(true);
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
      showToast('Export failed. Please try again.', 'error');
    } finally {
      // Reset intention labels to hover-only
      canvas.querySelectorAll('.intention-label').forEach(l => l.style.opacity = '');

      // Restore sidebars
      if (sidebarWasOpen) openSidebar(sidebarWasOpen);
      if (intentionsWasOpen) {
        intentionsPanelOpen = true;
        intentionsPanel.classList.remove('hidden');
        btnIntentions.classList.add('active-outline');
      }
      setExportBusy(false);
      relayoutElements();
      if (prevSelected) selectElement(prevSelected);
      updateUI();
    }
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

    // The canvas box just narrowed — re-resolve element positions from fractions
    relayoutElements();

    // Focus search input
    if (tab === 'search') {
      setTimeout(() => $('#search-input').focus(), 100);
    }
  }

  function closeSidebar() {
    const wasOpen = sidebarTab !== null;
    sidebarTab = null;
    sidebar.classList.add('hidden');
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (wasOpen) relayoutElements();
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
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'bg-card';
      card.setAttribute('aria-label', `${bg.label} background`);
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
        if (bg.id === currentBg.id && !customBgImage) return;
        pushUndo();
        currentBg = bg;
        customBgImage = null; // Clear custom image when picking a preset
        applyBackground();
        updateUI();
        saveBoard();
        if (window.innerWidth <= 768) closeSidebar();
      });

      grid.appendChild(card);
    });
  }

  // ===== Example board =====
  // A pre-composed board so a first-time visitor sees the finished thing in one
  // click instead of a blank canvas. Positions are fractions of the canvas box.
  const EXAMPLE_ELEMENTS = [
    { type: 'text', content: 'Dream big', fontFamily: "'Playfair Display', serif", fontSize: 52,
      fontWeight: 'bold', fontStyle: 'normal', color: '#1a1a2e', width: 300, height: 72,
      fx: 0.07, fy: 0.09, rotation: -3, intention: 'The headline for this year.' },
    { type: 'sticker', src: '🚀', width: 110, height: 110, fx: 0.45, fy: 0.05, rotation: 9,
      intention: 'Ship the thing I keep almost starting.' },
    { type: 'sticker', src: '💎', width: 88, height: 88, fx: 0.85, fy: 0.11, rotation: -8, intention: '' },
    { type: 'text', content: 'Make it happen', fontFamily: "'Caveat', cursive", fontSize: 46,
      fontWeight: 'bold', fontStyle: 'normal', color: '#b84a78', width: 280, height: 66,
      fx: 0.60, fy: 0.30, rotation: 4, intention: '' },
    { type: 'sticker', src: '🏔️', width: 118, height: 118, fx: 0.12, fy: 0.38, rotation: -6,
      intention: 'One real climb, actually booked.' },
    { type: 'sticker', src: '🌻', width: 94, height: 94, fx: 0.39, fy: 0.50, rotation: 5, intention: '' },
    { type: 'text', content: 'Believe', fontFamily: "'Bebas Neue', sans-serif", fontSize: 58,
      fontWeight: 'normal', fontStyle: 'normal', color: '#1a1a2e', width: 230, height: 74,
      fx: 0.67, fy: 0.58, rotation: -2, intention: '' },
    { type: 'sticker', src: '🌊', width: 104, height: 104, fx: 0.24, fy: 0.63, rotation: 3, intention: '' },
  ];

  function loadExampleBoard() {
    pushUndo();
    ensureModePanels();

    canvas.querySelectorAll('.canvas-element').forEach(node => node.remove());
    elements = [];
    selectedId = null;
    nextId = 1;
    maxZ = 0;
    customBgImage = null;
    currentBg = BACKGROUNDS.find(b => b.id === 'blush') || BACKGROUNDS[0];
    applyBackground();

    const b = canvasBounds();
    EXAMPLE_ELEMENTS.forEach(spec => {
      maxZ++;
      const el = { ...spec, id: 'el-' + nextId++, zIndex: maxZ };
      const spot = clampPosition(spec.fx * b.width, spec.fy * b.height, el.width, el.height, b);
      el.x = spot.x;
      el.y = spot.y;
      elements.push(el);
      renderElement(el, true);
    });

    updateUI();
    renderIntentionsPanel();
    saveBoard();
    showToast('Loaded an example board. Drag anything around, or hit Clear to start fresh.');
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
    $('#welcome-intentional').addEventListener('click', () => chooseMode('intentional'));
    $('#welcome-freeform').addEventListener('click', () => chooseMode('freeform'));

    // Empty state — load a finished board in one click
    $('#btn-example').addEventListener('click', (e) => {
      e.stopPropagation();
      loadExampleBoard();
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
      const modal = openModalOverlay();

      // Keep Tab inside an open dialog, as aria-modal promises.
      if (e.key === 'Tab' && modal) {
        trapFocus(modal, e);
        return;
      }

      // Escape is handled before the input guard below. The old handler bailed
      // out for INPUT/TEXTAREA, so Escape never reached either modal.
      if (e.key === 'Escape') {
        if (modal === intentionModal) {
          e.preventDefault();
          commitPendingElement(''); // same as the Skip button
          return;
        }
        if (modal === welcomeModal) {
          e.preventDefault();
          chooseMode('freeform'); // dismissing picks the lighter-touch default
          return;
        }
        selectElement(null);
        closeSidebar();
        return;
      }

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') return;
      if (modal) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        removeElement(selectedId);
      }
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        undo();
      }
    });

    // Canvas box changes with the window, and positions are fractional, so
    // re-resolve them. Also re-cache the draw canvas rect if drawing is open.
    window.addEventListener('resize', () => {
      scheduleRelayout();
      if (drawCtx) drawRect = $('#draw-canvas').getBoundingClientRect();
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
      readFileAsDataUrl(file)
        .then(prepareBackground)
        .then(src => setImageBackground(src, ''))
        .catch(() => showToast('That file could not be read as an image.', 'error'));
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
  // Black, not white: the default canvas is #faf9f6, so a white first stroke was
  // invisible and read as "drawing is broken".
  let drawColor = '#000000';
  let drawSize = 6;
  let drawRect = null; // cached draw-canvas rect; drawMove runs on every pointermove
  const DRAW_COLORS = [
    '#ffffff', '#000000', '#ef4444', '#f97316', '#facc15',
    '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#06b6d4',
  ];
  const DRAW_COLOR_NAMES = {
    '#ffffff': 'White', '#000000': 'Black', '#ef4444': 'Red', '#f97316': 'Orange',
    '#facc15': 'Yellow', '#22c55e': 'Green', '#3b82f6': 'Blue', '#a855f7': 'Purple',
    '#ec4899': 'Pink', '#06b6d4': 'Cyan',
  };

  function enterDrawMode() {
    const overlay = $('#draw-overlay');
    const drawCanvas = $('#draw-canvas');
    // The overlay is viewport-fixed and full width. Closing the left sidebar
    // keeps its box aligned with the canvas box (exitDrawMode also corrects for
    // any remaining offset).
    closeSidebar();
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
    drawRect = drawCanvas.getBoundingClientRect();

    // Render color swatches
    const colorRow = $('#draw-colors');
    colorRow.innerHTML = '';
    DRAW_COLORS.forEach(c => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'draw-color-swatch';
      swatch.setAttribute('aria-label', (DRAW_COLOR_NAMES[c] || c) + ' pen');
      if (c === drawColor) {
        swatch.classList.add('active');
        swatch.setAttribute('aria-pressed', 'true');
      }
      swatch.style.background = c;
      if (c === '#ffffff') swatch.style.borderColor = '#d1d5db';
      swatch.addEventListener('click', () => {
        drawColor = c;
        colorRow.querySelectorAll('.draw-color-swatch').forEach(s => {
          s.classList.remove('active');
          s.setAttribute('aria-pressed', 'false');
        });
        swatch.classList.add('active');
        swatch.setAttribute('aria-pressed', 'true');
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

    // Stroke coordinates are relative to the viewport-fixed overlay, but they
    // get handed to addElement as canvas-relative. Convert, or the drawing lands
    // off by the width of whatever panel is open.
    const canvasRect = canvas.getBoundingClientRect();
    const overlayRect = drawRect || drawCanvas.getBoundingClientRect();
    const offsetX = overlayRect.left - canvasRect.left;
    const offsetY = overlayRect.top - canvasRect.top;

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
        x: Math.round(minX + offsetX),
        y: Math.round(minY + offsetY),
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
    drawRect = null;
  }

  function drawStart(e) {
    isDrawing = true;
    btnClear.style.display = 'inline-flex';
    const rect = drawRect || e.target.getBoundingClientRect();
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
    // Cached in enterDrawMode — this used to force layout on every pointermove.
    const rect = drawRect || e.target.getBoundingClientRect();
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
  function chooseMode(next) {
    mode = next;
    localStorage.setItem('visionbort-mode', next);
    closeModal(welcomeModal);
    saveBoard();
  }

  function commitPendingElement(intention) {
    if (!pendingElement) return;
    const setAsBg = $('#intention-set-bg').checked && pendingElement.type === 'image';
    if (setAsBg) {
      setImageBackground(pendingElement.src, intention || '');
      pendingElement = null;
      closeModal(intentionModal);
      return;
    }
    pendingElement.intention = intention || '';
    pendingElement._skipIntention = true;
    addElement(pendingElement);
    pendingElement = null;
    closeModal(intentionModal);
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
    relayoutElements(); // canvas box changed
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
