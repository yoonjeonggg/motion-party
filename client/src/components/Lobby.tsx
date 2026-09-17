import { useState } from 'react';
import { createRoom, joinRoom } from '../hooks/useGameSocket';
import { useGameStore } from '../store/gameStore';

export function Lobby() {
  const nickname = useGameStore((s) => s.nickname);
  const setNickname = useGameStore((s) => s.setNickname);
  const error = useGameStore((s) => s.error);
  const setError = useGameStore((s) => s.setError);
  const setScreen = useGameStore((s) => s.setScreen);
  const [codeInput, setCodeInput] = useState('');

  function handleCreate() {
    setError(null);
    createRoom(nickname.trim() || '방장');
  }

  function handleJoin() {
    setError(null);
    if (codeInput.trim().length !== 6) {
      setError('방 코드는 6자리예요.');
      return;
    }
    joinRoom(codeInput.trim().toUpperCase(), nickname.trim() || '참가자');
  }

  return (
    <section className="screen lobby">
      <h1>모션파티</h1>
      <p className="sub">몸으로 겨루는 줄다리기 대결</p>

      <div className="card">
        <label className="field">
          <span>닉네임</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임을 입력하세요"
            maxLength={12}
          />
        </label>

        <button type="button" className="primary" onClick={handleCreate}>
          방 만들기
        </button>

        <div className="divider">또는</div>

        <label className="field">
          <span>방 코드</span>
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="6자리 코드"
            maxLength={6}
          />
        </label>
        <button type="button" onClick={handleJoin}>
          참가하기
        </button>

        {error && <p className="error-text">{error}</p>}
      </div>

      <button type="button" className="ghost" onClick={() => setScreen('ONBOARDING')}>
        튜토리얼 다시보기
      </button>
    </section>
  );
}
