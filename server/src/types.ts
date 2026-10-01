export type RoomStatus =
  | 'LOBBY'
  | 'CALIBRATING'
  | 'READY'
  | 'PLAYING'
  | 'ROUND_RESULT'
  | 'PAUSED'
  | 'MATCH_RESULT';

export type Side = 'A' | 'B';
export type RoomMode = '1v1' | '2v2' | '4v4';
export const ROOM_MODES: readonly RoomMode[] = ['1v1', '2v2', '4v4'];

export function isRoomMode(value: unknown): value is RoomMode {
  return typeof value === 'string' && (ROOM_MODES as readonly string[]).includes(value);
}
export type MatchEndReason = 'ROUND_WINS' | 'DISCONNECT';
/** Statuses a disconnect can pause (a round in progress, or the break between rounds). */
export type PausableStatus = 'PLAYING' | 'ROUND_RESULT';

export const SIDES: readonly Side[] = ['A', 'B'];

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
  /**
   * Set while PAUSED for a disconnect: when the pause began (to exclude paused time from the
   * round clock) and which status to go back to on resume. Null while not paused.
   */
  pause: { at: number; resumeTo: PausableStatus } | null;
  /** Opaque per-round state owned and shaped by the active MiniGameModule (see FN-12). */
  gameState: unknown;
  loopHandle: ReturnType<typeof setInterval> | null;
  roundResultTimeout: ReturnType<typeof setTimeout> | null;
  /** Keyed by player id, so 2v2 teammates can each carry their own reconnect grace timer. */
  disconnectTimers: Partial<Record<string, ReturnType<typeof setTimeout>>>;
}

/** Players allowed on one side for a given mode. */
export function perSideCapacity(mode: RoomMode): number {
  if (mode === '4v4') return 4;
  if (mode === '2v2') return 2;
  return 1;
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

// Match-wide timing shared by every minigame. Per-game tuning lives next to each
// game's module in server/src/games.
export const TICK_RATE_MS = 1000 / 18;
export const ROUND_TIME_LIMIT_MS = 30_000;
export const ROUND_RESULT_DELAY_MS = 3_000;
export const RECONNECT_GRACE_MS = 30_000;
export const WINS_NEEDED = 2;
/** Inputs older than this are treated as 0 (e.g. a backgrounded tab stops sending), so a stale value can't keep pulling. */
export const INPUT_STALE_MS = 1_000;
export const NICKNAME_MAX_LENGTH = 12;
