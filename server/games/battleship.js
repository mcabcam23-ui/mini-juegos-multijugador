// Tocado y Hundido — variante española (plantilla clásica)
// 1×4, 2×3, 3×2, 4×1 = 20 casillas
const SIZE = 10;
const ROWS = 'ABCDEFGHIJ'.split('');
const FLEET = [
  { id: 'b4', name: 'Acorazado', size: 4, count: 1 },
  { id: 'c3', name: 'Crucero', size: 3, count: 2 },
  { id: 'd2', name: 'Destructor', size: 2, count: 3 },
  { id: 's1', name: 'Submarino', size: 1, count: 4 },
];

// Plantilla expandida (10 barcos individuales)
const SHIP_TEMPLATE = FLEET.flatMap((f) =>
  Array.from({ length: f.count }, (_, i) => ({
    id: `${f.id}_${i}`,
    name: f.count > 1 ? `${f.name} ${i + 1}` : f.name,
    size: f.size,
    type: f.id,
  }))
);

function key(x, y) { return `${x},${y}`; }
function coordLabel(x, y) { return `${ROWS[y]}${x + 1}`; }

function validatePlacement(ships) {
  if (!Array.isArray(ships)) return 'Colocación no válida.';
  const expected = SHIP_TEMPLATE.map((s) => s.size).sort((a, b) => a - b).join(',');
  const got = ships.map((s) => (s.cells ? s.cells.length : -1)).sort((a, b) => a - b).join(',');
  if (expected !== got) return 'La flota no coincide con la plantilla.';

  const owner = new Map();
  for (let si = 0; si < ships.length; si++) {
    const ship = ships[si];
    const cells = ship.cells;
    if (!Array.isArray(cells) || cells.length < 1) return 'Barco no válido.';
    for (const c of cells) {
      if (typeof c.x !== 'number' || typeof c.y !== 'number' || c.x < 0 || c.y < 0 || c.x >= SIZE || c.y >= SIZE) {
        return 'Barco fuera del tablero.';
      }
    }
    if (cells.length > 1) {
      const xs = cells.map((c) => c.x);
      const ys = cells.map((c) => c.y);
      const sameRow = ys.every((y) => y === ys[0]);
      const sameCol = xs.every((x) => x === xs[0]);
      if (!sameRow && !sameCol) return 'Los barcos deben ser rectos.';
      if (sameRow) {
        const sorted = [...xs].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) return 'Barco no contiguo.';
      } else {
        const sorted = [...ys].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) return 'Barco no contiguo.';
      }
    }
    for (const c of cells) {
      const k = key(c.x, c.y);
      if (owner.has(k)) return 'Los barcos se solapan.';
      owner.set(k, si);
    }
  }

  for (const [k, si] of owner) {
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const other = owner.get(key(nx, ny));
      if (other !== undefined && other !== si) {
        return 'Los barcos no pueden estar pegados por los lados.';
      }
    }
  }
  return null;
}

function isHitMark(v) {
  return v === 'hit' || v === 'sunk';
}

function allSunk(board) {
  return board.ships.every((ship) => ship.cells.every((c) => isHitMark(board.incoming[key(c.x, c.y)])));
}

function shipSunk(ship, incoming) {
  return ship.cells.every((c) => isHitMark(incoming[key(c.x, c.y)]));
}

function shipStatusList(ships, incoming) {
  if (!ships) return [];
  return ships.map((ship) => {
    const hits = ship.cells.filter((c) => isHitMark(incoming[key(c.x, c.y)])).length;
    return { id: ship.id, name: ship.name, size: ship.cells.length, hits, sunk: hits === ship.cells.length };
  });
}

function initManualPlayer() {
  return { enemyMarks: {}, lastMark: null };
}

function initVerbal(players) {
  const boards = {};
  for (const p of players) boards[p.id] = { ships: null, ready: false, incoming: {} };
  const manual = {};
  for (const p of players) manual[p.id] = initManualPlayer();
  return {
    playMode: 'verbal',
    phase: 'placement',
    boards,
    manual,
    order: players.map((p) => p.id),
    status: 'playing',
    winner: null,
  };
}

