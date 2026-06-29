import { gameRenderers } from './games/registry.js';
import { SFX } from './sfx.js';
import { bindGameFit, resetGameFit } from './gameFit.js';

/* ============ Identidad persistente (sin login) ============ */
const PID_KEY = 'arcade_pid';
let playerId = localStorage.getItem(PID_KEY);
if (!playerId) {
  playerId = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  localStorage.setItem(PID_KEY, playerId);
}
let nickname = localStorage.getItem('arcade_nick') || '';

/* ============ Estado ============ */
const socket = io();
let GAMES = [];
let creatingRoom = false;
let selectedGameId = null;
let room = null;       // sala pública actual
let lastGame = null;   // último game:state recibido

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ============ Estado de chat / reacciones ============ */
let chatMessages = [];
let chatOpen = false;
let chatUnread = 0;

/* ============ Navegación de pantallas ============ */
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $('#screen-' + id).classList.add('active');
  document.body.classList.toggle('game-active', id === 'game');
  if (id !== 'game') {
    resetGameFit($('#game-stage'));
    delete $('#screen-game').dataset.game;
  }
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ============ Toasts ============ */
function toast(message, type = 'info') {
  if (type === 'error') SFX.error();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('#toast-wrap').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, 3200);
}

/* ============ Avatares ============ */
const AVATAR_COLORS = [
  'linear-gradient(135deg,#7c5cff,#9b6cff)', 'linear-gradient(135deg,#46e0c8,#1fb6a0)',
  'linear-gradient(135deg,#ff5c9c,#ff8a5c)', 'linear-gradient(135deg,#5c9cff,#46c8e0)',
  'linear-gradient(135deg,#f6c343,#ff9f43)', 'linear-gradient(135deg,#36d399,#22a06b)',
];
function avatarFor(id, name) {
  let h = 0;
  for (const ch of (id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[h % AVATAR_COLORS.length];
  const initials = (name || '?').trim().slice(0, 2).toUpperCase();
  return { color, initials };
}

/* ============ Conexión ============ */
const connEl = $('#conn');
socket.on('connect', () => {
  connEl.className = 'conn online';
  $('#conn-text').textContent = 'Conectado';
  attemptRejoin();
});
socket.on('disconnect', () => {
  connEl.className = 'conn offline';
  $('#conn-text').textContent = 'Sin conexión';
});

socket.on('toast', ({ type, message }) => toast(message, type));

/* ============ Chat ============ */
socket.on('chat:history', (msgs) => {
  chatMessages = Array.isArray(msgs) ? msgs : [];
  renderChat();
});

socket.on('chat:msg', (msg) => {
  // Quitar mensaje optimista duplicado del mismo autor
  chatMessages = chatMessages.filter((m) => !(m._pending && m.id === msg.id && m.text === msg.text));
  if (!chatMessages.some((m) => m.ts === msg.ts && m.id === msg.id && m.text === msg.text)) {
    chatMessages.push(msg);
  }
  if (chatMessages.length > 80) chatMessages.shift();
  renderChat();
  if (!chatOpen && msg.id !== playerId) {
    chatUnread++;
    updateUnread();
    SFX.msg();
  }
});

function buildChatHtml(m) {
  const mine = m.id === playerId;
  const pending = m._pending ? ' pending' : '';
  return `<div class="chat-msg${mine ? ' mine' : ''}${pending}">
    ${mine ? '' : `<div class="cm-name">${escapeHtml(m.nickname)}</div>`}
    <div class="cm-text">${escapeHtml(m.text)}</div>
  </div>`;
}

function renderChat() {
  const empty = chatMessages.length === 0
    ? '<p class="chat-empty">Aún no hay mensajes.<br/>¡Saluda a tu sala! 👋</p>'
    : chatMessages.map(buildChatHtml).join('');

  const panelBox = $('#chat-messages');
  if (panelBox) {
    panelBox.innerHTML = empty;
    if (chatMessages.length) panelBox.scrollTop = panelBox.scrollHeight;
  }

  const lobbyBox = $('#lobby-chat-msgs');
  if (lobbyBox) {
    lobbyBox.innerHTML = empty;
    if (chatMessages.length) lobbyBox.scrollTop = lobbyBox.scrollHeight;
  }
}

function updateUnread() {
  const badge = $('#chat-unread');
  if (!badge) return;
  if (chatUnread > 0) { badge.hidden = false; badge.textContent = chatUnread > 9 ? '9+' : chatUnread; }
  else badge.hidden = true;
}

function openChat() {
  chatOpen = true;
  chatUnread = 0;
  updateUnread();
  $('#chat-panel')?.classList.add('open');
  renderChat();
  setTimeout(() => $('#chat-input')?.focus(), 50);
}

function closeChat() {
  chatOpen = false;
  $('#chat-panel')?.classList.remove('open');
}

function sendChatMessage(text) {
  if (!room) { toast('Entra en una sala para chatear.', 'error'); return; }
  text = String(text || '').trim();
  if (!text) return;
  const pending = { id: playerId, nickname, text, ts: Date.now(), _pending: true };
  chatMessages.push(pending);
  renderChat();
  socket.emit('chat:send', { text }, (res) => {
    if (res && res.error) {
      chatMessages = chatMessages.filter((m) => m !== pending);
      renderChat();
      toast(res.error, 'error');
    }
  });
}

$('#chat-toggle').addEventListener('click', () => (chatOpen ? closeChat() : openChat()));
$('#chat-close').addEventListener('click', closeChat);
$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  sendChatMessage(input.value);
  input.value = '';
});
$('#lobby-chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#lobby-chat-input');
  sendChatMessage(input.value);
  input.value = '';
});

