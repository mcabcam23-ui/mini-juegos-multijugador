import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop, pulse, sparks } from '../gameFx.js';

const CHOICES = [
  { id: 'piedra', emoji: '✊', label: 'Piedra' },
  { id: 'papel', emoji: '✋', label: 'Papel' },
  { id: 'tijera', emoji: '✌️', label: 'Tijera' },
];
const EMOJI = { piedra: '✊', papel: '✋', tijera: '✌️' };

let liveRoot = null;
let lastCtx = null;
let prevRevealKey = null;
let animToken = 0;
let animPhase = 'idle';
let frozenScores = null;
let gameOverCelebrated = false;

function revealKey(view, me, oppId) {
  if (!view.reveal) return null;
  const c = view.reveal.choices;
  return `${c[me]}:${c[oppId]}:${view.reveal.roundWinner || 'tie'}:${view.scores[me]}-${view.scores[oppId]}`;
}

function isAnimating() {
  return animPhase !== 'idle';
}

function scoresForDisplay(view) {
  return frozenScores || view.scores;
}

function cancelAnimation() {
  animToken += 1;
  animPhase = 'idle';
  frozenScores = null;
}

function setHand(el, side, mode, choiceId = null, extra = '') {
  if (!el) return;
  el.className = `rr-hand rr-${side} rr-${mode}${extra ? ` ${extra}` : ''}`;
  if (mode === 'hidden') {
    el.innerHTML = '<span class="rr-q">?</span>';
    return;
  }
  if (choiceId) {
    el.innerHTML = `<span class="rr-choice rr-choice-${choiceId}">${EMOJI[choiceId]}</span>`;
  }
}

function labelOf(id) {
  return CHOICES.find((c) => c.id === id)?.label || id;
}

function els() {
  if (!liveRoot) return {};
  return {
    arena: liveRoot.querySelector('.rps-arena'),
    inner: liveRoot.querySelector('.rps-reveal-inner'),
    countdown: liveRoot.querySelector('.rps-countdown'),
    idleMsg: liveRoot.querySelector('.rps-idle-msg'),
    banner: liveRoot.querySelector('.rps-result-banner'),
    leftHand: liveRoot.querySelector('.rr-left'),
    rightHand: liveRoot.querySelector('.rr-right'),
    leftLbl: liveRoot.querySelector('.rr-lbl-left'),
    rightLbl: liveRoot.querySelector('.rr-lbl-right'),
  };
}

function updateScores(view, me, oppId) {
  if (!liveRoot) return;
  const s = scoresForDisplay(view);
  liveRoot.querySelector('.rps-player-me .rp-score').textContent = s[me] ?? 0;
  liveRoot.querySelector('.rps-player-opp .rp-score').textContent = s[oppId] ?? 0;
}

function updateButtons(view) {
  if (!liveRoot) return;
  const locked = view.status === 'finished' || !!view.myChoice || isAnimating();
  liveRoot.querySelectorAll('.rps-btn').forEach((b) => {
    b.disabled = locked;
    b.classList.toggle('selected', view.myChoice === b.dataset.choice);
  });
}

function ensureRoot(root) {
  if (liveRoot && root.contains(liveRoot)) return;
  cancelAnimation();
  prevRevealKey = null;
  gameOverCelebrated = false;

  liveRoot = document.createElement('div');
  liveRoot.className = 'rps-wrap';
  liveRoot.innerHTML = `
    <div class="rps-score">
      <div class="rps-player rps-player-me"><div class="rp-name"></div><div class="rp-score"></div></div>
      <div class="rps-vs rps-vs-big">VS</div>
      <div class="rps-player rps-player-opp"><div class="rp-name"></div><div class="rp-score"></div></div>
    </div>
    <p class="rps-round"></p>
    <div class="rps-arena">
      <div class="rps-countdown" hidden></div>
      <div class="rps-reveal-inner">
        <div class="rr-side rr-side-left">
          <div class="rr-hand rr-left rr-hidden"></div>
          <span class="rr-lbl rr-lbl-left"></span>
        </div>
        <div class="rps-clash-zone"><span class="rps-clash">⚔️</span></div>
        <div class="rr-side rr-side-right">
          <div class="rr-hand rr-right rr-hidden"></div>
          <span class="rr-lbl rr-lbl-right"></span>
        </div>
      </div>
      <p class="rps-idle-msg"></p>
      <p class="rps-result-banner" hidden></p>
    </div>
    <div class="rps-status"></div>
    <div class="rps-choices"></div>`;

  root.innerHTML = '';
  root.appendChild(liveRoot);

  const choicesEl = liveRoot.querySelector('.rps-choices');
  CHOICES.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rps-btn';
    btn.dataset.choice = c.id;
    btn.innerHTML = `<span class="rps-emoji">${c.emoji}</span><span class="rps-lbl">${c.label}</span>`;
    choicesEl.appendChild(btn);
  });

  liveRoot.querySelector('.rps-choices').addEventListener('click', (e) => {
    const btn = e.target.closest('.rps-btn');
    if (!btn || btn.disabled) return;
    const ctx = lastCtx;
    if (!ctx || ctx.view.status === 'finished' || ctx.view.myChoice || isAnimating()) return;
    SFX.rpsPick();
    ctx.send({ type: 'choose', choice: btn.dataset.choice });
  });
}

