import { SFX } from '../sfx.js';
import { celebrate } from '../gameFx.js';
import { renderVerbal, resetVerbalState } from './battleship-verbal.js';

const SIZE = 10;
const ROWS = 'ABCDEFGHIJ'.split('');
const SCAN_MS = 1000;

let placed = null;
let orientation = 'h';
let selected = 0;
let prevPhase = null;
let fleet = null;
let battleCtx = null;
let pendingShots = new Map();
let snapshotIncoming = {};
let snapshotEnemyShots = {};
let battleFxReady = false;
/** Casillas que deben seguir como "tocado" hasta revelar el disparo que hundió el barco. */
let deferSunkUntil = new Map();
function key(x, y) { return `${x},${y}`; }
function label(x, y) { return `${ROWS[y]}${x + 1}`; }

function cellsFor(x, y, size, orient) {
  const cells = [];
  for (let i = 0; i < size; i++) cells.push(orient === 'h' ? { x: x + i, y } : { x, y: y + i });
  return cells;
}

function occupiedSet(except = -1) {
  const set = new Set();
  placed.forEach((cells, i) => { if (cells && i !== except) cells.forEach((c) => set.add(key(c.x, c.y))); });
  return set;
}

function isValid(cells, except = -1) {
  if (!cells.every((c) => c.x >= 0 && c.y >= 0 && c.x < SIZE && c.y < SIZE)) return false;
  const occ = occupiedSet(except);
  return cells.every((c) => !occ.has(key(c.x, c.y)));
}

function randomize() {
  placed = fleet.map(() => null);
  fleet.forEach((ship, i) => {
    for (let t = 0; t < 600; t++) {
      const orient = Math.random() < 0.5 ? 'h' : 'v';
      const x = Math.floor(Math.random() * SIZE);
      const y = Math.floor(Math.random() * SIZE);
      const cells = cellsFor(x, y, ship.size, orient);
      if (isValid(cells, i)) { placed[i] = cells; break; }
    }
  });
  selected = placed.findIndex((c) => !c);
  if (selected < 0) selected = 0;
}

function ensureInit(ctx) {
  fleet = ctx.meta.fleet;
  if (prevPhase && prevPhase !== 'placement' && ctx.view.phase === 'placement') {
    placed = null;
    placementLive = null;
    placementGrid = null;
    resetShotFx();
  }
  if (!placed || placed.length !== fleet.length) {
    placed = fleet.map(() => null);
    orientation = 'h';
    selected = 0;
  }
}

function resetShotFx() {
  pendingShots.forEach((p) => { if (p.timer) clearTimeout(p.timer); });
  pendingShots.clear();
  snapshotIncoming = {};
  snapshotEnemyShots = {};
  deferSunkUntil.clear();
  battleFxReady = false;
  resetVerbalState();
}

function shotPk(board, x, y) {
  return `${board}:${key(x, y)}`;
}

function pruneDeferSunk() {
  for (const [cellK, holdPk] of deferSunkUntil) {
    const hp = pendingShots.get(holdPk);
    if (!hp || hp.revealed) deferSunkUntil.delete(cellK);
  }
}

function applySunkDefer(view, pk, triggerK) {
  const sunkCell = (view.sunkEnemyCells || []).find((c) => key(c.x, c.y) === triggerK);
  if (!sunkCell?.name) return;
  for (const c of view.sunkEnemyCells) {
    if (c.name === sunkCell.name) deferSunkUntil.set(key(c.x, c.y), pk);
  }
}

