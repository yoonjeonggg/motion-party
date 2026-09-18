const EXPRESSION_KEY = 'motionparty:expressionEnabled';

/**
 * Per-FN-08/§8 risk note: some players are uncomfortable with their expressions being
 * scored, so this lets them opt into motion-only play. Defaults to on (existing behavior).
 */
export function isExpressionEnabled(): boolean {
  return localStorage.getItem(EXPRESSION_KEY) !== '0';
}

export function setExpressionEnabled(enabled: boolean): void {
  localStorage.setItem(EXPRESSION_KEY, enabled ? '1' : '0');
}
