import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState } from 'react';
import { ExpressionScoreTracker, rawExpressionIntensity } from '../lib/expressionScore';
import { BodyMovementTracker, MotionScoreTracker } from '../lib/motionScore';

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
}

interface UseMotionCaptureResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraState: CameraState;
  motionScore: number;
  poseDetected: boolean;
  /** Whole-body movement score (얼음땡), independent of the arm-specific motionScore. */
  bodyMovementScore: number;
  expressionScore: number;
  faceDetected: boolean;
  /** Starts collecting raw expression samples for baseline calibration. */
  beginCalibration: () => void;
  /** Stops collecting, computes and applies the baseline. Returns it (0 if no samples). */
  endCalibration: () => number;
}

let sharedPosePromise: Promise<PoseLandmarker> | null = null;
function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!sharedPosePromise) {
    sharedPosePromise = FilesetResolver.forVisionTasks(WASM_BASE).then((fileset) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      }),
    );
  }
  return sharedPosePromise;
}

let sharedFacePromise: Promise<FaceLandmarker> | null = null;
function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!sharedFacePromise) {
    sharedFacePromise = FilesetResolver.forVisionTasks(WASM_BASE).then((fileset) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      }),
    );
  }
  return sharedFacePromise;
}

export function useMotionCapture(
  active: boolean,
  options: UseMotionCaptureOptions = {},
): UseMotionCaptureResult {
  const useExpression = options.expression ?? true;
  const usePose = options.pose ?? true;
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
  const [expressionScore, setExpressionScore] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function start() {
      setCameraState('REQUESTING');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
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
              const score = motionTrackerRef.current.update(landmarks);
              setMotionScore(score);
              setBodyMovementScore(bodyTrackerRef.current.update(landmarks));
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
    expressionScore,
    faceDetected,
    beginCalibration,
    endCalibration,
  };
}
