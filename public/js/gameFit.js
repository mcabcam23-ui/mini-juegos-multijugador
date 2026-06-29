/** Ajusta el minijuegos al área visible. Escala solo cuando hace falta y sin micro-cambios. */
let observer = null;
let observedStage = null;
let rafId = 0;
let lastScale = 1;
let viewportBound = false;

const NO_SCALE_GAMES = new Set(['battleship', 'rps']);

function onViewportChange() {
  if (!document.body.classList.contains('game-active') || !observedStage) return;
  scheduleFit(observedStage);
}

function ensureViewportListeners() {
  if (viewportBound) return;
  viewportBound = true;
  window.addEventListener('resize', onViewportChange, { passive: true });
  window.visualViewport?.addEventListener('resize', onViewportChange, { passive: true });
}

function syncShell(stage) {
  if (stage.querySelector(':scope > .game-fit-shell')) return;
  if (!stage.firstElementChild) return;
  const shell = document.createElement('div');
  shell.className = 'game-fit-shell';
  const scale = document.createElement('div');
  scale.className = 'game-fit-scale';
  while (stage.firstChild) scale.appendChild(stage.firstChild);
  shell.appendChild(scale);
  stage.appendChild(shell);
}

function applyFit(stage) {
  const scaleEl = stage?.querySelector('.game-fit-scale');
  if (!scaleEl || !stage.clientWidth || !stage.clientHeight) return;

  scaleEl.style.transform = 'none';
  const w = scaleEl.offsetWidth;
  const h = scaleEl.offsetHeight;
  if (!w || !h) return;

  const s = Math.min(1, stage.clientWidth / w, stage.clientHeight / h);
  if (Math.abs(s - lastScale) < 0.025 && s >= 0.995) return;

  lastScale = s;
  if (s < 0.995) scaleEl.style.transform = `scale(${s})`;
  else scaleEl.style.transform = '';
}

function scheduleFit(stage) {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => applyFit(stage));
}

/** Quita el shell de escalado sin borrar el contenido del juego */
export function resetGameFit(stage) {
  observer?.disconnect();
  observer = null;
  observedStage = null;
  lastScale = 1;
  cancelAnimationFrame(rafId);
  if (!stage) return;
  const shell = stage.querySelector(':scope > .game-fit-shell');
  if (!shell) return;
  const scale = shell.querySelector('.game-fit-scale');
  if (scale) {
    while (scale.firstChild) stage.insertBefore(scale.firstChild, shell);
  }
  shell.remove();
}

export function bindGameFit(stage) {
  if (!stage) return;
  if (NO_SCALE_GAMES.has(stage.dataset.game)) {
    resetGameFit(stage);
    return;
  }
  ensureViewportListeners();
  syncShell(stage);
  const scaleEl = stage.querySelector('.game-fit-scale');
  if (!scaleEl) return;

  if (observedStage !== stage) {
    observer?.disconnect();
    observer = new ResizeObserver(() => scheduleFit(stage));
    observer.observe(stage);
    observer.observe(scaleEl);
    observedStage = stage;
    lastScale = 1;
  }
  scheduleFit(stage);
}
