export type RoomStatus =
  | 'LOBBY'
  | 'READY'
  | 'PLAYING'
  | 'ROUND_RESULT'
  | 'PAUSED'
  | 'MATCH_RESULT';

export type Side = 'A' | 'B';

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED';

export interface Player {
  id: string;
  socketId: string;
  nickname: string;
  side: Side;
  connectionStatus: ConnectionStatus;
  motionScore: number;
  lastInputAt: number;
}

export interface Room {
  id: string;
  code: string;
  status: RoomStatus;
  mode: '1v1';
  players: Player[];
  createdAt: number;
  roundNumber: number;
  roundWins: Record<Side, number>;
  ropePosition: number;
  roundStartedAt: number;
  roundPower: Record<Side, number>;
  loopHandle: ReturnType<typeof setInterval> | null;
  roundResultTimeout: ReturnType<typeof setTimeout> | null;
  disconnectTimers: Partial<Record<Side, ReturnType<typeof setTimeout>>>;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  side: Side;
  connectionStatus: ConnectionStatus;
}

export const TICK_RATE_MS = 1000 / 18;
export const ROUND_TIME_LIMIT_MS = 30_000;
export const ROUND_RESULT_DELAY_MS = 3_000;
export const RECONNECT_GRACE_MS = 30_000;
export const ROPE_LIMIT = 1;
export const ROPE_SPEED = 0.35;
export const WINS_NEEDED = 2;
export const MAX_PLAYERS = 2;
