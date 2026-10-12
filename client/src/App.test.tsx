import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { markGameTutorialSeen } from './lib/preferences';
import { useGameStore, type Screen } from './store/gameStore';
import { socket } from './test/fakeSocket';
import { enterRoom } from './test/fixtures';
import { resetMotion } from './test/motionCapture';
import type { GameType } from './types';

vi.mock('./lib/socket', () => import('./test/fakeSocket'));
vi.mock('./hooks/useMotionCapture', async (orig) => ({
  ...(await orig<object>()),
  ...(await import('./test/motionCapture')).mocks,
}));
vi.mock('./hooks/useCameraPreview', () => ({
  useCameraPreview: vi.fn(() => ({ videoRef: { current: null }, state: 'READY' })),
}));

beforeEach(() => {
  socket.reset();
  resetMotion();
});

function show(screenName: Screen, gameType: GameType = 'tug_of_war') {
  enterRoom({ gameType });
  markGameTutorialSeen(gameType);
  useGameStore.setState({
    screen: screenName,
    lastRoundEnd: { winner: 'A', roundNumber: 1, scores: { A: 1, B: 0 } },
    matchEnd: { winner: 'A', finalScores: { A: 2, B: 0 }, reason: 'ROUND_WINS' },
  });
  render(<App />);
}

describe('App routing', () => {
  it.each([
    ['ONBOARDING', '팔을 당겨보세요!'],
    ['LOBBY', '방 만들기'],
    ['WAITING', '대기실'],
    ['GAME_TUTORIAL', '줄다리기 방법'],
    ['CALIBRATING', '표정 캘리브레이션'],
    ['ROUND_RESULT', '1라운드 종료'],
    ['MATCH_RESULT', '매치 종료'],
  ] as const)('%s shows its screen', (screenName, text) => {
    show(screenName);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each([
    ['tug_of_war', /줄다리기 · 1라운드/],
    ['arm_wrestle', /팔씨름 · 1라운드/],
    ['freeze_tag', /얼음땡 · 1라운드/],
    ['simon_says', /동작 따라하기 · 1라운드/],
  ] as const)('PLAYING picks the %s play screen', (gameType, label) => {
    show('PLAYING', gameType);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('detours into the game tutorial the first time a game type is played', () => {
    enterRoom({ gameType: 'freeze_tag' });
    useGameStore.setState({ screen: 'WAITING' });
    render(<App />);
    expect(useGameStore.getState().screen).toBe('GAME_TUTORIAL');
    expect(screen.getByText('얼음땡 방법')).toBeInTheDocument();
  });

  it('goes straight to the waiting room once the tutorial was seen', () => {
    show('WAITING', 'freeze_tag');
    expect(useGameStore.getState().screen).toBe('WAITING');
  });

  it('wires the socket on mount', () => {
    show('LOBBY');
    expect(socket.listenerCount('game:state')).toBe(1);
  });
});
