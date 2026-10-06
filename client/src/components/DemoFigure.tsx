interface DemoFigureProps {
  /** Animation variant: 'pull' | 'move' | 'freeze' | a simon-* pose class (see App.css). */
  variant: string;
  /** Show the rope the figure pulls on (tug-style games). */
  rope?: boolean;
}

/**
 * Jointed stick figure for the tutorial demo. Every limb is an upper segment group with a nested
 * lower segment group, so CSS can rotate shoulders/elbows and hips/knees independently. Joint
 * coordinates here must match the transform-origin values in App.css.
 */
export function DemoFigure({ variant, rope = false }: DemoFigureProps) {
  return (
    <div className={`demo-figure ${variant}`} aria-hidden="true">
      <svg viewBox="0 0 140 180" className="demo-svg">
        <ellipse className="fig-shadow" cx="70" cy="168" rx="28" ry="5" />

        <g className="fig">
          <g className="fig-leg fig-leg-left">
            <line x1="62" y1="104" x2="62" y2="134" />
            <g className="fig-shin">
              <line x1="62" y1="134" x2="62" y2="162" />
            </g>
          </g>
          <g className="fig-leg fig-leg-right">
            <line x1="78" y1="104" x2="78" y2="134" />
            <g className="fig-shin">
              <line x1="78" y1="134" x2="78" y2="162" />
            </g>
          </g>

          <g className="fig-upper">
            <rect className="fig-torso" x="56" y="46" width="28" height="64" rx="13" />
            <g className="fig-head">
              <circle cx="70" cy="26" r="15" />
              <circle className="fig-eye" cx="64.5" cy="25" r="2" />
              <circle className="fig-eye" cx="75.5" cy="25" r="2" />
            </g>

            {rope && <line className="fig-rope" x1="96" y1="80" x2="190" y2="80" />}

            <g className="fig-arm fig-arm-left">
              <line x1="58" y1="54" x2="58" y2="80" />
              <g className="fig-forearm">
                <line x1="58" y1="80" x2="58" y2="104" />
                <circle className="fig-hand" cx="58" cy="104" r="5" />
              </g>
            </g>
            <g className="fig-arm fig-arm-right">
              <line x1="82" y1="54" x2="82" y2="80" />
              <g className="fig-forearm">
                <line x1="82" y1="80" x2="82" y2="104" />
                <circle className="fig-hand" cx="82" cy="104" r="5" />
              </g>
            </g>
          </g>
        </g>

        {variant === 'freeze' && (
          <g className="fig-frost">
            <text x="112" y="30">❄️</text>
            <text x="14" y="70">❄️</text>
          </g>
        )}
      </svg>
    </div>
  );
}
