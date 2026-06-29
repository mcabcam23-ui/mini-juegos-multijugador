// Reversi / Othello — 2 jugadores
const SIZE = 8;
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function opponent(id, state) {
  return state.order.find((x) => x !== id);
}

function collectFlips(board, r, c, player, opp) {
  if (board[r][c] !== null) return null;
  const flips = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc) && board[nr][nc] === opp) {
      line.push([nr, nc]);
      nr += dr;
      nc += dc;
    }
    if (line.length && inBounds(nr, nc) && board[nr][nc] === player) flips.push(...line);
  }
  return flips.length ? flips : null;
}

function legalMoves(board, player, opp) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const flips = collectFlips(board, r, c, player, opp);
      if (flips) moves.push({ r, c, flips });
    }
  }
  return moves;
}

function countDiscs(board) {
  let a = 0;
  let b = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === 'B') a++;
      else if (cell === 'W') b++;
    }
  }
  return { B: a, W: b };
}

function cornerScore(r, c) {
  if ((r === 0 || r === SIZE - 1) && (c === 0 || c === SIZE - 1)) return 100;
  if (r === 0 || r === SIZE - 1 || c === 0 || c === SIZE - 1) return 8;
  return 1;
}

export default {
  meta: {
    id: 'reversi',
    name: 'Reversi',
    emoji: '⚫',
    tagline: 'Convierte fichas del rival',
    description: 'Coloca fichas para encerrar las del oponente y voltearlas. Gana quien tenga más al final.',
    minPlayers: 2,
    maxPlayers: 2,
    gradient: 'linear-gradient(135deg, #1e293b, #059669)',
  },

  init(players) {
    const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    board[3][3] = 'W';
    board[3][4] = 'B';
    board[4][3] = 'B';
    board[4][4] = 'W';
    const state = {
      board,
      colors: { [players[0].id]: 'B', [players[1].id]: 'W' },
      order: players.map((p) => p.id),
      turn: players[0].id,
      status: 'playing',
      winner: null,
      passes: 0,
      lastMove: null,
      valid: [],
    };
    return refresh(state);
  },

  action(state, playerId, action) {
    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };
    if (action.type === 'pass') {
      if (state.turn !== playerId) return { error: 'No es tu turno.' };
      if (state.valid.length) return { error: 'Tienes jugadas disponibles.' };
      state.passes += 1;
      state.lastMove = { pass: true, by: playerId };
      const idx = state.order.indexOf(playerId);
      state.turn = state.order[(idx + 1) % state.order.length];
      return { state: refresh(state) };
    }
    if (action.type !== 'place') return { error: 'Acción no válida.' };
    if (state.turn !== playerId) return { error: 'No es tu turno.' };

    const { r, c } = action;
    if (!inBounds(r, c)) return { error: 'Casilla no válida.' };
    const opp = opponent(playerId, state);
    const flips = collectFlips(state.board, r, c, state.colors[playerId], state.colors[opp]);
    if (!flips) return { error: 'Jugada ilegal.' };

    state.board[r][c] = state.colors[playerId];
    for (const [fr, fc] of flips) state.board[fr][fc] = state.colors[playerId];
    state.lastMove = { r, c, flips: flips.length, by: playerId };
    state.passes = 0;
    const idx = state.order.indexOf(playerId);
    state.turn = state.order[(idx + 1) % state.order.length];
    return { state: refresh(state) };
  },

  view(state) {
    return {
      board: state.board,
      colors: state.colors,
      turn: state.turn,
      status: state.status,
      winner: state.winner,
      lastMove: state.lastMove,
      valid: state.valid,
      counts: countDiscs(state.board),
    };
  },

  bots(state, botIds) {
    if (state.status !== 'playing' || !botIds.has(state.turn)) return [];
    const me = state.turn;
    if (!state.valid.length) return [{ playerId: me, action: { type: 'pass' } }];
    let best = state.valid[0];
    let bestScore = -Infinity;
    for (const m of state.valid) {
      let score = m.flips.length * 2 + cornerScore(m.r, m.c);
      if (m.r === 0 || m.r === SIZE - 1) {
        if (m.c === 1 || m.c === SIZE - 2) score -= 15;
      }
      if (m.c === 0 || m.c === SIZE - 1) {
        if (m.r === 1 || m.r === SIZE - 2) score -= 15;
      }
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return [{ playerId: me, action: { type: 'place', r: best.r, c: best.c } }];
  },
};

function refresh(state) {
  const opp = opponent(state.turn, state);
  state.valid = legalMoves(state.board, state.colors[state.turn], state.colors[opp]).map(({ r, c, flips }) => ({ r, c, flips: flips.length }));
  if (!state.valid.length) {
    const oppMoves = legalMoves(state.board, state.colors[opp], state.colors[state.turn]);
    if (!oppMoves.length) {
      state.status = 'finished';
      const counts = countDiscs(state.board);
      const b = state.order[0];
      const w = state.order[1];
      const cb = counts[state.colors[b]];
      const cw = counts[state.colors[w]];
      if (cb === cw) state.winner = null;
      else state.winner = cb > cw ? b : w;
    } else {
      state.passes += 1;
      if (state.passes >= 2) {
        state.status = 'finished';
        const counts = countDiscs(state.board);
        const b = state.order[0];
        const w = state.order[1];
        const cb = counts[state.colors[b]];
        const cw = counts[state.colors[w]];
        if (cb === cw) state.winner = null;
        else state.winner = cb > cw ? b : w;
      }
    }
  }
  return state;
}
