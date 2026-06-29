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

  const occupied = new Set();
  for (const ship of ships) {
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
      if (occupied.has(k)) return 'Los barcos se solapan.';
      occupied.add(k);
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

function countManualSunk(fleetHits = {}) {
  return SHIP_TEMPLATE.filter((s) => (fleetHits[s.id] || 0) >= s.size).length;
}

function manualFleetStatus(fleetHits = {}) {
  return SHIP_TEMPLATE.map((ship) => {
    const hits = Math.max(0, Math.min(ship.size, fleetHits[ship.id] || 0));
    return { id: ship.id, name: ship.name, size: ship.size, hits, sunk: hits >= ship.size };
  });
}

function initManualPlayer() {
  return { enemyMarks: {}, ownMarks: {}, fleetHits: {}, lastMark: null };
}

function initVerbal(players) {
  const manual = {};
  for (const p of players) manual[p.id] = initManualPlayer();
  return {
    playMode: 'verbal',
    phase: 'battle',
    manual,
    order: players.map((p) => p.id),
    turn: null,
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
      const fleetStatus = manualFleetStatus(manual.fleetHits);
      return {
        playMode: 'verbal',
        phase: state.phase,
        status: state.status,
        winner: state.winner,
        lastMark: manual.lastMark,
        enemyMarks: manual.enemyMarks,
        ownMarks: manual.ownMarks,
        enemyFleetStatus: fleetStatus,
        sunkEnemyShips: countManualSunk(manual.fleetHits),
        totalEnemyShips: SHIP_TEMPLATE.length,
        stats: {
          enemyMiss: Object.values(manual.enemyMarks).filter((v) => v === 'miss').length,
          enemyHit: Object.values(manual.enemyMarks).filter((v) => v === 'hit').length,
          enemySunkCells: Object.values(manual.enemyMarks).filter((v) => v === 'sunk').length,
          ownMiss: Object.values(manual.ownMarks).filter((v) => v === 'miss').length,
          ownHit: Object.values(manual.ownMarks).filter((v) => v === 'hit' || v === 'sunk').length,
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
  const manual = state.manual[playerId];
  if (!manual) return { error: 'Jugador no encontrado.' };

  if (action.type === 'markCell') {
    const board = action.board === 'own' ? 'own' : 'enemy';
    const { x, y } = action;
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
      return { error: 'Coordenada no válida.' };
    }
    const k = key(x, y);
    const target = board === 'enemy' ? manual.enemyMarks : manual.ownMarks;
    const mark = action.mark;

    if (mark === 'clear' || mark === null) {
      delete target[k];
    } else if (mark === 'miss' || mark === 'hit' || mark === 'sunk') {
      target[k] = mark;
    } else {
      return { error: 'Marca no válida.' };
    }

    manual.lastMark = {
      board,
      x,
      y,
      mark: target[k] || null,
      coord: coordLabel(x, y),
    };
    return { state };
  }

  if (action.type === 'markFleet') {
    const ship = SHIP_TEMPLATE.find((s) => s.id === action.shipId);
    if (!ship) return { error: 'Barco no válido.' };

    if (action.mode === 'cycle') {
      const cur = manual.fleetHits[ship.id] || 0;
      const next = cur >= ship.size ? 0 : cur + 1;
      if (next === 0) delete manual.fleetHits[ship.id];
      else manual.fleetHits[ship.id] = next;
    } else if (action.mode === 'sunk') {
      manual.fleetHits[ship.id] = ship.size;
    } else if (action.mode === 'clear') {
      delete manual.fleetHits[ship.id];
    } else if (typeof action.hits === 'number') {
      const h = Math.max(0, Math.min(ship.size, Math.round(action.hits)));
      if (h === 0) delete manual.fleetHits[ship.id];
      else manual.fleetHits[ship.id] = h;
    } else {
      return { error: 'Acción de flota no válida.' };
    }
    return { state };
  }

  if (action.type === 'clearBoard') {
    const board = action.board === 'own' ? 'own' : 'enemy';
    if (board === 'enemy') manual.enemyMarks = {};
    else manual.ownMarks = {};
    return { state };
  }

  if (action.type === 'resetFleet') {
    manual.fleetHits = {};
    return { state };
  }

  return { error: 'Acción no válida.' };
}

function randomPlacement() {
  const occ = new Set();
  const ships = [];
  for (const sh of SHIP_TEMPLATE) {
    let placed = false;
    for (let t = 0; t < 1000 && !placed; t++) {
      const horiz = Math.random() < 0.5;
      const x = Math.floor(Math.random() * (horiz ? SIZE - sh.size + 1 : SIZE));
      const y = Math.floor(Math.random() * (horiz ? SIZE : SIZE - sh.size + 1));
      const cells = [];
      let ok = true;
      for (let i = 0; i < sh.size; i++) {
        const cx = horiz ? x + i : x;
        const cy = horiz ? y : y + i;
        const k = key(cx, cy);
        if (occ.has(k)) { ok = false; break; }
        cells.push({ x: cx, y: cy });
      }
      if (ok) {
        cells.forEach((c) => occ.add(key(c.x, c.y)));
        ships.push({ cells });
        placed = true;
      }
    }
    if (!placed) return null;
  }
  return ships;
}
