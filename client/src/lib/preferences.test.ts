import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredSession,
  hasOnboarded,
  hasSeenGameTutorial,
  isExpressionEnabled,
  loadStoredSession,
  markGameTutorialSeen,
  markOnboarded,
  setExpressionEnabled,
  storeSession,
} from './preferences';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function throwingStorage() {
  const fail = () => {
    throw new DOMException('blocked', 'SecurityError');
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('with working storage', () => {
  it('round-trips each preference', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(isExpressionEnabled()).toBe(true);
    setExpressionEnabled(false);
    expect(isExpressionEnabled()).toBe(false);
    setExpressionEnabled(true);
    expect(isExpressionEnabled()).toBe(true);

    expect(hasOnboarded()).toBe(false);
    markOnboarded();
    expect(hasOnboarded()).toBe(true);

    expect(hasSeenGameTutorial('freeze_tag')).toBe(false);
    markGameTutorialSeen('freeze_tag');
    expect(hasSeenGameTutorial('freeze_tag')).toBe(true);
    expect(hasSeenGameTutorial('tug_of_war')).toBe(false);
  });

  it('namespaces every key', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    markOnboarded();
    markGameTutorialSeen('x');
    storeSession({ roomId: 'r', playerId: 'p' });
    for (const key of storage.data.keys()) expect(key.startsWith('motionparty:')).toBe(true);
  });

  it('stores, loads and clears the session', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const session = { roomId: 'r1', playerId: 'p1', code: 'ABCDEF' };
    storeSession(session);
    expect(loadStoredSession()).toEqual(session);
    clearStoredSession();
    expect(loadStoredSession()).toBeNull();
  });

  it.each([
    ['corrupt JSON', '{not json'],
    ['a JSON string', '"hello"'],
    ['null', 'null'],
    ['missing playerId', '{"roomId":"r"}'],
    ['non-string ids', '{"roomId":1,"playerId":2}'],
  ])('rejects a stored session that is %s', (_label, raw) => {
    const storage = memoryStorage();
    storage.data.set('motionparty:session', raw);
    vi.stubGlobal('localStorage', storage);
    expect(loadStoredSession()).toBeNull();
  });
});

describe('when storage throws (private mode, blocked cookies)', () => {
  it('falls back to defaults instead of crashing', () => {
    vi.stubGlobal('localStorage', throwingStorage());
    expect(isExpressionEnabled()).toBe(true);
    expect(hasOnboarded()).toBe(false);
    expect(hasSeenGameTutorial('freeze_tag')).toBe(false);
    expect(loadStoredSession()).toBeNull();
  });

  it('swallows write failures', () => {
    vi.stubGlobal('localStorage', throwingStorage());
    expect(() => {
      setExpressionEnabled(false);
      markOnboarded();
      markGameTutorialSeen('x');
      storeSession({ roomId: 'r', playerId: 'p' });
      clearStoredSession();
    }).not.toThrow();
  });
});
