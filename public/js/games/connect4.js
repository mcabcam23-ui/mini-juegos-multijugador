import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop, pulse } from '../gameFx.js';

const ROWS = 6;
const COLS = 7;
let prevDrop = null;
let prevStatus = null;
let hoverCol = null;

export default function render(ctx) {
  const { view, send, me, root } = ctx;
  const myTurn = view.turn === me && view.status === 'playing';
  const myColor = view.colors[me];
  const oppId = Object.keys(view.colors).find((id) => id !== me);
  const oppColor = oppId ? view.colors[oppId] : null;

  root.innerHTML = '';
  const outer = document.createElement('div');
  outer.className = 'c4-outer';

  const head = document.createElement('div');
  head.className = 'c4-head';
  head.innerHTML = `
    <span>Tus fichas: <i class="c4-disc ${myColor} c4-disc-mini"></i> ${myColor === 'red' ? 'Rojas' : 'Amarillas'}</span>
    ${oppColor ? `<span>Rival: <i class="c4-disc ${oppColor} c4-disc-mini"></i></span>` : ''}`;
  outer.appendChild(head);

  const wrap = document.createElement('div');
  wrap.className = 'c4-wrap' + (myTurn ? ' c4-my-turn' : '');

  const cols = document.createElement('div');
  cols.className = 'c4-cols';
  for (let c = 0; c < COLS; c++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'c4-colbtn';
    btn.textContent = '▼';
    btn.title = `Soltar ficha columna ${c + 1}`;
    const full = view.board[0][c] !== null;
    btn.disabled = !myTurn || full;
    btn.addEventListener('click', () => send({ type: 'drop', col: c }));
    btn.addEventListener('mouseenter', () => { hoverCol = c; paintPreview(board, view, myColor, c); });
    btn.addEventListener('mouseleave', () => { hoverCol = null; paintPreview(board, view, myColor, -1); });
    cols.appendChild(btn);
  }

  const board = document.createElement('div');
  board.className = 'c4-board';
  const winSet = new Set((view.winningCells || []).map(([r, c]) => `${r},${c}`));
  const isNewDrop = view.lastDrop && (!prevDrop || prevDrop.row !== view.lastDrop.row || prevDrop.col !== view.lastDrop.col);

  if (isNewDrop) SFX.c4Drop();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'c4-cell';
      cell.dataset.col = c;
      const owner = view.board[r][c];
      if (owner) {
        const disc = document.createElement('div');
        disc.className = `c4-disc ${view.colors[owner]}`;
        if (winSet.has(`${r},${c}`)) disc.classList.add('win');
        if (isNewDrop && view.lastDrop.row === r && view.lastDrop.col === c) disc.dataset.drop = '1';
        cell.appendChild(disc);
      }
      board.appendChild(cell);
    }
  }

  function paintPreview(boardEl, v, color, col) {
    boardEl.querySelectorAll('.c4-preview').forEach((el) => el.remove());
    if (col < 0 || !myTurn) return;
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!v.board[r][col]) { row = r; break; }
    }
    if (row < 0) return;
    const idx = row * COLS + col;
    const cell = boardEl.children[idx];
    const ghost = document.createElement('div');
    ghost.className = `c4-disc c4-preview ${color}`;
    cell.appendChild(ghost);
  }

  if (myTurn && hoverCol !== null) paintPreview(board, view, myColor, hoverCol);

  wrap.appendChild(cols);
  wrap.appendChild(board);
  outer.appendChild(wrap);

  const status = document.createElement('p');
  status.className = 'c4-status';
  if (view.status === 'finished') {
    if (view.winner === me) {
      status.textContent = '🎉 ¡Cuatro en raya!';
      if (prevStatus !== 'finished') {
        SFX.c4Win();
        celebrate(outer, '🎉', 40);
        pulse(wrap, 'fx-pulse-win');
      }
    } else if (view.winner) {
      status.textContent = 'Fin de partida';
      if (prevStatus !== 'finished') SFX.gameLose(ctx.meta.id);
    } else {
      status.textContent = '🤝 Tablero lleno — empate';
      if (prevStatus !== 'finished') SFX.draw();
    }
  } else {
    status.textContent = myTurn ? '👆 Elige columna para soltar tu ficha' : 'Esperando al rival…';
    if (myTurn) inviteTurn(status);
  }
  outer.appendChild(status);
  root.appendChild(outer);

  if (isNewDrop && view.lastDrop) {
    const { row, col } = view.lastDrop;
    const idx = row * COLS + col;
    const disc = board.children[idx]?.querySelector('.c4-disc[data-drop]');
    if (disc) {
      requestAnimationFrame(() => {
        const topCell = board.children[col];
        const gap = parseFloat(getComputedStyle(board).rowGap || getComputedStyle(board).gap) || 7;
        const step = topCell.offsetHeight + gap;
        const dropPx = row * step + topCell.offsetHeight * 0.52;
        const dur = 0.26 + row * 0.06;
        disc.style.setProperty('--c4-drop-px', `${dropPx}px`);
        disc.style.setProperty('--c4-drop-dur', `${dur}s`);
        disc.classList.add('drop');
        delete disc.dataset.drop;
        setTimeout(() => pop(disc), dur * 1000 + 40);
      });
    }
  }

  prevDrop = view.lastDrop;
  if (view.status === 'finished') prevDrop = null;
  prevStatus = view.status;
}
