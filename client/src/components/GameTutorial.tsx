import { useEffect, useState, type RefObject } from 'react';
import { useLatch } from '../hooks/useLatch';
import { useLatestRef } from '../hooks/useLatestRef';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { GESTURE_LABELS, SIMON_SAYS_GESTURES } from '../lib/poseGesture';
import { hasSeenGameTutorial, markGameTutorialSeen } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import { DEFAULT_GAME_TYPE, isTugStyleGame, type GameType } from '../types';
import { Gauge } from './ui/Gauge';

const PULL_THRESHOLD = 0.5;
const MOVE_PHASE_MS = 4_000;
const FREEZE_PHASE_MS = 3_000;
const FREEZE_DEMO_THRESHOLD = 0.15;
/** Mirrors server SYNC_MAX_BONUS (server/src/games/tugStyle.ts) so the demo's numbers match the real match. */
const SYNC_MAX_BONUS = 0.3;
const SYNC_BONUS_TARGET = 0.2;
const SYNC_RHYTHM_PERIOD_MS = 1_400;
const SIMON_CUE_MS = 2_500;
/** CSS class animating the demo figure into each gesture. */
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

/** freeze_tag demo: alternate MOVE/FREEZE phases and flag moving while frozen. */
function useFreezeDemo(enabled: boolean, bodyMovementScore: number) {
  const [phase, setPhase] = useState<'MOVE' | 'FREEZE'>('MOVE');
  const [cycleDone, setCycleDone] = useState(false);
  const [caught, setCaught] = useState(false);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled, phase]);

  const movingWhileFrozen = enabled && phase === 'FREEZE' && bodyMovementScore > FREEZE_DEMO_THRESHOLD;
  if (movingWhileFrozen && !caught) setCaught(true);

  return { isFreeze: phase === 'FREEZE', cycleDone, caught };
}

/** simon_says demo: cycle a demo pose every SIMON_CUE_MS and wait for the user to match one once. */
function useSimonDemo(enabled: boolean, gesture: string) {
  const [cueIndex, setCueIndex] = useState(0);
  const cue = SIMON_SAYS_GESTURES[cueIndex % SIMON_SAYS_GESTURES.length]!;

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setCueIndex((i) => (i + 1) % SIMON_SAYS_GESTURES.length), SIMON_CUE_MS);
    return () => clearTimeout(timer);
  }, [enabled, cueIndex]);

  const matching = enabled && gesture === cue;
  const matched = useLatch(matching);
  return { cue, matching, matched };
}