function syncShotsFromView(view) {
  const enemyShots = view.enemyShots || {};
  const incoming = view.myIncoming || {};

  if (!battleFxReady) {
    snapshotEnemyShots = { ...enemyShots };
    snapshotIncoming = { ...incoming };
    battleFxReady = true;
    return;
  }

  pruneDeferSunk();
  const sunkSet = new Set((view.sunkEnemyCells || []).map((c) => key(c.x, c.y)));

  for (const k of Object.keys(enemyShots)) {
    const prev = snapshotEnemyShots[k];
    const cur = enemyShots[k];
    const isNew = !prev;
    const upgradedToSunk = prev === 'hit' && cur === 'sunk';

    if (!isNew && !upgradedToSunk) continue;

    const [x, y] = k.split(',').map(Number);
    const pk = shotPk('fire', x, y);
    let p = pendingShots.get(pk);
    if (!p) {
      p = { board: 'fire', x, y, started: Date.now(), result: null, revealed: false, timer: null };
      pendingShots.set(pk, p);
    }
    if (isNew) {
      p.result = sunkSet.has(k) || cur === 'sunk' ? 'sunk' : cur;
      if (sunkSet.has(k) || cur === 'sunk') applySunkDefer(view, pk, k);
      scheduleReveal(pk);
    } else if (upgradedToSunk) {
      const active = [...pendingShots.values()].find((entry) => entry.board === 'fire' && !entry.revealed);
      const holdPk = active ? shotPk('fire', active.x, active.y) : pk;
      applySunkDefer(view, holdPk, k);
    }
  }

  for (const k of Object.keys(incoming)) {
    if (snapshotIncoming[k]) continue;
    const [x, y] = k.split(',').map(Number);
    const pk = shotPk('own', x, y);
    let p = pendingShots.get(pk);
    if (!p) {
      p = { board: 'own', x, y, started: Date.now(), result: null, revealed: false, timer: null };
      pendingShots.set(pk, p);
    }
    p.result = incoming[k];
    scheduleReveal(pk);
  }

  snapshotEnemyShots = { ...enemyShots };
  snapshotIncoming = { ...incoming };
}

function scheduleReveal(pk) {
  const p = pendingShots.get(pk);
  if (!p || p.revealed || p.result == null || p.timer) return;
  const delay = Math.max(0, SCAN_MS - (Date.now() - p.started));
  p.timer = setTimeout(() => {
    p.revealed = true;
    p.timer = null;
    for (const [cellK, holdPk] of deferSunkUntil) {
      if (holdPk === pk) deferSunkUntil.delete(cellK);
    }
    if (p.result === 'sunk') SFX.bsSunk();
    else if (p.result === 'hit') SFX.bsHit();
    else if (p.result === 'miss') SFX.bsMiss();
    if (battleCtx) renderBattle(battleCtx);
  }, delay);
}

function hasActiveScan() {
  return [...pendingShots.values()].some((p) => !p.revealed);
}

function startLocalFire(x, y, send) {
  const pk = shotPk('fire', x, y);
  if (pendingShots.has(pk) || hasActiveScan()) return false;
  pendingShots.set(pk, {
    board: 'fire', x, y, started: Date.now(), result: null, revealed: false, timer: null,
  });
  send({ type: 'fire', x, y });
  return true;
}

function paintShotCell(cell, board, x, y, { shots, incoming, sunkSet, shipSet, shipTiny }) {
  const visual = getCellVisual(board, x, y, { shots, incoming, sunkSet, shipSet, shipTiny });
  return applyCellVisual(cell, visual, board);
}

function getCellVisual(board, x, y, { shots, incoming, sunkSet, shipSet, shipTiny }) {
  const k = key(x, y);
  const pk = shotPk(board, x, y);
  const pending = pendingShots.get(pk);
  if (pending && !pending.revealed) return 'scan';

  const shot = board === 'fire' ? shots?.[k] : incoming?.[k];
  const isSunk = shot === 'sunk' || sunkSet?.has(k);
  const holdPk = deferSunkUntil.get(k);
  const holdPending = holdPk ? pendingShots.get(holdPk) : null;
  const deferSunk = deferSunkUntil.has(k) && !!(holdPending && !holdPending.revealed);

  if (isSunk && !deferSunk) return 'sunk';
  if (shot === 'hit' || shot === 'sunk' || (isSunk && deferSunk)) {
    return board === 'fire' ? 'hit' : 'hit-own';
  }
  if (shot === 'miss') return board === 'fire' ? 'miss' : 'miss-own';
  if (board === 'own' && shipSet?.has(k)) return shipTiny?.has(k) ? 'ship-tiny' : 'ship';
  return 'empty';
}

