import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CameraState } from '../hooks/useMotionCapture';
import { useGameStore } from '../store/gameStore';
import { enterRoom, player } from '../test/fixtures';
import { PlayLayout } from './PlayLayout';

function renderLayout({ cameraState = 'READY' as CameraState, poseDetected = true } = {}) {
  return render(
    <PlayLayout
      gameLabel="줄다리기"
      arena={<div>ARENA</div>}
      videoRef={{ current: null }}
      poseDetected={poseDetected}
      cameraState={cameraState}
      myStats={<div>MY STATS</div>}
      opponentStats={<div>OPPONENT STATS</div>}
    />,
  );
}

describe('PlayLayout', () => {
  it('renders nothing outside a session', () => {
    const { container } = renderLayout();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the game, round, slots and both players', () => {
    enterRoom({ players: [player('me', 'A', { nickname: '철수' }), player('rival', 'B', { nickname: '영희' })] });
    renderLayout();
    expect(screen.getByText(/줄다리기 · 1라운드/)).toBeInTheDocument();
    expect(screen.getByText('ARENA')).toBeInTheDocument();
    expect(screen.getByText('MY STATS')).toBeInTheDocument();
    expect(screen.getByText('OPPONENT STATS')).toBeInTheDocument();
    expect(screen.getByText('철수 (나)')).toBeInTheDocument();
    expect(screen.getByText('영희')).toBeInTheDocument();
  });

  it('reads the score as "me : opponent" even on side B', () => {
    enterRoom({ side: 'B' });
    useGameStore.setState({ roundWins: { A: 2, B: 1 }, roundNumber: 3 });
    renderLayout();
    expect(screen.getByText('나 1 : 2 상대')).toBeInTheDocument();
    expect(screen.getByText(/3라운드/)).toBeInTheDocument();
  });

  it('lists teammates next to me in team modes', () => {
    enterRoom({
      mode: '2v2',
      players: [player('me', 'A'), player('mate', 'A', { nickname: '팀원1' }), player('x', 'B'), player('y', 'B')],
    });
    renderLayout();
    expect(screen.getByText(/· 팀원1/)).toBeInTheDocument();
    expect(screen.getByText('x · y')).toBeInTheDocument();
  });

  it('names who dropped while paused', () => {
    enterRoom({ players: [player('me', 'A'), player('rival', 'B', { nickname: '영희', connectionStatus: 'DISCONNECTED' })] });
    useGameStore.setState({ status: 'PAUSED' });
    renderLayout();
    expect(screen.getByRole('status')).toHaveTextContent('상대(영희)의 연결이 끊겼어요.');
  });

  it('calls a dropped player on my side a teammate', () => {
    enterRoom({
      mode: '2v2',
      players: [player('me', 'A'), player('mate', 'A', { connectionStatus: 'DISCONNECTED' }), player('x', 'B'), player('y', 'B')],
    });
    useGameStore.setState({ status: 'PAUSED' });
    renderLayout();
    expect(screen.getByRole('status')).toHaveTextContent('팀원(mate)의');
  });

  it('has a fallback pause message when the roster has not caught up yet', () => {
    enterRoom();
    useGameStore.setState({ status: 'PAUSED' });
    renderLayout();
    expect(screen.getByRole('status')).toHaveTextContent('플레이어 연결이 끊겼어요.');
  });

  it.each(['DENIED', 'ERROR'] as const)('explains a %s camera', (cameraState) => {
    enterRoom();
    renderLayout({ cameraState });
    expect(screen.getByText(/카메라를 사용할 수 없어요/)).toBeInTheDocument();
  });

  it('asks to reframe only when the camera works but no body is visible', () => {
    enterRoom();
    const { rerender } = renderLayout({ poseDetected: false });
    expect(screen.getByText(/몸이 화면에 잘 보이도록/)).toBeInTheDocument();
    rerender(
      <PlayLayout
        gameLabel="x"
        arena={null}
        videoRef={{ current: null }}
        poseDetected={false}
        cameraState="REQUESTING"
        myStats={null}
        opponentStats={null}
      />,
    );
    expect(screen.queryByText(/몸이 화면에 잘 보이도록/)).toBeNull();
  });
});
