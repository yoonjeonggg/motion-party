export type RoomStatus =
  | 'LOBBY'
  | 'CALIBRATING'
  | 'READY'
  | 'PLAYING'
  | 'ROUND_RESULT'
  | 'PAUSED'
  | 'MATCH_RESULT';

export type Side = 'A' | 'B';
export type RoomMode = '1v1' | '2v2';

export function opposite(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED';

export interface Player {
  id: string;
  socketId: string;
  nickname: string;
  side: Side;
  connectionStatus: ConnectionStatus;
  motionScore: number;
  expressionScore: number;
  calibrated: boolean;
  lastInputAt: number;
}

/** motionScore boosted by the player's expression-intensity bonus, per FN-08. */
export function effectivePower(player: Player): number {
  return player.motionScore * (1 + player.expressionScore);
}

export interface Room {
  id: string;
  code: string;
  status: RoomStatus;
  mode: RoomMode;
  /** Which MiniGameModule (server/src/games) runs this room's rounds. See FN-12. */
  gameType: string;
  players: Player[];
  createdAt: number;
  roundNumber: number;
  roundWins: Record<Side, number>;
  roundStartedAt: number;
  /** Opaque per-round state owned and shaped by the active MiniGameModule (see FN-12). */
  gameState: unknown;
  loopHandle: ReturnType<typeof setInterval> | null;
  roundResultTimeout: ReturnType<typeof setTimeout> | null;
  /** Keyed by player id, so 2v2 teammates can each carry their own reconnect grace timer. */
  disconnectTimers: Partial<Record<string, ReturnType<typeof setTimeout>>>;
}

/** Players allowed on one side for a given mode. */
export function perSideCapacity(mode: RoomMode): number {
  return mode === '2v2' ? 2 : 1;
}

export function roomCapacity(mode: RoomMode): number {
  return perSideCapacity(mode) * 2;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  side: Side;
  connectionStatus: ConnectionStatus;
  calibrated: boolean;
}

export const TICK_RATE_MS = 1000 / 18;
export const ROUND_TIME_LIMIT_MS = 30_000;
export const ROUND_RESULT_DELAY_MS = 3_000;
export const RECONNECT_GRACE_MS = 30_000;
export const ROPE_LIMIT = 1;
export const ROPE_SPEED = 0.35;
/** Arm-wrestling resolves faster than tug-of-war: shorter reach, quicker push, shorter time limit. */
export const ARM_WRESTLE_LIMIT = 1;
export const ARM_WRESTLE_SPEED = 0.5;
export const ARM_WRESTLE_TIME_LIMIT_MS = 20_000;
export const WINS_NEEDED = 2;
/** Tunable: max multiplicative bonus (e.g. 0.3 = +30%) when 2v2 teammates' power is perfectly in sync. */
export const SYNC_MAX_BONUS = 0.3;

// 얼음땡 (freeze tag)
export const FREEZE_TAG_MOVE_PHASE_MS = 4_000;
export const FREEZE_TAG_FREEZE_PHASE_MS = 2_500;
export const FREEZE_TAG_TIME_LIMIT_MS = 30_000;
/** A side is "caught" if any of its players' body-movement score exceeds this during FREEZE. */
export const FREEZE_TAG_MOVE_THRESHOLD = 0.12;
