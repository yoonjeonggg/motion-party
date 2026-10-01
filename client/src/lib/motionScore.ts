import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { POSE } from './landmarks';
import { clamp01, RollingAverage, SmoothedScore } from './smoothing';

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
  const ls = landmarks[POSE.LEFT_SHOULDER];
  const le = landmarks[POSE.LEFT_ELBOW];
  const lw = landmarks[POSE.LEFT_WRIST];
  const rs = landmarks[POSE.RIGHT_SHOULDER];
  const re = landmarks[POSE.RIGHT_ELBOW];
  const rw = landmarks[POSE.RIGHT_WRIST];

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

/** Arm-pull score for 줄다리기/팔씨름: how fast the elbow angle is changing, frame to frame. */
export class MotionScoreTracker {
  private previousAngle: number | null = null;
  private deltas = new RollingAverage(DELTA_WINDOW);
  private score = new SmoothedScore();

  update(landmarks: NormalizedLandmark[] | null): number {
    const angle = landmarks ? averageArmAngle(landmarks) : null;
    if (angle === null) {
      this.previousAngle = null;
      return this.score.decay();
    }

    if (this.previousAngle !== null) this.deltas.push(Math.abs(angle - this.previousAngle));
    this.previousAngle = angle;

    return this.score.push(clamp01(this.deltas.average / MAX_ANGLE_DELTA));
  }

  reset(): void {
    this.previousAngle = null;
    this.deltas.reset();
    this.score.reset();
  }
}

/** Landmarks sampled for whole-body movement: nose, shoulders, wrists, hips, ankles. */
const BODY_TRACKED_INDICES = [
  POSE.NOSE,
  POSE.LEFT_SHOULDER,
  POSE.RIGHT_SHOULDER,
  POSE.LEFT_WRIST,
  POSE.RIGHT_WRIST,
  POSE.LEFT_HIP,
  POSE.RIGHT_HIP,
  POSE.LEFT_ANKLE,
  POSE.RIGHT_ANKLE,
];
/** Tunable: average per-frame normalized landmark displacement that counts as "moving a lot". */
export const MAX_BODY_DELTA = 0.05;

/** Average displacement of the tracked landmarks visible in both frames, or null if none are. */
function averageDisplacement(current: NormalizedLandmark[], previous: NormalizedLandmark[]): number | null {
  let sum = 0;
  let count = 0;
  for (const i of BODY_TRACKED_INDICES) {
    const cur = current[i];
    const prev = previous[i];
    if (cur && prev) {
      sum += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      count += 1;
    }
  }
  return count > 0 ? sum / count : null;
}

/** Whole-body movement score for 얼음땡 (freeze tag) - unlike MotionScoreTracker, not limited to arm angle. */
export class BodyMovementTracker {
  private previous: NormalizedLandmark[] | null = null;
  private deltas = new RollingAverage(DELTA_WINDOW);
  private score = new SmoothedScore();

  update(landmarks: NormalizedLandmark[] | null): number {
    if (!landmarks) {
      this.previous = null;
      return this.score.decay();
    }

    if (this.previous) {
      const displacement = averageDisplacement(landmarks, this.previous);
      if (displacement !== null) this.deltas.push(displacement);
    }
    this.previous = landmarks;

    return this.score.push(clamp01(this.deltas.average / MAX_BODY_DELTA));
  }

  reset(): void {
    this.previous = null;
    this.deltas.reset();
    this.score.reset();
  }
}
