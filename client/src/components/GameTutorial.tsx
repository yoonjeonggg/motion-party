import { useEffect, useRef, useState } from 'react';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { useGameStore } from '../store/gameStore';
import type { GameType } from '../types';

const TUTORIAL_SEEN_PREFIX = 'motionparty:tutorial:';
const PULL_THRESHOLD = 0.5;
const MOVE_PHASE_MS = 4_000;
const FREEZE_PHASE_MS = 3_000;
const FREEZE_DEMO_THRESHOLD = 0.15;

const COPY: Record<GameType, { title: string; instruction: string; ruleText: string }> = {
  tug_of_war: {
    title: '줄다리기 방법',
    instruction: '팔을 당기는 동작을 반복해보세요!',
    ruleText: '로프를 상대 쪽 끝까지 밀면 승리! 3판 2선승제예요.',
  },
  arm_wrestle: {
    title: '팔씨름 방법',
    instruction: '팔을 당기는 동작을 반복해서 상대를 눌러보세요!',
    ruleText: '팔을 상대 쪽 끝까지 밀어붙이면 승리! 3판 2선승제예요.',
  },
  freeze_tag: {
    title: '얼음땡 방법',
    instruction: '',
    ruleText: '"움직이세요" 동안 최대한 움직이고, "얼음!"이 뜨면 완전히 멈추세요. 움직이다 걸리면 져요.',
  },
};

/** Per-game-mode "how to play" screen shown once per gameType, with a looping demo animation to mimic. */
export function GameTutorial() {
  const session = useGameStore((s) => s.session);
  const setScreen = useGameStore((s) => s.setScreen);
  const gameType = session?.gameType ?? 'tug_of_war';
  const isFreezeTag = gameType === 'freeze_tag';
  const isReplay = useRef(hasSeenGameTutorial(gameType));

  const { videoRef, cameraState, motionScore, bodyMovementScore, poseDetected } = useMotionCapture(true, {
    expression: false,
  });

  const [reached, setReached] = useState(false);
  const reachedRef = useRef(false);
  useEffect(() => {
    if (!isFreezeTag && motionScore >= PULL_THRESHOLD && !reachedRef.current) {
      reachedRef.current = true;
      setReached(true);
    }
  }, [isFreezeTag, motionScore]);

  const [phase, setPhase] = useState<'MOVE' | 'FREEZE'>('MOVE');
  const [cycleDone, setCycleDone] = useState(false);
  const [caught, setCaught] = useState(false);
  useEffect(() => {
    if (!isFreezeTag) return;
    const timer = setTimeout(
      () => {
        setCaught(false);
        setPhase((p) => {
          if (p === 'MOVE') return 'FREEZE';
          setCycleDone(true);
          return 'MOVE';
        });
      },
      phase === 'MOVE' ? MOVE_PHASE_MS : FREEZE_PHASE_MS,
    );
    return () => clearTimeout(timer);
  }, [isFreezeTag, phase]);

  useEffect(() => {
    if (isFreezeTag && phase === 'FREEZE' && bodyMovementScore > FREEZE_DEMO_THRESHOLD) {
      setCaught(true);
    }
  }, [isFreezeTag, phase, bodyMovementScore]);

  function proceed() {
    markGameTutorialSeen(gameType);
    setScreen('WAITING');
  }

  const copy = COPY[gameType];
  const canProceed = isFreezeTag ? cycleDone : reached;
  const showSkip = cameraState === 'READY';
  const demoVariant = isFreezeTag ? (phase === 'FREEZE' ? 'freeze' : 'move') : 'pull';
  const gaugeScore = isFreezeTag ? bodyMovementScore : motionScore;

  return (
    <section className="screen tutorial">
      {showSkip && (
        <button type="button" className={`skip-link${isReplay.current ? ' prominent' : ''}`} onClick={proceed}>
          건너뛰기
        </button>
      )}

      <h1>{copy.title}</h1>

      {cameraState === 'DENIED' && (
        <div className="card error-card">
          <p>카메라 권한이 거부되었어요.</p>
          <p className="hint">브라우저 주소창의 카메라 아이콘에서 권한을 허용한 뒤 다시 시도해주세요.</p>
        </div>
      )}

      {(cameraState === 'REQUESTING' || cameraState === 'READY') && (
        <div className="card">
          <div className={`demo-figure ${demoVariant}`}>
            <div className="demo-head" />
            <div className="demo-body" />
            <div className="demo-arm demo-arm-left" />
            <div className="demo-arm demo-arm-right" />
            <div className="demo-leg demo-leg-left" />
            <div className="demo-leg demo-leg-right" />
            {isFreezeTag && phase === 'FREEZE' && <div className="demo-ice">❄️</div>}
          </div>

          {isFreezeTag ? (
            <div className={`banner phase-banner ${phase === 'FREEZE' ? 'freeze' : 'move'}`}>
              {phase === 'FREEZE' ? '얼음! 움직이면 안돼요' : '최대한 움직이세요!'}
            </div>
          ) : (
            <p className="instruction">{copy.instruction}</p>
          )}

          <video ref={videoRef} className="preview mirrored" muted playsInline />

          <div className="gauge">
            <div
              className={`gauge-fill${isFreezeTag && phase === 'FREEZE' ? ' opponent' : ''}`}
              style={{ width: `${Math.round(Math.min(1, gaugeScore) * 100)}%` }}
            />
          </div>

          {!poseDetected && <p className="hint small">카메라에 상반신이 잘 보이도록 조정해주세요</p>}
          {isFreezeTag && phase === 'FREEZE' && caught && (
            <p className="hint small">앗! 움직였어요 😱 얼음 상태에선 완전히 멈춰야 해요</p>
          )}

          {canProceed ? (
            <>
              {!isFreezeTag && <p className="feedback">좋아요! 이렇게 하면 돼요 💪</p>}
              <p className="hint">{copy.ruleText}</p>
              <button type="button" className="primary" onClick={proceed}>
                대기실로 이동
              </button>
            </>
          ) : (
            !isFreezeTag && (
              <p className="hint">카메라에 상반신이 잘 보이도록 위치를 조정하고, 팔을 크게 당겨보세요.</p>
            )
          )}
        </div>
      )}
    </section>
  );
}

export function hasSeenGameTutorial(gameType: GameType): boolean {
  return localStorage.getItem(TUTORIAL_SEEN_PREFIX + gameType) === '1';
}

export function markGameTutorialSeen(gameType: GameType): void {
  localStorage.setItem(TUTORIAL_SEEN_PREFIX + gameType, '1');
}
