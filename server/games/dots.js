// Timbiriche / Dots & Boxes - 2 a 4 jugadores
const DOTS = 6;             // 6x6 puntos => 5x5 casillas
const BOXES = DOTS - 1;

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
    id: 'dots',
    name: 'Timbiriche',
    emoji: '⬛',
    tagline: 'Cierra cajas y conquista',
    description: 'Por turnos, traza una línea entre dos puntos. Quien cierra el cuarto lado de una caja se la queda y juega otra vez. ¡Gana quien más cajas tenga!',
    minPlayers: 2,
    maxPlayers: 4,
    gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
  },

  init(players) {
    const scores = {};
    for (const p of players) scores[p.id] = 0;
    return {
      dots: DOTS,
      // h[r][c]: línea horizontal del punto (r,c) al (r,c+1) -> r:0..DOTS-1, c:0..DOTS-2
      h: Array.from({ length: DOTS }, () => Array(DOTS - 1).fill(false)),
      // v[r][c]: línea vertical del punto (r,c) al (r+1,c) -> r:0..DOTS-2, c:0..DOTS-1
      v: Array.from({ length: DOTS - 1 }, () => Array(DOTS).fill(false)),
      boxes: Array.from({ length: BOXES }, () => Array(BOXES).fill(null)),
      order: players.map((p) => p.id),
      turn: players[0].id,
      scores,
      lastLine: null,
      status: 'playing',
      winner: null,
    };
  },

  action(state, playerId, action) {
    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };
    if (action.type !== 'line') return { error: 'Acción no válida.' };
    if (state.turn !== playerId) return { error: 'No es tu turno.' };

    const { orient, r, c } = action;
    if (orient === 'h') {
      if (!(r >= 0 && r < DOTS && c >= 0 && c < DOTS - 1)) return { error: 'Línea fuera del tablero.' };
      if (state.h[r][c]) return { error: 'Esa línea ya está.' };
      state.h[r][c] = true;
    } else if (orient === 'v') {
      if (!(r >= 0 && r < DOTS - 1 && c >= 0 && c < DOTS)) return { error: 'Línea fuera del tablero.' };
      if (state.v[r][c]) return { error: 'Esa línea ya está.' };
      state.v[r][c] = true;
    } else {
      return { error: 'Orientación no válida.' };
    }
    state.lastLine = { orient, r, c };

    // Comprobar cajas completadas
    let completed = 0;
    const check = (br, bc) => {
      if (br < 0 || bc < 0 || br >= BOXES || bc >= BOXES) return;
      if (state.boxes[br][bc]) return;
      const top = state.h[br][bc];
      const bottom = state.h[br + 1][bc];
      const left = state.v[br][bc];
      const right = state.v[br][bc + 1];
      if (top && bottom && left && right) {
        state.boxes[br][bc] = playerId;
        state.scores[playerId] += 1;
        completed++;
      }
    };
    if (orient === 'h') { check(r - 1, c); check(r, c); }
    else { check(r, c - 1); check(r, c); }

    // ¿Tablero lleno?
    const totalBoxes = BOXES * BOXES;
    const filled = state.boxes.flat().filter(Boolean).length;
    if (filled === totalBoxes) {
      state.status = 'finished';
      state.winner = topScorer(state.scores, state.order);
      return { state };
    }

    // Si no completó ninguna caja, pasa el turno; si completó, repite.
    if (completed === 0) {
      const i = state.order.indexOf(playerId);
      state.turn = state.order[(i + 1) % state.order.length];
    }
    return { state };
  },

  view(state) {
    return state;
  },

  bots(state, botIds) {
    if (state.status !== 'playing' || !botIds.has(state.turn)) return [];
    const me = state.turn;

    const sides = (br, bc) => {
      if (br < 0 || bc < 0 || br >= BOXES || bc >= BOXES) return -1;
      return (state.h[br][bc] ? 1 : 0) + (state.h[br + 1][bc] ? 1 : 0) + (state.v[br][bc] ? 1 : 0) + (state.v[br][bc + 1] ? 1 : 0);
    };

    const lines = [];
    for (let r = 0; r < DOTS; r++) for (let c = 0; c < DOTS - 1; c++) if (!state.h[r][c]) lines.push({ orient: 'h', r, c, boxes: [[r - 1, c], [r, c]] });
    for (let r = 0; r < DOTS - 1; r++) for (let c = 0; c < DOTS; c++) if (!state.v[r][c]) lines.push({ orient: 'v', r, c, boxes: [[r, c - 1], [r, c]] });

    const completing = [];
    const safe = [];
    for (const ln of lines) {
      let completes = false, gives = false;
      for (const [br, bc] of ln.boxes) {
        const s = sides(br, bc);
        if (s === -1) continue;
        if (s === 3) completes = true;       // cerrará esta caja
        if (s === 2) gives = true;           // la dejaría en 3 lados (regalo)
      }
      if (completes) completing.push(ln);
      else if (!gives) safe.push(ln);
    }

    const pickFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    let ln;
    if (completing.length) ln = pickFrom(completing);
    else if (safe.length) ln = pickFrom(safe);
    else ln = pickFrom(lines);
    if (!ln) return [];
    return [{ playerId: me, action: { type: 'line', orient: ln.orient, r: ln.r, c: ln.c } }];
  },
};