function applyCellVisual(cell, visual) {
  if (cell.dataset.visual === visual) return false;
  const prev = cell.dataset.visual;
  cell.dataset.visual = visual;
  cell.className = 'bs-cell';
  cell.replaceChildren();

  switch (visual) {
    case 'scan':
      cell.classList.add('scanning');
      cell.insertAdjacentHTML('beforeend', markupScanning());
      break;
    case 'sunk':
      cell.classList.add('sunk');
      if (prev === 'scan') cell.classList.add('revealed-fx');
      cell.insertAdjacentHTML('beforeend', markupSunk());
      break;
    case 'hit':
      cell.classList.add('hit');
      if (prev === 'scan') cell.classList.add('revealed-fx');
      cell.insertAdjacentHTML('beforeend', markupHit());
      break;
    case 'hit-own':
      cell.classList.add('hit-own');
      if (prev === 'scan') cell.classList.add('revealed-fx');
      cell.insertAdjacentHTML('beforeend', markupHit());
      break;
    case 'miss':
      cell.classList.add('miss');
      if (prev === 'scan') cell.classList.add('revealed-fx');
      cell.insertAdjacentHTML('beforeend', markupMiss());
      break;
    case 'miss-own':
      cell.classList.add('miss-own');
      if (prev === 'scan') cell.classList.add('revealed-fx');
      cell.insertAdjacentHTML('beforeend', markupMiss());
      break;
    case 'ship-tiny':
      cell.classList.add('ship', 'ship-tiny');
      break;
    case 'ship':
      cell.classList.add('ship');
      break;
    default:
      break;
  }
  return true;
}

function buildShipSets(ships) {
  const shipSet = new Set();
  const shipTiny = new Set();
  if (ships) {
    ships.forEach((s) => s.cells.forEach((c) => {
      shipSet.add(key(c.x, c.y));
      if (s.cells.length === 1) shipTiny.add(key(c.x, c.y));
    }));
  }
  return { shipSet, shipTiny };
}

function refreshBoardGrid(grid, board, opts, canFire) {
  if (!grid) return;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = grid.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      if (!cell) continue;
      const k = key(x, y);
      const visual = getCellVisual(board, x, y, opts);
      applyCellVisual(cell, visual);
      const clickable = canFire && visual === 'empty';
      cell.classList.toggle('clickable', clickable);
      cell.toggleAttribute('data-fire', clickable);
    }
  }
}

function handleFireBoardClick(e) {
  const cell = e.target.closest('.bs-cell[data-fire]');
  if (!cell || !battleCtx) return;
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  if (startLocalFire(x, y, battleCtx.send)) {
    const live = battleCtx.root.querySelector('.bs-battle-live');
    if (live) patchBattleDom(battleCtx, live);
  }
}

function markupScanning() {
  return `<div class="bs-fx bs-fx-scan" aria-hidden="true">
    <span class="bs-sonar-ring"></span>
    <span class="bs-sonar-sweep"></span>
    <span class="bs-reticle"></span>
  </div>`;
}

function markupHit() {
  return `<div class="bs-fx bs-fx-hit" title="Tocado">
    <span class="bs-peg"></span>
    <span class="bs-lbl bs-lbl-hit">Tocado</span>
  </div>`;
}

function markupMiss() {
  return `<div class="bs-fx bs-fx-miss" title="Agua">
    <svg viewBox="0 0 32 32" class="bs-svg">
      <ellipse class="bs-splash-outer" cx="16" cy="18" rx="11" ry="5"/>
      <ellipse class="bs-splash-inner" cx="16" cy="18" rx="6" ry="3"/>
      <path class="bs-splash-drop" d="M16 8c-2 4-4 6-4 9a4 4 0 008 0c0-3-2-5-4-9z"/>
    </svg>
    <span class="bs-lbl bs-lbl-miss">Agua</span>
  </div>`;
}

function markupSunk() {
  return `<div class="bs-fx bs-fx-sunk" title="Hundido">
    <span class="bs-burst"></span>
    <span class="bs-lbl bs-lbl-sunk">Hundido</span>
  </div>`;
}
export default function render(ctx) {
  if (ctx.view.playMode === 'verbal') {
    renderVerbal(ctx);
    prevPhase = ctx.view.phase;
    return;
  }
  ensureInit(ctx);
  if (ctx.view.phase === 'placement') {
    battleFxReady = false;
    renderPlacement(ctx);
  } else {
    if (prevPhase === 'placement') battleFxReady = false;
    renderBattle(ctx);
  }
  prevPhase = ctx.view.phase;
}

let placementLive = null;
let placementGrid = null;

