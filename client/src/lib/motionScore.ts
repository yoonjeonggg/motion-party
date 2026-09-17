import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const LEFT_SHOULDER = 11;
const LEFT_ELBOW = 13;
const LEFT_WRIST = 15;
const RIGHT_SHOULDER = 12;
const RIGHT_ELBOW = 14;
const RIGHT_WRIST = 16;

function angleAt(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  c: NormalizedLandmark,
): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magA = Math.hypot(abx, aby);
  const magC = Math.hypot(cbx, cby);
  if (magA === 0 || magC === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magA * magC)));
  return Math.acos(cos);
}

export function averageArmAngle(landmarks: NormalizedLandmark[]): number | null {
  const ls = landmarks[LEFT_SHOULDER];
  const le = landmarks[LEFT_ELBOW];
  const lw = landmarks[LEFT_WRIST];
  const rs = landmarks[RIGHT_SHOULDER];
  const re = landmarks[RIGHT_ELBOW];
  const rw = landmarks[RIGHT_WRIST];

  const angles: number[] = [];
  if (ls && le && lw) angles.push(angleAt(ls, le, lw));
  if (rs && re && rw) angles.push(angleAt(rs, re, rw));
  if (angles.length === 0) return null;
  return angles.reduce((sum, a) => sum + a, 0) / angles.length;
}

/** Tunable: radians of elbow-angle change per frame that counts as a "full power" pull. */
export const MAX_ANGLE_DELTA = 0.55;
/** Number of recent per-frame deltas averaged into the reported motion score. */
export const DELTA_WINDOW = 10;
/** Smoothing factor for the exponential moving average applied to the final score. */
export const SCORE_SMOOTHING = 0.35;

export class MotionScoreTracker {
  private previousAngle: number | null = null;
  private deltaBuffer: number[] = [];
  private smoothedScore = 0;

  update(landmarks: NormalizedLandmark[] | null): number {
    if (!landmarks) {
      this.previousAngle = null;
      return this.decay();
    }

    const angle = averageArmAngle(landmarks);
    if (angle === null) {
      this.previousAngle = null;
      return this.decay();
    }

    if (this.previousAngle !== null) {
      const delta = Math.abs(angle - this.previousAngle);
      this.deltaBuffer.push(delta);
      if (this.deltaBuffer.length > DELTA_WINDOW) this.deltaBuffer.shift();
    }
    this.previousAngle = angle;

    const avgDelta =
      this.deltaBuffer.length === 0
        ? 0
        : this.deltaBuffer.reduce((sum, d) => sum + d, 0) / this.deltaBuffer.length;

    const rawScore = Math.max(0, Math.min(1, avgDelta / MAX_ANGLE_DELTA));
    this.smoothedScore += (rawScore - this.smoothedScore) * SCORE_SMOOTHING;
    return this.smoothedScore;
  }

  private decay(): number {
    this.smoothedScore += (0 - this.smoothedScore) * SCORE_SMOOTHING;
    return this.smoothedScore;
  }

  reset(): void {
    this.previousAngle = null;
    this.deltaBuffer = [];
    this.smoothedScore = 0;
  }
}

/** Landmark indices sampled for whole-body movement: nose, shoulders, wrists, hips, ankles. */
const BODY_TRACKED_INDICES = [0, 11, 12, 15, 16, 23, 24, 27, 28];
/** Tunable: average per-frame normalized landmark displacement that counts as "moving a lot". */
export const MAX_BODY_DELTA = 0.05;

/** Whole-body movement score for 얼음땡 (freeze tag) - unlike MotionScoreTracker, not limited to arm angle. */
export class BodyMovementTracker {
  private previous: NormalizedLandmark[] | null = null;
  private deltaBuffer: number[] = [];
  private smoothedScore = 0;

  update(landmarks: NormalizedLandmark[] | null): number {
    if (!landmarks) {
      this.previous = null;
      return this.decay();
    }

    if (this.previous) {
      let sum = 0;
      let count = 0;
      for (const i of BODY_TRACKED_INDICES) {
        const cur = landmarks[i];
        const prev = this.previous[i];
        if (cur && prev) {
          sum += Math.hypot(cur.x - prev.x, cur.y - prev.y);
          count += 1;
        }
      }
      if (count > 0) {
        this.deltaBuffer.push(sum / count);
        if (this.deltaBuffer.length > DELTA_WINDOW) this.deltaBuffer.shift();
      }
    }
    this.previous = landmarks;

    const avgDelta =
      this.deltaBuffer.length === 0
        ? 0
        : this.deltaBuffer.reduce((sum, d) => sum + d, 0) / this.deltaBuffer.length;

    const rawScore = Math.max(0, Math.min(1, avgDelta / MAX_BODY_DELTA));
    this.smoothedScore += (rawScore - this.smoothedScore) * SCORE_SMOOTHING;
    return this.smoothedScore;
  }

  private decay(): number {
    this.smoothedScore += (0 - this.smoothedScore) * SCORE_SMOOTHING;
    return this.smoothedScore;
  }

  reset(): void {
    this.previous = null;
    this.deltaBuffer = [];
    this.smoothedScore = 0;
  }
}
