/**
 * One camera stream shared by every screen. Each screen used to call getUserMedia on mount and
 * stop the tracks on unmount, so every transition (tutorial -> waiting -> calibration -> play,
 * and play -> round result -> play between rounds) re-opened the camera: a visible black flash
 * plus ~0.5-2s of start-up on most devices. Screens now hold/release a shared stream instead,
 * and it's only stopped once nobody has held it for RELEASE_GRACE_MS.
 */

const CONSTRAINTS: MediaStreamConstraints = {
  // `ideal` (not exact) so phones whose front camera doesn't support 640x480
  // exactly still get a stream; facingMode picks the selfie camera on mobile.
  video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
  audio: false,
};

/** Long enough to bridge a screen transition or the 3s between-rounds result screen. */
const RELEASE_GRACE_MS = 5_000;

let streamPromise: Promise<MediaStream> | null = null;
let holders = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function isLive(stream: MediaStream): boolean {
  return stream.getVideoTracks().some((t) => t.readyState === 'live');
}

function request(): Promise<MediaStream> {
  const promise = navigator.mediaDevices.getUserMedia(CONSTRAINTS);
  streamPromise = promise;
  // A denied/failed request mustn't be cached - the next screen (or "다시 시도") asks again.
  promise.catch(() => {
    if (streamPromise === promise) streamPromise = null;
  });
  return promise;
}

/**
 * Gets the shared camera stream, opening it if needed. Every successful call must be paired
 * with exactly one releaseCamera(). Rejects like getUserMedia (NotAllowedError etc.).
 */
export async function acquireCamera(): Promise<MediaStream> {
  holders += 1;
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  try {
    const pending = streamPromise ?? request();
    const stream = await pending;
    if (isLive(stream)) return stream;
    // The track died (camera unplugged, permission revoked, OS reclaimed it): open a fresh one,
    // unless another caller already started doing so.
    return await (streamPromise === pending ? request() : (streamPromise ?? request()));
  } catch (err) {
    holders -= 1;
    throw err;
  }
}

export function releaseCamera(): void {
  holders = Math.max(0, holders - 1);
  if (holders > 0 || releaseTimer) return;
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    if (holders > 0) return;
    const pending = streamPromise;
    streamPromise = null;
    pending?.then(
      (stream) => stream.getTracks().forEach((t) => t.stop()),
      () => {},
    );
  }, RELEASE_GRACE_MS);
}
