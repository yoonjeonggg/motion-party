import { describe, expect, it } from 'vitest';
import { ExpressionScoreTracker, rawExpressionIntensity } from './expressionScore';

const STRAIN = [
  'browDownLeft',
  'browDownRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'mouthPressLeft',
  'mouthPressRight',
  'noseSneerLeft',
  'noseSneerRight',
];
const all = (score: number) => STRAIN.map((categoryName) => ({ categoryName, score }));

describe('rawExpressionIntensity', () => {
  it('is null when no face was found', () => {
    expect(rawExpressionIntensity(undefined)).toBeNull();
    expect(rawExpressionIntensity([])).toBeNull();
  });

  it('is 0 for a neutral face and 1 for full strain', () => {
    expect(rawExpressionIntensity(all(0))).toBe(0);
    expect(rawExpressionIntensity(all(1))).toBeCloseTo(1);
    expect(rawExpressionIntensity(all(0.5))).toBeCloseTo(0.5);
  });

  it('ignores blendshapes that are not part of the strain score', () => {
    expect(rawExpressionIntensity([{ categoryName: 'jawOpen', score: 1 }])).toBe(0);
  });

  it('stays in [0, 1] even for out-of-range model output', () => {
    expect(rawExpressionIntensity(all(5))).toBe(1);
    expect(rawExpressionIntensity(all(-5))).toBe(0);
  });
});

describe('ExpressionScoreTracker', () => {
  it('scores relative to the calibrated baseline', () => {
    const t = new ExpressionScoreTracker();
    t.setBaseline(0.3);
    let v = 0;
    for (let i = 0; i < 50; i++) v = t.update(0.8);
    expect(v).toBeCloseTo(0.5, 3);
  });

  it('never goes negative below the baseline', () => {
    const t = new ExpressionScoreTracker();
    t.setBaseline(0.5);
    expect(t.update(0.1)).toBe(0);
  });

  it('treats a lost face as 0 and reset clears the baseline', () => {
    const t = new ExpressionScoreTracker();
    t.setBaseline(0.2);
    t.update(1);
    expect(t.update(null)).toBeLessThan(t.update(1));
    t.reset();
    expect(t.baseline).toBe(0);
  });
});
