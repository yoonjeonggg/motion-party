import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState } from 'react';
import { MotionScoreTracker } from '../lib/motionScore';

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const FRAME_INTERVAL_MS = 1000 / 30;

export type CameraState = 'IDLE' | 'REQUESTING' | 'READY' | 'DENIED' | 'ERROR';

interface UsePoseMotionScoreResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraState: CameraState;
  motionScore: number;
  poseDetected: boolean;
}

let sharedLandmarkerPromise: Promise<PoseLandmarker> | null = null;

function getLandmarker(): Promise<PoseLandmarker> {
  if (!sharedLandmarkerPromise) {
    sharedLandmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE).then((fileset) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      }),
    );
  }
  return sharedLandmarkerPromise;
}

export function usePoseMotionScore(active: boolean): UsePoseMotionScoreResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef(new MotionScoreTracker());
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const poseDetectedRef = useRef(false);

  const [cameraState, setCameraState] = useState<CameraState>('IDLE');
  const [motionScore, setMotionScore] = useState(0);
  const [poseDetected, setPoseDetected] = useState(false);

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

        const landmarker = await getLandmarker();
        if (cancelled) return;
        setCameraState('READY');
        trackerRef.current.reset();

        const loop = (time: number) => {
          if (cancelled) return;
          if (time - lastFrameTimeRef.current >= FRAME_INTERVAL_MS && video.readyState >= 2) {
            lastFrameTimeRef.current = time;
            const result = landmarker.detectForVideo(video, performance.now());
            const landmarks = result.landmarks[0] ?? null;
            const score = trackerRef.current.update(landmarks);
            setMotionScore(score);
            if (poseDetectedRef.current !== Boolean(landmarks)) {
              poseDetectedRef.current = Boolean(landmarks);
              setPoseDetected(poseDetectedRef.current);
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
  }, [active]);

  return { videoRef, cameraState, motionScore, poseDetected };
}
