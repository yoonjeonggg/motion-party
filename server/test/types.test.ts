import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { effectivePower, isRoomMode, opposite, perSideCapacity, roomCapacity, type Player } from '../src/types.js';

describe('types helpers', () => {
  it('isRoomMode accepts only the known modes', () => {
    for (const mode of ['1v1', '2v2', '4v4']) assert.ok(isRoomMode(mode));
    for (const value of ['3v3', '1V1', '', null, undefined, 1, ['1v1'], {}]) assert.equal(isRoomMode(value), false);
  });

  it('opposite flips the side', () => {
    assert.equal(opposite('A'), 'B');
    assert.equal(opposite('B'), 'A');
  });

  it('capacities match the mode', () => {
    assert.deepEqual([perSideCapacity('1v1'), perSideCapacity('2v2'), perSideCapacity('4v4')], [1, 2, 4]);
    assert.deepEqual([roomCapacity('1v1'), roomCapacity('2v2'), roomCapacity('4v4')], [2, 4, 8]);
  });

  it('effectivePower scales motion by the expression bonus', () => {
    const player = { motionScore: 0.5, expressionScore: 0.4 } as Player;
    assert.ok(Math.abs(effectivePower(player) - 0.7) < 1e-9);
    assert.equal(effectivePower({ motionScore: 0, expressionScore: 1 } as Player), 0);
  });
});
