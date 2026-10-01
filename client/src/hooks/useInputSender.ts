import { useEffect } from 'react';
import type { SessionInfo } from '../store/gameStore';
import { sendPower } from './useGameSocket';
import { useLatestRef } from './useLatestRef';

const SEND_INTERVAL_MS = 60;
/**
 * Re-send an unchanged value at least this often. Must stay well under the server's
 * INPUT_STALE_MS (1s), after which a silent player's input is treated as 0.
 */
const HEARTBEAT_MS = 400;
/** Changes smaller than this aren't worth a packet (scores are already quantized to 0.01). */
const MIN_DELTA = 0.01;

/**
 * Streams this player's input to the server while in a session. Sends every SEND_INTERVAL_MS
 * while the value is changing, but only a heartbeat while it holds still (idle/frozen players).
 */
export function useInputSender(
  session: SessionInfo | null,
  readInput: () => { motionScore: number; expressionScore?: number },
) {
  const readRef = useLatestRef(readInput);
  useEffect(() => {
    if (!session) return;
    let lastMotion = -1;
    let lastExpression = -1;
    let lastSentAt = 0;
    const interval = setInterval(() => {
      const { motionScore, expressionScore = 0 } = readRef.current();
      const now = performance.now();
      const changed =
        Math.abs(motionScore - lastMotion) >= MIN_DELTA || Math.abs(expressionScore - lastExpression) >= MIN_DELTA;
      if (!changed && now - lastSentAt < HEARTBEAT_MS) return;
      lastMotion = motionScore;
      lastExpression = expressionScore;
      lastSentAt = now;
      sendPower(session.roomId, session.playerId, motionScore, expressionScore);
    }, SEND_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, readRef]);
}
