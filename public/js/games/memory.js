import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop, shake, sparks } from '../gameFx.js';

let prevMatched = new Set();
let prevSnapshot = null;
let prevStatus = null;

function snapshot(view) {
  return view.cards.map((c) => `${c.faceUp ? 1 : 0}${c.matched ? 1 : 0}`).join('');
}

export default function render(ctx) {
  const { view, send, me, root } = ctx;
  const myTurn = view.turn === me && view.status === 'playing';
  const order = view.order || Object.keys(view.scores);
  const snap = snapshot(view);

  if (prevSnapshot && snap !== prevSnapshot) {
    const prevUp = (prevSnapshot.match(/1/g) || []).length;
    const curUp = (snap.match(/1/g) || []).length;
    const prevMatched = prevSnapshot.split('').filter((_, i) => i % 2 === 1 && prevSnapshot[i] === '1').length;
    const curMatched = snap.split('').filter((_, i) => i % 2 === 1 && snap[i] === '1').length;

    if (curMatched > prevMatched) SFX.memMatch();
    else if (view.pendingClear && curUp > prevUp) SFX.memMiss();
    else if (curUp > prevUp && !view.pendingClear) SFX.memFlip();
  }
  prevSnapshot = snap;

  const pairsLeft = view.cards.filter((c) => !c.matched).length / 2;

  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'mem-wrap';

  const scores = document.createElement('div');
  scores.className = 'mem-scores';
  order.forEach((id) => {
    const { color, initials } = ctx.avatarFor(id, ctx.nameOf(id));
    const s = document.createElement('div');
    s.className = 'mem-score' + (view.turn === id ? ' turn' : '');
    s.innerHTML = `<span class="avatar" style="width:26px;height:26px;font-size:.8rem;background:${color}">${initials}</span>
      ${escapeHtml(ctx.nameOf(id))}${id === me ? ' (Tú)' : ''} · <strong>${view.scores[id]}</strong>`;
    scores.appendChild(s);
  });
  wrap.appendChild(scores);

  const bar = document.createElement('div');
  bar.className = 'mem-bar';
  if (view.pendingClear) {
    bar.textContent = '🧠 ¡No coinciden! Memoriza…';
    bar.classList.add('memorize', 'mem-bad');
  } else if (view.status === 'finished') {
    bar.textContent = '🏁 Partida terminada';
  } else {
    bar.textContent = myTurn
      ? `🎯 Te toca · Quedan ${pairsLeft} parejas`
      : `Turno de ${ctx.nameOf(view.turn)} · ${pairsLeft} parejas restantes`;
  }
  wrap.appendChild(bar);

  const grid = document.createElement('div');
  grid.className = 'mem-grid' + (view.pendingClear ? ' mem-shake-once' : '');
  if (view.pendingClear) setTimeout(() => shake(grid), 50);

  view.cards.forEach((card, i) => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'mem-card';
    const isUp = card.faceUp || card.matched;
    if (isUp) c.classList.add('up');
    if (card.matched) c.classList.add('matched');
    c.innerHTML = `
      <div class="mem-inner">
        <div class="mem-face mem-front">✨</div>
        <div class="mem-face mem-back">${card.value || ''}</div>
      </div>`;
    const clickable = myTurn && !card.matched && !card.faceUp && !view.pendingClear;
    c.disabled = !clickable;
    c.addEventListener('click', () => send({ type: 'flip', index: i }));
    if (card.matched && !prevMatched.has(i)) sparks(c, '✨', 3);
    else if (isUp && !card.matched && prevSnapshot && prevSnapshot[i * 2] === '0') pop(c);
    grid.appendChild(c);
  });
  wrap.appendChild(grid);
  root.appendChild(wrap);

  prevMatched = new Set(view.cards.map((c, i) => (c.matched ? i : null)).filter((x) => x !== null));

  if (view.status === 'finished' && prevStatus !== 'finished') {
    if (view.winner === me) { SFX.gameWin(ctx.meta.id); celebrate(wrap, '🎉', 36); }
    else if (view.winner) SFX.gameLose(ctx.meta.id);
  }
  if (myTurn && !view.pendingClear) inviteTurn(bar);
  prevStatus = view.status;
}
