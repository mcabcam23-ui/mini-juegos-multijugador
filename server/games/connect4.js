// Conecta 4 - 2 jugadores
const ROWS = 6;
const COLS = 7;

function checkWin(board, row, col, player) {
  const dirs = [
    [[0, 1], [0, -1]],   // horizontal
    [[1, 0], [-1, 0]],   // vertical
    [[1, 1], [-1, -1]],  // diagonal \
    [[1, -1], [-1, 1]],  // diagonal /
  ];
  for (const pair of dirs) {
    const cells = [[row, col]];
    for (const [dr, dc] of pair) {
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        cells.push([r, c]);
        r += dr;
        c += dc;
      }
    }
    if (cells.length >= 4) return cells.slice(0, 4).concat(cells.slice(4));
  }
  return null;
}

export default {
  meta: {
    id: 'connect4',
    name: 'Conecta 4',
    emoji: '🔴',
    tagline: 'Alinea cuatro fichas',
    description: 'Deja caer tus fichas y consigue cuatro en línea antes que tu oponente. ¡Bloquea sus jugadas!',
    minPlayers: 2,
    maxPlayers: 2,
    gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)',
  },

  init(players) {
    return {
      board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
      colors: { [players[0].id]: 'red', [players[1].id]: 'yellow' },
      turn: players[0].id,
      status: 'playing',
      winner: null,
      winningCells: null,
      lastDrop: null,
    };
  },

  action(state, playerId, action) {
    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };
    if (action.type !== 'drop') return { error: 'Acción no válida.' };
    if (state.turn !== playerId) return { error: 'No es tu turno.' };

    const col = action.col;
    if (typeof col !== 'number' || col < 0 || col >= COLS) return { error: 'Columna no válida.' };

    let placedRow = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (state.board[r][col] === null) {
        state.board[r][col] = playerId;
        placedRow = r;
        break;
      }
    }
    if (placedRow === -1) return { error: 'Columna llena.' };

    state.lastDrop = { row: placedRow, col };

    const win = checkWin(state.board, placedRow, col, playerId);
    if (win) {
      state.status = 'finished';
      state.winner = playerId;
      state.winningCells = win;
      return { state };
    }

    if (state.board.every((row) => row.every((cell) => cell !== null))) {
      state.status = 'finished';
      state.winner = null;
      return { state };
    }

    const ids = Object.keys(state.colors);
    state.turn = ids.find((id) => id !== playerId);
    return { state };
  },

  view(state) {
    return state;
  },

  bots(state, botIds) {
    if (state.status !== 'playing' || !botIds.has(state.turn)) return [];
    const me = state.turn;
    const opp = Object.keys(state.colors).find((id) => id !== me);

    const landingRow = (board, col) => {
      for (let r = ROWS - 1; r >= 0; r--) if (board[r][col] === null) return r;
      return -1;
    };
    const validCols = [];
    for (let c = 0; c < COLS; c++) if (state.board[0][c] === null) validCols.push(c);

    const winningCol = (player) => {
      for (const c of validCols) {
        const r = landingRow(state.board, c);
        state.board[r][c] = player;
        const win = checkWin(state.board, r, c, player);
        state.board[r][c] = null;
        if (win) return c;
      }
      return -1;
    };

    let col = winningCol(me);
    if (col < 0) col = winningCol(opp);
    if (col < 0) {
      const order = [3, 2, 4, 1, 5, 0, 6].filter((c) => validCols.includes(c));
      // Evita dar la victoria al rival en la siguiente jugada
      const safe = order.filter((c) => {
        const r = landingRow(state.board, c);
        state.board[r][c] = me;
        const above = r - 1;
        let gives = false;
        if (above >= 0) {
          state.board[above][c] = opp;
          if (checkWin(state.board, above, c, opp)) gives = true;
          state.board[above][c] = null;
        }
        state.board[r][c] = null;
        return !gives;
      });
      const pool = safe.length ? safe : order;
      col = pool[0];
    }
    if (col === undefined || col < 0) col = validCols[0];
    return [{ playerId: me, action: { type: 'drop', col } }];
  },
};
