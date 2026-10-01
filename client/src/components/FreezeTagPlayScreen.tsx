import { useInputSender } from '../hooks/useInputSender';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { useGameStore } from '../store/gameStore';
import { GAME_LABELS, opposite } from '../types';
import { PlayLayout } from './PlayLayout';
import { Gauge } from './ui/Gauge';

/** Play screen for 얼음땡 (freeze tag): move as much as possible, then freeze on cue. */
export function FreezeTagPlayScreen() {
  const session = useGameStore((s) => s.session);
  const teamPower = useGameStore((s) => s.teamPower);
  const phase = useGameStore((s) => s.phase);
  const phaseRemainingMs = useGameStore((s) => s.phaseRemainingMs);

  const { videoRef, bodyMovementScore, poseDetected } = useMotionCapture(true, {
    expression: false,
    motion: false,
    gesture: false,
  });

  useInputSender(session, () => ({ motionScore: bodyMovementScore }));

  if (!session) return null;

  const isFreeze = phase === 'FREEZE';
  const secondsLeft = Math.ceil(phaseRemainingMs / 1000);

  return (
    <PlayLayout
      gameLabel={GAME_LABELS.freeze_tag}
      arena={
        <div className={`banner phase-banner ${isFreeze ? 'freeze' : 'move'}`}>
          {isFreeze ? `얼음! 움직이면 져요 (${secondsLeft}초)` : `최대한 움직이세요! (${secondsLeft}초)`}
        </div>
      }
      videoRef={videoRef}
      poseDetected={poseDetected}
      myStats={
        <>
          <Gauge value={bodyMovementScore} alt={isFreeze} />
          <p className="hint small">누적 점수 {(teamPower[session.side] ?? 0).toFixed(1)}</p>
        </>
      }
      opponentStats={
        <p className="hint small">누적 점수 {(teamPower[opposite(session.side)] ?? 0).toFixed(1)}</p>
      }
    />
  );
}
