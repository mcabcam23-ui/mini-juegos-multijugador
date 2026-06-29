// Trivia - dado temático, cultura general y cuenta atrás sincronizada
import { pickQuestionByCategories } from './data/questions.js';

const QUESTION_COUNT = 8;
const QUESTION_MS = 20000;
const DICE_MS = 3200;
const THEME_MS = 2400;
const REVEAL_MS = 5000;

/** Seis caras: 5 temáticas + cultura general (cualquier categoría). */
export const DICE_FACES = [
  { label: 'Geografía', icon: '🌍', categories: ['Geografía'] },
  { label: 'Historia', icon: '📜', categories: ['Historia'] },
  { label: 'Ciencia', icon: '🔬', categories: ['Ciencia', 'Astronomía', 'Naturaleza', 'Matemáticas'] },
  { label: 'Deporte', icon: '⚽', categories: ['Deporte'] },
  { label: 'Arte & Cine', icon: '🎨', categories: ['Arte', 'Cine', 'Música'] },
  { label: 'Cultura general', icon: '🎲', categories: null },
];

function rollDice() {
  return Math.floor(Math.random() * DICE_FACES.length);
}

function topScorer(scores, order) {
  let best = -1;
  let winner = null;
  let tie = false;
  for (const id of order) {
    if (scores[id] > best) {
      best = scores[id];
      winner = id;
      tie = false;
    } else if (scores[id] === best) tie = true;
  }
  return tie ? null : winner;
}

function startDiceRound(state) {
  state.diceIndex = rollDice();
  state.diceFace = DICE_FACES[state.diceIndex];
  state.phase = 'dice';
  state.diceStartedAt = Date.now();
  state.diceEndsAt = Date.now() + DICE_MS;
  state.answers = {};
  state.answerOrder = [];
  state.lastReveal = null;
  state.currentQuestion = null;
  state.questionDeadline = null;
  state.themeStartedAt = null;
  state.themeEndsAt = null;
}

function reveal(state) {
  const q = state.currentQuestion;
  if (!q) return { state };

  const correctInOrder = state.answerOrder.filter((id) => state.answers[id] === q.a);
  const gained = {};
  correctInOrder.forEach((id, rank) => {
    const bonus = Math.max(0, 50 - rank * 10);
    const pts = 100 + bonus;
    state.scores[id] += pts;
    gained[id] = pts;
  });

  state.phase = 'reveal';
  state.lastReveal = { correct: q.a, answers: { ...state.answers }, gained };
  return { state, delayedAction: { type: '_next', delayMs: REVEAL_MS } };
}

