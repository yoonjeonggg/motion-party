import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { destroyRoom } from '../src/roomManager.js';
import { DEFAULT_GAME_TYPE, getMiniGame, isKnownGameType } from '../src/games/registry.js';
import { accumulateMotionScores, leadingSide, playersBySide } from '../src/games/miniGame.js';
import { SYNC_MAX_BONUS } from '../src/games/tugStyle.js';
import type { Room, RoomMode } from '../src/types.js';
import { fullRoom } from './helpers.js';

const rooms: Room[] = [];
afterEach(() => {
  for (const room of rooms.splice(0)) destroyRoom(room.id);
});

/** A full room with its round freshly reset, ready to tick. */
function roomFor(gameType: string, mode: RoomMode = '1v1'): Room {
  const room = fullRoom(gameType, mode);
  rooms.push(room);
  room.roundStartedAt = Date.now();
  getMiniGame(gameType).resetRound(room);
  return room;
}

function tickUntilEnd(gameType: string, room: Room, maxTicks = 1000) {
  const game = getMiniGame(gameType);
  let result = game.tick(room);
  for (let i = 0; i < maxTicks && !result.ended; i++) result = game.tick(room);
  return result;
}

describe('registry', () => {
  it('knows every shipped game', () => {
    for (const id of ['tug_of_war', 'arm_wrestle', 'freeze_tag', 'simon_says']) {
      assert.ok(isKnownGameType(id));
      assert.equal(getMiniGame(id).id, id);
    }
  });

  it('rejects unknown ids, prototype keys and non-strings', () => {
    for (const value of ['nope', '__proto__', 'constructor', 'toString', '', 1, null, undefined, {}]) {
      assert.equal(isKnownGameType(value), false, String(value));
    }
  });

  it('falls back to the default game for unknown ids', () => {
    assert.equal(getMiniGame('nope').id, DEFAULT_GAME_TYPE);
    assert.equal(getMiniGame('__proto__').id, DEFAULT_GAME_TYPE);
  });

  it('only the tug-style games score expressions', () => {
    assert.ok(getMiniGame('tug_of_war').usesExpression);
    assert.ok(getMiniGame('arm_wrestle').usesExpression);
    assert.ok(!getMiniGame('freeze_tag').usesExpression);
    assert.ok(!getMiniGame('simon_says').usesExpression);
  });
});

describe('miniGame helpers', () => {
  it('leadingSide gives ties to A', () => {
    assert.equal(leadingSide({ A: 1, B: 1 }), 'A');
    assert.equal(leadingSide({ A: 1, B: 2 }), 'B');
  });

  it('accumulates each side’s motion into its own total', () => {
    const room = roomFor('freeze_tag', '2v2');
    for (const p of playersBySide(room, 'A')) p.motionScore = 0.5;
    for (const p of playersBySide(room, 'B')) p.motionScore = 0.25;
    const totals = { A: 1, B: 0 };
    accumulateMotionScores(room, totals);
    assert.deepEqual(totals, { A: 2, B: 0.5 });
  });
});

describe('tug of war / arm wrestle', () => {
  it('the stronger side eventually pulls the rope over', () => {
    const room = roomFor('tug_of_war');
    room.players[0]!.motionScore = 1;
    assert.deepEqual(tickUntilEnd('tug_of_war', room), { ended: true, winner: 'A' });
  });

  it('side B can win by pulling the other way', () => {
    const room = roomFor('tug_of_war');
    room.players[1]!.motionScore = 1;
    assert.deepEqual(tickUntilEnd('tug_of_war', room), { ended: true, winner: 'B' });
    assert.equal(getMiniGame('tug_of_war').broadcastPayload(room).ropePosition, -1, 'position is clamped');
  });

  it('expression boosts power', () => {
    const plain = roomFor('tug_of_war');
    const boosted = roomFor('tug_of_war');
    plain.players[0]!.motionScore = 0.5;
    boosted.players[0]!.motionScore = 0.5;
    boosted.players[0]!.expressionScore = 1;
    getMiniGame('tug_of_war').tick(plain);
    getMiniGame('tug_of_war').tick(boosted);
    const pos = (r: Room) => getMiniGame('tug_of_war').broadcastPayload(r).ropePosition as number;
    assert.ok(Math.abs(pos(boosted) - 2 * pos(plain)) < 1e-9);
  });

  it('time-up awards the side with more accumulated power', () => {
    const room = roomFor('tug_of_war');
    room.players[1]!.motionScore = 0.1;
    getMiniGame('tug_of_war').tick(room);
    room.roundStartedAt = Date.now() - 60_000;
    room.players[1]!.motionScore = 0;
    assert.deepEqual(getMiniGame('tug_of_war').tick(room), { ended: true, winner: 'B' });
  });

  it('a dead-even time-up goes to side A', () => {
    const room = roomFor('tug_of_war');
    room.roundStartedAt = Date.now() - 60_000;
    assert.deepEqual(getMiniGame('tug_of_war').tick(room), { ended: true, winner: 'A' });
  });

  it('teammates in perfect sync get the full sync bonus', () => {
    const room = roomFor('tug_of_war', '2v2');
    for (const p of playersBySide(room, 'A')) p.motionScore = 0.5;
    getMiniGame('tug_of_war').tick(room);
    const { teamPower } = getMiniGame('tug_of_war').broadcastPayload(room) as { teamPower: { A: number; B: number } };
    assert.ok(Math.abs(teamPower.A - 1 * (1 + SYNC_MAX_BONUS)) < 1e-9);
    assert.equal(teamPower.B, 0);
  });

  it('a fully out-of-sync team gets no bonus', () => {
    const room = roomFor('tug_of_war', '2v2');
    const [a1, a2] = playersBySide(room, 'A');
    a1!.motionScore = 1;
    a2!.motionScore = 0;
    getMiniGame('tug_of_war').tick(room);
    const { teamPower } = getMiniGame('tug_of_war').broadcastPayload(room) as { teamPower: { A: number } };
    assert.equal(teamPower.A, 1);
  });

  it('arm wrestle broadcasts armPosition and ends sooner than tug of war', () => {
    const arm = roomFor('arm_wrestle');
    const tug = roomFor('tug_of_war');
    arm.players[0]!.motionScore = 1;
    tug.players[0]!.motionScore = 1;
    let armTicks = 0;
    let tugTicks = 0;
    while (!getMiniGame('arm_wrestle').tick(arm).ended) armTicks++;
    while (!getMiniGame('tug_of_war').tick(tug).ended) tugTicks++;
    assert.ok(armTicks < tugTicks);
    const payload = getMiniGame('arm_wrestle').broadcastPayload(arm);
    assert.equal(payload.armPosition, 1);
    assert.equal('ropePosition' in payload, false);
  });

  it('a fresh round resets the position', () => {
    const room = roomFor('tug_of_war');
    room.players[0]!.motionScore = 1;
    tickUntilEnd('tug_of_war', room);
    getMiniGame('tug_of_war').resetRound(room);
    assert.equal(getMiniGame('tug_of_war').broadcastPayload(room).ropePosition, 0);
  });
});

