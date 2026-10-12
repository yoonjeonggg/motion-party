import { describe, expect, it } from 'vitest';
import {
  GAME_LABELS,
  GAME_TYPES,
  isTugStyleGame,
  MODE_LABELS,
  opposite,
  perSideCapacity,
  ROOM_MODES,
  roomCapacity,
} from './types';

describe('types helpers', () => {
  it('opposite flips the side', () => {
    expect(opposite('A')).toBe('B');
    expect(opposite('B')).toBe('A');
  });

  it('capacities match the mode (mirrors the server)', () => {
    expect(ROOM_MODES.map(perSideCapacity)).toEqual([1, 2, 4]);
    expect(ROOM_MODES.map(roomCapacity)).toEqual([2, 4, 8]);
  });

  it('only tug-of-war and arm-wrestle are tug-style', () => {
    expect(GAME_TYPES.filter(isTugStyleGame)).toEqual(['tug_of_war', 'arm_wrestle']);
  });

  it('every mode and game has a label', () => {
    for (const mode of ROOM_MODES) expect(MODE_LABELS[mode]).toBeTruthy();
    for (const game of GAME_TYPES) expect(GAME_LABELS[game]).toBeTruthy();
  });
});
