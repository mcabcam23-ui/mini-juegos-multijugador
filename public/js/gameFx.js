/** Efectos visuales — juice satisfactorio sin marear */
const COLORS = ['#7c5cff', '#46e0c8', '#f6c343', '#ff8fb0', '#60a5fa', '#36d399', '#fb923c'];

export function shake(el) {
  if (!el) return;
  el.classList.remove('fx-shake');
  void el.offsetWidth;
  el.classList.add('fx-shake');
  setTimeout(() => el.classList.remove('fx-shake'), 520);
}

export function pulse(el, cls = 'fx-pulse') {
  if (!el) return;
  el.classList.remove(cls, 'fx-pulse-soft', 'fx-pulse-win', 'fx-turn-glow', 'fx-pop');
  void el.offsetWidth;
  el.classList.add(cls);
  const dur = cls === 'fx-turn-glow' ? 3600 : cls === 'fx-pulse-win' ? 1600 : 700;
  setTimeout(() => el.classList.remove(cls), dur);
}

/** Resalta “tu turno” con brillo suave (2 ciclos) */
export function inviteTurn(el) {
  pulse(el, 'fx-turn-glow');
}

/** Pop elástico al colocar / acertar */
export function pop(el) {
  if (!el) return;
  el.classList.remove('fx-pop');
  void el.offsetWidth;
  el.classList.add('fx-pop');
  setTimeout(() => el.classList.remove('fx-pop'), 480);
}

export function flash(el, cls = 'fx-flash-good') {
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 650);
}

export function confetti(host, count = 28) {
  if (!host) return;
  const layer = document.createElement('div');
  layer.className = 'fx-confetti-layer';
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'fx-confetti' + (i % 3 === 0 ? ' fx-confetti-round' : '');
    p.style.left = `${10 + Math.random() * 80}%`;
    p.style.background = COLORS[i % COLORS.length];
    p.style.animationDelay = `${Math.random() * 0.4}s`;
    p.style.animationDuration = `${1.4 + Math.random() * 0.8}s`;
    p.style.setProperty('--fx-rot', `${Math.random() * 540 - 270}deg`);
    p.style.setProperty('--fx-dx', `${(Math.random() - 0.5) * 160}px`);
    layer.appendChild(p);
  }
  host.appendChild(layer);
  setTimeout(() => layer.remove(), 2800);
}

export function sparks(host, emoji = '✨', n = 6) {
  if (!host) return;
  const rect = host.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'fx-spark';
    s.textContent = emoji;
    s.style.left = `${cx + (Math.random() - 0.5) * Math.min(rect.width * 0.6, 120)}px`;
    s.style.top = `${cy + (Math.random() - 0.5) * 40}px`;
    s.style.setProperty('--fx-sx', `${(Math.random() - 0.5) * 100}px`);
    s.style.setProperty('--fx-sy', `${-40 - Math.random() * 70}px`);
    s.style.animationDelay = `${i * 0.04}s`;
    host.style.position = host.style.position || 'relative';
    host.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }
}

/** Victoria: confeti + chispas */
export function celebrate(host, emoji = '🎉', confettiCount = 36) {
  confetti(host, confettiCount);
  setTimeout(() => sparks(host, emoji, 8), 120);
}