export default {
  meta: {
    id: 'trivia',
    name: 'Trivia',
    emoji: '❓',
    tagline: 'Dado temático y cuenta atrás',
    description: 'Tira el dado para elegir la temática. Si sale cultura general, ¡pregunta de cualquier tema! Responde antes de que acabe la cuenta atrás.',
    minPlayers: 2,
    maxPlayers: 8,
    gradient: 'linear-gradient(135deg, #8b5cf6, #d946ef)',
  },

  init(players) {
    const scores = {};
    for (const p of players) scores[p.id] = 0;
    const state = {
      index: 0,
      total: QUESTION_COUNT,
      phase: 'dice',
      diceIndex: 0,
      diceFace: null,
      diceStartedAt: null,
      diceEndsAt: null,
      currentQuestion: null,
      usedQuestionKeys: [],
      answers: {},
      answerOrder: [],
      lastReveal: null,
      order: players.map((p) => p.id),
      scores,
      timeLimit: Math.floor(QUESTION_MS / 1000),
      questionDeadline: null,
      roundId: 0,
      status: 'playing',
      winner: null,
    };
    startDiceRound(state);
    return {
      state,
      delayedAction: { type: '_showTheme', delayMs: DICE_MS },
    };
  },

  action(state, playerId, action) {
    if (action.type === '_showTheme') {
      if (state.status !== 'playing' || state.phase !== 'dice') return { state };
      state.phase = 'theme';
      state.themeStartedAt = Date.now();
      state.themeEndsAt = Date.now() + THEME_MS;
      return {
        state,
        delayedAction: { type: '_startQuestion', delayMs: THEME_MS },
      };
    }

    if (action.type === '_startQuestion') {
      if (state.status !== 'playing' || state.phase !== 'theme') return { state };
      const face = state.diceFace || DICE_FACES[state.diceIndex];
      const q = pickQuestionByCategories(face.categories, state.usedQuestionKeys);
      state.usedQuestionKeys.push(`${q.c}|${q.q}`);
      state.currentQuestion = q;
      state.phase = 'question';
      state.answers = {};
      state.answerOrder = [];
      state.roundId = (state.roundId || 0) + 1;
      state.questionDeadline = Date.now() + QUESTION_MS;
      return {
        state,
        delayedAction: { type: '_timeout', delayMs: QUESTION_MS, roundId: state.roundId },
      };
    }

    if (action.type === '_timeout') {
      if (state.status !== 'playing' || state.phase !== 'question') return { state };
      if (action.roundId !== undefined && action.roundId !== state.roundId) return { state };
      for (const id of state.order) {
        if (state.answers[id] === undefined) {
          state.answers[id] = -1;
          state.answerOrder.push(id);
        }
      }
      return reveal(state);
    }

    if (action.type === '_next') {
      if (state.phase !== 'reveal') return { state };
      if (state.index + 1 >= state.total) {
        state.status = 'finished';
        state.winner = topScorer(state.scores, state.order);
        state.phase = 'reveal';
        return { state };
      }
      state.index += 1;
      startDiceRound(state);
      return {
        state,
        delayedAction: { type: '_showTheme', delayMs: DICE_MS },
      };
    }

    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };

    if (action.type === 'skip') {
      if (state.phase !== 'question') return { error: 'Nada que saltar.' };
      for (const id of state.order) {
        if (state.answers[id] === undefined) {
          state.answers[id] = -1;
          state.answerOrder.push(id);
        }
      }
      return reveal(state);
    }

    if (action.type !== 'answer') return { error: 'Acción no válida.' };
    if (state.phase !== 'question') return { error: 'Espera a la siguiente pregunta.' };
    if (playerId && state.answers[playerId] !== undefined) return { error: 'Ya has respondido.' };

    const opt = action.option;
    state.answers[playerId] = typeof opt === 'number' && opt >= 0 && opt <= 3 ? opt : -1;
    state.answerOrder.push(playerId);

    if (state.order.every((id) => state.answers[id] !== undefined)) {
      return reveal(state);
    }
    return { state };
  },

  view(state, playerId) {
    const q = state.currentQuestion;
    const face = state.diceFace || (state.diceIndex != null ? DICE_FACES[state.diceIndex] : null);
    const base = {
      phase: state.phase,
      index: state.index,
      total: state.total,
      scores: state.scores,
      order: state.order,
      timeLimit: state.timeLimit,
      questionDeadline: state.questionDeadline,
      roundId: state.roundId,
      diceFaces: DICE_FACES.map((f) => ({ label: f.label, icon: f.icon })),
      diceIndex: state.diceIndex,
      diceFace: face ? { label: face.label, icon: face.icon } : null,
      diceStartedAt: state.diceStartedAt,
      diceEndsAt: state.diceEndsAt,
      themeStartedAt: state.themeStartedAt,
      themeEndsAt: state.themeEndsAt,
      diceMs: DICE_MS,
      themeMs: THEME_MS,
      status: state.status,
      winner: state.winner,
      answeredCount: Object.keys(state.answers).length,
      playerCount: state.order.length,
      myAnswer: state.answers[playerId],
    };

    if (state.phase === 'question' || state.phase === 'reveal' || state.status === 'finished') {
      if (q) {
        base.question = {
          c: state.diceFace?.label === 'Cultura general' ? `Cultura general · ${q.c}` : (state.diceFace?.label || q.c),
          q: q.q,
          o: q.o,
        };
      }
    }

    if (state.phase === 'reveal' || state.status === 'finished') {
      if (q) base.correct = q.a;
      base.reveal = state.lastReveal;
    }

    return base;
  },

  bots(state, botIds) {
    if (state.status !== 'playing' || state.phase !== 'question') return [];
    const q = state.currentQuestion;
    if (!q) return [];
    for (const id of state.order) {
      if (botIds.has(id) && state.answers[id] === undefined) {
        let option;
        if (Math.random() < 0.55) option = q.a;
        else {
          const wrong = [0, 1, 2, 3].filter((o) => o !== q.a);
          option = wrong[Math.floor(Math.random() * wrong.length)];
        }
        return [{ playerId: id, action: { type: 'answer', option } }];
      }
    }
    return [];
  },

  syncAfterLeave(state, leftPlayerId) {
    if (state.phase !== 'question') return { state };
    if (state.answers[leftPlayerId] !== undefined) return { state };
    state.answers[leftPlayerId] = -1;
    state.answerOrder.push(leftPlayerId);
    if (state.order.every((id) => state.answers[id] !== undefined)) {
      return reveal(state);
    }
    return { state };
  },
};
