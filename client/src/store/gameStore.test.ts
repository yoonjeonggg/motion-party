import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStatePayload, SessionPayload } from '../types';
import { useGameStore } from './gameStore';

const session: SessionPayload = {
  roomId: 'room-1',
  code: 'ABCDEF',
  playerId: 'p1',
  side: 'A',
  mode: '1v1',
  gameType: 'tug_of_war',
};

const state = (overrides: Partial<GameStatePayload> = {}): GameStatePayload => ({
  tick: 0,
  roundNumber: 1,
  roundWins: { A: 0, B: 0 },
  status: 'PLAYING',
  ...overrides,
});

const store = () => useGameStore.getState();
const initial = useGameStore.getState();

beforeEach(() => {
  useGameStore.setState(initial, true);
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
});

describe('session lifecycle', () => {
  it('applySession persists the session and opens the waiting room', () => {
    store().setError('old error');
    store().applySession(session);
    expect(store().session).toEqual(session);
    expect(store().screen).toBe('WAITING');
    expect(store().error).toBeNull();
    expect(JSON.parse(localStorage.getItem('motionparty:session')!)).toEqual(session);
  });

  it('leaveRoom clears the session, game state and storage', () => {
    store().applySession(session);
    store().applyGameState(state({ ropePosition: 0.5 }));
    store().leaveRoom();
    expect(store().session).toBeNull();
    expect(store().screen).toBe('LOBBY');
    expect(store().ropePosition).toBe(0);
    expect(localStorage.getItem('motionparty:session')).toBeNull();
  });

  it('resetMatch keeps the session but clears match state', () => {
    store().applySession(session);
    store().applyMatchEnd({ winner: 'A', finalScores: { A: 2, B: 0 }, reason: 'ROUND_WINS' });
    store().updateHighlight(0.9, 'data:x');
    store().resetMatch();
    expect(store().session).toEqual(session);
    expect(store().screen).toBe('WAITING');
    expect(store().matchEnd).toBeNull();
    expect(store().highlight).toBeNull();
  });
});

describe('room status', () => {
  it('jumps to calibration when the room starts calibrating', () => {
    store().applySession(session);
    store().applyRoomStatus('CALIBRATING');
    expect(store().screen).toBe('CALIBRATING');
  });

  it('keeps the current screen for other statuses', () => {
    store().applySession(session);
    store().applyRoomStatus('PAUSED');
    expect(store().screen).toBe('WAITING');
    expect(store().status).toBe('PAUSED');
  });
});

describe('game state', () => {
  it('only overwrites the fields the payload carries', () => {
    store().applyGameState(state({ ropePosition: 0.4, teamPower: { A: 1, B: 2 } }));
    store().applyGameState(state({ phase: 'FREEZE', phaseRemainingMs: 1200 }));
    expect(store().ropePosition).toBe(0.4);
    expect(store().teamPower).toEqual({ A: 1, B: 2 });
    expect(store().phase).toBe('FREEZE');
    expect(store().phaseRemainingMs).toBe(1200);
  });

  it('moves a reconnecting player from WAITING back into the game', () => {
    store().applySession(session);
    store().applyGameState(state({ status: 'PLAYING' }));
    expect(store().screen).toBe('PLAYING');
  });

  it('does not pull a waiting player into a paused game', () => {
    store().applySession(session);
    store().applyGameState(state({ status: 'PAUSED' }));
    expect(store().screen).toBe('WAITING');
  });

  it('game start resets positions and the disconnect banner', () => {
    store().applyGameState(state({ ropePosition: 1, armPosition: -1 }));
    store().applyOpponentDisconnected(true);
    store().applyGameStart();
    expect(store()).toMatchObject({ screen: 'PLAYING', ropePosition: 0, armPosition: 0, opponentDisconnected: false });
  });

  it('round and match end switch screens and record results', () => {
    store().applyRoundEnd({ winner: 'B', roundNumber: 1, scores: { A: 0, B: 1 } });
    expect(store()).toMatchObject({ screen: 'ROUND_RESULT', roundWins: { A: 0, B: 1 } });
    store().applyMatchEnd({ winner: 'B', finalScores: { A: 0, B: 2 }, reason: 'DISCONNECT' });
    expect(store()).toMatchObject({ screen: 'MATCH_RESULT', status: 'MATCH_RESULT' });
    expect(store().matchEnd?.reason).toBe('DISCONNECT');
  });
});

describe('highlight', () => {
  it('keeps only the highest-scoring frame', () => {
    store().updateHighlight(0.5, 'a');
    store().updateHighlight(0.4, 'b');
    expect(store().highlight).toEqual({ score: 0.5, dataUrl: 'a' });
    store().updateHighlight(0.7, 'c');
    expect(store().highlight).toEqual({ score: 0.7, dataUrl: 'c' });
  });
});
