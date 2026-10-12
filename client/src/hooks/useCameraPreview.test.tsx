import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireCamera, releaseCamera } from '../lib/camera';
import { useCameraPreview } from './useCameraPreview';

vi.mock('../lib/camera', () => ({ acquireCamera: vi.fn(), releaseCamera: vi.fn() }));

const stream = { id: 'stream' } as unknown as MediaStream;

function Preview({ active = true }: { active?: boolean }) {
  const { videoRef, state } = useCameraPreview(active);
  return (
    <>
      <video ref={videoRef} data-testid="video" />
      <p>{state}</p>
    </>
  );
}

beforeEach(() => {
  vi.mocked(acquireCamera).mockReset();
  vi.mocked(releaseCamera).mockReset();
});

describe('useCameraPreview', () => {
  it('attaches the shared stream and reports READY', async () => {
    vi.mocked(acquireCamera).mockResolvedValue(stream);
    render(<Preview />);
    expect(screen.getByText('LOADING')).toBeInTheDocument();
    await screen.findByText('READY');
    expect((screen.getByTestId('video') as HTMLVideoElement).srcObject).toBe(stream);
  });

  it('reports UNAVAILABLE when the camera is denied, without releasing a hold it never got', async () => {
    vi.mocked(acquireCamera).mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    const { unmount } = render(<Preview />);
    await screen.findByText('UNAVAILABLE');
    unmount();
    expect(releaseCamera).not.toHaveBeenCalled();
  });

  it('releases its hold and detaches the video on unmount', async () => {
    vi.mocked(acquireCamera).mockResolvedValue(stream);
    const { unmount } = render(<Preview />);
    await screen.findByText('READY');
    const video = screen.getByTestId('video') as HTMLVideoElement;
    unmount();
    expect(releaseCamera).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  it('gives the camera straight back if it unmounted before the camera came up', async () => {
    let resolve!: (s: MediaStream) => void;
    vi.mocked(acquireCamera).mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = render(<Preview />);
    unmount();
    resolve(stream);
    await waitFor(() => expect(releaseCamera).toHaveBeenCalledTimes(1));
  });

  it('does not touch the camera while inactive', () => {
    render(<Preview active={false} />);
    expect(acquireCamera).not.toHaveBeenCalled();
    expect(screen.getByText('LOADING')).toBeInTheDocument();
  });
});