function patchPlacementBoard() {
  if (!placementGrid) return;
  clearPreview(placementGrid);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = placementGrid.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      if (!cell) continue;
      cell.className = 'bs-cell';
      delete cell.dataset.shipSize;
      const shipIdx = placed.findIndex((cells) => cells?.some((c) => c.x === x && c.y === y));
      if (shipIdx >= 0) {
        cell.classList.add('ship');
        cell.dataset.shipSize = fleet[shipIdx].size;
      }
    }
  }
}

function patchPlacementPalette(pal) {
  if (!pal) return;
  pal.querySelectorAll('.bs-ship-chip').forEach((chip, i) => {
    chip.classList.toggle('placed', !!placed[i]);
    chip.classList.toggle('active', i === selected);
  });
}

function patchPlacementControls(wrap) {
  const ready = wrap.querySelector('.bs-ready-btn');
  if (ready) ready.disabled = !placed.every(Boolean);
  const rot = wrap.querySelector('.bs-rotate-btn');
  if (rot) rot.textContent = '🔄 Girar ' + (orientation === 'h' ? '↔' : '↕');
}

function onPlacementCellClick(ctx, x, y) {
  const idx = placed.findIndex((cells) => cells?.some((c) => c.x === x && c.y === y));
  if (idx >= 0) {
    placed[idx] = null;
    selected = idx;
    patchPlacementUI(ctx);
    return;
  }
  if (selected < 0 || placed[selected]) {
    const next = placed.findIndex((c) => !c);
    if (next < 0) return;
    selected = next;
  }
  const cells = cellsFor(x, y, fleet[selected].size, orientation);
  if (!isValid(cells, selected)) {
    ctx.toast('No puedes colocar ahí.', 'error');
    return;
  }
  placed[selected] = cells;
  const next = placed.findIndex((c) => !c);
  selected = next < 0 ? selected : next;
  patchPlacementUI(ctx);
}

function patchPlacementUI(ctx) {
  if (!placementLive) {
    renderPlacement(ctx);
    return;
  }
  patchPlacementPalette(placementLive.querySelector('.bs-palette'));
  patchPlacementBoard();
  patchPlacementControls(placementLive);
}

/* ===== Colocación ===== */
function renderPlacement(ctx) {
  const { view, root, send, toast } = ctx;

  if (view.myReady) {
    placementLive = null;
    placementGrid = null;
    root.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'bs-game bs-placement';
    wrap.innerHTML = `<div class="bs-title">🚢 Tocado y Hundido</div>`;
    wrap.appendChild(section('Tu flota', buildBoard({ mode: 'own', ships: view.myShips, incoming: {} }, null, false)));
    const wait = document.createElement('p');
    wait.className = 'bs-status';
    wait.textContent = view.enemyReady ? '⚔️ Comenzando batalla…' : '⏳ Esperando a que tu rival coloque su flota…';
    wrap.appendChild(wait);
    root.appendChild(wrap);
    return;
  }

  if (placementLive && root.contains(placementLive)) {
    patchPlacementUI(ctx);
    return;
  }

  root.innerHTML = '';
  placementLive = document.createElement('div');
  placementLive.className = 'bs-game bs-placement';
  placementLive.innerHTML = `<div class="bs-title">🚢 Tocado y Hundido</div>`;

  const pal = buildFleetPalette(
    fleet, placed, selected,
    (i) => { selected = i; patchPlacementUI(ctx); },
    (i) => { placed[i] = null; selected = i; patchPlacementUI(ctx); },
  );
  placementLive.appendChild(pal);

  placementGrid = buildBoardSkeleton(false, false);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = placementGrid.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      cell.addEventListener('mouseenter', () => preview(placementGrid, x, y));
      cell.addEventListener('mouseleave', () => clearPreview(placementGrid));
      cell.addEventListener('click', (e) => {
        e.preventDefault();
        onPlacementCellClick(ctx, x, y);
      });
    }
  }
  placementLive.appendChild(section('Coloca tu flota', placementGrid));

  const controls = document.createElement('div');
  controls.className = 'bs-controls';
  const rot = ctrl('🔄 Girar ↔', () => { orientation = orientation === 'h' ? 'v' : 'h'; patchPlacementUI(ctx); });
  rot.className = 'btn btn-ghost bs-rotate-btn';
  controls.append(
    rot,
    ctrl('🎲 Aleatorio', () => { randomize(); patchPlacementUI(ctx); }),
    ctrl('🗑️ Borrar todo', () => { placed = fleet.map(() => null); selected = 0; patchPlacementUI(ctx); }),
  );
  const ready = document.createElement('button');
  ready.type = 'button';
  ready.className = 'btn btn-primary bs-ready-btn';
  ready.textContent = '⚓ ¡Flota lista!';
  ready.addEventListener('click', () => {
    if (!placed.every(Boolean)) return toast('Coloca los 10 barcos.', 'error');
    send({ type: 'placeShips', ships: placed.map((cells) => ({ cells })) });
  });
  controls.appendChild(ready);
  placementLive.appendChild(controls);

  const hint = document.createElement('p');
  hint.className = 'bs-hint';
  hint.textContent = 'Selecciona un barco, haz clic en el tablero para colocarlo. Clic en un barco colocado para quitarlo.';
  placementLive.appendChild(hint);
  root.appendChild(placementLive);
  patchPlacementUI(ctx);
}

