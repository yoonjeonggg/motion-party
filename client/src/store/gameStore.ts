import { create } from 'zustand';
import { clearStoredSession, storeSession } from '../lib/preferences';
import type {
  FreezeTagPhase,
  GameStatePayload,
  MatchEndPayload,
  PublicPlayer,
  RoundEndPayload,
  RoomStatus,
  SessionPayload,
  Side,
} from '../types';

export type Screen =
  | 'ONBOARDING'
  | 'LOBBY'
  | 'GAME_TUTORIAL'
  | 'WAITING'
  | 'CALIBRATING'
  | 'PLAYING'
  | 'ROUND_RESULT'
  | 'MATCH_RESULT';

export type SessionInfo = SessionPayload;

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
  cue: string;
  cueRemainingMs: number;
  teamPower: Record<Side, number>;
  roundNumber: number;
  roundWins: Record<Side, number>;
  lastRoundEnd: RoundEndPayload | null;
  matchEnd: MatchEndPayload | null;
  error: string | null;
  /** True while the socket can't reach the server. */
  connectionError: boolean;
  opponentDisconnected: boolean;
  highlight: Highlight | null;

  setNickname: (nickname: string) => void;
  setScreen: (screen: Screen) => void;
  setError: (message: string | null) => void;
  setConnectionError: (failed: boolean) => void;
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
  cue: '' as string,
  cueRemainingMs: 0,
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
  connectionError: false,
  ...initialGameFields,

  setNickname: (nickname) => set({ nickname }),
  setScreen: (screen) => set({ screen }),
  setError: (message) => set({ error: message }),
  setConnectionError: (failed) => set({ connectionError: failed }),

  applySession: (session) => {
    storeSession(session);
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
      cue: payload.cue ?? state.cue,
      cueRemainingMs: payload.cueRemainingMs ?? state.cueRemainingMs,
      teamPower: payload.teamPower ?? state.teamPower,
      roundNumber: payload.roundNumber,
      roundWins: payload.roundWins,
      status: payload.status,
      // Reconnecting mid-round resumes the match without a fresh game:start, so a
      // player sitting on the WAITING screen has to be moved back into the game here.
      screen: payload.status === 'PLAYING' && state.screen === 'WAITING' ? 'PLAYING' : state.screen,
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
    clearStoredSession();
    set({ session: null, screen: 'LOBBY', ...initialGameFields });
  },
}));
