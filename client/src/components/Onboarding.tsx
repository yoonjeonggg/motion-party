import { useEffect, useRef, useState } from 'react';
import { usePoseMotionScore } from '../hooks/usePoseMotionScore';
import { useGameStore } from '../store/gameStore';

const ALREADY_DONE_KEY = 'motionparty:onboarded';

export function Onboarding() {
  const setScreen = useGameStore((s) => s.setScreen);
  const { videoRef, cameraState, motionScore } = usePoseMotionScore(true);
  const [reachedThreshold, setReachedThreshold] = useState(false);
  const reachedRef = useRef(false);

  useEffect(() => {
    if (motionScore >= 0.5 && !reachedRef.current) {
      reachedRef.current = true;
      setReachedThreshold(true);
    }
  }, [motionScore]);

  function handleContinue() {
    localStorage.setItem(ALREADY_DONE_KEY, '1');
    setScreen('LOBBY');
  }

  return (
    <section className="screen onboarding">
      <h1>모션파티</h1>
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
              <button type="button" onClick={handleContinue}>
                로비로 이동
              </button>
            </>
          ) : (
            <p className="hint">카메라에 상반신이 잘 보이도록 위치를 조정하고, 팔을 크게 당겨보세요.</p>
          )}
        </div>
      )}
    </section>
  );
}

export function hasOnboarded(): boolean {
  return localStorage.getItem(ALREADY_DONE_KEY) === '1';
}
