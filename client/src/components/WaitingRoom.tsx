import { useState } from 'react';
import { exitRoom } from '../hooks/useGameSocket';
import { useGameStore } from '../store/gameStore';
import { GAME_LABELS, MODE_LABELS, roomCapacity, SIDES, type PublicPlayer, type Side } from '../types';

function TeamList({ side, players }: { side: Side; players: PublicPlayer[] }) {
  return (
    <ul className="player-list">
      {players
        .filter((p) => p.side === side)
        .map((p) => (
          <li key={p.id}>
            <span className={`badge side-${side}`}>{side}</span>
            {p.nickname}
            {p.connectionStatus === 'DISCONNECTED' && ' (연결 끊김)'}
          </li>
        ))}
    </ul>
  );
}

export function WaitingRoom() {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const setScreen = useGameStore((s) => s.setScreen);
  const [copied, setCopied] = useState(false);

  if (!session) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(session!.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }

  const capacity = roomCapacity(session.mode);
  const full = players.length >= capacity;

  return (
    <section className="screen waiting">
      <h1>대기실</h1>
      <div className="card">
        <p className="hint">
          친구에게 방 코드를 공유하세요 · {GAME_LABELS[session.gameType]} · {MODE_LABELS[session.mode]}
        </p>
        <div className="room-code" onClick={handleCopy}>
          {session.code}
        </div>
        {copied && <p className="feedback">복사되었어요!</p>}

        <p className="hint">
          {players.length}/{capacity}명
        </p>

        <div className="team-columns">
          {SIDES.map((side) => (
            <TeamList key={side} side={side} players={players} />
          ))}
        </div>

        {full ? (
          <p className="feedback">양쪽 준비 완료! 곧 시작해요...</p>
        ) : (
          <p className="hint">상대방을 기다리는 중...</p>
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
