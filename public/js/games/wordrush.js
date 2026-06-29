import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop } from '../gameFx.js';
import { buildScoreChip } from './shared.js';

const ROWS = 6;
const COLS = 5;
let liveRoot = null;
let prevStatus = null;
let draft = '';
let prevGuessCount = 0;
let lastCtx = null;

export default function render(ctx) {
  lastCtx = ctx;
  const { view, me, root } = ctx;
  const myTurn = view.turn === me && view.status === 'playing';
  const canGuess = myTurn && view.myGuesses.length < view.maxGuesses;

  if (!liveRoot || !root.contains(liveRoot)) {
    root.innerHTML = '';
    draft = '';
    liveRoot = document.createElement('div');
    liveRoot.className = 'wr-wrap';
    liveRoot.innerHTML = `
      <div class="wr-head"></div>
      <div class="wr-grid"></div>
      <div class="wr-keyboard"></div>
      <div class="wr-actions">
        <button type="button" class="btn btn-ghost wr-back">⌫</button>
        <button type="button" class="btn btn-primary wr-send" disabled>Enviar</button>
      </div>
      <p class="wr-hint"></p>`;
    root.appendChild(liveRoot);

    const kb = liveRoot.querySelector('.wr-keyboard');
    'QWERTYUIOPASDFGHJKLÑZXCVBNM'.split('').forEach((ch) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wr-key';
      b.textContent = ch;
      b.addEventListener('click', () => onKey(ch));
      kb.appendChild(b);
    });

    liveRoot.querySelector('.wr-back').addEventListener('click', () => {
      draft = draft.slice(0, -1);
      syncDraftUI();
    });
    liveRoot.querySelector('.wr-send').addEventListener('click', onSubmit);
  }

  const head = liveRoot.querySelector('.wr-head');
  head.innerHTML = '';
  Object.entries(view.others || {}).forEach(([id, count]) => {
    head.appendChild(buildScoreChip(ctx, id, `${count}/${view.maxGuesses}`, view.turn === id));
  });
  head.appendChild(buildScoreChip(ctx, me, `${view.myGuesses.length}/${view.maxGuesses}`, myTurn));

  const grid = liveRoot.querySelector('.wr-grid');
  grid.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'wr-row';
    const g = view.myGuesses[r];
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('span');
      tile.className = 'wr-tile';
      if (g) {
        tile.textContent = g.word[c] || '';
        tile.classList.add(g.feedback[c]);
      } else if (r === view.myGuesses.length && c < draft.length) {
        tile.textContent = draft[c];
        tile.classList.add('draft');
      }
      row.appendChild(tile);
    }
    grid.appendChild(row);
  }

  syncDraftUI();
  liveRoot.querySelectorAll('.wr-key').forEach((b) => { b.disabled = !canGuess; });
  liveRoot.querySelector('.wr-back').disabled = !canGuess || !draft.length;

  const hint = liveRoot.querySelector('.wr-hint');
  if (view.status === 'finished') {
    hint.textContent = view.winner === me ? '🎉 ¡Palabra correcta!' : view.winner ? `Ganó ${ctx.nameOf(view.winner)}` : '🤝 Empate';
    if (view.secret) hint.textContent += ` · Era ${view.secret}`;
    if (prevStatus !== 'finished') {
      if (view.winner === me) { SFX.gameWin(ctx.meta.id); celebrate(liveRoot, '🎉', 40); }
      else if (view.winner) SFX.gameLose(ctx.meta.id);
      else SFX.draw();
    }
  } else if (canGuess) {
    hint.textContent = '⌨️ Escribe tu palabra de 5 letras';
    inviteTurn(hint);
  } else {
    hint.textContent = `Turno de ${ctx.nameOf(view.turn)}`;
  }

  if (view.myGuesses.length > prevGuessCount) {
    const last = view.myGuesses[view.myGuesses.length - 1];
    if (last.feedback.every((x) => x === 'correct')) SFX.wrWin();
    else SFX.wrGuess();
    const row = grid.children[view.myGuesses.length - 1];
    row?.querySelectorAll('.wr-tile').forEach((t) => pop(t));
  }
  prevGuessCount = view.myGuesses.length;
  prevStatus = view.status;
}

function onKey(ch) {
  const ctx = lastCtx;
  if (!ctx) return;
  const { view, me } = ctx;
  if (view.status !== 'playing' || view.turn !== me) return;
  if (view.myGuesses.length >= view.maxGuesses || draft.length >= COLS) return;
  draft += ch;
  SFX.wrType();
  syncDraftUI();
}

function onSubmit() {
  const ctx = lastCtx;
  if (!ctx || draft.length !== COLS) return;
  ctx.send({ type: 'guess', word: draft });
  draft = '';
  syncDraftUI();
}

function syncDraftUI() {
  if (!liveRoot) return;
  const ctx = lastCtx;
  const canGuess = ctx && ctx.view.turn === ctx.me && ctx.view.status === 'playing' && ctx.view.myGuesses.length < ctx.view.maxGuesses;
  liveRoot.querySelector('.wr-send').disabled = draft.length !== COLS || !canGuess;
  const grid = liveRoot.querySelector('.wr-grid');
  if (!grid || !ctx) return;
  const row = grid.children[ctx.view.myGuesses.length];
  if (!row) return;
  [...row.children].forEach((tile, c) => {
    if (c < draft.length) {
      tile.textContent = draft[c];
      tile.className = 'wr-tile draft';
    } else if (!ctx.view.myGuesses[ctx.view.myGuesses.length]) {
      tile.textContent = '';
      tile.className = 'wr-tile';
    }
  });
}
