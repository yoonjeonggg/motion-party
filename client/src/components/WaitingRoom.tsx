import { useEffect, useState } from 'react';
import { exitRoom } from '../hooks/useGameSocket';
import { preloadVisionModels } from '../hooks/useMotionCapture';
import { isExpressionEnabled } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import { GAME_LABELS, isTugStyleGame, MODE_LABELS, perSideCapacity, roomCapacity, SIDES, type PublicPlayer, type Side } from '../types';

function TeamList({
  side,
  players,
  slots,
  myId,
  mySide,
}: {
  side: Side;
  players: PublicPlayer[];
  slots: number;
  myId: string;
  mySide: Side;
}) {
  const members = players.filter((p) => p.side === side);
  const emptySlots = Math.max(0, slots - members.length);
  return (
    <div className="team-column">
      <p className="team-title">{side === mySide ? '우리 팀' : '상대 팀'}</p>
      <ul className="player-list">
        {members.map((p) => (
          <li key={p.id} className={p.connectionStatus === 'DISCONNECTED' ? 'disconnected' : undefined}>
            <span className={`badge side-${side}`}>{side}</span>
            <span className="nickname" title={p.nickname}>
              {p.nickname}
            </span>
            {p.id === myId && <span className="tag">나</span>}
            {p.connectionStatus === 'DISCONNECTED' && <span className="tag">연결 끊김</span>}
          </li>
        ))}
        {Array.from({ length: emptySlots }, (_, i) => (
          <li key={`empty-${i}`} className="empty">
            빈 자리
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WaitingRoom() {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const setScreen = useGameStore((s) => s.setScreen);
  const [copyState, setCopyState] = useState<'IDLE' | 'COPIED' | 'FAILED'>('IDLE');

  // Waiting for players is idle time: fetch the models now so the match starts without a load.
  const gameType = session?.gameType;
  useEffect(() => {
    if (!gameType) return;
    preloadVisionModels({ pose: true, face: isTugStyleGame(gameType) && isExpressionEnabled() });
  }, [gameType]);

  useEffect(() => {
    if (copyState === 'IDLE') return;
    const timer = setTimeout(() => setCopyState('IDLE'), 1500);
    return () => clearTimeout(timer);
  }, [copyState]);

  if (!session) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(session!.code);
      setCopyState('COPIED');
    } catch {
      // Clipboard API unavailable (e.g. plain http on mobile) - tell the user to copy it by hand.
      setCopyState('FAILED');
    }
  }

  const capacity = roomCapacity(session.mode);
  const full = players.length >= capacity;
  const remaining = capacity - players.length;

  return (
    <section className="screen waiting">
      <h1>대기실</h1>
      <p className="sub">
        {GAME_LABELS[session.gameType]} · {MODE_LABELS[session.mode]}
      </p>
      <div className="card">
        <p className="hint">친구에게 방 코드를 알려주세요</p>
        <button type="button" className="room-code" onClick={handleCopy} aria-label={`방 코드 ${session.code} 복사`}>
          {session.code}
        </button>
        <p className={`room-code-caption${copyState === 'COPIED' ? ' copied' : ''}`} aria-live="polite">
          {copyState === 'COPIED'
            ? '복사되었어요!'
            : copyState === 'FAILED'
              ? '복사할 수 없어요. 코드를 직접 알려주세요.'
              : '코드를 누르면 복사돼요'}
        </p>

        <div className="team-columns">
          {SIDES.map((side) => (
            <TeamList
              key={side}
              side={side}
              players={players}
              slots={perSideCapacity(session.mode)}
              myId={session.playerId}
              mySide={session.side}
            />
          ))}
        </div>

        {full ? (
          <p className="feedback">모두 모였어요! 곧 시작해요...</p>
        ) : (
          <p className="hint">
            {players.length}/{capacity}명 · {remaining}명 더 기다리는 중...
          </p>
        )}

        <button type="button" onClick={exitRoom}>
          나가기
        </button>
      </div>

      <button type="button" className="ghost" onClick={() => setScreen('GAME_TUTORIAL')}>
        게임 방법 다시보기
      </button>
    </section>
  );
}
