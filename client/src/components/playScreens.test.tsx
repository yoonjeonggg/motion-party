import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setExpressionEnabled } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import { socket } from '../test/fakeSocket';
import { enterRoom } from '../test/fixtures';
import { motion, resetMotion, useMotionCapture } from '../test/motionCapture';
import { FreezeTagPlayScreen } from './FreezeTagPlayScreen';
import { PlayScreen } from './PlayScreen';
import { SimonSaysPlayScreen } from './SimonSaysPlayScreen';

vi.mock('../lib/socket', () => import('../test/fakeSocket'));
vi.mock('../hooks/useMotionCapture', async (orig) => ({
  ...(await orig<object>()),
  ...(await import('../test/motionCapture')).mocks,
}));

const fills = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('.gauge-fill')].map((el) => el.style.width);
const markerAt = (container: HTMLElement) =>
  Number(/([\d.]+) \*/.exec(container.querySelector<HTMLElement>('.rope-marker')!.style.left)?.[1]);
const inputs = () => socket.sent('input:power') as { motionScore: number; expressionScore: number }[];

beforeEach(() => {
  socket.reset();
  resetMotion();
});

describe('PlayScreen (tug-style)', () => {
  it('renders nothing outside a session', () => {
    expect(render(<PlayScreen />).container).toBeEmptyDOMElement();
  });

  it('draws the rope for tug of war and the arm position for arm wrestle', () => {
    enterRoom({ gameType: 'tug_of_war' });
    useGameStore.setState({ ropePosition: 0.5, armPosition: -0.5 });
    const tug = render(<PlayScreen />);
    expect(screen.getByText(/줄다리기 · /)).toBeInTheDocument();
    expect(markerAt(tug.container)).toBe(0.75);
    tug.unmount();

    enterRoom({ gameType: 'arm_wrestle' });
    const arm = render(<PlayScreen />);
    expect(screen.getByText(/팔씨름 · /)).toBeInTheDocument();
    expect(markerAt(arm.container)).toBe(0.25);
  });

  it('flips the rope for a side-B player', () => {
    enterRoom({ side: 'B' });
    useGameStore.setState({ ropePosition: -1 });
    expect(markerAt(render(<PlayScreen />).container)).toBe(1);
  });

  it('shows my boosted power, the expression bonus and the opponent team power', () => {
    enterRoom();
    motion.motionScore = 0.5;
    motion.expressionScore = 0.4;
    useGameStore.setState({ teamPower: { A: 0, B: 0.3 } });
    const { container } = render(<PlayScreen />);
    expect(fills(container)).toEqual(['70%', '30%']);
    expect(screen.getByText('표정 보너스 +40%')).toBeInTheDocument();
  });

  it('hides a negligible expression bonus', () => {
    enterRoom();
    motion.expressionScore = 0.04;
    render(<PlayScreen />);
    expect(screen.queryByText(/표정 보너스/)).toBeNull();
  });

  it('streams motion and expression to the server', () => {
    vi.useFakeTimers();
    enterRoom();
    motion.motionScore = 0.6;
    motion.expressionScore = 0.2;
    render(<PlayScreen />);
    act(() => vi.advanceTimersByTime(60));
    expect(inputs()).toEqual([{ roomId: 'room-1', playerId: 'me', motionScore: 0.6, expressionScore: 0.2 }]);
  });

  it('turns face tracking off for motion-only players', () => {
    setExpressionEnabled(false);
    enterRoom();
    render(<PlayScreen />);
    expect(useMotionCapture).toHaveBeenCalledWith(true, { expression: false, bodyMovement: false, gesture: false });
  });

  describe('highlight capture', () => {
    function stubCanvas() {
      const drawImage = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => `frame-${drawImage.mock.calls.length}`);
      return drawImage;
    }

    it('captures the strongest grimace, at most every 500ms', () => {
      vi.useFakeTimers();
      stubCanvas();
      enterRoom();
      // Fake timers start performance.now() at 0; in a real page it's long past the throttle window.
      act(() => vi.advanceTimersByTime(1_000));
      const { rerender } = render(<PlayScreen />);
      const grimace = (score: number) => {
        motion.expressionScore = score;
        rerender(<PlayScreen />);
      };

      grimace(0.2);
      expect(useGameStore.getState().highlight).toBeNull();

      grimace(0.5);
      expect(useGameStore.getState().highlight).toEqual({ score: 0.5, dataUrl: 'frame-1' });

      grimace(0.7);
      expect(useGameStore.getState().highlight?.score).toBe(0.5);

      act(() => vi.advanceTimersByTime(500));
      grimace(0.8);
      expect(useGameStore.getState().highlight).toEqual({ score: 0.8, dataUrl: 'frame-2' });

      act(() => vi.advanceTimersByTime(500));
      grimace(0.6);
      expect(useGameStore.getState().highlight?.score).toBe(0.8);
    });
  });
});

