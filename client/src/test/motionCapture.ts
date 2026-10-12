import { vi } from 'vitest';
import type { CameraState } from '../hooks/useMotionCapture';
import type { Gesture } from '../lib/poseGesture';

/**
 * Controllable stand-in for useMotionCapture, so screens can be tested without a camera or
 * MediaPipe. Mutate `motion` (then rerender) to simulate what the camera currently sees. Use via:
 *   vi.mock('../hooks/useMotionCapture', async (orig) => ({ ...(await orig()), ...(await import('../test/motionCapture')).mocks }));
 */
export const motion = {
  cameraState: 'READY' as CameraState,
  motionScore: 0,
  poseDetected: true,
  bodyMovementScore: 0,
  gesture: 'REST' as Gesture,
  expressionScore: 0,
  faceDetected: true,
  baseline: 0,
};

/** Shared like a real ref: the screen's <video ref={videoRef}> attaches its element here. */
export const videoRef: { current: HTMLVideoElement | null } = { current: null };

export const beginCalibration = vi.fn();
export const endCalibration = vi.fn(() => motion.baseline);

export const useMotionCapture = vi.fn((active: boolean, _options?: object) => {
  const { baseline: _baseline, ...state } = motion;
  return {
    videoRef,
    ...state,
    cameraState: active ? state.cameraState : ('IDLE' as CameraState),
    beginCalibration,
    endCalibration,
  };
});

export const preloadVisionModels = vi.fn();

export function resetMotion() {
  Object.assign(motion, {
    cameraState: 'READY',
    motionScore: 0,
    poseDetected: true,
    bodyMovementScore: 0,
    gesture: 'REST',
    expressionScore: 0,
    faceDetected: true,
    baseline: 0,
  });
  videoRef.current = null;
  vi.clearAllMocks();
}

export const mocks = { useMotionCapture, preloadVisionModels };
