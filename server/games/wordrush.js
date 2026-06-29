// Word Rush — carrera Wordle multijugador (2–4)
import { randomWord } from './data/words.js';

const MAX_GUESSES = 6;
const WORD_LEN = 5;

function normalize(w) {
  return w.toUpperCase().replace(/[^A-Z]/g, '');
}

function feedback(secret, guess) {
  const s = normalize(secret).padEnd(WORD_LEN, 'X').slice(0, WORD_LEN);
  const g = normalize(guess).padEnd(WORD_LEN, 'X').slice(0, WORD_LEN);
  const result = Array(WORD_LEN).fill('absent');
  const sCounts = {};
  for (let i = 0; i < WORD_LEN; i++) {
    if (g[i] === s[i]) {
      result[i] = 'correct';
    } else {
      sCounts[s[i]] = (sCounts[s[i]] || 0) + 1;
    }
  }
  for (let i = 0; i < WORD_LEN; i++) {
    if (result[i] === 'correct') continue;
    const ch = g[i];
    if (sCounts[ch] > 0) {
      result[i] = 'present';
      sCounts[ch]--;
    }
  }
  return result;
}

function pickWord() {
  for (let t = 0; t < 40; t++) {
    const { word } = randomWord();
    const w = normalize(word);
    if (w.length === WORD_LEN) return w;
  }
  return 'MUNDO';
}

export default {
  meta: {
    id: 'wordrush',
    name: 'Word Rush',
    emoji: '📝',
    tagline: 'Wordle en carrera',
    description: 'Adivina la palabra de 5 letras antes que tus rivales. Verde = acierto, amarillo = letra en otra posición.',
    minPlayers: 2,
    maxPlayers: 4,
    gradient: 'linear-gradient(135deg, #22c55e, #16a34a)',
  },

  init(players) {
    const guesses = {};
    for (const p of players) guesses[p.id] = [];
    return {
      secret: pickWord(),
      guesses,
      order: players.map((p) => p.id),
      turn: players[0].id,
      status: 'playing',
      winner: null,
      lastGuess: null,
      maxGuesses: MAX_GUESSES,
    };
  },

  action(state, playerId, action) {
    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };
    if (action.type !== 'guess') return { error: 'Acción no válida.' };
    if (state.turn !== playerId) return { error: 'No es tu turno.' };
    if (state.guesses[playerId].length >= MAX_GUESSES) return { error: 'Sin intentos.' };

    const word = normalize(action.word || '');
    if (word.length !== WORD_LEN) return { error: 'La palabra debe tener 5 letras.' };

    const fb = feedback(state.secret, word);
    state.guesses[playerId].push({ word, feedback: fb });
    state.lastGuess = { by: playerId, word, feedback: fb };

    if (fb.every((x) => x === 'correct')) {
      state.status = 'finished';
      state.winner = playerId;
      return { state };
    }

    const allDone = state.order.every((id) => state.guesses[id].length >= MAX_GUESSES);
    if (allDone) {
      state.status = 'finished';
      let best = -1;
      let winner = null;
      let tie = false;
      for (const id of state.order) {
        const gs = state.guesses[id];
        let score = 0;
        for (const g of gs) score += g.feedback.filter((x) => x === 'correct').length;
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
    const mine = state.guesses[playerId] || [];
    const others = {};
    for (const id of state.order) {
      if (id === playerId) continue;
      others[id] = (state.guesses[id] || []).length;
    }
    return {
      myGuesses: mine,
      others,
      turn: state.turn,
      status: state.status,
      winner: state.winner,
      lastGuess: state.lastGuess,
      maxGuesses: state.maxGuesses,
      secret: state.status === 'finished' ? state.secret : null,
    };
  },

  bots(state, botIds) {
    if (state.status !== 'playing' || !botIds.has(state.turn)) return [];
    const me = state.turn;
    const secret = state.secret;
    const known = state.guesses[me];
    const letters = 'AEIOURSTLNCPMDG'.split('');
    let word = '';
    for (let i = 0; i < WORD_LEN; i++) {
      if (known.length && known[known.length - 1].feedback[i] === 'correct') {
        word += known[known.length - 1].word[i];
      } else {
        word += letters[Math.floor(Math.random() * letters.length)];
      }
    }
    if (Math.random() < 0.08) word = secret;
    return [{ playerId: me, action: { type: 'guess', word } }];
  },
};
