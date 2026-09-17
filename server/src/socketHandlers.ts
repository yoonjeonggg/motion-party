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
import { RECONNECT_GRACE_MS, type Player, type Room, type RoomMode } from './types.js';

export function registerSocketHandlers(io: Server, socket: Socket): void {
  socket.on('room:create', ({ nickname, mode }: { nickname: string; mode?: RoomMode }) => {
    const { room, player } = createRoom(socket.id, nickname || '방장', mode ?? '1v1');
    socket.join(room.id);
    socket.emit('room:created', {
      roomId: room.id,
      code: room.code,
      playerId: player.id,
      side: player.side,
      mode: room.mode,
    });
    io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room), status: room.status });
  });

  socket.on('room:join', ({ code, nickname }: { code: string; nickname: string }) => {
    const result = joinRoom(code, socket.id, nickname || '참가자');
    if (!result.ok) {
      socket.emit('room:join_error', { reason: result.reason });
      return;
    }
    const { room, player } = result;
    socket.join(room.id);
    socket.emit('room:joined', {
      roomId: room.id,
      code: room.code,
      playerId: player.id,
      side: player.side,
      mode: room.mode,
    });
    io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room), status: room.status });
    tryStartMatch(io, room);
  });

  socket.on(
    'input:power',
    ({
      roomId,
      playerId,
      motionScore,
      expressionScore,
    }: {
      roomId: string;
      playerId: string;
      motionScore: number;
      expressionScore?: number;
    }) => {
      const found = findRoomByPlayerId(roomId, playerId);
      if (!found) return;
      const { player } = found;
      player.motionScore = Math.max(0, Math.min(1, motionScore));
      player.expressionScore = Math.max(0, Math.min(1, expressionScore ?? 0));
      player.lastInputAt = Date.now();
    },
  );

  socket.on(
    'calibration:submit',
    ({ roomId, playerId }: { roomId: string; playerId: string; baseline: number }) => {
      const found = findRoomByPlayerId(roomId, playerId);
      if (!found) return;
      const { room } = found;
      const allDone = markCalibrated(room, playerId);
      io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room), status: room.status });
      if (allDone) tryStartMatch(io, room);
    },
  );

  socket.on('player:reconnect', ({ roomId, playerId }: { roomId: string; playerId: string }) => {
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

    io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room), status: room.status });
    socket.emit('player:reconnect', { playerId: player.id, roomId: room.id, ok: true });

    const opponentConnected = room.players.every((p) => p.connectionStatus === 'CONNECTED');
    if (room.status === 'PAUSED' && opponentConnected) {
      resumeAfterReconnect(io, room);
    }
  });

  socket.on('room:rematch', ({ roomId }: { roomId: string }) => {
    const found = findRoomBySocketId(socket.id);
    if (!found || found.room.id !== roomId) return;
    backToLobby(found.room);
    io.to(roomId).emit('room:player_joined', { players: toPublicPlayers(found.room), status: found.room.status });
    tryStartMatch(io, found.room);
  });

  socket.on('disconnect', () => {
    const found = findRoomBySocketId(socket.id);
    if (!found) return;
    const { room, player } = found;
    player.connectionStatus = 'DISCONNECTED';

    if (room.status === 'LOBBY' || room.status === 'CALIBRATING' || room.status === 'READY') {
      room.players = room.players.filter((p) => p.id !== player.id);
      if (room.players.length === 0) {
        cleanupRoom(room.id);
        return;
      }
      room.status = 'LOBBY';
      io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room), status: room.status });
      return;
    }

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
  forfeitToRemainingPlayer(io, room, player.side);
}
