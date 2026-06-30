import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop } from '../gameFx.js';
import { escapeHtml } from './shared.js';

const COLOR_LABELS = { red: 'Rojo', green: 'Verde', blue: 'Azul', yellow: 'Amarillo', purple: 'Morado', orange: 'Naranja' };
const COLORS = ['red', 'green', 'blue', 'yellow', 'purple', 'orange'];

let liveRoot = null;
let slotBtns = [];
let prevStatus = null;
let prevGuessCount = 0;
let prevHintKey = '';
let pick = [null, null, null, null];
let activeSlot = 0;
let lastPickKey = '';
let lastHistoryLen = -1;
let lastCtx = null;

export default function render(ctx) {
  lastCtx = ctx;
  const { view, me, root } = ctx;
  const canGuess = view.status === 'playing' && view.guesses.length < view.maxGuesses;
  const codeLen = view.codeLen || 4;

  if (!liveRoot || !root.contains(liveRoot)) {
    root.innerHTML = '';
    pick = Array(codeLen).fill(null);
    activeSlot = 0;
    lastPickKey = '';
    lastHistoryLen = -1;
    prevHintKey = '';
    slotBtns = [];
    liveRoot = document.createElement('div');
    liveRoot.className = 'mm-wrap';
    liveRoot.innerHTML = `
      <p class="mm-rules">Adivina el código de <strong>4 colores</strong> (pueden repetirse). Elige colores abajo y pulsa <strong>Comprobar</strong>. Quien lo acierte primero gana.</p>
      <div class="mm-legend">
        <span class="mm-legend-item"><span class="mm-clue mm-clue-exact"></span> exacto</span>
        <span class="mm-legend-item"><span class="mm-clue mm-clue-near"></span> otro sitio</span>
      </div>
      <div class="mm-current">
        <div class="mm-head"><span class="mm-title">🔐 Tu intento</span><span class="mm-attempts"></span></div>
        <div class="mm-pick"></div>
        <div class="mm-palette"></div>
        <div class="mm-actions">
          <button type="button" class="btn btn-ghost mm-clear">⌫ Borrar</button>
          <button type="button" class="btn btn-primary mm-submit" disabled>Comprobar</button>
        </div>
      </div>
      <div class="mm-history-wrap">
        <p class="mm-history-title">Intentos anteriores</p>
        <div class="mm-history"></div>
      </div>
      <p class="mm-hint"></p>`;
    root.appendChild(liveRoot);

    const pickEl = liveRoot.querySelector('.mm-pick');
    for (let i = 0; i < codeLen; i++) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'mm-slot-btn empty';
      s.dataset.slot = String(i);
      s.addEventListener('click', () => onSlotPick(i));
      pickEl.appendChild(s);
      slotBtns.push(s);
    }

    const palette = liveRoot.querySelector('.mm-palette');
    COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mm-color mm-${c}`;
      b.title = COLOR_LABELS[c] || c;
      b.setAttribute('aria-label', COLOR_LABELS[c] || c);
      b.addEventListener('click', () => onColorPick(c));
      palette.appendChild(b);
    });

    liveRoot.querySelector('.mm-clear').addEventListener('click', onClear);
    liveRoot.querySelector('.mm-submit').addEventListener('click', onSubmit);
  }

  if (slotBtns.length !== codeLen) {
    pick = Array(codeLen).fill(null);
    activeSlot = 0;
    lastPickKey = '';
  }

  if (view.guesses.length > prevGuessCount) {
    pick = Array(codeLen).fill(null);
    activeSlot = 0;
    lastPickKey = '';
  }

  if (view.status === 'finished' && prevStatus === 'playing') {
    pick = Array(codeLen).fill(null);
    activeSlot = 0;
    lastPickKey = '';
  }

  updatePickUI(codeLen);
  syncControls(canGuess, codeLen);

  liveRoot.querySelector('.mm-attempts').textContent =
    `Tus intentos: ${view.guesses.length}/${view.maxGuesses} · Rival: ${view.oppGuessCount}/${view.maxGuesses}`;

  if (view.guesses.length !== lastHistoryLen) {
    renderHistory(view.guesses, codeLen);
    lastHistoryLen = view.guesses.length;
  }

  const hint = liveRoot.querySelector('.mm-hint');
  let hintText = '';

  if (view.status === 'finished') {
    hintText = view.winner === me
      ? '🎉 ¡Código descifrado!'
      : view.winner
        ? `😬 Ganó ${ctx.nameOf(view.winner)}`
        : '🤝 Nadie lo logró a tiempo';
    if (view.secret) {
      hint.innerHTML = `${hintText}<br><small>Código: ${view.secret.map((c) => COLOR_LABELS[c] || c).join(' · ')}</small>`;
    } else {
      hint.textContent = hintText;
    }
    if (prevStatus !== 'finished') {
      if (view.winner === me) { SFX.gameWin(ctx.meta.id); celebrate(liveRoot, '🎉', 40); }
      else if (view.winner) SFX.gameLose(ctx.meta.id);
      else SFX.draw();
    }
  } else if (canGuess) {
    const filled = pick.filter(Boolean).length;
    hintText = filled < codeLen
      ? `Elige color ${filled + 1} de ${codeLen} (toca una casilla para cambiarla)`
      : 'Listo — pulsa Comprobar';
    hint.textContent = hintText;
    if (hintText !== prevHintKey) inviteTurn(hint);
  } else {
    hint.textContent = 'Sin intentos — espera el resultado final';
  }

  if (view.guesses.length > prevGuessCount) {
    const g = view.guesses[view.guesses.length - 1];
    if (g.black === codeLen) SFX.mmWin();
    else if (g.black + g.white > 0) SFX.mmGood();
    else SFX.mmBad();
    pop(liveRoot.querySelector('.mm-row.latest'));
  }

  prevHintKey = hintText;
  prevGuessCount = view.guesses.length;
  prevStatus = view.status;
}

function renderHistory(guesses, codeLen) {
  const hist = liveRoot.querySelector('.mm-history');
  hist.innerHTML = '';
  if (!guesses.length) {
    const empty = document.createElement('p');
    empty.className = 'mm-empty';
    empty.textContent = 'Aún no has probado ninguna combinación.';
    hist.appendChild(empty);
    return;
  }
  guesses.forEach((g, i) => {
    hist.appendChild(buildHistoryRow(g, codeLen, i === guesses.length - 1));
  });
}

function buildHistoryRow(g, codeLen, isLatest) {
  const row = document.createElement('div');
  row.className = 'mm-row' + (isLatest ? ' latest' : '');

  const guess = document.createElement('div');
  guess.className = 'mm-guess';
  g.colors.forEach((c) => {
    const peg = document.createElement('span');
    peg.className = `mm-peg mm-${c}`;
    peg.title = COLOR_LABELS[c] || c;
    guess.appendChild(peg);
  });
  row.appendChild(guess);
  row.appendChild(buildClueGrid(g.black || 0, g.white || 0, codeLen));
  return row;
}

function buildClueGrid(exact, near, codeLen) {
  const wrap = document.createElement('div');
  wrap.className = 'mm-clues';
  wrap.setAttribute('aria-label', `${exact} exactos, ${near} en otro sitio`);

  const types = [];
  for (let i = 0; i < exact; i++) types.push('exact');
  for (let i = 0; i < near; i++) types.push('near');
  while (types.length < codeLen) types.push('none');

  types.slice(0, codeLen).forEach((type) => {
    const peg = document.createElement('span');
    peg.className = `mm-clue mm-clue-${type}`;
    wrap.appendChild(peg);
  });
  return wrap;
}

function canPlay(ctx) {
  if (!ctx) return false;
  const { view } = ctx;
  return view.status === 'playing' && view.guesses.length < view.maxGuesses;
}

function pickKey() {
  return `${pick.join(',')}|${activeSlot}`;
}

function updatePickUI(codeLen) {
  const key = pickKey();
  if (key === lastPickKey && slotBtns.length === codeLen) return;
  lastPickKey = key;

  for (let i = 0; i < codeLen; i++) {
    const btn = slotBtns[i];
    if (!btn) continue;
    const color = pick[i];
    btn.className = 'mm-slot-btn' + (color ? ` mm-fill mm-${color}` : ' empty') + (i === activeSlot ? ' active' : '');
    btn.title = color ? (COLOR_LABELS[color] || color) : `Casilla ${i + 1}`;
    btn.setAttribute('aria-label', btn.title);
  }
}

function onColorPick(c) {
  const ctx = lastCtx;
  if (!canPlay(ctx)) return;
  const len = ctx.view.codeLen || 4;
  if (pick.length !== len) pick = Array(len).fill(null);
  pick[activeSlot] = c;
  const next = pick.findIndex((x) => !x);
  activeSlot = next >= 0 ? next : len - 1;
  SFX.mmPick();
  updatePickUI(len);
  syncControls(true, len);
  refreshHint();
}

function onSlotPick(i) {
  const ctx = lastCtx;
  if (!canPlay(ctx)) return;
  activeSlot = i;
  updatePickUI(ctx.view.codeLen || 4);
}

function onClear() {
  const ctx = lastCtx;
  if (!canPlay(ctx)) return;
  const len = ctx.view.codeLen || 4;
  if (pick[activeSlot]) {
    pick[activeSlot] = null;
  } else {
    for (let i = len - 1; i >= 0; i--) {
      if (pick[i]) {
        pick[i] = null;
        activeSlot = i;
        break;
      }
    }
  }
  const next = pick.findIndex((x) => !x);
  if (next >= 0) activeSlot = next;
  updatePickUI(len);
  syncControls(true, len);
  refreshHint();
}

function onSubmit() {
  const ctx = lastCtx;
  if (!canPlay(ctx)) return;
  const len = ctx.view.codeLen || 4;
  if (pick.some((c) => !c)) return;
  ctx.send({ type: 'guess', colors: [...pick] });
  pick = Array(len).fill(null);
  activeSlot = 0;
  lastPickKey = '';
  updatePickUI(len);
  syncControls(canPlay(ctx), len);
  refreshHint();
}

function refreshHint() {
  if (!liveRoot || !lastCtx) return;
  const { view } = lastCtx;
  const codeLen = view.codeLen || 4;
  const canGuess = view.status === 'playing' && view.guesses.length < view.maxGuesses;
  if (!canGuess) return;
  const hint = liveRoot.querySelector('.mm-hint');
  const filled = pick.filter(Boolean).length;
  const hintText = filled < codeLen
    ? `Elige color ${filled + 1} de ${codeLen} (toca una casilla para cambiarla)`
    : 'Listo — pulsa Comprobar';
  hint.textContent = hintText;
}

function syncControls(canGuess, len) {
  if (!liveRoot) return;
  const ready = pick.length === len && pick.every(Boolean);
  liveRoot.querySelector('.mm-submit').disabled = !canGuess || !ready;
  liveRoot.querySelector('.mm-clear').disabled = !canGuess || !pick.some(Boolean);
  liveRoot.querySelectorAll('.mm-color').forEach((b) => { b.disabled = !canGuess; });
  liveRoot.querySelectorAll('.mm-slot-btn').forEach((b) => { b.disabled = !canGuess; });
}