export default {
  meta: {
    id: 'battleship',
    name: 'Tocado y Hundido',
    emoji: '🚢',
    tagline: 'Hunde toda la flota enemiga',
    description: 'Coloca tu flota en el tablero o juega en modo verbal: comunicad las coordenadas en voz y marcáis agua, tocado y hundido a mano.',
    modes: [
      { id: 'digital', name: 'Digital', emoji: '🖥️', hint: 'Colocación y disparos en la app' },
      { id: 'verbal', name: 'Verbal', emoji: '🗣️', hint: 'Hablad las coordenadas y marcáis el resultado a mano' },
    ],
    minPlayers: 2,
    maxPlayers: 2,
    gradient: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
    fleet: SHIP_TEMPLATE,
    fleetGroups: FLEET,
    boardSize: SIZE,
    rows: ROWS,
  },

  init(players, options = {}) {
    if (options.playMode === 'verbal') return initVerbal(players);

    const boards = {};
    for (const p of players) boards[p.id] = { ships: null, ready: false, incoming: {} };
    return {
      playMode: 'digital',
      phase: 'placement',
      boards,
      order: players.map((p) => p.id),
      turn: null,
      status: 'playing',
      winner: null,
      lastShot: null,
    };
  },

  action(state, playerId, action) {
    if (state.status !== 'playing') return { error: 'La partida ha terminado.' };

    if (state.playMode === 'verbal') {
      return actionVerbal(state, playerId, action);
    }

    if (action.type === 'placeShips') {
      if (state.phase !== 'placement') return { error: 'Ya no puedes colocar barcos.' };
      const err = validatePlacement(action.ships);
      if (err) return { error: err };
      const board = state.boards[playerId];
      board.ships = action.ships.map((s, i) => ({
        id: SHIP_TEMPLATE[i].id,
        name: SHIP_TEMPLATE[i].name,
        size: SHIP_TEMPLATE[i].size,
        cells: s.cells.map((c) => ({ x: c.x, y: c.y })),
      }));
      board.ready = true;
      if (state.order.every((id) => state.boards[id].ready)) {
        state.phase = 'battle';
        state.turn = state.order[0];
      }
      return { state };
    }

    if (action.type === 'fire') {
      if (state.phase !== 'battle') return { error: 'Aún no empieza la batalla.' };
      if (state.turn !== playerId) return { error: 'No es tu turno.' };
      const { x, y } = action;
      if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
        return { error: 'Coordenada no válida.' };
      }
      const enemyId = state.order.find((id) => id !== playerId);
      const enemy = state.boards[enemyId];
      const k = key(x, y);
      if (enemy.incoming[k]) return { error: 'Ya disparaste en ' + coordLabel(x, y) + '.' };

      const hitShip = enemy.ships.find((ship) => ship.cells.some((c) => c.x === x && c.y === y));
      enemy.incoming[k] = hitShip ? 'hit' : 'miss';

      let sunkName = null;
      if (hitShip && shipSunk(hitShip, enemy.incoming)) {
        sunkName = hitShip.name;
        for (const c of hitShip.cells) enemy.incoming[key(c.x, c.y)] = 'sunk';
      }

      state.lastShot = {
        by: playerId, x, y,
        coord: coordLabel(x, y),
        result: hitShip ? 'hit' : 'miss',
        sunk: sunkName,
      };

      if (hitShip && allSunk(enemy)) {
        state.status = 'finished';
        state.phase = 'finished';
        state.winner = playerId;
        return { state };
      }

      if (!hitShip) state.turn = enemyId;
      return { state };
    }

    return { error: 'Acción no válida.' };
  },

  view(state, playerId) {
    if (state.playMode === 'verbal') {
      const manual = state.manual[playerId] || initManualPlayer();
      const me = state.boards[playerId];
      const enemyId = state.order.find((id) => id !== playerId);
      const enemy = state.boards[enemyId];
      const enemyMarks = manual.enemyMarks || {};
      const myIncoming = me?.incoming || {};
      const rivalManual = enemyId ? state.manual[enemyId] : null;
      const rivalMarks = rivalManual?.enemyMarks || {};
      return {
        playMode: 'verbal',
        phase: state.phase,
        status: state.status,
        winner: state.winner,
        lastMark: manual.lastMark,
        myReady: me?.ready ?? false,
        enemyReady: enemy?.ready ?? false,
        myShips: me?.ships ?? null,
        myIncoming,
        rivalMarks,
        enemyMarks,
        ownMarks: myIncoming,
        stats: {
          enemyMiss: Object.values(enemyMarks).filter((v) => v === 'miss').length,
          enemyHit: Object.values(enemyMarks).filter((v) => v === 'hit').length,
          enemySunkCells: Object.values(enemyMarks).filter((v) => v === 'sunk').length,
          rivalMiss: Object.values(rivalMarks).filter((v) => v === 'miss').length,
          rivalHit: Object.values(rivalMarks).filter((v) => v === 'hit' || v === 'sunk').length,
          rivalSunkCells: Object.values(rivalMarks).filter((v) => v === 'sunk').length,
          ownMiss: Object.values(myIncoming).filter((v) => v === 'miss').length,
          ownHit: Object.values(myIncoming).filter((v) => v === 'hit' || v === 'sunk').length,
        },
      };
    }

    const enemyId = state.order.find((id) => id !== playerId);
    const me = state.boards[playerId];
    const enemy = state.boards[enemyId];

    const sunkEnemyCells = [];
    if (enemy?.ships) {
      for (const ship of enemy.ships) {
        if (shipSunk(ship, enemy.incoming)) {
          for (const c of ship.cells) sunkEnemyCells.push({ x: c.x, y: c.y, name: ship.name });
        }
      }
    }

    return {
      playMode: 'digital',
      phase: state.phase,
      status: state.status,
      winner: state.winner,
      turn: state.turn,
      lastShot: state.lastShot,
      myReady: me?.ready ?? false,
      enemyReady: enemy?.ready ?? false,
      myShips: me?.ships ?? null,
      myIncoming: me?.incoming ?? {},
      enemyShots: enemy?.incoming ?? {},
      sunkEnemyCells,
      myFleetStatus: shipStatusList(me?.ships, me?.incoming ?? {}),
      enemyFleetStatus: shipStatusList(enemy?.ships, enemy?.incoming ?? {}),
      remainingEnemyShips: enemy?.ships ? enemy.ships.filter((s) => !shipSunk(s, enemy.incoming)).length : null,
      remainingMyShips: me?.ships ? me.ships.filter((s) => !shipSunk(s, me.incoming)).length : null,
    };
  },

  bots(state, botIds) {
    if (state.playMode === 'verbal') return [];
    if (state.status !== 'playing') return [];

    if (state.phase === 'placement') {
      for (const id of state.order) {
        if (botIds.has(id) && !state.boards[id].ready) {
          let ships = null;
          for (let t = 0; t < 8 && !ships; t++) ships = randomPlacement();
          if (!ships) return [];
          return [{ playerId: id, action: { type: 'placeShips', ships } }];
        }
      }
      return [];
    }

    if (state.phase === 'battle' && botIds.has(state.turn)) {
      const me = state.turn;
      const enemyId = state.order.find((id) => id !== me);
      const incoming = state.boards[enemyId].incoming;
      const tried = (x, y) => incoming[key(x, y)] !== undefined;

      const candidates = [];
      for (let x = 0; x < SIZE; x++) {
        for (let y = 0; y < SIZE; y++) {
          if (isHitMark(incoming[key(x, y)])) {
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && !tried(nx, ny)) {
                let weight = 2;
                const ox = x - dx, oy = y - dy;
                if (ox >= 0 && oy >= 0 && ox < SIZE && oy < SIZE && incoming[key(ox, oy)] === 'hit') weight = 8;
                candidates.push({ x: nx, y: ny, weight });
              }
            }
          }
        }
      }

      let target;
      if (candidates.length) {
        candidates.sort((a, b) => b.weight - a.weight);
        const top = candidates.filter((c) => c.weight === candidates[0].weight);
        target = top[Math.floor(Math.random() * top.length)];
      } else {
        const free = [];
        for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) if (!tried(x, y)) free.push({ x, y });
        const parity = free.filter((c) => (c.x + c.y) % 2 === 0);
        target = (parity.length ? parity : free)[Math.floor(Math.random() * (parity.length || free.length))];
      }
      if (!target) return [];
      return [{ playerId: me, action: { type: 'fire', x: target.x, y: target.y } }];
    }
    return [];
  },
};

