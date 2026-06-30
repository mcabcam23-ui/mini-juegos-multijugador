import { SFX } from '../sfx.js';

const SIZE = 10;
const ROWS = 'ABCDEFGHIJ'.split('');
const LONG_PRESS_MS = 550;

let verbalCtx = null;
let liveRoot = null;
let openPopover = null;
let pressTimer = null;

function key(x, y) { return `${x},${y}`; }
function label(x, y) { return `${ROWS[y]}${x + 1}`; }

function markupHit() {
  return `<div class="bs-fx bs-fx-hit" title="Tocado"><span class="bs-peg"></span></div>`;
}
function markupMiss() {
  return `<div class="bs-fx bs-fx-miss" title="Agua"><svg viewBox="0 0 32 32" class="bs-svg"><ellipse class="bs-splash-outer" cx="16" cy="18" rx="11" ry="5"/><ellipse class="bs-splash-inner" cx="16" cy="18" rx="6" ry="3"/><path class="bs-splash-drop" d="M16 8c-2 4-4 6-4 9a4 4 0 008 0c0-3-2-5-4-9z"/></svg></div>`;
}
function markupSunk() {
  return `<div class="bs-fx bs-fx-sunk" title="Hundido"><span class="bs-burst"></span></div>`;
}

function buildShipSets(ships) {
  const shipSet = new Set();
  const shipTiny = new Set();
  if (!ships) return { shipSet, shipTiny };
  for (const ship of ships) {
    if (ship.cells.length === 1) shipTiny.add(key(ship.cells[0].x, ship.cells[0].y));
    else ship.cells.forEach((c) => shipSet.add(key(c.x, c.y)));
  }
  return { shipSet, shipTiny };
}

function applyCellVisual(cell, visual, hasShip = false) {
  if (cell.dataset.visual === visual && cell.dataset.hasShip === (hasShip ? '1' : '0')) return;
  cell.dataset.visual = visual;
  cell.dataset.hasShip = hasShip ? '1' : '0';
  cell.className = 'bs-cell bs-verbal-cell';
  cell.replaceChildren();
  if (hasShip && visual === 'empty') {
    cell.classList.add('ship');
  }
  switch (visual) {
    case 'sunk':
      cell.classList.add('sunk');
      cell.insertAdjacentHTML('beforeend', markupSunk());
      break;
    case 'hit':
      cell.classList.add('hit');
      cell.insertAdjacentHTML('beforeend', markupHit());
      break;
    case 'hit-own':
      cell.classList.add('hit-own');
      cell.insertAdjacentHTML('beforeend', markupHit());
      break;
    case 'miss':
      cell.classList.add('miss');
      cell.insertAdjacentHTML('beforeend', markupMiss());
      break;
    case 'miss-own':
      cell.classList.add('miss-own');
      cell.insertAdjacentHTML('beforeend', markupMiss());
      break;
    default:
      break;
  }
}

function markToVisual(mark, board) {
  if (mark === 'sunk') return 'sunk';
  if (mark === 'hit') return board === 'enemy' ? 'hit' : 'hit-own';
  if (mark === 'miss') return board === 'enemy' ? 'miss' : 'miss-own';
  return 'empty';
}

function buildBoardSkeleton() {
  const outer = document.createElement('div');
  outer.className = 'bs-board-wrap';
  outer.appendChild(Object.assign(document.createElement('div'), { className: 'bs-corner' }));
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
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'bs-cell bs-verbal-cell';
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.title = label(x, y);
      outer.appendChild(cell);
    }
  }
  outer.style.gridTemplateColumns = `28px repeat(${SIZE}, 1fr)`;
  return outer;
}

function section(title, content) {
  const s = document.createElement('div');
  s.className = 'bs-section';
  s.innerHTML = `<div class="bs-section-title">${title}</div>`;
  s.appendChild(content);
  return s;
}

function closePopover() {
  openPopover?.remove();
  openPopover = null;
}

function sendMark(board, x, y, mark) {
  if (!verbalCtx) return;
  if (mark === 'miss') SFX.bsMiss();
  else SFX.bsHit();
  verbalCtx.send({ type: 'markCell', board, x, y, mark, silent: true });
}

function sendSinkGroup(board, x, y) {
  if (!verbalCtx) return;
  SFX.bsSunk();
  verbalCtx.send({ type: 'sinkGroup', board, x, y, silent: true });
}

function showPopover(cell, board, x, y) {
  closePopover();
  const marks = board === 'enemy' ? verbalCtx.view.enemyMarks : verbalCtx.view.myIncoming;
  const cur = marks?.[key(x, y)];
  if (cur === 'sunk') return;

  const pop = document.createElement('div');
  pop.className = 'bs-verbal-pop';
  pop.innerHTML = `
    <button type="button" class="bs-verbal-pop-btn miss" data-mark="miss">💧 Agua</button>
    <button type="button" class="bs-verbal-pop-btn hit" data-mark="hit">💥 Tocado</button>`;
  pop.querySelector('[data-mark="miss"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closePopover();
    sendMark(board, x, y, 'miss');
  });
  pop.querySelector('[data-mark="hit"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closePopover();
    sendMark(board, x, y, 'hit');
  });

  const rect = cell.getBoundingClientRect();
  const stage = verbalCtx.root.closest('#game-stage') || verbalCtx.root;
  stage.appendChild(pop);
  const stageRect = stage.getBoundingClientRect();
  pop.style.left = `${rect.left - stageRect.left + rect.width / 2}px`;
  pop.style.top = `${rect.top - stageRect.top + rect.height / 2}px`;
  openPopover = pop;

  requestAnimationFrame(() => {
    document.addEventListener('click', onDocClick, { once: true });
  });
}

