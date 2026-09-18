import { useEffect, useRef, useState } from 'react';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { GESTURE_LABELS, SIMON_SAYS_GESTURES } from '../lib/poseGesture';
import { useGameStore } from '../store/gameStore';
import type { GameType } from '../types';

const TUTORIAL_SEEN_PREFIX = 'motionparty:tutorial:';
const PULL_THRESHOLD = 0.5;
const MOVE_PHASE_MS = 4_000;
const FREEZE_PHASE_MS = 3_000;
const FREEZE_DEMO_THRESHOLD = 0.15;
/** Mirrors server SYNC_MAX_BONUS (server/src/types.ts) so the demo's numbers match the real match. */
const SYNC_MAX_BONUS = 0.3;
const SYNC_BONUS_TARGET = 0.2;
const SYNC_RHYTHM_PERIOD_MS = 1_400;
const SIMON_CUE_MS = 2_500;
/** kebab-case CSS class suffix for each demoed gesture, e.g. LEFT_ARM_UP -> left-arm-up. */
const SIMON_CLASS: Record<(typeof SIMON_SAYS_GESTURES)[number], string> = {
  LEFT_ARM_UP: 'simon-left-arm-up',
  RIGHT_ARM_UP: 'simon-right-arm-up',
  BOTH_ARMS_UP: 'simon-both-arms-up',
  ARMS_OUT: 'simon-arms-out',
};

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
  simon_says: {
    title: '동작 따라하기 방법',
    instruction: '',
    ruleText: '화면에 뜨는 동작을 최대한 빠르고 정확하게 따라 하세요! 더 많이 맞힌 쪽이 승리해요.',
  },
};

