import type { Room, Side } from '../types.js';

export interface TickResult {
  ended: boolean;
  winner?: Side;
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
}
