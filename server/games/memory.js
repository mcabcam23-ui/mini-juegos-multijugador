// Memoria (encuentra las parejas) - 2 a 4 jugadores por turnos
const EMOJIS = ['🐶', '🐱', '🦊', '🐼', '🦁', '🐸', '🐵', '🐧', '🦄', '🐙', '🦋', '🌸', '🍕', '🍩', '⚽', '🚀', '🎸', '👑'];
const PAIRS = 12;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default {
  meta: {
    id: 'memory',
    name: 'Memoria',
    emoji: '🧠',
    tagline: 'Encuentra todas las parejas',
    description: 'Voltea cartas por turnos y memoriza su posición. Si haces pareja, sumas punto y repites. ¡Gana quien tenga más parejas!',
    minPlayers: 2,
    maxPlayers: 4,
    gradient: 'linear-gradient(135deg, #14b8a6, #22c55e)',
  },

  init(players) {
    const values = shuffle(EMOJIS.slice(0, PAIRS).flatMap((e) => [e, e]));
    const cards = values.map((v, i) => ({ id: i, value: v, matched: false, faceUp: false, matchedBy: null }));
    const scores = {};
    for (const p of players) scores[p.id] = 0;
    return {
      cards,
      scores,
      order: players.map((p) => p.id),
      turn: players[0].id,
      flipped: [],
      pendingClear: false,
      seen: [],
      status: 'playing',
      winner: null,
    };
  },

  action(state, playerId, action) {
    if (action.type === '_clear') {
      for (const idx of state.flipped) {
        if (state.cards[idx] && !state.cards[idx].matched) state.cards[idx].faceUp = false;
      }
      state.flipped = [];
      state.pendingClear = false;
      return { state };
    }

    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };
    if (action.type !== 'flip') return { error: 'Acción no válida.' };
    if (state.turn !== playerId) return { error: 'No es tu turno.' };
    if (state.pendingClear || state.flipped.length >= 2) return { error: 'Espera un momento...' };

    const idx = action.index;
    const card = state.cards[idx];
    if (!card) return { error: 'Carta no válida.' };
    if (card.matched || card.faceUp) return { error: 'Carta ya revelada.' };

    card.faceUp = true;
    state.flipped.push(idx);
    if (!state.seen.includes(idx)) state.seen.push(idx);

    if (state.flipped.length === 2) {
      const [a, b] = state.flipped;
      if (state.cards[a].value === state.cards[b].value) {
        state.cards[a].matched = true;
        state.cards[b].matched = true;
        state.cards[a].matchedBy = playerId;
        state.cards[b].matchedBy = playerId;
        state.scores[playerId] += 1;
        state.flipped = [];

        if (state.cards.every((c) => c.matched)) {
          state.status = 'finished';
          let best = -1;
          let winner = null;
          let tie = false;
          for (const id of state.order) {
            if (state.scores[id] > best) { best = state.scores[id]; winner = id; tie = false; }
            else if (state.scores[id] === best) { tie = true; }
          }
          state.winner = tie ? null : winner;
        }
        // Pareja correcta: repite turno
        return { state };
      }
      // Fallo: se mostrarán y luego se ocultan; pasa el turno
      state.pendingClear = true;
      const i = state.order.indexOf(playerId);
      state.turn = state.order[(i + 1) % state.order.length];
      return { state, delayedAction: { type: '_clear', delayMs: 1100 } };
    }

    return { state };
  },

  bots(state, botIds) {
    if (state.status !== 'playing' || state.pendingClear) return [];
    if (!botIds.has(state.turn)) return [];
    if (state.flipped.length >= 2) return [];

    const hidden = (i) => !state.cards[i].matched && !state.cards[i].faceUp;
    // Conocidas: cartas vistas anteriormente y aún disponibles
    const knownByValue = {};
    for (const i of state.seen) {
      if (hidden(i)) (knownByValue[state.cards[i].value] ||= []).push(i);
    }

    if (state.flipped.length === 1) {
      const v = state.cards[state.flipped[0]].value;
      const known = (knownByValue[v] || []).find((i) => i !== state.flipped[0]);
      if (known !== undefined) return [{ playerId: state.turn, action: { type: 'flip', index: known } }];
      const choices = state.cards.map((_, i) => i).filter((i) => hidden(i) && i !== state.flipped[0]);
      return choices.length ? [{ playerId: state.turn, action: { type: 'flip', index: choices[Math.floor(Math.random() * choices.length)] } }] : [];
    }

    // Primera carta: si conozco una pareja completa, empieza por ella
    const pair = Object.values(knownByValue).find((arr) => arr.length >= 2);
    if (pair) return [{ playerId: state.turn, action: { type: 'flip', index: pair[0] } }];
    const choices = state.cards.map((_, i) => i).filter(hidden);
    return choices.length ? [{ playerId: state.turn, action: { type: 'flip', index: choices[Math.floor(Math.random() * choices.length)] } }] : [];
  },

  view(state) {
    // No se ocultan valores porque las cartas boca abajo no exponen su valor en el cliente.
    return {
      cards: state.cards.map((c) => ({
        id: c.id,
        matched: c.matched,
        faceUp: c.faceUp,
        matchedBy: c.matchedBy,
        value: c.faceUp || c.matched ? c.value : null,
      })),
      scores: state.scores,
      order: state.order,
      turn: state.turn,
      pendingClear: state.pendingClear,
      status: state.status,
      winner: state.winner,
    };
  },
};
