import type { ReactNode, RefObject } from 'react';
import { joinNicknames, splitTeams } from '../lib/teams';
import { useGameStore } from '../store/gameStore';

interface PlayLayoutProps {
  gameLabel: string;
  /** Game-specific field between the scoreboard and the player panels (rope, phase banner, cue...). */
  arena: ReactNode;
  videoRef: RefObject<HTMLVideoElement | null>;
  poseDetected: boolean;
  myStats: ReactNode;
  opponentStats: ReactNode;
}

/** Scoreboard, disconnect banner and me-vs-opponent panels shared by every game's play screen. */
export function PlayLayout({ gameLabel, arena, videoRef, poseDetected, myStats, opponentStats }: PlayLayoutProps) {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const roundWins = useGameStore((s) => s.roundWins);
  const status = useGameStore((s) => s.status);
  const opponentDisconnected = useGameStore((s) => s.opponentDisconnected);

  if (!session) return null;
  const { me, teammates, opponents } = splitTeams(players, session);

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

      {arena}

      <div className="players-row">
        <div className="player-panel">
          <video ref={videoRef} className="preview mirrored small" muted playsInline />
          <p className="player-name">
            {me?.nickname ?? '나'} (나)
            {teammates.length > 0 && ` · ${joinNicknames(teammates)}`}
          </p>
          {!poseDetected && <p className="hint small">카메라 각도를 조정해주세요</p>}
          {myStats}
        </div>

        <div className="vs">VS</div>

        <div className="player-panel">
          <div className="preview small placeholder">{opponents[0]?.nickname?.[0] ?? '?'}</div>
          <p className="player-name">{joinNicknames(opponents) || '상대'}</p>
          {opponentStats}
        </div>
      </div>
    </section>
  );
}
