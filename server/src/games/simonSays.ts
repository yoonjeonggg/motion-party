import type { Room, Side } from '../types.js';
import { accumulateMotionScores, leadingSide, type MiniGameModule, type TickResult } from './miniGame.js';

export const SIMON_SAYS_ID = 'simon_says';

const CUE_DURATION_MS = 2_500;
const TIME_LIMIT_MS = 30_000;

/**
 * Upper-body-only gesture set (shoulders/wrists), matching client/src/lib/poseGesture.ts's
 * SIMON_SAYS_GESTURES. Kept in sync manually - the server only needs the ids to pick a cue,
 * the client owns classifying landmarks into them and the Korean labels shown in the UI.
 */
const GESTURES = ['LEFT_ARM_UP', 'RIGHT_ARM_UP', 'BOTH_ARMS_UP', 'ARMS_OUT'] as const;
type SimonSaysGesture = (typeof GESTURES)[number];

interface SimonSaysState {
  cue: SimonSaysGesture;
  cueEndsAt: number;
  /** Accumulated per-side "match strength" over the round, like 얼음땡's moveScore - not a hard pass/fail. */
  score: Record<Side, number>;
}

function pickNextCue(current: SimonSaysGesture | null): SimonSaysGesture {
  let next: SimonSaysGesture;
  do {
    next = GESTURES[Math.floor(Math.random() * GESTURES.length)]!;
  } while (next === current);
  return next;
}

function resetRound(room: Room): void {
  room.gameState = {
    cue: pickNextCue(null),
    cueEndsAt: Date.now() + CUE_DURATION_MS,
    score: { A: 0, B: 0 },
  } satisfies SimonSaysState;
}

function tick(room: Room): TickResult {
  const state = room.gameState as SimonSaysState;
  const now = Date.now();

  if (now >= state.cueEndsAt) {
    state.cue = pickNextCue(state.cue);
    state.cueEndsAt = now + CUE_DURATION_MS;
  }

  // Client self-reports how well its detected gesture currently matches the cue via
  // the same motionScore input channel every other game uses (see FN-12 notes).
  accumulateMotionScores(room, state.score);

  if (now - room.roundStartedAt >= TIME_LIMIT_MS) {
    return { ended: true, winner: leadingSide(state.score) };
  }

  return { ended: false };
}

function broadcastPayload(room: Room): Record<string, unknown> {
  const state = room.gameState as SimonSaysState;
  return {
    cue: state.cue,
    cueRemainingMs: Math.max(0, state.cueEndsAt - Date.now()),
    teamPower: { ...state.score },
  };
}

function shiftDeadlines(room: Room, ms: number): void {
  (room.gameState as SimonSaysState).cueEndsAt += ms;
}

export const simonSaysModule: MiniGameModule = {
  id: SIMON_SAYS_ID,
  usesExpression: false,
  resetRound,
  tick,
  broadcastPayload,
  shiftDeadlines,
};
