import { describe, expect, it } from 'vitest';
import { clamp01, RollingAverage, SCORE_SMOOTHING, SmoothedScore } from './smoothing';

describe('clamp01', () => {
  it('clamps into [0, 1]', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(7)).toBe(1);
  });
});

describe('SmoothedScore', () => {
  it('moves toward the target by the smoothing factor', () => {
    const s = new SmoothedScore();
    expect(s.push(1)).toBeCloseTo(SCORE_SMOOTHING);
    expect(s.push(1)).toBeCloseTo(SCORE_SMOOTHING + (1 - SCORE_SMOOTHING) * SCORE_SMOOTHING);
  });

  it('converges on a steady target', () => {
    const s = new SmoothedScore();
    let v = 0;
    for (let i = 0; i < 100; i++) v = s.push(0.8);
    expect(v).toBeCloseTo(0.8, 6);
  });

  it('decays toward 0 and resets to 0', () => {
    const s = new SmoothedScore(0.5);
    s.push(1);
    expect(s.decay()).toBe(0.25);
    s.reset();
    expect(s.push(0)).toBe(0);
  });
});

describe('RollingAverage', () => {
  it('is 0 when empty', () => {
    expect(new RollingAverage(3).average).toBe(0);
  });

  it('averages only the last `size` samples', () => {
    const r = new RollingAverage(3);
    for (const v of [100, 1, 2, 3]) r.push(v);
    expect(r.average).toBe(2);
    r.reset();
    expect(r.average).toBe(0);
  });
});
