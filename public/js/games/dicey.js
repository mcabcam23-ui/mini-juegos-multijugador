import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, sparks } from '../gameFx.js';
import { buildScoreChip } from './shared.js';

let liveRoot = null;
let prevStatus = null;
let prevPhase = null;
let lastCtx = null;

export default function render(ctx) {
  lastCtx = ctx;
  const { view, send, me, root } = ctx;
  const oppId = Object.keys(view.roundWins).find((id) => id !== me);
  const rolling = view.phase === 'rolling' && view.status === 'playing';

  if (!liveRoot || !root.contains(liveRoot)) {
    root.innerHTML = '';
    liveRoot = document.createElement('div');
    liveRoot.className = 'dy-wrap';
    liveRoot.innerHTML = `
      <p class="dy-rules">Cada ronda: <strong>tira 5 dados</strong> → (opcional) retén y relanza hasta 2 veces → <strong>confirmar</strong>. Gana quien sume más.</p>
      <div class="dy-head"></div>
      <p class="dy-round"></p>
      <div class="dy-dice"></div>
      <p class="dy-sum"></p>
      <div class="dy-actions">
        <button type="button" class="btn btn-primary dy-roll">🎲 Tirar 5 dados</button>
        <button type="button" class="btn btn-primary dy-stand" hidden>✓ Confirmar</button>
      </div>
      <div class="dy-reveal" hidden></div>
      <p class="dy-hint"></p>`;
    root.appendChild(liveRoot);

    liveRoot.querySelector('.dy-roll').addEventListener('click', () => {
      const c = lastCtx;
      if (!c || c.view.locked) return;
      if (c.view.rolled && c.view.rerollsLeft <= 0) return;
      c.send({ type: 'roll' });
      SFX.dyRoll();
    });
    liveRoot.querySelector('.dy-stand').addEventListener('click', () => {
      const c = lastCtx;
      if (!c || c.view.locked || !c.view.rolled) return;
      c.send({ type: 'stand' });
      SFX.dyLock();
    });
  }

  const head = liveRoot.querySelector('.dy-head');
  head.innerHTML = '';
  head.appendChild(buildScoreChip(ctx, me, `${view.roundWins[me]}/${view.target}`, rolling && !view.locked));
  if (oppId) head.appendChild(buildScoreChip(ctx, oppId, `${view.roundWins[oppId]}/${view.target}`, false));

  const roundEl = liveRoot.querySelector('.dy-round');
  if (view.rolled) {
    roundEl.textContent = `Ronda ${view.round} · Relanzos restantes: ${view.rerollsLeft}`;
  } else {
    roundEl.textContent = `Ronda ${view.round} · Pulsa «Tirar 5 dados» para empezar`;
  }

  const diceEl = liveRoot.querySelector('.dy-dice');
  diceEl.innerHTML = '';
  const dice = view.rolled ? (view.dice || []) : Array(5).fill(null);
  dice.forEach((v, i) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'dy-die' + (view.holds?.[i] ? ' held' : '') + (v == null ? ' empty' : '');
    d.textContent = v == null ? '?' : v;
    d.disabled = view.locked || !rolling || !view.rolled;
    d.addEventListener('click', () => {
      if (view.locked || !rolling || !view.rolled) return;
      send({ type: 'toggleHold', index: i });
      SFX.dyHold();
    });
    diceEl.appendChild(d);
  });

  const sum = view.rolled ? (view.dice || []).reduce((a, b) => a + b, 0) : null;
  liveRoot.querySelector('.dy-sum').textContent = sum == null ? 'Suma: —' : `Suma: ${sum}`;

  const rollBtn = liveRoot.querySelector('.dy-roll');
  const standBtn = liveRoot.querySelector('.dy-stand');

  rollBtn.textContent = view.rolled ? '🎲 Relanzar' : '🎲 Tirar 5 dados';
  rollBtn.disabled = view.locked || !rolling || (view.rolled && view.rerollsLeft <= 0);
  standBtn.hidden = !view.rolled;
  standBtn.disabled = view.locked || !rolling;

  const reveal = liveRoot.querySelector('.dy-reveal');
  const hint = liveRoot.querySelector('.dy-hint');

  if (view.phase === 'reveal' && view.roundResult) {
    reveal.hidden = false;
    const rr = view.roundResult;
    const mySum = rr.sums[me];
    const oppSum = oppId ? rr.sums[oppId] : 0;
    reveal.innerHTML = `
      <p>Tu suma: <strong>${mySum}</strong> · Rival: <strong>${oppSum}</strong></p>
      <p>${rr.winner === me ? '🎉 ¡Ganas la ronda!' : rr.winner ? '😬 Gana la ronda el rival' : '🤝 Empate de ronda'}</p>`;
    if (prevPhase !== 'reveal') {
      if (rr.winner === me) { SFX.dyWinRound(); sparks(liveRoot, '⭐', 4); }
      else if (rr.winner) SFX.dyLoseRound();
    }
  } else {
    reveal.hidden = true;
  }

  if (view.status === 'finished') {
    hint.textContent = view.winner === me ? '🏆 ¡Campeón de dados!' : `Ganó ${ctx.nameOf(view.winner)}`;
    if (prevStatus !== 'finished') {
      if (view.winner === me) { SFX.gameWin(ctx.meta.id); celebrate(liveRoot, '🏆', 44); }
      else SFX.gameLose(ctx.meta.id);
    }
  } else if (view.locked) {
    hint.textContent = view.oppLocked ? '⏳ Comparando sumas…' : '✓ Confirmado — esperando al rival';
  } else if (!view.rolled) {
    hint.textContent = '🎲 Empieza tirando tus 5 dados';
    inviteTurn(hint);
  } else if (rolling) {
    hint.textContent = 'Toca un dado para retenerlo · Relanza o confirma cuando quieras';
    inviteTurn(hint);
  }

  prevPhase = view.phase;
  prevStatus = view.status;
}
