import {
  FREEZE_TAG_FREEZE_PHASE_MS,
  FREEZE_TAG_MOVE_PHASE_MS,
  FREEZE_TAG_MOVE_THRESHOLD,
  FREEZE_TAG_TIME_LIMIT_MS,
  opposite,
  type Room,
  type Side,
} from '../types.js';
import type { MiniGameModule, TickResult } from './miniGame.js';

export const FREEZE_TAG_ID = 'freeze_tag';

type Phase = 'MOVE' | 'FREEZE';

interface FreezeTagState {
  phase: Phase;
  phaseEndsAt: number;
  moveScore: Record<Side, number>;
}

function playersBySide(room: Room, side: Side) {
  return room.players.filter((p) => p.side === side);
}

function resetRound(room: Room): void {
  room.gameState = {
    phase: 'MOVE',
    phaseEndsAt: Date.now() + FREEZE_TAG_MOVE_PHASE_MS,
    moveScore: { A: 0, B: 0 },
  } as FreezeTagState;
}

function tick(room: Room): TickResult {
  const state = room.gameState as FreezeTagState;
  const now = Date.now();

  if (state.phase === 'MOVE') {
    for (const side of ['A', 'B'] as Side[]) {
      for (const player of playersBySide(room, side)) {
        state.moveScore[side] += player.motionScore;
      }
    }
    if (now >= state.phaseEndsAt) {
      state.phase = 'FREEZE';
      state.phaseEndsAt = now + FREEZE_TAG_FREEZE_PHASE_MS;
    }
  } else {
    for (const side of ['A', 'B'] as Side[]) {
      const caught = playersBySide(room, side).some((p) => p.motionScore > FREEZE_TAG_MOVE_THRESHOLD);
      if (caught) return { ended: true, winner: opposite(side) };
    }
    if (now >= state.phaseEndsAt) {
      state.phase = 'MOVE';
      state.phaseEndsAt = now + FREEZE_TAG_MOVE_PHASE_MS;
    }
  }

  const elapsed = now - room.roundStartedAt;
  if (elapsed >= FREEZE_TAG_TIME_LIMIT_MS) {
    const winner: Side = state.moveScore.A >= state.moveScore.B ? 'A' : 'B';
    return { ended: true, winner };
  }

  return { ended: false };
}

function broadcastPayload(room: Room): Record<string, unknown> {
  const state = room.gameState as FreezeTagState;
  return {
    phase: state.phase,
    phaseRemainingMs: Math.max(0, state.phaseEndsAt - Date.now()),
    teamPower: { A: state.moveScore.A, B: state.moveScore.B },
  };
}

export const freezeTagModule: MiniGameModule = {
  id: FREEZE_TAG_ID,
  usesExpression: false,
  resetRound,
  tick,
  broadcastPayload,
};
