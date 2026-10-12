import { act } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Replaces requestAnimationFrame with a queue the test drains one frame at a time, so rAF-driven
 * loops (camera inference, tutorial practice) advance deterministically. Undone by vi.unstubAllGlobals().
 */
export function installManualRaf() {
  let queue = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  let clock = performance.now();

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.set(++nextId, cb);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));

  return {
    /** Callbacks waiting for the next frame. */
    pending: () => queue.size,
    /** Runs `count` frames, `stepMs` apart. */
    frame(count = 1, stepMs = 100) {
      for (let i = 0; i < count; i++) {
        clock += stepMs;
        const callbacks = [...queue.values()];
        queue = new Map();
        act(() => callbacks.forEach((cb) => cb(clock)));
      }
    },
  };
}
