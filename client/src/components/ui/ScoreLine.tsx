import { opposite, type Side } from '../../types';

interface ScoreLineProps {
  scores: Record<Side, number>;
  mySide: Side;
}

/** "나 1 : 0 상대" - always from the viewer's side, whichever side the server put them on. */
export function ScoreLine({ scores, mySide }: ScoreLineProps) {
  return (
    <div className="result-score">
      <div>
        <strong>{scores[mySide]}</strong>
        <span className="label">나</span>
      </div>
      <span>:</span>
      <div>
        <strong>{scores[opposite(mySide)]}</strong>
        <span className="label">상대</span>
      </div>
    </div>
  );
}
