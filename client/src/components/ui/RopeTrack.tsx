interface RopeTrackProps {
  /** -1 (fully on B's side) ~ 1 (fully on A's side); 0 is center. */
  position: number;
}

export function RopeTrack({ position }: RopeTrackProps) {
  return (
    <div className="rope-track">
      <div className="rope-zone zone-a" />
      <div className="rope-zone zone-b" />
      <div className="rope-marker" style={{ left: `${((position + 1) / 2) * 100}%` }} />
      <div className="rope-center" />
    </div>
  );
}
