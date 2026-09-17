import {
  effectivePower,
  ROPE_LIMIT,
  ROPE_SPEED,
  ROUND_TIME_LIMIT_MS,
  SYNC_MAX_BONUS,
  TICK_RATE_MS,
  type Room,
  type Side,
} from '../types.js';
import type { MiniGameModule, TickResult } from './miniGame.js';

export const TUG_OF_WAR_ID = 'tug_of_war';

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

function resetRound(room: Room): void {
  room.ropePosition = 0;
  room.roundPower = { A: 0, B: 0 };
}

function tick(room: Room): TickResult {
  const powerA = sidePower(room, 'A');
  const powerB = sidePower(room, 'B');

  room.roundPower.A += powerA;
  room.roundPower.B += powerB;

  room.ropePosition += (powerA - powerB) * ROPE_SPEED * (TICK_RATE_MS / 1000);
  room.ropePosition = Math.max(-ROPE_LIMIT, Math.min(ROPE_LIMIT, room.ropePosition));

  if (room.ropePosition >= ROPE_LIMIT) return { ended: true, winner: 'A' };
  if (room.ropePosition <= -ROPE_LIMIT) return { ended: true, winner: 'B' };

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
    return { ended: true, winner };
  }

  return { ended: false };
}

function broadcastPayload(room: Room): Record<string, unknown> {
  return {
    ropePosition: room.ropePosition,
    teamPower: { A: sidePower(room, 'A'), B: sidePower(room, 'B') },
  };
}

export const tugOfWarModule: MiniGameModule = {
  id: TUG_OF_WAR_ID,
  resetRound,
  tick,
  broadcastPayload,
};
