import type { ReactNode, RefObject } from 'react';
import type { CameraState } from '../hooks/useMotionCapture';
import { joinNicknames, splitTeams } from '../lib/teams';
import { useGameStore } from '../store/gameStore';

interface PlayLayoutProps {
  gameLabel: string;
  /** Game-specific field between the scoreboard and the player panels (rope, phase banner, cue...). */
  arena: ReactNode;
  videoRef: RefObject<HTMLVideoElement | null>;
  poseDetected: boolean;
  cameraState: CameraState;
  myStats: ReactNode;
  opponentStats: ReactNode;
}

/** Scoreboard, disconnect banner and me-vs-opponent panels shared by every game's play screen. */
export function PlayLayout({ gameLabel, arena, videoRef, poseDetected, cameraState, myStats, opponentStats }: PlayLayoutProps) {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const roundWins = useGameStore((s) => s.roundWins);
  const status = useGameStore((s) => s.status);

  if (!session) return null;
  const { me, mySide, opponentSide, teammates, opponents } = splitTeams(players, session);
  const dropped = players.filter((p) => p.connectionStatus === 'DISCONNECTED');
  const droppedLabel = dropped.some((p) => p.side === opponentSide) ? '상대' : '팀원';

  return (
    <section className="screen play">
      {/* Always "me : opponent", so the score reads the same whichever side the server put us on. */}
      <div className="scoreboard">
        <span className="round">
          {gameLabel} · {Math.max(roundNumber, 1)}라운드 · 3판 2선승
        </span>
        <span className="score">
          나 {roundWins[mySide]} : {roundWins[opponentSide]} 상대
        </span>
      </div>

      {status === 'PAUSED' && (
        <div className="banner warning" role="status">
          {dropped.length > 0 ? `${droppedLabel}(${joinNicknames(dropped)})의` : '플레이어'} 연결이 끊겼어요.
          재접속을 기다리는 중...
        </div>
      )}

      {arena}

      <div className="players-row">
        <div className="player-panel">
          <video ref={videoRef} className="preview mirrored small" muted playsInline />
          <p className="player-name">
            {me?.nickname ?? '나'} (나)
            {teammates.length > 0 && ` · ${joinNicknames(teammates)}`}
          </p>
          {cameraState === 'DENIED' || cameraState === 'ERROR' ? (
            <p className="hint small warn">카메라를 사용할 수 없어요. 권한을 확인한 뒤 새로고침해 주세요.</p>
          ) : (
            cameraState === 'READY' &&
            !poseDetected && <p className="hint small warn">몸이 화면에 잘 보이도록 조정해 주세요</p>
          )}
          {myStats}
        </div>

        <div className="vs">VS</div>

        <div className="player-panel">
          <div className="preview small placeholder" aria-hidden="true">
            {opponents[0]?.nickname?.[0] ?? '?'}
          </div>
          <p className="player-name">{joinNicknames(opponents) || '상대'}</p>
          {opponentStats}
        </div>
      </div>
    </section>
  );
}