function patchIdle(ctx, view, me, oppId) {
  const { arena, inner, idleMsg, banner, leftHand, rightHand, leftLbl, rightLbl } = els();
  if (!arena) return;

  arena.className = 'rps-arena';
  banner.hidden = true;
  banner.classList.remove('show');
  idleMsg.hidden = false;
  idleMsg.className = 'rps-idle-msg';
  inner.hidden = false;
  leftHand?.classList.remove('rr-shake', 'rr-reveal-pop');
  rightHand?.classList.remove('rr-shake', 'rr-reveal-pop');

  if (view.status === 'finished') {
    arena.classList.add('rps-prompt-only');
    inner.hidden = true;
    idleMsg.textContent = view.winner === me ? '🏆 ¡Campeón!' : 'Fin de partida';
    return;
  }

  if (!view.myChoice && !view.chosen[oppId]) {
    arena.classList.add('rps-prompt-only');
    inner.hidden = true;
    idleMsg.textContent = '👇 Elige piedra, papel o tijera';
    return;
  }

  if (!view.myChoice && view.chosen[oppId]) {
    arena.classList.add('rps-prompt-only');
    inner.hidden = true;
    idleMsg.textContent = '🔥 ¡Tu rival ya eligió! Elige tu jugada';
    idleMsg.classList.add('rps-urgent');
    inviteTurn(idleMsg);
    return;
  }

  arena.classList.add('rps-duel');
  setHand(leftHand, 'left', 'revealed', view.myChoice);
  leftLbl.textContent = labelOf(view.myChoice);
  setHand(rightHand, 'right', 'hidden');
  rightLbl.textContent = '???';
  if (view.chosen[oppId]) {
    idleMsg.textContent = '⚡ Preparando choque…';
    rightHand?.classList.add('rr-shake');
  } else {
    idleMsg.textContent = '⏳ Esperando rival…';
    idleMsg.classList.add('rps-waiting');
  }
}

