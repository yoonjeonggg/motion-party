import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSeenGameTutorial, markGameTutorialSeen } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import { enterRoom } from '../test/fixtures';
import { motion, resetMotion, useMotionCapture } from '../test/motionCapture';
import { installManualRaf } from '../test/raf';
import type { GameType } from '../types';
import { GameTutorial } from './GameTutorial';

vi.mock('../hooks/useMotionCapture', async (orig) => ({
  ...(await orig<object>()),
  ...(await import('../test/motionCapture')).mocks,
}));

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const proceedButton = () => screen.queryByRole('button', { name: '대기실로 이동' });

function expectProceeded(gameType: GameType) {
  expect(hasSeenGameTutorial(gameType)).toBe(true);
  expect(useGameStore.getState().screen).toBe('WAITING');
}

beforeEach(() => {
  resetMotion();
});

describe('GameTutorial: common', () => {
  it.each([
    ['tug_of_war', '줄다리기 방법'],
    ['arm_wrestle', '팔씨름 방법'],
    ['freeze_tag', '얼음땡 방법'],
    ['simon_says', '동작 따라하기 방법'],
  ] as const)('%s has its own title and can be skipped', (gameType, title) => {
    enterRoom({ gameType });
    render(<GameTutorial />);
    expect(screen.getByRole('heading')).toHaveTextContent(title);
    click('건너뛰기');
    expectProceeded(gameType);
  });

  it('only runs the tracker the demo needs', () => {
    enterRoom({ gameType: 'freeze_tag' });
    render(<GameTutorial />);
    expect(useMotionCapture).toHaveBeenCalledWith(true, {
      expression: false,
      motion: false,
      bodyMovement: true,
      gesture: false,
    });
  });

  it('makes skip prominent on a replay', () => {
    enterRoom({ gameType: 'tug_of_war' });
    markGameTutorialSeen('tug_of_war');
    render(<GameTutorial />);
    expect(screen.getByRole('button', { name: '건너뛰기' })).toHaveClass('prominent');
  });

  it.each(['DENIED', 'ERROR'] as const)('explains the rules and lets the player through with a %s camera', (cameraState) => {
    enterRoom({ gameType: 'freeze_tag' });
    motion.cameraState = cameraState;
    render(<GameTutorial />);
    expect(screen.getByText(/"얼음!"이 뜨면 완전히 멈추세요/)).toBeInTheDocument();
    click('대기실로 이동');
    expectProceeded('freeze_tag');
  });

  it('asks to reframe when no body is visible', () => {
    enterRoom();
    motion.poseDetected = false;
    render(<GameTutorial />);
    expect(screen.getByText(/카메라에 상반신이 잘 보이도록/)).toBeInTheDocument();
  });
});

describe('GameTutorial: tug-style', () => {
  it('1v1: one good pull unlocks the waiting room', () => {
    enterRoom({ gameType: 'arm_wrestle' });
    const { container, rerender } = render(<GameTutorial />);
    expect(container.querySelector('.fig-rope')).not.toBeNull();
    expect(proceedButton()).toBeNull();
    motion.motionScore = 0.55;
    rerender(<GameTutorial />);
    expect(screen.getByText(/팔을 상대 쪽 끝까지 밀어붙이면 승리/)).toBeInTheDocument();
    fireEvent.click(proceedButton()!);
    expectProceeded('arm_wrestle');
  });

  it('2v2: adds a sync practice step before the waiting room', () => {
    const raf = installManualRaf();
    enterRoom({ gameType: 'tug_of_war', mode: '2v2' });
    motion.motionScore = 0.7;
    render(<GameTutorial />);
    expect(proceedButton()).toBeNull();
    click('다음: 팀워크 연습');

    expect(screen.getByText(/팀원과 타이밍이 맞을수록/)).toBeInTheDocument();
    expect(screen.getByText('연습 팀원 파워')).toBeInTheDocument();
    raf.frame();
    expect(screen.getByText(/싱크 보너스 \+\d+%/)).toBeInTheDocument();
    expect(screen.getByText(/싱크 완벽해요/)).toBeInTheDocument();
    fireEvent.click(proceedButton()!);
    expectProceeded('tug_of_war');
  });
});

describe('GameTutorial: freeze tag', () => {
  it('runs a move/freeze cycle, flags moving while frozen, then lets the player through', () => {
    vi.useFakeTimers();
    enterRoom({ gameType: 'freeze_tag' });
    const { container, rerender } = render(<GameTutorial />);
    expect(screen.getByText('최대한 움직이세요!')).toBeInTheDocument();
    expect(container.querySelector('.demo-figure')).toHaveClass('move');

    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.getByText('얼음! 움직이면 안돼요')).toBeInTheDocument();
    expect(container.querySelector('.demo-figure')).toHaveClass('freeze');

    motion.bodyMovementScore = 0.5;
    rerender(<GameTutorial />);
    expect(screen.getByText(/앗! 움직였어요/)).toBeInTheDocument();
    expect(proceedButton()).toBeNull();

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByText(/앗! 움직였어요/)).toBeNull();
    fireEvent.click(proceedButton()!);
    expectProceeded('freeze_tag');
  });
});

describe('GameTutorial: simon says', () => {
  it('cycles through demo poses and unlocks once the player matches one', () => {
    vi.useFakeTimers();
    enterRoom({ gameType: 'simon_says' });
    const { container, rerender } = render(<GameTutorial />);
    expect(screen.getByText('지금 동작: 왼팔 들기!')).toBeInTheDocument();
    expect(container.querySelector('.demo-figure')).toHaveClass('simon-left-arm-up');

    act(() => vi.advanceTimersByTime(2_500));
    expect(screen.getByText('지금 동작: 오른팔 들기!')).toBeInTheDocument();
    expect(proceedButton()).toBeNull();

    motion.gesture = 'RIGHT_ARM_UP';
    rerender(<GameTutorial />);
    expect(screen.getByText(/이렇게 따라 하면 돼요/)).toBeInTheDocument();
    fireEvent.click(proceedButton()!);
    expectProceeded('simon_says');
  });

  it('wraps around after the last pose', () => {
    vi.useFakeTimers();
    enterRoom({ gameType: 'simon_says' });
    render(<GameTutorial />);
    // One cue at a time: each timer is scheduled by the render the previous one triggered.
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(2_500));
    expect(screen.getByText('지금 동작: 왼팔 들기!')).toBeInTheDocument();
  });
});
