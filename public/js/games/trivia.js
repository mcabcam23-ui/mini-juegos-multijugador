import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop, pulse, sparks } from '../gameFx.js';

let timerInterval = null;
let diceAnimToken = '';
let lastRenderKey = '';
let prevRevealKey = '';
let lastTickSec = null;
let diceLandedPlayed = false;

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/** Clave estable: ignora answeredCount y otros campos que cambian sin cambiar la pantalla. */
function renderKey(view) {
  return [
    view.phase,
    view.index,
    view.roundId ?? 0,
    view.diceStartedAt ?? 0,
    view.themeStartedAt ?? 0,
    view.myAnswer ?? 'none',
    view.status,
    view.correct ?? '',
  ].join('|');
}

let prevGameStatus = '';

function checkGameOver(ctx) {
  const { view, me, root } = ctx;
  if (view.status !== 'finished' || prevGameStatus === 'finished') {
    prevGameStatus = view.status;
    return;
  }
  if (view.winner === me) {
    SFX.gameWin('trivia');
    celebrate(root.querySelector('.triv-wrap') || root, '🏆', 40);
  } else if (view.winner) {
    SFX.gameLose('trivia');
  } else {
    SFX.draw();
  }
  prevGameStatus = view.status;
}

export default function render(ctx) {
  const { view, send, me, root } = ctx;
  const key = renderKey(view);

  if (key === lastRenderKey && root.querySelector('.triv-wrap')) {
    patchLive(ctx);
    return;
  }

  lastRenderKey = key;
  clearTimer();
  lastTickSec = null;
  if (view.phase !== 'reveal') prevRevealKey = '';
  if (view.phase === 'dice') diceLandedPlayed = false;
  root.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'triv-wrap';

  const head = document.createElement('div');
  head.className = 'triv-head';
  const catLabel = phaseLabel(view);
  head.innerHTML = `<span class="triv-cat">${escapeHtml(catLabel)}</span>
    <span class="triv-progress">Pregunta ${view.index + 1} / ${view.total}</span>`;
  wrap.appendChild(head);

  const stage = document.createElement('div');
  stage.className = 'triv-stage';
  wrap.appendChild(stage);

  if (view.phase === 'dice') {
    stage.appendChild(buildDicePanel(view));
    wrap.appendChild(buildScores(ctx, view));
    root.appendChild(wrap);
    runDiceAnimation(view, root);
    checkGameOver(ctx);
    return;
  }

  if (view.phase === 'theme') {
    stage.appendChild(buildThemePanel(view));
    wrap.appendChild(buildScores(ctx, view));
    root.appendChild(wrap);
    requestAnimationFrame(() => {
      stage.querySelector('.triv-theme-card')?.classList.add('show');
      stage.querySelector('.triv-theme-prepare')?.classList.add('show');
    });
    checkGameOver(ctx);
    return;
  }

  const panel = buildQuestionPanel(ctx, view, me, send);
  stage.appendChild(panel);
  wrap.appendChild(buildScores(ctx, view));
  root.appendChild(wrap);

  requestAnimationFrame(() => {
    panel.classList.add('show');
    panel.querySelectorAll('.triv-opt').forEach((el, i) => {
      el.style.animationDelay = `${120 + i * 70}ms`;
      el.classList.add('in');
    });
  });

  startQuestionTimer(view, panel);
  checkGameOver(ctx);
}

function patchLive(ctx) {
  const { view, me, root } = ctx;
  const oldScores = root.querySelector('.triv-scores');
  if (oldScores) oldScores.replaceWith(buildScores(ctx, view));

  const status = root.querySelector('.triv-status');
  if (!status) return;

  const answered = view.myAnswer !== undefined && view.myAnswer !== null;
  const reveal = view.phase === 'reveal' || view.status === 'finished';

  if (reveal) {
    const rk = `${view.index}:${view.correct}:${view.myAnswer}`;
    if (rk !== prevRevealKey) {
      if (view.myAnswer === view.correct) {
        SFX.trivCorrect();
        sparks(root.querySelector('.triv-wrap') || root, '✨', 5);
        pop(status);
      } else if (answered) SFX.trivWrong();
      prevRevealKey = rk;
    }
    const gained = view.reveal?.gained?.[me] || 0;
    status.textContent = view.myAnswer === view.correct
      ? `✅ ¡Correcto! +${gained} puntos`
      : (answered ? '❌ Respuesta incorrecta' : '⏱️ Sin respuesta');
    status.classList.toggle('good', view.myAnswer === view.correct);
    status.classList.toggle('bad', view.myAnswer !== view.correct);
  } else if (answered) {
    status.textContent = `Respuesta enviada · esperando (${view.answeredCount}/${view.playerCount})`;
  }
  checkGameOver(ctx);
}

