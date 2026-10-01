/** Every localStorage key the app uses, so they're namespaced and discoverable in one place. */
const KEYS = {
  expressionEnabled: 'motionparty:expressionEnabled',
  onboarded: 'motionparty:onboarded',
  session: 'motionparty:session',
  gameTutorialSeenPrefix: 'motionparty:tutorial:',
} as const;

/**
 * Per-FN-08/§8 risk note: some players are uncomfortable with their expressions being
 * scored, so this lets them opt into motion-only play. Defaults to on (existing behavior).
 */
export function isExpressionEnabled(): boolean {
  return localStorage.getItem(KEYS.expressionEnabled) !== '0';
}

export function setExpressionEnabled(enabled: boolean): void {
  localStorage.setItem(KEYS.expressionEnabled, enabled ? '1' : '0');
}

export function hasOnboarded(): boolean {
  return localStorage.getItem(KEYS.onboarded) === '1';
}

export function markOnboarded(): void {
  localStorage.setItem(KEYS.onboarded, '1');
}

export function hasSeenGameTutorial(gameType: string): boolean {
  return localStorage.getItem(KEYS.gameTutorialSeenPrefix + gameType) === '1';
}

export function markGameTutorialSeen(gameType: string): void {
  localStorage.setItem(KEYS.gameTutorialSeenPrefix + gameType, '1');
}

export function loadStoredSession<T>(): T | null {
  try {
    const raw = localStorage.getItem(KEYS.session);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function storeSession(session: unknown): void {
  localStorage.setItem(KEYS.session, JSON.stringify(session));
}

export function clearStoredSession(): void {
  localStorage.removeItem(KEYS.session);
}