/* ============ Reacciones ============ */
socket.on('reaction', ({ id, emoji, nickname }) => {
  spawnReaction(emoji, id === playerId ? 'Tú' : nickname);
  SFX.react();
});

function spawnReaction(emoji, name) {
  const layer = $('#reactions-layer');
  const el = document.createElement('div');
  el.className = 'float-react';
  el.style.left = (10 + Math.random() * 80) + '%';
  el.innerHTML = `${emoji}<small>${escapeHtml(name || '')}</small>`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

$('#reaction-bar').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-emoji]');
  if (!btn) return;
  socket.emit('reaction', { emoji: btn.dataset.emoji });
});

/* ============ Sonido toggle ============ */
(function initSoundBtn() {
  const btn = $('#sound-toggle');
  const refresh = () => { btn.textContent = SFX.enabled ? '🔊' : '🔇'; btn.classList.toggle('muted-state', !SFX.enabled); };
  refresh();
  btn.addEventListener('click', () => { SFX.toggle(); refresh(); });
})();

/* ============ Dock de sala ============ */
function showDock() { $('#room-dock').hidden = false; document.body.classList.add('in-room'); }
function hideDock() { $('#room-dock').hidden = true; document.body.classList.remove('in-room'); closeChat(); }

/* ============ Reconexión automática ============ */
function rememberSession() {
  if (room) {
    sessionStorage.setItem('arcade_session', JSON.stringify({ code: room.code, playerId, nickname }));
  }
}
function forgetSession() { sessionStorage.removeItem('arcade_session'); }

function attemptRejoin() {
  const raw = sessionStorage.getItem('arcade_session');
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    const id = s.playerId || playerId;
    if (s.playerId && s.playerId !== playerId) {
      playerId = s.playerId;
      localStorage.setItem(PID_KEY, playerId);
    }
    if (s.nickname) {
      nickname = s.nickname;
      localStorage.setItem('arcade_nick', nickname);
    }
    socket.emit('rejoin', { code: s.code, playerId: id, nickname: s.nickname || nickname }, (res) => {
      if (res && res.ok) {
        room = res.room;
        rememberSession();
        if (room.status !== 'lobby') {
          lastGame = null;
          showScreen('game');
          showDock();
          $('#game-stage').innerHTML = '<p style="text-align:center;padding:2rem;color:var(--muted)">Reconectando a la partida…</p>';
        } else {
          enterRoomScreens();
        }
      } else {
        forgetSession();
      }
    });
  } catch { forgetSession(); }
}

/* ============ Carga de juegos ============ */
async function loadGames() {
  try {
    const res = await fetch('/api/games');
    GAMES = await res.json();
  } catch {
    GAMES = [];
  }
  renderGamesGrid();
  const n = GAMES.length;
  const stat = $('#stat-games');
  if (stat) stat.textContent = String(n);
  const badge = document.querySelector('.hero-badge');
  if (badge && n) badge.textContent = `✨ ${n} juegos · Multijugador en tiempo real`;
}

