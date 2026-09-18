import { useEffect, useRef } from 'react';
import { sendPower } from '../hooks/useGameSocket';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { isExpressionEnabled } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import type { Side } from '../types';

const SEND_INTERVAL_MS = 60;
/** Tunable: minimum expression score before a frame is worth capturing as a highlight. */
const HIGHLIGHT_MIN_SCORE = 0.3;

function opposite(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

const GAME_LABELS = { tug_of_war: '줄다리기', arm_wrestle: '팔씨름' } as const;

/** Shared play screen for the "push a position toward your side" games (tug-of-war, arm-wrestle). */
export function PlayScreen() {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const ropePosition = useGameStore((s) => s.ropePosition);
  const armPosition = useGameStore((s) => s.armPosition);
  const teamPower = useGameStore((s) => s.teamPower);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const roundWins = useGameStore((s) => s.roundWins);
  const status = useGameStore((s) => s.status);
  const opponentDisconnected = useGameStore((s) => s.opponentDisconnected);
  const updateHighlight = useGameStore((s) => s.updateHighlight);

  const { videoRef, motionScore, poseDetected, expressionScore } = useMotionCapture(true, {
    expression: isExpressionEnabled(),
  });
  const scoreRef = useRef(0);
  scoreRef.current = motionScore;
  const expressionRef = useRef(0);
  expressionRef.current = expressionScore;
  const bestLocalHighlightRef = useRef(0);

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      sendPower(session.roomId, session.playerId, scoreRef.current, expressionRef.current);
    }, SEND_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (expressionScore < HIGHLIGHT_MIN_SCORE || expressionScore <= bestLocalHighlightRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    bestLocalHighlightRef.current = expressionScore;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    updateHighlight(expressionScore, canvas.toDataURL('image/jpeg', 0.85));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expressionScore]);

  if (!session) return null;

  const mySide = session.side;
  const opponentSide = opposite(mySide);
  const me = players.find((p) => p.id === session.playerId);
  const teammate = players.find((p) => p.side === mySide && p.id !== session.playerId);
  const opponentTeam = players.filter((p) => p.side === opponentSide);

  const position = session.gameType === 'arm_wrestle' ? armPosition : ropePosition;
  const ropePercent = ((position + 1) / 2) * 100;
  const gameLabel = GAME_LABELS[session.gameType as keyof typeof GAME_LABELS] ?? '';

  return (
    <section className="screen play">
      <div className="scoreboard">
        <span>
          {gameLabel} · 라운드 {roundNumber} · {roundWins.A} : {roundWins.B}
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
          <p className="player-name">
            {me?.nickname ?? '나'} (나){teammate && ` · ${teammate.nickname}`}
          </p>
          {!poseDetected && <p className="hint small">카메라 각도를 조정해주세요</p>}
          <div className="gauge">
            <div
              className="gauge-fill"
              style={{ width: `${Math.round(Math.min(1, motionScore * (1 + expressionScore)) * 100)}%` }}
            />
          </div>
          {expressionScore >= 0.05 && (
            <p className="hint small">표정 보너스 +{Math.round(expressionScore * 100)}%</p>
          )}
        </div>

        <div className="vs">VS</div>

        <div className="player-panel">
          <div className="preview small placeholder">{opponentTeam[0]?.nickname?.[0] ?? '?'}</div>
          <p className="player-name">
            {opponentTeam.length > 0 ? opponentTeam.map((p) => p.nickname).join(' · ') : '상대'}
          </p>
          <div className="gauge">
            <div
              className="gauge-fill opponent"
              style={{ width: `${Math.round(Math.min(1, teamPower[opponentSide] ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
