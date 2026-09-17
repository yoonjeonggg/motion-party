import { useEffect } from 'react';
import { socket } from '../lib/socket';
import { loadStoredSession, useGameStore } from '../store/gameStore';
import type {
  GameStatePayload,
  MatchEndPayload,
  PublicPlayer,
  RoomStatus,
  RoundEndPayload,
} from '../types';

export function useGameSocket() {
  const applySession = useGameStore((s) => s.applySession);
  const applyPlayers = useGameStore((s) => s.applyPlayers);
  const applyRoomStatus = useGameStore((s) => s.applyRoomStatus);
  const applyGameStart = useGameStore((s) => s.applyGameStart);
  const applyGameState = useGameStore((s) => s.applyGameState);
  const applyRoundEnd = useGameStore((s) => s.applyRoundEnd);
  const applyMatchEnd = useGameStore((s) => s.applyMatchEnd);
  const applyOpponentDisconnected = useGameStore((s) => s.applyOpponentDisconnected);
  const setError = useGameStore((s) => s.setError);
  const leaveRoom = useGameStore((s) => s.leaveRoom);

  useEffect(() => {
    function onCreated(payload: { roomId: string; code: string; playerId: string; side: 'A' | 'B' }) {
      applySession(payload);
    }
    function onJoined(payload: { roomId: string; code: string; playerId: string; side: 'A' | 'B' }) {
      applySession(payload);
    }
    function onJoinError(payload: { reason: string }) {
      const messages: Record<string, string> = {
        NOT_FOUND: '존재하지 않는 방 코드예요.',
        FULL: '이미 정원이 가득 찬 방이에요.',
        ALREADY_STARTED: '이미 게임이 시작된 방이에요.',
      };
      setError(messages[payload.reason] ?? '방에 참가할 수 없어요.');
    }
    function onPlayerJoined(payload: { players: PublicPlayer[]; status?: RoomStatus }) {
      applyPlayers(payload.players);
      if (payload.status) applyRoomStatus(payload.status);
      if (payload.players.length > 0 && payload.players.every((p) => p.connectionStatus === 'CONNECTED')) {
        applyOpponentDisconnected(false);
      }
    }
    function onGameStart() {
      applyGameStart();
    }
    function onGameState(payload: GameStatePayload) {
      applyGameState(payload);
    }
    function onRoundEnd(payload: RoundEndPayload) {
      applyRoundEnd(payload);
    }
    function onMatchEnd(payload: MatchEndPayload) {
      applyMatchEnd(payload);
    }
    function onOpponentDisconnect() {
      applyOpponentDisconnected(true);
    }
    function onReconnectError() {
      leaveRoom();
    }

    socket.on('room:created', onCreated);
    socket.on('room:joined', onJoined);
    socket.on('room:join_error', onJoinError);
    socket.on('room:player_joined', onPlayerJoined);
    socket.on('game:start', onGameStart);
    socket.on('game:state', onGameState);
    socket.on('game:round_end', onRoundEnd);
    socket.on('game:match_end', onMatchEnd);
    socket.on('player:disconnect', onOpponentDisconnect);
    socket.on('player:reconnect_error', onReconnectError);

    const stored = loadStoredSession();
    if (stored) {
      socket.emit('player:reconnect', { roomId: stored.roomId, playerId: stored.playerId });
      applySession(stored);
    }

    return () => {
      socket.off('room:created', onCreated);
      socket.off('room:joined', onJoined);
      socket.off('room:join_error', onJoinError);
      socket.off('room:player_joined', onPlayerJoined);
      socket.off('game:start', onGameStart);
      socket.off('game:state', onGameState);
      socket.off('game:round_end', onRoundEnd);
      socket.off('game:match_end', onMatchEnd);
      socket.off('player:disconnect', onOpponentDisconnect);
      socket.off('player:reconnect_error', onReconnectError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function createRoom(nickname: string) {
  socket.emit('room:create', { nickname });
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