describe('FreezeTagPlayScreen', () => {
  it('shows the move phase with its countdown and both team scores', () => {
    enterRoom({ gameType: 'freeze_tag' });
    useGameStore.setState({ phase: 'MOVE', phaseRemainingMs: 3_200, teamPower: { A: 12.34, B: 5 } });
    render(<FreezeTagPlayScreen />);
    expect(screen.getByText('최대한 움직이세요! (4초)')).toHaveClass('move');
    expect(screen.getByText('누적 점수 12.3')).toBeInTheDocument();
    expect(screen.getByText('누적 점수 5.0')).toBeInTheDocument();
  });

  it('warns during the freeze phase and colors my movement gauge as a warning', () => {
    enterRoom({ gameType: 'freeze_tag' });
    useGameStore.setState({ phase: 'FREEZE', phaseRemainingMs: 900 });
    motion.bodyMovementScore = 0.3;
    const { container } = render(<FreezeTagPlayScreen />);
    expect(screen.getByText('얼음! 움직이면 져요 (1초)')).toHaveClass('freeze');
    expect(container.querySelector('.gauge-fill')).toHaveClass('opponent');
  });

  it('sends whole-body movement as the motion score', () => {
    vi.useFakeTimers();
    enterRoom({ gameType: 'freeze_tag' });
    motion.bodyMovementScore = 0.42;
    motion.motionScore = 0.99;
    render(<FreezeTagPlayScreen />);
    act(() => vi.advanceTimersByTime(60));
    expect(inputs()[0]).toMatchObject({ motionScore: 0.42, expressionScore: 0 });
    expect(useMotionCapture).toHaveBeenCalledWith(true, { expression: false, motion: false, gesture: false });
  });
});

describe('SimonSaysPlayScreen', () => {
  it('shows the cue and my current pose', () => {
    enterRoom({ gameType: 'simon_says' });
    useGameStore.setState({ cue: 'BOTH_ARMS_UP', cueRemainingMs: 1_500 });
    motion.gesture = 'LEFT_ARM_UP';
    render(<SimonSaysPlayScreen />);
    expect(screen.getByText('지금 동작: 만세! (2초)')).toHaveClass('freeze');
    expect(screen.getByText('내 동작: 왼팔 들기')).toBeInTheDocument();
  });

  it('celebrates a match', () => {
    enterRoom({ gameType: 'simon_says' });
    useGameStore.setState({ cue: 'ARMS_OUT' });
    motion.gesture = 'ARMS_OUT';
    render(<SimonSaysPlayScreen />);
    expect(screen.getByText('일치! 👍')).toBeInTheDocument();
    expect(screen.getByText(/지금 동작: 양팔 벌리기/)).toHaveClass('move');
  });

  it('shows a placeholder before the first cue arrives, or for an unknown one', () => {
    enterRoom({ gameType: 'simon_says' });
    useGameStore.setState({ cue: 'toString' });
    render(<SimonSaysPlayScreen />);
    expect(screen.getByText(/지금 동작: \.\.\./)).toBeInTheDocument();
  });

  it('sends a smoothed match score that rises while matching and falls otherwise', () => {
    vi.useFakeTimers();
    enterRoom({ gameType: 'simon_says' });
    useGameStore.setState({ cue: 'LEFT_ARM_UP' });
    motion.gesture = 'LEFT_ARM_UP';
    const { rerender } = render(<SimonSaysPlayScreen />);
    act(() => vi.advanceTimersByTime(60 * 10));
    const peak = inputs().at(-1)!.motionScore;
    expect(peak).toBeGreaterThan(0.9);

    motion.gesture = 'REST';
    rerender(<SimonSaysPlayScreen />);
    act(() => vi.advanceTimersByTime(60 * 3));
    expect(inputs().at(-1)!.motionScore).toBeLessThan(peak);
  });

  it('never scores before a cue arrived', () => {
    vi.useFakeTimers();
    enterRoom({ gameType: 'simon_says' });
    motion.gesture = 'REST';
    render(<SimonSaysPlayScreen />);
    act(() => vi.advanceTimersByTime(600));
    expect(inputs().every((i) => i.motionScore === 0)).toBe(true);
  });
});
