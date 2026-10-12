import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { useGameStore } from '../store/gameStore';

// jsdom has no media pipeline: play() is unimplemented and a <video> never gets past HAVE_NOTHING.
HTMLMediaElement.prototype.play = () => Promise.resolve();
Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });

const initialStore = useGameStore.getState();

afterEach(() => {
  cleanup();
  useGameStore.setState(initialStore, true);
  try {
    localStorage.clear();
  } catch {
    // A test stubbed localStorage with something that throws.
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
