import type { Server } from 'socket.io';
import {
  effectivePower,
  roomCapacity,
  ROPE_LIMIT,
  ROPE_SPEED,
  ROUND_RESULT_DELAY_MS,
  ROUND_TIME_LIMIT_MS,
  SYNC_MAX_BONUS,
  TICK_RATE_MS,
  WINS_NEEDED,
  type Room,
  type Side,
} from './types.js';
import { destroyRoom, resetRoomToLobby } from './roomManager.js';

function opposite(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

function playersBySide(room: Room, side: Side) {
  return room.players.filter((p) => p.side === side);
}

/**
 * Combined power for a side. In 2v2, teammates whose power is closely in sync
 * (per FN-10) get a multiplicative bonus on top of their summed power.
 */
function sidePower(room: Room, side: Side): number {
  const powers = playersBySide(room, side).map(effectivePower);
  if (powers.length === 0) return 0;
  const sum = powers.reduce((a, b) => a + b, 0);
  const [p1, p2] = powers;
  if (p1 === undefined || p2 === undefined) return sum;
  const diff = Math.abs(p1 - p2);
  const syncBonus = 1 + SYNC_MAX_BONUS * Math.max(0, 1 - diff);
  return sum * syncBonus;
}

function broadcastState(io: Server, room: Room): void {
  io.to(room.id).emit('game:state', {
    tick: Date.now(),
    ropePosition: room.ropePosition,
    teamPower: {
      A: sidePower(room, 'A'),
      B: sidePower(room, 'B'),
    },
    roundNumber: room.roundNumber,
    roundWins: room.roundWins,
    status: room.status,
  });
}

function startRound(io: Server, room: Room): void {
  room.roundNumber += 1;
  room.ropePosition = 0;
  room.roundStartedAt = Date.now();
  room.roundPower = { A: 0, B: 0 };
  room.status = 'PLAYING';

  io.to(room.id).emit('game:start', {
    roomId: room.id,
    mode: room.mode,
    roundNumber: room.roundNumber,
  });

  if (room.loopHandle) clearInterval(room.loopHandle);
  room.loopHandle = setInterval(() => tick(io, room), TICK_RATE_MS);
}

function endRound(io: Server, room: Room, winner: Side): void {
  if (room.loopHandle) {
    clearInterval(room.loopHandle);
    room.loopHandle = null;
  }
  room.roundWins[winner] += 1;
  room.status = 'ROUND_RESULT';

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

  io.to(room.id).emit('game:match_end', {
    winner,
    finalScores: room.roundWins,
    reason,
  });
}

function tick(io: Server, room: Room): void {
  const powerA = sidePower(room, 'A');
  const powerB = sidePower(room, 'B');

  room.roundPower.A += powerA;
  room.roundPower.B += powerB;

  room.ropePosition += (powerA - powerB) * ROPE_SPEED * (TICK_RATE_MS / 1000);
  room.ropePosition = Math.max(-ROPE_LIMIT, Math.min(ROPE_LIMIT, room.ropePosition));

  broadcastState(io, room);

  if (room.ropePosition >= ROPE_LIMIT) {
    endRound(io, room, 'A');
    return;
  }
  if (room.ropePosition <= -ROPE_LIMIT) {
    endRound(io, room, 'B');
    return;
  }

  const elapsed = Date.now() - room.roundStartedAt;
  if (elapsed >= ROUND_TIME_LIMIT_MS) {
    const winner: Side =
      room.roundPower.A === room.roundPower.B
        ? room.ropePosition >= 0
          ? 'A'
          : 'B'
        : room.roundPower.A > room.roundPower.B
          ? 'A'
          : 'B';
    endRound(io, room, winner);
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
  room.loopHandle = setInterval(() => tick(io, room), TICK_RATE_MS);
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
