import type { Server, Socket } from 'socket.io';
import {
  createRoom,
  destroyRoom,
  findRoomBySocketId,
  findRoomByPlayerId,
  joinRoom,
  markCalibrated,
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
import { DEFAULT_GAME_TYPE } from './games/registry.js';
import { logger } from './logger.js';
import { RECONNECT_GRACE_MS, type Player, type Room, type RoomMode } from './types.js';

/**
 * Wraps a socket event handler so a bug handling one player's message logs and
 * stays contained, instead of throwing inside socket.io's event loop and
 * crashing the process for every other room's live match.
 */
function on<T>(socket: Socket, event: string, handler: (payload: T) => void): void {
  socket.on(event, (payload: T) => {
    try {
      handler(payload);
    } catch (err) {
      logger.error({ event, socketId: socket.id, err }, 'socket handler error');
    }
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
  on<{ nickname: string; mode?: RoomMode; gameType?: string }>(
    socket,
    'room:create',
    ({ nickname, mode, gameType }) => {
      const { room, player } = createRoom(socket.id, nickname || '방장', mode ?? '1v1', gameType ?? DEFAULT_GAME_TYPE);
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
    const result = joinRoom(code, socket.id, nickname || '참가자');
    if (!result.ok) {
      logger.warn({ code, reason: result.reason }, 'room join rejected');
      socket.emit('room:join_error', { reason: result.reason });
      return;
    }
    const { room, player } = result;
    socket.join(room.id);
    logger.info(
      { roomId: room.id, code: room.code, playerId: player.id, side: player.side, playerCount: room.players.length },
      'player joined room',
    );
    socket.emit('room:joined', sessionPayload(room, player));
    broadcastRoster(io, room);
    tryStartMatch(io, room);
  });

  on<{ roomId: string; playerId: string; motionScore: number; expressionScore?: number }>(
    socket,
    'input:power',
    ({ roomId, playerId, motionScore, expressionScore }) => {
      const found = findRoomByPlayerId(roomId, playerId);
      if (!found) return;
      const { player } = found;
      player.motionScore = clamp01(motionScore);
      player.expressionScore = clamp01(expressionScore ?? 0);
      player.lastInputAt = Date.now();
    },
  );

  on<{ roomId: string; playerId: string; baseline: number }>(
    socket,
    'calibration:submit',
    ({ roomId, playerId }) => {
      const found = findRoomByPlayerId(roomId, playerId);
      if (!found) return;
      const { room } = found;
      const allDone = markCalibrated(room, playerId);
      logger.info({ roomId, playerId, allDone }, 'calibration submitted');
      broadcastRoster(io, room);
      if (allDone) tryStartMatch(io, room);
    },
  );

  on<{ roomId: string; playerId: string }>(socket, 'player:reconnect', ({ roomId, playerId }) => {
    const found = findRoomByPlayerId(roomId, playerId);
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
    resetRoomToLobby(room);
    logger.info({ roomId }, 'room rematch requested');
    broadcastRoster(io, room);
    tryStartMatch(io, room);
  });

  on<void>(socket, 'disconnect', () => {
    const found = findRoomBySocketId(socket.id);
    if (!found) return;
    const { room, player } = found;
    player.connectionStatus = 'DISCONNECTED';

    // Not mid-match (before it starts, or after it's over): just leave the room, no forfeit timer.
    if (!isPausable(room.status) && room.status !== 'PAUSED') {
      const matchOver = room.status === 'MATCH_RESULT';
      room.players = room.players.filter((p) => p.id !== player.id);
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
      handleGraceExpired(io, room, player);
    }, RECONNECT_GRACE_MS);
  });
}

function handleGraceExpired(io: Server, room: Room, disconnectedPlayer: Player): void {
  if (room.status !== 'PAUSED') return;
  const player = room.players.find((p) => p.id === disconnectedPlayer.id);
  if (!player || player.connectionStatus === 'CONNECTED') return;
  logger.info({ roomId: room.id, playerId: player.id, side: player.side }, 'reconnect grace expired, forfeiting');
  forfeitToRemainingPlayer(io, room, player.side);
}