function renderGamesGrid() {
  const grid = $('#games-grid');
  grid.innerHTML = '';
  for (const g of GAMES) {
    const card = document.createElement('button');
    card.className = 'game-card';
    card.style.setProperty('--card-grad', g.gradient);
    const players = g.minPlayers === g.maxPlayers ? `${g.maxPlayers} jugadores` : `${g.minPlayers}–${g.maxPlayers} jugadores`;
    card.innerHTML = `
      <span class="gc-emoji">${g.emoji}</span>
      <h3>${g.name}</h3>
      <p class="gc-tag">${g.tagline}</p>
      <div class="gc-meta"><span class="pill">👥 ${players}</span></div>
    `;
    card.addEventListener('click', () => createRoomForGame(g.id));
    grid.appendChild(card);
  }
}

/* ============ Crear sala al elegir juego ============ */
function currentNick() {
  const stored = (nickname || localStorage.getItem('arcade_nick') || '').trim().slice(0, 16);
  return stored || 'Jugador';
}

function createRoomForGame(gameId) {
  if (creatingRoom) return;
  selectedGameId = gameId;
  const nick = currentNick();
  nickname = nick;
  localStorage.setItem('arcade_nick', nick);
  creatingRoom = true;
  socket.emit('createRoom', { gameId, nickname: nick, playerId }, (res) => {
    creatingRoom = false;
    if (res.error) return toast(res.error, 'error');
    room = res.room;
    rememberSession();
    enterRoomScreens();
    toast('¡Sala lista! Comparte el código.', 'success');
  });
}

/* ============ Unirse con código ============ */
function openSetup(prefillCode = '') {
  selectedGameId = null;
  $('#nickname').value = nickname || currentNick();
  $('#code-input').value = prefillCode || '';
  showScreen('setup');
  setTimeout(() => (prefillCode ? $('#code-input') : $('#nickname')).focus(), 60);
}

function readNick() {
  nickname = ($('#nickname').value || '').trim().slice(0, 16) || 'Jugador';
  localStorage.setItem('arcade_nick', nickname);
  return nickname;
}

function doJoin(code) {
  const nick = readNick();
  code = (code || '').trim().toUpperCase();
  if (code.length !== 4) return toast('El código tiene 4 caracteres.', 'error');
  socket.emit('joinRoom', { code, nickname: nick, playerId }, (res) => {
    if (res.error) return toast(res.error, 'error');
    room = res.room;
    selectedGameId = room.gameId;
    rememberSession();
    enterRoomScreens();
  });
}

