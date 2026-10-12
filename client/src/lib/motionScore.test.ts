import { describe, expect, it } from 'vitest';
import { pose } from '../test/landmarks';
import { averageArmAngle, BodyMovementTracker, MotionScoreTracker } from './motionScore';

/** Both arms bent at the elbow by `bend` radians away from straight. */
function arms(bend: number) {
  const elbow = (x: number) => ({ x, y: 0.5 });
  const wrist = (x: number) => ({ x: x + Math.sin(bend) * 0.1, y: 0.5 + Math.cos(bend) * 0.1 });
  return pose({
    LEFT_SHOULDER: { x: 0.3, y: 0.4 },
    LEFT_ELBOW: elbow(0.3),
    LEFT_WRIST: wrist(0.3),
    RIGHT_SHOULDER: { x: 0.7, y: 0.4 },
    RIGHT_ELBOW: elbow(0.7),
    RIGHT_WRIST: wrist(0.7),
  });
}

describe('averageArmAngle', () => {
  it('is π for straight arms and shrinks as they bend', () => {
    expect(averageArmAngle(arms(0))).toBeCloseTo(Math.PI);
    expect(averageArmAngle(arms(Math.PI / 2))).toBeCloseTo(Math.PI / 2);
  });

  it('uses whichever arm is visible', () => {
    const oneArm = pose({ LEFT_SHOULDER: { x: 0, y: 0 }, LEFT_ELBOW: { x: 0, y: 1 }, LEFT_WRIST: { x: 1, y: 1 } });
    expect(averageArmAngle(oneArm)).toBeCloseTo(Math.PI / 2);
  });

  it('is null with no complete arm, and 0 for degenerate (overlapping) joints', () => {
    expect(averageArmAngle([])).toBeNull();
    expect(averageArmAngle(pose({ LEFT_SHOULDER: { x: 0, y: 0 }, LEFT_ELBOW: { x: 0, y: 1 } }))).toBeNull();
    const p = { x: 0.5, y: 0.5 };
    expect(averageArmAngle(pose({ LEFT_SHOULDER: p, LEFT_ELBOW: p, LEFT_WRIST: p }))).toBe(0);
  });
});

describe('MotionScoreTracker', () => {
  it('stays at 0 while the arms hold still', () => {
    const t = new MotionScoreTracker();
    for (let i = 0; i < 10; i++) expect(t.update(arms(0.5))).toBe(0);
  });

  it('rises while pulling and stays within [0, 1]', () => {
    const t = new MotionScoreTracker();
    let score = 0;
    for (let i = 0; i < 30; i++) score = t.update(arms(i % 2 ? 0 : 1.5));
    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('decays when the pose is lost', () => {
    const t = new MotionScoreTracker();
    for (let i = 0; i < 10; i++) t.update(arms(i % 2 ? 0 : 1));
    const before = t.update(arms(0));
    const lost = t.update(null);
    expect(lost).toBeLessThan(before);
    expect(t.update([])).toBeLessThan(lost);
  });

  it('reset clears all history', () => {
    const t = new MotionScoreTracker();
    for (let i = 0; i < 10; i++) t.update(arms(i % 2 ? 0 : 1));
    t.reset();
    expect(t.update(arms(1))).toBe(0);
  });
});

describe('BodyMovementTracker', () => {
  const at = (dx: number) => pose({ NOSE: { x: 0.5 + dx, y: 0.2 }, LEFT_HIP: { x: 0.4 + dx, y: 0.7 } });

  it('is 0 for a still body and rises with movement', () => {
    const still = new BodyMovementTracker();
    for (let i = 0; i < 5; i++) expect(still.update(at(0))).toBe(0);

    const moving = new BodyMovementTracker();
    let score = 0;
    for (let i = 0; i < 20; i++) score = moving.update(at(i % 2 ? 0.1 : 0));
    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('ignores frames with no landmarks in common', () => {
    const t = new BodyMovementTracker();
    t.update(pose({ NOSE: { x: 0, y: 0 } }));
    expect(t.update(pose({ LEFT_ANKLE: { x: 1, y: 1 } }))).toBe(0);
  });

  it('decays when the body leaves the frame and restarts cleanly after reset', () => {
    const t = new BodyMovementTracker();
    for (let i = 0; i < 10; i++) t.update(at(i % 2 ? 0.1 : 0));
    const before = t.update(at(0.1));
    expect(t.update(null)).toBeLessThan(before);
    t.reset();
    expect(t.update(at(0.3))).toBe(0);
  });
});
