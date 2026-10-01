import { useEffect, useState } from 'react';
import { useLatch } from '../hooks/useLatch';
import { useLatestRef } from '../hooks/useLatestRef';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { hasOnboarded, markOnboarded } from '../lib/preferences';
import { clamp01 } from '../lib/smoothing';
import { useGameStore } from '../store/gameStore';
import { Gauge } from './ui/Gauge';
import { RopeTrack } from './ui/RopeTrack';

/** Mirrors the server's tug-of-war tuning (server/src/games/tugOfWar.ts) so practice feels like a real match. */
const ROPE_SPEED = 0.35;
const ROPE_LIMIT = 1;
const PRACTICE_RAMP_MS = 15_000;
const PRACTICE_TIME_LIMIT_MS = 20_000;
const PULL_THRESHOLD = 0.5;
const EXPRESSION_DEMO_THRESHOLD = 0.15;

type Step = 'DEMO' | 'EXPRESSION_DEMO' | 'RULES' | 'PRACTICE';

function dummyPower(elapsedMs: number): number {
  const ramp = Math.min(elapsedMs / PRACTICE_RAMP_MS, 1);
  const noise = Math.sin(elapsedMs / 300) * 0.05;
  return clamp01(0.25 + ramp * 0.5 + noise);
}

export function Tutorial() {
  const setScreen = useGameStore((s) => s.setScreen);
  const { videoRef, cameraState, motionScore, poseDetected, expressionScore } = useMotionCapture(true, {
    bodyMovement: false,
    gesture: false,
  });

  const [step, setStep] = useState<Step>('DEMO');
  const reachedThreshold = useLatch(motionScore >= PULL_THRESHOLD);
  const expressionBonusShown = useLatch(step === 'EXPRESSION_DEMO' && expressionScore >= EXPRESSION_DEMO_THRESHOLD);
  const [isReplay] = useState(hasOnboarded);

  // Practice round state
  const [ropePosition, setRopePosition] = useState(0);
  const [dummyScore, setDummyScore] = useState(0);
  const [practiceDone, setPracticeDone] = useState(false);
  const scoreRef = useLatestRef(motionScore);

  useEffect(() => {
    if (step !== 'PRACTICE') return;
    const startedAt = performance.now();
    let lastFrame = startedAt;
    let position = 0;
    let raf = 0;

    const loop = (time: number) => {
      const dt = (time - lastFrame) / 1000;
      lastFrame = time;
      const elapsed = time - startedAt;
      const dummy = dummyPower(elapsed);
      setDummyScore(dummy);

      position = Math.max(-ROPE_LIMIT, Math.min(ROPE_LIMIT, position + (scoreRef.current - dummy) * ROPE_SPEED * dt));
      setRopePosition(position);

      if (Math.abs(position) >= ROPE_LIMIT || elapsed >= PRACTICE_TIME_LIMIT_MS) {
        setPracticeDone(true);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  }, [step, scoreRef]);

  function finish() {
    markOnboarded();
    setScreen('LOBBY');
  }

  const showSkip =
    step === 'EXPRESSION_DEMO' ||
    step === 'RULES' ||
    step === 'PRACTICE' ||
    (step === 'DEMO' && cameraState === 'READY');

  return (
    <section className="screen tutorial">
      {showSkip && (
        <button
          type="button"
          className={`skip-link${isReplay ? ' prominent' : ''}`}
          onClick={finish}
        >
          건너뛰기
        </button>
      )}

      <h1>모션파티</h1>

      {step === 'DEMO' && (
        <>
          <p className="sub">카메라로 당신의 동작을 인식해요. 영상은 저장되거나 서버로 전송되지 않아요.</p>

          {cameraState === 'DENIED' && (
            <div className="card error-card">
              <p>카메라 권한이 거부되었어요.</p>
              <p className="hint">브라우저 주소창의 카메라 아이콘에서 권한을 허용한 뒤 다시 시도해주세요.</p>
              <button type="button" onClick={() => window.location.reload()}>
                다시 시도
              </button>
            </div>
          )}

          {cameraState === 'ERROR' && (
            <div className="card error-card">
              <p>카메라를 불러오지 못했어요. 다른 브라우저(Chrome/Edge)에서 시도해주세요.</p>
            </div>
          )}

          {(cameraState === 'REQUESTING' || cameraState === 'READY') && (
            <div className="card onboarding-demo">
              <video ref={videoRef} className="preview mirrored" muted playsInline />
              <p className="instruction">팔을 당겨보세요!</p>
              <Gauge value={motionScore} />
              {reachedThreshold ? (
                <>
                  <p className="feedback">좋아요! 이렇게 당기면 돼요 💪</p>
                  <button type="button" className="primary" onClick={() => setStep('EXPRESSION_DEMO')}>
                    다음
                  </button>
                </>
              ) : (
                <p className="hint">카메라에 상반신이 잘 보이도록 위치를 조정하고, 팔을 크게 당겨보세요.</p>
              )}
            </div>
          )}
        </>
      )}

      {step === 'EXPRESSION_DEMO' && (
        <div className="card onboarding-demo">
          <video ref={videoRef} className="preview mirrored" muted playsInline />
          <p className="instruction">이번엔 힘든 표정도 같이 지어보세요!</p>
          <p className="hint small">동작만 할 때</p>
          <Gauge value={motionScore} />
          <p className="hint small">동작 + 표정</p>
          <Gauge value={motionScore * (1 + expressionScore)} alt />
          {expressionBonusShown ? (
            <>
              <p className="feedback">표정 보너스 +{Math.round(expressionScore * 100)}% 💥</p>
              <button type="button" className="primary" onClick={() => setStep('RULES')}>
                다음
              </button>
            </>
          ) : (
            <p className="hint">찡그리고, 입을 앙다물어보세요.</p>
          )}
        </div>
      )}

      {step === 'RULES' && (
        <div className="card">
          <p className="instruction">로프를 상대 쪽 끝까지 밀면 승리! 3판 2선승제예요.</p>
          <RopeTrack position={0} />
          <button type="button" className="primary" onClick={() => setStep('PRACTICE')}>
            이해했어요
          </button>
        </div>
      )}

      {step === 'PRACTICE' && (
        <>
          <p className="sub">실전과 똑같이 연습해봐요!</p>

          <RopeTrack position={ropePosition} />

          <div className="players-row">
            <div className="player-panel">
              <video ref={videoRef} className="preview mirrored small" muted playsInline />
              <p className="player-name">나</p>
              {!poseDetected && <p className="hint small">카메라 각도를 조정해주세요</p>}
              <Gauge value={motionScore} />
            </div>

            <div className="vs">VS</div>

            <div className="player-panel">
              <div className="preview small placeholder">더</div>
              <p className="player-name">연습 상대</p>
              <Gauge value={dummyScore} alt />
            </div>
          </div>

          {practiceDone && (
            <div className="card">
              <p className="feedback">연습 완료!</p>
              <p className="sub">이제 진짜 게임을 시작해볼까요?</p>
              <button type="button" className="primary" onClick={finish}>
                로비로 이동
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
