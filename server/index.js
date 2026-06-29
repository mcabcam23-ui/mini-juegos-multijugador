import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RoomManager } from './rooms.js';
import { getGame, listGames } from './games/index.js';
import { syncGameAfterPlayerLeft } from './gameLifecycle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const manager = new RoomManager();

// Servir el frontend estático
const publicDir = join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('/api/games', (req, res) => res.json(listGames()));
app.get('*', (req, res) => res.sendFile(join(publicDir, 'index.html')));

// ---- Helpers de difusión ----
function broadcastRoom(room) {
  const data = manager.publicRoom(room);
  for (const p of room.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('room:update', data);
  }
}

function gameInitOptions(room) {
  if (room.gameId !== 'battleship') return {};
  return { playMode: room.battleshipPlayMode || 'digital' };
}

function broadcastGame(room) {
  const game = getGame(room.gameId);
  for (const p of room.players.values()) {
    if (!p.socketId) continue;
    const view = game.view ? game.view(room.state, p.id) : room.state;
    io.to(p.socketId).emit('game:state', {
      view,
      roomStatus: room.status,
      meta: game.meta,
      players: [...room.players.values()].map((pl) => ({ id: pl.id, nickname: pl.nickname, connected: pl.connected, isBot: !!pl.isBot })),
      hostId: room.hostId,
      series: room.series,
    });
  }
}

// Mueve a los bots cuando les toca actuar (uno a uno, con un pequeño retardo).
function driveBots(room) {
  if (!room || room.status !== 'playing' || !room.state) return;
  if (room.botTimer) return;
  const game = getGame(room.gameId);
  if (!game.bots) return;
  const botIds = new Set([...room.players.values()].filter((p) => p.isBot).map((p) => p.id));
  if (!botIds.size) return;
  let pending = null;
  try { pending = game.bots(room.state, botIds); } catch { pending = null; }
  if (!pending || !pending.length) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    const r = manager.getRoom(room.code);
    if (!r || r.status !== 'playing' || !r.state) return;
    const g = getGame(r.gameId);
    const bots = new Set([...r.players.values()].filter((p) => p.isBot).map((p) => p.id));
    let fresh = null;
    try { fresh = g.bots(r.state, bots); } catch { fresh = null; }
    if (!fresh || !fresh.length) {
      driveBots(r);
      return;
    }
    const { playerId, action } = fresh[0];
    const err = applyAndBroadcast(r, playerId, action);
    if (err) driveBots(r);
  }, 550 + Math.floor(Math.random() * 750));
}

function countSeriesIfFinished(room) {
  if (room.state && room.state.status === 'finished' && !room.seriesCounted) {
    room.seriesCounted = true;
    const w = room.state.winner;
    if (w && room.series[w] !== undefined) room.series[w] += 1;
  }
}

function runDelayedAction(room, delayedAction) {
  if (!delayedAction) return;
  const gen = room.actionGen ?? 0;
  const game = getGame(room.gameId);
  const { delayMs = 1000, ...act } = delayedAction;
  setTimeout(() => {
    const live = manager.getRoom(room.code);
    if (!live || live.actionGen !== gen) return;
    if (live.status !== 'playing' || !live.state) return;
    const result = game.action(live.state, null, act);
    if (result.error) return;
    live.state = result.state;
    if (live.state.status === 'finished') {
      live.status = 'finished';
      countSeriesIfFinished(live);
    }
    broadcastGame(live);
    runDelayedAction(live, result.delayedAction);
    driveBots(live);
  }, delayMs);
}

function applyInitResult(room, initResult) {
  manager.cancelTimers(room);
  if (initResult && typeof initResult === 'object' && initResult.state) {
    room.state = initResult.state;
    runDelayedAction(room, initResult.delayedAction);
  } else {
    room.state = initResult;
  }
}

function afterPlayerLeft(room, leftPlayerId) {
  if (!manager.getRoom(room.code)) return;
  broadcastRoom(room);
  if (room.status === 'playing' && room.state) {
    const game = getGame(room.gameId);
    const sync = syncGameAfterPlayerLeft(room, leftPlayerId, game);
    if (sync?.state) room.state = sync.state;
    if (sync?.delayedAction) runDelayedAction(room, sync.delayedAction);
    broadcastGame(room);
    driveBots(room);
  }
}

function detachSocketFromRoom(socket) {
  const code = socket.data.code;
  const playerId = socket.data.playerId;
  if (!code || !playerId) return;
  const room = manager.getRoom(code);
  if (room) {
    manager.removePlayer(room, playerId);
    afterPlayerLeft(room, playerId);
  }
  socket.leave(code);
  socket.data.code = null;
}

function applyAndBroadcast(room, playerId, action) {
  const game = getGame(room.gameId);
  const result = game.action(room.state, playerId, action);
  if (result.error) return result.error;
  room.state = result.state;
  if (room.state.status === 'finished') { room.status = 'finished'; countSeriesIfFinished(room); }
  broadcastGame(room);

  if (result.delayedAction) {
    runDelayedAction(room, result.delayedAction);
  } else {
    driveBots(room);
  }
  return null;
}