describe('freeze tag', () => {
  type State = { phase: string; phaseEndsAt: number; moveScore: { A: number; B: number } };

  it('moving during FREEZE loses the round', () => {
    const room = roomFor('freeze_tag');
    (room.gameState as State).phase = 'FREEZE';
    room.players[0]!.motionScore = 0.5;
    assert.deepEqual(getMiniGame('freeze_tag').tick(room), { ended: true, winner: 'B' });
  });

  it('small jitter under the threshold during FREEZE is forgiven', () => {
    const room = roomFor('freeze_tag');
    (room.gameState as State).phase = 'FREEZE';
    room.players[0]!.motionScore = 0.05;
    assert.deepEqual(getMiniGame('freeze_tag').tick(room), { ended: false });
  });

  it('alternates MOVE -> FREEZE -> MOVE as phases expire', () => {
    const room = roomFor('freeze_tag');
    const state = room.gameState as State;
    state.phaseEndsAt = Date.now() - 1;
    getMiniGame('freeze_tag').tick(room);
    assert.equal(state.phase, 'FREEZE');
    state.phaseEndsAt = Date.now() - 1;
    getMiniGame('freeze_tag').tick(room);
    assert.equal(state.phase, 'MOVE');
  });

  it('accumulates movement only during MOVE', () => {
    const room = roomFor('freeze_tag');
    room.players[0]!.motionScore = 0.1;
    getMiniGame('freeze_tag').tick(room);
    assert.equal((room.gameState as State).moveScore.A, 0.1);
  });

  it('time-up awards the side that moved more', () => {
    const room = roomFor('freeze_tag');
    (room.gameState as State).moveScore = { A: 1, B: 3 };
    room.roundStartedAt = Date.now() - 60_000;
    assert.deepEqual(getMiniGame('freeze_tag').tick(room), { ended: true, winner: 'B' });
  });

  it('never broadcasts negative remaining time, and shiftDeadlines pushes the phase back', () => {
    const room = roomFor('freeze_tag');
    const state = room.gameState as State;
    state.phaseEndsAt = Date.now() - 5_000;
    assert.equal(getMiniGame('freeze_tag').broadcastPayload(room).phaseRemainingMs, 0);
    getMiniGame('freeze_tag').shiftDeadlines!(room, 10_000);
    assert.ok((getMiniGame('freeze_tag').broadcastPayload(room).phaseRemainingMs as number) > 4_000);
  });
});

describe('simon says', () => {
  type State = { cue: string; cueEndsAt: number; score: { A: number; B: number } };
  const CUES = /^(LEFT_ARM_UP|RIGHT_ARM_UP|BOTH_ARMS_UP|ARMS_OUT)$/;

  it('broadcast always carries a valid cue', () => {
    const room = roomFor('simon_says');
    assert.match(String(getMiniGame('simon_says').broadcastPayload(room).cue), CUES);
  });

  it('rotates to a different cue when the current one expires', () => {
    const room = roomFor('simon_says');
    const state = room.gameState as State;
    for (let i = 0; i < 50; i++) {
      const before = state.cue;
      state.cueEndsAt = Date.now() - 1;
      getMiniGame('simon_says').tick(room);
      assert.notEqual(state.cue, before);
      assert.match(state.cue, CUES);
    }
  });

  it('scores the side whose players match the cue, and awards it at time-up', () => {
    const room = roomFor('simon_says');
    room.players[1]!.motionScore = 1;
    getMiniGame('simon_says').tick(room);
    assert.deepEqual((room.gameState as State).score, { A: 0, B: 1 });
    room.roundStartedAt = Date.now() - 60_000;
    assert.deepEqual(getMiniGame('simon_says').tick(room), { ended: true, winner: 'B' });
  });

  it('shiftDeadlines pushes the cue deadline back', () => {
    const room = roomFor('simon_says');
    const before = (room.gameState as State).cueEndsAt;
    getMiniGame('simon_says').shiftDeadlines!(room, 1_234);
    assert.equal((room.gameState as State).cueEndsAt, before + 1_234);
  });
});
