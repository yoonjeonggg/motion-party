import { useEffect, useRef, useState } from 'react';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { useGameStore } from '../store/gameStore';

const ALREADY_DONE_KEY = 'motionparty:onboarded';
const ROPE_SPEED = 0.35;
const ROPE_LIMIT = 1;
const PRACTICE_RAMP_MS = 15_000;
const PRACTICE_TIME_LIMIT_MS = 20_000;
const EXPRESSION_DEMO_THRESHOLD = 0.15;

type Step = 'DEMO' | 'EXPRESSION_DEMO' | 'RULES' | 'PRACTICE';

function dummyPower(elapsedMs: number): number {
  const ramp = Math.min(elapsedMs / PRACTICE_RAMP_MS, 1);
  const noise = Math.sin(elapsedMs / 300) * 0.05;
  return Math.max(0, Math.min(1, 0.25 + ramp * 0.5 + noise));
}

export function Tutorial() {
  const setScreen = useGameStore((s) => s.setScreen);
  const { videoRef, cameraState, motionScore, poseDetected, expressionScore } = useMotionCapture(true);

  const [step, setStep] = useState<Step>('DEMO');
  const [reachedThreshold, setReachedThreshold] = useState(false);
  const reachedRef = useRef(false);
  const [expressionBonusShown, setExpressionBonusShown] = useState(false);
  const expressionBonusRef = useRef(false);
  const isReplay = useRef(hasOnboarded());

  // Practice round state
  const [ropePosition, setRopePosition] = useState(0);
  const [dummyScore, setDummyScore] = useState(0);
  const [practiceDone, setPracticeDone] = useState(false);
  const scoreRef = useRef(0);
  scoreRef.current = motionScore;
  const practiceRafRef = useRef<number | null>(null);
  const practiceStartRef = useRef(0);
  const lastFrameRef = useRef(0);
  const positionRef = useRef(0);

  useEffect(() => {
    if (motionScore >= 0.5 && !reachedRef.current) {
      reachedRef.current = true;
      setReachedThreshold(true);
    }
  }, [motionScore]);

  useEffect(() => {
    if (step === 'EXPRESSION_DEMO' && expressionScore >= EXPRESSION_DEMO_THRESHOLD && !expressionBonusRef.current) {
      expressionBonusRef.current = true;
      setExpressionBonusShown(true);
    }
  }, [step, expressionScore]);

  useEffect(() => {
    if (step !== 'PRACTICE') return;
    positionRef.current = 0;
    practiceStartRef.current = performance.now();
    lastFrameRef.current = practiceStartRef.current;

    const loop = (time: number) => {
      const dt = (time - lastFrameRef.current) / 1000;
      lastFrameRef.current = time;
      const elapsed = time - practiceStartRef.current;
      const dummy = dummyPower(elapsed);
      setDummyScore(dummy);

      const next = Math.max(
        -ROPE_LIMIT,
        Math.min(ROPE_LIMIT, positionRef.current + (scoreRef.current - dummy) * ROPE_SPEED * dt),
      );
      positionRef.current = next;
      setRopePosition(next);

      if (Math.abs(next) >= ROPE_LIMIT || elapsed >= PRACTICE_TIME_LIMIT_MS) {
        setPracticeDone(true);
        return;
      }
      practiceRafRef.current = requestAnimationFrame(loop);
    };
    practiceRafRef.current = requestAnimationFrame(loop);

    return () => {
      if (practiceRafRef.current) cancelAnimationFrame(practiceRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function finish() {
    localStorage.setItem(ALREADY_DONE_KEY, '1');
    setScreen('LOBBY');
  }

  const showSkip =
    step === 'EXPRESSION_DEMO' ||
    step === 'RULES' ||
    step === 'PRACTICE' ||
    (step === 'DEMO' && cameraState === 'READY');

  const ropePercent = ((ropePosition + 1) / 2) * 100;

  return (
    <section className="screen tutorial">
      {showSkip && (
        <button
          type="button"
          className={`skip-link${isReplay.current ? ' prominent' : ''}`}
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
              <div className="gauge">
                <div className="gauge-fill" style={{ width: `${Math.round(motionScore * 100)}%` }} />
              </div>
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
          <div className="gauge">
            <div className="gauge-fill" style={{ width: `${Math.round(motionScore * 100)}%` }} />
          </div>
          <p className="hint small">동작 + 표정</p>
          <div className="gauge">
            <div
              className="gauge-fill opponent"
              style={{ width: `${Math.round(Math.min(1, motionScore * (1 + expressionScore)) * 100)}%` }}
            />
          </div>
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
          <div className="rope-track">
            <div className="rope-zone zone-a" />
            <div className="rope-zone zone-b" />
            <div className="rope-marker" style={{ left: '50%' }} />
            <div className="rope-center" />
          </div>
          <button type="button" className="primary" onClick={() => setStep('PRACTICE')}>
            이해했어요
          </button>
        </div>
      )}

      {step === 'PRACTICE' && (
        <>
          <p className="sub">실전과 똑같이 연습해봐요!</p>

          <div className="rope-track">
            <div className="rope-zone zone-a" />
            <div className="rope-zone zone-b" />
            <div className="rope-marker" style={{ left: `${ropePercent}%` }} />
            <div className="rope-center" />
          </div>

          <div className="players-row">
            <div className="player-panel">
              <video ref={videoRef} className="preview mirrored small" muted playsInline />
              <p className="player-name">나</p>
              {!poseDetected && <p className="hint small">카메라 각도를 조정해주세요</p>}
              <div className="gauge">
                <div className="gauge-fill" style={{ width: `${Math.round(motionScore * 100)}%` }} />
              </div>
            </div>

            <div className="vs">VS</div>

            <div className="player-panel">
              <div className="preview small placeholder">더</div>
              <p className="player-name">연습 상대</p>
              <div className="gauge">
                <div
                  className="gauge-fill opponent"
                  style={{ width: `${Math.round(dummyScore * 100)}%` }}
                />
              </div>
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

export function hasOnboarded(): boolean {
  return localStorage.getItem(ALREADY_DONE_KEY) === '1';
}
