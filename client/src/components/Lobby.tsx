import { useEffect, useState, type FormEvent } from 'react';
import { createRoom, joinRoom } from '../hooks/useGameSocket';
import { isExpressionEnabled, setExpressionEnabled } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import {
  DEFAULT_GAME_TYPE,
  GAME_LABELS,
  GAME_TYPES,
  isTugStyleGame,
  MODE_LABELS,
  ROOM_MODES,
  type GameType,
  type RoomMode,
} from '../types';

const ROOM_CODE_LENGTH = 6;
/** How long create/join stay disabled after a click, so a double-tap doesn't fire twice. */
const PENDING_MS = 3_000;

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
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), PENDING_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  function handleToggleMotionOnly() {
    const next = !expressionOn;
    setExpressionOn(next);
    setExpressionEnabled(next);
  }

  function handleCreate() {
    setError(null);
    setPending(true);
    createRoom(nickname.trim() || '방장', mode, gameType);
  }

  function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const code = codeInput.trim().toUpperCase();
    if (code.length !== ROOM_CODE_LENGTH) {
      setError('방 코드 6자리를 입력해 주세요.');
      return;
    }
    setPending(true);
    joinRoom(code, nickname.trim() || '참가자');
  }

  // A server answer (error) or a lost connection ends the wait early.
  const busy = pending && !error && !connectionError;
  const codeComplete = codeInput.trim().length === ROOM_CODE_LENGTH;

  return (
    <section className="screen lobby">
      <h1>모션파티</h1>
      <p className="sub">카메라 앞에서 몸으로 겨루는 미니게임 대결</p>

      <div className="card">
        <label className="field">
          <span>닉네임</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임을 입력하세요"
            maxLength={12}
            autoComplete="nickname"
            enterKeyHint="done"
          />
        </label>

        <span className="field-label">게임 선택</span>
        <div className="mode-toggle game-toggle" role="radiogroup" aria-label="게임 선택">
          {GAME_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={gameType === type}
              className={gameType === type ? 'primary' : ''}
              onClick={() => setGameType(type)}
            >
              {GAME_LABELS[type]}
            </button>
          ))}
        </div>

        <span className="field-label">인원</span>
        <div className="mode-toggle" role="radiogroup" aria-label="인원">
          {ROOM_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              aria-label={MODE_LABELS[m]}
              className={mode === m ? 'primary' : ''}
              onClick={() => setMode(m)}
            >
              {m.replace('v', ':')}
            </button>
          ))}
        </div>

        {isTugStyleGame(gameType) && (
          <label className="checkbox-field">
            <input type="checkbox" checked={!expressionOn} onChange={handleToggleMotionOnly} />
            <span>표정 인식 없이 동작만으로 플레이</span>
          </label>
        )}

        <button type="button" className="primary" onClick={handleCreate} disabled={busy}>
          방 만들기
        </button>

        <div className="divider">또는</div>

        <form className="lobby-form" onSubmit={handleJoin}>
          <label className="field">
            <span>방 코드</span>
            <input
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase());
                if (error) setError(null);
              }}
              placeholder="친구에게 받은 6자리 코드"
              maxLength={ROOM_CODE_LENGTH}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </label>
          <button type="submit" disabled={busy || !codeComplete}>
            참가하기
          </button>
        </form>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {connectionError && (
          <p className="error-text" role="alert">
            서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.
          </p>
        )}
      </div>

      <button type="button" className="ghost" onClick={() => setScreen('ONBOARDING')}>
        튜토리얼 다시보기
      </button>
    </section>
  );
}
