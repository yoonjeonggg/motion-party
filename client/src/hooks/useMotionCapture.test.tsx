import { act, render, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireCamera, releaseCamera } from '../lib/camera';
import { pose } from '../test/landmarks';
import { installManualRaf } from '../test/raf';
import { isCameraFailed, useMotionCapture } from './useMotionCapture';

const mp = vi.hoisted(() => ({
  poseDetect: vi.fn(),
  faceDetect: vi.fn(),
  forVisionTasks: vi.fn(),
  createPose: vi.fn(),
  createFace: vi.fn(),
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mp.forVisionTasks },
  PoseLandmarker: { createFromOptions: mp.createPose },
  FaceLandmarker: { createFromOptions: mp.createFace },
}));
vi.mock('../lib/camera', () => ({ acquireCamera: vi.fn(), releaseCamera: vi.fn() }));

type Result = ReturnType<typeof useMotionCapture>;
let latest: Result;

/** Mounts the hook on a real <video> and exposes its latest result to the test as `latest`. */
function Capture({ active = true, options }: { active?: boolean; options?: Parameters<typeof useMotionCapture>[1] }) {
  const result = useMotionCapture(active, options);
  useLayoutEffect(() => {
    latest = result;
  });
  const { videoRef } = result;
  return <video ref={videoRef} />;
}

let raf: ReturnType<typeof installManualRaf>;
const frame = (count = 1) => raf.frame(count);

const STRAIGHT = pose({
  LEFT_SHOULDER: { x: 0.3, y: 0.2 },
  LEFT_ELBOW: { x: 0.3, y: 0.4 },
  LEFT_WRIST: { x: 0.3, y: 0.6 },
  RIGHT_SHOULDER: { x: 0.7, y: 0.2 },
  RIGHT_ELBOW: { x: 0.7, y: 0.4 },
  RIGHT_WRIST: { x: 0.7, y: 0.6 },
});
const BENT = pose({
  LEFT_SHOULDER: { x: 0.3, y: 0.2 },
  LEFT_ELBOW: { x: 0.3, y: 0.4 },
  LEFT_WRIST: { x: 0.5, y: 0.4 },
  RIGHT_SHOULDER: { x: 0.7, y: 0.2 },
  RIGHT_ELBOW: { x: 0.7, y: 0.4 },
  RIGHT_WRIST: { x: 0.9, y: 0.4 },
});
const STRAIN_SHAPES = ['browDown', 'eyeSquint', 'mouthPress', 'noseSneer'].flatMap((s) => [`${s}Left`, `${s}Right`]);
/** A face whose every strain blendshape is at `score`, i.e. raw intensity == score. */
const strain = (score: number) => ({
  faceBlendshapes: [{ categories: STRAIN_SHAPES.map((categoryName) => ({ categoryName, score })) }],
});