function onDocClick(e) {
  if (openPopover && !openPopover.contains(e.target)) closePopover();
}

function bindMarkCell(cell, board) {
  cell.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!verbalCtx) return;
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const marks = board === 'enemy' ? verbalCtx.view.enemyMarks : verbalCtx.view.myIncoming;
    const cur = marks?.[key(x, y)];
    if (cur === 'hit') return;
    if (cur === 'sunk') return;
    showPopover(cell, board, x, y);
  });

  cell.addEventListener('pointerdown', (e) => {
    if (!verbalCtx) return;
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const marks = board === 'enemy' ? verbalCtx.view.enemyMarks : verbalCtx.view.myIncoming;
    if (marks?.[key(x, y)] !== 'hit') return;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      closePopover();
      sendSinkGroup(board, x, y);
      cell.classList.add('bs-verbal-hold');
      setTimeout(() => cell.classList.remove('bs-verbal-hold'), 200);
    }, LONG_PRESS_MS);
  });

  const cancelPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };
  cell.addEventListener('pointerup', cancelPress);
  cell.addEventListener('pointerleave', cancelPress);
  cell.addEventListener('pointercancel', cancelPress);
}

function refreshOwnGrid(grid, view) {
  if (!grid) return;
  const { shipSet, shipTiny } = buildShipSets(view.myShips);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = grid.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      if (!cell) continue;
      const k = key(x, y);
      const hasShip = shipSet.has(k) || shipTiny.has(k);
      cell.className = 'bs-cell bs-verbal-cell';
      cell.replaceChildren();
      cell.disabled = true;
      if (hasShip) {
        cell.classList.add('ship');
        if (shipTiny.has(k)) cell.classList.add('ship-tiny');
      }
    }
  }
}

function refreshEnemyGrid(grid, marks) {
  if (!grid) return;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = grid.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      if (!cell) continue;
      const mark = marks?.[key(x, y)];
      applyCellVisual(cell, markToVisual(mark, 'enemy'), false);
    }
  }
}

function patchVerbalDom(ctx, live) {
  const { view } = ctx;
  refreshOwnGrid(live.querySelector('[data-board="own"]'), view);
  refreshEnemyGrid(live.querySelector('[data-board="enemy"]'), view.enemyMarks || {});

  const stats = live.querySelector('.bs-verbal-stats');
  if (stats && view.stats) {
    stats.innerHTML = `<span>Tus disparos: ${view.stats.enemyMiss} agua · ${view.stats.enemyHit} tocado · ${view.stats.enemySunkCells} hundido</span>`;
  }

  const tip = live.querySelector('.bs-verbal-tip');
  if (tip) {
    tip.textContent = view.lastMark
      ? `Última marca: ${view.lastMark.coord} → ${view.lastMark.mark === 'miss' ? 'Agua' : view.lastMark.mark === 'hit' ? 'Tocado' : 'Hundido'}`
      : 'Abajo: toca una casilla → Agua o Tocado · Mantén pulsado en tocado para hundir';
  }
}

function mountVerbalDom(ctx) {
  const { root, send } = ctx;
  root.innerHTML = '';
  liveRoot = document.createElement('div');
  liveRoot.className = 'bs-game bs-verbal-live bs-verbal-layout';

  liveRoot.innerHTML = `<div class="bs-title">🚢 Tocado y Hundido <span class="bs-mode-badge">Modo verbal</span></div>`;

  const stats = document.createElement('div');
  stats.className = 'bs-verbal-stats';
  liveRoot.appendChild(stats);

  const ownGrid = buildBoardSkeleton();
  ownGrid.dataset.board = 'own';
  liveRoot.appendChild(section('Tu flota', ownGrid));

  const enemyGrid = buildBoardSkeleton();
  enemyGrid.dataset.board = 'enemy';
  enemyGrid.querySelectorAll('.bs-verbal-cell').forEach((cell) => bindMarkCell(cell, 'enemy'));
  liveRoot.appendChild(section('Disparos al rival', enemyGrid));

  const tip = document.createElement('p');
  tip.className = 'bs-verbal-tip';
  liveRoot.appendChild(tip);

  const actions = document.createElement('div');
  actions.className = 'bs-verbal-actions';
  const clearEnemy = document.createElement('button');
  clearEnemy.type = 'button';
  clearEnemy.className = 'btn btn-ghost btn-sm';
  clearEnemy.textContent = '🗑️ Borrar disparos al rival';
  clearEnemy.addEventListener('click', () => send({ type: 'clearBoard', board: 'enemy', silent: true }));
  actions.append(clearEnemy);
  liveRoot.appendChild(actions);

  const resultKey = document.createElement('div');
  resultKey.className = 'bs-result-key';
  resultKey.innerHTML = `
    <span><i class="bs-key-dot hit"></i> Tocado</span>
    <span><i class="bs-key-dot sunk"></i> Hundido (mantén pulsado)</span>
    <span><i class="bs-key-dot miss"></i> Agua</span>`;
  liveRoot.appendChild(resultKey);

  root.appendChild(liveRoot);
  patchVerbalDom(ctx, liveRoot);
}

export function renderVerbal(ctx) {
  verbalCtx = ctx;
  closePopover();
  const live = ctx.root.querySelector('.bs-verbal-live');
  if (live) {
    liveRoot = live;
    patchVerbalDom(ctx, live);
    return;
  }
  mountVerbalDom(ctx);
}

export function resetVerbalState() {
  closePopover();
  verbalCtx = null;
  liveRoot = null;
}
