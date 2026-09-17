import type { Server } from 'socket.io';
import {
  opposite,
  roomCapacity,
  ROUND_RESULT_DELAY_MS,
  ROUND_TIME_LIMIT_MS,
  TICK_RATE_MS,
  WINS_NEEDED,
  type Room,
  type Side,
} from './types.js';
import { destroyRoom, resetRoomToLobby } from './roomManager.js';
import { getMiniGame } from './games/registry.js';
import { logger } from './logger.js';

function broadcastState(io: Server, room: Room): void {
  io.to(room.id).emit('game:state', {
    tick: Date.now(),
    ...getMiniGame(room.gameType).broadcastPayload(room),
    roundNumber: room.roundNumber,
    roundWins: room.roundWins,
    status: room.status,
  });
}

/** Starts (or restarts) the tick interval, guarding each tick so one bad frame doesn't kill the room's loop. */
function startTickLoop(io: Server, room: Room): void {
  if (room.loopHandle) clearInterval(room.loopHandle);
  room.loopHandle = setInterval(() => {
    try {
      tick(io, room);
    } catch (err) {
      logger.error({ roomId: room.id, gameType: room.gameType, err }, 'tick error');
    }
  }, TICK_RATE_MS);
}

function startRound(io: Server, room: Room): void {
  room.roundNumber += 1;
  room.roundStartedAt = Date.now();
  room.status = 'PLAYING';
  getMiniGame(room.gameType).resetRound(room);

  logger.info({ roomId: room.id, gameType: room.gameType, roundNumber: room.roundNumber }, 'round started');

  io.to(room.id).emit('game:start', {
    roomId: room.id,
    mode: room.mode,
    roundNumber: room.roundNumber,
  });

  startTickLoop(io, room);
}

function endRound(io: Server, room: Room, winner: Side): void {
  if (room.loopHandle) {
    clearInterval(room.loopHandle);
    room.loopHandle = null;
  }
  room.roundWins[winner] += 1;
  room.status = 'ROUND_RESULT';

  logger.info(
    { roomId: room.id, winner, roundNumber: room.roundNumber, scores: room.roundWins },
    'round ended',
  );

  io.to(room.id).emit('game:round_end', {
    winner,
    roundNumber: room.roundNumber,
    scores: room.roundWins,
  });

  if (room.roundWins[winner] >= WINS_NEEDED) {
    endMatch(io, room, winner, 'ROUND_WINS');
    return;
  }

  room.roundResultTimeout = setTimeout(() => {
    if (room.status === 'ROUND_RESULT') {
      startRound(io, room);
    }
  }, ROUND_RESULT_DELAY_MS);
}

export function endMatch(
  io: Server,
  room: Room,
  winner: Side,
  reason: 'ROUND_WINS' | 'DISCONNECT',
): void {
  if (room.loopHandle) {
    clearInterval(room.loopHandle);
    room.loopHandle = null;
  }
  if (room.roundResultTimeout) {
    clearTimeout(room.roundResultTimeout);
    room.roundResultTimeout = null;
  }
  room.status = 'MATCH_RESULT';

  logger.info({ roomId: room.id, winner, reason, finalScores: room.roundWins }, 'match ended');

  io.to(room.id).emit('game:match_end', {
    winner,
    finalScores: room.roundWins,
    reason,
  });
}

function tick(io: Server, room: Room): void {
  const result = getMiniGame(room.gameType).tick(room);
  broadcastState(io, room);

  if (result.ended && result.winner) {
    endRound(io, room, result.winner);
  }
}

export function tryStartMatch(io: Server, room: Room): void {
  if (room.status === 'READY' && room.players.length >= roomCapacity(room.mode)) {
    startRound(io, room);
  }
}

export function pauseForDisconnect(room: Room): void {
  if (room.loopHandle) {
    clearInterval(room.loopHandle);
    room.loopHandle = null;
  }
  if (room.roundResultTimeout) {
    clearTimeout(room.roundResultTimeout);
    room.roundResultTimeout = null;
  }
  room.status = 'PAUSED';
}

export function resumeAfterReconnect(io: Server, room: Room): void {
  room.status = 'PLAYING';
  room.roundStartedAt = Date.now() - Math.min(Date.now() - room.roundStartedAt, ROUND_TIME_LIMIT_MS);
  logger.info({ roomId: room.id }, 'match resumed after reconnect');
  startTickLoop(io, room);
}

export function forfeitToRemainingPlayer(io: Server, room: Room, disconnectedSide: Side): void {
  endMatch(io, room, opposite(disconnectedSide), 'DISCONNECT');
}

export function cleanupRoom(roomId: string): void {
  destroyRoom(roomId);
}

export function backToLobby(room: Room): void {
  resetRoomToLobby(room);
}