$('#btn-join').addEventListener('click', () => doJoin($('#code-input').value));
$('#code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(e.target.value); });
$('#code-input').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

$('#home-join').addEventListener('click', () => openSetup());
$('#home-play').addEventListener('click', () => $('#games').scrollIntoView({ behavior: 'smooth', block: 'start' }));
$('#brand').addEventListener('click', goHome);
$$('[data-go="home"]').forEach((b) => b.addEventListener('click', goHome));

function goHome() {
  showScreen('home');
}

/* ============ Entrar a sala: lobby o juego ============ */
function enterRoomScreens() {
  if (!room) return;
  showDock();
  if (room.status === 'lobby') {
    renderLobby();
    showScreen('lobby');
  } else {
    showScreen('game');
  }
}

/* ============ Lobby ============ */
socket.on('room:update', (data) => {
  room = data;
  rememberSession();
  if (room.status === 'lobby') {
    renderLobby();
    const onGame = $('#screen-game').classList.contains('active');
    const onLobby = $('#screen-lobby').classList.contains('active');
    // Si volvimos al lobby desde el juego, o aún no estamos en ninguna pantalla de sala.
    if (onGame || (!onLobby && !$('#screen-home').classList.contains('active') && !$('#screen-setup').classList.contains('active'))) {
      showScreen('lobby');
    }
  }
  // Cuando empieza la partida, la pantalla cambia al recibir game:state.
});

function renderLobby() {
  const g = room.meta;
  const isHost = room.hostId === playerId;
  const capacity = room.capacity || g.maxPlayers;
  $('#lobby-game').innerHTML = `<span class="lg-emoji">${g.emoji}</span> ${g.name}`;
  $('#code-text').textContent = room.code;
  $('#players-count').textContent = `${room.players.length}/${capacity}`;
  $('#game-code-pill').textContent = room.code;

  const list = $('#players-list');
  list.innerHTML = '';
  const series = room.series || {};
  room.players.forEach((p) => {
    const { color, initials } = avatarFor(p.id, p.nickname);
    const wins = series[p.id] || 0;
    const li = document.createElement('li');
    li.className = 'player-item';
    li.innerHTML = `
      <span class="dot-status ${p.connected ? '' : 'off'}"></span>
      <span class="avatar" style="background:${color}">${p.isBot ? '🤖' : initials}</span>
      <span class="player-name">${escapeHtml(p.nickname)}</span>
      ${wins > 0 ? `<span class="wins-badge">${wins} 🏆</span>` : ''}
      ${p.isBot ? '<span class="badge-bot">BOT</span>' : ''}
      ${p.id === room.hostId ? '<span class="badge-host">Anfitrión</span>' : ''}
      ${p.id === playerId ? '<span class="badge-you">Tú</span>' : ''}
    `;
    if (isHost && p.isBot) {
      const rm = document.createElement('button');
      rm.className = 'remove-bot';
      rm.textContent = '✕';
      rm.title = 'Quitar bot';
      rm.addEventListener('click', () => socket.emit('removeBot', { id: p.id }, (res) => { if (res && res.error) toast(res.error, 'error'); }));
      li.appendChild(rm);
    }
    list.appendChild(li);
  });
  for (let i = room.players.length; i < capacity; i++) {
    const li = document.createElement('li');
    li.className = 'player-item slot-empty';
    li.innerHTML = `<span class="dot-status off"></span><span class="avatar" style="background:rgba(255,255,255,.08)">+</span><span class="player-name">Esperando jugador…</span>`;
    list.appendChild(li);
  }

  const startBtn = $('#btn-start');
  const enough = room.players.length >= g.minPlayers;
  startBtn.style.display = isHost ? 'flex' : 'none';
  startBtn.disabled = !enough;
  $('#btn-change-game').style.display = isHost ? 'inline-flex' : 'none';

  // Controles de anfitrión: capacidad y bots
  const controls = $('#lobby-controls');
  controls.hidden = !isHost;
  if (isHost) {
    const variable = g.maxPlayers > g.minPlayers;
    $('#cap-control').hidden = !variable;
    $('#cap-value').textContent = capacity;
    $('#cap-minus').disabled = capacity <= Math.max(g.minPlayers, room.players.length);
    $('#cap-plus').disabled = capacity >= g.maxPlayers;
    const bsVerbal = room.gameId === 'battleship' && room.battleshipPlayMode === 'verbal';
    const full = room.players.length >= capacity;
    $('#btn-add-bot').disabled = full || bsVerbal;
    $('#btn-fill-bots').disabled = full || bsVerbal;
    $('#bot-buttons').hidden = bsVerbal;
  }

  renderBattleshipModePicker();

  const hint = $('#lobby-hint');
  const bsVerbal = room.gameId === 'battleship' && room.battleshipPlayMode === 'verbal';
  if (!isHost) hint.textContent = 'Esperando a que el anfitrión empiece la partida…';
  else if (bsVerbal && room.players.some((p) => p.isBot)) hint.textContent = 'Quita los bots para jugar en modo verbal.';
  else if (!enough) hint.textContent = `Necesitas al menos ${g.minPlayers} jugadores. Añade bots si quieres jugar ya.`;
  else if (bsVerbal) hint.textContent = 'Modo verbal: 2 jugadores humanos. Colocad barcos fuera de la app y marcáis aquí.';
  else hint.textContent = '¡Todo listo! Pulsa para empezar.';
  renderChat();
}

const BS_MODE_HINTS = {
  digital: 'Colocación y disparos automáticos en la app.',
  verbal: 'Hablad las coordenadas y marcáis agua, tocado y hundido a mano. Sin bots.',
};

function renderBattleshipModePicker() {
  const picker = $('#bs-mode-picker');
  if (!picker) return;
  if (!room || room.gameId !== 'battleship') {
    picker.hidden = true;
    return;
  }
  picker.hidden = false;
  const mode = room.battleshipPlayMode || 'digital';
  const isHost = room.hostId === playerId;
  $$('.bs-mode-opt').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
    btn.disabled = !isHost;
  });
  const hintEl = $('#bs-mode-hint');
  if (hintEl) hintEl.textContent = BS_MODE_HINTS[mode] || '';
}

/* ============ Controles de anfitrión (capacidad + bots) ============ */
$('#cap-minus').addEventListener('click', () => changeCapacity(-1));
$('#cap-plus').addEventListener('click', () => changeCapacity(1));
function changeCapacity(delta) {
  if (!room) return;
  const next = (room.capacity || room.meta.maxPlayers) + delta;
  socket.emit('setCapacity', { capacity: next }, (res) => { if (res && res.error) toast(res.error, 'error'); });
}
$('#btn-add-bot').addEventListener('click', () => socket.emit('addBot', (res) => { if (res && res.error) toast(res.error, 'error'); }));
$('#btn-fill-bots').addEventListener('click', () => socket.emit('fillBots', (res) => { if (res && res.error) toast(res.error, 'error'); }));

