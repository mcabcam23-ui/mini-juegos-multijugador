import { SFX } from '../sfx.js';
import { celebrate, inviteTurn, pop, sparks } from '../gameFx.js';

const N = 8;
let selected = null;
let liveGrid = null;
let liveWrap = null;
let lastCtx = null;
let prevLastMove = null;
let prevBoardState = null;
let prevStatus = null;
let pendingMove = false;

function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
function dirsFor(piece, forward) {
  if (piece.k) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  return [[forward, 1], [forward, -1]];
}
function capturesFor(board, r, c, forward) {
  const piece = board[r][c];
  if (!piece) return [];
  const res = [];
  for (const [dr, dc] of dirsFor(piece, forward)) {
    const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
    if (inB(tr, tc) && board[tr][tc] === null && board[mr]?.[mc] && board[mr][mc].p !== piece.p) {
      res.push({ r: tr, c: tc });
    }
  }
  return res;
}
function simpleFor(board, r, c, forward) {
  const piece = board[r][c];
  if (!piece) return [];
  const res = [];
  for (const [dr, dc] of dirsFor(piece, forward)) {
    const tr = r + dr, tc = c + dc;
    if (inB(tr, tc) && board[tr][tc] === null) res.push({ r: tr, c: tc });
  }
  return res;
}
function playerHasCapture(board, pid, forward) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (board[r][c]?.p === pid && capturesFor(board, r, c, forward).length) return true;
  }
  return false;
}
function legalDests(view, board, me, forward, from) {
  if (view.mustContinue) return capturesFor(board, from.r, from.c, forward);
  if (playerHasCapture(board, me, forward)) return capturesFor(board, from.r, from.c, forward);
  return simpleFor(board, from.r, from.c, forward);
}
function boardToDisplay(r, c, flip) {
  return flip ? { dr: N - 1 - r, dc: N - 1 - c } : { dr: r, dc: c };
}
function displayToBoard(dr, dc, flip) {
  return flip
    ? { r: N - 1 - dr, c: N - 1 - dc }
    : { r: dr, c: dc };
}

function patchHighlights(view, board, me, forward, flip) {
  if (!liveGrid) return;

  let dests = [];
  if (selected) dests = legalDests(view, board, me, forward, selected);

  const destSet = new Set(dests.map((d) => `${d.r},${d.c}`));
  const capPieces = new Set();
  if (view.turn === me && playerHasCapture(board, me, forward)) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (board[r][c]?.p === me && capturesFor(board, r, c, forward).length) {
        capPieces.add(`${r},${c}`);
      }
    }
  }

  for (let dr = 0; dr < N; dr++) {
    for (let dc = 0; dc < N; dc++) {
      const { r, c } = displayToBoard(dr, dc, flip);
      const sq = liveGrid.children[dr * N + dc];
      sq.classList.remove('sel', 'dest', 'can-capture', 'lastmove', 'capture-flash');
      const key = `${r},${c}`;
      if (selected && selected.r === r && selected.c === c) sq.classList.add('sel');
      if (destSet.has(key)) sq.classList.add('dest');
      if (capPieces.has(key)) sq.classList.add('can-capture');
      const lm = view.lastMove;
      if (lm && ((lm.to.r === r && lm.to.c === c) || (lm.from.r === r && lm.from.c === c))) {
        sq.classList.add('lastmove');
        if (lm.capture) sq.classList.add('capture-flash');
      }
    }
  }
}

function onSquareClick(dr, dc) {
  const ctx = lastCtx;
  if (!ctx || pendingMove) return;
  const { view, send, me } = ctx;
  if (view.turn !== me || view.status !== 'playing') return;

  const board = view.board;
  const forward = view.dir[me];
  const flip = forward === 1;
  const { r, c } = displayToBoard(dr, dc, flip);
  const piece = board[r][c];
  const key = `${r},${c}`;

  if (selected) {
    const destSet = new Set(
      legalDests(view, board, me, forward, selected).map((d) => `${d.r},${d.c}`)
    );
    if (destSet.has(key)) {
      pendingMove = true;
      send({ type: 'move', from: { r: selected.r, c: selected.c }, to: { r, c } });
      selected = null;
      return;
    }
  }

  if (!piece || piece.p !== me) return;

  if (view.mustContinue && (view.mustContinue.r !== r || view.mustContinue.c !== c)) return;

  if (playerHasCapture(board, me, forward) && !capturesFor(board, r, c, forward).length) {
    ctx.toast('Hay captura obligatoria con otra ficha.', 'error');
    return;
  }

  selected = { r, c };
  patchHighlights(view, board, me, forward, flip);
}

