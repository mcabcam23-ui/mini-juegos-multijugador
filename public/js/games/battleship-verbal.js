import { SFX } from '../sfx.js';

const SIZE = 10;
const ROWS = 'ABCDEFGHIJ'.split('');

let verbalTool = 'miss';
let verbalCtx = null;

function key(x, y) { return `${x},${y}`; }
function label(x, y) { return `${ROWS[y]}${x + 1}`; }

function markToVisual(mark, board) {
  if (mark === 'sunk') return 'sunk';
  if (mark === 'hit') return board === 'enemy' ? 'hit' : 'hit-own';
  if (mark === 'miss') return board === 'enemy' ? 'miss' : 'miss-own';
  return 'empty';
}

function markupHit() {
  return `<div class="bs-fx bs-fx-hit" title="Tocado"><span class="bs-peg"></span><span class="bs-lbl bs-lbl-hit">Tocado</span></div>`;
}
function markupMiss() {
  return `<div class="bs-fx bs-fx-miss" title="Agua"><svg viewBox="0 0 32 32" class="bs-svg"><ellipse class="bs-splash-outer" cx="16" cy="18" rx="11" ry="5"/><ellipse class="bs-splash-inner" cx="16" cy="18" rx="6" ry="3"/><path class="bs-splash-drop" d="M16 8c-2 4-4 6-4 9a4 4 0 008 0c0-3-2-5-4-9z"/></svg><span class="bs-lbl bs-lbl-miss">Agua</span></div>`;
}
function markupSunk() {
  return `<div class="bs-fx bs-fx-sunk" title="Hundido"><span class="bs-burst"></span><span class="bs-lbl bs-lbl-sunk">Hundido</span></div>`;
}

function applyCellVisual(cell, visual) {
  if (cell.dataset.visual === visual) return false;
  cell.dataset.visual = visual;
  cell.className = 'bs-cell';
  cell.replaceChildren();
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
  return true;
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
      const cell = document.createElement('div');
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

function playMarkSound(mark) {
  if (mark === 'sunk') SFX.bsSunk();
  else if (mark === 'hit') SFX.bsHit();
  else if (mark === 'miss') SFX.bsMiss();
}

function sendMark(board, x, y, mark) {
  if (!verbalCtx) return;
  if (mark !== 'clear') playMarkSound(mark);
  verbalCtx.send({ type: 'markCell', board, x, y, mark: mark === 'clear' ? 'clear' : mark, silent: true });
}

function refreshVerbalGrid(grid, board, marks) {
  if (!grid) return;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = grid.querySelector(`[data-x="${x}"][data-y="${y}"]`);
      if (!cell) continue;
      const mark = marks[key(x, y)];
      const visual = markToVisual(mark, board);
      applyCellVisual(cell, visual);
      cell.classList.add('bs-verbal-markable');
    }
  }
}

function legendGroups() {
  return [
    { size: 4, count: 1 },
    { size: 3, count: 2 },
    { size: 2, count: 3 },
    { size: 1, count: 4 },
  ];
}

function buildInteractiveLegend(statusList, send) {
  const leg = document.createElement('div');
  leg.className = 'bs-legend bs-legend-verbal';
  leg.dataset.legend = 'enemy';
  leg.innerHTML = `<div class="bs-legend-title">Barcos enemigos</div><p class="bs-legend-hint">Marca aquí los barcos que el rival te confirme hundidos</p>`;

  legendGroups().forEach((g) => {
    const shipsOfSize = statusList.filter((s) => s.size === g.size);
    for (let i = 0; i < g.count; i++) {
      const ship = shipsOfSize[i];
      const row = document.createElement('div');
      row.className = 'bs-legend-row' + (ship?.sunk ? ' sunk' : '');
      if (ship?.id) row.dataset.shipId = ship.id;

      const blocks = document.createElement('div');
      blocks.className = 'bs-legend-ship';
      for (let b = 0; b < g.size; b++) {
        const block = document.createElement('span');
        block.className = 'bs-legend-cell';
        if (ship && b < ship.hits) block.classList.add('hit');
        blocks.appendChild(block);
      }
      row.appendChild(blocks);

      if (ship?.name) {
        const name = document.createElement('span');
        name.className = 'bs-legend-name';
        name.textContent = ship.name;
        row.appendChild(name);
      }

      if (ship?.id) {
        const actions = document.createElement('div');
        actions.className = 'bs-legend-actions';
        const btnHit = document.createElement('button');
        btnHit.type = 'button';
        btnHit.className = 'bs-leg-btn';
        btnHit.title = 'Añadir tocado';
        btnHit.textContent = '+';
        btnHit.addEventListener('click', (e) => {
          e.stopPropagation();
          send({ type: 'markFleet', shipId: ship.id, mode: 'cycle', silent: true });
          SFX.bsHit();
        });
        const btnSunk = document.createElement('button');
        btnSunk.type = 'button';
        btnSunk.className = 'bs-leg-btn sunk';
        btnSunk.title = 'Marcar hundido';
        btnSunk.textContent = '✓';
        btnSunk.addEventListener('click', (e) => {
          e.stopPropagation();
          send({ type: 'markFleet', shipId: ship.id, mode: 'sunk', silent: true });
          SFX.bsSunk();
        });
        const btnClear = document.createElement('button');
        btnClear.type = 'button';
        btnClear.className = 'bs-leg-btn clear';
        btnClear.title = 'Borrar';
        btnClear.textContent = '↩';
        btnClear.addEventListener('click', (e) => {
          e.stopPropagation();
          send({ type: 'markFleet', shipId: ship.id, mode: 'clear', silent: true });
        });
        actions.append(btnHit, btnSunk, btnClear);
        row.appendChild(actions);
      }

      if (ship?.sunk) {
        const chk = document.createElement('span');
        chk.className = 'bs-legend-check';
        chk.textContent = '✓';
        row.appendChild(chk);
      }
      leg.appendChild(row);
    }
  });
  return leg;
}

