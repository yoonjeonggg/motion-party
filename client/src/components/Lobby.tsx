import { useState } from 'react';
import { createRoom, joinRoom } from '../hooks/useGameSocket';
import { isExpressionEnabled, setExpressionEnabled } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import type { GameType, RoomMode } from '../types';

const GAME_OPTIONS: { value: GameType; label: string }[] = [
  { value: 'tug_of_war', label: '줄다리기' },
  { value: 'arm_wrestle', label: '팔씨름' },
  { value: 'freeze_tag', label: '얼음땡' },
  { value: 'simon_says', label: '동작 따라하기' },
];

/** Only tug-style games use FN-08 expression scoring; freeze_tag/simon_says never do. */
const GAME_USES_EXPRESSION: Record<GameType, boolean> = {
  tug_of_war: true,
  arm_wrestle: true,
  freeze_tag: false,
  simon_says: false,
};

export function Lobby() {
  const nickname = useGameStore((s) => s.nickname);
  const setNickname = useGameStore((s) => s.setNickname);
  const error = useGameStore((s) => s.error);
  const setError = useGameStore((s) => s.setError);
  const setScreen = useGameStore((s) => s.setScreen);
  const [codeInput, setCodeInput] = useState('');
  const [mode, setMode] = useState<RoomMode>('1v1');
  const [gameType, setGameType] = useState<GameType>('tug_of_war');
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

        <div className="mode-toggle game-toggle">
          {GAME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={gameType === opt.value ? 'primary' : ''}
              onClick={() => setGameType(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="mode-toggle">
          <button
            type="button"
            className={mode === '1v1' ? 'primary' : ''}
            onClick={() => setMode('1v1')}
          >
            1:1
          </button>
          <button
            type="button"
            className={mode === '2v2' ? 'primary' : ''}
            onClick={() => setMode('2v2')}
          >
            2:2
          </button>
          <button
            type="button"
            className={mode === '4v4' ? 'primary' : ''}
            onClick={() => setMode('4v4')}
          >
            4:4
          </button>
        </div>

        {GAME_USES_EXPRESSION[gameType] && (
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
