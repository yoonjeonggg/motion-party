import { describe, expect, it } from 'vitest';
import type { PublicPlayer, Side } from '../types';
import { joinNicknames, sideLabel, splitTeams } from './teams';

const player = (id: string, side: Side): PublicPlayer => ({
  id,
  nickname: id,
  side,
  connectionStatus: 'CONNECTED',
  calibrated: false,
});

const roster = [player('me', 'B'), player('mate', 'B'), player('op1', 'A'), player('op2', 'A')];

describe('teams', () => {
  it('joins nicknames with a middle dot', () => {
    expect(joinNicknames(roster.slice(0, 2))).toBe('me · mate');
    expect(joinNicknames([])).toBe('');
  });

  it('labels a side by its members, falling back to the side letter', () => {
    expect(sideLabel(roster, 'A')).toBe('op1 · op2');
    expect(sideLabel([], 'B')).toBe('B');
  });

  it('splits the roster from my point of view', () => {
    const split = splitTeams(roster, { playerId: 'me', side: 'B' });
    expect(split.mySide).toBe('B');
    expect(split.opponentSide).toBe('A');
    expect(split.me?.id).toBe('me');
    expect(split.teammates.map((p) => p.id)).toEqual(['mate']);
    expect(split.opponents.map((p) => p.id)).toEqual(['op1', 'op2']);
  });

  it('copes with my own entry missing from the roster', () => {
    const split = splitTeams([player('op1', 'A')], { playerId: 'me', side: 'B' });
    expect(split.me).toBeUndefined();
    expect(split.teammates).toEqual([]);
  });
});
