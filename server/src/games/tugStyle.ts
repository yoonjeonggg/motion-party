import {
  effectivePower,
  SYNC_MAX_BONUS,
  TICK_RATE_MS,
  type Room,
  type Side,
} from '../types.js';
import type { MiniGameModule, TickResult } from './miniGame.js';

function playersBySide(room: Room, side: Side) {
  return room.players.filter((p) => p.side === side);
}

/**
 * Combined power for a side. In 2v2/4v4, teammates whose power is closely in sync
 * (per FN-10) get a multiplicative bonus on top of their summed power. "In sync" is
 * measured as the spread between the most and least powerful teammate right now -
 * for exactly 2 players this is just |p1 - p2|, so 2v2 numbers are unchanged.
 */
function sidePower(room: Room, side: Side): number {
  const powers = playersBySide(room, side).map(effectivePower);
  if (powers.length === 0) return 0;
  const sum = powers.reduce((a, b) => a + b, 0);
  if (powers.length === 1) return sum;
  const spread = Math.max(...powers) - Math.min(...powers);
  const syncBonus = 1 + SYNC_MAX_BONUS * Math.max(0, 1 - spread);
  return sum * syncBonus;
}

interface TugStyleState {
  position: number;
  power: Record<Side, number>;
}

export interface TugStyleOptions {
  id: string;
  /** How far `position` must travel from center (0) to win, in either direction. */
  limit: number;
  /** Position units gained per second per unit of power difference. */
  speed: number;
  /** Round time limit; if reached, whoever accumulated more total power wins. */
  timeLimitMs: number;
  /** Key this game's position is broadcast under, e.g. 'ropePosition' or 'armPosition'. */
  positionField: string;
}

/**
 * Shared "push a position toward your side using power" mechanic behind
 * both tug-of-war and arm-wrestling (FN-12) - only the framing, tuning and
 * position field name differ between the two.
 */
export function createTugStyleModule(options: TugStyleOptions): MiniGameModule {
  function resetRound(room: Room): void {
    room.gameState = { position: 0, power: { A: 0, B: 0 } } as TugStyleState;
  }

  function tick(room: Room): TickResult {
    const state = room.gameState as TugStyleState;
    const powerA = sidePower(room, 'A');
    const powerB = sidePower(room, 'B');

    state.power.A += powerA;
    state.power.B += powerB;

    state.position += (powerA - powerB) * options.speed * (TICK_RATE_MS / 1000);
    state.position = Math.max(-options.limit, Math.min(options.limit, state.position));

    if (state.position >= options.limit) return { ended: true, winner: 'A' };
    if (state.position <= -options.limit) return { ended: true, winner: 'B' };

    const elapsed = Date.now() - room.roundStartedAt;
    if (elapsed >= options.timeLimitMs) {
      const winner: Side =
        state.power.A === state.power.B
          ? state.position >= 0
            ? 'A'
            : 'B'
          : state.power.A > state.power.B
            ? 'A'
            : 'B';
      return { ended: true, winner };
    }

    return { ended: false };
  }

  function broadcastPayload(room: Room): Record<string, unknown> {
    const state = room.gameState as TugStyleState;
    return {
      [options.positionField]: state.position,
      teamPower: { A: sidePower(room, 'A'), B: sidePower(room, 'B') },
    };
  }

  return { id: options.id, usesExpression: true, resetRound, tick, broadcastPayload };
}
