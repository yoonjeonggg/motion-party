import { sideLabel } from '../lib/teams';
import { useGameStore } from '../store/gameStore';

export function RoundResult() {
  const lastRoundEnd = useGameStore((s) => s.lastRoundEnd);
  const players = useGameStore((s) => s.players);

  if (!lastRoundEnd) return null;

  const winnerLabel = sideLabel(players, lastRoundEnd.winner);

  return (
    <section className="screen round-result">
      <h1>{lastRoundEnd.roundNumber} 라운드 종료</h1>
      <div className="card">
        <p className="feedback big">{winnerLabel} 승리!</p>
        <p className="sub">
          {lastRoundEnd.scores.A} : {lastRoundEnd.scores.B}
        </p>
        <p className="hint">잠시 후 다음 라운드가 시작돼요...</p>
      </div>
    </section>
  );
}
