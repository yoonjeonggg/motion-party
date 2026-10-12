import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type CameraModule = typeof import('./camera');

function fakeStream() {
  const track = { readyState: 'live' as 'live' | 'ended', stop: vi.fn() };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

let camera: CameraModule;
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.useFakeTimers();
  getUserMedia = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  // camera.ts keeps module-level state (the shared stream and holder count), so each test gets a fresh copy.
  vi.resetModules();
  camera = await import('./camera');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('shared camera', () => {
  it('opens the camera once for concurrent holders', async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const [a, b] = await Promise.all([camera.acquireCamera(), camera.acquireCamera()]);
    expect(a).toBe(stream);
    expect(b).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('keeps the stream through a quick release/re-acquire (screen transition)', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    await camera.acquireCamera();
    camera.releaseCamera();
    vi.advanceTimersByTime(1_000);
    await camera.acquireCamera();
    vi.advanceTimersByTime(60_000);
    expect(track.stop).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('stops the tracks once nobody has held it for the grace period', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    await camera.acquireCamera();
    await camera.acquireCamera();
    camera.releaseCamera();
    vi.advanceTimersByTime(60_000);
    expect(track.stop).not.toHaveBeenCalled();

    camera.releaseCamera();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(track.stop).toHaveBeenCalled();

    getUserMedia.mockResolvedValue(fakeStream().stream);
    await camera.acquireCamera();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('does not cache a denied request, so the next attempt asks again', async () => {
    const denied = new DOMException('denied', 'NotAllowedError');
    getUserMedia.mockRejectedValueOnce(denied);
    await expect(camera.acquireCamera()).rejects.toBe(denied);

    const { stream } = fakeStream();
    getUserMedia.mockResolvedValueOnce(stream);
    await expect(camera.acquireCamera()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('a failed acquire does not count as a holder', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('no camera'));
    await expect(camera.acquireCamera()).rejects.toThrow('no camera');

    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValueOnce(stream);
    await camera.acquireCamera();
    camera.releaseCamera();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(track.stop).toHaveBeenCalled();
  });

  it('reopens the camera if the shared track died', async () => {
    const first = fakeStream();
    const second = fakeStream();
    getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
    await camera.acquireCamera();
    first.track.readyState = 'ended';
    await expect(camera.acquireCamera()).resolves.toBe(second.stream);
  });

  it('extra releases never drive the holder count negative', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    camera.releaseCamera();
    camera.releaseCamera();
    await camera.acquireCamera();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(track.stop).not.toHaveBeenCalled();
  });
});