/** 2v2+ tug-style demo: a dummy teammate pulls on a sine rhythm; matching it earns the FN-10 sync bonus. */
function useSyncDemo(enabled: boolean, motionScoreRef: RefObject<number>) {
  const [teammatePower, setTeammatePower] = useState(0);
  const [syncBonus, setSyncBonus] = useState(0);
  const syncReached = useLatch(syncBonus >= SYNC_BONUS_TARGET);

  useEffect(() => {
    if (!enabled) return;
    const startedAt = performance.now();
    let raf = 0;

    const loop = (time: number) => {
      const elapsed = time - startedAt;
      const teammate = (Math.sin(elapsed / (SYNC_RHYTHM_PERIOD_MS / (2 * Math.PI))) + 1) / 2;
      setTeammatePower(teammate);
      setSyncBonus(SYNC_MAX_BONUS * Math.max(0, 1 - Math.abs(motionScoreRef.current - teammate)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  }, [enabled, motionScoreRef]);

  return { teammatePower, syncBonus, syncReached };
}

function ProceedButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="primary" onClick={onClick}>
      대기실로 이동
    </button>
  );
}

/** Per-game-mode "how to play" screen shown once per gameType, with a looping demo animation to mimic. */
export function GameTutorial() {
  const session = useGameStore((s) => s.session);
  const setScreen = useGameStore((s) => s.setScreen);
  const gameType = session?.gameType ?? DEFAULT_GAME_TYPE;
  const isFreezeTag = gameType === 'freeze_tag';
  const isSimonSays = gameType === 'simon_says';
  const isTugStyle = isTugStyleGame(gameType);
  /** 2v2/4v4 tug-style matches apply a teammate sync bonus (FN-10); freeze_tag/simon_says never do. */
  const showSyncDemo = isTugStyle && session?.mode !== '1v1';
  const [isReplay] = useState(() => hasSeenGameTutorial(gameType));

  const { videoRef, cameraState, motionScore, bodyMovementScore, gesture, poseDetected } = useMotionCapture(true, {
    expression: false,
    // Only the score this game's demo reads - each enabled tracker is a setState per camera frame.
    motion: isTugStyle,
    bodyMovement: isFreezeTag,
    gesture: isSimonSays,
  });
  const motionScoreRef = useLatestRef(motionScore);

  const reached = useLatch(isTugStyle && motionScore >= PULL_THRESHOLD);
  const freeze = useFreezeDemo(isFreezeTag, bodyMovementScore);
  const simon = useSimonDemo(isSimonSays, gesture);

  // Step 2 for 2v2 tug-style games only: practice matching a dummy teammate's rhythm.
  const [subStep, setSubStep] = useState<'PULL' | 'SYNC'>('PULL');
  const isSync = subStep === 'SYNC' && showSyncDemo;
  const sync = useSyncDemo(isSync, motionScoreRef);

  function proceed() {
    markGameTutorialSeen(gameType);
    setScreen('WAITING');
  }

  const copy = COPY[gameType];
  const demoVariant = isFreezeTag ? (freeze.isFreeze ? 'freeze' : 'move') : isSimonSays ? SIMON_CLASS[simon.cue] : 'pull';
  const gaugeScore = isFreezeTag ? bodyMovementScore : isSimonSays ? (simon.matching ? 1 : 0) : motionScore;

  return (
    <section className="screen tutorial">
      {/* Always offered - otherwise a camera that never comes up would leave no way to the waiting room. */}
      <button type="button" className={`skip-link${isReplay ? ' prominent' : ''}`} onClick={proceed}>
        건너뛰기
      </button>

      <h1>{copy.title}</h1>

      {(cameraState === 'DENIED' || cameraState === 'ERROR') && (
        <div className="card error-card">
          {cameraState === 'DENIED' ? (
            <>
              <p>카메라 권한이 거부되었어요.</p>
              <p className="hint">브라우저 주소창의 카메라 아이콘에서 권한을 허용한 뒤 다시 시도해 주세요.</p>
            </>
          ) : (
            <>
              <p>카메라를 불러오지 못했어요.</p>
              <p className="hint">다른 앱이 카메라를 쓰고 있지 않은지 확인하거나, Chrome/Safari 최신 버전에서 시도해 주세요.</p>
            </>
          )}
          <p className="hint">{copy.ruleText}</p>
          <div className="button-row">
            <button type="button" onClick={() => window.location.reload()}>
              다시 시도
            </button>
            <ProceedButton onClick={proceed} />
          </div>
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
              {isFreezeTag && freeze.isFreeze && <div className="demo-ice">❄️</div>}
            </div>
          )}

          {isFreezeTag ? (
            <div className={`banner phase-banner ${freeze.isFreeze ? 'freeze' : 'move'}`}>
              {freeze.isFreeze ? '얼음! 움직이면 안돼요' : '최대한 움직이세요!'}
            </div>
          ) : isSimonSays ? (
            <div className="banner phase-banner move">지금 동작: {GESTURE_LABELS[simon.cue]}!</div>
          ) : isSync ? (
            <>
              <p className="instruction">2:2 팀전은 팀원과 타이밍이 맞을수록 팀 파워가 더 세져요!</p>
              <p className="hint small">아래 연습 팀원의 리듬에 맞춰 같이 당겨보세요.</p>
            </>
          ) : (
            <p className="instruction">{copy.instruction}</p>
          )}

          <video ref={videoRef} className="preview mirrored" muted playsInline />

          <Gauge value={gaugeScore} alt={isFreezeTag && freeze.isFreeze} />

          {isSync && (
            <>
              <p className="hint small">연습 팀원 파워</p>
              <Gauge value={sync.teammatePower} alt />
              <p className="hint small">팀 파워 (싱크 보너스 +{Math.round(sync.syncBonus * 100)}%)</p>
              <Gauge value={(motionScore + sync.teammatePower) / 2} />
            </>
          )}

          {!poseDetected && <p className="hint small warn">카메라에 상반신이 잘 보이도록 조정해주세요</p>}
          {isFreezeTag && freeze.isFreeze && freeze.caught && (
            <p className="hint small warn">앗! 움직였어요 😱 얼음 상태에선 완전히 멈춰야 해요</p>
          )}

          {isFreezeTag && freeze.cycleDone && (
            <>
              <p className="hint">{copy.ruleText}</p>
              <ProceedButton onClick={proceed} />
            </>
          )}

          {isSimonSays &&
            (simon.matched ? (
              <>
                <p className="feedback">좋아요! 이렇게 따라 하면 돼요 🙌</p>
                <p className="hint">{copy.ruleText}</p>
                <ProceedButton onClick={proceed} />
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
                    <ProceedButton onClick={proceed} />
                  </>
                )}
              </>
            ) : (
              <p className="hint">게이지가 절반을 넘을 때까지 팔을 크게 당겨보세요.</p>
            ))}

          {isSync &&
            (sync.syncReached ? (
              <>
                <p className="feedback">싱크 완벽해요! 팀 파워가 크게 올라가요 🤝</p>
                <p className="hint">{copy.ruleText}</p>
                <ProceedButton onClick={proceed} />
              </>
            ) : (
              <p className="hint">팀원의 게이지가 올라갈 때 같이 당기고, 내려갈 때 같이 쉬어보세요.</p>
            ))}
        </div>
      )}
    </section>
  );
}
