// Código Secreto (Mastermind) — 2 jugadores, carrera por adivinar
const COLORS = ['red', 'green', 'blue', 'yellow', 'purple', 'orange'];
const CODE_LEN = 4;
const MAX_GUESSES = 10;

function randomCode() {
  return Array.from({ length: CODE_LEN }, () => COLORS[Math.floor(Math.random() * COLORS.length)]);
}

function feedback(code, guess) {
  const exact = new Array(CODE_LEN).fill(false);
  const gUsed = new Array(CODE_LEN).fill(false);
  const cUsed = new Array(CODE_LEN).fill(false);
  let black = 0;
  for (let i = 0; i < CODE_LEN; i++) {
    if (guess[i] === code[i]) {
      black++;
      exact[i] = true;
      gUsed[i] = true;
      cUsed[i] = true;
    }
  }
  let white = 0;
  for (let i = 0; i < CODE_LEN; i++) {
    if (gUsed[i]) continue;
    for (let j = 0; j < CODE_LEN; j++) {
      if (cUsed[j] || guess[i] !== code[j]) continue;
      white++;
      cUsed[j] = true;
      break;
    }
  }
  return { black, white, exact };
}

export default {
  meta: {
    id: 'mastermind',
    name: 'Código Secreto',
    emoji: '🔐',
    tagline: 'Descifra la combinación',
    description: 'Adivina la combinación de 4 colores en 10 intentos. Negro = acierto exacto, blanco = color correcto en otra posición.',
    minPlayers: 2,
    maxPlayers: 2,
    gradient: 'linear-gradient(135deg, #6366f1, #ec4899)',
  },

  init(players) {
    const secret = randomCode();
    const guesses = {};
    for (const p of players) guesses[p.id] = [];
    return {
      secret,
      guesses,
      order: players.map((p) => p.id),
      turn: players[0].id,
      status: 'playing',
      winner: null,
      lastResult: null,
      maxGuesses: MAX_GUESSES,
    };
  },

  action(state, playerId, action) {
    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };
    if (action.type !== 'guess') return { error: 'Acción no válida.' };
    if (state.turn !== playerId) return { error: 'No es tu turno.' };
    if (state.guesses[playerId].length >= MAX_GUESSES) return { error: 'Sin intentos restantes.' };

    const guess = action.colors;
    if (!Array.isArray(guess) || guess.length !== CODE_LEN) return { error: 'Combinación inválida.' };
    if (guess.some((c) => !COLORS.includes(c))) return { error: 'Color no válido.' };

    const fb = feedback(state.secret, guess);
    state.guesses[playerId].push({ colors: [...guess], ...fb });
    state.lastResult = { by: playerId, guess: [...guess], ...fb };

    if (fb.black === CODE_LEN) {
      state.status = 'finished';
      state.winner = playerId;
      return { state };
    }

    const allFull = state.order.every((id) => state.guesses[id].length >= MAX_GUESSES);
    if (allFull) {
      state.status = 'finished';
      let best = -1;
      let winner = null;
      let tie = false;
      for (const id of state.order) {
        const last = state.guesses[id][state.guesses[id].length - 1];
        const score = last ? last.black * 10 + last.white : 0;
        if (score > best) {
          best = score;
          winner = id;
          tie = false;
        } else if (score === best) tie = true;
      }
      state.winner = tie ? null : winner;
      return { state };
    }

    const idx = state.order.indexOf(playerId);
    state.turn = state.order[(idx + 1) % state.order.length];
    return { state };
  },

  view(state, playerId) {
    return {
      guesses: state.guesses[playerId] || [],
      oppGuessCount: state.guesses[state.order.find((id) => id !== playerId)]?.length || 0,
      turn: state.turn,
      status: state.status,
      winner: state.winner,
      lastResult: state.lastResult,
      maxGuesses: state.maxGuesses,
      colors: COLORS,
      codeLen: CODE_LEN,
      secret: state.status === 'finished' ? state.secret : null,
    };
  },

  bots(state, botIds) {
    if (state.status !== 'playing' || !botIds.has(state.turn)) return [];
    const me = state.turn;
    const history = state.guesses[me];
    const pool = [...COLORS];
    let guess;
    if (!history.length) {
      guess = pool.slice(0, CODE_LEN);
    } else {
      const last = history[history.length - 1];
      guess = [...last.colors];
      if (last.black < CODE_LEN) {
        const i = Math.floor(Math.random() * CODE_LEN);
        guess[i] = pool[(pool.indexOf(guess[i]) + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length];
      }
    }
    return [{ playerId: me, action: { type: 'guess', colors: guess } }];
  },
};
