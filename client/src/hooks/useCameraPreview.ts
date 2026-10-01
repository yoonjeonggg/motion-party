import { useEffect, useRef, useState } from 'react';
import { acquireCamera, releaseCamera } from '../lib/camera';

export type PreviewState = 'LOADING' | 'READY' | 'UNAVAILABLE';

/**
 * Holds the shared camera stream while mounted, without running any pose/face models.
 * Screens between camera-using screens (waiting room, motion-only calibration) use it so the
 * camera stays open across the whole pre-match flow, and can show a framing preview with it.
 */
export function useCameraPreview(active = true) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<PreviewState>('LOADING');

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let holding = false;
    let attachedVideo: HTMLVideoElement | null = null;

    acquireCamera()
      .then(async (stream) => {
        if (cancelled) {
          releaseCamera();
          return;
        }
        holding = true;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          attachedVideo = video;
          await video.play();
        }
        if (!cancelled) setState('READY');
      })
      .catch(() => {
        // Not fatal here: the screens that actually need the camera report the specific error.
        if (!cancelled) setState('UNAVAILABLE');
      });

    return () => {
      cancelled = true;
      if (attachedVideo) attachedVideo.srcObject = null;
      if (holding) releaseCamera();
    };
  }, [active]);

  return { videoRef, state };
}