$$('.bs-mode-opt').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!room || room.hostId !== playerId) return;
    socket.emit('setBattleshipMode', { mode: btn.dataset.mode }, (res) => {
      if (res && res.error) toast(res.error, 'error');
    });
  });
});

/* ============ Selector de juego (cambiar en el lobby) ============ */
$('#btn-change-game').addEventListener('click', openPicker);
$('#picker-close').addEventListener('click', () => $('#game-picker').classList.remove('show'));
$('#game-picker').addEventListener('click', (e) => { if (e.target.id === 'game-picker') $('#game-picker').classList.remove('show'); });

function openPicker() {
  const grid = $('#picker-grid');
  grid.innerHTML = '';
  GAMES.forEach((g) => {
    const item = document.createElement('button');
    item.className = 'picker-item' + (room && g.id === room.gameId ? ' current' : '');
    const players = g.minPlayers === g.maxPlayers ? `${g.maxPlayers}` : `${g.minPlayers}–${g.maxPlayers}`;
    item.innerHTML = `<div class="pi-emoji">${g.emoji}</div><div class="pi-name">${g.name}</div><div class="pi-players">👥 ${players}</div>`;
    item.addEventListener('click', () => {
      if (room && g.id === room.gameId) { $('#game-picker').classList.remove('show'); return; }
      socket.emit('changeGame', { gameId: g.id }, (res) => {
        if (res && res.error) toast(res.error, 'error');
        else { $('#game-picker').classList.remove('show'); toast(`Juego cambiado a ${g.name}`, 'success'); }
      });
    });
    grid.appendChild(item);
  });
  $('#game-picker').classList.add('show');
}

$('#btn-start').addEventListener('click', () => {
  socket.emit('startGame', (res) => { if (res && res.error) toast(res.error, 'error'); });
});

$('#code-value').addEventListener('click', () => copyText(room.code, 'Código copiado'));
$('#share-link').addEventListener('click', () => {
  const url = `${location.origin}/?room=${room.code}`;
  copyText(url, 'Enlace de invitación copiado');
});

function copyText(text, msg) {
  navigator.clipboard?.writeText(text).then(() => toast(msg, 'success')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(msg, 'success'); } catch { toast('No se pudo copiar', 'error'); }
    ta.remove();
  });
}

$('#leave-lobby').addEventListener('click', leaveRoom);
$('#leave-game').addEventListener('click', () => { if (confirm('¿Salir de la partida?')) leaveRoom(); });

function leaveRoom() {
  socket.emit('leaveRoom');
  forgetSession();
  room = null; lastGame = null; selectedGameId = null;
  chatMessages = []; chatUnread = 0; updateUnread();
  hideDock();
  hideOverlay();
  goHome();
}

/* ============ Juego ============ */
socket.on('game:state', (payload) => {
  lastGame = payload;
  if (!$('#screen-game').classList.contains('active')) showScreen('game');
  renderGame();
});

function renderGame() {
  const { view, meta, players, hostId } = lastGame;
  $('#game-title').innerHTML = `<span>${meta.emoji}</span> ${meta.name}${view.playMode === 'verbal' ? ' <span class="game-mode-pill">Verbal</span>' : ''}`;
  $('#game-code-pill').textContent = room ? room.code : '';

  const playersById = {};
  players.forEach((p) => (playersById[p.id] = p));

  const ctx = {
    root: $('#game-stage'),
    view, meta, players, playersById, hostId,
    me: playerId,
    send: (action) => {
      const { silent, ...payload } = action;
      socket.emit('gameAction', { action: payload }, (res) => { if (res && res.error) toast(res.error, 'error'); });
    },
    toast,
    nameOf: (id) => (playersById[id] ? playersById[id].nickname : 'Jugador'),
    avatarFor,
  };

  updateTurnBanner(ctx);

  ctx.root.dataset.game = meta.id;
  $('#screen-game').dataset.game = meta.id;

  const renderer = gameRenderers[meta.id];
  if (renderer) renderer(ctx);
  else $('#game-stage').textContent = 'Juego no disponible.';

  bindGameFit(ctx.root);
  requestAnimationFrame(() => bindGameFit(ctx.root));

  handleGameOver(ctx);
}

