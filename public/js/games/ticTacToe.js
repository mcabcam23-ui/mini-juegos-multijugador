import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop, pulse } from '../gameFx.js';

let prevBoard = null;
let prevStatus = null;
let liveRoot = null;

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winLineStyle(indices) {
  const positions = [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [1, 1], [2, 1],
    [0, 2], [1, 2], [2, 2],
  ];
  const [a, b] = [indices[0], indices[2]];
  const [x1, y1] = positions[a];
  const [x2, y2] = positions[b];
  const cx = ((x1 + x2) / 2) * 33.33 + 16.665;
  const cy = ((y1 + y2) / 2) * 33.33 + 16.665;
  const len = Math.hypot(x2 - x1, y2 - y1) * 33.33;
  const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
  return { left: `${cx}%`, top: `${cy}%`, width: `${len}%`, transform: `translate(-50%, -50%) rotate(${angle}deg)` };
}

export default function render(ctx) {
  const { view, root } = ctx;
  if (!liveRoot || !root.contains(liveRoot)) {
    root.innerHTML = '';
    liveRoot = document.createElement('div');
    liveRoot.className = 'ttt-wrap';
    liveRoot.innerHTML = `
      <div class="ttt-head"></div>
      <div class="ttt-board-wrap">
        <div class="ttt-board"></div>
        <div class="ttt-winline" hidden></div>
      </div>
      <p class="ttt-status"></p>`;
    root.appendChild(liveRoot);
    const boardEl = liveRoot.querySelector('.ttt-board');
    for (let i = 0; i < 9; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ttt-cell';
      btn.dataset.i = i;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        ctx.send({ type: 'place', index: i });
      });
      boardEl.appendChild(btn);
    }
  }

  const myMark = view.marks?.[ctx.me] || '?';
  const oppId = Object.keys(view.marks || {}).find((id) => id !== ctx.me);
  const oppMark = oppId ? view.marks[oppId] : '?';
  const head = liveRoot.querySelector('.ttt-head');
  head.innerHTML = `
    <span class="ttt-you">Tú juegas <strong class="ttt-mark ${myMark === 'X' ? 'x' : 'o'}">${myMark}</strong></span>
    <span class="ttt-opp">Rival: <strong class="ttt-mark ${oppMark === 'X' ? 'x' : 'o'}">${oppMark}</strong></span>`;

  const myTurn = view.turn === ctx.me && view.status === 'playing';
  const winSet = new Set(view.winningLine || []);
  const boardEl = liveRoot.querySelector('.ttt-board');
  const boardWrap = liveRoot.querySelector('.ttt-board-wrap');
  boardWrap.classList.toggle('my-turn', myTurn);

  view.board.forEach((cell, i) => {
    const btn = boardEl.children[i];
    btn.className = 'ttt-cell';
    btn.textContent = cell || '';
    btn.disabled = !!cell || !myTurn;
    if (cell) {
      btn.classList.add('filled', cell === 'X' ? 'x' : 'o');
      if (prevBoard && prevBoard[i] !== cell) {
        pop(btn);
        SFX.place();
      }
    }
    if (winSet.has(i)) btn.classList.add('win');
  });

  const winLineEl = liveRoot.querySelector('.ttt-winline');
  if (view.winningLine?.length === 3) {
    const style = winLineStyle(view.winningLine);
    winLineEl.hidden = false;
    Object.assign(winLineEl.style, style);
    winLineEl.classList.add('show');
  } else {
    winLineEl.hidden = true;
    winLineEl.classList.remove('show');
  }

  const status = liveRoot.querySelector('.ttt-status');
  if (view.status === 'finished') {
    if (view.winner === ctx.me) {
      status.textContent = '🎉 ¡Has ganado!';
      if (prevStatus !== 'finished') {
        SFX.gameWin(ctx.meta.id);
        celebrate(liveRoot, '🎉', 36);
        pulse(boardWrap, 'fx-pulse-win');
      }
    } else if (view.winner) {
      status.textContent = '😬 Has perdido…';
      if (prevStatus !== 'finished') SFX.gameLose(ctx.meta.id);
    } else {
      status.textContent = '🤝 ¡Empate!';
      if (prevStatus !== 'finished') SFX.draw();
    }
    prevBoard = null;
  } else {
    status.textContent = myTurn ? '🎯 Te toca — elige casilla' : `Turno de ${ctx.nameOf(view.turn)}`;
    if (myTurn) inviteTurn(status);
    prevBoard = [...view.board];
  }
  prevStatus = view.status;
}
