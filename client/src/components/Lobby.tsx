import { useState } from 'react';
import { createRoom, joinRoom } from '../hooks/useGameSocket';
import { isExpressionEnabled, setExpressionEnabled } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import {
  DEFAULT_GAME_TYPE,
  GAME_LABELS,
  GAME_TYPES,
  isTugStyleGame,
  ROOM_MODES,
  type GameType,
  type RoomMode,
} from '../types';

const ROOM_CODE_LENGTH = 6;

export function Lobby() {
  const nickname = useGameStore((s) => s.nickname);
  const setNickname = useGameStore((s) => s.setNickname);
  const error = useGameStore((s) => s.error);
  const setError = useGameStore((s) => s.setError);
  const connectionError = useGameStore((s) => s.connectionError);
  const setScreen = useGameStore((s) => s.setScreen);
  const [codeInput, setCodeInput] = useState('');
  const [mode, setMode] = useState<RoomMode>('1v1');
  const [gameType, setGameType] = useState<GameType>(DEFAULT_GAME_TYPE);
  const [expressionOn, setExpressionOn] = useState(isExpressionEnabled());

  function handleToggleExpression() {
    const next = !expressionOn;
    setExpressionOn(next);
    setExpressionEnabled(next);
  }

  function handleCreate() {
    setError(null);
    createRoom(nickname.trim() || '방장', mode, gameType);
  }

  function handleJoin() {
    setError(null);
    if (codeInput.trim().length !== ROOM_CODE_LENGTH) {
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

        <div className="mode-toggle game-toggle">
          {GAME_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={gameType === type ? 'primary' : ''}
              onClick={() => setGameType(type)}
            >
              {GAME_LABELS[type]}
            </button>
          ))}
        </div>

        <div className="mode-toggle">
          {ROOM_MODES.map((m) => (
            <button key={m} type="button" className={mode === m ? 'primary' : ''} onClick={() => setMode(m)}>
              {m.replace('v', ':')}
            </button>
          ))}
        </div>

        {isTugStyleGame(gameType) && (
          <label className="checkbox-field">
            <input type="checkbox" checked={expressionOn} onChange={handleToggleExpression} />
            <span>표정 인식 없이 동작만으로 플레이</span>
          </label>
        )}

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
            maxLength={ROOM_CODE_LENGTH}
          />
        </label>
        <button type="button" onClick={handleJoin}>
          참가하기
        </button>

        {error && <p className="error-text">{error}</p>}
        {connectionError && <p className="error-text">서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.</p>}
      </div>

      <button type="button" className="ghost" onClick={() => setScreen('ONBOARDING')}>
        튜토리얼 다시보기
      </button>
    </section>
  );
}
