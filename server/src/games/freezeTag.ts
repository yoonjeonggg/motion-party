import { opposite, SIDES, type Room, type Side } from '../types.js';
import {
  accumulateMotionScores,
  leadingSide,
  playersBySide,
  type MiniGameModule,
  type TickResult,
} from './miniGame.js';

export const FREEZE_TAG_ID = 'freeze_tag';

const MOVE_PHASE_MS = 4_000;
const FREEZE_PHASE_MS = 2_500;
const TIME_LIMIT_MS = 30_000;
/** A side is "caught" if any of its players' body-movement score exceeds this during FREEZE. */
const MOVE_THRESHOLD = 0.12;

type Phase = 'MOVE' | 'FREEZE';

interface FreezeTagState {
  phase: Phase;
  phaseEndsAt: number;
  moveScore: Record<Side, number>;
}

function resetRound(room: Room): void {
  room.gameState = {
    phase: 'MOVE',
    phaseEndsAt: Date.now() + MOVE_PHASE_MS,
    moveScore: { A: 0, B: 0 },
  } satisfies FreezeTagState;
}

function tick(room: Room): TickResult {
  const state = room.gameState as FreezeTagState;
  const now = Date.now();

  if (state.phase === 'MOVE') {
    accumulateMotionScores(room, state.moveScore);
    if (now >= state.phaseEndsAt) {
      state.phase = 'FREEZE';
      state.phaseEndsAt = now + FREEZE_PHASE_MS;
    }
  } else {
    for (const side of SIDES) {
      const caught = playersBySide(room, side).some((p) => p.motionScore > MOVE_THRESHOLD);
      if (caught) return { ended: true, winner: opposite(side) };
    }
    if (now >= state.phaseEndsAt) {
      state.phase = 'MOVE';
      state.phaseEndsAt = now + MOVE_PHASE_MS;
    }
  }

  if (now - room.roundStartedAt >= TIME_LIMIT_MS) {
    return { ended: true, winner: leadingSide(state.moveScore) };
  }

  return { ended: false };
}

function broadcastPayload(room: Room): Record<string, unknown> {
  const state = room.gameState as FreezeTagState;
  return {
    phase: state.phase,
    phaseRemainingMs: Math.max(0, state.phaseEndsAt - Date.now()),
    teamPower: { ...state.moveScore },
  };
}

function shiftDeadlines(room: Room, ms: number): void {
  (room.gameState as FreezeTagState).phaseEndsAt += ms;
}

export const freezeTagModule: MiniGameModule = {
  id: FREEZE_TAG_ID,
  usesExpression: false,
  resetRound,
  tick,
  broadcastPayload,
  shiftDeadlines,
};
