import { useEffect, useRef } from 'react';
import { sendPower } from '../hooks/useGameSocket';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { useGameStore } from '../store/gameStore';
import type { Side } from '../types';

const SEND_INTERVAL_MS = 60;

function opposite(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

/** Play screen for 얼음땡 (freeze tag): move as much as possible, then freeze on cue. */
export function FreezeTagPlayScreen() {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const teamPower = useGameStore((s) => s.teamPower);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const roundWins = useGameStore((s) => s.roundWins);
  const status = useGameStore((s) => s.status);
  const phase = useGameStore((s) => s.phase);
  const phaseRemainingMs = useGameStore((s) => s.phaseRemainingMs);
  const opponentDisconnected = useGameStore((s) => s.opponentDisconnected);

  const { videoRef, bodyMovementScore, poseDetected } = useMotionCapture(true, { expression: false });
  const scoreRef = useRef(0);
  scoreRef.current = bodyMovementScore;

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      sendPower(session.roomId, session.playerId, scoreRef.current, 0);
    }, SEND_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session]);

  if (!session) return null;

  const mySide = session.side;
  const opponentSide = opposite(mySide);
  const me = players.find((p) => p.id === session.playerId);
  const teammates = players.filter((p) => p.side === mySide && p.id !== session.playerId);
  const opponentTeam = players.filter((p) => p.side === opponentSide);

  const isFreeze = phase === 'FREEZE';
  const secondsLeft = Math.ceil(phaseRemainingMs / 1000);

  return (
    <section className="screen play">
      <div className="scoreboard">
        <span>
          얼음땡 · 라운드 {roundNumber} · {roundWins.A} : {roundWins.B}
        </span>
      </div>

      {status === 'PAUSED' && opponentDisconnected && (
        <div className="banner warning">상대방 연결이 끊겼어요. 재접속을 기다리는 중...</div>
      )}

      <div className={`banner phase-banner ${isFreeze ? 'freeze' : 'move'}`}>
        {isFreeze ? `얼음! 움직이면 져요 (${secondsLeft}초)` : `최대한 움직이세요! (${secondsLeft}초)`}
      </div>

      <div className="players-row">
        <div className="player-panel">
          <video ref={videoRef} className="preview mirrored small" muted playsInline />
          <p className="player-name">
            {me?.nickname ?? '나'} (나)
            {teammates.length > 0 && ` · ${teammates.map((p) => p.nickname).join(' · ')}`}
          </p>
          {!poseDetected && <p className="hint small">카메라 각도를 조정해주세요</p>}
          <div className="gauge">
            <div
              className={`gauge-fill${isFreeze ? ' opponent' : ''}`}
              style={{ width: `${Math.round(Math.min(1, bodyMovementScore) * 100)}%` }}
            />
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
