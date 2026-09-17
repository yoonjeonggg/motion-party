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
export type GameType = 'tug_of_war' | 'arm_wrestle' | 'freeze_tag';
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
