import { requestRematch } from '../hooks/useGameSocket';
import { socket } from '../lib/socket';
import { useGameStore } from '../store/gameStore';

export function MatchResult() {
  const matchEnd = useGameStore((s) => s.matchEnd);
  const players = useGameStore((s) => s.players);
  const session = useGameStore((s) => s.session);
  const resetMatch = useGameStore((s) => s.resetMatch);
  const leaveRoom = useGameStore((s) => s.leaveRoom);

  if (!matchEnd || !session) return null;

  const winners = players.filter((p) => p.side === matchEnd.winner);
  const winnerLabel = winners.length > 0 ? winners.map((p) => p.nickname).join(' · ') : matchEnd.winner;

  function handleRematch() {
    requestRematch(session!.roomId);
    resetMatch();
  }

  function handleExit() {
    socket.disconnect();
    socket.connect();
    leaveRoom();
  }

  return (
    <section className="screen match-result">
      <h1>매치 종료</h1>
      <div className="card">
        <p className="feedback big">🏆 {winnerLabel} 승리!</p>
        <p className="sub">
          최종 스코어 {matchEnd.finalScores.A} : {matchEnd.finalScores.B}
        </p>
        {matchEnd.reason === 'DISCONNECT' && (
          <p className="hint">상대방이 재접속하지 못해 자동 승리 처리되었어요.</p>
        )}
        <div className="button-row">
          <button type="button" className="primary" onClick={handleRematch}>
            다시하기
          </button>
          <button type="button" onClick={handleExit}>
            나가기
          </button>
        </div>
      </div>
    </section>
  );
}
