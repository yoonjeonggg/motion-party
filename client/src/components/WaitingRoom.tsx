import { useState } from 'react';
import { socket } from '../lib/socket';
import { useGameStore } from '../store/gameStore';

export function WaitingRoom() {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
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

  function handleLeave() {
    socket.disconnect();
    socket.connect();
    leaveRoom();
  }

  const full = players.length >= 2;

  return (
    <section className="screen waiting">
      <h1>대기실</h1>
      <div className="card">
        <p className="hint">친구에게 방 코드를 공유하세요</p>
        <div className="room-code" onClick={handleCopy}>
          {session.code}
        </div>
        {copied && <p className="feedback">복사되었어요!</p>}

        <ul className="player-list">
          {players.map((p) => (
            <li key={p.id}>
              <span className={`badge side-${p.side}`}>{p.side}</span>
              {p.nickname}
              {p.connectionStatus === 'DISCONNECTED' && ' (연결 끊김)'}
            </li>
          ))}
        </ul>

        {!full && <p className="hint">상대방을 기다리는 중...</p>}
        {full && <p className="feedback">양쪽 준비 완료! 곧 시작해요...</p>}

        <button type="button" onClick={handleLeave}>
          나가기
        </button>
      </div>
    </section>
  );
}
