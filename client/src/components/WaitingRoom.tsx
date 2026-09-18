import { useState } from 'react';
import { socket } from '../lib/socket';
import { useGameStore } from '../store/gameStore';
import type { GameType } from '../types';

const GAME_LABELS: Record<GameType, string> = {
  tug_of_war: '줄다리기',
  arm_wrestle: '팔씨름',
  freeze_tag: '얼음땡',
  simon_says: '동작 따라하기',
};

export function WaitingRoom() {
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
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

  function handleLeave() {
    socket.disconnect();
    socket.connect();
    leaveRoom();
  }

  const capacity = session.mode === '2v2' ? 4 : 2;
  const full = players.length >= capacity;
  const teamA = players.filter((p) => p.side === 'A');
  const teamB = players.filter((p) => p.side === 'B');

  return (
    <section className="screen waiting">
      <h1>대기실</h1>
      <div className="card">
        <p className="hint">
          친구에게 방 코드를 공유하세요 · {GAME_LABELS[session.gameType]} ·{' '}
          {session.mode === '2v2' ? '2:2 팀전' : '1:1 대결'}
        </p>
        <div className="room-code" onClick={handleCopy}>
          {session.code}
        </div>
        {copied && <p className="feedback">복사되었어요!</p>}

        <p className="hint">
          {players.length}/{capacity}명
        </p>

        <div className="team-columns">
          <ul className="player-list">
            {teamA.map((p) => (
              <li key={p.id}>
                <span className="badge side-A">A</span>
                {p.nickname}
                {p.connectionStatus === 'DISCONNECTED' && ' (연결 끊김)'}
              </li>
            ))}
          </ul>
          <ul className="player-list">
            {teamB.map((p) => (
              <li key={p.id}>
                <span className="badge side-B">B</span>
                {p.nickname}
                {p.connectionStatus === 'DISCONNECTED' && ' (연결 끊김)'}
              </li>
            ))}
          </ul>
        </div>

        {!full && <p className="hint">상대방을 기다리는 중...</p>}
        {full && <p className="feedback">양쪽 준비 완료! 곧 시작해요...</p>}

        <button type="button" onClick={handleLeave}>
          나가기
        </button>
      </div>

      <button type="button" className="ghost" onClick={() => setScreen('GAME_TUTORIAL')}>
        게임 방법 다시보기
      </button>
    </section>
  );
}
