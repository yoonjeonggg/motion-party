import { opposite, type Side } from '../../types';

interface RopeTrackProps {
  /** Server position: -1 (B pushed it all the way to A's end) ~ 1 (A pushed it all the way to B's end); 0 is center. */
  position: number;
  /**
   * Whose point of view to draw from. My zone is always on the left and pushing the
   * marker to the right end wins, regardless of which side the server put me on.
   */
  mySide?: Side;
}

export function RopeTrack({ position, mySide = 'A' }: RopeTrackProps) {
  const fromMyView = mySide === 'A' ? position : -position;
  return (
    <div className="rope">
      <div className="rope-labels">
        <span>내 쪽</span>
        <span>상대 쪽 끝까지 밀면 승리</span>
      </div>
      <div className="rope-track">
        <div className={`rope-zone zone-${mySide}`} />
        <div className={`rope-zone zone-${opposite(mySide)}`} />
        {/* Inset by the marker's half-width so it isn't clipped by the rounded track at either end. */}
        <div className="rope-marker" style={{ left: `calc(12px + (100% - 24px) * ${(fromMyView + 1) / 2})` }} />
        <div className="rope-center" />
      </div>
    </div>
  );
}
