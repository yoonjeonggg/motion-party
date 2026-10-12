import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { POSE } from '../lib/landmarks';

type Point = { x: number; y: number };

/** A sparse pose with only the given landmarks present, at their MediaPipe indices. */
export function pose(points: Partial<Record<keyof typeof POSE, Point>>): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = [];
  for (const [name, p] of Object.entries(points)) {
    landmarks[POSE[name as keyof typeof POSE]] = { x: p.x, y: p.y, z: 0, visibility: 1 };
  }
  return landmarks;
}
