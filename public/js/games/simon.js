import { SFX } from '../sfx.js';
import { celebrate, inviteTurn } from '../gameFx.js';
import { buildScoreChip } from './shared.js';

const LABELS = { red: 'Rojo', green: 'Verde', blue: 'Azul', yellow: 'Amarillo' };
let liveRoot = null;
let prevStatus = null;
let prevLastTap = null;
let lastWatchKey = '';
let lastCtx = null;

export default function render(ctx) {
  lastCtx = ctx;
  const { view, me, root } = ctx;
  const myTurn = view.turn === me && view.phase === 'input' && view.status === 'playing';

  if (!liveRoot || !root.contains(liveRoot)) {
    root.innerHTML = '';
    liveRoot = document.createElement('div');
    liveRoot.className = 'sim-wrap';
    liveRoot.innerHTML = `
      <div class="sim-head"></div>
      <p class="sim-round"></p>
      <div class="sim-pad"></div>
      <p class="sim-hint"></p>`;
    root.appendChild(liveRoot);

    const pad = liveRoot.querySelector('.sim-pad');
    ['red', 'green', 'blue', 'yellow'].forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `sim-btn sim-${c}`;
      b.dataset.color = c;
      b.textContent = LABELS[c];
      b.addEventListener('click', () => {
        const cctx = lastCtx;
        if (!cctx) return;
        const v = cctx.view;
        if (v.phase !== 'input' || v.turn !== cctx.me || v.eliminated[cctx.me]) return;
        cctx.send({ type: 'tap', color: c });
      });
      pad.appendChild(b);
    });
  }

  const head = liveRoot.querySelector('.sim-head');
  head.innerHTML = '';
  view.order.forEach((id) => {
    head.appendChild(buildScoreChip(ctx, id, view.eliminated[id] ? '💀' : '✓', view.turn === id && view.phase === 'input'));
  });

  liveRoot.querySelector('.sim-round').textContent = `Ronda ${view.round} · Secuencia de ${view.sequence.length}`;

  const hint = liveRoot.querySelector('.sim-hint');
  liveRoot.querySelectorAll('.sim-btn').forEach((b) => {
    b.disabled = !(myTurn && !view.eliminated[me]);
  });

  const watchKey = `${view.round}:${view.sequence.length}:${view.phase}`;
  if (view.phase === 'watch' && watchKey !== lastWatchKey) {
    lastWatchKey = watchKey;
    hint.textContent = '👀 Memoriza la secuencia…';
    playSequence(liveRoot, view.sequence);
  } else if (view.phase === 'input') {
    if (view.eliminated[me]) hint.textContent = '💀 Eliminado — observa el resto';
    else if (myTurn) {
      hint.textContent = `🎵 Tu turno (${view.inputIndex + 1}/${view.sequence.length})`;
      inviteTurn(hint);
    } else hint.textContent = `Turno de ${ctx.nameOf(view.turn)}`;
  }

  const tapKey = view.lastTap ? `${view.lastTap.by}:${view.lastTap.color}:${view.lastTap.ok}` : '';
  if (tapKey && tapKey !== prevLastTap) {
    if (view.lastTap.ok) SFX.simOk();
    else SFX.simFail();
    prevLastTap = tapKey;
  }

  if (view.status === 'finished' && prevStatus !== 'finished') {
    if (view.winner === me) { SFX.gameWin(ctx.meta.id); celebrate(liveRoot, '🏆', 40); }
    else if (view.winner) SFX.gameLose(ctx.meta.id);
    else SFX.draw();
    hint.textContent = view.winner === me ? '🏆 ¡Último en pie!' : view.winner ? `Ganó ${ctx.nameOf(view.winner)}` : '🤝 Empate';
  }

  prevStatus = view.status;
}

function playSequence(root, sequence) {
  let i = 0;
  const step = () => {
    if (i >= sequence.length) return;
    const color = sequence[i];
    const btn = root.querySelector(`.sim-${color}`);
    btn?.classList.add('lit');
    SFX.simFlash();
    setTimeout(() => {
      btn?.classList.remove('lit');
      i += 1;
      setTimeout(step, 200);
    }, 450);
  };
  setTimeout(step, 350);
}