function refreshInteractiveLegend(leg, statusList) {
  if (!leg || !verbalCtx) return;
  const fresh = buildInteractiveLegend(statusList, verbalCtx.send);
  leg.replaceWith(fresh);
}

function section(title, content) {
  const s = document.createElement('div');
  s.className = 'bs-section';
  s.innerHTML = `<div class="bs-section-title">${title}</div>`;
  s.appendChild(content);
  return s;
}

function setVerbalTool(tool, live) {
  verbalTool = tool;
  live?.querySelectorAll('.bs-verbal-tool').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
}

function handleVerbalGridClick(e, board) {
  const cell = e.target.closest('.bs-verbal-cell');
  if (!cell || !verbalCtx) return;
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  const cur = (board === 'enemy' ? verbalCtx.view.enemyMarks : verbalCtx.view.ownMarks)?.[key(x, y)];

  if (verbalTool === 'clear') {
    if (cur) sendMark(board, x, y, 'clear');
    return;
  }
  sendMark(board, x, y, verbalTool);
}

function patchVerbalDom(ctx, live) {
  const { view } = ctx;
  refreshVerbalGrid(live.querySelector('[data-board="enemy"]'), 'enemy', view.enemyMarks || {});
  refreshVerbalGrid(live.querySelector('[data-board="own"]'), 'own', view.ownMarks || {});

  const leg = live.querySelector('[data-legend="enemy"]');
  if (leg) refreshInteractiveLegend(leg, view.enemyFleetStatus || []);

  const stats = live.querySelector('.bs-verbal-stats');
  if (stats && view.stats) {
    stats.innerHTML = `
      <span><strong>${view.sunkEnemyShips || 0}</strong> / ${view.totalEnemyShips || 10} barcos hundidos</span>
      <span>Tus disparos: ${view.stats.enemyMiss} agua · ${view.stats.enemyHit} tocado · ${view.stats.enemySunkCells} hundido</span>
      <span>Recibidos: ${view.stats.ownMiss} agua · ${view.stats.ownHit} tocado</span>`;
  }

  const tip = live.querySelector('.bs-verbal-tip');
  if (tip && view.lastMark) {
    const boardLabel = view.lastMark.board === 'enemy' ? 'disparo al rival' : 'disparo recibido';
    const markLabel = { miss: 'Agua', hit: 'Tocado', sunk: 'Hundido' }[view.lastMark.mark] || 'Borrado';
    tip.textContent = `Última marca (${boardLabel}): ${view.lastMark.coord} → ${markLabel}`;
  }
}