function preview(grid, x, y) {
  clearPreview(grid);
  if (selected < 0 || placed[selected]) {
    const next = placed.findIndex((c) => !c);
    if (next < 0) return;
    selected = next;
  }
  const cells = cellsFor(x, y, fleet[selected].size, orientation);
  const valid = isValid(cells, selected);
  cells.forEach((c) => {
    if (c.x < 0 || c.y < 0 || c.x >= SIZE || c.y >= SIZE) return;
    const el = grid.querySelector(`[data-x="${c.x}"][data-y="${c.y}"]`);
    if (el) el.classList.add(valid ? 'preview' : 'invalid');
  });
}

function clearPreview(grid) {
  grid.querySelectorAll('.preview, .invalid').forEach((el) => el.classList.remove('preview', 'invalid'));
}

/* ===== Batalla ===== */
function renderBattle(ctx) {
  battleCtx = ctx;
  syncShotsFromView(ctx.view);

  const live = ctx.root.querySelector('.bs-battle-live');
  if (live) {
    patchBattleDom(ctx, live);
    return;
  }
  mountBattleDom(ctx);
}

function mountBattleDom(ctx) {
  placementLive = null;
  placementGrid = null;
  const { view, root, me } = ctx;
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'bs-game bs-battle-live bs-battle-layout';

  wrap.innerHTML = `<div class="bs-title">🚢 Tocado y Hundido</div>`;

  const ownShips = buildShipSets(view.myShips);
  const ownGrid = buildBoardSkeleton(false, true);
  ownGrid.dataset.board = 'own';
  ownGrid.classList.add('bs-board-own');
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      applyCellVisual(
        ownGrid.querySelector(`[data-x="${x}"][data-y="${y}"]`),
        getCellVisual('own', x, y, {
          incoming: view.myIncoming,
          sunkSet: new Set(),
          shipSet: ownShips.shipSet,
          shipTiny: ownShips.shipTiny,
        }),
      );
    }
  }

  const ownStrip = document.createElement('div');
  ownStrip.className = 'bs-battle-own';
  const ownSection = section('Tu flota', ownGrid);
  ownSection.classList.add('bs-own-section');
  ownStrip.appendChild(ownSection);
  ownStrip.appendChild(buildLegend('Tus barcos', view.myFleetStatus || [], 'own'));
  wrap.appendChild(ownStrip);

  const fireGrid = buildBoardSkeleton(true, false);
  fireGrid.dataset.board = 'fire';
  fireGrid.classList.add('bs-board-fire');
  fireGrid.addEventListener('click', handleFireBoardClick);

  const fireMain = document.createElement('div');
  fireMain.className = 'bs-battle-fire';
  const fireSection = section('Elige dónde disparar', fireGrid);
  fireSection.classList.add('bs-fire-section');
  fireMain.appendChild(fireSection);
  fireMain.appendChild(buildLegend('Barcos enemigos', view.enemyFleetStatus || [], 'enemy'));
  wrap.appendChild(fireMain);

  const msg = document.createElement('div');
  msg.className = 'bs-shot-msg';
  msg.hidden = true;
  wrap.appendChild(msg);

  const scanHint = document.createElement('p');
  scanHint.className = 'bs-scan-hint';
  scanHint.hidden = true;
  wrap.appendChild(scanHint);

  const resultKey = document.createElement('div');
  resultKey.className = 'bs-result-key';
  resultKey.innerHTML = `
    <span><i class="bs-key-dot hit"></i> Tocado</span>
    <span><i class="bs-key-dot sunk"></i> Hundido</span>
    <span><i class="bs-key-dot miss"></i> Agua</span>`;
  wrap.appendChild(resultKey);

  root.appendChild(wrap);
  patchBattleDom(ctx, wrap);
}