function startReveal(ctx, view, me, oppId) {
  const reveal = view.reveal;
  if (!reveal) return;

  animToken += 1;
  const token = animToken;
  animPhase = 'countdown';

  frozenScores = { ...view.scores };
  if (reveal.roundWinner) frozenScores[reveal.roundWinner] -= 1;
  updateScores(view, me, oppId);
  updateButtons(view);

  const { arena, inner, countdown, idleMsg, banner, leftHand, rightHand, leftLbl, rightLbl } = els();
  const myC = reveal.choices[me];
  const opC = reveal.choices[oppId];

  arena.className = 'rps-arena rps-fight rps-duel';
  inner.hidden = false;
  idleMsg.hidden = true;
  banner.hidden = true;
  countdown.hidden = false;
  countdown.className = 'rps-countdown';

  setHand(leftHand, 'left', 'revealed', myC);
  leftLbl.textContent = labelOf(myC);
  setHand(rightHand, 'right', 'hidden');
  rightLbl.textContent = '???';
  rightHand?.classList.add('rr-shake');

  SFX.rpsTension();

  const tick = (ms, fn) => setTimeout(() => {
    if (animToken !== token) return;
    fn();
  }, ms);

  const done = () => {
    if (animToken !== token) return;
    animPhase = 'idle';
    frozenScores = null;
    countdown.hidden = true;
    if (!lastCtx) return;
    patchIdle(lastCtx, lastCtx.view, lastCtx.me, lastCtx.oppId);
    updateScores(lastCtx.view, lastCtx.me, lastCtx.oppId);
    updateButtons(lastCtx.view);
    paintStatus(lastCtx);
    if (lastCtx.view.status === 'finished' && !gameOverCelebrated) {
      gameOverCelebrated = true;
      const won = lastCtx.view.winner === lastCtx.me;
      if (won) { SFX.gameWin(lastCtx.meta.id); celebrate(liveRoot, '🏆', 40); }
      else SFX.gameLose(lastCtx.meta.id);
    }
  };

  tick(0, () => { countdown.textContent = '3'; SFX.rpsCountdown(3); });
  tick(550, () => { countdown.textContent = '2'; SFX.rpsCountdown(2); });
  tick(1100, () => { countdown.textContent = '1'; SFX.rpsCountdown(1); arena.classList.add('rps-fight-build'); });
  tick(1650, () => { countdown.textContent = '¡YA!'; countdown.classList.add('go'); SFX.rpsGo(); pulse(arena, 'fx-pop'); });
  tick(2050, () => { animPhase = 'slam'; countdown.hidden = true; arena.classList.add('rps-slam'); });
  tick(2450, () => {
    animPhase = 'reveal';
    setHand(rightHand, 'right', 'revealed', opC, 'rr-reveal-pop');
    rightHand?.classList.remove('rr-shake');
    rightLbl.textContent = labelOf(opC);
    SFX.rpsClash();
    pulse(liveRoot.querySelector('.rps-clash'), 'fx-pop');
    frozenScores = null;
    updateScores(view, me, oppId);
  });
  tick(2850, () => {
    animPhase = 'result';
    const rw = reveal.roundWinner;
    arena.classList.add(rw === null ? 'tie' : rw === me ? 'win' : 'lose');
    banner.hidden = false;
    banner.classList.add('show');
    banner.textContent = rw === null ? '🤝 ¡Empate!' : rw === me ? '🎉 ¡Ganaste!' : '😬 Perdiste…';
    if (rw === me) { SFX.rpsRoundWin(); sparks(arena, '🎉', 6); pop(banner); }
    else if (rw) SFX.rpsRoundLose();
  });
  tick(3400, done);
}

function paintStatus(ctx) {
  const status = liveRoot?.querySelector('.rps-status');
  if (!status) return;
  const { view, me } = ctx;
  if (view.status === 'finished') {
    const oppId = ctx.oppId;
    const won = view.winner === me;
    status.textContent = won
      ? `🏆 ¡Campeón! ${view.scores[me]}–${view.scores[oppId]}`
      : `😬 ${ctx.nameOf(view.winner)} gana ${view.scores[view.winner]}–${view.scores[me]}`;
    return;
  }
  if (isAnimating()) {
    status.textContent = animPhase === 'reveal' || animPhase === 'result' ? '💥 ¡CHOQUE!' : '🥁 ¡Prepárate…!';
  } else if (view.myChoice) {
    status.textContent = view.chosen[ctx.oppId] ? '⚡ ¡A luchar!' : '⏳ Esperando rival…';
  } else if (view.chosen[ctx.oppId]) {
    status.textContent = '👇 Tu turno — elige';
  } else {
    status.textContent = '👇 Elige tu jugada';
  }
}

export default function render(ctx) {
  const { view, me, root } = ctx;
  const ids = Object.keys(view.scores);
  const oppId = ids.find((id) => id !== me);
  ctx.oppId = oppId;
  lastCtx = ctx;

  ensureRoot(root);

  liveRoot.querySelector('.rps-player-me .rp-name').textContent = `${ctx.nameOf(me)} (Tú)`;
  liveRoot.querySelector('.rps-player-opp .rp-name').textContent = ctx.nameOf(oppId);
  liveRoot.querySelector('.rps-round').textContent = `Ronda ${view.round} · Primero a ${view.target} puntos`;

  if (!view.reveal) prevRevealKey = null;

  const rk = revealKey(view, me, oppId);
  if (rk && rk !== prevRevealKey && !isAnimating()) {
    prevRevealKey = rk;
    startReveal(ctx, view, me, oppId);
  } else if (!isAnimating()) {
    patchIdle(ctx, view, me, oppId);
    updateScores(view, me, oppId);
    updateButtons(view);
  } else if (frozenScores) {
    updateScores(view, me, oppId);
  }

  paintStatus(ctx);
}