export default function render(ctx) {
  lastCtx = ctx;
  pendingMove = false;

  const { view, me, root } = ctx;
  const board = view.board;
  const myTurn = view.turn === me && view.status === 'playing';
  const forward = view.dir[me];
  const flip = forward === 1;

  if (prevBoardState && view.lastMove) {
    const lmKey = `${view.lastMove.from.r},${view.lastMove.from.c}-${view.lastMove.to.r},${view.lastMove.to.c}`;
    if (lmKey !== prevLastMove) {
      SFX.chkMove();
      if (view.lastMove.capture) SFX.chkCapture();
      const from = view.lastMove.from;
      const to = view.lastMove.to;
      const wasPiece = prevBoardState[from.r]?.[from.c];
      const nowPiece = board[to.r]?.[to.c];
      if (nowPiece?.k && wasPiece && !wasPiece.k) {
        SFX.chkKing();
        const { dr, dc } = boardToDisplay(to.r, to.c, flip);
        sparks(liveGrid?.children[dr * N + dc], '👑', 4);
      }
      const { dr, dc } = boardToDisplay(to.r, to.c, flip);
      pop(liveGrid?.children[dr * N + dc]);
      prevLastMove = lmKey;
    }
  }

  if (!myTurn) selected = null;
  if (view.mustContinue && myTurn) {
    selected = { r: view.mustContinue.r, c: view.mustContinue.c };
  }

  const opp = view.order.find((id) => id !== me);

  if (!liveWrap || !root.contains(liveWrap)) {
    root.innerHTML = '';
    liveWrap = document.createElement('div');
    liveWrap.className = 'chk-outer';
    liveWrap.innerHTML = `
      <div class="chk-capbar"></div>
      <div class="chk-board"></div>
      <p class="chk-hint muted"></p>`;
    liveGrid = liveWrap.querySelector('.chk-board');
    for (let dr = 0; dr < N; dr++) {
      for (let dc = 0; dc < N; dc++) {
        const sq = document.createElement('div');
        sq.className = 'chk-sq';
        sq.dataset.dr = dr;
        sq.dataset.dc = dc;
        sq.addEventListener('click', () => onSquareClick(Number(sq.dataset.dr), Number(sq.dataset.dc)));
        liveGrid.appendChild(sq);
      }
    }
    root.appendChild(liveWrap);
  }

  liveWrap.querySelector('.chk-capbar').innerHTML = `
    <span>🎯 Tus capturas: <strong>${view.captured[me]}</strong></span>
    <span>Fichas ${view.counts[me]} vs ${view.counts[opp]}</span>`;
  liveWrap.classList.toggle('chk-my-turn', myTurn);

  for (let dr = 0; dr < N; dr++) {
    for (let dc = 0; dc < N; dc++) {
      const { r, c } = displayToBoard(dr, dc, flip);
      const sq = liveGrid.children[dr * N + dc];
      const dark = (r + c) % 2 === 1;
      sq.className = 'chk-sq ' + (dark ? 'dark' : 'light');
      sq.replaceChildren();
      const piece = board[r][c];
      if (piece) {
        const disc = document.createElement('div');
        disc.className = 'chk-disc ' + (piece.p === me ? 'mine' : 'theirs') + (piece.k ? ' king' : '');
        if (piece.k) disc.textContent = '♛';
        sq.appendChild(disc);
      }
    }
  }

  patchHighlights(view, board, me, forward, flip);

  const hint = liveWrap.querySelector('.chk-hint');
  if (view.status === 'finished') {
    hint.textContent = view.winner === me ? '🎉 ¡Has ganado!' : 'Fin de partida';
    if (prevStatus !== 'finished') {
      if (view.winner === me) { SFX.gameWin(ctx.meta.id); celebrate(liveWrap, '🎉', 40); }
      else SFX.gameLose(ctx.meta.id);
    }
  } else if (myTurn) {
    if (view.mustContinue) hint.textContent = '⚡ ¡Encadena la captura con la misma ficha!';
    else if (playerHasCapture(board, me, forward)) hint.textContent = '🔴 Captura obligatoria — debes comer';
    else hint.textContent = 'Selecciona ficha y pulsa la casilla destino (verde)';
    inviteTurn(hint);
  } else {
    hint.textContent = `Turno de ${ctx.nameOf(view.turn)}`;
  }

  prevBoardState = board.map((row) => row.map((p) => (p ? { ...p } : null)));
  prevStatus = view.status;
}
