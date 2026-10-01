import { useEffect, useRef, useState } from 'react';
import { submitCalibration } from '../hooks/useGameSocket';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { isExpressionEnabled } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';

const CALIBRATION_DURATION_MS = 3_000;

export function Calibration() {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const expressionOn = isExpressionEnabled();
  const { videoRef, cameraState, faceDetected, beginCalibration, endCalibration } = useMotionCapture(expressionOn, {
    pose: false,
  });

  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'CAPTURING' | 'RETRY' | 'DONE'>('CAPTURING');
  const everDetectedRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (faceDetected) everDetectedRef.current = true;
  }, [faceDetected]);

  // Nothing to calibrate when expression scoring is off - report a zero baseline right away.
  useEffect(() => {
    if (expressionOn || !session || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    submitCalibration(session.roomId, session.playerId, 0);
  }, [expressionOn, session]);

  // Re-runs per attempt: bumping `attempt` is what makes "다시 시도" actually restart capture
  // (cameraState stays READY, so it alone wouldn't re-trigger this effect).
  useEffect(() => {
    if (!expressionOn || cameraState !== 'READY') return;
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
  }, [cameraState, attempt]);

  function retry() {
    setProgress(0);
    setPhase('CAPTURING');
    setAttempt((n) => n + 1);
  }

  /** Camera unusable or face never found: report a neutral baseline so the room isn't stuck waiting on us. */
  function continueWithoutCalibration() {
    if (!session) return;
    setPhase('DONE');
    submitCalibration(session.roomId, session.playerId, 0);
  }

  const cameraFailed = cameraState === 'DENIED' || cameraState === 'ERROR';

  if (!session) return null;

  const calibratedCount = players.filter((p) => p.calibrated).length;

  if (!expressionOn) {
    return (
      <section className="screen calibration">
        <h1>표정 캘리브레이션</h1>
        <div className="card">
          <p className="feedback">표정 인식을 껐어요. 동작만으로 플레이해요!</p>
          <p className="hint">
            {calibratedCount}/{players.length}명 준비 완료 · 상대방을 기다리는 중...
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen calibration">
      <h1>표정 캘리브레이션</h1>
      <div className="card">
        <p className="hint">평소 표정을 기준으로 저장해서, 경기 중 힘든 표정을 더 정확하게 인식해요.</p>
        {!cameraFailed && <video ref={videoRef} className="preview mirrored" muted playsInline />}

        {cameraFailed && phase !== 'DONE' && (
          <>
            <p className="error-text">
              {cameraState === 'DENIED' ? '카메라 권한이 거부되었어요.' : '카메라를 불러오지 못했어요.'}
            </p>
            <p className="hint">권한을 허용한 뒤 다시 시도하거나, 표정 보너스 없이 바로 진행할 수 있어요.</p>
            <div className="button-row">
              <button type="button" onClick={() => window.location.reload()}>
                다시 시도
              </button>
              <button type="button" className="primary" onClick={continueWithoutCalibration}>
                표정 없이 진행
              </button>
            </div>
          </>
        )}

        {!cameraFailed && phase === 'CAPTURING' && (
          <>
            <p className="instruction">편안한 표정을 유지해주세요</p>
            <div className="gauge">
              <div className="gauge-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            {!faceDetected && <p className="hint small warn">얼굴이 잘 보이도록 카메라를 조정해주세요</p>}
          </>
        )}

        {phase === 'RETRY' && (
          <>
            <p className="hint">얼굴을 인식하지 못했어요. 카메라 각도를 조정한 뒤 다시 시도해 주세요.</p>
            <div className="button-row">
              <button type="button" onClick={continueWithoutCalibration}>
                건너뛰기
              </button>
              <button type="button" className="primary" onClick={retry}>
                다시 시도
              </button>
            </div>
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
