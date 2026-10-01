import { clamp01 } from '../../lib/smoothing';

interface GaugeProps {
  /** 0~1; out-of-range values are clamped. */
  value: number;
  /** Renders the fill in the secondary (opponent/warning) color. */
  alt?: boolean;
}

export function Gauge({ value, alt = false }: GaugeProps) {
  return (
    <div className="gauge">
      <div className={`gauge-fill${alt ? ' opponent' : ''}`} style={{ width: `${Math.round(clamp01(value) * 100)}%` }} />
    </div>
  );
}
