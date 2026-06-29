// Ahorcado - 2 a 6 jugadores por turnos
import { randomWord } from './data/words.js';

const MAX_WRONG = 7;
const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

function topScorer(scores, order) {
  let best = -1, winner = null, tie = false;
  for (const id of order) {
    if (scores[id] > best) { best = scores[id]; winner = id; tie = false; }
    else if (scores[id] === best) tie = true;
  }
  return tie ? null : winner;
}

export default {
  meta: {
    id: 'hangman',
    name: 'Ahorcado',
    emoji: '🔤',
    tagline: 'Adivina la palabra por turnos',
    description: 'Por turnos, decid una letra. Acertar suma puntos y repite turno; fallar dibuja el ahorcado. ¡Completad la palabra antes de quedaros sin intentos!',
    minPlayers: 2,
    maxPlayers: 6,
    gradient: 'linear-gradient(135deg, #f97316, #db2777)',
  },

  init(players) {
    const { word, category } = randomWord();
    const scores = {};
    for (const p of players) scores[p.id] = 0;
    return {
      word,
      category,
      guessed: [],
      wrong: [],
      maxWrong: MAX_WRONG,
      order: players.map((p) => p.id),
      turn: players[0].id,
      scores,
      lastResult: null,
      status: 'playing',
      winner: null,
    };
  },

  action(state, playerId, action) {
    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };
    if (action.type !== 'guess') return { error: 'Acción no válida.' };
    if (state.turn !== playerId) return { error: 'No es tu turno.' };
    const letter = (action.letter || '').toUpperCase();
    if (letter.length !== 1 || !ALPHABET.includes(letter)) return { error: 'Letra no válida.' };
    if (state.guessed.includes(letter) || state.wrong.includes(letter)) return { error: 'Esa letra ya se ha dicho.' };

    const order = state.order;
    const idx = order.indexOf(playerId);

    if (state.word.includes(letter)) {
      state.guessed.push(letter);
      const count = state.word.split('').filter((ch) => ch === letter).length;
      state.scores[playerId] += count;
      state.lastResult = { by: playerId, letter, hit: true, count };

      const revealed = state.word.split('').every((ch) => !ALPHABET.includes(ch) || state.guessed.includes(ch));
      if (revealed) {
        state.status = 'finished';
        state.winner = topScorer(state.scores, order);
      }
      // Acierto: repite turno
      return { state };
    }

    state.wrong.push(letter);
    state.lastResult = { by: playerId, letter, hit: false };
    if (state.wrong.length >= state.maxWrong) {
      state.status = 'finished';
      state.winner = topScorer(state.scores, order);
      state.revealWord = true;
      return { state };
    }
    // Fallo: pasa turno
    state.turn = order[(idx + 1) % order.length];
    return { state };
  },

  view(state) {
    const finished = state.status === 'finished';
    const mask = state.word.split('').map((ch) => {
      if (!ALPHABET.includes(ch)) return ch;
      return state.guessed.includes(ch) || finished ? ch : null;
    });
    return {
      mask,
      category: state.category,
      guessed: state.guessed,
      wrong: state.wrong,
      maxWrong: state.maxWrong,
      turn: state.turn,
      scores: state.scores,
      order: state.order,
      lastResult: state.lastResult,
      status: state.status,
      winner: state.winner,
      word: finished ? state.word : null,
    };
  },

  bots(state, botIds) {
    if (state.status !== 'playing' || !botIds.has(state.turn)) return [];
    const freq = 'EAOSRNIDLCTUMPBGVYQHFZJÑXKW'.split('');
    const used = new Set([...state.guessed, ...state.wrong]);
    let letter = freq.find((l) => !used.has(l));
    if (!letter) letter = ALPHABET.split('').find((l) => !used.has(l));
    if (!letter) return [];
    return [{ playerId: state.turn, action: { type: 'guess', letter } }];
  },
};
