import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop } from '../gameFx.js';
import { buildScoreChip } from './shared.js';

const SIZE = 8;
let liveRoot = null;
let prevStatus = null;
let prevLast = null;

export default function render(ctx) {
  const { view, send, me, root } = ctx;
  const myTurn = view.turn === me && view.status === 'playing';
  const myColor = view.colors[me];
  const oppId = Object.keys(view.colors).find((id) => id !== me);

  if (!liveRoot || !root.contains(liveRoot)) {
    root.innerHTML = '';
    liveRoot = document.createElement('div');
    liveRoot.className = 'rev-wrap';
    liveRoot.innerHTML = `
      <div class="rev-head"></div>
      <div class="rev-board-wrap"><div class="rev-board"></div></div>
      <p class="rev-hint"></p>
      <button type="button" class="btn btn-ghost rev-pass" hidden>Pasar turno</button>`;
    root.appendChild(liveRoot);
  }

  const head = liveRoot.querySelector('.rev-head');
  head.innerHTML = '';
  head.appendChild(buildScoreChip(ctx, me, `${view.counts[myColor] || 0} fichas`, myTurn));
  if (oppId) head.appendChild(buildScoreChip(ctx, oppId, `${view.counts[view.colors[oppId]] || 0} fichas`, view.turn === oppId));

  const boardEl = liveRoot.querySelector('.rev-board');
  boardEl.innerHTML = '';
  const validSet = new Set((view.valid || []).map((m) => `${m.r},${m.c}`));

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'rev-cell';
      const v = view.board[r][c];
      if (v === 'B') {
        cell.classList.add('black');
        cell.textContent = '●';
      } else if (v === 'W') {
        cell.classList.add('white');
        cell.textContent = '●';
      }
      const key = `${r},${c}`;
      if (validSet.has(key) && myTurn) {
        cell.classList.add('legal');
        cell.addEventListener('click', () => send({ type: 'place', r, c }));
      } else {
        cell.disabled = true;
      }
      if (view.lastMove && view.lastMove.r === r && view.lastMove.c === c) cell.classList.add('last');
      boardEl.appendChild(cell);
    }
  }

  const hint = liveRoot.querySelector('.rev-hint');
  const passBtn = liveRoot.querySelector('.rev-pass');
  if (view.status === 'finished') {
    hint.textContent = view.winner === me ? '🎉 ¡Has ganado!' : view.winner ? '😬 Has perdido' : '🤝 Empate';
    passBtn.hidden = true;
    if (prevStatus !== 'finished') {
      if (view.winner === me) { SFX.gameWin(ctx.meta.id); celebrate(liveRoot, '🎉', 36); }
      else if (view.winner) SFX.gameLose(ctx.meta.id);
      else SFX.draw();
    }
  } else if (myTurn) {
    hint.textContent = view.valid.length ? '⚫ Elige casilla (verde = legal)' : 'Sin jugadas — debes pasar';
    passBtn.hidden = !!view.valid.length;
    passBtn.onclick = () => send({ type: 'pass' });
    inviteTurn(hint);
  } else {
    hint.textContent = `Turno de ${ctx.nameOf(view.turn)}`;
    passBtn.hidden = true;
  }

  const lk = view.lastMove ? JSON.stringify(view.lastMove) : '';
  if (lk !== prevLast && view.lastMove && !view.lastMove.pass) {
    SFX.revPlace();
    const lastCell = boardEl.querySelector('.rev-cell.last');
    if (lastCell) pop(lastCell);
  }
  prevLast = lk;
  prevStatus = view.status;
}
