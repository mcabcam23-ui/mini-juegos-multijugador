// Tres en Raya (Tic Tac Toe) - 2 jugadores
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export default {
  meta: {
    id: 'tictactoe',
    name: 'Tres en Raya',
    emoji: '⭕',
    tagline: 'El clásico de toda la vida',
    description: 'Consigue tres símbolos en línea (horizontal, vertical o diagonal) antes que tu rival.',
    minPlayers: 2,
    maxPlayers: 2,
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  },

  init(players) {
    return {
      board: Array(9).fill(null),
      marks: { [players[0].id]: 'X', [players[1].id]: 'O' },
      turn: players[0].id,
      status: 'playing',
      winner: null,
      winningLine: null,
    };
  },

  action(state, playerId, action) {
    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };
    if (action.type !== 'place') return { error: 'Acción no válida.' };
    if (state.turn !== playerId) return { error: 'No es tu turno.' };

    const i = action.index;
    if (typeof i !== 'number' || i < 0 || i > 8) return { error: 'Casilla no válida.' };
    if (state.board[i] !== null) return { error: 'Casilla ocupada.' };

    const mark = state.marks[playerId];
    state.board[i] = mark;

    for (const line of WIN_LINES) {
      const [a, b, c] = line;
      if (state.board[a] && state.board[a] === state.board[b] && state.board[a] === state.board[c]) {
        state.status = 'finished';
        state.winner = playerId;
        state.winningLine = line;
        return { state };
      }
    }

    if (state.board.every((cell) => cell !== null)) {
      state.status = 'finished';
      state.winner = null; // empate
      return { state };
    }

    const ids = Object.keys(state.marks);
    state.turn = ids.find((id) => id !== playerId);
    return { state };
  },

  view(state) {
    return state;
  },

  bots(state, botIds) {
    if (state.status !== 'playing' || !botIds.has(state.turn)) return [];
    const me = state.turn;
    const opp = Object.keys(state.marks).find((id) => id !== me);
    const myMark = state.marks[me];
    const oppMark = state.marks[opp];
    const b = state.board;
    const tryWin = (mark) => {
      for (const [a, c, d] of WIN_LINES) {
        const line = [a, c, d];
        const marks = line.map((i) => b[i]);
        const empties = line.filter((i) => b[i] === null);
        if (empties.length === 1 && marks.filter((m) => m === mark).length === 2) return empties[0];
      }
      return -1;
    };
    let idx = tryWin(myMark);
    if (idx < 0) idx = tryWin(oppMark);
    if (idx < 0 && b[4] === null) idx = 4;
    if (idx < 0) {
      const prefs = [0, 2, 6, 8, 1, 3, 5, 7].filter((i) => b[i] === null);
      idx = prefs.length ? prefs[Math.floor(Math.random() * prefs.length)] : b.findIndex((c) => c === null);
    }
    return [{ playerId: me, action: { type: 'place', index: idx } }];
  },
};
