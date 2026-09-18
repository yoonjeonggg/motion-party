import { useEffect, useRef } from 'react';
import { sendPower } from '../hooks/useGameSocket';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { GESTURE_LABELS, GestureMatchTracker, type Gesture } from '../lib/poseGesture';
import { useGameStore } from '../store/gameStore';
import type { Side } from '../types';

const SEND_INTERVAL_MS = 60;

function opposite(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

function isGesture(value: string): value is Gesture {
  return value in GESTURE_LABELS;
}

/** Play screen for 동작 따라하기 (simon says): mimic the cued pose as closely as possible before it rotates. */
export function SimonSaysPlayScreen() {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const teamPower = useGameStore((s) => s.teamPower);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const roundWins = useGameStore((s) => s.roundWins);
  const status = useGameStore((s) => s.status);
  const cue = useGameStore((s) => s.cue);
  const cueRemainingMs = useGameStore((s) => s.cueRemainingMs);
  const opponentDisconnected = useGameStore((s) => s.opponentDisconnected);

  const { videoRef, gesture, poseDetected } = useMotionCapture(true, { expression: false });
  const gestureRef = useRef<Gesture>('REST');
  gestureRef.current = gesture;
  const cueRef = useRef(cue);
  cueRef.current = cue;
  const matchTrackerRef = useRef(new GestureMatchTracker());

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const matched = cueRef.current !== '' && gestureRef.current === cueRef.current;
      const score = matchTrackerRef.current.update(matched);
      sendPower(session.roomId, session.playerId, score, 0);
    }, SEND_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session]);

  if (!session) return null;

  const mySide = session.side;
  const opponentSide = opposite(mySide);
  const me = players.find((p) => p.id === session.playerId);
  const teammate = players.find((p) => p.side === mySide && p.id !== session.playerId);
  const opponentTeam = players.filter((p) => p.side === opponentSide);

  const cueLabel = isGesture(cue) ? GESTURE_LABELS[cue] : '...';
  const myGestureLabel = GESTURE_LABELS[gesture];
  const matched = isGesture(cue) && gesture === cue;
  const secondsLeft = Math.ceil(cueRemainingMs / 1000);

  return (
    <section className="screen play">
      <div className="scoreboard">
        <span>
          동작 따라하기 · 라운드 {roundNumber} · {roundWins.A} : {roundWins.B}
        </span>
      </div>

      {status === 'PAUSED' && opponentDisconnected && (
        <div className="banner warning">상대방 연결이 끊겼어요. 재접속을 기다리는 중...</div>
      )}

      <div className={`banner phase-banner ${matched ? 'move' : 'freeze'}`}>
        지금 동작: {cueLabel}! ({secondsLeft}초)
      </div>

      <div className="players-row">
        <div className="player-panel">
          <video ref={videoRef} className="preview mirrored small" muted playsInline />
          <p className="player-name">
            {me?.nickname ?? '나'} (나){teammate && ` · ${teammate.nickname}`}
          </p>
          {!poseDetected && <p className="hint small">카메라 각도를 조정해주세요</p>}
          <p className="hint small">{matched ? '일치! 👍' : `내 동작: ${myGestureLabel}`}</p>
          <div className="gauge">
            <div className={`gauge-fill${matched ? '' : ' opponent'}`} style={{ width: matched ? '100%' : '0%' }} />
          </div>
          <p className="hint small">누적 점수 {(teamPower[mySide] ?? 0).toFixed(1)}</p>
        </div>

        <div className="vs">VS</div>

        <div className="player-panel">
          <div className="preview small placeholder">{opponentTeam[0]?.nickname?.[0] ?? '?'}</div>
          <p className="player-name">
            {opponentTeam.length > 0 ? opponentTeam.map((p) => p.nickname).join(' · ') : '상대'}
          </p>
          <p className="hint small">누적 점수 {(teamPower[opponentSide] ?? 0).toFixed(1)}</p>
        </div>
      </div>
    </section>
  );
}
