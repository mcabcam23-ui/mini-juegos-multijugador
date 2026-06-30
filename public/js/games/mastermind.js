import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop } from '../gameFx.js';
import { escapeHtml } from './shared.js';

const COLOR_LABELS = { red: 'Rojo', green: 'Verde', blue: 'Azul', yellow: 'Amarillo', purple: 'Morado', orange: 'Naranja' };
const COLORS = ['red', 'green', 'blue', 'yellow', 'purple', 'orange'];

let liveRoot = null;
let prevStatus = null;
let prevGuessCount = 0;
let pick = [null, null, null, null];
let activeSlot = 0;
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
    liveRoot = document.createElement('div');
    liveRoot.className = 'mm-wrap';
    liveRoot.innerHTML = `
      <p class="mm-rules">Adivina el código de <strong>4 colores</strong> (pueden repetirse). Elige colores abajo y pulsa <strong>Comprobar</strong>. Quien lo acierte primero gana.</p>
      <p class="mm-legend"><span class="mm-legend-exact">●</span> color en su sitio · <span class="mm-legend-wrong">○</span> color correcto en otro sitio</p>
      <div class="mm-head"><span class="mm-title">🔐 Tu intento</span><span class="mm-attempts"></span></div>
      <div class="mm-pick"></div>
      <div class="mm-palette"></div>
      <div class="mm-actions">
        <button type="button" class="btn btn-ghost mm-clear">⌫ Borrar</button>
        <button type="button" class="btn btn-primary mm-submit" disabled>Comprobar</button>
      </div>
      <div class="mm-history-wrap">
        <p class="mm-history-title">Intentos anteriores</p>
        <div class="mm-history"></div>
      </div>
      <p class="mm-hint"></p>`;
    root.appendChild(liveRoot);

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

  if (view.status === 'finished' && prevStatus === 'playing') {
    pick = Array(codeLen).fill(null);
    activeSlot = 0;
  }

  syncPickSlots(liveRoot, pick, activeSlot, codeLen);
  syncControls(canGuess, codeLen);

  liveRoot.querySelector('.mm-attempts').textContent =
    `Tus intentos: ${view.guesses.length}/${view.maxGuesses} · Rival: ${view.oppGuessCount}/${view.maxGuesses}`;

  const hist = liveRoot.querySelector('.mm-history');
  hist.innerHTML = '';
  if (!view.guesses.length) {
    const empty = document.createElement('p');
    empty.className = 'mm-empty';
    empty.textContent = 'Aún no has probado ninguna combinación.';
    hist.appendChild(empty);
  } else {
    view.guesses.forEach((g, i) => {
      hist.appendChild(buildHistoryRow(g, codeLen, i === view.guesses.length - 1));
    });
  }

  const hint = liveRoot.querySelector('.mm-hint');

  if (view.status === 'finished') {
    hint.innerHTML = view.winner === me
      ? '🎉 ¡Código descifrado!'
      : view.winner
        ? `😬 Ganó ${escapeHtml(ctx.nameOf(view.winner))}`
        : '🤝 Nadie lo logró a tiempo';
    if (view.secret) {
      hint.innerHTML += `<br><small>Código: ${view.secret.map((c) => COLOR_LABELS[c] || c).join(' · ')}</small>`;
    }
    if (prevStatus !== 'finished') {
      if (view.winner === me) { SFX.gameWin(ctx.meta.id); celebrate(liveRoot, '🎉', 40); }
      else if (view.winner) SFX.gameLose(ctx.meta.id);
      else SFX.draw();
    }
  } else if (canGuess) {
    const filled = pick.filter(Boolean).length;
    hint.textContent = filled < codeLen
      ? `Elige color ${filled + 1} de ${codeLen} (toca una casilla para cambiarla)`
      : 'Listo — pulsa Comprobar';
    inviteTurn(hint);
  } else {
    hint.textContent = 'Sin intentos — espera el resultado final';
  }

  if (view.guesses.length > prevGuessCount) {
    const g = view.guesses[view.guesses.length - 1];
    if (g.black === codeLen) SFX.mmWin();
    else if (g.black + g.white > 0) SFX.mmGood();
    else SFX.mmBad();
    pop(hist.querySelector('.mm-row.latest'));
  }

  prevGuessCount = view.guesses.length;
  prevStatus = view.status;
}

function buildHistoryRow(g, codeLen, isLatest) {
  const row = document.createElement('div');
  row.className = 'mm-row' + (isLatest ? ' latest' : '');
  g.colors.forEach((c) => {
    const peg = document.createElement('span');
    peg.className = `mm-peg mm-${c}`;
    peg.title = COLOR_LABELS[c] || c;
    row.appendChild(peg);
  });
  const fb = document.createElement('span');
  fb.className = 'mm-feedback';
  const exact = g.black || 0;
  const near = g.white || 0;
  fb.innerHTML = `
    <span class="mm-fb-text">${exact} en sitio · ${near} fuera</span>
    <span class="mm-fb-dots" aria-hidden="true">${'●'.repeat(exact)}${'○'.repeat(near)}</span>`;
  row.appendChild(fb);
  return row;
}

function canPlay(ctx) {
  if (!ctx) return false;
  const { view } = ctx;
  return view.status === 'playing' && view.guesses.length < view.maxGuesses;
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
  syncPickSlots(liveRoot, pick, activeSlot, len);
  syncControls(true, len);
}

function onSlotPick(i) {
  const ctx = lastCtx;
  if (!canPlay(ctx)) return;
  activeSlot = i;
  syncPickSlots(liveRoot, pick, activeSlot, ctx.view.codeLen || 4);
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
  syncPickSlots(liveRoot, pick, activeSlot, len);
  syncControls(true, len);
}

function onSubmit() {
  const ctx = lastCtx;
  if (!canPlay(ctx)) return;
  const len = ctx.view.codeLen || 4;
  if (pick.some((c) => !c)) return;
  ctx.send({ type: 'guess', colors: [...pick] });
  pick = Array(len).fill(null);
  activeSlot = 0;
  syncPickSlots(liveRoot, pick, activeSlot, len);
  syncControls(canPlay(ctx), len);
}

function syncControls(canGuess, len) {
  if (!liveRoot) return;
  const ready = pick.length === len && pick.every(Boolean);
  liveRoot.querySelector('.mm-submit').disabled = !canGuess || !ready;
  liveRoot.querySelector('.mm-clear').disabled = !canGuess || !pick.some(Boolean);
  liveRoot.querySelectorAll('.mm-color').forEach((b) => { b.disabled = !canGuess; });
}

function syncPickSlots(root, pickArr, active, len) {
  const el = root.querySelector('.mm-pick');
  el.innerHTML = '';
  for (let i = 0; i < len; i++) {
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'mm-slot-btn' + (pickArr[i] ? ` mm-peg mm-${pickArr[i]}` : ' mm-slot') + (i === active ? ' active' : '');
    s.title = pickArr[i] ? (COLOR_LABELS[pickArr[i]] || pickArr[i]) : `Casilla ${i + 1}`;
    s.addEventListener('click', () => onSlotPick(i));
    el.appendChild(s);
  }
}
