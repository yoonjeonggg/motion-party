import { useEffect, useRef, useState } from 'react';
import { submitCalibration } from '../hooks/useGameSocket';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { useGameStore } from '../store/gameStore';

const CALIBRATION_DURATION_MS = 3_000;

export function Calibration() {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const { videoRef, cameraState, faceDetected, beginCalibration, endCalibration } =
    useMotionCapture(true);

  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'CAPTURING' | 'RETRY' | 'DONE'>('CAPTURING');
  const everDetectedRef = useRef(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (faceDetected) everDetectedRef.current = true;
  }, [faceDetected]);

  useEffect(() => {
    if (cameraState !== 'READY' || startedRef.current) return;
    startedRef.current = true;
    everDetectedRef.current = false;
    beginCalibration();

    const startedAt = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setProgress(Math.min(1, elapsed / CALIBRATION_DURATION_MS));
      if (elapsed >= CALIBRATION_DURATION_MS) {
        clearInterval(interval);
        const baseline = endCalibration();
        if (!everDetectedRef.current) {
          setPhase('RETRY');
          return;
        }
        setPhase('DONE');
        if (session) submitCalibration(session.roomId, session.playerId, baseline);
      }
    }, 100);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraState]);

  function retry() {
    startedRef.current = false;
    setProgress(0);
    setPhase('CAPTURING');
  }

  if (!session) return null;

  const calibratedCount = players.filter((p) => p.calibrated).length;

  return (
    <section className="screen calibration">
      <h1>표정 캘리브레이션</h1>
      <div className="card">
        <video ref={videoRef} className="preview mirrored" muted playsInline />

        {phase === 'CAPTURING' && (
          <>
            <p className="instruction">편안한 표정을 유지해주세요</p>
            <div className="gauge">
              <div className="gauge-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            {!faceDetected && <p className="hint small">얼굴이 잘 보이도록 카메라를 조정해주세요</p>}
          </>
        )}

        {phase === 'RETRY' && (
          <>
            <p className="hint">얼굴을 인식하지 못했어요. 카메라 각도를 조정한 뒤 다시 시도해주세요.</p>
            <button type="button" className="primary" onClick={retry}>
              다시 시도
            </button>
          </>
        )}

        {phase === 'DONE' && (
          <>
            <p className="feedback">캘리브레이션 완료!</p>
            <p className="hint">
              {calibratedCount}/{players.length}명 준비 완료 · 상대방을 기다리는 중...
            </p>
          </>
        )}
      </div>
    </section>
  );
}
