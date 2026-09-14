export type RoomStatus =
  | 'LOBBY'
  | 'READY'
  | 'PLAYING'
  | 'ROUND_RESULT'
  | 'PAUSED'
  | 'MATCH_RESULT';

export type Side = 'A' | 'B';

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED';

export interface PublicPlayer {
  id: string;
  nickname: string;
  side: Side;
  connectionStatus: ConnectionStatus;
}

export interface GameStatePayload {
  tick: number;
  ropePosition: number;
  teamPower: Record<Side, number>;
  roundNumber: number;
  roundWins: Record<Side, number>;
  status: RoomStatus;
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
