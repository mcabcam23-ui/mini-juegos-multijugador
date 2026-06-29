// Simon Says — 2 a 4 jugadores
const COLORS = ['red', 'green', 'blue', 'yellow'];
const MAX_ROUNDS = 12;

export default {
  meta: {
    id: 'simon',
    name: 'Simon Dice',
    emoji: '🎵',
    tagline: 'Memoriza la secuencia',
    description: 'Repite la secuencia de colores que crece cada ronda. ¡Un error y quedas eliminado!',
    minPlayers: 2,
    maxPlayers: 4,
    gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)',
  },

  init(players) {
    const order = players.map((p) => p.id);
    const eliminated = {};
    for (const id of order) eliminated[id] = false;
    const seq = [COLORS[Math.floor(Math.random() * COLORS.length)]];
    const state = {
      sequence: seq,
      round: 1,
      order,
      turn: order[0],
      inputIndex: 0,
      phase: 'watch',
      completedRound: [],
      eliminated,
      status: 'playing',
      winner: null,
      lastTap: null,
    };
    return { state, delayedAction: { type: '_watchDone', delayMs: 600 + seq.length * 420 } };
  },

  action(state, playerId, action) {
    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };

    if (action.type === '_watchDone') {
      if (state.phase !== 'watch') return { state };
      state.phase = 'input';
      state.turn = firstAlive(state);
      state.inputIndex = 0;
      state.completedRound = [];
      return { state };
    }

    if (action.type !== 'tap') return { error: 'Acción no válida.' };
    if (state.phase !== 'input') return { error: 'Observa la secuencia primero.' };
    if (state.turn !== playerId) return { error: 'No es tu turno.' };
    if (state.eliminated[playerId]) return { error: 'Estás eliminado.' };
    if (!COLORS.includes(action.color)) return { error: 'Color no válido.' };

    const expected = state.sequence[state.inputIndex];
    state.lastTap = { by: playerId, color: action.color, ok: action.color === expected };

    if (action.color !== expected) {
      state.eliminated[playerId] = true;
      state.lastTap.ok = false;
      const alive = aliveIds(state);
      if (alive.length <= 1) {
        state.status = 'finished';
        state.winner = alive[0] || null;
        return { state };
      }
      state.inputIndex = 0;
      state.turn = nextAliveAfter(state, playerId);
      return { state };
    }

    state.inputIndex += 1;
    if (state.inputIndex >= state.sequence.length) {
      if (!state.completedRound.includes(playerId)) state.completedRound.push(playerId);
      const alive = aliveIds(state);
      if (alive.every((id) => state.completedRound.includes(id))) {
        if (state.round >= MAX_ROUNDS || alive.length === 1) {
          state.status = 'finished';
          state.winner = alive.length === 1 ? alive[0] : null;
          return { state };
        }
        state.round += 1;
        state.sequence.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
        state.phase = 'watch';
        state.completedRound = [];
        state.inputIndex = 0;
        state.turn = alive[0];
        return {
          state,
          delayedAction: { type: '_watchDone', delayMs: 600 + state.sequence.length * 420 },
        };
      }
      state.inputIndex = 0;
      state.turn = nextAliveAfter(state, playerId);
    }
    return { state };
  },

  view(state) {
    return {
      sequence: state.sequence,
      round: state.round,
      order: state.order,
      turn: state.turn,
      inputIndex: state.inputIndex,
      phase: state.phase,
      completedRound: state.completedRound,
      eliminated: state.eliminated,
      status: state.status,
      winner: state.winner,
      lastTap: state.lastTap,
      colors: COLORS,
    };
  },

  bots(state, botIds) {
    if (state.status !== 'playing' || state.phase !== 'input') return [];
    if (!botIds.has(state.turn)) return [];
    return [{ playerId: state.turn, action: { type: 'tap', color: state.sequence[state.inputIndex] } }];
  },
};

function aliveIds(state) {
  return state.order.filter((id) => !state.eliminated[id]);
}

function firstAlive(state) {
  return aliveIds(state)[0];
}

function nextAliveAfter(state, fromId) {
  const alive = aliveIds(state);
  const idx = alive.indexOf(fromId);
  for (let i = 1; i <= alive.length; i++) {
    const cand = alive[(idx + i) % alive.length];
    if (!state.completedRound.includes(cand)) return cand;
  }
  return alive[(idx + 1) % alive.length];
}
