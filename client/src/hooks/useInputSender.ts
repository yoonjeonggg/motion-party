import { useEffect } from 'react';
import type { SessionInfo } from '../store/gameStore';
import { sendPower } from './useGameSocket';
import { useLatestRef } from './useLatestRef';

const SEND_INTERVAL_MS = 60;

/** Streams this player's input to the server every SEND_INTERVAL_MS while in a session. */
export function useInputSender(
  session: SessionInfo | null,
  readInput: () => { motionScore: number; expressionScore?: number },
) {
  const readRef = useLatestRef(readInput);
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const { motionScore, expressionScore = 0 } = readRef.current();
      sendPower(session.roomId, session.playerId, motionScore, expressionScore);
    }, SEND_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, readRef]);
}