function actionVerbal(state, playerId, action) {
  if (action.type === 'placeShips') {
    if (state.phase !== 'placement') return { error: 'Ya no puedes colocar barcos.' };
    const err = validatePlacement(action.ships);
    if (err) return { error: err };
    const board = state.boards[playerId];
    board.ships = action.ships.map((s, i) => ({
      id: SHIP_TEMPLATE[i].id,
      name: SHIP_TEMPLATE[i].name,
      size: SHIP_TEMPLATE[i].size,
      cells: s.cells.map((c) => ({ x: c.x, y: c.y })),
    }));
    board.ready = true;
    if (state.order.every((id) => state.boards[id].ready)) {
      state.phase = 'battle';
    }
    return { state };
  }

  const manual = state.manual[playerId];
  const board = state.boards[playerId];
  if (!manual || !board) return { error: 'Jugador no encontrado.' };

  if (action.type === 'markCell') {
    if (state.phase !== 'battle') return { error: 'Aún no empieza la batalla.' };
    const which = action.board === 'own' ? 'own' : 'enemy';
    const { x, y } = action;
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
      return { error: 'Coordenada no válida.' };
    }
    const k = key(x, y);
    const mark = action.mark;
    const target = which === 'enemy' ? manual.enemyMarks : board.incoming;

    if (mark === 'clear') {
      delete target[k];
      manual.lastMark = { board: which, x, y, mark: null, coord: coordLabel(x, y) };
      return { state };
    }
    if (mark !== 'miss' && mark !== 'hit') return { error: 'Marca no válida.' };

    target[k] = mark;
    manual.lastMark = { board: which, x, y, mark, coord: coordLabel(x, y) };
    return { state };
  }

  if (action.type === 'sinkGroup') {
    if (state.phase !== 'battle') return { error: 'Aún no empieza la batalla.' };
    const which = action.board === 'own' ? 'own' : 'enemy';
    const { x, y } = action;
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
      return { error: 'Coordenada no válida.' };
    }
    const marks = which === 'enemy' ? manual.enemyMarks : board.incoming;
    const k = key(x, y);
    const cur = marks[k];

    if (cur === 'sunk') {
      const cluster = collectCluster(marks, x, y, 'sunk');
      if (!cluster.size) return { error: 'No hay casillas hundidas aquí.' };
      for (const ck of cluster) marks[ck] = 'hit';
      manual.lastMark = { board: which, x, y, mark: 'hit', coord: coordLabel(x, y) };
      return { state };
    }

    if (cur !== 'hit') return { error: 'Mantén pulsado sobre tocado o hundido.' };

    const cluster = collectCluster(marks, x, y, 'hit');
    for (const ck of cluster) marks[ck] = 'sunk';
    manual.lastMark = { board: which, x, y, mark: 'sunk', coord: coordLabel(x, y) };
    return { state };
  }

  if (action.type === 'clearBoard') {
    if (action.board === 'enemy') manual.enemyMarks = {};
    else board.incoming = {};
    return { state };
  }

  return { error: 'Acción no válida.' };
}

function collectCluster(marks, x, y, kind) {
  const cluster = new Set();
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    const ck = key(cx, cy);
    if (marks[ck] !== kind || cluster.has(ck)) continue;
    cluster.add(ck);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && marks[key(nx, ny)] === kind) {
        stack.push([nx, ny]);
      }
    }
  }
  return cluster;
}

function randomPlacement() {
  const ships = [];
  for (const sh of SHIP_TEMPLATE) {
    let placed = false;
    for (let t = 0; t < 2000 && !placed; t++) {
      const horiz = Math.random() < 0.5;
      const x = Math.floor(Math.random() * (horiz ? SIZE - sh.size + 1 : SIZE));
      const y = Math.floor(Math.random() * (horiz ? SIZE : SIZE - sh.size + 1));
      const cells = [];
      for (let i = 0; i < sh.size; i++) {
        cells.push({ x: horiz ? x + i : x, y: horiz ? y : y + i });
      }
      const trial = [...ships, { cells }];
      if (!validatePlacement(trial)) {
        ships.push({ cells });
        placed = true;
      }
    }
    if (!placed) return null;
  }
  return ships;
}
