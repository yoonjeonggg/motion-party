import type { Server, Socket } from 'socket.io';
import {
  createRoom,
  findRoomBySocketId,
  findRoomByPlayerId,
  joinRoom,
  markCalibrated,
  toPublicPlayers,
} from './roomManager.js';
import {
  backToLobby,
  cleanupRoom,
  forfeitToRemainingPlayer,
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
      socket.emit('room:created', {
        roomId: room.id,
        code: room.code,
        playerId: player.id,
        side: player.side,
        mode: room.mode,
        gameType: room.gameType,
      });
      io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room), status: room.status });
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
    socket.emit('room:joined', {
      roomId: room.id,
      code: room.code,
      playerId: player.id,
      side: player.side,
      mode: room.mode,
      gameType: room.gameType,
    });
    io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room), status: room.status });
    tryStartMatch(io, room);
  });

  on<{ roomId: string; playerId: string; motionScore: number; expressionScore?: number }>(
    socket,
    'input:power',
    ({ roomId, playerId, motionScore, expressionScore }) => {
      const found = findRoomByPlayerId(roomId, playerId);
      if (!found) return;
      const { player } = found;
      player.motionScore = Math.max(0, Math.min(1, motionScore));
      player.expressionScore = Math.max(0, Math.min(1, expressionScore ?? 0));
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
      io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room), status: room.status });
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

    io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room), status: room.status });
    socket.emit('player:reconnect', { playerId: player.id, roomId: room.id, ok: true });

    const opponentConnected = room.players.every((p) => p.connectionStatus === 'CONNECTED');
    if (room.status === 'PAUSED' && opponentConnected) {
      resumeAfterReconnect(io, room);
    }
  });

  on<{ roomId: string }>(socket, 'room:rematch', ({ roomId }) => {
    const found = findRoomBySocketId(socket.id);
    if (!found || found.room.id !== roomId) return;
    backToLobby(found.room);
    logger.info({ roomId }, 'room rematch requested');
    io.to(roomId).emit('room:player_joined', { players: toPublicPlayers(found.room), status: found.room.status });
    tryStartMatch(io, found.room);
  });

  on<void>(socket, 'disconnect', () => {
    const found = findRoomBySocketId(socket.id);
    if (!found) return;
    const { room, player } = found;
    player.connectionStatus = 'DISCONNECTED';

    if (room.status === 'LOBBY' || room.status === 'CALIBRATING' || room.status === 'READY') {
      room.players = room.players.filter((p) => p.id !== player.id);
      logger.info({ roomId: room.id, playerId: player.id }, 'player left before match start');
      if (room.players.length === 0) {
        logger.info({ roomId: room.id }, 'room emptied, cleaning up');
        cleanupRoom(room.id);
        return;
      }
      room.status = 'LOBBY';
      io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room), status: room.status });
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
