import { clamp01, SmoothedScore } from './smoothing';

interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

/** Tunable: relative contribution of each "힘든 표정" blendshape to the raw intensity score. */
const EXPRESSION_WEIGHTS: Record<string, number> = {
  browDownLeft: 1,
  browDownRight: 1,
  eyeSquintLeft: 0.7,
  eyeSquintRight: 0.7,
  mouthPressLeft: 0.8,
  mouthPressRight: 0.8,
  noseSneerLeft: 0.6,
  noseSneerRight: 0.6,
};

const WEIGHT_SUM = Object.values(EXPRESSION_WEIGHTS).reduce((sum, w) => sum + w, 0);

/** Raw 0~1 "힘든 표정 강도" for one frame, before baseline subtraction. */
export function rawExpressionIntensity(categories: BlendshapeCategory[] | undefined): number | null {
  if (!categories || categories.length === 0) return null;
  let sum = 0;
  for (const c of categories) {
    const weight = EXPRESSION_WEIGHTS[c.categoryName];
    if (weight) sum += weight * c.score;
  }
  return clamp01(sum / WEIGHT_SUM);
}

export class ExpressionScoreTracker {
  baseline = 0;
  private score = new SmoothedScore();

  setBaseline(value: number): void {
    this.baseline = value;
  }

  /** Baseline-relative expression score for this frame (0~1), smoothed. */
  update(raw: number | null): number {
    return this.score.push(raw === null ? 0 : clamp01(raw - this.baseline));
  }

  reset(): void {
    this.score.reset();
    this.baseline = 0;
  }
}
