import { describe, expect, it } from 'vitest';
import { pose } from '../test/landmarks';
import { classifyGesture, GESTURE_LABELS, GestureMatchTracker, isGesture, SIMON_SAYS_GESTURES } from './poseGesture';

// Image coordinates: y grows downward. "Out to the side" is ls.x - lw.x / rw.x - rs.x, as in classifyGesture.
const SHOULDERS = { LEFT_SHOULDER: { x: 0.4, y: 0.4 }, RIGHT_SHOULDER: { x: 0.6, y: 0.4 } };
const DOWN = { LEFT_WRIST: { x: 0.4, y: 0.8 }, RIGHT_WRIST: { x: 0.6, y: 0.8 } };
const LEFT_UP = { LEFT_WRIST: { x: 0.4, y: 0.1 } };
const RIGHT_UP = { RIGHT_WRIST: { x: 0.6, y: 0.1 } };

describe('classifyGesture', () => {
  it('recognizes each cue', () => {
    expect(classifyGesture(pose({ ...SHOULDERS, ...DOWN, ...LEFT_UP }))).toBe('LEFT_ARM_UP');
    expect(classifyGesture(pose({ ...SHOULDERS, ...DOWN, ...RIGHT_UP }))).toBe('RIGHT_ARM_UP');
    expect(classifyGesture(pose({ ...SHOULDERS, ...LEFT_UP, ...RIGHT_UP }))).toBe('BOTH_ARMS_UP');
    expect(
      classifyGesture(pose({ ...SHOULDERS, LEFT_WRIST: { x: 0.1, y: 0.42 }, RIGHT_WRIST: { x: 0.9, y: 0.38 } })),
    ).toBe('ARMS_OUT');
  });

  it('needs both arms out for ARMS_OUT', () => {
    expect(classifyGesture(pose({ ...SHOULDERS, ...DOWN, LEFT_WRIST: { x: 0.1, y: 0.4 } }))).toBe('REST');
  });

  it('falls back to REST for arms down, a barely-raised wrist, or missing landmarks', () => {
    expect(classifyGesture(pose({ ...SHOULDERS, ...DOWN }))).toBe('REST');
    expect(classifyGesture(pose({ ...SHOULDERS, ...DOWN, LEFT_WRIST: { x: 0.4, y: 0.35 } }))).toBe('REST');
    expect(classifyGesture(pose({ ...SHOULDERS, ...LEFT_UP }))).toBe('REST');
    expect(classifyGesture([])).toBe('REST');
    expect(classifyGesture(null)).toBe('REST');
  });
});

describe('gesture metadata', () => {
  it('every cue is a labelled gesture, and REST is never a cue', () => {
    for (const cue of SIMON_SAYS_GESTURES) {
      expect(isGesture(cue)).toBe(true);
      expect(GESTURE_LABELS[cue]).toBeTruthy();
    }
    expect(SIMON_SAYS_GESTURES).not.toContain('REST');
  });

  it('isGesture rejects unknown strings, including inherited keys', () => {
    expect(isGesture('')).toBe(false);
    expect(isGesture('JUMP')).toBe(false);
    expect(isGesture('toString')).toBe(false);
    expect(isGesture('__proto__')).toBe(false);
  });
});

describe('GestureMatchTracker', () => {
  it('ramps up while matching, down while not, and resets', () => {
    const t = new GestureMatchTracker();
    let v = 0;
    for (let i = 0; i < 30; i++) v = t.update(true);
    expect(v).toBeGreaterThan(0.99);
    expect(t.update(false)).toBeLessThan(v);
    t.reset();
    expect(t.update(false)).toBe(0);
  });
});
