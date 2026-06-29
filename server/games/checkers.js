// Damas - 2 jugadores (reglas inglesas: captura obligatoria, multi-salto, damas)
const N = 8;

function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
function clone(board) { return board.map((row) => row.map((cell) => (cell ? { ...cell } : null))); }

function dirsFor(piece, forward) {
  // forward: +1 o -1 (sentido de avance de los peones)
  if (piece.k) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  return [[forward, 1], [forward, -1]];
}

function capturesForPiece(board, r, c, forward) {
  const piece = board[r][c];
  const res = [];
  for (const [dr, dc] of dirsFor(piece, forward)) {
    const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
    if (inB(tr, tc) && board[tr][tc] === null && board[mr] && board[mr][mc] && board[mr][mc].p !== piece.p) {
      res.push({ to: { r: tr, c: tc }, cap: { r: mr, c: mc } });
    }
  }
  return res;
}

function simpleMovesForPiece(board, r, c, forward) {
  const piece = board[r][c];
  const res = [];
  for (const [dr, dc] of dirsFor(piece, forward)) {
    const tr = r + dr, tc = c + dc;
    if (inB(tr, tc) && board[tr][tc] === null) res.push({ to: { r: tr, c: tc } });
  }
  return res;
}

function playerPieces(board, pid) {
  const list = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (board[r][c] && board[r][c].p === pid) list.push({ r, c });
  return list;
}

function playerHasCapture(board, pid, forward) {
  return playerPieces(board, pid).some(({ r, c }) => capturesForPiece(board, r, c, forward).length > 0);
}

function playerHasAnyMove(board, pid, forward) {
  return playerPieces(board, pid).some(({ r, c }) =>
    capturesForPiece(board, r, c, forward).length > 0 || simpleMovesForPiece(board, r, c, forward).length > 0);
}

export default {
  meta: {
    id: 'checkers',
    name: 'Damas',
    emoji: '⚪',
    tagline: 'Captura todas las fichas',
    description: 'Mueve en diagonal y come las fichas del rival saltando sobre ellas. La captura es obligatoria y encadenas saltos. Llega al fondo para coronar una dama.',
    minPlayers: 2,
    maxPlayers: 2,
    gradient: 'linear-gradient(135deg, #475569, #0f172a)',
  },

  init(players) {
    const a = players[0].id, b = players[1].id;
    const board = Array.from({ length: N }, () => Array(N).fill(null));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if ((r + c) % 2 === 1) {
          if (r < 3) board[r][c] = { p: a, k: false };
          else if (r > 4) board[r][c] = { p: b, k: false };
        }
      }
    }
    return {
      board,
      turn: a,
      dir: { [a]: 1, [b]: -1 },     // a avanza hacia abajo, b hacia arriba
      promoteRow: { [a]: N - 1, [b]: 0 },
      order: [a, b],
      mustContinue: null,           // {r,c} de la pieza que debe seguir capturando
      captured: { [a]: 0, [b]: 0 },
      lastMove: null,
      status: 'playing',
      winner: null,
    };
  },

  action(state, playerId, action) {
    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };
    if (action.type !== 'move') return { error: 'Acción no válida.' };
    if (state.turn !== playerId) return { error: 'No es tu turno.' };

    const { from, to } = action;
    if (!from || !to || !inB(from.r, from.c) || !inB(to.r, to.c)) return { error: 'Movimiento no válido.' };
    const piece = state.board[from.r][from.c];
    if (!piece || piece.p !== playerId) return { error: 'Esa no es tu ficha.' };
    if (state.mustContinue && (state.mustContinue.r !== from.r || state.mustContinue.c !== from.c)) {
      return { error: 'Debes seguir capturando con la misma ficha.' };
    }

    const forward = state.dir[playerId];
    const dr = to.r - from.r, dc = to.c - from.c;
    if (Math.abs(dr) !== Math.abs(dc) || (Math.abs(dr) !== 1 && Math.abs(dr) !== 2)) {
      return { error: 'Mueve en diagonal.' };
    }

    const mustCapture = playerHasCapture(state.board, playerId, forward);

    if (Math.abs(dr) === 1) {
      // Movimiento simple
      if (mustCapture) return { error: 'Hay captura obligatoria.' };
      if (state.mustContinue) return { error: 'Debes capturar.' };
      const moves = simpleMovesForPiece(state.board, from.r, from.c, forward);
      if (!moves.some((m) => m.to.r === to.r && m.to.c === to.c)) return { error: 'Movimiento no permitido.' };
      state.board[to.r][to.c] = piece;
      state.board[from.r][from.c] = null;
      promote(state, to, piece);
      state.lastMove = { from, to, capture: false };
      endTurn(state, playerId);
      return { state };
    }

    // Captura
    const caps = capturesForPiece(state.board, from.r, from.c, forward);
    const cap = caps.find((m) => m.to.r === to.r && m.to.c === to.c);
    if (!cap) return { error: 'Captura no válida.' };
    state.board[to.r][to.c] = piece;
    state.board[from.r][from.c] = null;
    state.board[cap.cap.r][cap.cap.c] = null;
    state.captured[playerId] += 1;
    state.lastMove = { from, to, capture: true, captured: cap.cap };

    const wasKing = piece.k;
    promote(state, to, piece);
    const promotedNow = !wasKing && piece.k;

    // ¿Puede seguir capturando? (salvo que acabe de coronar)
    const more = !promotedNow && capturesForPiece(state.board, to.r, to.c, forward).length > 0;
    if (more) {
      state.mustContinue = { r: to.r, c: to.c };
      return { state }; // mismo jugador continúa
    }
    state.mustContinue = null;
    endTurn(state, playerId);
    return { state };
  },

  view(state) {
    const counts = {};
    for (const id of state.order) counts[id] = playerPieces(state.board, id).length;
    return { ...state, counts };
  },

  bots(state, botIds) {
    if (state.status !== 'playing' || !botIds.has(state.turn)) return [];
    const me = state.turn;
    const forward = state.dir[me];
    const board = state.board;

    let froms;
    if (state.mustContinue) froms = [{ r: state.mustContinue.r, c: state.mustContinue.c }];
    else froms = playerPieces(board, me);

    const mustCapture = state.mustContinue || playerHasCapture(board, me, forward);
    const moves = [];
    for (const { r, c } of froms) {
      const caps = capturesForPiece(board, r, c, forward);
      if (caps.length) caps.forEach((m) => moves.push({ from: { r, c }, to: m.to, cap: true }));
      else if (!mustCapture) simpleMovesForPiece(board, r, c, forward).forEach((m) => moves.push({ from: { r, c }, to: m.to, cap: false }));
    }
    const pool = mustCapture ? moves.filter((m) => m.cap) : moves;
    const chosen = (pool.length ? pool : moves)[Math.floor(Math.random() * (pool.length ? pool.length : moves.length))];
    if (!chosen) return [];
    return [{ playerId: me, action: { type: 'move', from: chosen.from, to: chosen.to } }];
  },
};

function promote(state, pos, piece) {
  if (!piece.k && pos.r === state.promoteRow[piece.p]) piece.k = true;
}

function endTurn(state, playerId) {
  const opp = state.order.find((id) => id !== playerId);
  state.turn = opp;
  const oppForward = state.dir[opp];
  if (playerPieces(state.board, opp).length === 0 || !playerHasAnyMove(state.board, opp, oppForward)) {
    state.status = 'finished';
    state.winner = playerId;
  }
}