let prevBSStatus = '';

function patchBattleDom(ctx, live) {
  const { view, me } = ctx;
  const sunkSet = new Set((view.sunkEnemyCells || []).map((c) => key(c.x, c.y)));
  const ownShips = buildShipSets(view.myShips);
  const myTurn = view.turn === me && view.status === 'playing';
  const canFire = myTurn && !hasActiveScan();

  refreshBoardGrid(live.querySelector('[data-board="own"]'), 'own', {
    incoming: view.myIncoming,
    sunkSet: new Set(),
    shipSet: ownShips.shipSet,
    shipTiny: ownShips.shipTiny,
  }, false);

  refreshBoardGrid(live.querySelector('[data-board="fire"]'), 'fire', {
    shots: view.enemyShots,
    sunkSet,
  }, canFire);

  refreshLegend(live.querySelector('[data-legend="own"]'), view.myFleetStatus || []);
  refreshLegend(live.querySelector('[data-legend="enemy"]'), view.enemyFleetStatus || []);

  const msg = live.querySelector('.bs-shot-msg');
  if (msg) {
    if (view.lastShot) {
      const who = view.lastShot.by === me ? 'Tú' : ctx.nameOf(view.lastShot.by);
      const coord = view.lastShot.coord || label(view.lastShot.x, view.lastShot.y);
      msg.className = 'bs-shot-msg ' + view.lastShot.result;
      msg.hidden = false;
      if (view.lastShot.result === 'hit') {
        msg.innerHTML = `💥 <strong>${who}</strong> tocó en <strong>${coord}</strong>${view.lastShot.sunk ? ` — ¡Hundido el <em>${view.lastShot.sunk}</em>!` : ''}`;
      } else {
        msg.innerHTML = `🌊 <strong>${who}</strong> falló en <strong>${coord}</strong> — Agua`;
      }
    } else {
      msg.hidden = true;
    }
  }

  const scanHint = live.querySelector('.bs-scan-hint');
  if (scanHint) {
    scanHint.hidden = !hasActiveScan();
    if (!scanHint.hidden) scanHint.textContent = '📡 Sonar activo…';
  }

  if (view.status === 'finished' && prevBSStatus !== 'finished') {
    if (view.winner === me) {
      SFX.gameWin('battleship');
      celebrate(live, '🎉', 40);
    } else if (view.winner) {
      SFX.gameLose('battleship');
    }
  }
  prevBSStatus = view.status;
}
/* ===== Componentes de tablero ===== */
function section(title, content) {
  const s = document.createElement('div');
  s.className = 'bs-section';
  s.innerHTML = `<div class="bs-section-title">${title}</div>`;
  s.appendChild(content);
  return s;
}

function buildBoardSkeleton(interactive, compact = false) {
  const outer = document.createElement('div');
  outer.className = 'bs-board-wrap' + (compact ? ' bs-board-compact' : ' bs-board-main');

  const coordW = compact ? 16 : 28;

  const corner = document.createElement('div');
  corner.className = 'bs-corner';
  outer.appendChild(corner);

  for (let x = 0; x < SIZE; x++) {
    const h = document.createElement('div');
    h.className = 'bs-coord bs-coord-top';
    h.textContent = x + 1;
    outer.appendChild(h);
  }

  for (let y = 0; y < SIZE; y++) {
    const rowLabel = document.createElement('div');
    rowLabel.className = 'bs-coord bs-coord-left';
    rowLabel.textContent = ROWS[y];
    outer.appendChild(rowLabel);

    for (let x = 0; x < SIZE; x++) {
      const cell = document.createElement('div');
      cell.className = 'bs-cell';
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.title = label(x, y);
      outer.appendChild(cell);
    }
  }

  outer.style.gridTemplateColumns = `${coordW}px repeat(${SIZE}, 1fr)`;
  return outer;
}

