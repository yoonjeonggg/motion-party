import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraPreview } from '../hooks/useCameraPreview';
import { setExpressionEnabled } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import { socket } from '../test/fakeSocket';
import { enterRoom, player } from '../test/fixtures';
import { beginCalibration, endCalibration, motion, resetMotion, useMotionCapture } from '../test/motionCapture';
import { Calibration } from './Calibration';

vi.mock('../lib/socket', () => import('../test/fakeSocket'));
vi.mock('../hooks/useMotionCapture', async (orig) => ({
  ...(await orig<object>()),
  ...(await import('../test/motionCapture')).mocks,
}));
vi.mock('../hooks/useCameraPreview', () => ({
  useCameraPreview: vi.fn(() => ({ videoRef: { current: null }, state: 'READY' })),
}));

const CAPTURE_MS = 3_000;

beforeEach(() => {
  socket.reset();
  resetMotion();
  vi.mocked(useCameraPreview).mockClear();
  enterRoom({ players: [player('me', 'A'), player('rival', 'B', { calibrated: true })] });
  vi.useFakeTimers();
});

function capture(ms = CAPTURE_MS) {
  act(() => vi.advanceTimersByTime(ms));
}

describe('Calibration with expressions on', () => {
  it('captures a neutral face for 3s and submits the baseline', () => {
    motion.baseline = 0.12;
    render(<Calibration />);
    expect(beginCalibration).toHaveBeenCalledTimes(1);
    expect(screen.getByText('편안한 표정을 유지해주세요')).toBeInTheDocument();
    capture(1_500);
    expect(socket.sent('calibration:submit')).toEqual([]);
    capture(1_500);
    expect(endCalibration).toHaveBeenCalledTimes(1);
    expect(socket.sent('calibration:submit')).toEqual([{ roomId: 'room-1', playerId: 'me', baseline: 0.12 }]);
    expect(screen.getByText('캘리브레이션 완료!')).toBeInTheDocument();
    expect(screen.getByText(/1\/2명 준비 완료/)).toBeInTheDocument();
  });

  it('fills the progress bar as it captures', () => {
    const { container } = render(<Calibration />);
    capture(1_500);
    expect(container.querySelector<HTMLElement>('.gauge-fill')!.style.width).toBe('50%');
  });

  it('waits for the camera before capturing', () => {
    motion.cameraState = 'REQUESTING';
    const { rerender } = render(<Calibration />);
    capture();
    expect(beginCalibration).not.toHaveBeenCalled();
    motion.cameraState = 'READY';
    rerender(<Calibration />);
    expect(beginCalibration).toHaveBeenCalledTimes(1);
  });

  it('asks to retry when no face was seen, without submitting', () => {
    motion.faceDetected = false;
    render(<Calibration />);
    expect(screen.getByText(/얼굴이 잘 보이도록/)).toBeInTheDocument();
    capture();
    expect(screen.getByText(/얼굴을 인식하지 못했어요/)).toBeInTheDocument();
    expect(socket.sent('calibration:submit')).toEqual([]);
  });

  it('a retry with the face now in view succeeds', () => {
    motion.faceDetected = false;
    const { rerender } = render(<Calibration />);
    capture();

    // The player fixes the camera angle while the retry prompt is up, then presses retry.
    motion.faceDetected = true;
    rerender(<Calibration />);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(beginCalibration).toHaveBeenCalledTimes(2);
    capture();
    expect(screen.getByText('캘리브레이션 완료!')).toBeInTheDocument();
    expect(socket.sent('calibration:submit')).toHaveLength(1);
  });

  it('can skip after a failed attempt with a neutral baseline', () => {
    motion.faceDetected = false;
    render(<Calibration />);
    capture();
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(socket.sent('calibration:submit')).toEqual([{ roomId: 'room-1', playerId: 'me', baseline: 0 }]);
  });

  it.each([
    ['DENIED', '카메라 권한이 거부되었어요.'],
    ['ERROR', '카메라를 불러오지 못했어요.'],
  ] as const)('offers to continue without expressions when the camera is %s', (cameraState, message) => {
    motion.cameraState = cameraState;
    render(<Calibration />);
    expect(screen.getByText(message)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '표정 없이 진행' }));
    expect(socket.sent('calibration:submit')).toEqual([{ roomId: 'room-1', playerId: 'me', baseline: 0 }]);
    expect(screen.queryByText(message)).toBeNull();
  });

  it('does not hold an extra camera preview (useMotionCapture already has it)', () => {
    render(<Calibration />);
    expect(useMotionCapture).toHaveBeenCalledWith(true, { pose: false });
    expect(useCameraPreview).toHaveBeenCalledWith(false);
  });
});

describe('Calibration with expressions off', () => {
  beforeEach(() => setExpressionEnabled(false));

  it('submits a zero baseline once, right away, and keeps the camera warm', () => {
    const { rerender } = render(<Calibration />);
    rerender(<Calibration />);
    expect(socket.sent('calibration:submit')).toEqual([{ roomId: 'room-1', playerId: 'me', baseline: 0 }]);
    expect(useMotionCapture).toHaveBeenCalledWith(false, { pose: false });
    expect(useCameraPreview).toHaveBeenCalledWith(true);
    expect(beginCalibration).not.toHaveBeenCalled();
    expect(screen.getByText(/표정 인식을 껐어요/)).toBeInTheDocument();
  });
});

it('renders nothing outside a session', () => {
  useGameStore.setState({ session: null });
  expect(render(<Calibration />).container).toBeEmptyDOMElement();
});