let prevTurnMine = false;
function updateTurnBanner(ctx) {
  const banner = $('#turn-banner');
  const v = ctx.view;
  if (v.playMode === 'verbal') { banner.style.display = 'none'; prevTurnMine = false; return; }
  if (v.status === 'finished') { banner.style.display = 'none'; prevTurnMine = false; return; }
  banner.style.display = 'block';

  if (v.turn !== undefined && v.turn !== null) {
    const isMe = v.turn === ctx.me;
    if (isMe && !prevTurnMine) SFX.turnFor(ctx.meta?.id);
    prevTurnMine = isMe;
    banner.classList.toggle('my-turn', isMe);
    banner.innerHTML = isMe ? '🎯 <strong>¡Es tu turno!</strong>' : `Turno de <span class="tb-name">${escapeHtml(ctx.nameOf(v.turn))}</span>`;
  } else {
    banner.classList.remove('my-turn');
    banner.innerHTML = '';
    banner.style.display = 'none';
  }
}

/* ============ Fin de partida ============ */
let overlayTimer = null;
function handleGameOver(ctx) {
  const v = ctx.view;
  if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = null; }
  if (v.status !== 'finished') { hideOverlay(); return; }

  overlayTimer = setTimeout(() => {
    const isHost = ctx.hostId === ctx.me;
    let emoji = '🏆', title = '', sub = '';
    const gid = ctx.meta?.id;
    if (v.winner === null || v.winner === undefined) {
      emoji = '🤝'; title = '¡Empate!'; sub = 'Nadie se lleva la victoria esta vez.';
    } else if (v.winner === ctx.me) {
      emoji = '🎉'; title = '¡Has ganado!'; sub = '¡Enhorabuena, gran partida!';
    } else {
      emoji = '😮'; title = `Ganó ${ctx.nameOf(v.winner)}`; sub = '¡La próxima será la tuya!';
    }
    $('#overlay-emoji').textContent = emoji;
    $('#overlay-title').textContent = title;
    $('#overlay-sub').textContent = sub;
    renderSeries($('#series-board'), lastGame.series, ctx.players);
    $('#btn-rematch').style.display = isHost ? 'inline-flex' : 'none';
    $('#btn-lobby').style.display = isHost ? 'inline-flex' : 'none';
    if (!isHost) $('#overlay-sub').textContent = sub + ' Esperando al anfitrión…';
    showOverlay();
  }, 900);
}

function renderSeries(container, series, players) {
  if (!container) return;
  container.innerHTML = '';
  if (!series || !players) return;
  const sorted = [...players].sort((a, b) => (series[b.id] || 0) - (series[a.id] || 0));
  const header = document.createElement('div');
  header.style.cssText = 'color:var(--muted);font-size:.82rem;text-transform:uppercase;letter-spacing:1px';
  header.textContent = 'Victorias en la sala';
  container.appendChild(header);
  sorted.forEach((p, i) => {
    const { color, initials } = avatarFor(p.id, p.nickname);
    const row = document.createElement('div');
    row.className = 'series-row';
    row.innerHTML = `${i === 0 && (series[p.id] || 0) > 0 ? '👑' : `<span class="avatar" style="width:28px;height:28px;font-size:.8rem;background:${color}">${initials}</span>`}
      <span class="sr-name">${escapeHtml(p.nickname)}${p.id === playerId ? ' (Tú)' : ''}</span>
      <span class="sr-wins">${series[p.id] || 0} 🏆</span>`;
    container.appendChild(row);
  });
}

function showOverlay() { $('#overlay').classList.add('show'); }
function hideOverlay() { $('#overlay').classList.remove('show'); }

$('#btn-rematch').addEventListener('click', () => {
  socket.emit('rematch', (res) => { if (res && res.error) toast(res.error, 'error'); else hideOverlay(); });
});
$('#btn-lobby').addEventListener('click', () => {
  socket.emit('backToLobby', (res) => { if (res && res.error) toast(res.error, 'error'); else hideOverlay(); });
});

/* ============ Utilidades ============ */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
window.escapeHtml = escapeHtml;

/* ============ Init ============ */
loadGames();
(function checkUrlRoom() {
  const params = new URLSearchParams(location.search);
  const code = params.get('room');
  if (code) {
    history.replaceState({}, '', '/');
    setTimeout(() => openSetup(code.toUpperCase()), 300);
  }
})();
