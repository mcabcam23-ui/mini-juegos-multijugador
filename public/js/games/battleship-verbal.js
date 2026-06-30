import { SFX } from '../sfx.js';

const SIZE = 10;
const ROWS = 'ABCDEFGHIJ'.split('');
const LONG_PRESS_MS = 550;

let verbalCtx = null;
let liveRoot = null;
let openPopover = null;
let pressTimer = null;
let pickingCell = null;
let pickingCoords = null;
let suppressClick = false;

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
  pickingCell?.classList.remove('bs-verbal-picking');
  pickingCell = null;
  pickingCoords = null;
  openPopover?.remove();
  openPopover = null;
}

function sendMark(board, x, y, mark) {
  if (!verbalCtx) return;
  if (mark === 'miss') SFX.bsMiss();
  else if (mark === 'hit') SFX.bsHit();
  verbalCtx.send({ type: 'markCell', board, x, y, mark, silent: true });
}

function sendSinkGroup(board, x, y) {
  if (!verbalCtx) return;
  const marks = board === 'enemy' ? verbalCtx.view.enemyMarks : verbalCtx.view.myIncoming;
  if (marks?.[key(x, y)] === 'sunk') SFX.bsHit();
  else SFX.bsSunk();
  verbalCtx.send({ type: 'sinkGroup', board, x, y, silent: true });
}

function positionPopover(pop, cell, stage) {
  const rect = cell.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const gap = 8;
  pop.style.visibility = 'hidden';
  pop.style.transform = 'translateY(-50%)';
  pop.style.top = `${rect.top - stageRect.top + rect.height / 2}px`;

  requestAnimationFrame(() => {
    const popW = pop.offsetWidth;
    const popH = pop.offsetHeight;
    let left = rect.right - stageRect.left + gap;
    if (left + popW > stageRect.width - 4) {
      left = rect.left - stageRect.left - popW - gap;
    }
    left = Math.max(4, Math.min(left, stageRect.width - popW - 4));
    let top = rect.top - stageRect.top + rect.height / 2;
    top = Math.max(popH / 2 + 4, Math.min(top, stageRect.height - popH / 2 - 4));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.visibility = 'visible';
  });
}

function popoverButtons(cur) {
  const items = [
    { mark: 'miss', label: '💧 Agua', cls: 'miss' },
    { mark: 'hit', label: '💥 Tocado', cls: 'hit' },
  ];
  if (cur) items.push({ mark: 'clear', label: '⬜ Blanco', cls: 'clear' });
  return items;
}

function showPopover(cell, board, x, y) {
  closePopover();
  const marks = board === 'enemy' ? verbalCtx.view.enemyMarks : verbalCtx.view.myIncoming;
  const cur = marks?.[key(x, y)];

  pickingCell = cell;
  pickingCoords = { x, y };
  cell.classList.add('bs-verbal-picking');

  const pop = document.createElement('div');
  pop.className = 'bs-verbal-pop';
  popoverButtons(cur).forEach(({ mark, label, cls }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `bs-verbal-pop-btn ${cls}${cur === mark ? ' active' : ''}`;
    btn.dataset.mark = mark;
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePopover();
      sendMark(board, x, y, mark);
    });
    pop.appendChild(btn);
  });

  const stage = verbalCtx.root.closest('#game-stage') || verbalCtx.root;
  stage.appendChild(pop);
  openPopover = pop;
  positionPopover(pop, cell, stage);

  requestAnimationFrame(() => {
    document.addEventListener('click', onDocClick, { once: true });
  });
}

function onDocClick(e) {
  if (openPopover?.contains(e.target)) return;
  if (e.target.closest('.bs-verbal-cell')) return;
  closePopover();
}

function bindMarkCell(cell, board) {
  cell.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!verbalCtx || suppressClick) {
      suppressClick = false;
      return;
    }
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    showPopover(cell, board, x, y);
  });

  cell.addEventListener('pointerdown', (e) => {
    if (!verbalCtx) return;
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const marks = board === 'enemy' ? verbalCtx.view.enemyMarks : verbalCtx.view.myIncoming;
    const cur = marks?.[key(x, y)];
    if (cur !== 'hit' && cur !== 'sunk') return;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      suppressClick = true;
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
  const marks = view.rivalMarks || {};
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = grid.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      if (!cell) continue;
      const k = key(x, y);
      const hasShip = shipSet.has(k) || shipTiny.has(k);
      const mark = marks[k];
      cell.disabled = true;
      if (mark) {
        applyCellVisual(cell, markToVisual(mark, 'own'), hasShip);
      } else {
        cell.className = 'bs-cell bs-verbal-cell';
        cell.replaceChildren();
        cell.dataset.visual = 'empty';
        cell.dataset.hasShip = hasShip ? '1' : '0';
        if (hasShip) {
          cell.classList.add('ship');
          if (shipTiny.has(k)) cell.classList.add('ship-tiny');
        }
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
      if (pickingCoords?.x === x && pickingCoords?.y === y) {
        cell.classList.add('bs-verbal-picking');
        pickingCell = cell;
      }
    }
  }
}

function patchVerbalDom(ctx, live) {
  const { view } = ctx;
  refreshOwnGrid(live.querySelector('[data-board="own"]'), view);
  refreshEnemyGrid(live.querySelector('[data-board="enemy"]'), view.enemyMarks || {});

  const stats = live.querySelector('.bs-verbal-stats');
  if (stats && view.stats) {
    stats.innerHTML = `
      <span>Tus disparos: ${view.stats.enemyMiss} agua · ${view.stats.enemyHit} tocado · ${view.stats.enemySunkCells} hundido</span>
      <span>Rival en tu flota: ${view.stats.rivalMiss} agua · ${view.stats.rivalHit} tocado · ${view.stats.rivalSunkCells} hundido</span>`;
  }

  const tip = live.querySelector('.bs-verbal-tip');
  if (tip) {
    tip.textContent = view.lastMark
      ? `Última marca: ${view.lastMark.coord} → ${view.lastMark.mark === null ? 'Blanco' : view.lastMark.mark === 'miss' ? 'Agua' : view.lastMark.mark === 'hit' ? 'Tocado' : 'Hundido'}`
      : 'Toca para marcar o cambiar · Mantén pulsado: tocado ↔ hundido';
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
  liveRoot.appendChild(section('Tu flota · marcas del rival', ownGrid));

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
    <span><i class="bs-key-dot sunk"></i> Hundido</span>
    <span><i class="bs-key-dot miss"></i> Agua</span>
    <span>⬜ Blanco = borrar marca</span>`;
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
  suppressClick = false;
}
