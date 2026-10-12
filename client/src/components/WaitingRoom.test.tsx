import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraPreview } from '../hooks/useCameraPreview';
import { setExpressionEnabled } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import { socket } from '../test/fakeSocket';
import { enterRoom, player } from '../test/fixtures';
import { preloadVisionModels, resetMotion } from '../test/motionCapture';
import { WaitingRoom } from './WaitingRoom';

vi.mock('../lib/socket', () => import('../test/fakeSocket'));
vi.mock('../hooks/useMotionCapture', async (orig) => ({
  ...(await orig<object>()),
  ...(await import('../test/motionCapture')).mocks,
}));
vi.mock('../hooks/useCameraPreview', () => ({
  useCameraPreview: vi.fn(() => ({ videoRef: { current: null }, state: 'READY' })),
}));

beforeEach(() => {
  socket.reset();
  resetMotion();
});

function stubClipboard(writeText: () => Promise<void>) {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(writeText) } });
  return navigator.clipboard.writeText;
}

describe('WaitingRoom', () => {
  it('renders nothing outside a session', () => {
    expect(render(<WaitingRoom />).container).toBeEmptyDOMElement();
  });

  it('shows the room, both teams and empty seats', () => {
    enterRoom({ mode: '2v2', players: [player('me', 'A'), player('x', 'B')] });
    render(<WaitingRoom />);
    expect(screen.getByText('줄다리기 · 2:2 팀전')).toBeInTheDocument();
    expect(screen.getByText('우리 팀')).toBeInTheDocument();
    expect(screen.getByText('상대 팀')).toBeInTheDocument();
    expect(screen.getAllByText('빈 자리')).toHaveLength(2);
    expect(screen.getByText('2/4명 · 2명 더 기다리는 중...')).toBeInTheDocument();
  });

  it('marks me and anyone who dropped', () => {
    enterRoom({ players: [player('me', 'A'), player('x', 'B', { connectionStatus: 'DISCONNECTED' })] });
    render(<WaitingRoom />);
    expect(screen.getByText('나')).toBeInTheDocument();
    expect(screen.getByText('연결 끊김').closest('li')).toHaveClass('disconnected');
  });

  it('announces when everyone is in', () => {
    enterRoom();
    render(<WaitingRoom />);
    expect(screen.getByText('모두 모였어요! 곧 시작해요...')).toBeInTheDocument();
  });

  it('copies the room code and resets the caption after a moment', async () => {
    enterRoom();
    const writeText = stubClipboard(() => Promise.resolve());
    render(<WaitingRoom />);
    vi.useFakeTimers();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '방 코드 ABC234 복사' })));
    expect(writeText).toHaveBeenCalledWith('ABC234');
    expect(screen.getByText('복사되었어요!')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_500));
    expect(screen.getByText('코드를 누르면 복사돼요')).toBeInTheDocument();
  });

  it('tells the player to share the code by hand when the clipboard is unavailable', async () => {
    enterRoom();
    stubClipboard(() => Promise.reject(new Error('insecure context')));
    render(<WaitingRoom />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /방 코드/ })));
    expect(screen.getByText('복사할 수 없어요. 코드를 직접 알려주세요.')).toBeInTheDocument();
  });

  it('preloads the face model only for tug-style games with expressions on', () => {
    enterRoom({ gameType: 'tug_of_war' });
    const { unmount } = render(<WaitingRoom />);
    expect(preloadVisionModels).toHaveBeenLastCalledWith({ pose: true, face: true });
    unmount();

    setExpressionEnabled(false);
    render(<WaitingRoom />);
    expect(preloadVisionModels).toHaveBeenLastCalledWith({ pose: true, face: false });
  });

  it('does not preload the face model for freeze tag', () => {
    enterRoom({ gameType: 'freeze_tag' });
    render(<WaitingRoom />);
    expect(preloadVisionModels).toHaveBeenLastCalledWith({ pose: true, face: false });
  });

  it('warns instead of showing a preview when the camera is unavailable', () => {
    vi.mocked(useCameraPreview).mockReturnValueOnce({ videoRef: { current: null }, state: 'UNAVAILABLE' });
    enterRoom();
    render(<WaitingRoom />);
    expect(screen.getByText(/카메라를 사용할 수 없어요/)).toBeInTheDocument();
  });

  it('can leave or re-open the game tutorial', () => {
    enterRoom();
    render(<WaitingRoom />);
    fireEvent.click(screen.getByText('게임 방법 다시보기'));
    expect(useGameStore.getState().screen).toBe('GAME_TUTORIAL');
    fireEvent.click(screen.getByText('나가기'));
    expect(socket.disconnect).toHaveBeenCalled();
    expect(useGameStore.getState().session).toBeNull();
  });
});
