/** A side's accumulated round score, for the games that total it up (freeze tag, simon says). */
export function TeamScore({ value }: { value: number | undefined }) {
  return <p className="hint small">누적 점수 {(value ?? 0).toFixed(1)}</p>;
}
