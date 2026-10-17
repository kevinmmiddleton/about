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

  // A v2 board has been written in this browser at least once. After that,
  // the v1 board is history: if storage can't be read on some later load,
  // the answer is "try again", never "quietly restore last year's board".
  const V2_FLAG = 'visionbort-v2';
  let lastSavedAt = 0;      // savedAt of the board this tab last loaded or wrote
  let loadFailed = false;   // storage unreadable: don't overwrite what's there
  const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('visionbort') : null;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeBoard, 250);
  }
  // Write now. Used when the tab is about to go away. An IndexedDB write is
  // asynchronous and dies with the page on a reload, so a synchronous
  // localStorage copy goes down first; readStored() takes whichever is newer,
  // and the next good IndexedDB write clears it.
  // The synchronous copy has to fit in localStorage, which a board of photos
  // doesn't. Image bytes already in the last IndexedDB write are replaced by
  // a reference; readStored() fills them back in from that copy.
  const REF = '@saved';
  function flushSave() {
    if (!saveTimer || loadFailed) return;
    clearTimeout(saveTimer);
    board.title = showTitle.value.trim();
    board.savedAt = Date.now();
    const slim = Object.assign({}, board, {
      refs: true,
      pieces: board.pieces.map(p => (p.src && p.src.length > 2048 && base.srcs.get(p.id) === srcSig(p.src)) ? Object.assign({}, p, { src: REF }) : p),
      wallpaper: board.wallpaper && board.wallpaper.length > 2048 && base.wallpaperSig === srcSig(board.wallpaper) ? REF : board.wallpaper,
    });
    lsSet(BOARD_KEY, JSON.stringify(slim));
    writeBoard(board.savedAt);
  }
  function srcSig(src) { return src ? String(src).length + ':' + String(src).slice(-48) : ''; }

  // The v1 board is kept as a backup, but in localStorage it can fill the
  // whole quota and starve the reload-safety copy. Once a v2 wall is safely
  // in IndexedDB, the backup moves there too (verified before the old copy
  // is removed). It is never discarded.
  let legacyMoved = false;
  async function moveLegacyBackup() {
    if (legacyMoved) return;
    legacyMoved = true;
    const raw = lsGet(LEGACY_KEY);
    if (!raw) return;
    try {
      const existing = await idbGet('legacy-v1');
      if (existing !== raw) {
        await idbSet('legacy-v1', raw);
        if ((await idbGet('legacy-v1')) !== raw) return;
      }
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) { /* leave it where it is */ }
  }

  // Three-way merge for two tabs. `base` is what this tab last loaded or
  // wrote. If storage moved on since then (another tab saved), keep their
  // version of everything this tab didn't touch, and this tab's version of
  // what it did.
  let base = { fields: {}, pieces: new Map(), srcs: new Map(), wallpaperSig: '' };
  const FIELDS = ['title', 'paint', 'shape', 'light', 'wallpaper'];
  function pieceSig(p) {
    return JSON.stringify(Object.assign({}, p, { src: p.src ? String(p.src).length + ':' + String(p.src).slice(-32) : '' }));
  }
  function setBase(b) {
    base = { fields: {}, pieces: new Map(), srcs: new Map(), wallpaperSig: srcSig(b.wallpaper) };
    FIELDS.forEach(f => { base.fields[f] = b[f]; });
    (b.pieces || []).forEach(p => { base.pieces.set(p.id, pieceSig(p)); base.srcs.set(p.id, srcSig(p.src)); });
  }
  function mergeInto(theirs) {
    // Changing the wall's shape moves every piece, so piece-by-piece merging
    // across two shapes puts things off the wall. The tab that changed the
    // shape wins the layout; the other tab's pieces it didn't have are
    // converted onto it.
    const weChangedShape = board.shape !== base.fields.shape;
    if (theirs.shape !== board.shape) {
      // Pieces only one side has (new ones) are never dropped: they're
      // converted onto the winning shape. Moves made on the losing side are.
      const convert = (p, fromShape, toShape) => {
        const F = SHAPES[fromShape], T = SHAPES[toShape];
        const kx = T.w / F.w, ky = T.h / F.h, k = Math.min(kx, ky);
        const q = Object.assign({}, p);
        const cx = (q.x + q.w / 2) * kx, cy = (q.y + q.h / 2) * ky;
        q.w *= k; q.h *= k;
        if (q.type === 'text') q.size *= k;
        q.x = cx - q.w / 2; q.y = cy - q.h / 2;
        return q;
      };
      if (weChangedShape) {
        const ours = new Set(board.pieces.map(p => p.id));
        const added = (theirs.pieces || []).filter(p => !ours.has(p.id) && !base.pieces.has(p.id));
        return Object.assign({}, board, { pieces: board.pieces.concat(added.map(p => convert(p, theirs.shape, board.shape))) });
      }
      mergeNotice = 'Your other tab changed the wall\u2019s shape, so this tab is showing that version.';
      const theirIds = new Set((theirs.pieces || []).map(p => p.id));
      const added = board.pieces.filter(p => !theirIds.has(p.id) && !base.pieces.has(p.id));
      return Object.assign({}, theirs, { pieces: (theirs.pieces || []).concat(added.map(p => convert(p, board.shape, theirs.shape))) });
    }
    const merged = Object.assign({}, theirs);
    FIELDS.forEach(f => { if (board[f] !== base.fields[f]) merged[f] = board[f]; });
    const ours = new Map(board.pieces.map(p => [p.id, p]));
    const result = new Map((theirs.pieces || []).map(p => [p.id, p]));
    ours.forEach((p, id) => {
      const was = base.pieces.get(id);
      if (was === undefined || was !== pieceSig(p)) result.set(id, p); // added or changed here
    });
    base.pieces.forEach((sig, id) => { if (!ours.has(id)) result.delete(id); }); // removed here
    merged.pieces = [...result.values()];
    merged.nextId = Math.max(theirs.nextId || 1, board.nextId || 1);
    merged.maxZ = Math.max(0, ...merged.pieces.map(p => p.z || 0));
    return merged;
  }
  let mergeNotice = null;

  async function writeBoard(stamp) {
    saveTimer = null;
    if (loadFailed) return;
    // Another tab may have saved since this one last loaded or wrote.
    let mergedFromOther = false;
    try {
      const { data } = await readStored();
      if (data && data.savedAt > lastSavedAt && data.savedAt !== stamp) {
        board = Object.assign(emptyBoard(), mergeInto(data));
        board.pieces = board.pieces.map(normalizePiece).filter(Boolean);
        board.pieces.forEach(p => Object.assign(p, clampInside(p.x, p.y, p.w, p.h)));
        mergedFromOther = true;
      }
    } catch (e) { /* write what we have */ }
    if (!mergedFromOther) board.title = showTitle.value.trim();
    board.savedAt = stamp || Date.now();
    lastSavedAt = board.savedAt;
    let ok = false;
    try {
      await idbSet(BOARD_KEY, board);
      ok = true;
      // A fallback or flush copy is now stale; don't let it win later.
      try { localStorage.removeItem(BOARD_KEY); } catch (e) { /* fine */ }
    } catch (e) {
      ok = lsSet(BOARD_KEY, JSON.stringify(board));
    }
    if (ok) {
      saveWarned = false;
      setBase(board);
      lsSet(V2_FLAG, '1');
      moveLegacyBackup();
      if (channel) channel.postMessage({ savedAt: board.savedAt });
      if (mergedFromOther) {
        // Undo snapshots predate the merge; restoring one would throw away
        // the other tab's changes, so history starts over here.
        undoStack = []; redoStack = [];
        showTitle.value = board.title || '';
        if (!byId(selectedId)) selectedId = null;
        applyWall();
        renderAll();
        fit();
        refreshUI();
        if (mergeNotice) { toast(mergeNotice); mergeNotice = null; }
      }
    } else if (!saveWarned) {
      saveWarned = true;
      toast('This wall could not be saved on this device. Saving a copy with Hang the show keeps it safe.', { error: true, ms: 10000 });
    }
  }

  // Read both stores and take the newer: a localStorage fallback written
  // while IndexedDB was failing must beat an older IndexedDB copy.
  async function readStored() {
    let idb = null, idbError = false;
    try { idb = await idbGet(BOARD_KEY); } catch (e) { idbError = true; }
    let ls = null;
    const raw = lsGet(BOARD_KEY);
    if (raw) { try { ls = JSON.parse(raw); } catch (e) { /* ignore */ } }
    const ok = (d) => d && d.v === 2 && Array.isArray(d.pieces);
    // A flush copy carries references to image bytes in the IndexedDB copy.
    if (ok(ls) && ls.refs) {
      const srcs = new Map(((idb && idb.pieces) || []).map(p => [p.id, p.src]));
      ls.pieces = ls.pieces.map(p => p.src === REF ? (srcs.has(p.id) ? Object.assign({}, p, { src: srcs.get(p.id) }) : null) : p).filter(Boolean);
      if (ls.wallpaper === REF) ls.wallpaper = idb ? idb.wallpaper : null;
      delete ls.refs;
    }
    const pick = [idb, ls].filter(ok).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0] || null;
    return { data: pick, idbError };
  }

  async function loadBoard() {
    const { data: stored, idbError } = await readStored();
    let data = stored;
    let migrated = false;
    let migrateFailed = false;
    if (!data && idbError && lsGet(V2_FLAG)) {
      // There is a saved wall; this browser just can't read it right now.
      loadFailed = true;
      return { migrated, migrateFailed, loadFailed };
    }
    if (!data && !lsGet(V2_FLAG)) {
      const legacy = lsGet(LEGACY_KEY);
      if (legacy) {
        try { data = migrateV1(JSON.parse(legacy)); migrated = true; }
        catch (e) { migrateFailed = true; data = null; }
      }
    }
    if (data) {
      board = Object.assign(emptyBoard(), data);
      board.pieces = (board.pieces || []).map(normalizePiece).filter(Boolean);
      lastSavedAt = board.savedAt || 0;
    }
    setBase(migrated ? emptyBoard() : board);
    return { migrated, migrateFailed, loadFailed, skipped: migrated ? (data._skipped || 0) : 0 };
  }

  // ===== v1 migration =====
  // v1 data is whatever a year of an earlier app wrote. Every element is
  // migrated on its own, so one odd element can't take the board with it.
  function migrateV1(d) {
    if (!d || typeof d !== 'object') throw new Error('not a board');
    const els = (Array.isArray(d.elements) ? d.elements : []).filter(el => el && typeof el === 'object');
    // Boards saved before canvas size was recorded: infer it from how far
    // the pieces reach, never smaller than the old default canvas.
    const reachW = Math.max(0, ...els.map(el => (Number(el.x) || 0) + (Number(el.width) || 0)));
    const reachH = Math.max(0, ...els.map(el => (Number(el.y) || 0) + (Number(el.height) || 0)));
    const savedW = Number(d.canvasW) || Math.max(1280, reachW);
    const savedH = Number(d.canvasH) || Math.max(720, reachH);
    const shape = savedH > savedW * 1.1 ? 'tall' : 'wide';
    const { w: WW, h: HH } = SHAPES[shape];
    // v1 sizes were screen pixels on a canvas of savedW x savedH. Scale them
    // uniformly so a piece keeps its size relative to the board.
    const k = clamp(Math.min(WW / savedW, HH / savedH), 0.6, 2.4);
    const oldBg = d.backgroundId || 'warm';
    const paintMap = { warm: 'white', blush: 'white', ocean: 'white', sunset: 'white', lavender: 'white', cork: 'ochre', forest: 'salon', midnight: 'charcoal' };
    // v1's default inks, which should follow the new paint instead.
    const defaultInks = ['#1a1a2e', '#f8fafc'];
    const pieces = [];
    let skipped = (Array.isArray(d.elements) ? d.elements.length : 0) - els.length;
    els.forEach((el, i) => {
      const before = pieces.length;
      try { migrateOne(el, i); } catch (e) { /* skip just this element */ }
      if (pieces.length === before) skipped++;
    });
    function migrateOne(el, i) {
        const num = (v, dflt) => (typeof v === 'number' && isFinite(v)) ? v : dflt;
        let w = num(el.width, 200) * k;
        let h = num(el.height, 200) * k;
        // Nothing bigger than about half the wall, keeping its shape. A board
        // made on a laptop and last saved on a phone came out with photos
        // nearly as wide as the wall.
        const fitK = Math.min(1, (WW * 0.55) / w, (HH * 0.55) / h);
        w *= fitK; h *= fitK;
        const hasPos = typeof el.fx === 'number' || typeof el.x === 'number';
        const fx = typeof el.fx === 'number' ? el.fx : num(el.x, 0) / savedW;
        const fy = typeof el.fy === 'number' ? el.fy : num(el.y, 0) / savedH;
        const p = {
          id: 'p-' + (pieces.length + 1),
          type: el.type,
          x: fx * WW, y: fy * HH, w, h,
          rot: num(el.rotation, 0),
          z: num(el.zIndex, i + 1),
          why: typeof el.intention === 'string' ? el.intention : '',
          name: '', by: '', dot: false,
          _noPos: !hasPos,
        };
        if (el.type === 'image') {
          if (typeof el.src !== 'string' || !el.src) return;
          p.src = el.src;
          p.alt = el.label || '';
          if (el.label === 'Drawing') { p.kind = 'drawing'; p.frame = 'none'; }
          else if (el.clipShape === 'polaroid') p.frame = 'polaroid';
          else if (el.clipShape === 'circle') p.frame = 'circle';
          else if (el.clipShape === 'torn') { p.frame = 'torn'; p.clip = el.clipPath; }
          else if (['star', 'heart', 'diamond'].includes(el.clipShape)) p.frame = el.clipShape;
          else p.frame = 'none';
        } else if (el.type === 'sticker') {
          if (typeof el.src !== 'string' || !el.src) return;
          p.src = el.src;
        } else if (el.type === 'text') {
          p.content = typeof el.content === 'string' ? el.content : String(el.content || '');
          if (!p.content.trim()) return;
          p.family = el.fontFamily || FONTS[0].family;
          p.size = num(el.fontSize, 32) * k * fitK;
          p.color = (!el.color || defaultInks.includes(String(el.color).toLowerCase())) ? null : el.color;
          // v1 drew text bold unless it was explicitly set to normal.
          p.weight = el.fontWeight === 'normal' ? 400 : 700;
          p.italic = el.fontStyle === 'italic';
          p._fit = true;
        } else {
          return;
        }
        pieces.push(p);
    }
    const b = emptyBoard();
    b._skipped = skipped;
    b.title = typeof d.boardTitle === 'string' && d.boardTitle !== 'My Vision Board' ? d.boardTitle : '';
    b.paint = paintMap[oldBg] || 'white';
    b.shape = shape;
    if (d.customBgImage && typeof d.customBgImage.src === 'string') {
      b.wallpaper = d.customBgImage.src;
      if (d.customBgImage.intention) b.wallpaperNote = d.customBgImage.intention;
    }
    b.pieces = pieces.map(normalizePiece).filter(Boolean);
    b.nextId = b.pieces.length + 1;
    b.maxZ = Math.max(0, ...b.pieces.map(p => p.z || 0));
    return b;
  }

  // After a migration renders: words get boxes that fit them, pieces with no
  // position at all get a real spot, and everything is pulled onto the wall.
  function settleMigrated() {
    board.pieces.forEach(p => {
      if (p._fit) { const x = p.x, y = p.y; fitTextBox(p); Object.assign(p, { x, y }); delete p._fit; }
    });
    const placed = [];
    board.pieces.forEach(p => {
      if (p._noPos) {
        const others = board.pieces;
        board.pieces = placed.slice();
        Object.assign(p, nextSpot(p.w, p.h));
        board.pieces = others;
      }
      delete p._noPos;
      Object.assign(p, clampInside(p.x, p.y, p.w, p.h));
      placed.push(p);
    });
  }

  // Anything that can't render is dropped here rather than crashing render.
  function normalizePiece(p) {
    if (!p || typeof p !== 'object') return null;
    if (p.type === 'image' || p.type === 'sticker') { if (typeof p.src !== 'string' || !p.src) return null; }
    else if (p.type === 'text') { if (typeof p.content !== 'string') p.content = String(p.content || ''); }
    else return null;
    const n = Object.assign({ rot: 0, z: 1, why: '', name: '', by: '', dot: false }, p);
    ['x', 'y', 'w', 'h', 'rot', 'z'].forEach(k => { if (typeof n[k] !== 'number' || !isFinite(n[k])) n[k] = k === 'w' || k === 'h' ? 200 : 0; });
    if (n.type === 'image' && !n.frame) n.frame = 'none';
    return n;
  }

  // ===== Undo / redo =====
  // Snapshots copy each piece object but share the image strings, which are
  // never mutated in place. Thirty deep copies of a photo board used to cost
  // tens of megabytes; this costs almost nothing.
  //
  // The show title is not part of undo: it isn't an undoable step, so
  // restoring it would quietly throw away whatever was typed since.
  function snapshot() {
    const s = Object.assign({}, board, { pieces: board.pieces.map(p => Object.assign({}, p)) });
    delete s.title;
    return s;
  }
  function restore(snap) {
    const shapeChanged = snap.shape !== board.shape;
    board = Object.assign({}, snap, { title: showTitle.value.trim(), pieces: snap.pieces.map(p => Object.assign({}, p)) });
    if (!byId(selectedId)) selectedId = null;
    closeCard();
    applyWall();
    renderAll();
    if (shapeChanged) fit();
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

  // The saved wall exists but can't be read right now. Anything done here
  // would be thrown away, so say so plainly and take the editing tools away
  // until a reload (or another tab) brings the wall back.
  let readOnlyBanner = null;
  function setReadOnly(on) {
    loadFailed = on;
    ['#stage', '#dock', '#ctx', '#show-title', '#btn-hang', '#views', '#zoom', '#btn-undo', '#btn-redo', '.menu-wrap'].forEach(q => { const el = $(q); if (el) el.inert = on; });
    document.body.classList.toggle('read-only', on);
    if (on && !readOnlyBanner) {
      readOnlyBanner = document.createElement('div');
      readOnlyBanner.className = 'toast error banner';
      readOnlyBanner.setAttribute('role', 'alert');
      readOnlyBanner.innerHTML = '<span>Your saved wall could not be opened in this browser right now. Nothing has been changed. </span>';
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Reload';
      b.addEventListener('click', () => location.reload());
      readOnlyBanner.appendChild(b);
      $('#toasts').appendChild(readOnlyBanner);
    } else if (!on && readOnlyBanner) {
      readOnlyBanner.remove();
      readOnlyBanner = null;
    }
  }

  // Another tab saved a newer wall. Adopt it before this tab can overwrite it
  // with a stale copy. Called when this tab comes back into view and when
  // another tab announces a save.
  async function adoptNewerFromStorage() {
    if (saveTimer || editingTextId || gesture) return;
    const { data } = await readStored();
    if (!data || !(data.savedAt > lastSavedAt)) return;
    board = Object.assign(emptyBoard(), data);
    board.pieces = board.pieces.map(normalizePiece).filter(Boolean);
    lastSavedAt = board.savedAt;
    setBase(board);
    if (loadFailed) setReadOnly(false);
    showTitle.value = board.title || '';
    undoStack = []; redoStack = [];
    selectedId = null;
    closeCard();
    applyWall();
    renderAll();
    fit();
    refreshUI();
    toast('Updated with changes from your other tab.');
  }

  // ===== View: pan and zoom =====
  // The view switcher floats over the wall below 1000px, where it would
  // otherwise collide with Undo in the top bar (tablets).
  const viewsFloat = () => window.matchMedia('(max-width: 1000px) and (min-height: 501px)').matches;
  function insets() {
    const phone = isPhone();
    const top = 20 + (viewsFloat() ? 56 : 0);
    let bottom = phone ? 86 : 104;
    // On phones, an open sheet takes the bottom of the screen; fit the wall
    // into what's left so paint and shape changes are visible as you make them.
    const sheet = phone && (panelTab ? panel : cardForId ? card : null);
    if (sheet && !sheet.hidden) {
      // offsetHeight, not the rect: the sheet is mid slide-up animation here.
      bottom = Math.max(bottom, sheet.offsetHeight + 16);
    }
    return { top, bottom, left: (!phone && panelTab) ? 364 : 20, right: 20 };
  }
  function computeFit() {
    const r = stage.getBoundingClientRect();
    const i = insets();
    const aw = Math.max(80, r.width - i.left - i.right);
    const ah = Math.max(80, r.height - i.top - i.bottom);
    const s = Math.min(aw / W(), ah / H());
    return { s, tx: i.left + (aw - W() * s) / 2, ty: i.top + (ah - H() * s) / 2 };
  }
  let fitView = null;
  function fit() {
    const f = computeFit();
    fitS = f.s;
    fitView = f;
    userZoomed = false;
    setView(f.s, f.tx, f.ty);
  }
  // "Fitted" means the same scale and the same place. A pan at fit scale
  // counts as moved, so Fit appears and a double tap brings the wall back.
  function isFitted() {
    return fitView && Math.abs(view.s / fitS - 1) <= 0.02 && Math.abs(view.tx - fitView.tx) < 6 && Math.abs(view.ty - fitView.ty) < 6;
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
    document.body.classList.toggle('zoomed', !isFitted());
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
    const focusedId = document.activeElement && document.activeElement.closest && document.activeElement.closest('.piece') ? document.activeElement.closest('.piece').dataset.id : null;
    piecesEl.innerHTML = '';
    labelsEl.innerHTML = '';
    board.pieces.forEach(p => renderPiece(p));
    renderLabels();
    updateEmpty();
    syncTabStops();
    // Keep keyboard focus on the same piece across a rebuild (undo, redo).
    if (focusedId) { if (byId(focusedId)) focusPiece(focusedId); else focusStage(); }
  }

  function renderPiece(p, animate) {
    let dom = domOf(p.id);
    if (!dom) {
      dom = document.createElement('div');
      dom.className = 'piece';
      dom.dataset.id = p.id;
      dom.tabIndex = -1;
      dom.setAttribute('role', 'button');
      dom.setAttribute('aria-roledescription', 'piece on the wall');
      dom.setAttribute('aria-describedby', 'piece-help');
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
    if (p.type === 'image') return ['i', p.frame, p.cutout ? 1 : 0, p.kind || '', String(p.src).length, String(p.src).slice(-24)].join('|');
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
    const tidy = (t) => String(t).trim().replace(/[.!?]+$/, '');
    if (p.why) s += `. Why it matters: ${tidy(p.why)}`;
    if (p.by) s += `. By ${tidy(p.by)}`;
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
    syncTabStops();
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
  // Walk a spiral out from the middle of what's on screen and take the first
  // spot that covers nothing (labels included). If the wall is full, take the
  // spot that covers least.
  function nextSpot(w, h) {
    const c = visibleCenter();
    const taken = board.pieces.map(p => {
      const b = bbox(p);
      return hasLabel(p) ? { x: b.x, y: b.y, w: Math.max(b.w, 200), h: b.h + 90 } : b;
    });
    const step = Math.min(W(), H()) * 0.06;
    let best = null;
    for (let n = 0; n < 160; n++) {
      const a = n * 2.39996323, r = step * Math.sqrt(n);
      const spot = clampInside(c.x + r * Math.cos(a) - w / 2, c.y + r * Math.sin(a) - h / 2, w, h);
      const pad = 18;
      let cover = 0;
      for (const t of taken) {
        const ox = Math.min(spot.x + w + pad, t.x + t.w) - Math.max(spot.x - pad, t.x);
        const oy = Math.min(spot.y + h + pad, t.y + t.h) - Math.max(spot.y - pad, t.y);
        if (ox > 0 && oy > 0) cover += ox * oy;
      }
      if (cover === 0) return spot;
      if (!best || cover < best.cover) best = { cover, spot };
    }
    return best.spot;
  }
  function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
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

  // Ids are unique across tabs: a counter alone gave two tabs the same id
  // for two different new pieces, and the merge kept only one.
  function newId() {
    board.nextId = (board.nextId || 1) + 1;
    return 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function addPiece(props, opts) {
    opts = opts || {};
    if (!opts.noUndo) pushUndo();
    const w = props.w, h = props.h;
    const spot = (props.x != null && props.y != null) ? { x: props.x, y: props.y } : nextSpot(w, h);
    board.maxZ = Math.max(board.maxZ, ...board.pieces.map(q => q.z || 0)) + 1;
    const p = normalizePiece(Object.assign({
      rot: props.type === 'image' && !props.kind ? (Math.random() * 4 - 2) : 0,
    }, props, { id: newId(), x: spot.x, y: spot.y, z: board.maxZ }));
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
    const idx = board.pieces.findIndex(p => p.id === id);
    const gone = board.pieces[idx];
    board.pieces = board.pieces.filter(p => p.id !== id);
    const dom = domOf(id);
    const ae = document.activeElement;
    const hadFocus = (dom && dom.contains(ae)) || ctxBar.contains(ae) || card.contains(ae) || ae === document.body;
    if (dom) dom.remove();
    if (selectedId === id) select(null);
    if (cardForId === id) closeCard();
    renderLabels();
    updateEmpty();
    save();
    if (hadFocus) focusStage();
    toast('Taken down.', { action: 'Undo', onAction: () => putBack(gone, idx), ms: 8000 });
  }
  // The toast's Undo puts back the piece it names, even if other edits
  // happened since.
  function putBack(p, idx) {
    if (!p || byId(p.id)) return;
    pushUndo();
    board.pieces.splice(Math.min(idx, board.pieces.length), 0, Object.assign({}, p));
    renderPiece(byId(p.id), true);
    renderLabels();
    updateEmpty();
    select(p.id);
    focusPiece(p.id);
    save();
  }
  function focusStage() { stage.focus({ preventScroll: true }); }
  function focusPiece(id) { const d = domOf(id); if (d) d.focus({ preventScroll: true }); }

  function duplicatePiece(id) {
    const p = byId(id);
    if (!p) return;
    const copy = Object.assign({}, p, { x: p.x + 28, y: p.y + 28, dot: false, name: '', why: '', by: '' });
    delete copy.id; delete copy.z;
    addPiece(copy);
  }

  // Restack as 1..n so z never goes negative (which put pieces behind the
  // wallpaper and out of reach) and never grows without bound.
  function restack(id, toFront) {
    pushUndo();
    const order = board.pieces.slice().sort((a, b) => (a.z || 0) - (b.z || 0)).filter(p => p.id !== id);
    const p = byId(id);
    if (toFront) order.push(p); else order.unshift(p);
    order.forEach((q, i) => { q.z = i + 1; const d = domOf(q.id); if (d) d.style.zIndex = q.z; });
    board.maxZ = order.length;
    renderLabels();
    save();
  }
  function bringToFront(id) { restack(id, true); }
  function sendToBack(id) { restack(id, false); }

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
    syncTabStops();
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
    b.title = label;
    if (extra && extra.pressed != null) b.setAttribute('aria-pressed', String(extra.pressed));
    if (extra && extra.popup) { b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-expanded', 'false'); }
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
      if (!(extra && extra.popup)) closePop();
      onClick(b);
    });
    return b;
  }
  function sep() { const s = document.createElement('span'); s.className = 'cb-sep'; return s; }

  function buildCtx() {
    // Rebuilding the bar would drop keyboard focus on the floor; put it back
    // on the button with the same name.
    const had = ctxBar.contains(document.activeElement) ? document.activeElement.textContent : null;
    buildCtxInner();
    if (had != null && !ctxBar.hidden) {
      const same = [...ctxBar.querySelectorAll('button')].find(b => b.textContent === had);
      if (same) same.focus({ preventScroll: true });
      else if (selectedId) focusPiece(selectedId);
    }
  }
  function buildCtxInner() {
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
    // Panned off screen: the bar goes with it.
    const offscreen = pr.right < sr.left || pr.left > sr.right || pr.bottom < sr.top || pr.top > sr.bottom;
    ctxBar.style.visibility = offscreen ? 'hidden' : '';
    // The room the bar may use: right of an open panel, left of the card.
    const minL = (panelTab ? panel.getBoundingClientRect().right : sr.left) + 8;
    const maxR = (cardForId ? card.getBoundingClientRect().left : sr.right) - 8;
    // Too wide for that room: labels go (each button keeps its name), and if
    // it still doesn't fit, it wraps to a second row.
    ctxBar.classList.remove('compact');
    ctxBar.style.maxWidth = '';
    if (ctxBar.offsetWidth > maxR - minL) {
      ctxBar.classList.add('compact');
      ctxBar.style.maxWidth = Math.max(160, maxR - minL) + 'px';
    }
    const bw = ctxBar.offsetWidth, bh = ctxBar.offsetHeight;
    let left = pr.left + pr.width / 2 - bw / 2;
    left = clamp(left, minL, Math.max(minL, maxR - bw));
    // Above the piece, clear of the rotate handle (about 40px up), or below.
    let top = pr.top - bh - 50;
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
  function closePop(returnFocus) {
    if (pop.hidden) return;
    const label = popAnchor && popAnchor.textContent;
    pop.hidden = true;
    if (popAnchor) { popAnchor.setAttribute('aria-expanded', 'false'); }
    popAnchor = null;
    if (returnFocus || pop.contains(document.activeElement)) {
      const btn = [...ctxBar.querySelectorAll('button')].find(b => b.textContent === label);
      if (btn) btn.focus({ preventScroll: true }); else if (selectedId) focusPiece(selectedId);
    }
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
      // Boards from the first version can carry star, heart or diamond clips.
      // They aren't offered for new photos, but stay pickable where they exist.
      const legacy = { star: 'Star', heart: 'Heart', diamond: 'Diamond' }[p.frame];
      (legacy ? FRAMES.concat([{ id: p.frame, label: legacy }]) : FRAMES).forEach(f => {
        const chip = document.createElement('span');
        chip.className = 'frame-chip ' + f.id;
        el.appendChild(optBtn(f.label, p.frame === f.id, () => setFrame(id, f.id), chip));
      });
    });
  }
  function setFrame(id, frame) {
    const p = byId(id);
    if (!p || p.frame === frame) { closePop(true); return; }
    pushUndo();
    const changes = { frame };
    // Shapes that read wrong when stretched get squared up, keeping the center.
    if (frame === 'circle') {
      const m = Math.min(p.w, p.h);
      Object.assign(changes, { w: m, h: m, x: p.x + (p.w - m) / 2, y: p.y + (p.h - m) / 2 });
    }
    if (frame === 'torn') changes.clip = tornPath();
    updatePiece(id, changes);
    closePop(true);
    buildCtx();
  }
  function fontPop(anchor, id) {
    openPop(anchor, (el) => {
      el.setAttribute('role', 'menu');
      el.setAttribute('aria-label', 'Font');
      const p = byId(id);
      FONTS.forEach(f => {
        const b = optBtn(f.label, p.family === f.family, async () => {
          pushUndo();
          updatePiece(id, { family: f.family });
          closePop(true);
          buildCtx();
          // Size the box with the new face, not the one it replaced.
          try { await document.fonts.load(`${p.italic ? 'italic ' : ''}${p.weight || 600} ${Math.round(p.size)}px ${f.family}`); } catch (e) { /* fallback metrics */ }
          const q = byId(id);
          if (!q) return;
          fitTextBox(q);
          renderPiece(q);
          renderLabels();
          positionCtx();
          save();
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
      INKS.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'menuitemradio');
        b.setAttribute('aria-label', INK_NAMES[c] || c);
        b.setAttribute('aria-checked', String((p.color || paint().ink).toLowerCase() === c));
        b.style.setProperty('--sw', c);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          pushUndo();
          updatePiece(id, { color: c });
          closePop(true);
          buildCtx();
        });
        grid.appendChild(b);
      });
      el.appendChild(grid);
    });
  }

  // ===== Wall text card =====
  function openCard(id, opts) {
    const p = byId(id);
    if (!p) return;
    if (opts && opts.focus) setTimeout(() => $('#card-why').focus(), 30);
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
    $('#card-why').placeholder = WHY_PROMPTS[[...p.id].reduce((a, c) => a + c.charCodeAt(0), 0) % WHY_PROMPTS.length];
    $('#card-name').value = p.name || '';
    $('#card-by').value = p.by || '';
    setDotUI(!!p.dot, p);
    toggleRemindRow(false);
    card.hidden = false;
    buildCtx();
    if (!wasOpen) { if (isPhone()) refitIfAuto(); positionCtx(); }
    keepInView(id);
    return card;
  }
  // Slide the wall so the piece being labeled isn't under the card.
  function keepInView(id) {
    const dom = domOf(id);
    if (!dom || viewMode === 'walk') return;
    const pr = dom.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    let dx = 0, dy = 0;
    if (isPhone()) {
      const limit = card.getBoundingClientRect().top - 16;
      if (pr.bottom > limit) dy = limit - pr.bottom;
      if (pr.top + dy < sr.top + 70) dy = sr.top + 70 - pr.top;
    } else {
      const limit = card.getBoundingClientRect().left - 24;
      if (pr.right > limit) dx = limit - pr.right;
      if (pr.left + dx < sr.left + 20) dx = sr.left + 20 - pr.left;
    }
    if (dx || dy) { userZoomed = true; setView(view.s, view.tx + dx, view.ty + dy); }
  }
  function closeCard() {
    if (!cardForId) return;
    const wasFocusInCard = card.contains(document.activeElement);
    const id = cardForId;
    cardForId = null;
    card.hidden = true;
    buildCtx();
    if (isPhone()) refitIfAuto();
    if (wasFocusInCard) focusPiece(id);
  }
  const DOT_NOTE_OFF = 'Galleries put a red dot on a piece that has found its home. Add one when this comes true.';
  function setDotUI(on, p) {
    const b = $('#card-dot');
    b.setAttribute('aria-pressed', String(on));
    let when = '';
    if (on && p && p.dotAt) {
      const d = new Date(p.dotAt + 'T12:00:00');
      if (!isNaN(d)) when = ' on ' + d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    $('#dot-note').textContent = on ? `Marked yours${when}. Press again to take the dot off.` : DOT_NOTE_OFF;
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
  let redoBeforeWords = null;
  function addWords() {
    // Measure first, so the open-space search places the real box. Placing a
    // 420x100 guess and then resizing let new words land on each other.
    const props = {
      type: 'text', content: 'Your words', family: FONTS[0].family, size: WORDS_SIZE,
      color: null, weight: 600, italic: false, x: 0, y: 0, w: 420, h: 100,
    };
    fitTextBox(props, true);
    delete props.x; delete props.y;
    redoBeforeWords = redoStack.slice();
    const p = addPiece(props);
    startTextEdit(p.id, true);
  }

  // The box hugs the text, measured with the real font. Very long lines wrap
  // at 1200 units instead of running off the wall.
  const measurer = document.createElement('div');
  const WORDS_MAX_W = 1200;
  function fitTextBox(p, noClamp) {
    if (!p || p.type !== 'text') return;
    if (!measurer.parentNode) {
      measurer.style.cssText = 'position:absolute;left:-99999px;top:0;display:inline-block;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.05;visibility:hidden';
      document.body.appendChild(measurer);
    }
    measurer.style.maxWidth = WORDS_MAX_W + 'px';
    measurer.style.fontFamily = p.family;
    measurer.style.fontSize = p.size + 'px';
    measurer.style.fontWeight = p.weight || 600;
    measurer.style.fontStyle = p.italic ? 'italic' : 'normal';
    measurer.textContent = p.content || ' ';
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const w = clamp(measurer.offsetWidth + p.size * 0.4, 60, W());
    const h = clamp(measurer.offsetHeight + p.size * 0.2, 30, H());
    Object.assign(p, { w, h, x: cx - w / 2, y: cy - h / 2 });
    if (!noClamp) Object.assign(p, (w <= W() - 32 && h <= H() - 32) ? clampInside(p.x, p.y, w, h) : (clampOnWall(p), {}));
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
    art.setAttribute('role', 'textbox');
    art.setAttribute('aria-label', 'Words');
    dom.classList.add('editing');
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
  // Escape: put the words back the way they were. A fresh piece goes away.
  function cancelTextEdit() {
    const id = editingTextId;
    if (!id) return;
    const dom = domOf(id);
    const art = dom && dom.querySelector('.art');
    if (art) art.textContent = art.dataset.fresh === '1' ? '' : art.dataset.before;
    commitTextEdit();
  }
  function commitTextEdit() {
    const id = editingTextId;
    if (!id) return;
    editingTextId = null;
    const p = byId(id);
    const dom = domOf(id);
    if (!p || !dom) return;
    const art = dom.querySelector('.art');
    art.removeEventListener('blur', commitTextEdit);
    art.contentEditable = 'false';
    art.removeAttribute('role');
    art.removeAttribute('aria-label');
    dom.classList.remove('editing');
    const next = (art.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    const before = art.dataset.before;
    const fresh = art.dataset.fresh === '1';
    if (!next) {
      if (fresh) {
        // Never typed in: leave no trace, and give back the redo history the
        // add cleared.
        undoStack.pop();
        if (redoBeforeWords) redoStack = redoBeforeWords;
        updateUndoButtons();
        board.pieces = board.pieces.filter(x => x.id !== id);
        dom.remove();
        selectedId = null;
        buildCtx(); renderLabels(); updateEmpty(); save();
        focusStage();
      } else {
        // Emptying words is taking them down: undoable like any other.
        art.textContent = before;
        removePiece(id);
      }
      redoBeforeWords = null;
      return;
    }
    redoBeforeWords = null;
    if (next !== before && !fresh) pushUndo();
    p.content = next;
    fitTextBox(p);
    if (fresh) {
      // It grew while being typed; find it a spot that fits what it became.
      const others = board.pieces;
      board.pieces = others.filter(q => q.id !== p.id);
      const spot = nextSpot(p.w, p.h);
      board.pieces = others;
      // Move only if the new spot covers less than where it is now.
      const coverAt = (x, y) => others.filter(q => q.id !== p.id).reduce((t, q) => {
        const a = bbox(q), b = { x, y, w: p.w, h: p.h };
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        return t + (ox > 0 && oy > 0 ? ox * oy * (q.type === 'text' ? 2 : 1) : 0);
      }, 0);
      if (coverAt(spot.x, spot.y) < coverAt(p.x, p.y)) Object.assign(p, spot);
    }
    dom.dataset.sig = '';
    renderPiece(p);
    renderLabels();
    buildCtx();
    if (document.activeElement === art || document.activeElement === document.body) dom.focus({ preventScroll: true });
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
      const cut = dieCut(trimAlpha(c));
      return { src: cut.url, cutout: true, ratio: cut.w / cut.h };
    }
    try {
      return { src: c.toDataURL('image/jpeg', STORE_QUALITY), ratio: w / h };
    } catch (e) {
      return { src, ratio: w / h };
    }
  }
  // Crop to the visible pixels. A lifted subject often arrives with a wide
  // transparent margin, which became an invisible box that blocked clicks.
  function trimAlpha(c) {
    try {
      const { width: w, height: h } = c;
      const d = c.getContext('2d').getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return c;
      const out = document.createElement('canvas');
      out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
      out.getContext('2d').drawImage(c, -x0, -y0);
      return out;
    } catch (e) { return c; }
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
    // Small images hang small instead of being blown up into mush.
    const edge = Math.min(PHOTO_EDGE, Math.max(80, Math.max(probe.naturalWidth, probe.naturalHeight)));
    const size = sizeFor(ratio0, edge);
    const prepared = await prepareImage(src, size.w * STORE_SCALE, size.h * STORE_SCALE);
    const s2 = sizeFor(prepared.ratio || ratio0, prepared.cutout ? edge * 0.85 : edge);
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
    const t = String(n || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/^(IMG|DSC|PXL|Screenshot)\s?\d.*$/i, '').trim();
    // Clipboard images arrive named "image" or "image.png"; that isn't a name.
    return /^(image|pasted image|untitled)$/i.test(t) ? '' : t;
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
  // Switching shape scales positions to the new wall and sizes by the
  // tighter side, so nothing piles up. Switching back restores the exact
  // previous layout for every piece that wasn't moved in between, so a
  // Wide-Tall-Wide round trip is lossless.
  function setShape(shape) {
    if (board.shape === shape) return;
    pushUndo();
    const from = board.shape;
    const F = SHAPES[from], T = SHAPES[shape];
    const kx = T.w / F.w, ky = T.h / F.h, k = Math.min(kx, ky);
    const memo = board.shapeMemo;
    const geom = (p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, size: p.size });
    const same = (a, b) => a && b && ['x', 'y', 'w', 'h'].every(f => Math.abs(a[f] - b[f]) < 0.5);
    const before = {};
    board.pieces.forEach(p => {
      before[p.id] = geom(p);
      const returning = memo && memo.to === from && memo.from === shape && memo.before[p.id] && memo.after[p.id];
      if (returning && same(geom(p), memo.after[p.id])) {
        // Untouched since the last switch: put it back exactly.
        Object.assign(p, memo.before[p.id]);
      } else if (returning) {
        // Moved or resized meanwhile: undo the earlier shrink on its size and
        // carry its new spot across.
        const r = memo.before[p.id].w / memo.after[p.id].w || 1;
        const cx = (p.x + p.w / 2) * kx, cy = (p.y + p.h / 2) * ky;
        p.w *= r; p.h *= r;
        if (p.type === 'text') p.size *= r;
        p.x = cx - p.w / 2; p.y = cy - p.h / 2;
      } else {
        const cx = (p.x + p.w / 2) * kx, cy = (p.y + p.h / 2) * ky;
        p.w *= k; p.h *= k;
        if (p.type === 'text') p.size *= k;
        p.x = cx - p.w / 2; p.y = cy - p.h / 2;
      }
    });
    board.shape = shape;
    const after = {};
    board.pieces.forEach(p => {
      Object.assign(p, clampInside(p.x, p.y, p.w, p.h));
      if (p.type !== 'text') delete p.size;
      after[p.id] = geom(p);
    });
    board.shapeMemo = { from, to: shape, before, after };
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
      { t: 'text', content: 'Say yes\nmore.', x: 84, y: 610, size: 104, rot: -3, family: "'Cormorant Garamond', serif", italic: true, weight: 400 },
      { t: 'image', f: 'cabin', frame: 'oval', x: 470, y: 480, w: 230, h: 300, name: 'A week at a cabin', why: 'Somewhere with a wood stove and no plans.', by: 'Winter' },
      { t: 'image', f: 'dinner', frame: 'black', x: 790, y: 500, w: 230, h: 300, name: 'Monthly dinner', why: 'First Sunday, our place, whoever can come.', dot: true },
      { t: 'image', f: 'books-cut', cut: true, x: 1060, y: 500, w: 200, h: 248, rot: -5, name: '24 books', why: 'Two a month, on paper.' },
      { t: 'text', content: '2027', x: 1300, y: 540, size: 116, rot: 0 },
    ],
    tall: [
      { t: 'text', content: '2027', x: 70, y: 70, size: 150 },
      { t: 'text', content: 'Say yes\nmore.', x: 560, y: 70, size: 84, rot: -3, family: "'Cormorant Garamond', serif", italic: true, weight: 400 },
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
    const shape = window.innerHeight > window.innerWidth ? 'tall' : 'wide';
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
        pieces.push(Object.assign(base, { type: 'text', content: s.content, family: s.family || FONTS[0].family, size: s.size, color: s.color || PAINTS[0].ink, weight: s.weight || 600, italic: !!s.italic, w: 300, h: 100 }));
      }
    }
    board = Object.assign(emptyBoard(), { title: EXAMPLE.title, paint: EXAMPLE.paint, shape, pieces: pieces.map(normalizePiece), nextId: pieces.length + 1, maxZ: pieces.length });
    showTitle.value = board.title;
    selectedId = null;
    closeCard();
    applyWall();
    // Words need their real width, which needs the font.
    try { await Promise.all([document.fonts.load('600 72px "Funnel Display"'), document.fonts.load('italic 400 72px "Cormorant Garamond"')]); } catch (e) { /* ok */ }
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
    focusStage();
    toast('This is an example show. Change anything, or start a new wall from the menu.', { ms: 6000 });
  }

  // ===== New wall =====
  function newWall() {
    pushUndo();
    const before = undoStack[undoStack.length - 1];
    const titleBefore = showTitle.value;
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
    // The toast's Undo brings back the wall it took down, even after edits.
    toast('New wall.', { action: 'Undo', onAction: () => { pushUndo(); showTitle.value = titleBefore; restore(before); fit(); }, ms: 10000 });
  }

  // ===== Pointer input: pan, pinch, drag, resize, rotate =====
  const pointers = new Map();
  let gesture = null;      // { kind: 'pan'|'drag'|'resize'|'rot'|'pinch', ... }
  let lastTap = { t: 0, x: 0, y: 0 };

  function onPointerDown(e) {
    if (viewMode === 'walk') { walkPointerDown(e); return; }
    if (e.button && e.button !== 0) return;
    if (editingTextId && e.target.closest('.art[contenteditable="true"]')) return;
    // Don't rely on blur alone to finish editing words; it doesn't always fire.
    if (editingTextId) commitTextEdit();
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
      pieceDom.focus({ preventScroll: true });
      gesture = { kind: 'drag', id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false, wasSelected };
    } else {
      gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.tx, oy: view.ty, moved: false };
      stage.classList.add('panning');
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#bar input, #panel input')) focusStage();
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
      if (pointers.size < 2) { gesture = null; buildCtx(); }
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
          if (!isFitted()) fit(); else zoomAt(2.2, e.clientX, e.clientY);
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
      zoomAt(clamp(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0085)), 0.8, 1.25), e.clientX, e.clientY);
    } else {
      userZoomed = true;
      const m = e.deltaMode ? 24 : 1;
      setView(view.s, view.tx - e.deltaX * m, view.ty - e.deltaY * m);
    }
  }

  // ===== Keyboard =====
  // Keys belong to whatever has focus. Piece shortcuts only fire when a
  // piece (or the bare wall) has focus; buttons, fields, menus and radio
  // groups keep their own Enter, Space and arrows. The first version took
  // Enter and Backspace from every button while a piece was selected.
  const CONTROL_SEL = 'button, a[href], input, textarea, select, [role="radio"], [role="menuitem"], [role="menuitemradio"], [contenteditable="true"]';
  function onKey(e) {
    const mod = e.metaKey || e.ctrlKey;
    const t = e.target && e.target.closest ? e.target : document.body;
    const onControl = !!t.closest(CONTROL_SEL);

    if (openDialog) {
      if (e.key === 'Tab') trapFocus(openDialog, e);
      else if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
      else arrowNav(e, t);
      return;
    }
    if (drawing) {
      if (e.key === 'Escape') { e.preventDefault(); exitDraw(false); }
      else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); strokes.pop(); redrawStrokes(); }
      else arrowNav(e, t);
      return;
    }
    if (viewMode === 'walk') {
      if (e.key === 'Escape') { e.preventDefault(); setViewMode(prevMode); return; }
      if (onControl && (e.key === 'Enter' || e.key === ' ')) return; // let the button do its job
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); walkStep(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); walkStep(-1); }
      return;
    }
    if (arrowNav(e, t)) return;

    if (e.key === 'Escape') {
      if (!pop.hidden) { closePop(true); return; }
      if (editingTextId) { cancelTextEdit(); return; }
      if (!$('#more-menu').hidden) { closeMenu(); $('#btn-more').focus(); return; }
      if (cardForId) { const id = cardForId; closeCard(); focusPiece(id); return; }
      if (panelTab) { const tab = panelTab; closePanel(); $('#tool-' + tab).focus(); return; }
      if (selectedId) { select(null); return; }
      return;
    }
    if (editingTextId) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTextEdit(); }
      return;
    }
    const typing = !!t.closest('input, textarea, [contenteditable="true"]');
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    // Browser zoom (Cmd plus or minus) stays the browser's. The wall zooms
    // with plain + - 0 while the wall has focus.
    const onWall = !onControl && (t.closest('.piece') || t === stage || t === document.body);
    if (!onWall) return;
    if (!mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1.25); return; }
    if (!mod && e.key === '-') { e.preventDefault(); zoomBy(0.8); return; }
    if (!mod && e.key === '0') { e.preventDefault(); fit(); return; }
    const p = selectedId && byId(selectedId);
    if (!p) {
      if (e.altKey && /^Arrow/.test(e.key)) { e.preventDefault(); stepPiece(1); }
      return;
    }
    if (e.altKey && /^Arrow/.test(e.key)) { e.preventDefault(); stepPiece(e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePiece(p.id); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicatePiece(p.id); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (p.type === 'text' && e.key === 'Enter' && !e.shiftKey) startTextEdit(p.id);
      else openCard(p.id, { focus: true });
      return;
    }
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

  // Arrow keys inside menus, popovers and radio groups move between their
  // items (radio groups also select, as native radios do). Returns true if
  // it handled the key.
  function arrowNav(e, t) {
    if (!/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) return false;
    let items, activate = false;
    const radio = t.closest('[role="radio"]');
    const menu = t.closest('#pop, #more-menu');
    if (radio) {
      const group = radio.closest('[role="radiogroup"]');
      if (!group) return false;
      items = [...group.querySelectorAll('[role="radio"]')].filter(n => !n.disabled && n.offsetParent !== null);
      // Repainting, reshaping or rendering an export on every arrow press is
      // too costly; those groups move focus, and Space or Enter picks.
      activate = !group.hasAttribute('data-manual');
    } else if (menu) {
      items = [...menu.querySelectorAll('button')].filter(n => !n.disabled && n.offsetParent !== null);
    } else {
      return false;
    }
    const i = items.indexOf(radio || t.closest('button'));
    if (i < 0 && !items.length) return false;
    // In a grid, up and down move a whole row.
    const cols = items.length > 1 ? items.filter(n => n.offsetTop === items[0].offsetTop).length : 1;
    const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    const step = vertical && cols > 1 && cols < items.length ? cols : 1;
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    let n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : step > 1 ? ((i + (back ? -step : step) < 0 || i + (back ? -step : step) > items.length - 1) ? i : i + (back ? -step : step))
      : (i + (back ? -1 : 1) + items.length) % items.length;
    e.preventDefault();
    items[n].focus();
    if (activate) items[n].click();
    return true;
  }

  // Move selection to the next or previous piece in reading order.
  function stepPiece(d) {
    const order = readingOrder();
    if (!order.length) return;
    const i = order.findIndex(p => p.id === selectedId);
    const next = order[i < 0 ? 0 : (i + d + order.length) % order.length];
    select(next.id);
    focusPiece(next.id);
  }
  // Reading order: group pieces into rows by vertical overlap (a piece joins
  // a row when its middle falls inside the row's band), rows top to bottom,
  // then left to right in each row. Bands of a third of the wall jumbled any
  // grid with more than three rows.
  function readingOrder() {
    const items = board.pieces.map(p => ({ p, b: bbox(p) })).sort((a, b) => a.b.y - b.b.y);
    const rows = [];
    items.forEach(it => {
      const mid = it.b.y + it.b.h / 2;
      const row = rows.find(r => mid >= r.top && mid <= r.bottom);
      if (row) { row.items.push(it); row.bottom = Math.max(row.bottom, it.b.y + it.b.h * 0.6); }
      else rows.push({ top: it.b.y, bottom: it.b.y + it.b.h * 0.85, items: [it] });
    });
    return rows.flatMap(r => r.items.sort((a, b) => a.b.x - b.b.x).map(it => it.p));
  }

  // One tab stop for the whole wall: the selected piece, or the first one.
  // Tab from there goes to the selected piece's context bar, which sits
  // right after the wall in the page. Alt with an arrow key walks the pieces.
  function syncTabStops() {
    // Walk through is a presentation; its own controls are the tab stops.
    const stop = viewMode === 'walk' ? null : (selectedId && byId(selectedId) ? selectedId : (readingOrder()[0] || {}).id);
    piecesEl.querySelectorAll('.piece').forEach(d => { d.tabIndex = d.dataset.id === stop ? 0 : -1; });
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
    const back = dialogReturnFocus;
    if (back && document.contains(back) && back.offsetParent !== null) back.focus();
    else if (el.id === 'dlg-new') $('#btn-more').focus();
    else focusStage();
  }
  function trapFocus(container, e) {
    // a[href], not [href]: SVG <use href> matched and broke the trap.
    const nodes = [...container.querySelectorAll('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
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
  function updateAskUI() { $('#opt-ask').setAttribute('aria-pressed', String(askWhy)); }

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
    syncTabStops();
  }
  function syncViewSeg() {
    document.querySelectorAll('#views button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.view === viewMode)));
  }

  // ===== Walk through =====
  let walkOrder = [];
  let walkIdx = -1;
  let walkSwipe = null;
  function walkList() {
    // Read the wall like a visitor: left to right, top to bottom. Labeled
    // pieces if there are any, else every piece that isn't words, else all.
    const order = readingOrder();
    const labeled = order.filter(hasLabel);
    if (labeled.length) return labeled;
    const art = order.filter(p => p.type !== 'text');
    return art.length ? art : order;
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  function startWalk() {
    walkOrder = walkList();
    walkIdx = -1;
    $('#walk').hidden = false;
    select(null);
    closePanel();
    closeCard();
    requestAnimationFrame(() => { walkShow(); $('#walk-next').focus({ preventScroll: true }); });
  }
  function endWalk() {
    $('#walk').hidden = true;
    $('#walk-label').innerHTML = '';
    wall.style.transition = '';
    fit();
    const b = $(`#views [data-view="${viewMode}"]`);
    if (b) b.focus({ preventScroll: true });
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
      label.classList.add('end');
      const n = board.pieces.length;
      const dots = board.pieces.filter(p => p.dot).length;
      addLine(label, 'w-name', walkIdx < 0 ? (showTitle.value.trim() || 'Untitled show') : 'That is the show.');
      if (walkIdx < 0) {
        const stops = total === n ? '' : ` The walk visits the ${total === 1 ? 'one' : total} with wall text.`;
        addLine(label, 'w-why', `${plural(n, 'piece')} on the wall.${stops} Use the arrows, or swipe, to walk it.`);
      } else {
        addLine(label, 'w-why', dots ? `${dots} of ${n} have a red dot so far.` : 'No red dots yet. Give it time.');
      }
      if (dots && walkIdx >= total) label.appendChild(Object.assign(document.createElement('span'), { className: 'w-dot' }));
      // Fit the wall into the space above the card, so the card covers nothing.
      const lr = label.getBoundingClientRect();
      const availH = (lr.top > 0 ? lr.top - r.top : r.height * 0.7) - 40;
      const sFit = Math.min((r.width - 64) / W(), availH / H());
      setView(sFit, (r.width - W() * sFit) / 2, 24 + (availH - H() * sFit) / 2);
      return;
    }
    const p = walkOrder[walkIdx];
    const b = bbox(p);
    // Write the label first, then frame the piece in the space it leaves:
    // beside it on wide screens, above it on narrow or short ones. Measuring
    // the real label is what keeps it off the piece on a landscape phone.
    if (p.name || p.why || p.by) {
      if (p.name) addLine(label, 'w-name', p.name);
      if (p.why) addLine(label, p.name ? 'w-why' : 'w-name', p.why);
      if (p.by) addLine(label, 'w-by', p.by);
    } else {
      addLine(label, 'w-name', describe(p));
    }
    if (p.dot) label.appendChild(Object.assign(document.createElement('span'), { className: 'w-dot', title: 'Yours' }));
    const lr = label.getBoundingClientRect();
    const besideRoom = r.width - lr.right - 40;
    const beside = besideRoom > r.width * 0.45;
    const freeTop = 24, freeRight = beside ? 40 : 16;
    const freeLeft = beside ? lr.right - r.left + 40 : 16;
    const freeBottom = beside ? 120 : Math.max(96, r.bottom - lr.top + 16);
    const aw = Math.max(80, r.width - freeLeft - freeRight), ah = Math.max(60, r.height - freeTop - freeBottom);
    const s = Math.min(aw / b.w, ah / b.h, fitS * 6) * 0.9;
    const tx = freeLeft + aw / 2 - (b.x + b.w / 2) * s;
    const ty = freeTop + ah / 2 - (b.y + b.h / 2) * s;
    setView(s, tx, ty);
  }
  function addLine(parent, cls, text) {
    const el = document.createElement('p');
    el.className = cls;
    el.textContent = text;
    parent.appendChild(el);
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
  let drawing = false;
  let drawColor = '#1c1b19', drawSize = 8;
  function enterDraw() {
    select(null);
    closePanel();
    closeCard();
    closeMenu();
    const el = $('#draw');
    el.hidden = false;
    $('#dock').hidden = true;
    drawing = true;
    document.body.classList.add('drawing');
    ['#stage', '#bar', '#zoom'].forEach(q => { $(q).inert = true; });
    setTimeout(() => { const b = $('#draw-colors [aria-checked="true"]'); if (b) b.focus(); }, 30);
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
      const k = clamp(2 / view.s, 2, 6);
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
    drawing = false;
    document.body.classList.remove('drawing');
    ['#stage', '#bar', '#zoom'].forEach(q => { $(q).inert = false; });
    $('#tool-draw').focus({ preventScroll: true });
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

  let captureChain = Promise.resolve();
  function captureWall(withLabels) {
    const run = captureChain.then(() => captureWallNow(withLabels));
    captureChain = run.catch(() => {});
    return run;
  }
  async function captureWallNow(withLabels) {
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
    const lines = [];
    String(text).split(/\n/).forEach(para => {
      let line = '';
      para.split(/\s+/).filter(Boolean).forEach(word => {
        // A word wider than the line is broken by characters.
        while (ctx.measureText(word).width > maxW && word.length > 1) {
          let i = word.length - 1;
          while (i > 1 && ctx.measureText((line ? line + ' ' : '') + word.slice(0, i)).width > maxW) i--;
          if (line && ctx.measureText(line + ' ' + word.slice(0, i)).width > maxW) { lines.push(line); line = ''; continue; }
          lines.push((line ? line + ' ' : '') + word.slice(0, i));
          line = '';
          word = word.slice(i);
        }
        const t = line ? line + ' ' + word : word;
        if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = word; }
        else line = t;
      });
      if (line) lines.push(line);
    });
    return lines;
  }
  // Keep at most n lines; the last one ends in an ellipsis if text was cut.
  function clampLines(ctx, lines, n, maxW) {
    if (lines.length <= n) return lines;
    const out = lines.slice(0, n);
    let last = out[n - 1];
    while (last.length > 1 && ctx.measureText(last + '...').width > maxW) last = last.slice(0, -1);
    out[n - 1] = last.replace(/[\s,.;:]+$/, '') + '...';
    return out;
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
    // Title: as big as fits on one line; a long one wraps to two lines.
    const title = showTitle.value.trim() || 'Untitled show';
    const maxTW = PW - M * 2;
    let fs = 340, lines = [title];
    const setF = () => { x.font = `600 ${fs}px "Funnel Display", sans-serif`; };
    setF();
    while (x.measureText(title).width > maxTW && fs > 200) { fs -= 10; setF(); }
    if (x.measureText(title).width > maxTW) {
      lines = wrapText(x, title, maxTW);
      while (lines.length > 2 && fs > 120) { fs -= 10; setF(); lines = wrapText(x, title, maxTW); }
      lines = clampLines(x, lines, 2, maxTW);
    }
    x.fillStyle = '#1c1b19';
    x.textBaseline = 'alphabetic';
    let ty = M + 120;
    lines.forEach(l => { ty += fs * 0.92; x.fillText(l, M - fs * 0.04, ty); });
    const top = ty + 140;

    // Wall text, laid out before the wall so the wall gets whatever is left.
    const items = walkList().filter(hasLabel);
    const colGap = 160, colW = (PW - M * 2 - colGap) / 2, textW = colW - 110;
    const footerY = PH - M + 60;
    // Each entry's lines and its exact drawn height at a type scale.
    const measureAt = (sc) => items.map(p => {
      x.font = `500 italic ${58 * sc}px "Host Grotesk", sans-serif`;
      const nameLines = clampLines(x, wrapText(x, p.name || shorten(p.why, 70) || describe(p), textW), 2, textW);
      x.font = `400 ${46 * sc}px "Host Grotesk", sans-serif`;
      const whyLines = p.name && p.why ? clampLines(x, wrapText(x, p.why, textW), 3, textW) : [];
      // Same arithmetic as the drawing below: 50 above, lines, by-line, 50 after.
      const h = (50 + nameLines.length * 70 + whyLines.length * 60 + (p.by ? 70 : 0) + 50) * sc;
      return { p, nameLines, whyLines, h };
    });
    // Split entries, in order, into two columns no taller than `room`,
    // keeping the columns as even as possible. Returns null if they don't fit.
    const split = (ms, room) => {
      const total = ms.reduce((t, m) => t + m.h, 0);
      let best = null, acc = 0;
      for (let i = 0; i <= ms.length; i++) {
        const left = acc, right = total - acc;
        if (left <= room && right <= room) {
          const tall = Math.max(left, right);
          if (!best || tall <= best.tall) best = { at: i, tall }; // ties go left
        }
        if (i < ms.length) acc += ms[i].h;
      }
      return best;
    };
    const minWallH = 1500;
    const room = footerY - 140 - top - minWallH - 170;
    let scale = 1, measured = [], layout = null, shown = items.length;
    if (items.length) {
      // Shrink the type until everything fits, down to a floor; then show as
      // many as fit, in order, and say how many more are on the wall.
      for (const sc of [1, 0.88, 0.76, 0.66]) {
        scale = sc; measured = measureAt(sc);
        layout = split(measured, room);
        if (layout) break;
      }
      while (!layout && shown > 1) {
        shown--;
        layout = split(measured.slice(0, shown), room - 90 * scale);
      }
      if (!layout) { shown = 0; layout = { at: 0, tall: 0 }; }
    }
    const listH = items.length ? layout.tall + (shown < items.length ? 90 * scale : 0) : 0;
    // The wall
    const availW = PW - M * 2;
    const availH = items.length ? footerY - 140 - top - listH - 170 : footerY - 160 - top;
    const k = Math.min(availW / img.width, availH / img.height);
    const ww = img.width * k, wh = img.height * k;
    const wx = (PW - ww) / 2;
    const wy = items.length ? top : top + (availH - wh) / 2;
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.28)'; x.shadowBlur = 60; x.shadowOffsetY = 24;
    x.drawImage(img, wx, wy, ww, wh);
    x.restore();

    if (items.length) {
      const startY = wy + wh + 170;
      const cols = [measured.slice(0, layout.at), measured.slice(layout.at, shown)];
      const sc = scale;
      cols.forEach((col, ci) => {
        let cy = startY;
        const cx0 = M + ci * (colW + colGap);
        col.forEach(m => {
          const { p } = m;
          if (p.dot) { x.fillStyle = '#c4122f'; x.beginPath(); x.arc(cx0 + 30, cy + 32 * sc, 19 * sc, 0, Math.PI * 2); x.fill(); }
          let ly = cy + 50 * sc;
          x.fillStyle = '#1c1b19';
          x.font = `500 italic ${58 * sc}px "Host Grotesk", sans-serif`;
          m.nameLines.forEach(l => { x.fillText(l, cx0 + 110, ly); ly += 70 * sc; });
          x.fillStyle = '#55524b';
          x.font = `400 ${46 * sc}px "Host Grotesk", sans-serif`;
          m.whyLines.forEach(l => { x.fillText(l, cx0 + 110, ly); ly += 60 * sc; });
          if (p.by) {
            x.font = `600 ${38 * sc}px "Host Grotesk", sans-serif`;
            x.fillStyle = '#6f6b63';
            x.fillText(p.by.toUpperCase(), cx0 + 110, ly + 6 * sc);
            ly += 70 * sc;
          }
          cy = ly + 50 * sc;
        });
      });
      const more = items.length - shown;
      if (more > 0) {
        x.fillStyle = '#55524b';
        x.font = `500 italic ${46 * sc}px "Host Grotesk", sans-serif`;
        x.fillText(`And ${plural(more, 'more piece')} on the wall.`, M + 110, startY + layout.tall + 60 * sc);
      }
    }
    // Footer
    x.fillStyle = '#8a867e';
    x.font = '500 40px "Host Grotesk", sans-serif';
    x.fillText('Hung with Visionbort, middleton.io/visionbort', M, footerY);
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
      let fs = 52;
      x.font = `600 ${fs}px "Funnel Display", sans-serif`;
      while (x.measureText(title).width > LW - 120 && fs > 30) { fs -= 2; x.font = `600 ${fs}px "Funnel Display", sans-serif`; }
      x.textAlign = 'center';
      x.fillText(clampLines(x, wrapText(x, title, LW - 120), 1, LW - 120)[0], LW / 2, LH * 0.925);
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
        let tfs = 76;
        const headline = shot.kind === 'open' ? title : 'That is the show.';
        x.font = `600 ${tfs}px "Funnel Display", sans-serif`;
        while (x.measureText(headline).width > cardW - 96 && tfs > 52) { tfs -= 4; x.font = `600 ${tfs}px "Funnel Display", sans-serif`; }
        const hl = clampLines(x, wrapText(x, headline, cardW - 96), 1, cardW - 96)[0];
        x.fillText(hl, cardX + 48, FH - 120 - ch + 120);
        x.fillStyle = '#55524b';
        x.font = '400 40px "Host Grotesk", sans-serif';
        const dots = board.pieces.filter(p => p.dot).length;
        const sub = shot.kind === 'open' ? `${plural(board.pieces.length, 'piece')} on the wall` : (dots ? `${plural(dots, 'red dot')} so far` : 'Hung with Visionbort');
        x.fillText(sub, cardX + 48, FH - 120 - ch + 200);
        if (shot.kind === 'close' && dots) { x.fillStyle = '#c4122f'; x.beginPath(); x.arc(cardX + cardW - 10, FH - 120 - ch + 10, 24, 0, Math.PI * 2); x.fill(); }
      } else if (shot.p) {
        const p = shot.p;
        x.font = '500 italic 54px "Host Grotesk", sans-serif';
        const nameLines = clampLines(x, wrapText(x, p.name || shorten(p.why, 70) || describe(p), cardW - 96), 2, cardW - 96);
        x.font = '400 38px "Host Grotesk", sans-serif';
        const whyLines = p.name && p.why ? clampLines(x, wrapText(x, p.why, cardW - 96), 3, cardW - 96) : [];
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
    // The film records in real time, and browsers stop animating hidden tabs.
    // Pause the recorder and the clock together while the tab is hidden, so
    // switching away doesn't leave a frozen stretch in the middle of the film.
    let t0 = performance.now();
    let hiddenAt = null;
    let resumeTick = null;
    const onVis = () => {
      if (document.hidden) {
        if (hiddenAt === null) { hiddenAt = performance.now(); if (rec.state === 'recording') rec.pause(); }
      } else if (hiddenAt !== null) {
        t0 += performance.now() - hiddenAt;
        hiddenAt = null;
        if (rec.state === 'paused') rec.resume();
        if (resumeTick) requestAnimationFrame(resumeTick);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    onVis();
    await new Promise((resolve) => {
      const tick = () => {
        if (stopped) return resolve();
        if (hiddenAt !== null) { resumeTick = tick; return; }
        const ms = performance.now() - t0;
        drawFrame(Math.min(ms, total));
        if (onProgress) onProgress(Math.min(1, ms / total));
        if (ms >= total + 200) return resolve();
        requestAnimationFrame(tick);
      };
      resumeTick = tick;
      if (hiddenAt === null) requestAnimationFrame(tick);
    });
    document.removeEventListener('visibilitychange', onVis);
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
        cap.textContent = 'Filming the walkthrough in real time. Keep this tab open.';
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
      img.alt = { poster: 'Poster preview', lock: 'Lock screen preview', wall: 'Preview of the wall' }[hangFmt] || 'Preview';
      frame.appendChild(img);
    }
    const caps = { poster: '18 by 24 inches at 200 dpi, ready to print', lock: 'Sized for a phone lock screen', wall: 'The whole wall at 2x', film: `A vertical walkthrough, about ${filmSeconds()} seconds` };
    $('#hang-cap').textContent = caps[hangFmt];
    $('#hang-save').disabled = false;
  }
  async function saveHang() {
    const blob = hangBlobs[hangFmt];
    if (!blob) return;
    const base = fileSlug(showTitle.value.trim(), 'visionbort');
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

  // ===== Calendar reminders =====
  // No backend: "Remind me" writes a standard calendar file (.ics) and the
  // person's own calendar does the nudging. Nothing leaves the device.
  const APP_URL = 'https://middleton.io/visionbort/';
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const SEASONS = { spring: [2, 20], summer: [5, 21], fall: [8, 22], autumn: [8, 22], winter: [11, 21] };

  // Turn a free-text "by when" into a date to prefill: "March 2027",
  // "June", "April 3", "Fall", "2027-04-01", "4/1/27", "end of year",
  // "next year". Anything unreadable falls back to a month from today.
  // The person can always change it; this only saves them a few taps.
  function parseByWhen(text, now) {
    now = now || new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const t = String(text || '').trim().toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
    const future = (d) => d < today ? null : d;
    const nextOccurrence = (m, day) => {
      let d = new Date(today.getFullYear(), m, day);
      if (d < today) d = new Date(today.getFullYear() + 1, m, day);
      return d;
    };
    let m;
    if ((m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) return future(new Date(+m[1], +m[2] - 1, +m[3])) || addDays(today, 7);
    if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/))) {
      const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      return future(new Date(y, +m[1] - 1, +m[2])) || addDays(today, 7);
    }
    const yearM = t.match(/\b(20\d{2})\b/);
    const year = yearM ? +yearM[1] : null;
    const mi = MONTHS.findIndex(name => new RegExp(`\\b${name.slice(0, 3)}[a-z]*\\b`).test(t));
    if (mi >= 0) {
      const dayM = t.match(new RegExp(`\\b${MONTHS[mi].slice(0, 3)}[a-z]* (\\d{1,2})\\b`)) || t.match(/\b(\d{1,2}) [a-z]+\b/);
      const day = dayM && +dayM[1] <= 31 ? +dayM[1] : 1;
      // A date that already passed means the goal is due now: check in soon.
      return year ? (future(new Date(year, mi, day)) || addDays(today, 7)) : nextOccurrence(mi, day);
    }
    const season = Object.keys(SEASONS).find(sname => new RegExp(`\\b${sname}\\b`).test(t));
    if (season) {
      const [sm, sd] = SEASONS[season];
      return year ? (future(new Date(year, sm, sd)) || addDays(today, 7)) : nextOccurrence(sm, sd);
    }
    if (/\bnext year\b/.test(t)) return new Date(today.getFullYear() + 1, 0, 1);
    if (/\b(end of (the )?year|this year|year end)\b/.test(t)) return future(new Date(today.getFullYear(), 11, 1)) || new Date(today.getFullYear() + 1, 11, 1);
    if (year) return future(new Date(year, 0, 1)) || addDays(today, 7);
    return addDays(today, 30);
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  function fromIsoDay(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  // RFC 5545 text: escape \ ; , and newlines; fold lines at 75 octets
  // without splitting a UTF-8 character.
  function icsText(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsFold(line) {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const out = [];
    let cur = '', curBytes = 0, limit = 75;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (curBytes + b > limit) { out.push(cur); cur = ''; curBytes = 0; limit = 74; }
      cur += ch; curBytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function buildIcs(events) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//middleton.io//Visionbort//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    events.forEach(ev => {
      const end = addDays(ev.date, 1);
      lines.push('BEGIN:VEVENT',
        `UID:${ev.uid}@visionbort.middleton.io`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(ev.date)}`,
        `DTEND;VALUE=DATE:${ymd(end)}`);
      if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
      lines.push(`SUMMARY:${icsText(ev.summary)}`,
        `DESCRIPTION:${icsText(ev.description)}`,
        `URL:${APP_URL}`,
        'TRANSP:TRANSPARENT',
        // All-day event: remind at 9am that day.
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(ev.summary)}`, 'TRIGGER;RELATED=START:PT9H', 'END:VALARM',
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  function pieceTitle(p) {
    return p.name || shorten(p.why, 48) || (p.type === 'text' ? shorten(p.content, 48) : (p.alt || 'a piece on your wall'));
  }
  function pieceReminder(p, date) {
    const show = showTitle.value.trim();
    const lines = [];
    if (p.why) lines.push(`Why it matters: ${p.why}`);
    if (p.by) lines.push(`By ${p.by}`);
    lines.push('', 'How is it going? If it came true, give it a red dot.', `Your wall${show ? ` (${show})` : ''}: ${APP_URL}`);
    return buildIcs([{ uid: `${p.id}-${ymd(date)}`, date, summary: `Check in: ${pieceTitle(p)}`, description: lines.join('\n') }]);
  }
  function showReminder(date) {
    const show = showTitle.value.trim() || 'your wall';
    const listed = readingOrder().filter(hasLabel);
    const lines = ['A few minutes with your wall. What moved? What came true?', ''];
    listed.slice(0, 20).forEach(p => lines.push(`${p.dot ? '(red dot) ' : ''}${pieceTitle(p)}${p.by ? `, by ${p.by}` : ''}`));
    if (listed.length > 20) lines.push(`and ${listed.length - 20} more`);
    lines.push('', APP_URL);
    return buildIcs([{ uid: `show-${ymd(date)}-${Math.random().toString(36).slice(2, 8)}`, date, rrule: 'FREQ=MONTHLY;COUNT=12', summary: `Walk your wall: ${show}`, description: lines.join('\n') }]);
  }

  function fileSlug(text, fallback) {
    const translit = { 'æ': 'ae', 'Æ': 'Ae', 'ø': 'o', 'Ø': 'O', 'ß': 'ss', 'œ': 'oe', 'Œ': 'Oe', 'đ': 'd', 'Đ': 'D', 'ł': 'l', 'Ł': 'L', 'þ': 'th', 'Þ': 'Th', 'ð': 'd', 'Ð': 'D' };
    return (String(text || '').replace(/[æÆøØßœŒđĐłŁþÞðÐ]/g, c => translit[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 48)) || fallback;
  }
  // A calendar file download. On iPhone and iPad, Safari opens it straight
  // into the Add to Calendar sheet (checked in the iOS simulator); a data:
  // URL navigation, the usual trick, is blocked there. Elsewhere it lands in
  // Downloads and opens in the calendar app.
  function deliverIcs(ics, name) {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    if (!ios) toast(`Saved ${name}. Open it to add the reminder to your calendar.`, { ms: 7000 });
  }

  function toggleRemindRow(open) {
    const row = $('#remind-row');
    const btn = $('#card-remind');
    const show = open == null ? row.hidden : open;
    row.hidden = !show;
    btn.setAttribute('aria-expanded', String(show));
    if (show) {
      const p = byId(cardForId);
      $('#remind-date').value = isoDay(parseByWhen(p && p.by));
      $('#remind-date').min = isoDay(new Date());
      $('#remind-date').focus();
    }
  }
  function saveRemind() {
    const p = byId(cardForId);
    const date = fromIsoDay($('#remind-date').value);
    if (!p || !date) { toast('Pick a date for the reminder.', { error: true }); return; }
    deliverIcs(pieceReminder(p, date), `check-in-${fileSlug(pieceTitle(p), 'visionbort')}.ics`);
    toggleRemindRow(false);
    $('#card-remind').focus();
  }
  function openCheckin() {
    closeMenu();
    const d = new Date();
    $('#checkin-date').value = isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    $('#checkin-date').min = isoDay(d);
    showDialog($('#dlg-checkin'), $('#checkin-date'));
  }
  function saveCheckin() {
    const date = fromIsoDay($('#checkin-date').value);
    if (!date) { toast('Pick a start date.', { error: true }); return; }
    const ics = showReminder(date);
    closeDialog();
    deliverIcs(ics, `monthly-walk-${fileSlug(showTitle.value.trim(), 'visionbort')}.ics`);
  }
  // For tests and for anyone reading the console.
  window.visionbortCalendar = { parseByWhen, buildIcs };

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
    const plain = [...region.children].filter(n => !n.classList.contains('banner'));
    while (plain.length > 2) plain.shift().remove();
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
    // A pending debounced save would be lost if the tab closes or the phone
    // switches apps right after an edit.
    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushSave();
      else adoptNewerFromStorage();
    });
    if (channel) channel.onmessage = (e) => { if (e.data && e.data.savedAt > lastSavedAt) adoptNewerFromStorage(); };

    // Paste images, including subjects lifted out of photos.
    document.addEventListener('paste', (e) => {
      if (e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]')) return;
      const all = [...(e.clipboardData ? e.clipboardData.items : [])];
      const files = all.filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile());
      if (files.length) { e.preventDefault(); hangFiles(files); }
      else if (all.length) toast('Paste a photo or a cutout to hang it. For words, use Words in the dock.');
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
    $('#card-remind').addEventListener('click', () => toggleRemindRow());
    $('#remind-save').addEventListener('click', saveRemind);
    $('#remind-date').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveRemind(); } });
    $('#opt-checkin').addEventListener('click', openCheckin);
    $('#checkin-cancel').addEventListener('click', closeDialog);
    $('#checkin-save').addEventListener('click', saveCheckin);
    $('#card-dot').addEventListener('click', () => {
      const p = byId(cardForId);
      if (!p) return;
      pushUndo();
      cardDirty = true;
      p.dot = !p.dot;
      p.dotAt = p.dot ? new Date().toISOString().slice(0, 10) : undefined;
      setDotUI(p.dot, p);
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
      try { dc.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
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
    const { migrated, migrateFailed, loadFailed: unreadable, skipped } = await loadBoard();
    delete board._skipped;
    showTitle.value = board.title || '';
    applyWall();
    renderAll();
    document.body.dataset.view = viewMode;
    fit();
    refreshUI();
    if (migrated) {
      // Words need their real fonts to size their boxes before anything is
      // clamped onto the wall.
      try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* ok */ }
      settleMigrated();
      renderAll();
    }
    // Words were measured before the web fonts arrived; measure again.
    document.fonts && document.fonts.ready.then(() => {
      board.pieces.forEach(p => { if (p.type === 'text') { const d = domOf(p.id); if (d) renderPiece(p); } });
      renderLabels();
    });
    if (unreadable) {
      setReadOnly(true);
      lsSet(WELCOMED_KEY, '1');
    } else if (migrated) {
      save();
      toast(skipped
        ? `Your board is hanging on a gallery wall now. ${plural(skipped, 'piece')} could not be read and ${skipped === 1 ? 'was' : 'were'} left out; your old board is still saved in this browser.`
        : 'Your board is hanging on a gallery wall now. Everything came with it.', { ms: skipped ? 12000 : 7000 });
      lsSet(WELCOMED_KEY, '1');
    } else if (migrateFailed) {
      toast('Your old board could not be read, so it was left exactly as it was.', { error: true, ms: 10000 });
      lsSet(WELCOMED_KEY, '1');
    } else if (!board.pieces.length && !lsGet(WELCOMED_KEY) && !legacyMode) {
      $('#welcome-ask').checked = askWhy;
      showDialog($('#dlg-welcome'), $('#welcome-title'));
    }
  }
  init();
})();
