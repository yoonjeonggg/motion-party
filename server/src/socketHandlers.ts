import type { Server, Socket } from 'socket.io';
import {
  createRoom,
  findRoomBySocketId,
  findRoomByPlayerId,
  joinRoom,
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
import { RECONNECT_GRACE_MS, type Room, type Side } from './types.js';

export function registerSocketHandlers(io: Server, socket: Socket): void {
  socket.on('room:create', ({ nickname }: { nickname: string }) => {
    const { room, player } = createRoom(socket.id, nickname || '방장');
    socket.join(room.id);
    socket.emit('room:created', { roomId: room.id, code: room.code, playerId: player.id, side: player.side });
    io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room) });
  });

  socket.on('room:join', ({ code, nickname }: { code: string; nickname: string }) => {
    const result = joinRoom(code, socket.id, nickname || '참가자');
    if (!result.ok) {
      socket.emit('room:join_error', { reason: result.reason });
      return;
    }
    const { room, player } = result;
    socket.join(room.id);
    socket.emit('room:joined', { roomId: room.id, code: room.code, playerId: player.id, side: player.side });
    io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room) });
    tryStartMatch(io, room);
  });

  socket.on('input:power', ({ roomId, playerId, motionScore }: { roomId: string; playerId: string; motionScore: number }) => {
    const found = findRoomByPlayerId(roomId, playerId);
    if (!found) return;
    const { player } = found;
    player.motionScore = Math.max(0, Math.min(1, motionScore));
    player.lastInputAt = Date.now();
  });

  socket.on('player:reconnect', ({ roomId, playerId }: { roomId: string; playerId: string }) => {
    const found = findRoomByPlayerId(roomId, playerId);
    if (!found) {
      socket.emit('player:reconnect_error', { reason: 'NOT_FOUND' });
      return;
    }
    const { room, player } = found;
    const timer = room.disconnectTimers[player.side];
    if (timer) {
      clearTimeout(timer);
      delete room.disconnectTimers[player.side];
    }
    player.socketId = socket.id;
    player.connectionStatus = 'CONNECTED';
    socket.join(room.id);

    io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room) });
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
    io.to(roomId).emit('room:player_joined', { players: toPublicPlayers(found.room) });
    tryStartMatch(io, found.room);
  });

  socket.on('disconnect', () => {
    const found = findRoomBySocketId(socket.id);
    if (!found) return;
    const { room, player } = found;
    player.connectionStatus = 'DISCONNECTED';

    if (room.status === 'LOBBY' || room.status === 'READY') {
      room.players = room.players.filter((p) => p.id !== player.id);
      if (room.players.length === 0) {
        cleanupRoom(room.id);
        return;
      }
      room.status = 'LOBBY';
      io.to(room.id).emit('room:player_joined', { players: toPublicPlayers(room) });
      return;
    }

    io.to(room.id).emit('player:disconnect', { playerId: player.id, side: player.side });
    pauseForDisconnect(room);

    room.disconnectTimers[player.side] = setTimeout(() => {
      handleGraceExpired(io, room, player.side);
    }, RECONNECT_GRACE_MS);
  });
}

function handleGraceExpired(io: Server, room: Room, disconnectedSide: Side): void {
  if (room.status !== 'PAUSED') return;
  const player = room.players.find((p) => p.side === disconnectedSide);
  if (player?.connectionStatus === 'CONNECTED') return;
  forfeitToRemainingPlayer(io, room, disconnectedSide);
}