/** Per-game-mode "how to play" screen shown once per gameType, with a looping demo animation to mimic. */
export function GameTutorial() {
  const session = useGameStore((s) => s.session);
  const setScreen = useGameStore((s) => s.setScreen);
  const gameType = session?.gameType ?? 'tug_of_war';
  const isFreezeTag = gameType === 'freeze_tag';
  const isSimonSays = gameType === 'simon_says';
  const isTugStyle = !isFreezeTag && !isSimonSays;
  /** 2v2 tug-style matches apply a teammate sync bonus (FN-10); freeze_tag/simon_says never do. */
  const showSyncDemo = isTugStyle && session?.mode === '2v2';
  const isReplay = useRef(hasSeenGameTutorial(gameType));

  const { videoRef, cameraState, motionScore, bodyMovementScore, gesture, poseDetected } = useMotionCapture(true, {
    expression: false,
  });
  const motionScoreRef = useRef(0);
  motionScoreRef.current = motionScore;

  const [reached, setReached] = useState(false);
  const reachedRef = useRef(false);
  useEffect(() => {
    if (isTugStyle && motionScore >= PULL_THRESHOLD && !reachedRef.current) {
      reachedRef.current = true;
      setReached(true);
    }
  }, [isTugStyle, motionScore]);

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

  // simon_says only: cycle a demo pose every SIMON_CUE_MS and wait for the user to match it once.
  const [demoCueIndex, setDemoCueIndex] = useState(0);
  const demoCue = SIMON_SAYS_GESTURES[demoCueIndex % SIMON_SAYS_GESTURES.length]!;
  const [simonMatched, setSimonMatched] = useState(false);
  const simonMatchedRef = useRef(false);
  useEffect(() => {
    if (!isSimonSays) return;
    const timer = setTimeout(() => {
      setDemoCueIndex((i) => (i + 1) % SIMON_SAYS_GESTURES.length);
    }, SIMON_CUE_MS);
    return () => clearTimeout(timer);
  }, [isSimonSays, demoCueIndex]);

  useEffect(() => {
    if (isSimonSays && gesture === demoCue && !simonMatchedRef.current) {
      simonMatchedRef.current = true;
      setSimonMatched(true);
    }
  }, [isSimonSays, gesture, demoCue]);

  // Step 2 for 2v2 tug-style games only: practice matching a dummy teammate's rhythm (FN-10 sync bonus).
  const [subStep, setSubStep] = useState<'PULL' | 'SYNC'>('PULL');
  const isSync = subStep === 'SYNC' && showSyncDemo;
  const [teammatePower, setTeammatePower] = useState(0);
  const [syncBonus, setSyncBonus] = useState(0);
  const [syncReached, setSyncReached] = useState(false);
  const syncReachedRef = useRef(false);
  const syncRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isSync) return;
    const startedAt = performance.now();

    const loop = (time: number) => {
      const elapsed = time - startedAt;
      const teammate = (Math.sin(elapsed / (SYNC_RHYTHM_PERIOD_MS / (2 * Math.PI))) + 1) / 2;
      const bonus = SYNC_MAX_BONUS * Math.max(0, 1 - Math.abs(motionScoreRef.current - teammate));
      setTeammatePower(teammate);
      setSyncBonus(bonus);
      if (bonus >= SYNC_BONUS_TARGET && !syncReachedRef.current) {
        syncReachedRef.current = true;
        setSyncReached(true);
      }
      syncRafRef.current = requestAnimationFrame(loop);
    };
    syncRafRef.current = requestAnimationFrame(loop);

    return () => {
      if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current);
    };
  }, [isSync]);

  function proceed() {
    markGameTutorialSeen(gameType);
    setScreen('WAITING');
  }

  const copy = COPY[gameType];
  const showSkip = cameraState === 'READY';
  const demoVariant = isFreezeTag
    ? phase === 'FREEZE'
      ? 'freeze'
      : 'move'
    : isSimonSays
      ? SIMON_CLASS[demoCue]
      : 'pull';
  const gaugeScore = isFreezeTag ? bodyMovementScore : isSimonSays ? (gesture === demoCue ? 1 : 0) : motionScore;
  const teamPowerPercent = Math.round(Math.min(1, (motionScore + teammatePower) / 2) * 100);

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
          {!isSync && (
            <div className={`demo-figure ${demoVariant}`}>
              <div className="demo-head" />
              <div className="demo-body" />
              <div className="demo-arm demo-arm-left" />
              <div className="demo-arm demo-arm-right" />
              <div className="demo-leg demo-leg-left" />
              <div className="demo-leg demo-leg-right" />
              {isFreezeTag && phase === 'FREEZE' && <div className="demo-ice">❄️</div>}
            </div>
          )}

          {isFreezeTag ? (
            <div className={`banner phase-banner ${phase === 'FREEZE' ? 'freeze' : 'move'}`}>
              {phase === 'FREEZE' ? '얼음! 움직이면 안돼요' : '최대한 움직이세요!'}
            </div>
          ) : isSimonSays ? (
            <div className="banner phase-banner move">지금 동작: {GESTURE_LABELS[demoCue]}!</div>
          ) : isSync ? (
            <>
              <p className="instruction">2:2 팀전은 팀원과 타이밍이 맞을수록 팀 파워가 더 세져요!</p>
              <p className="hint small">아래 연습 팀원의 리듬에 맞춰 같이 당겨보세요.</p>
            </>
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

          {isSync && (
            <>
              <p className="hint small">연습 팀원 파워</p>
              <div className="gauge">
                <div className="gauge-fill opponent" style={{ width: `${Math.round(teammatePower * 100)}%` }} />
              </div>
              <p className="hint small">팀 파워 (싱크 보너스 +{Math.round(syncBonus * 100)}%)</p>
              <div className="gauge">
                <div className="gauge-fill" style={{ width: `${teamPowerPercent}%` }} />
              </div>
            </>
          )}

          {!poseDetected && <p className="hint small">카메라에 상반신이 잘 보이도록 조정해주세요</p>}
          {isFreezeTag && phase === 'FREEZE' && caught && (
            <p className="hint small">앗! 움직였어요 😱 얼음 상태에선 완전히 멈춰야 해요</p>
          )}

          {isFreezeTag &&
            (cycleDone ? (
              <>
                <p className="hint">{copy.ruleText}</p>
                <button type="button" className="primary" onClick={proceed}>
                  대기실로 이동
                </button>
              </>
            ) : null)}

          {isSimonSays &&
            (simonMatched ? (
              <>
                <p className="feedback">좋아요! 이렇게 따라 하면 돼요 🙌</p>
                <p className="hint">{copy.ruleText}</p>
                <button type="button" className="primary" onClick={proceed}>
                  대기실로 이동
                </button>
              </>
            ) : (
              <p className="hint">위 동작을 보고 최대한 똑같이 따라 해보세요.</p>
            ))}

          {isTugStyle &&
            !isSync &&
            (reached ? (
              <>
                <p className="feedback">좋아요! 이렇게 하면 돼요 💪</p>
                {showSyncDemo ? (
                  <button type="button" className="primary" onClick={() => setSubStep('SYNC')}>
                    다음: 팀워크 연습
                  </button>
                ) : (
                  <>
                    <p className="hint">{copy.ruleText}</p>
                    <button type="button" className="primary" onClick={proceed}>
                      대기실로 이동
                    </button>
                  </>
                )}
              </>
            ) : (
              <p className="hint">카메라에 상반신이 잘 보이도록 위치를 조정하고, 팔을 크게 당겨보세요.</p>
            ))}

          {isSync &&
            (syncReached ? (
              <>
                <p className="feedback">싱크 완벽해요! 팀 파워가 크게 올라가요 🤝</p>
                <p className="hint">{copy.ruleText}</p>
                <button type="button" className="primary" onClick={proceed}>
                  대기실로 이동
                </button>
              </>
            ) : (
              <p className="hint">팀원의 게이지가 올라갈 때 같이 당기고, 내려갈 때 같이 쉬어보세요.</p>
            ))}
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
