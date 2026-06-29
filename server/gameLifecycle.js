/** Sincroniza el estado de partida cuando alguien abandona la sala. */
export function syncGameAfterPlayerLeft(room, leftPlayerId, game) {
  const state = room.state;
  if (!state || room.status !== 'playing') return null;

  if (Array.isArray(state.order)) {
    state.order = state.order.filter((id) => room.players.has(id));
  }

  if (game.syncAfterLeave) {
    return game.syncAfterLeave(state, leftPlayerId, room);
  }

  if (state.turn !== undefined && Array.isArray(state.order) && state.order.length) {
    const canPlay = (id) => {
      const p = room.players.get(id);
      return p && (p.isBot || p.connected);
    };
    if (!room.players.has(state.turn) || !canPlay(state.turn)) {
      const next = state.order.find(canPlay);
      if (next) state.turn = next;
    }
  }

  return { state };
}
