import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { socket } from '../test/fakeSocket';
import { session } from '../test/fixtures';
import type { SessionInfo } from '../store/gameStore';
import { useInputSender } from './useInputSender';

vi.mock('../lib/socket', () => import('../test/fakeSocket'));

const sends = () => socket.sent('input:power') as { motionScore: number; expressionScore: number }[];

beforeEach(() => {
  socket.reset();
  vi.useFakeTimers();
});

function mount(read: () => { motionScore: number; expressionScore?: number }, s: SessionInfo | null = session()) {
  return renderHook(({ s }) => useInputSender(s, read), { initialProps: { s } });
}

describe('useInputSender', () => {
  it('sends nothing without a session', () => {
    mount(() => ({ motionScore: 1 }), null);
    vi.advanceTimersByTime(2_000);
    expect(sends()).toEqual([]);
  });

  it('streams changing values every 60ms', () => {
    let v = 0;
    mount(() => ({ motionScore: (v += 0.1), expressionScore: 0.2 }));
    vi.advanceTimersByTime(60 * 5);
    expect(sends()).toHaveLength(5);
    expect(sends()[0]).toEqual({ roomId: 'room-1', playerId: 'me', motionScore: 0.1, expressionScore: 0.2 });
  });

  it('only sends a heartbeat while the value holds still', () => {
    mount(() => ({ motionScore: 0.5 }));
    vi.advanceTimersByTime(60);
    expect(sends()).toHaveLength(1);
    vi.advanceTimersByTime(300);
    expect(sends()).toHaveLength(1);
    vi.advanceTimersByTime(1_000);
    // 400ms heartbeat, checked on the 60ms grid: ~every 420ms.
    expect(sends().length).toBeGreaterThanOrEqual(3);
    expect(sends().length).toBeLessThanOrEqual(4);
  });

  it('treats sub-0.01 jitter as unchanged', () => {
    let frame = 0;
    mount(() => ({ motionScore: frame++ % 2 ? 0.505 : 0.5 }));
    vi.advanceTimersByTime(60 * 5);
    expect(sends()).toHaveLength(1);
  });

  it('a change in expression alone is worth a packet', () => {
    let e = 0;
    mount(() => ({ motionScore: 0.5, expressionScore: (e += 0.05) }));
    vi.advanceTimersByTime(60 * 3);
    expect(sends()).toHaveLength(3);
  });

  it('always reads the latest callback without restarting', () => {
    const { rerender } = renderHook(({ score }) => useInputSender(session(), () => ({ motionScore: score })), {
      initialProps: { score: 0.1 },
    });
    vi.advanceTimersByTime(60);
    rerender({ score: 0.9 });
    vi.advanceTimersByTime(60);
    expect(sends().map((s) => s.motionScore)).toEqual([0.1, 0.9]);
  });

  it('stops on unmount and when the session goes away', () => {
    let v = 0;
    const { rerender, unmount } = mount(() => ({ motionScore: (v += 0.1) }));
    vi.advanceTimersByTime(60);
    rerender({ s: null });
    vi.advanceTimersByTime(600);
    expect(sends()).toHaveLength(1);
    unmount();
    vi.advanceTimersByTime(600);
    expect(sends()).toHaveLength(1);
  });
});
