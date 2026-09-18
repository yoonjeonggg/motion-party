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
export type GameType = 'tug_of_war' | 'arm_wrestle' | 'freeze_tag' | 'simon_says';

/** Mirrors server/src/types.ts's perSideCapacity/roomCapacity - kept in sync manually. */
export function perSideCapacity(mode: RoomMode): number {
  if (mode === '4v4') return 4;
  if (mode === '2v2') return 2;
  return 1;
}

export function roomCapacity(mode: RoomMode): number {
  return perSideCapacity(mode) * 2;
}

export const MODE_LABELS: Record<RoomMode, string> = {
  '1v1': '1:1 대결',
  '2v2': '2:2 팀전',
  '4v4': '4:4 팀전',
};
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