beforeEach(() => {
  raf = installManualRaf();
  vi.mocked(acquireCamera).mockReset().mockResolvedValue({} as MediaStream);
  vi.mocked(releaseCamera).mockReset();
  mp.forVisionTasks.mockReset().mockResolvedValue({});
  mp.createPose.mockReset().mockResolvedValue({ detectForVideo: mp.poseDetect });
  mp.createFace.mockReset().mockResolvedValue({ detectForVideo: mp.faceDetect });
  mp.poseDetect.mockReset().mockReturnValue({ landmarks: [STRAIGHT] });
  mp.faceDetect.mockReset().mockReturnValue(strain(0));
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function ready(options?: Parameters<typeof useMotionCapture>[1]) {
  const view = render(<Capture options={options} />);
  await waitFor(() => expect(latest.cameraState).toBe('READY'));
  return view;
}

// Ordered first: the shared model loaders cache their first success for the rest of the file.
describe('model loading', () => {
  it('reports ERROR when the models fail to load, and retries on the next mount', async () => {
    mp.forVisionTasks.mockRejectedValueOnce(new Error('offline'));
    const { unmount } = render(<Capture />);
    await waitFor(() => expect(latest.cameraState).toBe('ERROR'));
    unmount();
    expect(releaseCamera).toHaveBeenCalledTimes(1);

    mp.createPose.mockRejectedValueOnce(new Error('webgl unavailable'));
    await ready();
    expect(mp.forVisionTasks).toHaveBeenCalledTimes(2);
    expect(mp.createPose).toHaveBeenLastCalledWith({}, expect.objectContaining({ baseOptions: expect.objectContaining({ delegate: 'CPU' }) }));
  });
});

describe('camera states', () => {
  it('stays IDLE and leaves the camera alone while inactive', () => {
    render(<Capture active={false} />);
    expect(latest.cameraState).toBe('IDLE');
    expect(acquireCamera).not.toHaveBeenCalled();
  });

  it.each([
    ['NotAllowedError', 'DENIED'],
    ['PermissionDeniedError', 'DENIED'],
    ['NotReadableError', 'ERROR'],
  ])('maps %s to %s', async (name, state) => {
    vi.mocked(acquireCamera).mockRejectedValue(new DOMException('x', name));
    render(<Capture />);
    await waitFor(() => expect(latest.cameraState).toBe(state));
    expect(isCameraFailed(latest.cameraState)).toBe(true);
  });

  it('isCameraFailed is only true for DENIED and ERROR', () => {
    expect(['IDLE', 'REQUESTING', 'READY', 'DENIED', 'ERROR'].filter((s) => isCameraFailed(s as never))).toEqual([
      'DENIED',
      'ERROR',
    ]);
  });

  it('stops the frame loop and releases the camera on unmount', async () => {
    const { unmount } = await ready();
    expect(raf.pending()).toBe(1);
    unmount();
    expect(raf.pending()).toBe(0);
    expect(releaseCamera).toHaveBeenCalledTimes(1);
  });
});

describe('frame loop', () => {
  it('tracks arm motion, pose presence and the current gesture', async () => {
    await ready();
    mp.poseDetect.mockImplementation(() => ({ landmarks: [mp.poseDetect.mock.calls.length % 2 ? STRAIGHT : BENT] }));
    frame(10);
    expect(latest.poseDetected).toBe(true);
    expect(latest.motionScore).toBeGreaterThan(0.5);
    expect(latest.bodyMovementScore).toBeGreaterThan(0);
    expect(latest.gesture).toBe('REST');

    mp.poseDetect.mockReturnValue({ landmarks: [] });
    frame();
    expect(latest.poseDetected).toBe(false);
  });

  it('only computes the scores the caller asked for', async () => {
    await ready({ motion: false, bodyMovement: false, gesture: false, expression: false });
    mp.poseDetect.mockImplementation(() => ({ landmarks: [mp.poseDetect.mock.calls.length % 2 ? STRAIGHT : BENT] }));
    frame(6);
    expect(latest.motionScore).toBe(0);
    expect(latest.bodyMovementScore).toBe(0);
    expect(mp.faceDetect).not.toHaveBeenCalled();
  });

  it('skips pose inference entirely with pose: false', async () => {
    await ready({ pose: false });
    frame(6);
    expect(mp.poseDetect).not.toHaveBeenCalled();
    expect(mp.faceDetect).toHaveBeenCalled();
  });

  it('runs face inference only every third frame', async () => {
    await ready();
    frame(9);
    expect(mp.poseDetect).toHaveBeenCalledTimes(9);
    expect(mp.faceDetect).toHaveBeenCalledTimes(3);
  });

  it('scores expression and reports whether a face is visible', async () => {
    await ready();
    mp.faceDetect.mockReturnValue(strain(1));
    frame(30);
    expect(latest.faceDetected).toBe(true);
    expect(latest.expressionScore).toBeGreaterThan(0);

    mp.faceDetect.mockReturnValue({ faceBlendshapes: [] });
    frame(3);
    expect(latest.faceDetected).toBe(false);
  });

  it('survives a frame whose inference throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await ready();
    mp.poseDetect.mockImplementationOnce(() => {
      throw new Error('gpu context lost');
    });
    frame();
    expect(warn).toHaveBeenCalled();
    mp.poseDetect.mockReturnValue({ landmarks: [] });
    frame();
    expect(latest.poseDetected).toBe(false);
  });
});

describe('calibration', () => {
  it('averages neutral-face samples into a baseline that later scores are relative to', async () => {
    await ready();
    act(() => latest.beginCalibration());
    mp.faceDetect.mockReturnValue(strain(0.4));
    frame(9);
    expect(latest.expressionScore).toBe(0);
    let baseline = 0;
    act(() => {
      baseline = latest.endCalibration();
    });
    expect(baseline).toBeCloseTo(0.4);

    // Same face as the baseline -> no bonus; a stronger one -> only the difference counts.
    frame(30);
    expect(latest.expressionScore).toBe(0);
    mp.faceDetect.mockReturnValue(strain(1));
    frame(60);
    expect(latest.expressionScore).toBeCloseTo(0.6, 1);
  });

  it('carries the baseline over to the next screen', async () => {
    const first = await ready();
    act(() => latest.beginCalibration());
    mp.faceDetect.mockReturnValue(strain(0.5));
    frame(6);
    act(() => void latest.endCalibration());
    first.unmount();

    await ready();
    frame(60);
    expect(latest.expressionScore).toBe(0);
  });

  it('a calibration with no face samples gives a zero baseline', async () => {
    await ready();
    act(() => latest.beginCalibration());
    mp.faceDetect.mockReturnValue({ faceBlendshapes: [] });
    frame(6);
    let baseline = -1;
    act(() => {
      baseline = latest.endCalibration();
    });
    expect(baseline).toBe(0);
  });
});
