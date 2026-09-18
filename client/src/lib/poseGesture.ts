import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { SCORE_SMOOTHING } from './motionScore';

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;

export type Gesture = 'LEFT_ARM_UP' | 'RIGHT_ARM_UP' | 'BOTH_ARMS_UP' | 'ARMS_OUT' | 'REST';

/** Tunable: normalized-y margin a wrist must clear above the shoulder to count as "raised". */
const RAISE_MARGIN = 0.08;
/** Tunable: normalized-y band around shoulder height a wrist must stay within for "arms out". */
const OUT_Y_BAND = 0.12;
/** Tunable: normalized-x distance a wrist must clear from the shoulder to count as "out to the side". */
const OUT_X_MARGIN = 0.18;

/**
 * Classifies the current pose into a small upper-body gesture set for 동작 따라하기 (Simon Says).
 * Deliberately limited to shoulder/wrist landmarks: the rest of the app frames users
 * upper-body-only (FN-01 onboarding hint), so hips/knees are often out of frame.
 */
export function classifyGesture(landmarks: NormalizedLandmark[] | null): Gesture {
  if (!landmarks) return 'REST';
  const ls = landmarks[LEFT_SHOULDER];
  const rs = landmarks[RIGHT_SHOULDER];
  const lw = landmarks[LEFT_WRIST];
  const rw = landmarks[RIGHT_WRIST];
  if (!ls || !rs || !lw || !rw) return 'REST';

  const leftUp = lw.y < ls.y - RAISE_MARGIN;
  const rightUp = rw.y < rs.y - RAISE_MARGIN;
  if (leftUp && rightUp) return 'BOTH_ARMS_UP';

  const leftOut = Math.abs(lw.y - ls.y) < OUT_Y_BAND && ls.x - lw.x > OUT_X_MARGIN;
  const rightOut = Math.abs(rw.y - rs.y) < OUT_Y_BAND && rw.x - rs.x > OUT_X_MARGIN;
  if (leftOut && rightOut) return 'ARMS_OUT';

  if (leftUp) return 'LEFT_ARM_UP';
  if (rightUp) return 'RIGHT_ARM_UP';

  return 'REST';
}

export const GESTURE_LABELS: Record<Gesture, string> = {
  LEFT_ARM_UP: '왼팔 들기',
  RIGHT_ARM_UP: '오른팔 들기',
  BOTH_ARMS_UP: '만세',
  ARMS_OUT: '양팔 벌리기',
  REST: '차렷',
};

/** Cue targets the game rotates through; REST is only ever a fallback classification, never a cue. */
export const SIMON_SAYS_GESTURES = [
  'LEFT_ARM_UP',
  'RIGHT_ARM_UP',
  'BOTH_ARMS_UP',
  'ARMS_OUT',
] as const satisfies readonly Gesture[];

/** Smooths the instant "does my gesture match the cue right now" bit into a 0..1 score, like the other trackers. */
export class GestureMatchTracker {
  private smoothedScore = 0;

  update(matched: boolean): number {
    const raw = matched ? 1 : 0;
    this.smoothedScore += (raw - this.smoothedScore) * SCORE_SMOOTHING;
    return this.smoothedScore;
  }

  reset(): void {
    this.smoothedScore = 0;
  }
}