// ---- Socket.IO ----
io.on('connection', (socket) => {
  socket.data.playerId = null;
  socket.data.code = null;

  const sendError = (msg) => socket.emit('toast', { type: 'error', message: msg });

  socket.on('listGames', (cb) => {
    if (typeof cb === 'function') cb(listGames());
  });

  socket.on('createRoom', ({ gameId, nickname, playerId }, cb) => {
    nickname = (nickname || '').trim().slice(0, 16) || 'Jugador';
    detachSocketFromRoom(socket);
    const { room, error } = manager.createRoom(gameId, { id: playerId, nickname, socketId: socket.id });
    if (error) return cb && cb({ error });
    socket.data.playerId = playerId;
    socket.data.code = room.code;
    socket.join(room.code);
    cb && cb({ ok: true, code: room.code, room: manager.publicRoom(room) });
    socket.emit('chat:history', room.chat);
    broadcastRoom(room);
  });

  socket.on('joinRoom', ({ code, nickname, playerId }, cb) => {
    nickname = (nickname || '').trim().slice(0, 16) || 'Jugador';
    const target = (code || '').toUpperCase();
    if (socket.data.code && socket.data.code !== target) detachSocketFromRoom(socket);
    const { room, error } = manager.joinRoom(code, { id: playerId, nickname, socketId: socket.id });
    if (error) return cb && cb({ error });
    socket.data.playerId = playerId;
    socket.data.code = room.code;
    socket.join(room.code);
    cb && cb({ ok: true, code: room.code, room: manager.publicRoom(room) });
    socket.emit('chat:history', room.chat);
    broadcastRoom(room);
    if (room.status !== 'lobby' && room.state) broadcastGame(room);
  });

  // Reconexión automática al recargar la página
  socket.on('rejoin', ({ code, playerId, nickname }, cb) => {
    const room = manager.getRoom(code);
    if (!room || !room.players.has(playerId)) return cb && cb({ error: 'Sala no disponible.' });
    const p = room.players.get(playerId);
    p.socketId = socket.id;
    p.connected = true;
    if (nickname) p.nickname = nickname;
    socket.data.playerId = playerId;
    socket.data.code = code;
    socket.join(code);
    cb && cb({ ok: true, room: manager.publicRoom(room) });
    socket.emit('chat:history', room.chat);
    broadcastRoom(room);
    if (room.status !== 'lobby' && room.state) broadcastGame(room);
  });

  socket.on('setBattleshipMode', ({ mode }, cb) => {
    const room = manager.getRoom(socket.data.code);
    if (!room) return cb && cb({ error: 'Sala no encontrada.' });
    if (room.hostId !== socket.data.playerId) return cb && cb({ error: 'Solo el anfitrión puede cambiar el modo.' });
    if (room.status !== 'lobby') return cb && cb({ error: 'Solo en el lobby.' });
    if (room.gameId !== 'battleship') return cb && cb({ error: 'Solo en Tocado y Hundido.' });
    if (mode !== 'digital' && mode !== 'verbal') return cb && cb({ error: 'Modo no válido.' });
    room.battleshipPlayMode = mode;
    cb && cb({ ok: true, mode });
    broadcastRoom(room);
  });

  socket.on('startGame', (cb) => {
    const room = manager.getRoom(socket.data.code);
    if (!room) return cb && cb({ error: 'Sala no encontrada.' });
    if (room.hostId !== socket.data.playerId) return cb && cb({ error: 'Solo el anfitrión puede empezar.' });
    const game = getGame(room.gameId);
    const count = room.players.size;
    if (count < game.meta.minPlayers) return cb && cb({ error: `Se necesitan al menos ${game.meta.minPlayers} jugadores.` });
    if (room.gameId === 'battleship' && room.battleshipPlayMode === 'verbal') {
      const humans = [...room.players.values()].filter((p) => !p.isBot);
      if (humans.length < 2) return cb && cb({ error: 'El modo verbal necesita 2 jugadores humanos.' });
      if (humans.length !== room.players.size) return cb && cb({ error: 'Quita los bots para jugar en modo verbal.' });
    }

    const orderedPlayers = [...room.players.values()].map((p) => ({ id: p.id, nickname: p.nickname }));
    applyInitResult(room, game.init(orderedPlayers, gameInitOptions(room)));
    room.status = 'playing';
    room.seriesCounted = false;
    cb && cb({ ok: true });
    broadcastRoom(room);
    broadcastGame(room);
    driveBots(room);
  });

  socket.on('changeGame', ({ gameId }, cb) => {
    const room = manager.getRoom(socket.data.code);
    if (!room) return cb && cb({ error: 'Sala no encontrada.' });
    if (room.hostId !== socket.data.playerId) return cb && cb({ error: 'Solo el anfitrión puede cambiar de juego.' });
    const { error } = manager.changeGame(room, gameId);
    if (error) return cb && cb({ error });
    cb && cb({ ok: true });
    broadcastRoom(room);
  });

  const hostOnly = (room) => room && room.hostId === socket.data.playerId;

  socket.on('setCapacity', ({ capacity }, cb) => {
    const room = manager.getRoom(socket.data.code);
    if (!hostOnly(room)) return cb && cb({ error: 'Solo el anfitrión.' });
    if (room.status !== 'lobby') return cb && cb({ error: 'Solo en el lobby.' });
    manager.setCapacity(room, capacity);
    cb && cb({ ok: true, capacity: room.capacity });
    broadcastRoom(room);
  });

  socket.on('addBot', (cb) => {
    const room = manager.getRoom(socket.data.code);
    if (!hostOnly(room)) return cb && cb({ error: 'Solo el anfitrión.' });
    const { error } = manager.addBot(room);
    if (error) return cb && cb({ error });
    cb && cb({ ok: true });
    broadcastRoom(room);
  });

  socket.on('fillBots', (cb) => {
    const room = manager.getRoom(socket.data.code);
    if (!hostOnly(room)) return cb && cb({ error: 'Solo el anfitrión.' });
    const { error, added } = manager.fillBots(room);
    if (error) return cb && cb({ error });
    cb && cb({ ok: true, added });
    broadcastRoom(room);
  });

  socket.on('removeBot', ({ id }, cb) => {
    const room = manager.getRoom(socket.data.code);
    if (!hostOnly(room)) return cb && cb({ error: 'Solo el anfitrión.' });
    const { error } = manager.removeBot(room, id);
    if (error) return cb && cb({ error });
    cb && cb({ ok: true });
    broadcastRoom(room);
  });

  socket.on('chat:send', ({ text }, cb) => {
    const room = manager.getRoom(socket.data.code);
    if (!room) return cb && cb({ error: 'No estás en ninguna sala.' });
    const player = room.players.get(socket.data.playerId);
    if (!player) return cb && cb({ error: 'Jugador no encontrado en la sala.' });
    text = String(text || '').trim().slice(0, 200);
    if (!text) return cb && cb({ error: 'Mensaje vacío.' });
    const msg = { id: player.id, nickname: player.nickname, text, ts: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > 60) room.chat.shift();
    io.to(room.code).emit('chat:msg', msg);
    cb && cb({ ok: true });
  });

  socket.on('reaction', ({ emoji }) => {
    const room = manager.getRoom(socket.data.code);
    if (!room) return;
    const player = room.players.get(socket.data.playerId);
    if (!player) return;
    const allowed = ['😀', '😂', '😮', '😎', '😭', '🔥', '👏', '💩', '❤️', '👍'];
    if (!allowed.includes(emoji)) return;
    for (const p of room.players.values()) {
      if (p.socketId) io.to(p.socketId).emit('reaction', { id: player.id, nickname: player.nickname, emoji });
    }
  });

  socket.on('gameAction', ({ action }, cb) => {
    const room = manager.getRoom(socket.data.code);
    if (!room || room.status === 'lobby' || !room.state) return cb && cb({ error: 'Partida no activa.' });
    const err = applyAndBroadcast(room, socket.data.playerId, action);
    if (err) {
      sendError(err);
      return cb && cb({ error: err });
    }
    cb && cb({ ok: true });
  });

  socket.on('rematch', (cb) => {
    const room = manager.getRoom(socket.data.code);
    if (!room) return cb && cb({ error: 'Sala no encontrada.' });
    if (room.hostId !== socket.data.playerId) return cb && cb({ error: 'Solo el anfitrión puede repetir.' });
    const game = getGame(room.gameId);
    if (room.players.size < game.meta.minPlayers) return cb && cb({ error: 'Faltan jugadores.' });
    const orderedPlayers = [...room.players.values()].map((p) => ({ id: p.id, nickname: p.nickname }));
    applyInitResult(room, game.init(orderedPlayers, gameInitOptions(room)));
    room.status = 'playing';
    room.seriesCounted = false;
    cb && cb({ ok: true });
    broadcastRoom(room);
    broadcastGame(room);
    driveBots(room);
  });

  socket.on('backToLobby', (cb) => {
    const room = manager.getRoom(socket.data.code);
    if (!room) return cb && cb({ error: 'Sala no encontrada.' });
    if (room.hostId !== socket.data.playerId) return cb && cb({ error: 'Solo el anfitrión puede volver al lobby.' });
    manager.cancelTimers(room);
    room.status = 'lobby';
    room.state = null;
    cb && cb({ ok: true });
    broadcastRoom(room);
  });

  socket.on('leaveRoom', () => {
    const room = manager.getRoom(socket.data.code);
    if (!room) return;
    const leftId = socket.data.playerId;
    manager.removePlayer(room, leftId);
    socket.leave(room.code);
    socket.data.code = null;
    if (manager.getRoom(room.code)) afterPlayerLeft(room, leftId);
  });

  socket.on('disconnect', () => {
    const room = manager.getRoom(socket.data.code);
    if (!room) return;
    const p = room.players.get(socket.data.playerId);
    if (p) {
      p.connected = false;
      p.socketId = null;
    }
    broadcastRoom(room);
  });
});

setInterval(() => manager.sweep(), 5 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log(`\n🎮  Mini Juegos Multijugador en marcha`);
  console.log(`👉  http://localhost:${PORT}\n`);
});
