import { create } from 'zustand';
import type {
  FreezeTagPhase,
  GameStatePayload,
  GameType,
  MatchEndPayload,
  PublicPlayer,
  RoomMode,
  RoundEndPayload,
  RoomStatus,
  Side,
} from '../types';

export type Screen =
  | 'ONBOARDING'
  | 'LOBBY'
  | 'WAITING'
  | 'CALIBRATING'
  | 'PLAYING'
  | 'ROUND_RESULT'
  | 'MATCH_RESULT';

export interface SessionInfo {
  roomId: string;
  code: string;
  playerId: string;
  side: Side;
  mode: RoomMode;
  gameType: GameType;
}

export interface Highlight {
  score: number;
  dataUrl: string;
}

interface GameStore {
  screen: Screen;
  nickname: string;
  session: SessionInfo | null;
  players: PublicPlayer[];
  status: RoomStatus;
  ropePosition: number;
  armPosition: number;
  phase: FreezeTagPhase;
  phaseRemainingMs: number;
  teamPower: Record<Side, number>;
  roundNumber: number;
  roundWins: Record<Side, number>;
  lastRoundEnd: RoundEndPayload | null;
  matchEnd: MatchEndPayload | null;
  error: string | null;
  opponentDisconnected: boolean;
  highlight: Highlight | null;

  setNickname: (nickname: string) => void;
  setScreen: (screen: Screen) => void;
  setError: (message: string | null) => void;
  applySession: (session: SessionInfo) => void;
  applyPlayers: (players: PublicPlayer[]) => void;
  applyRoomStatus: (status: RoomStatus) => void;
  applyGameStart: () => void;
  applyGameState: (payload: GameStatePayload) => void;
  applyRoundEnd: (payload: RoundEndPayload) => void;
  applyMatchEnd: (payload: MatchEndPayload) => void;
  applyOpponentDisconnected: (disconnected: boolean) => void;
  updateHighlight: (score: number, dataUrl: string) => void;
  resetMatch: () => void;
  leaveRoom: () => void;
}

const initialGameFields = {
  players: [] as PublicPlayer[],
  status: 'LOBBY' as RoomStatus,
  ropePosition: 0,
  armPosition: 0,
  phase: 'MOVE' as FreezeTagPhase,
  phaseRemainingMs: 0,
  teamPower: { A: 0, B: 0 } as Record<Side, number>,
  roundNumber: 0,
  roundWins: { A: 0, B: 0 } as Record<Side, number>,
  lastRoundEnd: null,
  matchEnd: null,
  opponentDisconnected: false,
  highlight: null as Highlight | null,
};

export const useGameStore = create<GameStore>((set) => ({
  screen: 'ONBOARDING',
  nickname: '',
  session: null,
  error: null,
  ...initialGameFields,

  setNickname: (nickname) => set({ nickname }),
  setScreen: (screen) => set({ screen }),
  setError: (message) => set({ error: message }),

  applySession: (session) => {
    localStorage.setItem('motionparty:session', JSON.stringify(session));
    set({ session, screen: 'WAITING', error: null });
  },

  applyPlayers: (players) => set({ players }),

  applyRoomStatus: (status) =>
    set((state) => ({
      status,
      screen: status === 'CALIBRATING' ? 'CALIBRATING' : state.screen,
    })),

  applyGameStart: () =>
    set({
      screen: 'PLAYING',
      status: 'PLAYING',
      ropePosition: 0,
      armPosition: 0,
      opponentDisconnected: false,
    }),

  applyGameState: (payload) =>
    set((state) => ({
      ropePosition: payload.ropePosition ?? state.ropePosition,
      armPosition: payload.armPosition ?? state.armPosition,
      phase: payload.phase ?? state.phase,
      phaseRemainingMs: payload.phaseRemainingMs ?? state.phaseRemainingMs,
      teamPower: payload.teamPower ?? state.teamPower,
      roundNumber: payload.roundNumber,
      roundWins: payload.roundWins,
      status: payload.status,
    })),

  applyRoundEnd: (payload) =>
    set({
      screen: 'ROUND_RESULT',
      status: 'ROUND_RESULT',
      lastRoundEnd: payload,
      roundWins: payload.scores,
    }),

  applyMatchEnd: (payload) =>
    set({ screen: 'MATCH_RESULT', status: 'MATCH_RESULT', matchEnd: payload }),

  applyOpponentDisconnected: (disconnected) => set({ opponentDisconnected: disconnected }),

  updateHighlight: (score, dataUrl) =>
    set((state) => (!state.highlight || score > state.highlight.score ? { highlight: { score, dataUrl } } : {})),

  resetMatch: () => set({ ...initialGameFields, screen: 'WAITING' }),

  leaveRoom: () => {
    localStorage.removeItem('motionparty:session');
    set({ session: null, screen: 'LOBBY', ...initialGameFields });
  },
}));

export function loadStoredSession(): SessionInfo | null {
  try {
    const raw = localStorage.getItem('motionparty:session');
    if (!raw) return null;
    return JSON.parse(raw) as SessionInfo;
  } catch {
    return null;
  }
}