function mountVerbalDom(ctx) {
  const { root, send } = ctx;
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'bs-game bs-verbal-live';

  wrap.innerHTML = `
    <div class="bs-title">🚢 Tocado y Hundido <span class="bs-mode-badge">Modo verbal</span></div>
    <div class="bs-verbal-intro card-inner">
      <p><strong>🗣️ Jugáis hablando.</strong> Colocad los barcos en tableros físicos o en papel. Decid las coordenadas en voz (ej. «C5») y marcáis aquí el resultado que os diga el rival.</p>
      <p><strong>Tú decides todo.</strong> La app no comprueba nada: eliges la herramienta (Agua / Tocado / Hundido), pulsas la casilla y puedes cambiarla cuando quieras. Los barcos hundidos en la leyenda también los marcas tú.</p>
      <ul>
        <li><strong>Disparos al rival</strong> — lo que tú preguntas y te responden.</li>
        <li><strong>Disparos recibidos</strong> — lo que te pregunta el rival y tú respondes.</li>
        <li><strong>Barcos enemigos</strong> — cuando te confirmen un hundido, márcalo en la leyenda.</li>
      </ul>
    </div>`;

  const tools = document.createElement('div');
  tools.className = 'bs-verbal-tools';
  [
    { id: 'miss', label: '💧 Agua', cls: 'miss' },
    { id: 'hit', label: '💥 Tocado', cls: 'hit' },
    { id: 'sunk', label: '☠️ Hundido', cls: 'sunk' },
    { id: 'clear', label: '↩ Borrar', cls: 'clear' },
  ].forEach((t) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `bs-verbal-tool bs-verbal-tool-${t.cls}` + (verbalTool === t.id ? ' active' : '');
    btn.dataset.tool = t.id;
    btn.textContent = t.label;
    btn.addEventListener('click', () => setVerbalTool(t.id, wrap));
    tools.appendChild(btn);
  });
  wrap.appendChild(tools);

  const stats = document.createElement('div');
  stats.className = 'bs-verbal-stats';
  wrap.appendChild(stats);

  const enemyGrid = buildBoardSkeleton();
  enemyGrid.dataset.board = 'enemy';
  enemyGrid.addEventListener('click', (e) => handleVerbalGridClick(e, 'enemy'));

  const enemyRow = document.createElement('div');
  enemyRow.className = 'bs-battle-row';
  enemyRow.appendChild(section('Disparos al rival (tus preguntas)', enemyGrid));
  enemyRow.appendChild(buildInteractiveLegend(ctx.view.enemyFleetStatus || [], send));
  wrap.appendChild(enemyRow);

  const ownGrid = buildBoardSkeleton();
  ownGrid.dataset.board = 'own';
  ownGrid.addEventListener('click', (e) => handleVerbalGridClick(e, 'own'));

  const ownRow = document.createElement('div');
  ownRow.className = 'bs-battle-row';
  ownRow.appendChild(section('Disparos recibidos (te preguntan)', ownGrid));
  const ownSide = document.createElement('div');
  ownSide.className = 'bs-verbal-side';
  ownSide.innerHTML = `
    <div class="bs-verbal-side-card">
      <h4>📋 Tu papel físico</h4>
      <p>Tu flota real está fuera de la app. Cuando el rival diga una casilla, mirá tu tablero y responded en voz: <em>agua</em>, <em>tocado</em> o <em>hundido</em>.</p>
      <p>Aquí anotáis qué casillas ya os han preguntado.</p>
    </div>`;
  ownRow.appendChild(ownSide);
  wrap.appendChild(ownRow);

  const actions = document.createElement('div');
  actions.className = 'bs-verbal-actions';
  const clearEnemy = document.createElement('button');
  clearEnemy.type = 'button';
  clearEnemy.className = 'btn btn-ghost btn-sm';
  clearEnemy.textContent = '🗑️ Borrar disparos al rival';
  clearEnemy.addEventListener('click', () => send({ type: 'clearBoard', board: 'enemy', silent: true }));
  const clearOwn = document.createElement('button');
  clearOwn.type = 'button';
  clearOwn.className = 'btn btn-ghost btn-sm';
  clearOwn.textContent = '🗑️ Borrar disparos recibidos';
  clearOwn.addEventListener('click', () => send({ type: 'clearBoard', board: 'own', silent: true }));
  const resetFleet = document.createElement('button');
  resetFleet.type = 'button';
  resetFleet.className = 'btn btn-ghost btn-sm';
  resetFleet.textContent = '🔄 Reiniciar leyenda de barcos';
  resetFleet.addEventListener('click', () => send({ type: 'resetFleet', silent: true }));
  actions.append(clearEnemy, clearOwn, resetFleet);
  wrap.appendChild(actions);

  const tip = document.createElement('p');
  tip.className = 'bs-verbal-tip';
  wrap.appendChild(tip);

  const resultKey = document.createElement('div');
  resultKey.className = 'bs-result-key';
  resultKey.innerHTML = `
    <span><i class="bs-key-dot hit"></i> Tocado</span>
    <span><i class="bs-key-dot sunk"></i> Hundido</span>
    <span><i class="bs-key-dot miss"></i> Agua</span>`;
  wrap.appendChild(resultKey);

  root.appendChild(wrap);
  patchVerbalDom(ctx, wrap);
  setVerbalTool(verbalTool, wrap);
}

export function renderVerbal(ctx) {
  verbalCtx = ctx;
  const live = ctx.root.querySelector('.bs-verbal-live');
  if (live) {
    patchVerbalDom(ctx, live);
    return;
  }
  mountVerbalDom(ctx);
}

export function resetVerbalState() {
  verbalTool = 'miss';
  verbalCtx = null;
}
