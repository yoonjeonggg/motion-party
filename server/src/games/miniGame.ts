import { SIDES, type Player, type Room, type Side } from '../types.js';

export interface TickResult {
  ended: boolean;
  winner?: Side;
}

/** Shared by every minigame's tick/broadcast logic to split the roster by team. */
export function playersBySide(room: Room, side: Side): Player[] {
  return room.players.filter((p) => p.side === side);
}

/** Adds every player's current motionScore into their side's running total. */
export function accumulateMotionScores(room: Room, totals: Record<Side, number>): void {
  for (const side of SIDES) {
    for (const player of playersBySide(room, side)) {
      totals[side] += player.motionScore;
    }
  }
}

/** Side with the higher total; A wins ties. */
export function leadingSide(totals: Record<Side, number>): Side {
  return totals.A >= totals.B ? 'A' : 'B';
}

/**
 * A pluggable minigame's rules, decoupled from room/matching/socket plumbing
 * (per FN-12). New games register a module here instead of touching gameLoop.ts.
 */
export interface MiniGameModule {
  readonly id: string;
  /** Whether this game uses FN-08 expression scoring (and therefore needs FN-09 calibration). */
  readonly usesExpression: boolean;
  /** Reset per-round state when a new round starts. */
  resetRound(room: Room): void;
  /** Advance one tick, mutating room state. Returns whether the round just ended. */
  tick(room: Room): TickResult;
  /** Game-specific fields merged into the `game:state` broadcast. */
  broadcastPayload(room: Room): Record<string, unknown>;
  /** Push any absolute-time deadlines in gameState back by `ms`, so a pause doesn't eat into them. */
  shiftDeadlines?(room: Room, ms: number): void;
}
