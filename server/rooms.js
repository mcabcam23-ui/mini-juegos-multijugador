import { getGame } from './games/index.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> room
  }

  generateCode() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(gameId, host) {
    const game = getGame(gameId);
    if (!game) return { error: 'Juego no encontrado.' };
    const code = this.generateCode();
    const room = {
      code,
      gameId,
      hostId: host.id,
      battleshipPlayMode: gameId === 'battleship' ? 'digital' : null,
      players: new Map(),
      status: 'lobby',
      state: null,
      chat: [],
      series: {},
      seriesCounted: false,
      capacity: game.meta.maxPlayers,
      botTimer: null,
      actionGen: 0,
      lastEmptyAt: null,
      createdAt: Date.now(),
    };
    room.players.set(host.id, {
      id: host.id,
      nickname: host.nickname,
      socketId: host.socketId,
      connected: true,
      isBot: false,
    });
    room.series[host.id] = 0;
    this.rooms.set(code, room);
    return { room };
  }

  getRoom(code) {
    return this.rooms.get((code || '').toUpperCase()) || null;
  }

  joinRoom(code, player) {
    const room = this.getRoom(code);
    if (!room) return { error: 'No existe ninguna sala con ese código.' };
    const game = getGame(room.gameId);

    const existing = room.players.get(player.id);
    if (existing) {
      // Reconexión
      existing.socketId = player.socketId;
      existing.connected = true;
      existing.nickname = player.nickname || existing.nickname;
      return { room };
    }

    if (room.status !== 'lobby') return { error: 'La partida ya ha comenzado.' };
    if (room.players.size >= room.capacity) return { error: 'La sala está llena.' };

    room.players.set(player.id, {
      id: player.id,
      nickname: player.nickname,
      socketId: player.socketId,
      connected: true,
      isBot: false,
    });
    if (room.series[player.id] === undefined) room.series[player.id] = 0;
    return { room };
  }

  changeGame(room, gameId) {
    const game = getGame(gameId);
    if (!game) return { error: 'Juego no encontrado.' };
    if (room.status !== 'lobby') return { error: 'Solo puedes cambiar de juego en el lobby.' };
    if (room.players.size > game.meta.maxPlayers) {
      return { error: `Demasiados jugadores para ${game.meta.name} (máx. ${game.meta.maxPlayers}). Quita jugadores o bots.` };
    }
    room.gameId = gameId;
    room.battleshipPlayMode = gameId === 'battleship' ? 'digital' : null;
    room.capacity = Math.max(room.players.size, game.meta.maxPlayers);
    if (room.capacity > game.meta.maxPlayers) room.capacity = game.meta.maxPlayers;
    return { room };
  }

  setCapacity(room, n) {
    const game = getGame(room.gameId);
    const min = Math.max(game.meta.minPlayers, room.players.size);
    const max = game.meta.maxPlayers;
    n = Math.max(min, Math.min(max, Math.round(n)));
    room.capacity = n;
    return { room };
  }

  addBot(room) {
    if (room.status !== 'lobby') return { error: 'Solo en el lobby.' };
    if (room.players.size >= room.capacity) return { error: 'La sala está llena.' };
    const botCount = [...room.players.values()].filter((p) => p.isBot).length;
    const id = 'bot_' + Math.random().toString(36).slice(2, 9);
    const names = ['Robo', 'Chip', 'Bit', 'Nano', 'Pixel', 'Astro', 'Volt', 'Data'];
    const nickname = `🤖 ${names[botCount % names.length]}`;
    room.players.set(id, { id, nickname, socketId: null, connected: true, isBot: true });
    room.series[id] = 0;
    return { bot: room.players.get(id) };
  }

  fillBots(room) {
    if (room.status !== 'lobby') return { error: 'Solo en el lobby.' };
    let added = 0;
    while (room.players.size < room.capacity) {
      const r = this.addBot(room);
      if (r.error) break;
      added++;
    }
    return { added };
  }

  cancelTimers(room) {
    if (!room) return;
    if (room.botTimer) {
      clearTimeout(room.botTimer);
      room.botTimer = null;
    }
    room.actionGen = (room.actionGen || 0) + 1;
  }

  removeBot(room, id) {
    const p = room.players.get(id);
    if (!p || !p.isBot) return { error: 'No es un bot.' };
    room.players.delete(id);
    delete room.series[id];
    return { ok: true };
  }

  removePlayer(room, playerId) {
    room.players.delete(playerId);
    delete room.series[playerId];
    const humans = [...room.players.values()].filter((p) => !p.isBot);
    if (humans.length === 0) {
      this.cancelTimers(room);
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === playerId) {
      // Pasar el rol de anfitrión al primer humano restante
      room.hostId = humans[0].id;
    }
  }

  publicRoom(room) {
    const game = getGame(room.gameId);
    return {
      code: room.code,
      gameId: room.gameId,
      status: room.status,
      hostId: room.hostId,
      meta: game.meta,
      series: room.series,
      capacity: room.capacity,
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        connected: p.connected,
        isBot: !!p.isBot,
      })),
      battleshipPlayMode: room.gameId === 'battleship' ? (room.battleshipPlayMode || 'digital') : null,
    };
  }

  // Limpia salas vacías o muy antiguas (con gracia para reconexión)
  sweep() {
    const now = Date.now();
    const EMPTY_GRACE_MS = 30 * 60 * 1000;
    for (const [code, room] of this.rooms) {
      const anyConnected = [...room.players.values()].some((p) => p.connected && !p.isBot);
      const ageH = (now - room.createdAt) / 3600000;
      if (ageH > 12) {
        this.cancelTimers(room);
        this.rooms.delete(code);
        continue;
      }
      if (!anyConnected) {
        room.lastEmptyAt ??= now;
        if (now - room.lastEmptyAt > EMPTY_GRACE_MS) {
          this.cancelTimers(room);
          this.rooms.delete(code);
        }
      } else {
        room.lastEmptyAt = null;
      }
    }
  }
}