function buildBoard(opts, onFire, canFire) {
  const grid = buildBoardSkeleton(!!onFire);
  const { shipSet, shipTiny } = buildShipSets(opts.ships);
  const sunkSet = opts.sunkSet || new Set((opts.sunkCells || []).map((c) => key(c.x, c.y)));

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = grid.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      const k = key(x, y);

      if (opts.mode === 'own') {
        paintShotCell(cell, 'own', x, y, {
          incoming: opts.incoming,
          sunkSet: new Set(),
          shipSet,
          shipTiny,
        });
      }

      if (opts.mode === 'fire') {
        paintShotCell(cell, 'fire', x, y, { shots: opts.shots, sunkSet });
        if (canFire && cell.dataset.visual === 'empty') {
          cell.classList.add('clickable');
          cell.addEventListener('click', () => onFire(x, y));
        }
      }
    }
  }
  return grid;
}
function legendGroups() {
  return [
    { size: 4, count: 1 },
    { size: 3, count: 2 },
    { size: 2, count: 3 },
    { size: 1, count: 4 },
  ];
}

function createLegendRow(ship, size) {
  const row = document.createElement('div');
  row.className = 'bs-legend-row' + (ship?.sunk ? ' sunk' : '');
  const blocks = document.createElement('div');
  blocks.className = 'bs-legend-ship';
  for (let b = 0; b < size; b++) {
    const block = document.createElement('span');
    block.className = 'bs-legend-cell';
    if (ship && b < ship.hits) block.classList.add('hit');
    blocks.appendChild(block);
  }
  row.appendChild(blocks);
  const chk = document.createElement('span');
  chk.className = 'bs-legend-check';
  chk.textContent = ship?.sunk ? '✓' : '';
  chk.setAttribute('aria-hidden', ship?.sunk ? 'false' : 'true');
  row.appendChild(chk);
  return row;
}

function appendLegendRows(parent, statusList) {
  legendGroups().forEach((g) => {
    const shipsOfSize = statusList.filter((s) => s.size === g.size);
    for (let i = 0; i < g.count; i++) {
      parent.appendChild(createLegendRow(shipsOfSize[i], g.size));
    }
  });
}

function refreshLegend(leg, statusList) {
  if (!leg) return;
  leg.querySelectorAll('.bs-legend-row').forEach((row) => row.remove());
  appendLegendRows(leg, statusList);
}

function buildLegend(title, statusList, type) {
  const leg = document.createElement('div');
  leg.className = 'bs-legend';
  leg.dataset.legend = type;
  leg.innerHTML = `<div class="bs-legend-title">${title}</div>`;
  appendLegendRows(leg, statusList);
  return leg;
}

function buildFleetPalette(fleetList, placedArr, sel, onSelect, onRemove) {
  const pal = document.createElement('div');
  pal.className = 'bs-palette';
  pal.innerHTML = '<div class="bs-palette-title">Barcos a colocar</div>';

  const groups = [
    { size: 4, count: 1, name: 'Acorazado' },
    { size: 3, count: 2, name: 'Crucero' },
    { size: 2, count: 3, name: 'Destructor' },
    { size: 1, count: 4, name: 'Submarino' },
  ];

  let idx = 0;
  groups.forEach((g) => {
    for (let c = 0; c < g.count; c++) {
      const i = idx++;
      const chip = document.createElement('button');
      chip.className = 'bs-ship-chip';
      if (placedArr[i]) chip.classList.add('placed');
      if (i === sel) chip.classList.add('active');

      const visual = document.createElement('span');
      visual.className = 'bs-chip-visual';
      for (let b = 0; b < g.size; b++) {
        const block = document.createElement('span');
        block.className = 'bs-chip-cell';
        visual.appendChild(block);
      }
      chip.appendChild(visual);
      chip.appendChild(document.createTextNode(g.name + (g.count > 1 ? ` ${c + 1}` : '')));

      chip.addEventListener('click', () => {
        if (placedArr[i]) onRemove(i);
        else onSelect(i);
      });
      pal.appendChild(chip);
    }
  });
  return pal;
}

function ctrl(text, fn) {
  const b = document.createElement('button');
  b.className = 'btn btn-ghost';
  b.style.cssText = 'padding:10px 14px;font-size:.88rem';
  b.textContent = text;
  b.addEventListener('click', fn);
  return b;
}
