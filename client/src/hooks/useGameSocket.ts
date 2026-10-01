import { useEffect } from 'react';
import { socket } from '../lib/socket';
import { loadStoredSession } from '../lib/preferences';
import { useGameStore, type SessionInfo } from '../store/gameStore';
import type {
  GameStatePayload,
  GameType,
  MatchEndPayload,
  PublicPlayer,
  RoomMode,
  RoomStatus,
  RoundEndPayload,
} from '../types';

const JOIN_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: '존재하지 않는 방 코드예요.',
  FULL: '이미 정원이 가득 찬 방이에요.',
  ALREADY_STARTED: '이미 게임이 시작된 방이에요.',
};

/** Server -> store wiring. Handlers read actions via getState() so they never go stale. */
const handlers = {
  'room:created': (payload: SessionInfo) => useGameStore.getState().applySession(payload),
  'room:joined': (payload: SessionInfo) => useGameStore.getState().applySession(payload),
  'room:join_error': (payload: { reason: string }) =>
    useGameStore.getState().setError(JOIN_ERROR_MESSAGES[payload.reason] ?? '방에 참가할 수 없어요.'),
  'room:player_joined': (payload: { players: PublicPlayer[]; status?: RoomStatus }) => {
    const store = useGameStore.getState();
    store.applyPlayers(payload.players);
    if (payload.status) store.applyRoomStatus(payload.status);
    if (payload.players.length > 0 && payload.players.every((p) => p.connectionStatus === 'CONNECTED')) {
      store.applyOpponentDisconnected(false);
    }
  },
  'game:start': () => useGameStore.getState().applyGameStart(),
  'game:state': (payload: GameStatePayload) => useGameStore.getState().applyGameState(payload),
  'game:round_end': (payload: RoundEndPayload) => useGameStore.getState().applyRoundEnd(payload),
  'game:match_end': (payload: MatchEndPayload) => useGameStore.getState().applyMatchEnd(payload),
  'player:disconnect': () => useGameStore.getState().applyOpponentDisconnected(true),
  'player:reconnect_error': () => {
    const store = useGameStore.getState();
    store.leaveRoom();
    store.setError('연결이 끊겨 방에서 나왔어요. 다시 참가해 주세요.');
  },
  // Every (re)connect gets a new socket id, so the server only knows us again once we
  // re-claim our seat - covers both a page reload and socket.io's automatic reconnect
  // after a network blip (otherwise we'd silently forfeit after the grace period).
  connect: () => {
    useGameStore.getState().setConnectionError(false);
    const session = useGameStore.getState().session;
    if (session) socket.emit('player:reconnect', { roomId: session.roomId, playerId: session.playerId });
  },
  connect_error: () => useGameStore.getState().setConnectionError(true),
} as const;

export function useGameSocket() {
  useEffect(() => {
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);

    const stored = loadStoredSession<SessionInfo>();
    if (stored) {
      useGameStore.getState().applySession(stored);
      // Already connected before this effect ran: the connect handler above missed it.
      if (socket.connected) handlers.connect();
    }

    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler);
    };
  }, []);
}

export function createRoom(nickname: string, mode: RoomMode = '1v1', gameType: GameType = 'tug_of_war') {
  socket.emit('room:create', { nickname, mode, gameType });
}

export function joinRoom(code: string, nickname: string) {
  socket.emit('room:join', { code, nickname });
}

export function sendPower(
  roomId: string,
  playerId: string,
  motionScore: number,
  expressionScore = 0,
) {
  socket.emit('input:power', { roomId, playerId, motionScore, expressionScore });
}

export function submitCalibration(roomId: string, playerId: string, baseline: number) {
  socket.emit('calibration:submit', { roomId, playerId, baseline });
}

export function requestRematch(roomId: string) {
  socket.emit('room:rematch', { roomId });
}

/** Leaves the room for good: a fresh socket makes the server treat us as disconnected, then local state resets. */
export function exitRoom() {
  socket.disconnect();
  socket.connect();
  useGameStore.getState().leaveRoom();
}
