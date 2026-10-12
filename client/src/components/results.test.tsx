import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { socket } from '../test/fakeSocket';
import { enterRoom, player } from '../test/fixtures';
import { MatchResult } from './MatchResult';
import { RoundResult } from './RoundResult';

vi.mock('../lib/socket', () => import('../test/fakeSocket'));

beforeEach(() => {
  socket.reset();
  enterRoom({ players: [player('me', 'A', { nickname: '철수' }), player('rival', 'B', { nickname: '영희' })] });
});

describe('RoundResult', () => {
  it('renders nothing before a round ended', () => {
    expect(render(<RoundResult />).container).toBeEmptyDOMElement();
  });

  it('celebrates a won round', () => {
    useGameStore.setState({ lastRoundEnd: { winner: 'A', roundNumber: 2, scores: { A: 1, B: 1 } } });
    render(<RoundResult />);
    expect(screen.getByText('2라운드 종료')).toBeInTheDocument();
    expect(screen.getByText('이번 라운드 승리! 🎉')).toBeInTheDocument();
    expect(screen.getByText('철수 승')).toBeInTheDocument();
  });

  it('marks a lost round', () => {
    useGameStore.setState({ lastRoundEnd: { winner: 'B', roundNumber: 1, scores: { A: 0, B: 1 } } });
    render(<RoundResult />);
    expect(screen.getByText('이번 라운드 패배')).toHaveClass('lose');
    expect(screen.getByText('영희 승')).toBeInTheDocument();
  });
});

describe('MatchResult', () => {
  const end = (winner: 'A' | 'B', reason: 'ROUND_WINS' | 'DISCONNECT' = 'ROUND_WINS') =>
    useGameStore.setState({ matchEnd: { winner, finalScores: { A: 2, B: 0 }, reason } });

  it('renders nothing before the match ended', () => {
    expect(render(<MatchResult />).container).toBeEmptyDOMElement();
  });

  it('shows the win and the final score', () => {
    end('A');
    render(<MatchResult />);
    expect(screen.getByText('🏆 승리!')).toBeInTheDocument();
    expect(screen.queryByText(/재접속하지 못해/)).toBeNull();
  });

  it('explains a win by forfeit', () => {
    end('A', 'DISCONNECT');
    render(<MatchResult />);
    expect(screen.getByText('상대방이 재접속하지 못해 승리로 처리되었어요.')).toBeInTheDocument();
  });

  it('explains a loss by forfeit', () => {
    end('B', 'DISCONNECT');
    render(<MatchResult />);
    expect(screen.getByText('아쉽게 패배했어요')).toBeInTheDocument();
    expect(screen.getByText(/우리 팀 플레이어가 재접속하지 못해/)).toBeInTheDocument();
  });

  it('offers the highlight frame for download', () => {
    end('A');
    useGameStore.setState({ highlight: { score: 0.8, dataUrl: 'data:image/jpeg;base64,xx' } });
    render(<MatchResult />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/jpeg;base64,xx');
    expect(screen.getByText('하이라이트 저장')).toHaveAttribute('download', 'motionparty-highlight.jpg');
  });

  it('has no highlight section without a captured frame', () => {
    end('A');
    render(<MatchResult />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('rematch asks the server and goes back to the waiting room', () => {
    end('A');
    render(<MatchResult />);
    fireEvent.click(screen.getByText('다시하기'));
    expect(socket.sent('room:rematch')).toEqual([{ roomId: 'room-1' }]);
    expect(useGameStore.getState().screen).toBe('WAITING');
    expect(useGameStore.getState().matchEnd).toBeNull();
  });

  it('leave exits the room for good', () => {
    end('A');
    render(<MatchResult />);
    fireEvent.click(screen.getByText('나가기'));
    expect(socket.disconnect).toHaveBeenCalled();
    expect(useGameStore.getState().session).toBeNull();
    expect(useGameStore.getState().screen).toBe('LOBBY');
  });
});
