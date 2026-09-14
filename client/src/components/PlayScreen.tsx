import { useEffect, useRef } from 'react';
import { sendPower } from '../hooks/useGameSocket';
import { usePoseMotionScore } from '../hooks/usePoseMotionScore';
import { useGameStore } from '../store/gameStore';
import type { Side } from '../types';

const SEND_INTERVAL_MS = 60;

function opposite(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

export function PlayScreen() {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const ropePosition = useGameStore((s) => s.ropePosition);
  const teamPower = useGameStore((s) => s.teamPower);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const roundWins = useGameStore((s) => s.roundWins);
  const status = useGameStore((s) => s.status);
  const opponentDisconnected = useGameStore((s) => s.opponentDisconnected);

  const { videoRef, motionScore, poseDetected } = usePoseMotionScore(true);
  const scoreRef = useRef(0);
  scoreRef.current = motionScore;

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      sendPower(session.roomId, session.playerId, scoreRef.current);
    }, SEND_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session]);

  if (!session) return null;

  const mySide = session.side;
  const opponentSide = opposite(mySide);
  const me = players.find((p) => p.side === mySide);
  const opponent = players.find((p) => p.side === opponentSide);

  const ropePercent = ((ropePosition + 1) / 2) * 100;

  return (
    <section className="screen play">
      <div className="scoreboard">
        <span>
          라운드 {roundNumber} · {roundWins.A} : {roundWins.B}
        </span>
      </div>

      {status === 'PAUSED' && opponentDisconnected && (
        <div className="banner warning">상대방 연결이 끊겼어요. 재접속을 기다리는 중...</div>
      )}

      <div className="rope-track">
        <div className="rope-zone zone-a" />
        <div className="rope-zone zone-b" />
        <div className="rope-marker" style={{ left: `${ropePercent}%` }} />
        <div className="rope-center" />
      </div>

      <div className="players-row">
        <div className="player-panel">
          <video ref={videoRef} className="preview mirrored small" muted playsInline />
          <p className="player-name">{me?.nickname ?? '나'} (나)</p>
          {!poseDetected && <p className="hint small">카메라 각도를 조정해주세요</p>}
          <div className="gauge">
            <div className="gauge-fill" style={{ width: `${Math.round(motionScore * 100)}%` }} />
          </div>
        </div>

        <div className="vs">VS</div>

        <div className="player-panel">
          <div className="preview small placeholder">{opponent?.nickname?.[0] ?? '?'}</div>
          <p className="player-name">{opponent?.nickname ?? '상대'}</p>
          <div className="gauge">
            <div
              className="gauge-fill opponent"
              style={{ width: `${Math.round((teamPower[opponentSide] ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
