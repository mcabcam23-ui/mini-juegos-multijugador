// Piedra, Papel o Tijera - 2 jugadores, al mejor de 5 (primero a 3)
const BEATS = { piedra: 'tijera', papel: 'piedra', tijera: 'papel' };
const TARGET = 3;

export default {
  meta: {
    id: 'rps',
    name: 'Piedra, Papel o Tijera',
    emoji: '✊',
    tagline: 'Primero en ganar 3 rondas',
    description: 'Elige a la vez que tu rival. Piedra vence a tijera, tijera a papel y papel a piedra. ¡Gana 3 rondas!',
    minPlayers: 2,
    maxPlayers: 2,
    gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)',
  },

  init(players) {
    return {
      scores: { [players[0].id]: 0, [players[1].id]: 0 },
      choices: {},          // playerId -> 'piedra'|'papel'|'tijera' (oculto hasta revelar)
      round: 1,
      reveal: null,         // { choices, roundWinner } tras revelar
      status: 'playing',
      winner: null,
    };
  },

  action(state, playerId, action) {
    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };
    if (action.type !== 'choose') return { error: 'Acción no válida.' };
    if (!BEATS[action.choice]) return { error: 'Elección no válida.' };
    if (state.choices[playerId]) return { error: 'Ya has elegido.' };

    state.reveal = null;
    state.choices[playerId] = action.choice;

    const ids = Object.keys(state.scores);
    if (ids.every((id) => state.choices[id])) {
      const [a, b] = ids;
      const ca = state.choices[a];
      const cb = state.choices[b];
      let roundWinner = null;
      if (ca !== cb) roundWinner = BEATS[ca] === cb ? a : b;
      if (roundWinner) state.scores[roundWinner] += 1;

      state.reveal = { choices: { ...state.choices }, roundWinner };
      state.choices = {};

      if (state.scores[a] >= TARGET || state.scores[b] >= TARGET) {
        state.status = 'finished';
        state.winner = state.scores[a] >= TARGET ? a : b;
      } else {
        state.round += 1;
      }
    }
    return { state };
  },

  // Oculta la elección del rival hasta que ambos elijan.
  view(state, playerId) {
    const waiting = {};
    for (const id of Object.keys(state.scores)) {
      waiting[id] = !!state.choices[id];
    }
    return {
      scores: state.scores,
      round: state.round,
      myChoice: state.choices[playerId] || null,
      chosen: waiting,
      reveal: state.reveal,
      status: state.status,
      winner: state.winner,
      target: TARGET,
    };
  },

  bots(state, botIds) {
    if (state.status !== 'playing') return [];
    if (state.reveal) return [];
    const options = Object.keys(BEATS);
    const counter = { piedra: 'papel', papel: 'tijera', tijera: 'piedra' };
    for (const id of Object.keys(state.scores)) {
      if (botIds.has(id) && !state.choices[id]) {
        let choice = options[Math.floor(Math.random() * options.length)];
        if (state.reveal?.choices) {
          const opp = Object.keys(state.scores).find((x) => x !== id);
          const last = state.reveal.choices[opp];
          if (last && counter[last]) choice = counter[last];
        }
        return [{ playerId: id, action: { type: 'choose', choice } }];
      }
    }
    return [];
  },
};
