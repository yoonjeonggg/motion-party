import { exitRoom, requestRematch } from '../hooks/useGameSocket';
import { sideLabel } from '../lib/teams';
import { useGameStore } from '../store/gameStore';
import { ScoreLine } from './ui/ScoreLine';

export function MatchResult() {
  const matchEnd = useGameStore((s) => s.matchEnd);
  const players = useGameStore((s) => s.players);
  const session = useGameStore((s) => s.session);
  const highlight = useGameStore((s) => s.highlight);
  const resetMatch = useGameStore((s) => s.resetMatch);

  if (!matchEnd || !session) return null;

  const { roomId } = session;
  const won = matchEnd.winner === session.side;

  function handleRematch() {
    requestRematch(roomId);
    resetMatch();
  }

  return (
    <section className="screen match-result">
      <h1>매치 종료</h1>
      <div className="card">
        <p className={`result-headline${won ? '' : ' lose'}`}>{won ? '🏆 승리!' : '아쉽게 패배했어요'}</p>
        <p className="hint">{sideLabel(players, matchEnd.winner)} 승</p>
        <ScoreLine scores={matchEnd.finalScores} mySide={session.side} />
        {matchEnd.reason === 'DISCONNECT' && (
          <p className="hint">
            {won
              ? '상대방이 재접속하지 못해 승리로 처리되었어요.'
              : '우리 팀 플레이어가 재접속하지 못해 패배로 처리되었어요.'}
          </p>
        )}

        {highlight && (
          <div className="highlight-card">
            <p className="hint">가장 힘든 표정이었던 순간이에요!</p>
            <img src={highlight.dataUrl} alt="경기 중 가장 힘든 표정을 지은 순간" className="highlight-image" />
            <a className="button" href={highlight.dataUrl} download="motionparty-highlight.jpg">
              하이라이트 저장
            </a>
          </div>
        )}

        <div className="button-row">
          <button type="button" className="primary" onClick={handleRematch}>
            다시하기
          </button>
          <button type="button" onClick={exitRoom}>
            나가기
          </button>
        </div>
      </div>
    </section>
  );
}
