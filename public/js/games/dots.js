import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, sparks } from '../gameFx.js';

const COLORS = ['#7c5cff', '#46e0c8', '#ff8fb0', '#f6c343'];
let prevScores = null;
let prevLastLine = null;
let prevBoxesJson = null;
let prevStatus = null;

function boxesJson(boxes) {
  return boxes.map((row) => row.map((o) => o || '.').join('')).join('|');
}

export default function render(ctx) {
  const { view, send, me, root } = ctx;
  const DOTS = view.dots;
  const myTurn = view.turn === me && view.status === 'playing';
  const colorOf = (id) => COLORS[view.order.indexOf(id) % COLORS.length];
  const bj = boxesJson(view.boxes);

  if (prevLastLine && view.lastLine) {
    const lk = `${view.lastLine.orient}:${view.lastLine.r}:${view.lastLine.c}`;
    const pk = `${prevLastLine.orient}:${prevLastLine.r}:${prevLastLine.c}`;
    if (lk !== pk) SFX.dotsLine();
  }

  if (prevScores && prevBoxesJson && bj !== prevBoxesJson) {
    view.order.forEach((id) => {
      if ((view.scores[id] || 0) > (prevScores[id] || 0)) {
        SFX.dotsBox();
        if (id === me) sparks(root, '🎉', 5);
      }
    });
  }

  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'dots-outer' + (myTurn ? ' dots-my-turn' : '');

  const title = document.createElement('p');
  title.className = 'dots-title';
  title.textContent = '⬚ Puntos y Cajas — cierra un cuadrado para jugar otra vez';
  wrap.appendChild(title);

  const scores = document.createElement('div');
  scores.className = 'mem-scores';
  view.order.forEach((id) => {
    const s = document.createElement('div');
    s.className = 'mem-score' + (view.turn === id ? ' turn' : '');
    const gained = prevScores && view.scores[id] > prevScores[id];
    s.innerHTML = `<span class="dots-chip" style="background:${colorOf(id)}"></span>
      ${escapeHtml(ctx.nameOf(id))}${id === me ? ' (Tú)' : ''} · <strong>${view.scores[id]}</strong>${gained ? ' <span class="dots-plus">+1</span>' : ''}`;
    scores.appendChild(s);
  });
  wrap.appendChild(scores);

  const frame = document.createElement('div');
  frame.className = 'dots-frame';
  const board = document.createElement('div');
  board.className = 'dots-board';
  const span = 2 * DOTS - 1;
  const cols = [];
  for (let j = 0; j < span; j++) cols.push(j % 2 === 0 ? '22px' : '52px');
  board.style.gridTemplateColumns = cols.join(' ');
  board.style.gridTemplateRows = cols.join(' ');

  const place = (el, i, j) => { el.style.gridRow = i + 1; el.style.gridColumn = j + 1; board.appendChild(el); };
  const newBoxes = prevBoxesJson ? findNewBoxes(prevBoxesJson, bj, view.boxes) : new Set();

  for (let i = 0; i < span; i++) {
    for (let j = 0; j < span; j++) {
      const evenI = i % 2 === 0, evenJ = j % 2 === 0;
      if (evenI && evenJ) {
        const dot = document.createElement('div');
        dot.className = 'dots-dot';
        place(dot, i, j);
      } else if (evenI && !evenJ) {
        const r = i / 2, c = (j - 1) / 2;
        const line = document.createElement('button');
        line.type = 'button';
        line.className = 'dots-line h' + (view.h[r][c] ? ' on' : '');
        line.title = 'Trazar línea horizontal';
        if (view.lastLine && view.lastLine.orient === 'h' && view.lastLine.r === r && view.lastLine.c === c) line.classList.add('justdrawn');
        if (!view.h[r][c] && myTurn) line.addEventListener('click', () => send({ type: 'line', orient: 'h', r, c }));
        else line.disabled = true;
        place(line, i, j);
      } else if (!evenI && evenJ) {
        const r = (i - 1) / 2, c = j / 2;
        const line = document.createElement('button');
        line.type = 'button';
        line.className = 'dots-line v' + (view.v[r][c] ? ' on' : '');
        line.title = 'Trazar línea vertical';
        if (view.lastLine && view.lastLine.orient === 'v' && view.lastLine.r === r && view.lastLine.c === c) line.classList.add('justdrawn');
        if (!view.v[r][c] && myTurn) line.addEventListener('click', () => send({ type: 'line', orient: 'v', r, c }));
        else line.disabled = true;
        place(line, i, j);
      } else {
        const r = (i - 1) / 2, c = (j - 1) / 2;
        const owner = view.boxes[r][c];
        const box = document.createElement('div');
        box.className = 'dots-box' + (owner ? ' claimed' : '');
        if (newBoxes.has(`${r},${c}`)) box.classList.add('just-claimed');
        if (owner) {
          box.style.background = colorOf(owner) + '66';
          box.style.borderColor = colorOf(owner);
          const { initials } = ctx.avatarFor(owner, ctx.nameOf(owner));
          box.textContent = initials;
        }
        place(box, i, j);
      }
    }
  }
  frame.appendChild(board);
  wrap.appendChild(frame);

  const hint = document.createElement('p');
  hint.className = 'dots-hint muted';
  if (view.status === 'finished') {
    const top = [...view.order].sort((a, b) => view.scores[b] - view.scores[a])[0];
    hint.textContent = view.winner === me ? '🎉 ¡Has ganado!' : `Ganó ${ctx.nameOf(top)}`;
    if (prevStatus !== 'finished') {
      if (view.winner === me) { SFX.gameWin(ctx.meta.id); celebrate(wrap, '🎉', 36); }
      else SFX.gameLose(ctx.meta.id);
    }
  } else {
    hint.textContent = myTurn ? '👆 Pulsa entre dos puntos para trazar una línea' : `Turno de ${ctx.nameOf(view.turn)}`;
    if (myTurn) inviteTurn(hint);
  }
  wrap.appendChild(hint);
  root.appendChild(wrap);

  prevScores = { ...view.scores };
  prevLastLine = view.lastLine ? { ...view.lastLine } : null;
  prevBoxesJson = bj;
  prevStatus = view.status;
}

function findNewBoxes(prev, cur, boxes) {
  const set = new Set();
  const prevRows = prev.split('|');
  const curRows = cur.split('|');
  for (let r = 0; r < boxes.length; r++) {
    for (let c = 0; c < boxes[r].length; c++) {
      const was = prevRows[r]?.[c] || '.';
      const now = curRows[r]?.[c] || '.';
      if (was === '.' && now !== '.') set.add(`${r},${c}`);
    }
  }
  return set;
}
