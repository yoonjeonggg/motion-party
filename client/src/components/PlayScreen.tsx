import { useEffect, useRef, useState } from 'react';
import { useInputSender } from '../hooks/useInputSender';
import { useMotionCapture } from '../hooks/useMotionCapture';
import { isExpressionEnabled } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import { GAME_LABELS, opposite } from '../types';
import { PlayLayout } from './PlayLayout';
import { Gauge } from './ui/Gauge';
import { RopeTrack } from './ui/RopeTrack';

/** Tunable: minimum expression score before a frame is worth capturing as a highlight. */
const HIGHLIGHT_MIN_SCORE = 0.3;
/**
 * JPEG-encoding a frame blocks the main thread for several ms, and a rising grimace beats
 * the previous best on almost every face frame - so capture at most this often.
 */
const HIGHLIGHT_CAPTURE_INTERVAL_MS = 500;

let captureCanvas: HTMLCanvasElement | null = null;

function captureFrame(video: HTMLVideoElement): string | null {
  const canvas = (captureCanvas ??= document.createElement('canvas'));
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Shared play screen for the "push a position toward your side" games (tug-of-war, arm-wrestle). */
export function PlayScreen() {
  const session = useGameStore((s) => s.session);
  const ropePosition = useGameStore((s) => s.ropePosition);
  const armPosition = useGameStore((s) => s.armPosition);
  const teamPower = useGameStore((s) => s.teamPower);
  const updateHighlight = useGameStore((s) => s.updateHighlight);

  // Read once per mount: it's a localStorage read, and this component re-renders every frame.
  const [expressionOn] = useState(isExpressionEnabled);
  const { videoRef, cameraState, motionScore, poseDetected, expressionScore } = useMotionCapture(true, {
    expression: expressionOn,
    bodyMovement: false,
    gesture: false,
  });
  const bestLocalHighlightRef = useRef(0);
  const lastCaptureAtRef = useRef(0);

  useInputSender(session, () => ({ motionScore, expressionScore }));

  useEffect(() => {
    if (expressionScore < HIGHLIGHT_MIN_SCORE || expressionScore <= bestLocalHighlightRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const now = performance.now();
    if (now - lastCaptureAtRef.current < HIGHLIGHT_CAPTURE_INTERVAL_MS) return;
    lastCaptureAtRef.current = now;
    bestLocalHighlightRef.current = expressionScore;
    const dataUrl = captureFrame(video);
    if (dataUrl) updateHighlight(expressionScore, dataUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expressionScore]);

  if (!session) return null;

  const position = session.gameType === 'arm_wrestle' ? armPosition : ropePosition;

  return (
    <PlayLayout
      gameLabel={GAME_LABELS[session.gameType]}
      arena={<RopeTrack position={position} mySide={session.side} />}
      videoRef={videoRef}
      poseDetected={poseDetected}
      cameraState={cameraState}
      myStats={
        <>
          <Gauge value={motionScore * (1 + expressionScore)} />
          {expressionScore >= 0.05 && (
            <p className="hint small">표정 보너스 +{Math.round(expressionScore * 100)}%</p>
          )}
        </>
      }
      opponentStats={<Gauge value={teamPower[opposite(session.side)] ?? 0} alt />}
    />
  );
}
