import {
  SIMON_SAYS_CUE_DURATION_MS,
  SIMON_SAYS_GESTURES,
  SIMON_SAYS_TIME_LIMIT_MS,
  type Room,
  type Side,
  type SimonSaysGesture,
} from '../types.js';
import type { MiniGameModule, TickResult } from './miniGame.js';

export const SIMON_SAYS_ID = 'simon_says';

interface SimonSaysState {
  cue: SimonSaysGesture;
  cueEndsAt: number;
  /** Accumulated per-side "match strength" over the round, like 얼음땡's moveScore - not a hard pass/fail. */
  score: Record<Side, number>;
}

function pickNextCue(current: SimonSaysGesture | null): SimonSaysGesture {
  if (SIMON_SAYS_GESTURES.length <= 1) return SIMON_SAYS_GESTURES[0]!;
  let next: SimonSaysGesture;
  do {
    next = SIMON_SAYS_GESTURES[Math.floor(Math.random() * SIMON_SAYS_GESTURES.length)]!;
  } while (next === current);
  return next;
}

function playersBySide(room: Room, side: Side) {
  return room.players.filter((p) => p.side === side);
}

function resetRound(room: Room): void {
  room.gameState = {
    cue: pickNextCue(null),
    cueEndsAt: Date.now() + SIMON_SAYS_CUE_DURATION_MS,
    score: { A: 0, B: 0 },
  } as SimonSaysState;
}

function tick(room: Room): TickResult {
  const state = room.gameState as SimonSaysState;
  const now = Date.now();

  if (now >= state.cueEndsAt) {
    state.cue = pickNextCue(state.cue);
    state.cueEndsAt = now + SIMON_SAYS_CUE_DURATION_MS;
  }

  // Client self-reports how well its detected gesture currently matches the cue via
  // the same motionScore input channel every other game uses (see FN-12 notes).
  for (const side of ['A', 'B'] as Side[]) {
    for (const player of playersBySide(room, side)) {
      state.score[side] += player.motionScore;
    }
  }

  const elapsed = now - room.roundStartedAt;
  if (elapsed >= SIMON_SAYS_TIME_LIMIT_MS) {
    const winner: Side = state.score.A >= state.score.B ? 'A' : 'B';
    return { ended: true, winner };
  }

  return { ended: false };
}

function broadcastPayload(room: Room): Record<string, unknown> {
  const state = room.gameState as SimonSaysState;
  return {
    cue: state.cue,
    cueRemainingMs: Math.max(0, state.cueEndsAt - Date.now()),
    teamPower: { A: state.score.A, B: state.score.B },
  };
}

export const simonSaysModule: MiniGameModule = {
  id: SIMON_SAYS_ID,
  usesExpression: false,
  resetRound,
  tick,
  broadcastPayload,
};
