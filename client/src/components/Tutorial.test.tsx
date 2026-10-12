import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasOnboarded, markOnboarded } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import { motion, resetMotion } from '../test/motionCapture';
import { installManualRaf } from '../test/raf';
import { Tutorial } from './Tutorial';

vi.mock('../hooks/useMotionCapture', async (orig) => ({
  ...(await orig<object>()),
  ...(await import('../test/motionCapture')).mocks,
}));

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  resetMotion();
  useGameStore.setState({ screen: 'ONBOARDING' });
});

function expectFinished() {
  expect(hasOnboarded()).toBe(true);
  expect(useGameStore.getState().screen).toBe('LOBBY');
}

describe('Tutorial', () => {
  it('can be skipped at any point', () => {
    render(<Tutorial />);
    click('건너뛰기');
    expectFinished();
  });

  it('makes skip prominent when replayed from the lobby', () => {
    markOnboarded();
    render(<Tutorial />);
    expect(screen.getByRole('button', { name: '건너뛰기' })).toHaveClass('prominent');
  });

  it.each([
    ['DENIED', '카메라 권한이 거부되었어요.'],
    ['ERROR', '카메라를 불러오지 못했어요.'],
  ] as const)('never traps a player whose camera is %s', (cameraState, message) => {
    motion.cameraState = cameraState;
    render(<Tutorial />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText('팔을 당겨보세요!')).toBeNull();
    click('로비로 이동');
    expectFinished();
  });

  it('walks through pull -> expression -> rules -> practice', () => {
    const { rerender } = render(<Tutorial />);
    expect(screen.getByText('팔을 당겨보세요!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음' })).toBeNull();

    motion.motionScore = 0.6;
    rerender(<Tutorial />);
    expect(screen.getByText(/좋아요! 이렇게 당기면 돼요/)).toBeInTheDocument();
    // Latched: easing off doesn't take the "next" button away again.
    motion.motionScore = 0.1;
    rerender(<Tutorial />);
    click('다음');

    expect(screen.getByText('이번엔 힘든 표정도 같이 지어보세요!')).toBeInTheDocument();
    motion.expressionScore = 0.3;
    rerender(<Tutorial />);
    expect(screen.getByText('표정 보너스 +30% 💥')).toBeInTheDocument();
    click('다음');

    expect(screen.getByText(/로프를 상대 쪽 끝까지 밀면 승리/)).toBeInTheDocument();
    click('이해했어요');
    expect(screen.getByText('실전과 똑같이 연습해봐요!')).toBeInTheDocument();
  });

  it('a strong player wins the practice round and heads to the lobby', () => {
    const raf = installManualRaf();
    motion.motionScore = 1;
    motion.expressionScore = 1;
    render(<Tutorial />);
    click('다음');
    click('다음');
    click('이해했어요');

    raf.frame(5);
    expect(screen.queryByText('연습 완료!')).toBeNull();
    raf.frame(200);
    expect(screen.getByText('연습 완료!')).toBeInTheDocument();
    expect(raf.pending()).toBe(0);
    expect(screen.queryByRole('button', { name: '건너뛰기' })).toBeNull();
    click('로비로 이동');
    expectFinished();
  });

  it('asks to reframe during practice when no body is visible', () => {
    installManualRaf();
    motion.motionScore = 1;
    motion.expressionScore = 1;
    const { rerender } = render(<Tutorial />);
    click('다음');
    click('다음');
    click('이해했어요');
    motion.poseDetected = false;
    rerender(<Tutorial />);
    expect(screen.getByText('카메라 각도를 조정해주세요')).toBeInTheDocument();
  });
});