function startQuestionTimer(view, panel) {
  const reveal = view.phase === 'reveal' || view.status === 'finished';
  const answered = view.myAnswer !== undefined && view.myAnswer !== null;
  if (reveal || answered || !view.questionDeadline) return;

  const fill = panel.querySelector('.triv-timefill');
  const countdown = panel.querySelector('.triv-countdown');
  timerInterval = setInterval(() => updateTimer(view, fill, countdown), 100);
  updateTimer(view, fill, countdown);
}

function phaseLabel(view) {
  if (view.phase === 'dice') return 'Tirando el dado…';
  if (view.phase === 'theme') return view.diceFace?.label || 'Temática';
  if (view.question?.c) return view.question.c;
  return view.diceFace?.label || 'Trivia';
}

function buildDicePanel(view) {
  const box = document.createElement('div');
  box.className = 'triv-panel triv-panel-dice';
  box.innerHTML = `
    <p class="triv-dice-title">🎲 Tirando el dado temático…</p>
    <div class="triv-dice" id="triv-dice">
      <div class="triv-dice-face" id="triv-dice-face">🎲</div>
    </div>
    <p class="triv-dice-hint" id="triv-dice-hint">La temática aparecerá al detenerse</p>
    <div class="triv-dice-faces" id="triv-dice-legend"></div>
  `;
  const legend = box.querySelector('#triv-dice-legend');
  (view.diceFaces || []).forEach((face) => {
    const chip = document.createElement('span');
    chip.className = 'triv-dice-chip';
    chip.textContent = `${face.icon} ${face.label}`;
    legend.appendChild(chip);
  });
  return box;
}

function buildThemePanel(view) {
  const face = view.diceFace || view.diceFaces?.[view.diceIndex];
  const box = document.createElement('div');
  box.className = 'triv-panel triv-panel-theme';
  box.innerHTML = `
    <p class="triv-theme-kicker">¡Temática elegida!</p>
    <div class="triv-theme-card">
      <span class="triv-theme-icon">${face?.icon || '🎲'}</span>
      <h3 class="triv-theme-name">${escapeHtml(face?.label || 'Cultura general')}</h3>
    </div>
    <p class="triv-theme-prepare">Preparando la pregunta…</p>
  `;
  return box;
}

function buildQuestionPanel(ctx, view, me, send) {
  const panel = document.createElement('div');
  panel.className = 'triv-panel triv-panel-question';

  const timeBar = document.createElement('div');
  timeBar.className = 'triv-timebar';
  const fill = document.createElement('div');
  fill.className = 'triv-timefill';
  timeBar.appendChild(fill);
  panel.appendChild(timeBar);

  const countdown = document.createElement('div');
  countdown.className = 'triv-countdown';
  countdown.textContent = String(view.timeLimit || 20);
  panel.appendChild(countdown);

  const reveal = view.phase === 'reveal' || view.status === 'finished';
  const answered = view.myAnswer !== undefined && view.myAnswer !== null;

  if (view.question) {
    const qEl = document.createElement('div');
    qEl.className = 'triv-question';
    qEl.textContent = view.question.q;
    panel.appendChild(qEl);

    const opts = document.createElement('div');
    opts.className = 'triv-options' + (reveal ? ' triv-options-reveal' : '');
    view.question.o.forEach((text, i) => {
      const b = document.createElement('button');
      b.className = 'triv-opt';
      b.innerHTML = `<span class="triv-letter">${'ABCD'[i]}</span> ${escapeHtml(text)}`;
      if (reveal) {
        if (i === view.correct) b.classList.add('correct');
        else if (view.myAnswer === i) b.classList.add('wrong');
      } else if (view.myAnswer === i) {
        b.classList.add('chosen');
      }
      b.disabled = reveal || answered;
      b.addEventListener('click', () => send({ type: 'answer', option: i }));
      opts.appendChild(b);
    });
    panel.appendChild(opts);
  }

  const status = document.createElement('p');
  status.className = 'triv-status';
  if (reveal) {
    const rk = `${view.index}:${view.correct}:${view.myAnswer}`;
    if (rk !== prevRevealKey) {
      if (view.myAnswer === view.correct) {
        SFX.trivCorrect();
        sparks(root.querySelector('.triv-wrap') || root, '✨', 5);
        pop(status);
      } else if (answered) SFX.trivWrong();
      prevRevealKey = rk;
    }
    const gained = view.reveal?.gained?.[me] || 0;
    status.textContent = view.myAnswer === view.correct
      ? `✅ ¡Correcto! +${gained} puntos`
      : (answered ? '❌ Respuesta incorrecta' : '⏱️ Sin respuesta');
    status.classList.add(view.myAnswer === view.correct ? 'good' : 'bad');
  } else if (answered) {
    status.textContent = `Respuesta enviada · esperando (${view.answeredCount}/${view.playerCount})`;
  } else {
    status.textContent = '¡Elige tu respuesta!';
    inviteTurn(status);
  }
  panel.appendChild(status);

  if (!reveal && ctx.hostId === me) {
    const skip = document.createElement('button');
    skip.className = 'btn btn-ghost triv-skip';
    skip.textContent = '⏭️ Saltar pregunta';
    skip.addEventListener('click', () => send({ type: 'skip' }));
    panel.appendChild(skip);
  }

  if (reveal || answered) {
    panel.classList.add('show');
    panel.querySelectorAll('.triv-opt').forEach((el) => el.classList.add('in'));
  }

  return panel;
}

