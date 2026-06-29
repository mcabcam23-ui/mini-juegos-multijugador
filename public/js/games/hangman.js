import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop, shake, sparks } from '../gameFx.js';

const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
let prevWrongLen = 0;
let prevLastResult = null;
let prevMask = null;
let prevStatus = null;

export default function render(ctx) {
  const { view, send, me, root } = ctx;
  const myTurn = view.turn === me && view.status === 'playing';

  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'hang-wrap';
  if (view.wrong.length >= view.maxWrong - 2 && view.status === 'playing') wrap.classList.add('hang-danger');

  const top = document.createElement('div');
  top.className = 'hang-top';
  const svg = hangmanSvg(view.wrong.length, view.maxWrong);
  top.appendChild(svg);
  const info = document.createElement('div');
  info.className = 'hang-info';
  info.innerHTML = `
    <div class="hang-cat">📁 ${escapeHtml(view.category)}</div>
    <div class="hang-lives">Fallos: <strong>${view.wrong.length}</strong> / ${view.maxWrong}</div>
    <div class="hang-tip">✨ Acierto = puntos × letras · Fallo = pierdes turno</div>
    <div class="hang-wrong">${view.wrong.map((l) => `<span>${l}</span>`).join('') || '<span class="muted">Sin fallos aún</span>'}</div>`;
  top.appendChild(info);
  wrap.appendChild(top);

  if (view.wrong.length > prevWrongLen && view.status === 'playing') {
    SFX.hangPart();
    shake(svg);
  }

  const wordEl = document.createElement('div');
  wordEl.className = 'hang-word';
  view.mask.forEach((ch, i) => {
    if (ch === ' ') {
      const sp = document.createElement('span');
      sp.className = 'hang-space';
      wordEl.appendChild(sp);
      return;
    }
    const tile = document.createElement('span');
    tile.className = 'hang-tile' + (ch ? ' filled' : '');
    tile.textContent = ch || '';
    if (ch && prevMask && !prevMask[i] && ch !== ' ') {
      pop(tile);
      SFX.hangGood();
      sparks(tile, '⭐', 3);
    }
    wordEl.appendChild(tile);
  });
  wrap.appendChild(wordEl);

  if (view.status === 'finished' && view.word) {
    const fin = document.createElement('p');
    fin.className = 'hang-final-word';
    fin.innerHTML = view.winner === me
      ? `🎉 ¡Palabra completada! Era: <strong>${escapeHtml(view.word)}</strong>`
      : `💀 Se acabaron las vidas. La palabra era: <strong>${escapeHtml(view.word)}</strong>`;
    wrap.appendChild(fin);
    if (prevStatus !== 'finished') {
      if (view.winner === me) { SFX.gameWin(ctx.meta.id); celebrate(wrap, '🎉', 32); }
      else SFX.gameLose(ctx.meta.id);
    }
  }

  if (view.lastResult && view.status === 'playing') {
    const lrKey = `${view.lastResult.by}:${view.lastResult.letter}:${view.lastResult.hit}`;
    if (lrKey !== prevLastResult && !view.lastResult.hit) {
      SFX.hangBad();
      shake(wrap);
      prevLastResult = lrKey;
    } else if (lrKey !== prevLastResult) {
      prevLastResult = lrKey;
    }
    const lr = document.createElement('p');
    lr.className = 'hang-last' + (view.lastResult.hit ? ' good' : ' bad');
    const who = view.lastResult.by === me ? 'Tú' : ctx.nameOf(view.lastResult.by);
    lr.textContent = view.lastResult.hit
      ? `✅ ${who} acertó «${view.lastResult.letter}» (+${view.lastResult.count} pts)`
      : `❌ ${who} falló con «${view.lastResult.letter}»`;
    wrap.appendChild(lr);
  }

  const kb = document.createElement('div');
  kb.className = 'hang-keyboard';
  ALPHABET.forEach((letter) => {
    const used = view.guessed.includes(letter);
    const wrong = view.wrong.includes(letter);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hang-key' + (used ? ' good' : '') + (wrong ? ' bad' : '');
    b.textContent = letter;
    b.disabled = used || wrong || !myTurn;
    b.addEventListener('click', () => send({ type: 'guess', letter }));
    kb.appendChild(b);
  });
  wrap.appendChild(kb);
  wrap.appendChild(scoreRow(ctx, view.scores, view.order, view.turn));
  root.appendChild(wrap);

  if (myTurn) inviteTurn(wrap.querySelector('.hang-cat'));
  prevWrongLen = view.wrong.length;
  prevMask = [...view.mask];
  prevStatus = view.status;
}

function scoreRow(ctx, scores, order, turn) {
  const row = document.createElement('div');
  row.className = 'mem-scores';
  order.forEach((id) => {
    const { color, initials } = ctx.avatarFor(id, ctx.nameOf(id));
    const s = document.createElement('div');
    s.className = 'mem-score' + (turn === id ? ' turn' : '');
    s.innerHTML = `<span class="avatar" style="width:26px;height:26px;font-size:.8rem;background:${color}">${initials}</span>
      ${escapeHtml(ctx.nameOf(id))}${id === ctx.me ? ' (Tú)' : ''} · <strong>${scores[id]}</strong>`;
    row.appendChild(s);
  });
  return row;
}

function hangmanSvg(wrong, max) {
  const parts = Math.min(Math.max(wrong, 0), max);
  const show = (n) => (parts >= n ? '1' : '0.08');
  const div = document.createElement('div');
  div.innerHTML = `
  <svg class="hang-svg" viewBox="0 0 140 160" width="140" height="160">
    <g stroke="#9aa3c4" stroke-width="5" fill="none" stroke-linecap="round">
      <line x1="15" y1="150" x2="95" y2="150"/>
      <line x1="40" y1="150" x2="40" y2="15"/>
      <line x1="40" y1="15" x2="95" y2="15"/>
      <line x1="95" y1="15" x2="95" y2="32"/>
    </g>
    <g stroke="#ff8fb0" stroke-width="4" fill="none" stroke-linecap="round">
      <circle cx="95" cy="45" r="13" stroke-opacity="${show(1)}"/>
      <line x1="95" y1="58" x2="95" y2="100" stroke-opacity="${show(2)}"/>
      <line x1="95" y1="68" x2="78" y2="88" stroke-opacity="${show(3)}"/>
      <line x1="95" y1="68" x2="112" y2="88" stroke-opacity="${show(4)}"/>
      <line x1="95" y1="100" x2="80" y2="125" stroke-opacity="${show(5)}"/>
      <line x1="95" y1="100" x2="110" y2="125" stroke-opacity="${show(6)}"/>
    </g>
  </svg>`;
  return div.firstElementChild;
}
