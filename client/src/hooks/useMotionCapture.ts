import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState } from 'react';
import { ExpressionScoreTracker, rawExpressionIntensity } from '../lib/expressionScore';
import { BodyMovementTracker, MotionScoreTracker } from '../lib/motionScore';
import { classifyGesture, type Gesture } from '../lib/poseGesture';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const FRAME_INTERVAL_MS = 1000 / 30;
/**
 * Running FaceLandmarker every frame alongside PoseLandmarker is the main
 * driver of frame drops/heat on lower-end devices (see 기획서 §8 리스크).
 * Motion needs to react instantly for rope feel; expression doesn't - only
 * infer it on every Nth processed frame (~30fps / 3 = ~10fps).
 */
const FACE_INFERENCE_EVERY_N_FRAMES = 3;

export type CameraState = 'IDLE' | 'REQUESTING' | 'READY' | 'DENIED' | 'ERROR';

interface UseMotionCaptureOptions {
  /** Whether to also run FaceLandmarker for expression scoring. Default true; disable for games that don't use it (perf). */
  expression?: boolean;
  /** Whether to run PoseLandmarker at all. Default true; disable when only expression is needed (e.g. calibration). */
  pose?: boolean;
  /** Whether to track arm-angle motionScore (줄다리기/팔씨름). Default true; disable when the caller never reads it (perf: skips a setState per frame). */
  motion?: boolean;
  /** Whether to track whole-body bodyMovementScore (얼음땡). Default true; disable when the caller never reads it. */
  bodyMovement?: boolean;
  /** Whether to classify the upper-body gesture (동작 따라하기). Default true; disable when the caller never reads it. */
  gesture?: boolean;
}

interface UseMotionCaptureResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraState: CameraState;
  motionScore: number;
  poseDetected: boolean;
  /** Whole-body movement score (얼음땡), independent of the arm-specific motionScore. */
  bodyMovementScore: number;
  /** Current classified upper-body pose (동작 따라하기), 'REST' when nothing recognized. */
  gesture: Gesture;
  expressionScore: number;
  faceDetected: boolean;
  /** Starts collecting raw expression samples for baseline calibration. */
  beginCalibration: () => void;
  /** Stops collecting, computes and applies the baseline. Returns it (0 if no samples). */
  endCalibration: () => number;
}

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
type Delegate = 'GPU' | 'CPU';

/**
 * Lazily creates one shared landmarker per model, preferring the GPU delegate.
 * Some mobile browsers reject a WebGL-backed delegate (driver/memory quirks) - CPU still works, just slower.
 */
function sharedLandmarker<T>(create: (fileset: WasmFileset, delegate: Delegate) => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    promise ??= FilesetResolver.forVisionTasks(WASM_BASE).then(async (fileset) => {
      try {
        return await create(fileset, 'GPU');
      } catch {
        return create(fileset, 'CPU');
      }
    });
    return promise;
  };
}

const getPoseLandmarker = sharedLandmarker((fileset, delegate) =>
  PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  }),
);

const getFaceLandmarker = sharedLandmarker((fileset, delegate) =>
  FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
  }),
);

export function useMotionCapture(
  active: boolean,
  options: UseMotionCaptureOptions = {},
): UseMotionCaptureResult {
  const useExpression = options.expression ?? true;
  const usePose = options.pose ?? true;
  const useMotion = options.motion ?? true;
  const useBodyMovement = options.bodyMovement ?? true;
  const useGesture = options.gesture ?? true;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const motionTrackerRef = useRef(new MotionScoreTracker());
  const bodyTrackerRef = useRef(new BodyMovementTracker());
  const expressionTrackerRef = useRef(new ExpressionScoreTracker());
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const frameIndexRef = useRef(0);
  const poseDetectedRef = useRef(false);
  const faceDetectedRef = useRef(false);
  const calibratingRef = useRef(false);
  const calibrationSamplesRef = useRef<number[]>([]);

  const [cameraState, setCameraState] = useState<CameraState>('IDLE');
  const [motionScore, setMotionScore] = useState(0);
  const [poseDetected, setPoseDetected] = useState(false);
  const [bodyMovementScore, setBodyMovementScore] = useState(0);
  const [gesture, setGesture] = useState<Gesture>('REST');
  const [expressionScore, setExpressionScore] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function start() {
      setCameraState('REQUESTING');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // `ideal` (not exact) so phones whose front camera doesn't support 640x480
          // exactly still get a stream; facingMode picks the selfie camera on mobile.
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const [poseLandmarker, faceLandmarker] = await Promise.all([
          usePose ? getPoseLandmarker() : Promise.resolve(null),
          useExpression ? getFaceLandmarker() : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCameraState('READY');
        motionTrackerRef.current.reset();
        bodyTrackerRef.current.reset();
        expressionTrackerRef.current.reset();
        frameIndexRef.current = 0;

        const loop = (time: number) => {
          if (cancelled) return;
          if (time - lastFrameTimeRef.current >= FRAME_INTERVAL_MS && video.readyState >= 2) {
            lastFrameTimeRef.current = time;
            frameIndexRef.current += 1;
            const now = performance.now();

            if (poseLandmarker) {
              const poseResult = poseLandmarker.detectForVideo(video, now);
              const landmarks = poseResult.landmarks[0] ?? null;
              // Only track/setState the scores this caller actually reads - each
              // setState is a re-render, and most screens only need one of the three.
              if (useMotion) setMotionScore(motionTrackerRef.current.update(landmarks));
              if (useBodyMovement) setBodyMovementScore(bodyTrackerRef.current.update(landmarks));
              if (useGesture) setGesture(classifyGesture(landmarks));
              if (poseDetectedRef.current !== Boolean(landmarks)) {
                poseDetectedRef.current = Boolean(landmarks);
                setPoseDetected(poseDetectedRef.current);
              }
            }

            // Throttled: see FACE_INFERENCE_EVERY_N_FRAMES.
            if (faceLandmarker && frameIndexRef.current % FACE_INFERENCE_EVERY_N_FRAMES === 0) {
              const faceResult = faceLandmarker.detectForVideo(video, now);
              const categories = faceResult.faceBlendshapes[0]?.categories;
              const raw = rawExpressionIntensity(categories);
              if (faceDetectedRef.current !== (raw !== null)) {
                faceDetectedRef.current = raw !== null;
                setFaceDetected(faceDetectedRef.current);
              }
              if (calibratingRef.current) {
                if (raw !== null) calibrationSamplesRef.current.push(raw);
              } else {
                setExpressionScore(expressionTrackerRef.current.update(raw));
              }
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
          setCameraState('DENIED');
        } else {
          setCameraState('ERROR');
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // usePose/useExpression are set once per mount by the caller; re-running this
    // effect on every render of a possibly-inline options object would tear down the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function beginCalibration() {
    calibrationSamplesRef.current = [];
    calibratingRef.current = true;
  }

  function endCalibration(): number {
    calibratingRef.current = false;
    const samples = calibrationSamplesRef.current;
    const baseline = samples.length === 0 ? 0 : samples.reduce((sum, v) => sum + v, 0) / samples.length;
    expressionTrackerRef.current.setBaseline(baseline);
    return baseline;
  }

  return {
    videoRef,
    cameraState,
    motionScore,
    poseDetected,
    bodyMovementScore,
    gesture,
    expressionScore,
    faceDetected,
    beginCalibration,
    endCalibration,
  };
}
