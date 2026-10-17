/* ===== Visionbort: Opening Night =====
   The board is a gallery wall with a fixed size in world units. The stage pans
   and zooms over it, so a wall hung on a laptop is the same wall on a phone:
   nothing reflows, nothing overlaps that didn't overlap before.

   v1 (visionbort-lite) stored positions as fractions of whatever the window
   happened to be, with sizes in screen pixels. That is why a desktop board
   piled up on a phone. loadBoard() migrates those boards once and keeps the
   old key untouched as a backup. */

(function () {
  'use strict';

  // ===== Config =====
  const UNSPLASH_PROXY = 'https://unsplash-proxy.kevin-middleton.workers.dev';
  const DB_NAME = 'visionbort';
  const DB_STORE = 'kv';
  const BOARD_KEY = 'board-v2';
  const LEGACY_KEY = 'visionbort-lite';
  const LEGACY_MODE_KEY = 'visionbort-mode';
  const ASK_KEY = 'visionbort-ask';
  const WELCOMED_KEY = 'visionbort-welcomed';

  const SHAPES = { wide: { w: 1600, h: 1000 }, tall: { w: 1000, h: 1600 } };
  const PHOTO_EDGE = 360;            // longest edge of a new photo, world units
  const STICKER_SIZE = 150;
  const WORDS_SIZE = 72;
  const STORE_SCALE = 2;             // image bytes kept at 2x their world size
  const STORE_QUALITY = 0.85;
  const WALLPAPER_EDGE = 2400;
  const MIN_ON_WALL = 40;            // world units of a piece that must stay on the wall
  const MAX_UNDO = 60;
  const LABEL_GAP = 14;

  const PAINTS = [
    { id: 'salon', label: 'Salon green', tone: 'dark', ink: '#f1ede4', hex: '#2e4537' },
    { id: 'white', label: 'Gallery white', tone: 'light', ink: '#1c1b19', hex: '#eeebe4' },
    { id: 'plaster', label: 'Plaster', tone: 'light', ink: '#1c1b19', hex: '#d6cfc2' },
    { id: 'oxblood', label: 'Oxblood', tone: 'dark', ink: '#f1ede4', hex: '#5b2229' },
    { id: 'ochre', label: 'Ochre', tone: 'light', ink: '#1c1b19', hex: '#b58a45' },
    { id: 'charcoal', label: 'Charcoal', tone: 'dark', ink: '#f1ede4', hex: '#2a2a28' },
  ];
  const FRAMES = [
    { id: 'none', label: 'Print' },
    { id: 'black', label: 'Black frame' },
    { id: 'oak', label: 'Oak frame' },
    { id: 'white', label: 'White frame' },
    { id: 'oval', label: 'Oval mat' },
    { id: 'polaroid', label: 'Instant photo' },
    { id: 'circle', label: 'Round print' },
    { id: 'torn', label: 'Magazine cut' },
  ];
  const FONTS = [
    { id: 'gallery', label: 'Gallery', family: "'Funnel Display', sans-serif" },
    { id: 'playfair', label: 'Playfair', family: "'Playfair Display', serif" },
    { id: 'cormorant', label: 'Cormorant', family: "'Cormorant Garamond', serif" },
    { id: 'bebas', label: 'Bebas Neue', family: "'Bebas Neue', sans-serif" },
    { id: 'caveat', label: 'Caveat', family: "'Caveat', cursive" },
    { id: 'dancing', label: 'Dancing Script', family: "'Dancing Script', cursive" },
    { id: 'helvetica', label: 'Helvetica', family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  ];
  const INKS = ['#1c1b19', '#f1ede4', '#c4122f', '#d29a2e', '#7d9b76', '#86a7c2', '#b07aa1', '#ffffff'];
  const INK_NAMES = {
    '#1c1b19': 'Black', '#f1ede4': 'Bone', '#c4122f': 'Gallery red', '#d29a2e': 'Gold',
    '#7d9b76': 'Sage', '#86a7c2': 'Sky', '#b07aa1': 'Mauve', '#ffffff': 'White',
  };
  const STICKERS = [
    '✨','⭐','🌟','💫','❤️','💖','🔥','🌈',
    '🎯','🏆','💪','🚀','✈️','🏠','🌍','🗝️',
    '🌸','🦋','🌻','🍀','🌊','🏔️','🌅','🕊️',
    '📚','🎨','🎵','📸','🧘','🎓','🥂','🎉',
    '💎','👑','💰','⚡','🎭','💐','🌺','🎪',
  ];
  const STICKER_NAMES = {
    '⭐':'Star','✨':'Sparkles','💫':'Shooting star','🌟':'Glowing star','💖':'Heart','🔥':'Fire',
    '🌈':'Rainbow','🎯':'Target','🏆':'Trophy','💪':'Strength','🚀':'Rocket','🌸':'Blossom',
    '🦋':'Butterfly','🌺':'Hibiscus','🍀':'Clover','💎':'Gem','👑':'Crown','🎨':'Art',
    '🎵':'Music','📸':'Camera','✈️':'Travel','🏠':'Home','🌍':'World','💰':'Money',
    '📚':'Books','🧘':'Calm','❤️':'Love','🎉':'Party','🌅':'Sunrise','🏔️':'Mountain',
    '🌊':'Wave','🎭':'Theater','🥂':'Cheers','🎓':'Graduation','💐':'Bouquet','🕊️':'Peace',
    '🌻':'Sunflower','⚡':'Energy','🎪':'Circus','🗝️':'Key',
  };
  const WHY_PROMPTS = [
    'What would having this mean to you?',
    'Why does this one matter?',
    'What changes when this comes true?',
    'What does this stand for?',
  ];

  // ===== DOM =====
  const $ = (sel) => document.querySelector(sel);
  const stage = $('#stage');
  const wall = $('#wall');
  const piecesEl = $('#pieces');
  const labelsEl = $('#labels');
  const wallEmpty = $('#wall-empty');
  const wallPaper = $('#wall-paper');
  const showTitle = $('#show-title');
  const ctxBar = $('#ctx');
  const pop = $('#pop');
  const panel = $('#panel');
  const card = $('#card');
  const scrim = $('#scrim');
  const fileInput = $('#file-photos');
  const wallpaperInput = $('#file-wallpaper');

  // ===== State =====
  let board = emptyBoard();
  let selectedId = null;
  let view = { s: 1, tx: 0, ty: 0 };
  let fitS = 1;
  let userZoomed = false;
  let viewMode = 'arrange';
  let panelTab = null;
  let cardForId = null;
  let cardDirty = false;
  let undoStack = [];
  let redoStack = [];
  let saveTimer = null;
  let saveWarned = false;
  let editingTextId = null;
  let askWhy = true;
  let openDialog = null;
  let dialogReturnFocus = null;
  let fontEmbedCSS = null;

  function emptyBoard() {
    return {
      v: 2, title: '', paint: 'salon', shape: 'wide', light: true,
      wallpaper: null, pieces: [], nextId: 1, maxZ: 0,
    };
  }
  const W = () => SHAPES[board.shape].w;
  const H = () => SHAPES[board.shape].h;
  const paint = () => PAINTS.find(p => p.id === board.paint) || PAINTS[0];
  const isPhone = () => window.matchMedia('(max-width: 760px)').matches;
  const byId = (id) => board.pieces.find(p => p.id === id);
  const domOf = (id) => piecesEl.querySelector(`[data-id="${id}"]`);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ===== Storage: IndexedDB, with localStorage as a fallback =====
  // localStorage caps out around 5MB and a few phone photos fill it; when that
  // happened in v1 the save failed and later changes quietly vanished on
  // reload. IndexedDB holds hundreds of megabytes.
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function idbGet(key) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const r = d.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbSet(key, value) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, v) { try { localStorage.setItem(key, v); return true; } catch (e) { return false; } }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeBoard, 400);
  }
  async function writeBoard() {
    board.title = showTitle.value.trim();
    try {
      await idbSet(BOARD_KEY, board);
      saveWarned = false;
    } catch (e) {
      // Last resort. It may also fail on a big board; say so if it does.
      if (!lsSet(BOARD_KEY, JSON.stringify(board)) && !saveWarned) {
        saveWarned = true;
        toast('This wall could not be saved on this device. Saving a copy with Hang the show keeps it safe.', { error: true, ms: 10000 });
      }
    }
  }

  async function loadBoard() {
    let data = null;
    try { data = await idbGet(BOARD_KEY); } catch (e) { /* fall through */ }
    if (!data) {
      const raw = lsGet(BOARD_KEY);
      if (raw) { try { data = JSON.parse(raw); } catch (e) { /* ignore */ } }
    }
    let migrated = false;
    if (!data) {
      const legacy = lsGet(LEGACY_KEY);
      if (legacy) {
        try { data = migrateV1(JSON.parse(legacy)); migrated = true; } catch (e) { data = null; }
      }
    }
    if (data && data.v === 2) {
      board = Object.assign(emptyBoard(), data);
      board.pieces = (board.pieces || []).map(normalizePiece);
    }
    return migrated;
  }

  // ===== v1 migration =====
  function migrateV1(d) {
    const savedW = d.canvasW || 1280;
    const savedH = d.canvasH || 720;
    const shape = savedH > savedW * 1.1 ? 'tall' : 'wide';
    const { w: WW, h: HH } = SHAPES[shape];
    // v1 sizes were screen pixels on a canvas of savedW x savedH. Scale them
    // uniformly so a piece keeps its size relative to the board.
    const k = clamp(Math.min(WW / savedW, HH / savedH), 0.6, 2.4);
    const oldBg = d.backgroundId || 'warm';
    const paintMap = { warm: 'white', blush: 'white', ocean: 'white', sunset: 'white', lavender: 'white', cork: 'ochre', forest: 'salon', midnight: 'charcoal' };
    const pieces = (d.elements || []).map((el, i) => {
      const w = (el.width || 200) * k;
      const h = (el.height || 200) * k;
      const fx = typeof el.fx === 'number' ? el.fx : (el.x || 0) / savedW;
      const fy = typeof el.fy === 'number' ? el.fy : (el.y || 0) / savedH;
      const p = {
        id: 'p-' + (i + 1),
        type: el.type,
        x: fx * WW, y: fy * HH, w, h,
        rot: el.rotation || 0,
        z: el.zIndex || i + 1,
        why: el.intention || '',
        name: '', by: '', dot: false,
      };
      if (el.type === 'image') {
        p.src = el.src;
        p.alt = el.label || '';
        if (el.label === 'Drawing') { p.kind = 'drawing'; p.frame = 'none'; }
        else if (el.clipShape === 'polaroid') p.frame = 'polaroid';
        else if (el.clipShape === 'circle') p.frame = 'circle';
        else if (el.clipShape === 'torn') { p.frame = 'torn'; p.clip = el.clipPath; }
        else if (['star', 'heart', 'diamond'].includes(el.clipShape)) p.frame = el.clipShape;
        else p.frame = 'none';
      } else if (el.type === 'sticker') {
        p.src = el.src;
      } else if (el.type === 'text') {
        p.content = el.content || '';
        p.family = el.fontFamily || FONTS[0].family;
        p.size = (el.fontSize || 32) * k;
        p.color = el.color || '#1c1b19';
        p.weight = el.fontWeight === 'bold' ? 700 : 400;
        p.italic = el.fontStyle === 'italic';
      }
      return p;
    });
    const b = emptyBoard();
    b.title = d.boardTitle && d.boardTitle !== 'My Vision Board' ? d.boardTitle : '';
    b.paint = paintMap[oldBg] || 'white';
    b.shape = shape;
    if (d.customBgImage && d.customBgImage.src) b.wallpaper = d.customBgImage.src;
    b.pieces = pieces.map(normalizePiece);
    b.nextId = pieces.length + 1;
    b.maxZ = Math.max(0, ...pieces.map(p => p.z || 0));
    return b;
  }

  function normalizePiece(p) {
    const n = Object.assign({ rot: 0, z: 1, why: '', name: '', by: '', dot: false }, p);
    if (n.type === 'image' && !n.frame) n.frame = 'none';
    return n;
  }

  // ===== Undo / redo =====
  // Snapshots copy each piece object but share the image strings, which are
  // never mutated in place. Thirty deep copies of a photo board used to cost
  // tens of megabytes; this costs almost nothing.
  function snapshot() {
    return Object.assign({}, board, {
      title: showTitle.value.trim(),
      pieces: board.pieces.map(p => Object.assign({}, p)),
    });
  }
  function restore(snap) {
    board = Object.assign({}, snap, { pieces: snap.pieces.map(p => Object.assign({}, p)) });
    showTitle.value = board.title || '';
    if (!byId(selectedId)) selectedId = null;
    closeCard();
    applyWall();
    renderAll();
    refreshUI();
    save();
  }
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    updateUndoButtons();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    updateUndoButtons();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    updateUndoButtons();
  }
  function updateUndoButtons() {
    $('#btn-undo').disabled = !undoStack.length;
    $('#btn-redo').disabled = !redoStack.length;
  }

  // ===== View: pan and zoom =====
  function insets() {
    const phone = isPhone();
    const views = phone ? 56 : 0;
    return {
      top: 20 + views,
      bottom: (phone ? 86 : 104),
      left: (!phone && panelTab) ? 364 : 20,
      right: 20,
    };
  }
  function computeFit() {
    const r = stage.getBoundingClientRect();
    const i = insets();
    const aw = Math.max(80, r.width - i.left - i.right);
    const ah = Math.max(80, r.height - i.top - i.bottom);
    const s = Math.min(aw / W(), ah / H());
    return { s, tx: i.left + (aw - W() * s) / 2, ty: i.top + (ah - H() * s) / 2 };
  }
  function fit() {
    const f = computeFit();
    fitS = f.s;
    userZoomed = false;
    setView(f.s, f.tx, f.ty);
  }
  function setView(s, tx, ty) {
    const r = stage.getBoundingClientRect();
    // Keep part of the wall on screen whatever happens.
    const keep = 80;
    tx = clamp(tx, keep - W() * s, r.width - keep);
    ty = clamp(ty, keep - H() * s, r.height - keep);
    view = { s, tx, ty };
    wall.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    wall.style.setProperty('--s', s);
    const zoomed = Math.abs(s / fitS - 1) > 0.02;
    document.body.classList.toggle('zoomed', zoomed);
    const fitBtn = $('#zoom-fit');
    fitBtn.textContent = zoomed ? Math.round(s / fitS * 100) + '%' : 'Fit';
    fitBtn.setAttribute('aria-label', zoomed ? `Fit the wall to the screen (now ${Math.round(s / fitS * 100)}%)` : 'Fit the wall to the screen');
    positionCtx();
  }
  function zoomAt(factor, cx, cy) {
    const r = stage.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const s = clamp(view.s * factor, fitS * 0.5, Math.max(4, fitS * 8));
    const k = s / view.s;
    userZoomed = true;
    setView(s, px - (px - view.tx) * k, py - (py - view.ty) * k);
  }
  function zoomBy(factor) {
    const r = stage.getBoundingClientRect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  }
  function clientToWorld(cx, cy) {
    const r = stage.getBoundingClientRect();
    return { x: (cx - r.left - view.tx) / view.s, y: (cy - r.top - view.ty) / view.s };
  }
  // The middle of whatever part of the wall is on screen, for placing new pieces.
  function visibleCenter() {
    const r = stage.getBoundingClientRect();
    const i = insets();
    const c = clientToWorld(r.left + (i.left + r.width - i.right) / 2, r.top + (i.top + r.height - i.bottom) / 2);
    return { x: clamp(c.x, 0, W()), y: clamp(c.y, 0, H()) };
  }
  function refitIfAuto() {
    if (!userZoomed && viewMode !== 'walk') fit();
    else setView(view.s, view.tx, view.ty);
  }

  // ===== Wall =====
  function applyWall() {
    wall.style.width = W() + 'px';
    wall.style.height = H() + 'px';
    wall.dataset.paint = paint().id;
    wall.dataset.tone = board.wallpaper ? 'dark' : paint().tone;
    wall.classList.toggle('no-light', !board.light);
    wallPaper.style.backgroundImage = board.wallpaper ? `url("${board.wallpaper}")` : '';
    stage.style.setProperty('--paint-hex', paint().hex);
    $('#wp-clear').hidden = !board.wallpaper;
    $('#opt-light').checked = board.light;
    document.querySelectorAll('#paint-grid .paint').forEach(b => b.setAttribute('aria-checked', String(b.dataset.paint === board.paint && !board.wallpaper)));
    document.querySelectorAll('#shape-seg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.shape === board.shape)));
  }

  // ===== Rendering =====
  function renderAll() {
    piecesEl.innerHTML = '';
    labelsEl.innerHTML = '';
    board.pieces.forEach(p => renderPiece(p));
    renderLabels();
    updateEmpty();
  }

  function renderPiece(p, animate) {
    let dom = domOf(p.id);
    if (!dom) {
      dom = document.createElement('div');
      dom.className = 'piece';
      dom.dataset.id = p.id;
      dom.tabIndex = 0;
      dom.setAttribute('role', 'button');
      dom.setAttribute('aria-roledescription', 'piece');
      piecesEl.appendChild(dom);
      if (animate) {
        dom.classList.add('pop-in');
        const clear = () => dom.classList.remove('pop-in');
        dom.addEventListener('animationend', clear, { once: true });
        setTimeout(clear, 600);
      }
    }
    dom.dataset.type = p.type;
    dom.dataset.frame = p.type === 'image' ? (p.frame || 'none') : '';
    dom.classList.toggle('cutout', !!p.cutout);
    dom.classList.toggle('ink', p.kind === 'drawing');
    dom.style.left = p.x + 'px';
    dom.style.top = p.y + 'px';
    dom.style.width = p.w + 'px';
    dom.style.height = p.h + 'px';
    dom.style.zIndex = p.z;
    dom.style.setProperty('--rot', (p.rot || 0) + 'deg');
    dom.style.transform = `rotate(${p.rot || 0}deg)`;
    dom.setAttribute('aria-label', describe(p));

    // Content is rebuilt only when it actually changes, so dragging stays cheap.
    const sig = contentSig(p);
    if (dom.dataset.sig !== sig) {
      dom.dataset.sig = sig;
      dom.querySelectorAll('.art').forEach(n => n.remove());
      dom.insertBefore(buildArt(p), dom.firstChild);
    } else {
      styleArt(dom.querySelector('.art'), p);
    }
    renderSelection(dom, p);
  }

  function contentSig(p) {
    if (p.type === 'image') return ['i', p.frame, p.cutout ? 1 : 0, p.kind || '', p.src.length, p.src.slice(-24)].join('|');
    if (p.type === 'sticker') return 's|' + p.src;
    return 't|' + p.content;
  }

  function buildArt(p) {
    const art = document.createElement('div');
    art.className = 'art';
    if (p.type === 'image') {
      const img = document.createElement('img');
      img.src = p.src;
      img.alt = '';
      img.draggable = false;
      const framed = ['black', 'oak', 'white', 'oval'].includes(p.frame) && !p.cutout;
      if (framed) {
        const mat = document.createElement('div');
        mat.className = 'mat';
        mat.appendChild(img);
        art.appendChild(mat);
      } else {
        art.appendChild(img);
      }
    } else if (p.type === 'sticker') {
      art.textContent = p.src;
    } else {
      art.textContent = p.content;
    }
    styleArt(art, p);
    return art;
  }

  function styleArt(art, p) {
    if (!art) return;
    const dom = art.parentElement;
    if (p.type === 'image') {
      const m = Math.min(p.w, p.h);
      art.style.setProperty('--fw', clamp(m * 0.045, 8, 26) + 'px');
      art.style.setProperty('--mw', clamp(m * 0.09, 10, 44) + 'px');
      const clip = clipFor(p);
      const img = art.querySelector('img');
      if (img) img.style.clipPath = clip;
      if (dom) dom.classList.toggle('clipped', !!clip);
    } else if (p.type === 'sticker') {
      art.style.fontSize = Math.min(p.w, p.h) * 0.8 + 'px';
    } else {
      art.style.fontFamily = p.family || FONTS[0].family;
      art.style.fontSize = (p.size || WORDS_SIZE) + 'px';
      art.style.color = p.color || paint().ink;
      art.style.fontWeight = p.weight || 600;
      art.style.fontStyle = p.italic ? 'italic' : 'normal';
    }
  }

  // Torn edges are stored as percentages, so they scale. The older star, heart
  // and diamond clips are regenerated for the current size.
  function clipFor(p) {
    if (p.cutout || p.kind === 'drawing') return '';
    if (p.frame === 'torn') return p.clip || (p.clip = tornPath());
    if (p.frame === 'star' || p.frame === 'heart' || p.frame === 'diamond') return legacyClip(p.frame, p.w, p.h);
    return '';
  }

  function describe(p) {
    let what;
    if (p.type === 'image') what = p.kind === 'drawing' ? 'Drawing' : (p.cutout ? 'Cutout' : 'Photo');
    else if (p.type === 'sticker') what = 'Sticker, ' + (STICKER_NAMES[p.src] || 'emoji');
    else what = 'Words, ' + (p.content || '');
    const name = p.name || (p.type === 'image' ? p.alt : '');
    let s = name ? `${what}: ${name}` : what;
    if (p.dot) s += '. Marked yours';
    return s;
  }

  function renderSelection(dom, p) {
    dom.querySelectorAll('.sel-box').forEach(n => n.remove());
    const on = p.id === selectedId && viewMode !== 'walk' && editingTextId !== p.id;
    dom.classList.toggle('selected', on);
    if (!on) return;
    const box = document.createElement('div');
    box.className = 'sel-box';
    ['nw', 'ne', 'sw', 'se'].forEach(c => {
      const h = document.createElement('div');
      h.className = 'h ' + c;
      h.dataset.handle = c;
      box.appendChild(h);
    });
    const stalk = document.createElement('div');
    stalk.className = 'rot-stalk';
    box.appendChild(stalk);
    const rot = document.createElement('div');
    rot.className = 'h rot';
    rot.dataset.handle = 'rot';
    box.appendChild(rot);
    dom.appendChild(box);
  }

  function updateEmpty() {
    const has = board.pieces.length > 0;
    wallEmpty.hidden = has;
    $('#btn-hang').disabled = !has;
  }

  // ===== Wall labels =====
  function hasLabel(p) { return !!(p.name || p.why || p.by || p.dot); }

  // Axis-aligned bounds of a rotated piece, for placing its label.
  function bbox(p) {
    const r = (p.rot || 0) * Math.PI / 180;
    const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    const bw = p.w * c + p.h * s, bh = p.w * s + p.h * c;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
  }

  function renderLabels(justDottedId) {
    labelsEl.innerHTML = '';
    const full = viewMode === 'labels';
    board.pieces.forEach(p => {
      if (!hasLabel(p)) return;
      const el = document.createElement('div');
      el.className = 'lbl';
      el.dataset.for = p.id;
      // Compact: a title (or the start of the why) and the date. Wall text
      // view: the whole why.
      const nameText = p.name || (full ? '' : shorten(p.why, 54));
      const whyText = full ? p.why : '';
      if (!nameText && !whyText && !p.by) el.classList.add('solo-dot');
      if (nameText) addLine(el, 'lbl-name', nameText);
      if (whyText) addLine(el, 'lbl-why', whyText);
      if (p.by) addLine(el, 'lbl-by', p.by);
      if (p.dot) {
        const d = document.createElement('span');
        d.className = 'lbl-dot';
        el.appendChild(d);
        if (p.id === justDottedId) el.classList.add('just-dotted');
      }
      labelsEl.appendChild(el);
      placeLabel(el, p);
    });
  }

  // Gallery-style: under the piece, left-aligned to it. Above it when there
  // is no room below. A lone red dot sits on the piece's lower right corner.
  function placeLabel(el, p) {
    const b = bbox(p);
    const lw = el.offsetWidth, lh = el.offsetHeight;
    let x, y;
    if (el.classList.contains('solo-dot')) {
      x = b.x + b.w - lw / 2 - 6;
      y = b.y + b.h - lh / 2 - 6;
    } else {
      x = clamp(b.x, 8, W() - lw - 8);
      y = b.y + b.h + LABEL_GAP;
      if (y + lh > H() - 8) y = Math.max(8, b.y - LABEL_GAP - lh);
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.zIndex = (p.z || 1);
  }

  function shorten(s, n) {
    s = String(s || '').trim();
    if (s.length <= n) return s;
    const cut = s.slice(0, n);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 12)).replace(/[,.;:]$/, '') + '...';
  }

  // ===== Pieces: add, change, remove =====
  function nextSpot(w, h) {
    const c = visibleCenter();
    const n = board.pieces.length % 18;
    const step = Math.min(W(), H()) * 0.11;
    const a = n * 2.39996323;
    const r = step * Math.sqrt(n);
    return clampInside(c.x + r * Math.cos(a) - w / 2, c.y + r * Math.sin(a) - h / 2, w, h);
  }
  function clampInside(x, y, w, h) {
    return {
      x: Math.round(clamp(x, 16, Math.max(16, W() - w - 16))),
      y: Math.round(clamp(y, 16, Math.max(16, H() - h - 16))),
    };
  }
  function clampOnWall(p) {
    p.x = clamp(p.x, MIN_ON_WALL - p.w, W() - MIN_ON_WALL);
    p.y = clamp(p.y, MIN_ON_WALL - p.h, H() - MIN_ON_WALL);
  }

  function addPiece(props, opts) {
    opts = opts || {};
    if (!opts.noUndo) pushUndo();
    const w = props.w, h = props.h;
    const spot = (props.x != null && props.y != null) ? { x: props.x, y: props.y } : nextSpot(w, h);
    board.maxZ += 1;
    const p = normalizePiece(Object.assign({
      rot: props.type === 'image' && !props.kind ? (Math.random() * 4 - 2) : 0,
    }, props, { id: 'p-' + board.nextId++, x: spot.x, y: spot.y, z: board.maxZ }));
    board.pieces.push(p);
    renderPiece(p, true);
    renderLabels();
    if (!opts.noSelect) select(p.id);
    updateEmpty();
    save();
    return p;
  }

  function updatePiece(id, changes, opts) {
    const p = byId(id);
    if (!p) return;
    Object.assign(p, changes);
    renderPiece(p);
    if (!opts || !opts.skipLabels) renderLabels();
    positionCtx();
    save();
  }

  function removePiece(id) {
    pushUndo();
    board.pieces = board.pieces.filter(p => p.id !== id);
    const dom = domOf(id);
    if (dom) dom.remove();
    if (selectedId === id) select(null);
    if (cardForId === id) closeCard();
    renderLabels();
    updateEmpty();
    save();
    toast('Taken down.', { action: 'Undo', onAction: undo });
  }

  function duplicatePiece(id) {
    const p = byId(id);
    if (!p) return;
    const copy = Object.assign({}, p, { x: p.x + 28, y: p.y + 28, dot: false, name: '', why: '', by: '' });
    delete copy.id; delete copy.z;
    addPiece(copy);
  }

  function bringToFront(id) {
    pushUndo();
    board.maxZ += 1;
    updatePiece(id, { z: board.maxZ });
  }
  function sendToBack(id) {
    pushUndo();
    const min = Math.min(...board.pieces.map(p => p.z || 0));
    updatePiece(id, { z: min - 1 });
  }

  // ===== Selection and the context bar =====
  function select(id) {
    if (editingTextId && editingTextId !== id) commitTextEdit();
    const prev = selectedId;
    selectedId = id;
    [prev, id].forEach(x => {
      const p = x && byId(x);
      const dom = x && domOf(x);
      if (p && dom) renderSelection(dom, p);
    });
    closePop();
    buildCtx();
    if (cardForId && id && cardForId !== id) openCard(id);
    if (!id && cardForId && !isPhone()) closeCard();
  }

  function cb(icon, label, onClick, extra) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cb' + (extra && extra.cls ? ' ' + extra.cls : '');
    if (icon) b.innerHTML = icon.startsWith('<') ? icon : `<svg aria-hidden="true"><use href="#i-${icon}"/></svg>`;
    const t = document.createElement('span');
    t.textContent = label;
    b.appendChild(t);
    if (extra && extra.pressed != null) b.setAttribute('aria-pressed', String(extra.pressed));
    if (extra && extra.popup) { b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-expanded', 'false'); }
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(b); });
    return b;
  }
  function sep() { const s = document.createElement('span'); s.className = 'cb-sep'; return s; }

  function buildCtx() {
    ctxBar.innerHTML = '';
    const p = selectedId && byId(selectedId);
    if (!p || viewMode === 'walk' || editingTextId) { ctxBar.hidden = true; return; }
    ctxBar.appendChild(cb('note-pencil', 'Wall text', () => openCard(p.id), { cls: cardForId === p.id ? 'on' : '' }));
    if (p.type === 'image' && p.kind !== 'drawing' && !p.cutout) {
      ctxBar.appendChild(cb('frame-corners', 'Frame', (b) => framePop(b, p.id), { popup: true }));
    }
    if (p.type === 'text') {
      ctxBar.appendChild(cb('text-t', 'Edit', () => startTextEdit(p.id)));
      ctxBar.appendChild(cb('<span class="font-opt" aria-hidden="true" style="font-family:' + attr(p.family || FONTS[0].family) + '">Aa</span>', 'Font', (b) => fontPop(b, p.id), { popup: true }));
      ctxBar.appendChild(cb('text-b', 'Bold', () => { pushUndo(); updatePiece(p.id, { weight: (p.weight || 600) >= 600 ? 400 : 700 }); buildCtx(); }, { pressed: (p.weight || 600) >= 600 }));
      ctxBar.appendChild(cb('text-italic', 'Italic', () => { pushUndo(); updatePiece(p.id, { italic: !p.italic }); buildCtx(); }, { pressed: !!p.italic }));
      ctxBar.appendChild(cb(`<span class="sw" aria-hidden="true" style="background:${attr(p.color || paint().ink)}"></span>`, 'Color', (b) => colorPop(b, p.id), { popup: true }));
    }
    ctxBar.appendChild(sep());
    ctxBar.appendChild(cb('arrow-line-up', 'Front', () => bringToFront(p.id)));
    ctxBar.appendChild(cb('arrow-line-down', 'Back', () => sendToBack(p.id)));
    ctxBar.appendChild(cb('copy', 'Copy', () => duplicatePiece(p.id)));
    ctxBar.appendChild(cb('trash', 'Take down', () => removePiece(p.id), { cls: 'danger' }));
    ctxBar.hidden = false;
    positionCtx();
  }
  function attr(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function positionCtx() {
    if (ctxBar.hidden || !selectedId) return;
    if (isPhone()) { ctxBar.style.left = ''; ctxBar.style.top = ''; return; }
    const dom = domOf(selectedId);
    if (!dom) return;
    const pr = dom.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const bw = ctxBar.offsetWidth, bh = ctxBar.offsetHeight;
    let left = pr.left + pr.width / 2 - bw / 2;
    left = clamp(left, sr.left + 8, sr.right - bw - 8 - (cardForId ? 336 : 0));
    let top = pr.top - bh - 30;
    if (top < sr.top + 8) top = pr.bottom + 14;
    top = clamp(top, sr.top + 8, sr.bottom - bh - 96);
    ctxBar.style.left = Math.round(left) + 'px';
    ctxBar.style.top = Math.round(top) + 'px';
  }

  // ===== Popovers =====
  let popAnchor = null;
  function openPop(anchor, build) {
    if (popAnchor === anchor && !pop.hidden) { closePop(); return; }
    closePop();
    pop.innerHTML = '';
    build(pop);
    pop.hidden = false;
    popAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    const ar = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = clamp(ar.left + ar.width / 2 - pw / 2, 8, window.innerWidth - pw - 8);
    let top = ar.top - ph - 8;
    if (top < 60) top = ar.bottom + 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    const first = pop.querySelector('[aria-checked="true"]') || pop.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }
  function closePop() {
    if (pop.hidden) return;
    pop.hidden = true;
    if (popAnchor) { popAnchor.setAttribute('aria-expanded', 'false'); }
    popAnchor = null;
  }
  function optBtn(label, checked, onPick, lead) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.setAttribute('role', 'menuitemradio');
    b.setAttribute('aria-checked', String(!!checked));
    if (lead) b.appendChild(lead);
    const t = document.createElement('span');
    t.textContent = label;
    b.appendChild(t);
    b.addEventListener('click', (e) => { e.stopPropagation(); onPick(); });
    return b;
  }
  function framePop(anchor, id) {
    openPop(anchor, (el) => {
      el.setAttribute('role', 'menu');
      el.setAttribute('aria-label', 'Frame');
      const p = byId(id);
      FRAMES.forEach(f => {
        const chip = document.createElement('span');
        chip.className = 'frame-chip ' + f.id;
        el.appendChild(optBtn(f.label, p.frame === f.id, () => setFrame(id, f.id), chip));
      });
    });
  }
  function setFrame(id, frame) {
    const p = byId(id);
    if (!p || p.frame === frame) { closePop(); return; }
    pushUndo();
    const changes = { frame };
    // Shapes that read wrong when stretched get squared up, keeping the center.
    if (frame === 'circle') {
      const m = Math.min(p.w, p.h);
      Object.assign(changes, { w: m, h: m, x: p.x + (p.w - m) / 2, y: p.y + (p.h - m) / 2 });
    }
    if (frame === 'torn') changes.clip = tornPath();
    updatePiece(id, changes);
    closePop();
    buildCtx();
  }
  function fontPop(anchor, id) {
    openPop(anchor, (el) => {
      el.setAttribute('role', 'menu');
      el.setAttribute('aria-label', 'Font');
      const p = byId(id);
      FONTS.forEach(f => {
        const b = optBtn(f.label, p.family === f.family, () => {
          pushUndo();
          updatePiece(id, { family: f.family });
          fitTextBox(byId(id));
          closePop();
          buildCtx();
        });
        b.style.fontFamily = f.family;
        b.style.fontSize = '18px';
        el.appendChild(b);
      });
    });
  }
  function colorPop(anchor, id) {
    openPop(anchor, (el) => {
      el.setAttribute('role', 'menu');
      el.setAttribute('aria-label', 'Color');
      const p = byId(id);
      const grid = document.createElement('div');
      grid.className = 'swatches';
      grid.setAttribute('role', 'radiogroup');
      INKS.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-label', INK_NAMES[c] || c);
        b.setAttribute('aria-checked', String((p.color || paint().ink).toLowerCase() === c));
        b.style.setProperty('--sw', c);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          pushUndo();
          updatePiece(id, { color: c });
          closePop();
          buildCtx();
        });
        grid.appendChild(b);
      });
      el.appendChild(grid);
    });
  }

  // ===== Wall text card =====
  function openCard(id) {
    const p = byId(id);
    if (!p) return;
    const wasOpen = !!cardForId;
    cardForId = id;
    cardDirty = false;
    if (selectedId !== id) { selectedId = id; renderAll(); }
    const thumb = $('#card-thumb');
    thumb.className = 'card-thumb';
    thumb.style.backgroundImage = '';
    thumb.textContent = '';
    if (p.type === 'image') thumb.style.backgroundImage = `url("${p.src}")`;
    else if (p.type === 'sticker') thumb.textContent = p.src;
    else { thumb.classList.add('text'); thumb.textContent = p.content; thumb.style.fontFamily = p.family; }
    $('#card-why').value = p.why || '';
    $('#card-why').placeholder = WHY_PROMPTS[(parseInt(p.id.slice(2), 10) || 0) % WHY_PROMPTS.length];
    $('#card-name').value = p.name || '';
    $('#card-by').value = p.by || '';
    setDotUI(!!p.dot);
    card.hidden = false;
    buildCtx();
    if (!wasOpen) positionCtx();
    return card;
  }
  function closeCard() {
    if (!cardForId) return;
    cardForId = null;
    card.hidden = true;
    buildCtx();
  }
  function setDotUI(on) {
    const b = $('#card-dot');
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('strong').textContent = on ? 'Yours' : 'Mark it yours';
  }
  function cardEdit(field, value) {
    const p = byId(cardForId);
    if (!p) return;
    if (!cardDirty) { pushUndo(); cardDirty = true; }
    p[field] = value;
    const dom = domOf(p.id);
    if (dom) dom.setAttribute('aria-label', describe(p));
    renderLabels();
    save();
  }

  // ===== Words =====
  function addWords() {
    const p = addPiece({
      type: 'text', content: 'Your words', family: FONTS[0].family, size: WORDS_SIZE,
      color: paint().ink, weight: 600, italic: false, w: 420, h: 100,
    });
    fitTextBox(p);
    renderPiece(p);
    startTextEdit(p.id, true);
  }

  // The box hugs the text, measured with the real font.
  const measurer = document.createElement('div');
  function fitTextBox(p) {
    if (!p || p.type !== 'text') return;
    if (!measurer.parentNode) {
      measurer.style.cssText = 'position:absolute;left:-99999px;top:0;white-space:pre;line-height:1.05;visibility:hidden';
      document.body.appendChild(measurer);
    }
    measurer.style.fontFamily = p.family;
    measurer.style.fontSize = p.size + 'px';
    measurer.style.fontWeight = p.weight || 600;
    measurer.style.fontStyle = p.italic ? 'italic' : 'normal';
    measurer.textContent = p.content || ' ';
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const w = clamp(measurer.offsetWidth + p.size * 0.4, 60, W());
    const h = clamp(measurer.offsetHeight + p.size * 0.2, 30, H());
    Object.assign(p, { w, h, x: cx - w / 2, y: cy - h / 2 });
    clampOnWall(p);
  }

  function startTextEdit(id, fresh) {
    const p = byId(id);
    if (!p || p.type !== 'text') return;
    editingTextId = id;
    const dom = domOf(id);
    renderSelection(dom, p);
    buildCtx();
    const art = dom.querySelector('.art');
    art.contentEditable = 'true';
    art.spellcheck = false;
    art.focus();
    const range = document.createRange();
    range.selectNodeContents(art);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    art.dataset.fresh = fresh ? '1' : '';
    art.dataset.before = p.content;
    art.addEventListener('blur', commitTextEdit, { once: true });
  }
  function commitTextEdit() {
    const id = editingTextId;
    if (!id) return;
    editingTextId = null;
    const p = byId(id);
    const dom = domOf(id);
    if (!p || !dom) return;
    const art = dom.querySelector('.art');
    art.contentEditable = 'false';
    const next = (art.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    const before = art.dataset.before;
    if (!next) {
      // An emptied text piece is a removal. A fresh one that was never typed
      // in leaves no trace in undo either.
      board.pieces = board.pieces.filter(x => x.id !== id);
      dom.remove();
      if (art.dataset.fresh !== '1') {
        toast('Words taken down.', { action: 'Undo', onAction: undo });
      } else {
        undoStack.pop(); // the add itself, so nothing is left behind
        updateUndoButtons();
      }
      selectedId = null;
      buildCtx();
      renderLabels();
      updateEmpty();
      save();
      return;
    }
    if (next !== before && art.dataset.fresh !== '1') pushUndo();
    p.content = next;
    fitTextBox(p);
    dom.dataset.sig = '';
    renderPiece(p);
    renderLabels();
    buildCtx();
    save();
  }

  // ===== Images =====
  function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('not an image'));
      img.src = src;
    });
  }
  // How much of the image is see-through. A lifted subject is mostly
  // transparent around the edges; a regular photo is 0.
  function transparency(ctx, w, h) {
    try {
      const d = ctx.getImageData(0, 0, w, h).data;
      let clear = 0, n = 0;
      for (let i = 3; i < d.length; i += 4 * 9) { n++; if (d[i] < 200) clear++; }
      return n ? clear / n : 0;
    } catch (e) { return 0; }
  }
  // Re-encode at roughly 2x the size it will hang at. Cutouts get a white
  // die-cut edge baked into their pixels, so it survives every export.
  async function prepareImage(src, maxW, maxH) {
    const img = await loadImg(src);
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const clear = transparency(ctx, w, h);
    if (clear > 0.06) {
      const cut = dieCut(c);
      return { src: cut.url, cutout: true, ratio: cut.w / cut.h };
    }
    try {
      return { src: c.toDataURL('image/jpeg', STORE_QUALITY), ratio: w / h };
    } catch (e) {
      return { src, ratio: w / h };
    }
  }
  function dieCut(source) {
    const r = Math.max(4, Math.round(Math.max(source.width, source.height) * 0.018));
    const pad = r + 2;
    const out = document.createElement('canvas');
    out.width = source.width + pad * 2;
    out.height = source.height + pad * 2;
    const o = out.getContext('2d');
    // Stamp the silhouette in a ring to grow it by r, then paint it white.
    const steps = 28;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      o.drawImage(source, pad + Math.cos(a) * r, pad + Math.sin(a) * r);
    }
    o.globalCompositeOperation = 'source-in';
    o.fillStyle = '#ffffff';
    o.fillRect(0, 0, out.width, out.height);
    o.globalCompositeOperation = 'source-over';
    o.drawImage(source, pad, pad);
    return { url: out.toDataURL('image/png'), w: out.width, h: out.height };
  }

  function sizeFor(ratio, edge) {
    return ratio >= 1 ? { w: edge, h: Math.round(edge / ratio) } : { w: Math.round(edge * ratio), h: edge };
  }

  async function hangBlob(blob, extra) {
    const dataUrl = await readAsDataUrl(blob);
    return hangSrc(dataUrl, extra);
  }
  async function hangSrc(src, extra) {
    const probe = await loadImg(src);
    const ratio0 = probe.naturalWidth / probe.naturalHeight;
    const size = sizeFor(ratio0, PHOTO_EDGE);
    const prepared = await prepareImage(src, size.w * STORE_SCALE, size.h * STORE_SCALE);
    const s2 = sizeFor(prepared.ratio || ratio0, prepared.cutout ? PHOTO_EDGE * 0.85 : PHOTO_EDGE);
    return addPiece(Object.assign({
      type: 'image', src: prepared.src, w: s2.w, h: s2.h,
      frame: 'none', cutout: !!prepared.cutout,
    }, extra || {}), { noSelect: true });
  }

  async function hangFiles(files) {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!list.length) return;
    const added = [];
    for (const f of list) {
      try { added.push(await hangBlob(f, { alt: cleanName(f.name) })); }
      catch (e) { toast(`${f.name || 'That file'} could not be read as an image.`, { error: true }); }
    }
    afterHang(added);
  }
  function cleanName(n) {
    return String(n || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/^(IMG|DSC|PXL|Screenshot)\s?\d.*$/i, '').trim();
  }
  function afterHang(added) {
    if (!added.length) return;
    const last = added[added.length - 1];
    select(last.id);
    if (added.length > 1) {
      toast(`Hung ${added.length} pieces. Select one to give it wall text.`);
    } else if (askWhy) {
      openCard(last.id);
      setTimeout(() => $('#card-why').focus(), 60);
    }
  }

  // ===== Find (Unsplash) =====
  let findTimer = null;
  let findSeq = 0;
  async function find(query) {
    const seq = ++findSeq;
    const results = $('#find-results');
    const status = $('#find-status');
    status.textContent = 'Looking...';
    try {
      const res = await fetch(`${UNSPLASH_PROXY}/search?query=${encodeURIComponent(query)}&per_page=24`);
      const data = await res.json();
      if (seq !== findSeq) return;
      results.innerHTML = '';
      if (!data.results || !data.results.length) {
        status.textContent = 'Nothing for that. Try a simpler word.';
        return;
      }
      status.textContent = 'Photos from Unsplash. Tap one to hang it.';
      data.results.forEach(photo => {
        const b = document.createElement('button');
        b.type = 'button';
        const alt = photo.alt_description || 'Photo';
        b.setAttribute('aria-label', `Hang: ${alt}, by ${photo.user.name}`);
        const img = document.createElement('img');
        img.src = photo.urls.small;
        img.alt = '';
        img.loading = 'lazy';
        img.width = 200;
        img.height = Math.round(200 * photo.height / photo.width);
        b.appendChild(img);
        const credit = document.createElement('span');
        credit.className = 'credit';
        credit.textContent = photo.user.name;
        b.appendChild(credit);
        b.addEventListener('click', () => hangFromUrl(photo, b));
        results.appendChild(b);
      });
    } catch (e) {
      if (seq === findSeq) status.textContent = 'Search is not answering right now. Try again in a moment.';
    }
  }
  async function hangFromUrl(photo, btn) {
    btn.disabled = true;
    const extra = { alt: photo.alt_description || '', credit: { name: photo.user.name, url: photo.user.links && photo.user.links.html } };
    try {
      const blob = await (await fetch(photo.urls.regular)).blob();
      const p = await hangBlob(blob, extra);
      if (isPhone()) closePanel();
      afterHang([p]);
    } catch (e) {
      toast('That photo would not load. Try another.', { error: true });
    } finally {
      btn.disabled = false;
    }
  }

  // ===== Panels =====
  const PANEL_TITLES = { find: 'Find photos', stickers: 'Stickers', wall: 'The wall' };
  function openPanel(tab) {
    if (panelTab === tab) { closePanel(); return; }
    if (isPhone() && cardForId) closeCard();
    panelTab = tab;
    panel.hidden = false;
    $('#panel-title').textContent = PANEL_TITLES[tab];
    panel.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
    ['find', 'stickers', 'wall'].forEach(t => $('#tool-' + t).setAttribute('aria-expanded', String(t === tab)));
    refitIfAuto();
    if (tab === 'find') setTimeout(() => $('#find-input').focus(), 80);
  }
  function closePanel() {
    if (!panelTab) return;
    panelTab = null;
    panel.hidden = true;
    ['find', 'stickers', 'wall'].forEach(t => $('#tool-' + t).setAttribute('aria-expanded', 'false'));
    refitIfAuto();
  }
  function renderStickers() {
    const grid = $('#sticker-grid');
    STICKERS.forEach(e => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.setAttribute('aria-label', STICKER_NAMES[e] || 'Sticker');
      b.addEventListener('click', () => {
        const p = addPiece({ type: 'sticker', src: e, w: STICKER_SIZE, h: STICKER_SIZE, rot: Math.round(Math.random() * 16 - 8) }, { noSelect: true });
        if (isPhone()) closePanel();
        select(p.id);
      });
      grid.appendChild(b);
    });
  }
  function renderPaints() {
    const grid = $('#paint-grid');
    PAINTS.forEach(pt => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'paint';
      b.dataset.paint = pt.id;
      b.setAttribute('role', 'radio');
      b.style.setProperty('--sw', pt.hex);
      const s = document.createElement('span');
      s.textContent = pt.label;
      b.appendChild(s);
      b.addEventListener('click', () => {
        if (board.paint === pt.id && !board.wallpaper) return;
        pushUndo();
        const oldInk = paint().ink;
        board.paint = pt.id;
        board.wallpaper = null;
        // Words still in the old default color follow the new paint.
        board.pieces.forEach(p => { if (p.type === 'text' && (!p.color || p.color === oldInk)) p.color = pt.ink; });
        applyWall();
        renderAll();
        save();
      });
      grid.appendChild(b);
    });
  }
  function setShape(shape) {
    if (board.shape === shape) return;
    pushUndo();
    const from = SHAPES[board.shape], to = SHAPES[shape];
    const kx = to.w / from.w, ky = to.h / from.h, k = Math.min(kx, ky);
    // Keep each piece's center in the same relative spot; shrink sizes only
    // as much as the tighter side needs.
    board.pieces.forEach(p => {
      const cx = (p.x + p.w / 2) * kx, cy = (p.y + p.h / 2) * ky;
      p.w *= k; p.h *= k;
      if (p.type === 'text') p.size *= k;
      p.x = cx - p.w / 2; p.y = cy - p.h / 2;
      clampOnWall(p);
    });
    board.shape = shape;
    applyWall();
    renderAll();
    fit();
    save();
  }

  // ===== Example show =====
  const EXAMPLE = {
    title: '2027',
    paint: 'salon',
    wide: [
      { t: 'image', f: 'lisbon', frame: 'black', x: 110, y: 90, w: 270, h: 360, name: 'Lisbon in the spring', why: 'Two weeks, no laptop. Ride the 28 end to end and eat the custard tarts warm.', by: 'April 2027' },
      { t: 'image', f: 'swim', frame: 'oak', x: 470, y: 110, w: 420, h: 250, rot: -1, name: 'Open water mile', why: 'A full mile in a lake without stopping.', by: 'August', dot: true },
      { t: 'image', f: 'pottery', frame: 'polaroid', x: 985, y: 96, w: 250, h: 270, rot: 3, name: 'Wheel class', why: 'Make one bowl I would actually eat from.', by: 'Fall' },
      { t: 'image', f: 'run', frame: 'white', x: 1320, y: 88, w: 200, h: 300, name: 'Queens 10K', by: 'June' },
      { t: 'text', content: 'Say yes\nmore.', x: 84, y: 620, size: 84, rot: -3 },
      { t: 'image', f: 'cabin', frame: 'oval', x: 470, y: 480, w: 230, h: 300, name: 'A week at a cabin', why: 'Somewhere with a wood stove and no plans.', by: 'Winter' },
      { t: 'image', f: 'dinner', frame: 'black', x: 790, y: 500, w: 230, h: 300, name: 'Monthly dinner', why: 'First Sunday, our place, whoever can come.', dot: true },
      { t: 'image', f: 'books-cut', cut: true, x: 1060, y: 500, w: 200, h: 248, rot: -5, name: '24 books', why: 'Two a month, on paper.' },
      { t: 'text', content: '2027', x: 1300, y: 540, size: 116, rot: 0, color: '#c4122f' },
    ],
    tall: [
      { t: 'text', content: '2027', x: 70, y: 70, size: 150, color: '#c4122f' },
      { t: 'text', content: 'Say yes\nmore.', x: 560, y: 80, size: 70, rot: -3 },
      { t: 'image', f: 'lisbon', frame: 'black', x: 70, y: 300, w: 310, h: 410, name: 'Lisbon in the spring', why: 'Two weeks, no laptop. Ride the 28 end to end and eat the custard tarts warm.', by: 'April 2027' },
      { t: 'image', f: 'swim', frame: 'oak', x: 450, y: 320, w: 470, h: 280, rot: -1, name: 'Open water mile', why: 'A full mile in a lake without stopping.', by: 'August', dot: true },
      { t: 'image', f: 'run', frame: 'white', x: 580, y: 730, w: 250, h: 360, name: 'Queens 10K', by: 'June' },
      { t: 'image', f: 'pottery', frame: 'polaroid', x: 80, y: 860, w: 310, h: 330, rot: -3, name: 'Wheel class', why: 'Make one bowl I would actually eat from.', by: 'Fall' },
      { t: 'image', f: 'dinner', frame: 'black', x: 560, y: 1200, w: 260, h: 300, name: 'Monthly dinner', why: 'First Sunday, our place, whoever can come.', dot: true },
      { t: 'image', f: 'books-cut', cut: true, x: 130, y: 1270, w: 200, h: 248, rot: -5, name: '24 books', why: 'Two a month, on paper.' },
    ],
  };
  async function loadExample() {
    pushUndo();
    const shape = isPhone() ? 'tall' : 'wide';
    const spec = EXAMPLE[shape];
    let credits = {};
    try { credits = await (await fetch('example/credits.json')).json(); } catch (e) { /* credits are a nicety */ }
    const pieces = [];
    for (const [i, s] of spec.entries()) {
      const base = { id: 'p-' + (i + 1), x: s.x, y: s.y, rot: s.rot || 0, z: i + 1, name: s.name || '', why: s.why || '', by: s.by || '', dot: !!s.dot };
      if (s.t === 'image') {
        const file = `example/${s.f}.${s.cut ? 'png' : 'jpg'}`;
        let src;
        try { src = await readAsDataUrl(await (await fetch(file)).blob()); } catch (e) { continue; }
        const c = credits[s.f] || {};
        pieces.push(Object.assign(base, { type: 'image', src, w: s.w, h: s.h, frame: s.frame || 'none', cutout: !!s.cut, alt: c.alt || '', credit: c.name ? { name: c.name, url: c.profile } : undefined }));
      } else {
        pieces.push(Object.assign(base, { type: 'text', content: s.content, family: FONTS[0].family, size: s.size, color: s.color || PAINTS[0].ink, weight: 600, italic: false, w: 300, h: 100 }));
      }
    }
    board = Object.assign(emptyBoard(), { title: EXAMPLE.title, paint: EXAMPLE.paint, shape, pieces: pieces.map(normalizePiece), nextId: pieces.length + 1, maxZ: pieces.length });
    showTitle.value = board.title;
    selectedId = null;
    closeCard();
    applyWall();
    // Words need their real width, which needs the font.
    try { await document.fonts.load(`600 72px "Funnel Display"`); } catch (e) { /* ok */ }
    board.pieces.forEach(p => {
      if (p.type !== 'text') return;
      const x = p.x, y = p.y;
      fitTextBox(p);
      Object.assign(p, clampInside(x, y, p.w, p.h));
    });
    renderAll();
    fit();
    refreshUI();
    save();
    toast('This is an example show. Change anything, or start a new wall from the menu.', { ms: 6000 });
  }

  // ===== New wall =====
  function newWall() {
    pushUndo();
    const keepShape = board.shape;
    board = emptyBoard();
    board.shape = keepShape;
    showTitle.value = '';
    selectedId = null;
    closeCard();
    closePanel();
    applyWall();
    renderAll();
    fit();
    refreshUI();
    save();
    toast('New wall.', { action: 'Undo', onAction: undo, ms: 8000 });
  }

  // ===== Pointer input: pan, pinch, drag, resize, rotate =====
  const pointers = new Map();
  let gesture = null;      // { kind: 'pan'|'drag'|'resize'|'rot'|'pinch', ... }
  let lastTap = { t: 0, x: 0, y: 0 };

  function onPointerDown(e) {
    if (viewMode === 'walk') { walkPointerDown(e); return; }
    if (e.button && e.button !== 0) return;
    if (editingTextId && e.target.closest('.art[contenteditable="true"]')) return;
    closePop();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) { startPinch(); return; }
    if (pointers.size > 2) return;

    const handle = e.target.closest('[data-handle]');
    const pieceDom = e.target.closest('.piece');
    if (handle && selectedId) {
      e.preventDefault();
      const p = byId(selectedId);
      if (handle.dataset.handle === 'rot') startRotate(e, p);
      else startResize(e, p, handle.dataset.handle);
    } else if (pieceDom) {
      e.preventDefault();
      const id = pieceDom.dataset.id;
      const p = byId(id);
      const wasSelected = selectedId === id;
      if (!wasSelected) select(id);
      gesture = { kind: 'drag', id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false, wasSelected };
    } else {
      gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.tx, oy: view.ty, moved: false };
      stage.classList.add('panning');
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.kind === 'pinch') { movePinch(); return; }
    const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
    if (!gesture.moved && Math.hypot(dx, dy) < 4) return;

    if (gesture.kind === 'pan') {
      gesture.moved = true;
      userZoomed = true;
      setView(view.s, gesture.ox + dx, gesture.oy + dy);
    } else if (gesture.kind === 'drag') {
      const p = byId(gesture.id);
      if (!p) return;
      if (!gesture.moved) {
        gesture.moved = true;
        pushUndo();
        domOf(p.id).classList.add('dragging');
        ctxBar.hidden = true;
        closeCardOnPhone();
      }
      p.x = gesture.ox + dx / view.s;
      p.y = gesture.oy + dy / view.s;
      clampOnWall(p);
      const dom = domOf(p.id);
      dom.style.left = p.x + 'px';
      dom.style.top = p.y + 'px';
      const lbl = labelsEl.querySelector(`[data-for="${p.id}"]`);
      if (lbl) placeLabel(lbl, p);
    } else if (gesture.kind === 'resize') {
      moveResize(e);
    } else if (gesture.kind === 'rot') {
      moveRotate(e);
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (gesture && gesture.kind === 'pinch') {
      if (pointers.size < 2) gesture = null;
      if (!pointers.size) detach();
      return;
    }
    const g = gesture;
    gesture = null;
    stage.classList.remove('panning');
    if (g) {
      if (g.kind === 'pan' && !g.moved) {
        // A tap on the empty wall: deselect, and a double tap fits or zooms.
        const now = Date.now();
        if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24) {
          if (Math.abs(view.s / fitS - 1) > 0.02) fit(); else zoomAt(2.2, e.clientX, e.clientY);
          lastTap.t = 0;
        } else {
          lastTap = { t: now, x: e.clientX, y: e.clientY };
          if (selectedId) select(null);
          if (isPhone()) { closePanel(); closeCard(); }
        }
      } else if (g.kind === 'drag') {
        const dom = domOf(g.id);
        if (dom) dom.classList.remove('dragging');
        if (g.moved) { renderLabels(); save(); buildCtx(); }
        else if (g.wasSelected) {
          const p = byId(g.id);
          // Tapping a selected piece: words go into editing, anything else
          // opens its wall text.
          if (p && p.type === 'text' && (e.pointerType !== 'mouse')) startTextEdit(p.id);
          else if (p && e.pointerType !== 'mouse') openCard(p.id);
        }
      } else if (g.kind === 'resize' || g.kind === 'rot') {
        if (g.moved) {
          const p = byId(g.id);
          if (p && p.frame === 'torn') { /* percentage path still fits */ }
          renderLabels();
          save();
        }
        buildCtx();
      }
    }
    if (!pointers.size) detach();
  }
  function detach() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }
  function closeCardOnPhone() { if (isPhone() && cardForId) closeCard(); }

  function startPinch() {
    // A second finger turns whatever was happening into a pinch.
    if (gesture && gesture.kind === 'drag') {
      const dom = domOf(gesture.id);
      if (dom) dom.classList.remove('dragging');
      if (gesture.moved) { renderLabels(); save(); }
    }
    const [a, b] = [...pointers.values()];
    const r = stage.getBoundingClientRect();
    gesture = {
      kind: 'pinch',
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top,
      s0: view.s, tx0: view.tx, ty0: view.ty,
    };
    stage.classList.remove('panning');
  }
  function movePinch() {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    const r = stage.getBoundingClientRect();
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    const g = gesture;
    const s = clamp(g.s0 * d / g.d0, fitS * 0.5, Math.max(4, fitS * 8));
    const k = s / g.s0;
    userZoomed = true;
    setView(s, mx - (g.mx - g.tx0) * k, my - (g.my - g.ty0) * k);
  }

  // Resize in the piece's own rotated frame, holding the opposite corner still.
  function startResize(e, p, corner) {
    const sx = corner.includes('e') ? 1 : -1;
    const sy = corner.includes('s') ? 1 : -1;
    const r = (p.rot || 0) * Math.PI / 180;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const ax = -sx * p.w / 2, ay = -sy * p.h / 2;
    gesture = {
      kind: 'resize', id: p.id, sx: e.clientX, sy: e.clientY, moved: false,
      dirx: sx, diry: sy, r, w0: p.w, h0: p.h, size0: p.size,
      ax: cx + ax * Math.cos(r) - ay * Math.sin(r),
      ay: cy + ax * Math.sin(r) + ay * Math.cos(r),
      free: p.type === 'image' && !p.cutout && p.frame !== 'circle' && p.kind !== 'drawing',
    };
  }
  function moveResize(e) {
    const g = gesture;
    const p = byId(g.id);
    if (!p) return;
    if (!g.moved) { g.moved = true; pushUndo(); ctxBar.hidden = true; }
    const w = clientToWorld(e.clientX, e.clientY);
    const vx = w.x - g.ax, vy = w.y - g.ay;
    const lx = vx * Math.cos(-g.r) - vy * Math.sin(-g.r);
    const ly = vx * Math.sin(-g.r) + vy * Math.cos(-g.r);
    let nw, nh;
    // Photos can be cropped freely with Shift; everything else keeps its shape.
    if (g.free && e.shiftKey) {
      nw = Math.max(40, g.dirx * lx);
      nh = Math.max(40, g.diry * ly);
    } else {
      const k = Math.max(0.08, (g.dirx * lx * g.w0 + g.diry * ly * g.h0) / (g.w0 * g.w0 + g.h0 * g.h0));
      nw = g.w0 * k; nh = g.h0 * k;
      if (p.type === 'text') p.size = g.size0 * k;
    }
    const hx = g.dirx * nw / 2, hy = g.diry * nh / 2;
    const cx = g.ax + hx * Math.cos(g.r) - hy * Math.sin(g.r);
    const cy = g.ay + hx * Math.sin(g.r) + hy * Math.cos(g.r);
    Object.assign(p, { w: nw, h: nh, x: cx - nw / 2, y: cy - nh / 2 });
    renderPiece(p);
    const lbl = labelsEl.querySelector(`[data-for="${p.id}"]`);
    if (lbl) placeLabel(lbl, p);
  }

  function startRotate(e, p) {
    const dom = domOf(p.id);
    const rect = dom.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    gesture = { kind: 'rot', id: p.id, sx: e.clientX, sy: e.clientY, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), r0: p.rot || 0, moved: false };
  }
  function moveRotate(e) {
    const g = gesture;
    const p = byId(g.id);
    if (!p) return;
    if (!g.moved) { g.moved = true; pushUndo(); ctxBar.hidden = true; }
    let deg = g.r0 + (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) - g.a0) * 180 / Math.PI;
    deg = ((deg + 180) % 360 + 360) % 360 - 180;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    else for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(deg - snap) < 3) deg = snap;
    p.rot = deg;
    const dom = domOf(p.id);
    dom.style.setProperty('--rot', deg + 'deg');
    dom.style.transform = `rotate(${deg}deg)`;
    const lbl = labelsEl.querySelector(`[data-for="${p.id}"]`);
    if (lbl) placeLabel(lbl, p);
  }

  function onWheel(e) {
    if (viewMode === 'walk') return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0085)), e.clientX, e.clientY);
    } else {
      userZoomed = true;
      const m = e.deltaMode ? 24 : 1;
      setView(view.s, view.tx - e.deltaX * m, view.ty - e.deltaY * m);
    }
  }

  // ===== Keyboard =====
  function onKey(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (openDialog) {
      if (e.key === 'Tab') trapFocus(openDialog, e);
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
      return;
    }
    if (viewMode === 'walk') {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); walkStep(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); walkStep(-1); }
      else if (e.key === 'Escape') { e.preventDefault(); setViewMode(prevMode); }
      return;
    }
    if (e.key === 'Escape') {
      if (!pop.hidden) { closePop(); return; }
      if (editingTextId) { domOf(editingTextId).querySelector('.art').blur(); return; }
      if (!$('#more-menu').hidden) { closeMenu(); return; }
      if (cardForId) { closeCard(); const d = domOf(selectedId); if (d) d.focus(); return; }
      if (panelTab) { closePanel(); return; }
      if (selectedId) { select(null); return; }
      return;
    }
    const typing = e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]');
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1.25); return; }
    if (mod && e.key === '-') { e.preventDefault(); zoomBy(0.8); return; }
    if (mod && e.key === '0') { e.preventDefault(); fit(); return; }
    if (typing) {
      if (editingTextId && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); }
      return;
    }
    const p = selectedId && byId(selectedId);
    if (!p) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePiece(p.id); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicatePiece(p.id); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (p.type === 'text' && !e.shiftKey) startTextEdit(p.id); else openCard(p.id); return; }
    const step = e.shiftKey ? 20 : 4;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      if (!e.repeat) pushUndo();
      p.x += moves[e.key][0]; p.y += moves[e.key][1];
      clampOnWall(p);
      renderPiece(p);
      renderLabels();
      positionCtx();
      save();
    }
  }

  // ===== Dialogs =====
  function showDialog(el, focusEl) {
    dialogReturnFocus = document.activeElement;
    openDialog = el;
    scrim.hidden = false;
    el.hidden = false;
    setTimeout(() => (focusEl || el.querySelector('input, button')).focus(), 40);
  }
  function closeDialog() {
    if (!openDialog) return;
    const el = openDialog;
    openDialog = null;
    el.hidden = true;
    scrim.hidden = true;
    if (el.id === 'dlg-welcome') finishWelcome();
    if (el.id === 'dlg-hang') stopFilm();
    if (dialogReturnFocus && document.contains(dialogReturnFocus)) dialogReturnFocus.focus();
  }
  function trapFocus(container, e) {
    const nodes = [...container.querySelectorAll('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(n => !n.disabled && n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function finishWelcome() {
    lsSet(WELCOMED_KEY, '1');
    askWhy = $('#welcome-ask').checked;
    lsSet(ASK_KEY, askWhy ? '1' : '0');
    updateAskUI();
    const t = $('#welcome-title').value.trim();
    if (t && !showTitle.value) { showTitle.value = t; save(); }
  }

  // ===== Menu =====
  function openMenu() {
    const m = $('#more-menu');
    m.hidden = false;
    $('#btn-more').setAttribute('aria-expanded', 'true');
    m.querySelector('button').focus();
  }
  function closeMenu() {
    $('#more-menu').hidden = true;
    $('#btn-more').setAttribute('aria-expanded', 'false');
  }
  function updateAskUI() { $('#opt-ask').setAttribute('aria-checked', String(askWhy)); }

  // ===== View modes =====
  let prevMode = 'arrange';
  function setViewMode(mode) {
    if (mode === viewMode) return;
    if (mode === 'walk') {
      if (!board.pieces.length) { toast('Hang something first, then walk through it.'); syncViewSeg(); return; }
      prevMode = viewMode;
    }
    const leaving = viewMode;
    viewMode = mode;
    document.body.dataset.view = mode;
    syncViewSeg();
    if (mode === 'walk') { if (editingTextId) commitTextEdit(); closePop(); closeMenu(); startWalk(); }
    if (leaving === 'walk') { endWalk(); }
    board.pieces.forEach(p => { const d = domOf(p.id); if (d) renderSelection(d, p); });
    buildCtx();
    renderLabels();
  }
  function syncViewSeg() {
    document.querySelectorAll('#views button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.view === viewMode)));
  }

  // ===== Walk through =====
  let walkOrder = [];
  let walkIdx = -1;
  let walkSwipe = null;
  function walkList() {
    // Read the wall like a visitor: left to right, top to bottom, labeled
    // pieces first if there are any.
    const order = board.pieces.slice().sort((a, b) => {
      const ba = bbox(a), bb = bbox(b);
      const rowA = Math.round((ba.y + ba.h / 2) / (H() / 3)), rowB = Math.round((bb.y + bb.h / 2) / (H() / 3));
      return rowA - rowB || (ba.x - bb.x);
    });
    const labeled = order.filter(hasLabel);
    return labeled.length ? labeled : order.filter(p => p.type !== 'text');
  }
  function startWalk() {
    walkOrder = walkList();
    walkIdx = -1;
    $('#walk').hidden = false;
    select(null);
    closePanel();
    closeCard();
    requestAnimationFrame(() => walkShow());
  }
  function endWalk() {
    $('#walk').hidden = true;
    $('#walk-label').innerHTML = '';
    wall.style.transition = '';
    fit();
  }
  function walkStep(d) {
    walkIdx = clamp(walkIdx + d, -1, walkOrder.length);
    walkShow();
  }
  function walkShow() {
    const label = $('#walk-label');
    label.className = 'walk-label';
    label.innerHTML = '';
    const total = walkOrder.length;
    $('#walk-prev').disabled = walkIdx <= -1;
    $('#walk-next').disabled = walkIdx >= total;
    $('#walk-count').textContent = walkIdx < 0 ? 'Opening' : walkIdx >= total ? 'Closing' : `${walkIdx + 1} of ${total}`;
    const r = stage.getBoundingClientRect();
    if (walkIdx < 0 || walkIdx >= total) {
      const f = computeFitFor(r.width, r.height, 0.08);
      setView(f.s, f.tx, f.ty);
      label.classList.add('end');
      const dots = board.pieces.filter(p => p.dot).length;
      addLine(label, 'w-name', walkIdx < 0 ? (showTitle.value.trim() || 'Untitled show') : 'That is the show.');
      if (walkIdx < 0) addLine(label, 'w-why', `${board.pieces.length} pieces. Use the arrows, or swipe, to walk the wall.`);
      else addLine(label, 'w-why', dots ? `${dots} of ${board.pieces.length} have a red dot so far.` : 'No red dots yet. Give it time.');
      if (dots && walkIdx >= total) label.appendChild(Object.assign(document.createElement('span'), { className: 'w-dot' }));
      return;
    }
    const p = walkOrder[walkIdx];
    const b = bbox(p);
    // Frame the piece in the space the label leaves free.
    const phone = isPhone();
    const freeTop = 24, freeBottom = phone ? 260 : 120;
    const freeLeft = phone ? 16 : 480, freeRight = 40;
    const aw = r.width - freeLeft - freeRight, ah = r.height - freeTop - freeBottom;
    const s = Math.min(aw / b.w, ah / b.h, fitS * 6) * 0.86;
    const tx = freeLeft + aw / 2 - (b.x + b.w / 2) * s;
    const ty = freeTop + ah / 2 - (b.y + b.h / 2) * s;
    setView(s, tx, ty);
    if (p.name || p.why || p.by) {
      if (p.name) addLine(label, 'w-name', p.name);
      if (p.why) addLine(label, p.name ? 'w-why' : 'w-name', p.why);
      if (p.by) addLine(label, 'w-by', p.by);
    } else {
      addLine(label, 'w-name', describe(p));
    }
    if (p.dot) label.appendChild(Object.assign(document.createElement('span'), { className: 'w-dot', title: 'Yours' }));
  }
  function addLine(parent, cls, text) {
    const el = document.createElement('p');
    el.className = cls;
    el.textContent = text;
    parent.appendChild(el);
  }
  function computeFitFor(w, h, pad) {
    const s = Math.min(w * (1 - pad * 2) / W(), h * (1 - pad * 2 - (isPhone() ? 0.2 : 0.08)) / H());
    return { s, tx: (w - W() * s) / 2, ty: (h * (isPhone() ? 0.78 : 0.94) - H() * s) / 2 };
  }
  function walkPointerDown(e) {
    if (e.target.closest('.walk-nav, .walk-label')) return;
    walkSwipe = { x: e.clientX, y: e.clientY };
    const up = (ev) => {
      window.removeEventListener('pointerup', up);
      if (!walkSwipe) return;
      const dx = ev.clientX - walkSwipe.x;
      walkSwipe = null;
      if (Math.abs(dx) > 50) walkStep(dx < 0 ? 1 : -1);
      else walkStep(ev.clientX > window.innerWidth / 2 ? 1 : -1);
    };
    window.addEventListener('pointerup', up);
  }

  // ===== Draw =====
  let drawCtx = null, drawRect = null, strokes = [], stroke = null;
  let drawColor = '#1c1b19', drawSize = 8;
  function enterDraw() {
    select(null);
    closePanel();
    closeCard();
    const el = $('#draw');
    el.hidden = false;
    $('#dock').hidden = true;
    const c = $('#draw-canvas');
    drawRect = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = drawRect.width * dpr;
    c.height = drawRect.height * dpr;
    drawCtx = c.getContext('2d');
    drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';
    strokes = [];
    drawColor = paint().ink === '#1c1b19' ? '#1c1b19' : '#f1ede4';
    const row = $('#draw-colors');
    row.innerHTML = '';
    INKS.slice(0, 7).forEach(col => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', INK_NAMES[col]);
      b.setAttribute('aria-checked', String(col === drawColor));
      b.style.setProperty('--sw', col);
      b.addEventListener('click', () => {
        drawColor = col;
        row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      });
      row.appendChild(b);
    });
  }
  function exitDraw(keep) {
    const c = $('#draw-canvas');
    if (keep && strokes.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      strokes.forEach(s => s.pts.forEach(pt => {
        minX = Math.min(minX, pt.x - s.size); minY = Math.min(minY, pt.y - s.size);
        maxX = Math.max(maxX, pt.x + s.size); maxY = Math.max(maxY, pt.y + s.size);
      }));
      const cw = maxX - minX, ch = maxY - minY;
      // Render at the resolution it will hang at (at least 2x of the wall).
      const k = Math.max(2, 2 / view.s * 0.5);
      const crop = document.createElement('canvas');
      crop.width = Math.ceil(cw * k); crop.height = Math.ceil(ch * k);
      const cx = crop.getContext('2d');
      cx.scale(k, k);
      cx.lineCap = 'round'; cx.lineJoin = 'round';
      strokes.forEach(s => paintStroke(cx, s, -minX, -minY));
      const tl = clientToWorld(drawRect.left + minX, drawRect.top + minY);
      addPiece({
        type: 'image', kind: 'drawing', frame: 'none', src: crop.toDataURL('image/png'),
        x: tl.x, y: tl.y, w: cw / view.s, h: ch / view.s, rot: 0, alt: 'Drawing',
      });
    }
    $('#draw').hidden = true;
    $('#dock').hidden = false;
    drawCtx = null;
    strokes = [];
    c.width = c.width; // clear
  }
  function paintStroke(ctx, s, ox, oy) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    s.pts.forEach((pt, i) => {
      const x = pt.x + (ox || 0), y = pt.y + (oy || 0);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    if (s.pts.length === 1) ctx.lineTo(s.pts[0].x + (ox || 0) + 0.01, s.pts[0].y + (oy || 0));
    ctx.stroke();
  }
  function redrawStrokes() {
    const c = $('#draw-canvas');
    drawCtx.clearRect(0, 0, c.width, c.height);
    strokes.forEach(s => paintStroke(drawCtx, s));
  }

  // ===== Hang the show (export) =====
  let hangFmt = 'poster';
  let hangCache = {};
  let hangBlobs = {};
  let filmStop = null;
  const FILM_MAX = 7, FILM_OPEN = 1500, FILM_HOLD = 1300, FILM_CLOSE = 1700, FILM_MOVE = 600;

  async function captureWall(withLabels) {
    const key = withLabels ? 'labels' : 'bare';
    if (hangCache[key]) return hangCache[key];
    const prevSel = selectedId;
    select(null);
    labelsEl.style.display = withLabels ? '' : 'none';
    try {
      if (!window.htmlToImage) throw new Error('export library not loaded');
      if (fontEmbedCSS === null) {
        try { fontEmbedCSS = await htmlToImage.getFontEmbedCSS(wall); } catch (e) { fontEmbedCSS = ''; }
      }
      const opts = {
        pixelRatio: 2,
        width: W(), height: H(),
        style: { transform: 'none', left: '0', top: '0' },
        fontEmbedCSS: fontEmbedCSS || undefined,
        filter: (n) => !(n.classList && (n.classList.contains('sel-box') || n.id === 'wall-empty')),
      };
      // Safari draws foreignObject images lazily; the first pass often comes
      // back with holes where photos should be.
      if (/Apple/.test(navigator.vendor)) { try { await htmlToImage.toCanvas(wall, Object.assign({}, opts, { pixelRatio: 0.25 })); } catch (e) { /* warm-up only */ } }
      const url = await htmlToImage.toPng(wall, opts);
      const img = await loadImg(url);
      hangCache[key] = img;
      return img;
    } finally {
      labelsEl.style.display = '';
      if (prevSel && byId(prevSel)) select(prevSel);
    }
  }

  async function fontsReady() {
    try {
      await Promise.all([
        document.fonts.load('600 120px "Funnel Display"'),
        document.fonts.load('400 40px "Host Grotesk"'),
        document.fonts.load('italic 500 40px "Host Grotesk"'),
        document.fonts.load('600 40px "Host Grotesk"'),
      ]);
    } catch (e) { /* draw with fallbacks */ }
  }

  function wrapText(ctx, text, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach(w => {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
      else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }
  function today() {
    return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  async function renderPoster() {
    const img = await captureWall(false);
    await fontsReady();
    const PW = 3600, PH = 4800, M = 240;
    const c = document.createElement('canvas');
    c.width = PW; c.height = PH;
    const x = c.getContext('2d');
    x.fillStyle = '#f4f1ea';
    x.fillRect(0, 0, PW, PH);
    // Kicker with the red dot
    x.fillStyle = '#c4122f';
    x.beginPath(); x.arc(M + 22, M + 22, 22, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#55524b';
    x.font = '600 52px "Host Grotesk", sans-serif';
    x.textBaseline = 'middle';
    x.fillText('VISIONBORT', M + 68, M + 24);
    x.textAlign = 'right';
    x.fillText(today().toUpperCase(), PW - M, M + 24);
    x.textAlign = 'left';
    // Title
    const title = showTitle.value.trim() || 'Untitled show';
    let fs = 340;
    x.font = `600 ${fs}px "Funnel Display", sans-serif`;
    while (x.measureText(title).width > PW - M * 2 && fs > 120) { fs -= 10; x.font = `600 ${fs}px "Funnel Display", sans-serif`; }
    x.fillStyle = '#1c1b19';
    x.textBaseline = 'alphabetic';
    x.fillText(title, M - fs * 0.04, M + 120 + fs * 0.82);
    // The wall
    const top = M + 220 + fs;
    const listH = 1100;
    const availW = PW - M * 2, availH = PH - top - listH - M;
    const k = Math.min(availW / img.width, availH / img.height);
    const ww = img.width * k, wh = img.height * k;
    const wx = (PW - ww) / 2, wy = top;
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.28)'; x.shadowBlur = 60; x.shadowOffsetY = 24;
    x.drawImage(img, wx, wy, ww, wh);
    x.restore();
    // Wall text in the margin, two columns
    const items = walkList().filter(hasLabel);
    const colW = (PW - M * 2 - 160) / 2;
    let col = 0, cy = wy + wh + 170;
    const startY = cy;
    const maxY = PH - M - 120;
    items.forEach((p, i) => {
      x.font = '500 italic 58px "Host Grotesk", sans-serif';
      const name = p.name || shorten(p.why, 60);
      const nameLines = wrapText(x, name, colW - 110);
      x.font = '400 46px "Host Grotesk", sans-serif';
      const whyLines = p.name && p.why ? wrapText(x, p.why, colW - 110).slice(0, 3) : [];
      const hBlock = nameLines.length * 70 + whyLines.length * 60 + (p.by ? 70 : 0) + 70;
      if (cy + hBlock > maxY) { if (col === 0) { col = 1; cy = startY; } else return; }
      const cx0 = M + col * (colW + 160);
      x.fillStyle = '#8a867e';
      x.font = '600 44px "Host Grotesk", sans-serif';
      x.fillText(String(i + 1).padStart(2, '0'), cx0, cy + 50);
      if (p.dot) { x.fillStyle = '#c4122f'; x.beginPath(); x.arc(cx0 + 30, cy + 100, 17, 0, Math.PI * 2); x.fill(); }
      let ly = cy + 50;
      x.fillStyle = '#1c1b19';
      x.font = '500 italic 58px "Host Grotesk", sans-serif';
      nameLines.forEach(l => { x.fillText(l, cx0 + 110, ly); ly += 70; });
      x.fillStyle = '#55524b';
      x.font = '400 46px "Host Grotesk", sans-serif';
      whyLines.forEach(l => { x.fillText(l, cx0 + 110, ly); ly += 60; });
      if (p.by) {
        x.font = '600 38px "Host Grotesk", sans-serif';
        x.fillStyle = '#6f6b63';
        x.fillText(p.by.toUpperCase(), cx0 + 110, ly + 6);
        ly += 70;
      }
      cy = ly + 50;
    });
    // Footer
    x.fillStyle = '#8a867e';
    x.font = '500 40px "Host Grotesk", sans-serif';
    x.fillText('Hung with Visionbort, middleton.io/visionbort', M, PH - M + 60);
    return c;
  }

  async function renderLock() {
    const img = await captureWall(false);
    await fontsReady();
    const LW = 1179, LH = 2556;
    const c = document.createElement('canvas');
    c.width = LW; c.height = LH;
    const x = c.getContext('2d');
    if (board.wallpaper) {
      const bg = await loadImg(board.wallpaper);
      const k = Math.max(LW / bg.width, LH / bg.height);
      x.drawImage(bg, (LW - bg.width * k) / 2, (LH - bg.height * k) / 2, bg.width * k, bg.height * k);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, LW, LH);
    } else {
      x.fillStyle = paint().hex;
      x.fillRect(0, 0, LW, LH);
      const g = x.createRadialGradient(LW / 2, -LH * 0.1, 10, LW / 2, LH * 0.1, LH * 0.7);
      g.addColorStop(0, 'rgba(255,246,225,0.22)'); g.addColorStop(1, 'rgba(255,246,225,0)');
      x.fillStyle = g; x.fillRect(0, 0, LW, LH);
    }
    // Clock and widgets live in the top third; leave it alone.
    const top = LH * 0.34, bottom = LH * 0.88, M = 64;
    const k = Math.min((LW - M * 2) / img.width, (bottom - top) / img.height);
    const ww = img.width * k, wh = img.height * k;
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 40; x.shadowOffsetY = 16;
    x.drawImage(img, (LW - ww) / 2, top + (bottom - top - wh) / 2, ww, wh);
    x.restore();
    const title = showTitle.value.trim();
    if (title) {
      x.fillStyle = paint().tone === 'light' && !board.wallpaper ? '#1c1b19' : '#f1ede4';
      x.font = '600 52px "Funnel Display", sans-serif';
      x.textAlign = 'center';
      x.fillText(title, LW / 2, LH * 0.925);
    }
    return c;
  }

  async function renderWallOnly() {
    const img = await captureWall(true);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }

  function canvasBlob(c, type, q) {
    return new Promise((resolve) => c.toBlob(resolve, type || 'image/png', q));
  }

  // ----- The film: real-time render of a canvas into MediaRecorder -----
  function filmMime() {
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    return (window.MediaRecorder && types.find(t => MediaRecorder.isTypeSupported(t))) || '';
  }
  async function renderFilm(onProgress) {
    const mime = filmMime();
    if (!mime) throw new Error('This browser cannot record video.');
    const img = await captureWall(false);
    await fontsReady();
    const FW = 1080, FH = 1920;
    const c = document.createElement('canvas');
    c.width = FW; c.height = FH;
    const x = c.getContext('2d');
    const list = walkList().slice(0, FILM_MAX);
    const k0 = img.width / W(); // capture pixels per world unit
    const bg = board.wallpaper ? '#1c1b19' : paint().hex;
    // Shots: an establishing view, each piece, then the closing view.
    const overview = () => {
      const s = Math.min(FW * 0.9 / img.width, FH * 0.55 / img.height);
      return { s, cx: img.width / 2, cy: img.height / 2 };
    };
    const shots = [{ cam: overview(), hold: FILM_OPEN, kind: 'open' }];
    list.forEach(p => {
      const b = bbox(p);
      const s = Math.min(FW * 0.78 / (b.w * k0), FH * 0.5 / (b.h * k0));
      shots.push({ cam: { s, cx: (b.x + b.w / 2) * k0, cy: (b.y + b.h / 2) * k0 }, hold: FILM_HOLD, p });
    });
    shots.push({ cam: overview(), hold: FILM_CLOSE, kind: 'close' });
    const MOVE = FILM_MOVE;
    const total = shots.reduce((t, s) => t + s.hold + MOVE, 0);
    const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const camAt = (ms) => {
      let t = 0;
      for (let i = 0; i < shots.length; i++) {
        const sh = shots[i];
        const prev = shots[i - 1] ? shots[i - 1].cam : sh.cam;
        if (ms < t + MOVE) {
          const u = ease((ms - t) / MOVE);
          const s = prev.s + (sh.cam.s - prev.s) * u;
          return { cam: { s, cx: prev.cx + (sh.cam.cx - prev.cx) * u, cy: prev.cy + (sh.cam.cy - prev.cy) * u }, shot: sh, settle: 0 };
        }
        t += MOVE;
        if (ms < t + sh.hold) return { cam: sh.cam, shot: sh, settle: (ms - t) / sh.hold };
        t += sh.hold;
      }
      const last = shots[shots.length - 1];
      return { cam: last.cam, shot: last, settle: 1 };
    };
    const title = showTitle.value.trim() || 'Untitled show';
    const drawFrame = (ms) => {
      const { cam, shot, settle } = camAt(ms);
      x.fillStyle = bg; x.fillRect(0, 0, FW, FH);
      const cy = FH * 0.42;
      x.save();
      x.translate(FW / 2, cy);
      x.scale(cam.s, cam.s);
      x.translate(-cam.cx, -cam.cy);
      x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 30 / cam.s;
      x.drawImage(img, 0, 0);
      x.restore();
      const alpha = Math.min(1, settle * 4);
      if (alpha <= 0) return;
      x.globalAlpha = alpha;
      const cardX = 72, cardW = FW - 144;
      if (shot.kind) {
        x.fillStyle = '#fbfaf7';
        const ch = shot.kind === 'open' ? 300 : 300;
        x.fillRect(cardX, FH - 120 - ch, cardW, ch);
        x.fillStyle = '#1c1b19';
        x.font = '600 76px "Funnel Display", sans-serif';
        x.fillText(shot.kind === 'open' ? title : 'That is the show.', cardX + 48, FH - 120 - ch + 120, cardW - 96);
        x.fillStyle = '#55524b';
        x.font = '400 40px "Host Grotesk", sans-serif';
        const dots = board.pieces.filter(p => p.dot).length;
        const sub = shot.kind === 'open' ? `${list.length} pieces on the wall` : (dots ? `${dots} red dots so far` : 'Hung with Visionbort');
        x.fillText(sub, cardX + 48, FH - 120 - ch + 200, cardW - 96);
        if (shot.kind === 'close' && dots) { x.fillStyle = '#c4122f'; x.beginPath(); x.arc(cardX + cardW - 10, FH - 120 - ch + 10, 24, 0, Math.PI * 2); x.fill(); }
      } else if (shot.p) {
        const p = shot.p;
        x.font = '500 italic 54px "Host Grotesk", sans-serif';
        const nameLines = wrapText(x, p.name || shorten(p.why, 70) || describe(p), cardW - 96).slice(0, 2);
        x.font = '400 38px "Host Grotesk", sans-serif';
        const whyLines = p.name && p.why ? wrapText(x, p.why, cardW - 96).slice(0, 3) : [];
        const ch = 80 + nameLines.length * 66 + whyLines.length * 52 + (p.by ? 70 : 0) + 30;
        const top = FH - 120 - ch;
        x.fillStyle = '#fbfaf7';
        x.fillRect(cardX, top, cardW, ch);
        let ly = top + 96;
        x.fillStyle = '#1c1b19';
        x.font = '500 italic 54px "Host Grotesk", sans-serif';
        nameLines.forEach(l => { x.fillText(l, cardX + 48, ly); ly += 66; });
        x.fillStyle = '#55524b';
        x.font = '400 38px "Host Grotesk", sans-serif';
        whyLines.forEach(l => { x.fillText(l, cardX + 48, ly); ly += 52; });
        if (p.by) { x.font = '600 32px "Host Grotesk", sans-serif'; x.fillText(p.by.toUpperCase(), cardX + 48, ly + 20); }
        if (p.dot) {
          x.fillStyle = '#fbfaf7'; x.beginPath(); x.arc(cardX + cardW - 6, top + 6, 30, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#c4122f'; x.beginPath(); x.arc(cardX + cardW - 6, top + 6, 24, 0, Math.PI * 2); x.fill();
        }
      }
      x.globalAlpha = 1;
    };
    drawFrame(0);
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((resolve) => { rec.onstop = resolve; });
    let stopped = false;
    filmStop = () => { stopped = true; if (rec.state !== 'inactive') rec.stop(); };
    rec.start(250);
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        if (stopped) return resolve();
        const ms = performance.now() - t0;
        drawFrame(Math.min(ms, total));
        if (onProgress) onProgress(Math.min(1, ms / total));
        if (ms >= total + 200) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    if (rec.state !== 'inactive') rec.stop();
    await done;
    filmStop = null;
    if (stopped && !chunks.length) return null;
    return new Blob(chunks, { type: mime.split(';')[0] });
  }
  function stopFilm() { if (filmStop) filmStop(); }
  function filmSeconds() {
    const n = walkList().slice(0, FILM_MAX).length;
    return Math.round((FILM_OPEN + FILM_CLOSE + n * FILM_HOLD + (n + 2) * FILM_MOVE) / 1000);
  }

  async function openHang() {
    if (!board.pieces.length) return;
    if (editingTextId) commitTextEdit();
    hangCache = {};
    hangBlobs = {};
    showDialog($('#dlg-hang'), $(`.hang-choice[data-fmt="${hangFmt}"]`));
    previewHang();
  }
  let hangSeq = 0;
  async function previewHang() {
    const seq = ++hangSeq;
    const frame = $('#hang-frame');
    const cap = $('#hang-cap');
    const saveBtn = $('#hang-save');
    stopFilm();
    saveBtn.disabled = true;
    document.querySelectorAll('.hang-choice').forEach(b => b.setAttribute('aria-checked', String(b.dataset.fmt === hangFmt)));
    frame.innerHTML = '<div class="spinner" aria-hidden="true"></div>';
    if (hangBlobs[hangFmt]) return showHangResult(hangBlobs[hangFmt]);
    try {
      let blob;
      if (hangFmt === 'film') {
        cap.textContent = 'Filming the walkthrough. This plays in real time.';
        blob = await renderFilm((u) => { if (seq === hangSeq) cap.textContent = `Filming the walkthrough, ${Math.round(u * 100)}%`; });
        if (!blob) return;
      } else {
        cap.textContent = 'Preparing a preview';
        const c = hangFmt === 'poster' ? await renderPoster() : hangFmt === 'lock' ? await renderLock() : await renderWallOnly();
        blob = await canvasBlob(c, 'image/jpeg', 0.92);
      }
      if (seq !== hangSeq) return;
      hangBlobs[hangFmt] = blob;
      showHangResult(blob);
    } catch (e) {
      if (seq !== hangSeq) return;
      frame.innerHTML = '';
      cap.textContent = hangFmt === 'film' && !filmMime()
        ? 'This browser cannot record video. Try Chrome or Safari on a computer.'
        : 'That did not render. Try again, or pick another format.';
    }
  }
  function showHangResult(blob) {
    const frame = $('#hang-frame');
    const url = URL.createObjectURL(blob);
    frame.innerHTML = '';
    if (hangFmt === 'film') {
      const v = document.createElement('video');
      v.src = url; v.controls = true; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      frame.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Preview';
      frame.appendChild(img);
    }
    const caps = { poster: '18 by 24 inches at 200 dpi, ready to print', lock: 'Sized for a phone lock screen', wall: 'The whole wall at 2x', film: `A vertical walkthrough, about ${filmSeconds()} seconds` };
    $('#hang-cap').textContent = caps[hangFmt];
    $('#hang-save').disabled = false;
  }
  async function saveHang() {
    const blob = hangBlobs[hangFmt];
    if (!blob) return;
    const base = (showTitle.value.trim() || 'visionbort').replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'visionbort';
    const ext = hangFmt === 'film' ? (blob.type.includes('mp4') ? 'mp4' : 'webm') : 'jpg';
    const name = `${base}-${hangFmt === 'lock' ? 'lock-screen' : hangFmt}.${ext}`;
    const file = new File([blob], name, { type: blob.type });
    // On phones the share sheet is where Save Image lives.
    const touch = window.matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: showTitle.value.trim() || 'Visionbort' }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Saved ' + name);
  }

  // ===== Toasts =====
  function toast(msg, opts) {
    opts = opts || {};
    const region = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast' + (opts.error ? ' error' : '');
    const s = document.createElement('span');
    s.textContent = msg;
    t.appendChild(s);
    if (opts.action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opts.action;
      b.addEventListener('click', () => { t.remove(); opts.onAction(); });
      t.appendChild(b);
    }
    region.appendChild(t);
    while (region.children.length > 2) region.firstChild.remove();
    setTimeout(() => t.remove(), opts.ms || 4500);
  }

  function refreshUI() {
    updateEmpty();
    updateUndoButtons();
    buildCtx();
  }

  // ===== Events =====
  function bind() {
    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('dblclick', (e) => {
      const pd = e.target.closest('.piece');
      if (!pd) return;
      const p = byId(pd.dataset.id);
      if (p && p.type === 'text') startTextEdit(p.id);
      else if (p) openCard(p.id);
    });
    // Safari's own pinch gestures fight ours.
    ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, (e) => e.preventDefault()));
    document.addEventListener('keydown', onKey);
    piecesEl.addEventListener('focusin', (e) => {
      const pd = e.target.closest('.piece');
      if (pd && pd.dataset.id !== selectedId && !gesture) select(pd.dataset.id);
    });
    window.addEventListener('resize', () => { refitIfAuto(); positionCtx(); });

    // Paste images, including subjects lifted out of photos.
    document.addEventListener('paste', (e) => {
      if (e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]')) return;
      const files = [...(e.clipboardData ? e.clipboardData.items : [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile());
      if (files.length) { e.preventDefault(); hangFiles(files); }
    });
    // Drag and drop
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#drop-hint').hidden = false; } });
    window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop-hint').hidden = true; });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      $('#drop-hint').hidden = true;
      if (e.dataTransfer.files.length) hangFiles(e.dataTransfer.files);
    });

    // Top bar
    showTitle.addEventListener('input', save);
    showTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter') showTitle.blur(); });
    $('#btn-undo').addEventListener('click', undo);
    $('#btn-redo').addEventListener('click', redo);
    $('#btn-hang').addEventListener('click', openHang);
    $('#btn-more').addEventListener('click', (e) => { e.stopPropagation(); $('#more-menu').hidden ? openMenu() : closeMenu(); });
    document.addEventListener('click', (e) => {
      if (!$('#more-menu').hidden && !e.target.closest('.menu-wrap')) closeMenu();
      if (!pop.hidden && !e.target.closest('#pop') && !e.target.closest('#ctx')) closePop();
    });
    $('#opt-ask').addEventListener('click', () => { askWhy = !askWhy; lsSet(ASK_KEY, askWhy ? '1' : '0'); updateAskUI(); });
    $('#opt-example').addEventListener('click', () => { closeMenu(); loadExample(); });
    $('#opt-new').addEventListener('click', () => { closeMenu(); showDialog($('#dlg-new'), $('#new-cancel')); });
    $('#new-cancel').addEventListener('click', closeDialog);
    $('#new-go').addEventListener('click', () => { closeDialog(); newWall(); });
    document.querySelectorAll('#views button').forEach(b => b.addEventListener('click', () => setViewMode(b.dataset.view)));

    // Zoom
    $('#zoom-in').addEventListener('click', () => zoomBy(1.25));
    $('#zoom-out').addEventListener('click', () => zoomBy(0.8));
    $('#zoom-fit').addEventListener('click', fit);

    // Dock
    $('#tool-photos').addEventListener('click', () => fileInput.click());
    $('#tool-find').addEventListener('click', () => openPanel('find'));
    $('#tool-stickers').addEventListener('click', () => openPanel('stickers'));
    $('#tool-words').addEventListener('click', () => { if (isPhone()) closePanel(); addWords(); });
    $('#tool-draw').addEventListener('click', enterDraw);
    $('#tool-wall').addEventListener('click', () => openPanel('wall'));
    fileInput.addEventListener('change', () => { hangFiles(fileInput.files); fileInput.value = ''; });

    // Panel
    $('#panel-close').addEventListener('click', closePanel);
    $('#find-input').addEventListener('input', (e) => {
      clearTimeout(findTimer);
      const q = e.target.value.trim();
      if (q.length < 2) return;
      findTimer = setTimeout(() => find(q), 380);
    });
    document.querySelectorAll('#shape-seg button').forEach(b => b.addEventListener('click', () => setShape(b.dataset.shape)));
    $('#wp-upload').addEventListener('click', () => wallpaperInput.click());
    wallpaperInput.addEventListener('change', async () => {
      const f = wallpaperInput.files[0];
      wallpaperInput.value = '';
      if (!f) return;
      try {
        const src = await readAsDataUrl(f);
        const img = await loadImg(src);
        const k = Math.min(WALLPAPER_EDGE / img.naturalWidth, WALLPAPER_EDGE / img.naturalHeight, 1);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        pushUndo();
        board.wallpaper = c.toDataURL('image/jpeg', 0.84);
        applyWall();
        save();
      } catch (e) { toast('That file could not be read as an image.', { error: true }); }
    });
    $('#wp-clear').addEventListener('click', () => { pushUndo(); board.wallpaper = null; applyWall(); save(); });
    $('#opt-light').addEventListener('change', (e) => { pushUndo(); board.light = e.target.checked; applyWall(); save(); });

    // Card
    $('#card-close').addEventListener('click', () => { closeCard(); });
    $('#card-why').addEventListener('input', (e) => cardEdit('why', e.target.value));
    $('#card-name').addEventListener('input', (e) => cardEdit('name', e.target.value));
    $('#card-by').addEventListener('input', (e) => cardEdit('by', e.target.value));
    ['#card-why', '#card-name', '#card-by'].forEach(s => $(s).addEventListener('blur', (e) => {
      const p = byId(cardForId);
      const field = { 'card-why': 'why', 'card-name': 'name', 'card-by': 'by' }[e.target.id];
      if (p && p[field] !== p[field].trim()) { p[field] = p[field].trim(); renderLabels(); save(); }
    }));
    $('#card-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#card-by').focus(); });
    $('#card-by').addEventListener('keydown', (e) => { if (e.key === 'Enter') closeCard(); });
    $('#card-dot').addEventListener('click', () => {
      const p = byId(cardForId);
      if (!p) return;
      pushUndo();
      cardDirty = true;
      p.dot = !p.dot;
      p.dotAt = p.dot ? new Date().toISOString().slice(0, 10) : undefined;
      setDotUI(p.dot);
      renderLabels(p.dot ? p.id : null);
      const dom = domOf(p.id);
      if (dom) dom.setAttribute('aria-label', describe(p));
      save();
      if (p.dot) toast('Red dot. It’s yours.');
    });

    // Walk
    $('#walk-prev').addEventListener('click', () => walkStep(-1));
    $('#walk-next').addEventListener('click', () => walkStep(1));
    $('#walk-exit').addEventListener('click', () => setViewMode(prevMode));

    // Draw
    const dc = $('#draw-canvas');
    dc.addEventListener('pointerdown', (e) => {
      if (!drawCtx) return;
      dc.setPointerCapture(e.pointerId);
      stroke = { pts: [{ x: e.clientX - drawRect.left, y: e.clientY - drawRect.top }], color: drawColor, size: drawSize };
      strokes.push(stroke);
      redrawStrokes();
    });
    dc.addEventListener('pointermove', (e) => {
      if (!stroke) return;
      stroke.pts.push({ x: e.clientX - drawRect.left, y: e.clientY - drawRect.top });
      const n = stroke.pts.length;
      drawCtx.strokeStyle = stroke.color;
      drawCtx.lineWidth = stroke.size;
      drawCtx.beginPath();
      drawCtx.moveTo(stroke.pts[n - 2].x, stroke.pts[n - 2].y);
      drawCtx.lineTo(stroke.pts[n - 1].x, stroke.pts[n - 1].y);
      drawCtx.stroke();
    });
    const endStroke = () => { stroke = null; };
    dc.addEventListener('pointerup', endStroke);
    dc.addEventListener('pointercancel', endStroke);
    $('#draw-undo').addEventListener('click', () => { strokes.pop(); redrawStrokes(); });
    $('#draw-cancel').addEventListener('click', () => exitDraw(false));
    $('#draw-done').addEventListener('click', () => exitDraw(true));
    document.querySelectorAll('.draw-sizes button').forEach(b => b.addEventListener('click', () => {
      drawSize = +b.dataset.size;
      document.querySelectorAll('.draw-sizes button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    }));

    // Dialogs
    scrim.addEventListener('click', () => { if (openDialog && openDialog.id !== 'dlg-welcome') closeDialog(); });
    $('#welcome-photos').addEventListener('click', () => { closeDialog(); fileInput.click(); });
    $('#welcome-empty').addEventListener('click', closeDialog);
    $('#welcome-example').addEventListener('click', () => { closeDialog(); loadExample(); });
    $('#welcome-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closeDialog(); } });
    $('#hang-close').addEventListener('click', closeDialog);
    document.querySelectorAll('.hang-choice').forEach(b => b.addEventListener('click', () => {
      if (hangFmt === b.dataset.fmt) return;
      hangFmt = b.dataset.fmt;
      previewHang();
    }));
    $('#hang-save').addEventListener('click', saveHang);
  }

  // ===== Helpers =====
  function tornPath() {
    const pts = [];
    const steps = 18;
    const r = (a, b) => (a + Math.random() * (b - a)).toFixed(1);
    for (let i = 0; i <= steps; i++) pts.push(`${(i / steps * 100).toFixed(1)}% ${r(0, 3)}%`);
    for (let i = 1; i <= steps; i++) pts.push(`${r(97, 100)}% ${(i / steps * 100).toFixed(1)}%`);
    for (let i = steps; i >= 0; i--) pts.push(`${(i / steps * 100).toFixed(1)}% ${r(97, 100)}%`);
    for (let i = steps - 1; i >= 1; i--) pts.push(`${r(0, 3)}% ${(i / steps * 100).toFixed(1)}%`);
    return `polygon(${pts.join(', ')})`;
  }
  function legacyClip(shape, w, h) {
    const m = Math.min(w, h), cx = w / 2, cy = h / 2;
    if (shape === 'diamond') return `polygon(${cx}px ${cy - m * 0.48}px, ${cx + m * 0.48}px ${cy}px, ${cx}px ${cy + m * 0.48}px, ${cx - m * 0.48}px ${cy}px)`;
    const pts = [];
    if (shape === 'star') {
      const R = m * 0.48, r = m * 0.2;
      for (let i = 0; i < 5; i++) {
        const a = (i * 72 - 90) * Math.PI / 180, b = (i * 72 + 36 - 90) * Math.PI / 180;
        pts.push(`${cx + R * Math.cos(a)}px ${cy + R * Math.sin(a)}px`, `${cx + r * Math.cos(b)}px ${cy + r * Math.sin(b)}px`);
      }
    } else {
      const r = m * 0.45;
      for (let i = 0; i <= 30; i++) {
        const t = i / 30 * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        pts.push(`${cx + x * r / 17}px ${cy + y * r / 17 - r * 0.1}px`);
      }
    }
    return `polygon(${pts.join(', ')})`;
  }

  // ===== Boot =====
  async function init() {
    renderStickers();
    renderPaints();
    bind();
    const legacyMode = lsGet(LEGACY_MODE_KEY);
    const ask = lsGet(ASK_KEY);
    askWhy = ask != null ? ask === '1' : legacyMode ? legacyMode === 'intentional' : true;
    updateAskUI();
    const migrated = await loadBoard();
    showTitle.value = board.title || '';
    applyWall();
    renderAll();
    document.body.dataset.view = viewMode;
    fit();
    refreshUI();
    // Words were measured before the web fonts arrived; measure again.
    document.fonts && document.fonts.ready.then(() => {
      board.pieces.forEach(p => { if (p.type === 'text') { const d = domOf(p.id); if (d) renderPiece(p); } });
      renderLabels();
    });
    if (migrated) {
      save();
      toast('Your board is hanging on a gallery wall now. Everything came with it.', { ms: 7000 });
      lsSet(WELCOMED_KEY, '1');
    } else if (!board.pieces.length && !lsGet(WELCOMED_KEY) && !legacyMode) {
      $('#welcome-ask').checked = askWhy;
      showDialog($('#dlg-welcome'), $('#welcome-title'));
    }
  }
  init();
})();
