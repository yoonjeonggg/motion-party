import type { Server } from 'socket.io';
import {
  opposite,
  ROUND_RESULT_DELAY_MS,
  TICK_RATE_MS,
  WINS_NEEDED,
  type MatchEndReason,
  type PausableStatus,
  type Room,
  type Side,
} from './types.js';
import { decayStaleInputs, isRoomFull, stopRoundTimers } from './roomManager.js';
import { getMiniGame } from './games/registry.js';
import { logger } from './logger.js';

function broadcastState(io: Server, room: Room): void {
  // volatile: each tick fully supersedes the last, so a client whose connection can't keep up
  // should just miss frames rather than have a backlog of stale state buffered for it.
  io.to(room.id).volatile.emit('game:state', {
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

function tick(io: Server, room: Room): void {
  decayStaleInputs(room, Date.now());
  const result = getMiniGame(room.gameType).tick(room);
  broadcastState(io, room);

  if (result.ended && result.winner) {
    endRound(io, room, result.winner);
  }
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
  stopRoundTimers(room);
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

  scheduleNextRound(io, room);
}

function scheduleNextRound(io: Server, room: Room): void {
  room.roundResultTimeout = setTimeout(() => {
    room.roundResultTimeout = null;
    if (room.status !== 'ROUND_RESULT') return;
    try {
      startRound(io, room);
    } catch (err) {
      logger.error({ roomId: room.id, gameType: room.gameType, err }, 'next round start error');
    }
  }, ROUND_RESULT_DELAY_MS);
}

function endMatch(io: Server, room: Room, winner: Side, reason: MatchEndReason): void {
  stopRoundTimers(room);
  room.pause = null;
  room.status = 'MATCH_RESULT';

  logger.info({ roomId: room.id, winner, reason, finalScores: room.roundWins }, 'match ended');

  io.to(room.id).emit('game:match_end', {
    winner,
    finalScores: room.roundWins,
    reason,
  });
}

export function tryStartMatch(io: Server, room: Room): void {
  if (room.status === 'READY' && isRoomFull(room)) {
    startRound(io, room);
  }
}

export function isPausable(status: Room['status']): status is PausableStatus {
  return status === 'PLAYING' || status === 'ROUND_RESULT';
}

/** Freezes a round in progress (or the break between rounds) while a player is disconnected. */
export function pauseForDisconnect(room: Room): void {
  stopRoundTimers(room);
  // A second player dropping while already paused keeps the original pause clock and resume target.
  if (isPausable(room.status)) room.pause = { at: Date.now(), resumeTo: room.status };
  room.status = 'PAUSED';
}

export function resumeAfterReconnect(io: Server, room: Room): void {
  const { at, resumeTo } = room.pause ?? { at: Date.now(), resumeTo: 'PLAYING' as const };
  const pausedMs = Date.now() - at;
  room.pause = null;
  logger.info({ roomId: room.id, pausedMs, resumeTo }, 'match resumed after reconnect');

  if (resumeTo === 'ROUND_RESULT') {
    // The round had already ended - go back to the between-rounds break instead of reviving it.
    room.status = 'ROUND_RESULT';
    scheduleNextRound(io, room);
    return;
  }

  // Shift every round deadline forward by the time spent paused, so the round
  // resumes with exactly the time (and phase/cue time) it had left when it paused.
  room.roundStartedAt += pausedMs;
  getMiniGame(room.gameType).shiftDeadlines?.(room, pausedMs);
  room.status = 'PLAYING';
  startTickLoop(io, room);
}

export function forfeitToRemainingPlayer(io: Server, room: Room, disconnectedSide: Side): void {
  endMatch(io, room, opposite(disconnectedSide), 'DISCONNECT');
}
