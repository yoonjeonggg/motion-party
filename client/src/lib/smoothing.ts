export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Default smoothing factor for the exponential moving average every score tracker applies. */
export const SCORE_SMOOTHING = 0.35;

/** Exponential moving average of a 0~1 score, so per-frame noise doesn't make gauges jitter. */
export class SmoothedScore {
  private value = 0;
  private readonly factor: number;

  constructor(factor = SCORE_SMOOTHING) {
    this.factor = factor;
  }

  push(target: number): number {
    this.value += (target - this.value) * this.factor;
    return this.value;
  }

  /** Eases back toward 0, e.g. when the tracked landmarks are lost for a frame. */
  decay(): number {
    return this.push(0);
  }

  reset(): void {
    this.value = 0;
  }
}

/** Average of the last `size` samples pushed. */
export class RollingAverage {
  private samples: number[] = [];
  private readonly size: number;

  constructor(size: number) {
    this.size = size;
  }

  push(sample: number): void {
    this.samples.push(sample);
    if (this.samples.length > this.size) this.samples.shift();
  }

  get average(): number {
    return this.samples.length === 0 ? 0 : this.samples.reduce((sum, v) => sum + v, 0) / this.samples.length;
  }

  reset(): void {
    this.samples = [];
  }
}
