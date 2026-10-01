import { sideLabel } from '../lib/teams';
import { useGameStore } from '../store/gameStore';
import { ScoreLine } from './ui/ScoreLine';

export function RoundResult() {
  const lastRoundEnd = useGameStore((s) => s.lastRoundEnd);
  const players = useGameStore((s) => s.players);
  const session = useGameStore((s) => s.session);

  if (!lastRoundEnd || !session) return null;

  const won = lastRoundEnd.winner === session.side;

  return (
    <section className="screen round-result">
      <h1>{lastRoundEnd.roundNumber}라운드 종료</h1>
      <div className="card">
        <p className={`result-headline${won ? '' : ' lose'}`}>{won ? '이번 라운드 승리! 🎉' : '이번 라운드 패배'}</p>
        <p className="hint">{sideLabel(players, lastRoundEnd.winner)} 승</p>
        <ScoreLine scores={lastRoundEnd.scores} mySide={session.side} />
        <p className="hint">잠시 후 다음 라운드가 시작돼요...</p>
      </div>
    </section>
  );
}
