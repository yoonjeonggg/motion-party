/** Every localStorage key the app uses, so they're namespaced and discoverable in one place. */
const KEYS = {
  expressionEnabled: 'motionparty:expressionEnabled',
  onboarded: 'motionparty:onboarded',
  session: 'motionparty:session',
  gameTutorialSeenPrefix: 'motionparty:tutorial:',
} as const;

/**
 * localStorage can throw (Safari private mode, storage disabled/blocked, quota) - preferences
 * are best-effort, so a failure falls back to defaults instead of crashing the app.
 */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not persisted; the in-memory state still works for this visit.
  }
}

/**
 * Per-FN-08/§8 risk note: some players are uncomfortable with their expressions being
 * scored, so this lets them opt into motion-only play. Defaults to on (existing behavior).
 */
export function isExpressionEnabled(): boolean {
  return read(KEYS.expressionEnabled) !== '0';
}

export function setExpressionEnabled(enabled: boolean): void {
  write(KEYS.expressionEnabled, enabled ? '1' : '0');
}

export function hasOnboarded(): boolean {
  return read(KEYS.onboarded) === '1';
}

export function markOnboarded(): void {
  write(KEYS.onboarded, '1');
}

export function hasSeenGameTutorial(gameType: string): boolean {
  return read(KEYS.gameTutorialSeenPrefix + gameType) === '1';
}

export function markGameTutorialSeen(gameType: string): void {
  write(KEYS.gameTutorialSeenPrefix + gameType, '1');
}

export function loadStoredSession<T>(): T | null {
  try {
    const raw = read(KEYS.session);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // A corrupted/old-format entry would otherwise send `undefined` ids to the server.
    if (!parsed || typeof parsed !== 'object') return null;
    const { roomId, playerId } = parsed as Record<string, unknown>;
    return typeof roomId === 'string' && typeof playerId === 'string' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function storeSession(session: unknown): void {
  write(KEYS.session, JSON.stringify(session));
}

export function clearStoredSession(): void {
  write(KEYS.session, null);
}
