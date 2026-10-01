import { useRef } from 'react';
import { useInputSender } from '../hooks/useInputSender';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { GESTURE_LABELS, GestureMatchTracker, isGesture } from '../lib/poseGesture';
import { useGameStore } from '../store/gameStore';
import { GAME_LABELS, opposite } from '../types';
import { PlayLayout } from './PlayLayout';
import { Gauge } from './ui/Gauge';

/** Play screen for 동작 따라하기 (simon says): mimic the cued pose as closely as possible before it rotates. */
export function SimonSaysPlayScreen() {
  const session = useGameStore((s) => s.session);
  const teamPower = useGameStore((s) => s.teamPower);
  const cue = useGameStore((s) => s.cue);
  const cueRemainingMs = useGameStore((s) => s.cueRemainingMs);

  const { videoRef, gesture, poseDetected } = useMotionCapture(true, {
    expression: false,
    motion: false,
    bodyMovement: false,
  });
  const matchTrackerRef = useRef(new GestureMatchTracker());

  useInputSender(session, () => ({
    motionScore: matchTrackerRef.current.update(cue !== '' && gesture === cue),
  }));

  if (!session) return null;

  const cueLabel = isGesture(cue) ? GESTURE_LABELS[cue] : '...';
  const matched = isGesture(cue) && gesture === cue;
  const secondsLeft = Math.ceil(cueRemainingMs / 1000);

  return (
    <PlayLayout
      gameLabel={GAME_LABELS.simon_says}
      arena={
        <div className={`banner phase-banner ${matched ? 'move' : 'freeze'}`}>
          지금 동작: {cueLabel}! ({secondsLeft}초)
        </div>
      }
      videoRef={videoRef}
      poseDetected={poseDetected}
      myStats={
        <>
          <p className="hint small">{matched ? '일치! 👍' : `내 동작: ${GESTURE_LABELS[gesture]}`}</p>
          <Gauge value={matched ? 1 : 0} alt={!matched} />
          <p className="hint small">누적 점수 {(teamPower[session.side] ?? 0).toFixed(1)}</p>
        </>
      }
      opponentStats={
        <p className="hint small">누적 점수 {(teamPower[opposite(session.side)] ?? 0).toFixed(1)}</p>
      }
    />
  );
}
