// Dice Duel — 2 jugadores, mejor de 5 rondas
const ROUNDS_TO_WIN = 3;
const REROLLS = 2;

function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

function rollAll() {
  return Array.from({ length: 5 }, rollDie);
}

function sum(dice) {
  return dice.reduce((a, b) => a + b, 0);
}

export default {
  meta: {
    id: 'dicey',
    name: 'Dados Duelo',
    emoji: '🎲',
    tagline: 'Suma máxima con 5 dados',
    description: 'Lanza 5 dados, retén los que quieras y vuelve a tirar. Gana la ronda quien sume más. ¡Primero a 3 rondas!',
    minPlayers: 2,
    maxPlayers: 2,
    gradient: 'linear-gradient(135deg, #eab308, #f97316)',
  },

  init(players) {
    const roundWins = {};
    const dice = {};
    const holds = {};
    const rerollsLeft = {};
    const locked = {};
    for (const p of players) {
      roundWins[p.id] = 0;
      dice[p.id] = rollAll();
      holds[p.id] = [false, false, false, false, false];
      rerollsLeft[p.id] = REROLLS;
      locked[p.id] = false;
    }
    return {
      order: players.map((p) => p.id),
      roundWins,
      round: 1,
      dice,
      holds,
      rerollsLeft,
      locked,
      phase: 'rolling',
      lastRoll: null,
      roundResult: null,
      status: 'playing',
      winner: null,
    };
  },

  action(state, playerId, action) {
    if (state.status !== 'playing' && action.type !== '_nextRound') {
      return { error: 'La partida ha terminado.' };
    }
    if (state.phase === 'reveal' && action.type !== '_nextRound') {
      return { error: 'Espera el resultado de la ronda.' };
    }

    if (action.type === '_nextRound') {
      if (state.status === 'finished') return { state };
      for (const id of state.order) {
        state.dice[id] = rollAll();
        state.holds[id] = [false, false, false, false, false];
        state.rerollsLeft[id] = REROLLS;
        state.locked[id] = false;
      }
      state.round += 1;
      state.phase = 'rolling';
      state.roundResult = null;
      state.lastRoll = null;
      return { state };
    }

    if (action.type === 'toggleHold') {
      if (state.locked[playerId]) return { error: 'Ya has confirmado.' };
      const i = action.index;
      if (typeof i !== 'number' || i < 0 || i > 4) return { error: 'Dado no válido.' };
      state.holds[playerId][i] = !state.holds[playerId][i];
      return { state };
    }

    if (action.type === 'roll') {
      if (state.locked[playerId]) return { error: 'Ya has confirmado.' };
      if (state.rerollsLeft[playerId] <= 0) return { error: 'Sin relanzamientos.' };
      const d = state.dice[playerId];
      for (let i = 0; i < 5; i++) {
        if (!state.holds[playerId][i]) d[i] = rollDie();
      }
      state.rerollsLeft[playerId] -= 1;
      state.lastRoll = { by: playerId };
      return { state };
    }

    if (action.type === 'stand') {
      if (state.locked[playerId]) return { error: 'Ya has confirmado.' };
      state.locked[playerId] = true;

      if (state.order.every((id) => state.locked[id])) {
        const [a, b] = state.order;
        const sa = sum(state.dice[a]);
        const sb = sum(state.dice[b]);
        let roundWinner = null;
        if (sa > sb) roundWinner = a;
        else if (sb > sa) roundWinner = b;
        if (roundWinner) state.roundWins[roundWinner] += 1;

        state.roundResult = {
          sums: { [a]: sa, [b]: sb },
          winner: roundWinner,
          dice: { [a]: [...state.dice[a]], [b]: [...state.dice[b]] },
        };
        state.phase = 'reveal';

        if (state.roundWins[a] >= ROUNDS_TO_WIN || state.roundWins[b] >= ROUNDS_TO_WIN) {
          state.status = 'finished';
          state.winner = state.roundWins[a] >= ROUNDS_TO_WIN ? a : b;
        }
        return { state, delayedAction: { type: '_nextRound', delayMs: 2800 } };
      }
      return { state };
    }

    return { error: 'Acción no válida.' };
  },

  view(state, playerId) {
    const opp = state.order.find((id) => id !== playerId);
    return {
      round: state.round,
      roundWins: state.roundWins,
      dice: state.dice[playerId],
      holds: state.holds[playerId],
      rerollsLeft: state.rerollsLeft[playerId],
      locked: state.locked[playerId],
      oppLocked: opp ? state.locked[opp] : false,
      phase: state.phase,
      roundResult: state.roundResult,
      status: state.status,
      winner: state.winner,
      target: ROUNDS_TO_WIN,
    };
  },

  bots(state, botIds) {
    if (state.status !== 'playing') return [];
    if (state.phase === 'reveal') return [];
    for (const id of state.order) {
      if (!botIds.has(id) || state.locked[id]) continue;
      if (state.rerollsLeft[id] > 0 && sum(state.dice[id]) < 18) {
        return [{ playerId: id, action: { type: 'roll' } }];
      }
      return [{ playerId: id, action: { type: 'stand' } }];
    }
    return [];
  },
};
