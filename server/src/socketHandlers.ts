import type { Server, Socket } from 'socket.io';
import {
  createRoom,
  destroyRoom,
  findRoomBySocketId,
  findRoomByPlayerId,
  joinRoom,
  markCalibrated,
  removePlayer,
  resetRoomToLobby,
  toPublicPlayers,
} from './roomManager.js';
import {
  forfeitToRemainingPlayer,
  isPausable,
  pauseForDisconnect,
  resumeAfterReconnect,
  tryStartMatch,
} from './gameLoop.js';
import { DEFAULT_GAME_TYPE, isKnownGameType } from './games/registry.js';
import { logger } from './logger.js';
import { isRoomMode, NICKNAME_MAX_LENGTH, RECONNECT_GRACE_MS, type Player, type Room } from './types.js';

/**
 * Wraps a socket event handler so a bug handling one player's message logs and
 * stays contained, instead of throwing inside socket.io's event loop and
 * crashing the process for every other room's live match.
 */
function on<T>(socket: Socket, event: string, handler: (payload: Partial<T>) => void): void {
  socket.on(event, (payload: unknown) => {
    try {
      // Payloads come straight off the wire: a missing/non-object payload becomes {} so
      // handlers can destructure safely and validate each field themselves.
      handler(payload !== null && typeof payload === 'object' ? (payload as Partial<T>) : {});
    } catch (err) {
      logger.error({ event, socketId: socket.id, err }, 'socket handler error');
    }
  });
}

/** Clamps to [0, 1]; anything that isn't a finite number (NaN, strings, objects) counts as 0. */
function clamp01(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, n));
}

function sanitizeNickname(value: unknown, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim().slice(0, NICKNAME_MAX_LENGTH) : '';
  return trimmed || fallback;
}

/**
 * Looks up the player a message claims to be from, but only if it really came from that
 * player's current socket - otherwise anyone who learned a playerId could drive their input.
 */
function findOwnPlayer(socket: Socket, roomId: unknown, playerId: unknown) {
  if (typeof roomId !== 'string' || typeof playerId !== 'string') return undefined;
  const found = findRoomByPlayerId(roomId, playerId);
  return found && found.player.socketId === socket.id ? found : undefined;
}

/** Pushes the current roster and room status to everyone in the room. */
function broadcastRoster(io: Server, room: Room): void {
  io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room), status: room.status });
}

/** What a client needs to remember about the room it just entered (room:created / room:joined). */
function sessionPayload(room: Room, player: Player) {
  return {
    roomId: room.id,
    code: room.code,
    playerId: player.id,
    side: player.side,
    mode: room.mode,
    gameType: room.gameType,
  };
}

export function registerSocketHandlers(io: Server, socket: Socket): void {
  on<{ nickname: string; mode: string; gameType: string }>(
    socket,
    'room:create',
    ({ nickname, mode, gameType }) => {
      leaveCurrentRoom(io, socket);
      const { room, player } = createRoom(
        socket.id,
        sanitizeNickname(nickname, '방장'),
        isRoomMode(mode) ? mode : '1v1',
        isKnownGameType(gameType) ? gameType : DEFAULT_GAME_TYPE,
      );
      socket.join(room.id);
      logger.info(
        { roomId: room.id, code: room.code, mode: room.mode, gameType: room.gameType, playerId: player.id },
        'room created',
      );
      socket.emit('room:created', sessionPayload(room, player));
      broadcastRoster(io, room);
    },
  );

  on<{ code: string; nickname: string }>(socket, 'room:join', ({ code, nickname }) => {
    const current = findRoomBySocketId(socket.id);
    if (current && typeof code === 'string' && current.room.code === code.trim().toUpperCase()) {
      // Already in this room (double-click / duplicate emit): just resend the session.
      socket.emit('room:joined', sessionPayload(current.room, current.player));
      return;
    }
    const result = joinRoom(code, socket.id, sanitizeNickname(nickname, '참가자'));
    if (!result.ok) {
      logger.warn({ code, reason: result.reason }, 'room join rejected');
      socket.emit('room:join_error', { reason: result.reason });
      return;
    }
    const { room, player } = result;
    // Only leave the old room once the new one has accepted us - a typo'd code shouldn't kick us out.
    // (joinRoom already registered the new player under this socket id, so detach the old one by id.)
    if (current) leaveRoomAsPlayer(io, socket, current.room, current.player);
    socket.join(room.id);
    logger.info(
      { roomId: room.id, code: room.code, playerId: player.id, side: player.side, playerCount: room.players.length },
      'player joined room',
    );
    socket.emit('room:joined', sessionPayload(room, player));
    broadcastRoster(io, room);
    tryStartMatch(io, room);
  });

  on<{ roomId: string; playerId: string; motionScore: number; expressionScore: number }>(
    socket,
    'input:power',
    ({ roomId, playerId, motionScore, expressionScore }) => {
      const found = findOwnPlayer(socket, roomId, playerId);
      if (!found) return;
      const { player } = found;
      player.motionScore = clamp01(motionScore);
      player.expressionScore = clamp01(expressionScore);
      player.lastInputAt = Date.now();
    },
  );

  on<{ roomId: string; playerId: string; baseline: number }>(
    socket,
    'calibration:submit',
    ({ roomId, playerId }) => {
      const found = findOwnPlayer(socket, roomId, playerId);
      if (!found) return;
      const { room, player } = found;
      const allDone = markCalibrated(room, player.id);
      logger.info({ roomId, playerId, allDone }, 'calibration submitted');
      broadcastRoster(io, room);
      if (allDone) tryStartMatch(io, room);
    },
  );

  on<{ roomId: string; playerId: string }>(socket, 'player:reconnect', ({ roomId, playerId }) => {
    const found =
      typeof roomId === 'string' && typeof playerId === 'string' ? findRoomByPlayerId(roomId, playerId) : undefined;
    if (!found) {
      socket.emit('player:reconnect_error', { reason: 'NOT_FOUND' });
      return;
    }
    const { room, player } = found;
    const timer = room.disconnectTimers[player.id];
    if (timer) {
      clearTimeout(timer);
      delete room.disconnectTimers[player.id];
    }
    player.socketId = socket.id;
    player.connectionStatus = 'CONNECTED';
    player.lastInputAt = Date.now();
    socket.join(room.id);
    logger.info({ roomId, playerId }, 'player reconnected');

    broadcastRoster(io, room);
    socket.emit('player:reconnect', { playerId: player.id, roomId: room.id, ok: true });

    const everyoneConnected = room.players.every((p) => p.connectionStatus === 'CONNECTED');
    if (room.status === 'PAUSED' && everyoneConnected) {
      resumeAfterReconnect(io, room);
    }
  });

  on<{ roomId: string }>(socket, 'room:rematch', ({ roomId }) => {
    const found = findRoomBySocketId(socket.id);
    if (!found || found.room.id !== roomId) return;
    const { room } = found;
    // Only a finished match can be reset - the second player's late click (or a stray emit)
    // must not wipe the scores of the rematch that's already under way.
    if (room.status !== 'MATCH_RESULT') return;
    resetRoomToLobby(room);
    logger.info({ roomId }, 'room rematch requested');
    broadcastRoster(io, room);
    tryStartMatch(io, room);
  });

  on<void>(socket, 'disconnect', () => leaveCurrentRoom(io, socket));
}

