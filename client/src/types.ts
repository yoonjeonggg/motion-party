export type RoomStatus =
  | 'LOBBY'
  | 'CALIBRATING'
  | 'READY'
  | 'PLAYING'
  | 'ROUND_RESULT'
  | 'PAUSED'
  | 'MATCH_RESULT';

export type Side = 'A' | 'B';
export const SIDES: readonly Side[] = ['A', 'B'];
export type RoomMode = '1v1' | '2v2' | '4v4';
export type GameType = 'tug_of_war' | 'arm_wrestle' | 'freeze_tag' | 'simon_says';

export function opposite(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

/** Mirrors server/src/types.ts's perSideCapacity/roomCapacity - kept in sync manually. */
export function perSideCapacity(mode: RoomMode): number {
  if (mode === '4v4') return 4;
  if (mode === '2v2') return 2;
  return 1;
}

export function roomCapacity(mode: RoomMode): number {
  return perSideCapacity(mode) * 2;
}

export const ROOM_MODES: readonly RoomMode[] = ['1v1', '2v2', '4v4'];

export const MODE_LABELS: Record<RoomMode, string> = {
  '1v1': '1:1 대결',
  '2v2': '2:2 팀전',
  '4v4': '4:4 팀전',
};

export const GAME_TYPES: readonly GameType[] = ['tug_of_war', 'arm_wrestle', 'freeze_tag', 'simon_says'];
export const DEFAULT_GAME_TYPE: GameType = 'tug_of_war';

export const GAME_LABELS: Record<GameType, string> = {
  tug_of_war: '줄다리기',
  arm_wrestle: '팔씨름',
  freeze_tag: '얼음땡',
  simon_says: '동작 따라하기',
};

/**
 * "Push a position toward your side" games (tug-of-war, arm-wrestle). Only these use
 * FN-08 expression scoring and the FN-10 teammate sync bonus; freeze_tag/simon_says never do.
 */
export function isTugStyleGame(gameType: GameType): boolean {
  return gameType === 'tug_of_war' || gameType === 'arm_wrestle';
}

export type FreezeTagPhase = 'MOVE' | 'FREEZE';

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED';

export interface PublicPlayer {
  id: string;
  nickname: string;
  side: Side;
  connectionStatus: ConnectionStatus;
  calibrated: boolean;
}

export interface GameStatePayload {
  tick: number;
  roundNumber: number;
  roundWins: Record<Side, number>;
  status: RoomStatus;
  teamPower?: Record<Side, number>;
  /** tug_of_war only */
  ropePosition?: number;
  /** arm_wrestle only */
  armPosition?: number;
  /** freeze_tag only */
  phase?: FreezeTagPhase;
  phaseRemainingMs?: number;
  /** simon_says only */
  cue?: string;
  cueRemainingMs?: number;
}

/** Sent on room:created / room:joined. */
export interface SessionPayload {
  roomId: string;
  code: string;
  playerId: string;
  side: Side;
  mode: RoomMode;
  gameType: GameType;
}

export interface RoundEndPayload {
  winner: Side;
  roundNumber: number;
  scores: Record<Side, number>;
}

export interface MatchEndPayload {
  winner: Side;
  finalScores: Record<Side, number>;
  reason: 'ROUND_WINS' | 'DISCONNECT';
}
