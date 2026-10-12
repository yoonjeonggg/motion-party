import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { socket } from '../test/fakeSocket';
import { player, session } from '../test/fixtures';
import { useGameStore } from '../store/gameStore';
import {
  createRoom,
  exitRoom,
  joinRoom,
  requestRematch,
  sendPower,
  submitCalibration,
  useGameSocket,
} from './useGameSocket';

vi.mock('../lib/socket', () => import('../test/fakeSocket'));

const store = () => useGameStore.getState();

/** Mounts the hook and plays `event` from the server. */
function receive(event: string, payload?: unknown) {
  act(() => socket.receive(event, payload));
}

beforeEach(() => {
  socket.reset();
});

describe('useGameSocket wiring', () => {
  it('subscribes on mount and unsubscribes everything on unmount', () => {
    const { unmount } = renderHook(() => useGameSocket());
    expect(socket.listenerCount('game:state')).toBe(1);
    expect(socket.listenerCount('connect')).toBe(1);
    unmount();
    expect(socket.listenerCount('game:state')).toBe(0);
    expect(socket.listenerCount('connect')).toBe(0);
  });

  it('room:created / room:joined open the waiting room', () => {
    renderHook(() => useGameSocket());
    receive('room:created', session());
    expect(store().screen).toBe('WAITING');
    expect(store().session?.code).toBe('ABC234');
    receive('room:joined', session({ code: 'XYZ789' }));
    expect(store().session?.code).toBe('XYZ789');
  });

  it.each([
    ['NOT_FOUND', '존재하지 않는 방 코드예요.'],
    ['FULL', '이미 정원이 가득 찬 방이에요.'],
    ['ALREADY_STARTED', '이미 게임이 시작된 방이에요.'],
    ['SOMETHING_NEW', '방에 참가할 수 없어요.'],
  ])('room:join_error %s shows a friendly message', (reason, message) => {
    renderHook(() => useGameSocket());
    receive('room:join_error', { reason });
    expect(store().error).toBe(message);
  });

  it('room:player_joined updates the roster and status', () => {
    renderHook(() => useGameSocket());
    receive('room:player_joined', { players: [player('a', 'A'), player('b', 'B')], status: 'CALIBRATING' });
    expect(store().players).toHaveLength(2);
    expect(store().status).toBe('CALIBRATING');
    expect(store().screen).toBe('CALIBRATING');
  });

  it('clears the disconnect banner only once everyone is connected again', () => {
    renderHook(() => useGameSocket());
    receive('player:disconnect', { playerId: 'b', side: 'B' });
    expect(store().opponentDisconnected).toBe(true);

    receive('room:player_joined', { players: [player('a', 'A'), player('b', 'B', { connectionStatus: 'DISCONNECTED' })] });
    expect(store().opponentDisconnected).toBe(true);

    receive('room:player_joined', { players: [] });
    expect(store().opponentDisconnected).toBe(true);

    receive('room:player_joined', { players: [player('a', 'A'), player('b', 'B')] });
    expect(store().opponentDisconnected).toBe(false);
  });

  it('routes game events into the store', () => {
    renderHook(() => useGameSocket());
    receive('game:start');
    expect(store().screen).toBe('PLAYING');
    receive('game:state', { tick: 1, roundNumber: 1, roundWins: { A: 0, B: 0 }, status: 'PLAYING', ropePosition: 0.3 });
    expect(store().ropePosition).toBe(0.3);
    receive('game:round_end', { winner: 'A', roundNumber: 1, scores: { A: 1, B: 0 } });
    expect(store().screen).toBe('ROUND_RESULT');
    receive('game:match_end', { winner: 'A', finalScores: { A: 2, B: 0 }, reason: 'ROUND_WINS' });
    expect(store().screen).toBe('MATCH_RESULT');
  });

  it('a rejected reconnect drops the stale session and explains why', () => {
    renderHook(() => useGameSocket());
    receive('room:created', session());
    receive('player:reconnect_error', { reason: 'NOT_FOUND' });
    expect(store().session).toBeNull();
    expect(store().screen).toBe('LOBBY');
    expect(store().error).toMatch(/연결이 끊겨/);
    expect(localStorage.getItem('motionparty:session')).toBeNull();
  });

  it('tracks connection errors and clears them on connect', () => {
    renderHook(() => useGameSocket());
    receive('connect_error');
    expect(store().connectionError).toBe(true);
    receive('connect');
    expect(store().connectionError).toBe(false);
  });

  it('re-claims its seat on every (re)connect while in a room', () => {
    renderHook(() => useGameSocket());
    receive('connect');
    expect(socket.sent('player:reconnect')).toEqual([]);

    receive('room:created', session());
    receive('connect');
    expect(socket.sent('player:reconnect')).toEqual([{ roomId: 'room-1', playerId: 'me' }]);
  });

  it('restores a stored session on mount and reconnects right away if already connected', () => {
    localStorage.setItem('motionparty:session', JSON.stringify(session()));
    renderHook(() => useGameSocket());
    expect(store().session?.roomId).toBe('room-1');
    expect(store().screen).toBe('WAITING');
    expect(socket.sent('player:reconnect')).toEqual([{ roomId: 'room-1', playerId: 'me' }]);
  });

  it('waits for the connect event when the socket is not connected yet', () => {
    localStorage.setItem('motionparty:session', JSON.stringify(session()));
    socket.connected = false;
    renderHook(() => useGameSocket());
    expect(socket.sent('player:reconnect')).toEqual([]);
    receive('connect');
    expect(socket.sent('player:reconnect')).toHaveLength(1);
  });

  it('ignores a corrupt stored session', () => {
    localStorage.setItem('motionparty:session', '{oops');
    renderHook(() => useGameSocket());
    expect(store().session).toBeNull();
    expect(socket.sent('player:reconnect')).toEqual([]);
  });
});

describe('outgoing commands', () => {
  it('emit the expected payloads', () => {
    createRoom('nick', '2v2', 'freeze_tag');
    createRoom('nick');
    joinRoom('ABC234', 'guest');
    submitCalibration('room-1', 'me', 0.2);
    requestRematch('room-1');
    expect(socket.sent('room:create')).toEqual([
      { nickname: 'nick', mode: '2v2', gameType: 'freeze_tag' },
      { nickname: 'nick', mode: '1v1', gameType: 'tug_of_war' },
    ]);
    expect(socket.sent('room:join')).toEqual([{ code: 'ABC234', nickname: 'guest' }]);
    expect(socket.sent('calibration:submit')).toEqual([{ roomId: 'room-1', playerId: 'me', baseline: 0.2 }]);
    expect(socket.sent('room:rematch')).toEqual([{ roomId: 'room-1' }]);
  });

  it('sendPower is volatile and defaults expression to 0', () => {
    sendPower('room-1', 'me', 0.5);
    expect(socket.emitted).toEqual([
      { event: 'input:power', payload: { roomId: 'room-1', playerId: 'me', motionScore: 0.5, expressionScore: 0 }, volatile: true },
    ]);
  });

  it('exitRoom cycles the connection and resets local state', () => {
    useGameStore.getState().applySession(session());
    exitRoom();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.connect).toHaveBeenCalled();
    expect(store().session).toBeNull();
    expect(store().screen).toBe('LOBBY');
  });
});
