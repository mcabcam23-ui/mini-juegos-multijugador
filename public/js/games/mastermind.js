import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop, shake } from '../gameFx.js';
import { escapeHtml } from './shared.js';

const COLOR_LABELS = { red: 'Rojo', green: 'Verde', blue: 'Azul', yellow: 'Amarillo', purple: 'Morado', orange: 'Naranja' };
let liveRoot = null;
let prevStatus = null;
let prevGuessCount = 0;
let pick = [];
let lastCtx = null;

export default function render(ctx) {
  lastCtx = ctx;
  const { view, send, me, root } = ctx;
  const myTurn = view.turn === me && view.status === 'playing';

  if (!liveRoot || !root.contains(liveRoot)) {
    root.innerHTML = '';
    pick = [];
    liveRoot = document.createElement('div');
    liveRoot.className = 'mm-wrap';
    liveRoot.innerHTML = `
      <div class="mm-head"><span class="mm-title">🔐 Código Secreto</span><span class="mm-attempts"></span></div>
      <div class="mm-palette"></div>
      <div class="mm-pick">Elige 4 colores</div>
      <button type="button" class="btn btn-primary mm-submit" disabled>Comprobar</button>
      <div class="mm-history"></div>
      <p class="mm-hint"></p>`;
    root.appendChild(liveRoot);

    const palette = liveRoot.querySelector('.mm-palette');
    (view.colors || []).forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mm-color mm-${c}`;
      b.title = COLOR_LABELS[c] || c;
      b.addEventListener('click', () => onColorPick(c));
      palette.appendChild(b);
    });

    liveRoot.querySelector('.mm-submit').addEventListener('click', onSubmit);
  }

  updatePickUI(liveRoot, pick, view.codeLen);
  liveRoot.querySelector('.mm-attempts').textContent = `Intentos: ${view.guesses.length}/${view.maxGuesses} · Rival: ${view.oppGuessCount}`;

  const hist = liveRoot.querySelector('.mm-history');
  hist.innerHTML = '';
  view.guesses.forEach((g, i) => {
    const row = document.createElement('div');
    row.className = 'mm-row';
    g.colors.forEach((c) => {
      const peg = document.createElement('span');
      peg.className = `mm-peg mm-${c}`;
      row.appendChild(peg);
    });
    const fb = document.createElement('span');
    fb.className = 'mm-feedback';
    fb.textContent = '●'.repeat(g.black) + '○'.repeat(g.white);
    row.appendChild(fb);
    if (i === view.guesses.length - 1) row.classList.add('latest');
    hist.appendChild(row);
  });

  const hint = liveRoot.querySelector('.mm-hint');
  const submit = liveRoot.querySelector('.mm-submit');
  submit.disabled = pick.length !== view.codeLen || !myTurn;

  if (view.status === 'finished') {
    hint.innerHTML = view.winner === me
      ? '🎉 ¡Código descifrado!'
      : view.winner
        ? `😬 Ganó ${escapeHtml(ctx.nameOf(view.winner))}`
        : '🤝 Nadie lo logró';
    if (view.secret) {
      hint.innerHTML += `<br><small>Secreto: ${view.secret.map((c) => COLOR_LABELS[c] || c).join(' · ')}</small>`;
    }
    if (prevStatus !== 'finished') {
      if (view.winner === me) { SFX.gameWin(ctx.meta.id); celebrate(liveRoot, '🎉', 40); }
      else if (view.winner) SFX.gameLose(ctx.meta.id);
      else SFX.draw();
    }
  } else if (myTurn) {
    hint.textContent = '🎯 Tu turno — monta tu combinación';
    inviteTurn(hint);
  } else {
    hint.textContent = `Esperando a ${ctx.nameOf(view.turn)}…`;
  }

  if (view.guesses.length > prevGuessCount) {
    const g = view.guesses[view.guesses.length - 1];
    if (g.black === view.codeLen) SFX.mmWin();
    else if (g.black + g.white > 0) SFX.mmGood();
    else SFX.mmBad();
    pop(hist.querySelector('.mm-row.latest'));
  }
  prevGuessCount = view.guesses.length;
  prevStatus = view.status;
}

function onColorPick(c) {
  const ctx = lastCtx;
  if (!ctx) return;
  const { view, me } = ctx;
  if (view.status !== 'playing' || view.turn !== me) return;
  if (pick.length >= view.codeLen) pick.shift();
  pick.push(c);
  SFX.mmPick();
  updatePickUI(liveRoot, pick, view.codeLen);
  liveRoot.querySelector('.mm-submit').disabled = pick.length !== view.codeLen;
}

function onSubmit() {
  const ctx = lastCtx;
  if (!ctx || pick.length !== ctx.view.codeLen) return;
  ctx.send({ type: 'guess', colors: [...pick] });
  pick = [];
  updatePickUI(liveRoot, pick, ctx.view.codeLen);
  liveRoot.querySelector('.mm-submit').disabled = true;
}

function updatePickUI(root, pickArr, len) {
  const el = root.querySelector('.mm-pick');
  el.innerHTML = '';
  for (let i = 0; i < len; i++) {
    const s = document.createElement('span');
    s.className = pickArr[i] ? `mm-peg mm-${pickArr[i]}` : 'mm-slot';
    el.appendChild(s);
  }
}