/** Takes this socket's player out of the room it's currently in, if any. */
function leaveCurrentRoom(io: Server, socket: Socket): void {
  const found = findRoomBySocketId(socket.id);
  if (found) leaveRoomAsPlayer(io, socket, found.room, found.player);
}

/**
 * Before/after a match the player simply leaves; mid-match the room pauses and they get
 * RECONNECT_GRACE_MS to come back. Used for real disconnects and when a socket
 * creates/joins a different room.
 */
function leaveRoomAsPlayer(io: Server, socket: Socket, room: Room, player: Player): void {
  socket.leave(room.id);
  player.connectionStatus = 'DISCONNECTED';
  // Detach from this socket so a later lookup by socket id (e.g. its real disconnect) doesn't find it again.
  player.socketId = '';

  // Not mid-match (before it starts, or after it's over): just leave the room, no forfeit timer.
  if (!isPausable(room.status) && room.status !== 'PAUSED') {
    const matchOver = room.status === 'MATCH_RESULT';
    removePlayer(room, player.id);
    logger.info({ roomId: room.id, playerId: player.id, matchOver }, 'player left room');
    if (room.players.length === 0) {
      logger.info({ roomId: room.id }, 'room emptied, cleaning up');
      destroyRoom(room.id);
      return;
    }
    // After a finished match, clear the old scores so a refilled room starts a fresh match.
    if (matchOver) resetRoomToLobby(room);
    room.status = 'LOBBY';
    broadcastRoster(io, room);
    return;
  }

  logger.info({ roomId: room.id, playerId: player.id, side: player.side }, 'player disconnected mid-match');
  io.to(room.id).emit('player:disconnect', { playerId: player.id, side: player.side });
  pauseForDisconnect(room);

  room.disconnectTimers[player.id] = setTimeout(() => {
    try {
      handleGraceExpired(io, room, player);
    } catch (err) {
      logger.error({ roomId: room.id, playerId: player.id, err }, 'grace expiry error');
    }
  }, RECONNECT_GRACE_MS);
}

export function handleGraceExpired(io: Server, room: Room, disconnectedPlayer: Player): void {
  delete room.disconnectTimers[disconnectedPlayer.id];
  if (room.status !== 'PAUSED') return;
  const player = room.players.find((p) => p.id === disconnectedPlayer.id);
  if (!player || player.connectionStatus === 'CONNECTED') return;
  logger.info({ roomId: room.id, playerId: player.id, side: player.side }, 'reconnect grace expired, forfeiting');
  forfeitToRemainingPlayer(io, room, player.side);

  // The match is over, so everyone still disconnected is gone for good. Keeping them would
  // leave ghost seats that make a rematch start with an absent player (or leak an empty room).
  for (const p of room.players.filter((p) => p.connectionStatus === 'DISCONNECTED')) {
    removePlayer(room, p.id);
  }
  if (room.players.length === 0) {
    logger.info({ roomId: room.id }, 'room emptied after forfeit, cleaning up');
    destroyRoom(room.id);
    return;
  }
  broadcastRoster(io, room);
}