function runDiceAnimation(view, root) {
  const token = `${view.index}-${view.diceStartedAt}`;
  diceAnimToken = token;

  const faceEl = root.querySelector('#triv-dice-face');
  const diceEl = root.querySelector('#triv-dice');
  const hintEl = root.querySelector('#triv-dice-hint');
  const chips = [...root.querySelectorAll('.triv-dice-chip')];
  if (!faceEl || !view.diceFaces?.length) return;

  const endAt = view.diceEndsAt || Date.now() + 3200;
  let tick = 0;
  let spinTimer = null;

  const stopSpin = () => {
    if (spinTimer) clearTimeout(spinTimer);
    spinTimer = null;
  };

  const spin = () => {
    if (diceAnimToken !== token || Date.now() >= endAt) return;
    tick += 1;
    const idx = tick % view.diceFaces.length;
    const f = view.diceFaces[idx];
    faceEl.textContent = f.icon;
    chips.forEach((c, i) => c.classList.toggle('active', i === idx));
    diceEl?.classList.add('rolling');
    const remaining = endAt - Date.now();
    const delay = remaining < 900 ? 160 + (900 - remaining) / 8 : 72;
    spinTimer = setTimeout(spin, delay);
  };

  spin();

  setTimeout(() => {
    if (diceAnimToken !== token) return;
    stopSpin();
    diceEl?.classList.remove('rolling');
    diceEl?.classList.add('landed');
    const final = view.diceFaces[view.diceIndex] || view.diceFace;
    if (final) {
      faceEl.textContent = final.icon;
      chips.forEach((c, i) => c.classList.toggle('active', i === view.diceIndex));
      if (hintEl) {
        hintEl.textContent = final.label;
        hintEl.classList.add('revealed');
      }
      if (!diceLandedPlayed) {
        SFX.trivDice();
        diceLandedPlayed = true;
        pulse(diceEl, 'fx-pulse-win');
      }
    }
  }, Math.max(0, endAt - Date.now()));
}

function updateTimer(view, fillEl, countdownEl) {
  if (!fillEl || !countdownEl) return;
  const deadline = view.questionDeadline || Date.now();
  const totalMs = (view.timeLimit || 20) * 1000;
  const remaining = Math.max(0, deadline - Date.now());
  const secs = Math.ceil(remaining / 1000);
  const pct = Math.max(0, (remaining / totalMs) * 100);

  fillEl.style.width = `${pct}%`;
  fillEl.style.background = pct < 30 ? '#ff5c7c' : 'linear-gradient(90deg,#46e0c8,#7c5cff)';
  countdownEl.textContent = String(secs);
  countdownEl.classList.toggle('urgent', secs <= 5);

  if (secs <= 5 && secs !== lastTickSec) {
    SFX.trivTick();
    lastTickSec = secs;
  }

  if (remaining <= 0) {
    clearTimer();
    countdownEl.textContent = '0';
    countdownEl.classList.add('urgent');
    fillEl.style.width = '0%';
  }
}

function buildScores(ctx, view) {
  const sorted = [...view.order].sort((a, b) => view.scores[b] - view.scores[a]);
  const row = document.createElement('div');
  row.className = 'triv-scores';
  sorted.forEach((id) => {
    const { color, initials } = ctx.avatarFor(id, ctx.nameOf(id));
    const s = document.createElement('div');
    s.className = 'triv-score';
    const g = view.reveal?.gained?.[id];
    s.innerHTML = `<span class="avatar" style="width:24px;height:24px;font-size:.75rem;background:${color}">${initials}</span>
      ${escapeHtml(ctx.nameOf(id))}${id === ctx.me ? ' (Tú)' : ''} · <strong>${view.scores[id]}</strong>
      ${g ? `<span class="triv-gain">+${g}</span>` : ''}`;
    row.appendChild(s);
  });
  return row;
}
