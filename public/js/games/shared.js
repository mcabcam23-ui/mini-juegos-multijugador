/** Utilidades compartidas para renderers de juegos */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildScoreChip(ctx, id, label, turn = false) {
  const p = ctx.playersById[id];
  const av = ctx.avatarFor(id, p?.nickname);
  const el = document.createElement('div');
  el.className = 'mem-score' + (turn ? ' turn' : '');
  el.innerHTML = `<span class="score-av" style="background:${av.color}">${av.initials}</span> ${escapeHtml(p?.nickname || 'Jugador')}: <strong>${label}</strong>`;
  return el;
}
