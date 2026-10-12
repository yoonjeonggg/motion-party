import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  forfeitToRemainingPlayer,
  isPausable,
  pauseForDisconnect,
  resumeAfterReconnect,
  tryStartMatch,
} from '../src/gameLoop.js';
import { createRoom, destroyRoom } from '../src/roomManager.js';
import { ROUND_RESULT_DELAY_MS, TICK_RATE_MS, type Room } from '../src/types.js';
import { fakeIo, fullRoom } from './helpers.js';

const rooms: Room[] = [];
function track(room: Room): Room {
  rooms.push(room);
  return room;
}

/** A READY room whose players keep "sending" input for the whole test. */
function readyRoom(gameType: string): Room {
  const room = track(fullRoom(gameType));
  room.status = 'READY';
  for (const p of room.players) p.lastInputAt = Number.MAX_SAFE_INTEGER;
  return room;
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_000_000 });
});

afterEach(() => {
  for (const room of rooms.splice(0)) destroyRoom(room.id);
  mock.timers.reset();
});

describe('tryStartMatch', () => {
  it('starts round 1 for a full READY room and begins ticking', () => {
    const { io, named } = fakeIo();
    const room = readyRoom('freeze_tag');
    tryStartMatch(io, room);
    assert.equal(room.status, 'PLAYING');
    assert.equal(room.roundNumber, 1);
    assert.deepEqual(named('game:start')[0]?.payload, { roomId: room.id, mode: '1v1', roundNumber: 1 });

    mock.timers.tick(TICK_RATE_MS * 3);
    const states = named('game:state');
    assert.ok(states.length >= 3);
    assert.equal(states.at(-1)!.payload.status, 'PLAYING');
    assert.equal(states.at(-1)!.payload.phase, 'MOVE');
  });

  for (const status of ['LOBBY', 'CALIBRATING', 'PLAYING', 'PAUSED', 'MATCH_RESULT'] as const) {
    it(`does nothing while ${status}`, () => {
      const { io, events } = fakeIo();
      const room = readyRoom('freeze_tag');
      room.status = status;
      tryStartMatch(io, room);
      assert.equal(events.length, 0);
      assert.equal(room.loopHandle, null);
    });
  }

  it('does nothing for a READY room that is not full', () => {
    const { io, events } = fakeIo();
    const { room } = createRoom('solo', 'solo');
    track(room).status = 'READY';
    tryStartMatch(io, room);
    assert.equal(events.length, 0);
  });
});

describe('round and match flow', () => {
  it('plays rounds until one side has 2 wins', () => {
    const { io, named } = fakeIo();
    const room = readyRoom('tug_of_war');
    room.players[0]!.motionScore = 1;
    tryStartMatch(io, room);

    mock.timers.tick(5_000);
    assert.equal(room.status, 'ROUND_RESULT');
    assert.deepEqual(named('game:round_end')[0]?.payload, { winner: 'A', roundNumber: 1, scores: { A: 1, B: 0 } });
    assert.equal(room.loopHandle, null, 'the tick loop stops between rounds');

    mock.timers.tick(ROUND_RESULT_DELAY_MS);
    assert.equal(room.status, 'PLAYING');
    assert.equal(room.roundNumber, 2);

    mock.timers.tick(5_000);
    assert.equal(room.status, 'MATCH_RESULT');
    assert.deepEqual(named('game:match_end')[0]?.payload, {
      winner: 'A',
      finalScores: { A: 2, B: 0 },
      reason: 'ROUND_WINS',
    });

    mock.timers.tick(ROUND_RESULT_DELAY_MS * 2);
    assert.equal(named('game:start').length, 2, 'no third round after the match ended');
  });

  it('keeps the loop alive when a tick throws', () => {
    const { io, named } = fakeIo();
    const room = readyRoom('tug_of_war');
    tryStartMatch(io, room);
    const goodState = room.gameState;
    room.gameState = null;
    mock.timers.tick(TICK_RATE_MS * 3);
    assert.equal(named('game:state').length, 0);
    assert.notEqual(room.loopHandle, null);

    room.gameState = goodState;
    mock.timers.tick(TICK_RATE_MS);
    assert.equal(named('game:state').length, 1);
  });

  it('skips the scheduled next round if the room left ROUND_RESULT meanwhile', () => {
    const { io, named } = fakeIo();
    const room = readyRoom('tug_of_war');
    room.players[0]!.motionScore = 1;
    tryStartMatch(io, room);
    mock.timers.tick(5_000);
    assert.equal(room.status, 'ROUND_RESULT');
    room.status = 'LOBBY';
    mock.timers.tick(ROUND_RESULT_DELAY_MS);
    assert.equal(named('game:start').length, 1);
  });
});

describe('pause and resume', () => {
  it('only PLAYING and ROUND_RESULT are pausable', () => {
    assert.ok(isPausable('PLAYING'));
    assert.ok(isPausable('ROUND_RESULT'));
    for (const s of ['LOBBY', 'CALIBRATING', 'READY', 'PAUSED', 'MATCH_RESULT'] as const) assert.ok(!isPausable(s));
  });

  it('freezes the round and resumes it with the same time left', () => {
    const { io, named } = fakeIo();
    const room = readyRoom('freeze_tag');
    tryStartMatch(io, room);
    mock.timers.tick(1_000);
    const startedAt = room.roundStartedAt;
    const phaseEndsAt = (room.gameState as { phaseEndsAt: number }).phaseEndsAt;

    pauseForDisconnect(room);
    assert.equal(room.status, 'PAUSED');
    assert.deepEqual(room.pause, { at: 1_001_000, resumeTo: 'PLAYING' });
    const statesBefore = named('game:state').length;
    mock.timers.tick(10_000);
    assert.equal(named('game:state').length, statesBefore, 'no ticks while paused');

    resumeAfterReconnect(io, room);
    assert.equal(room.status, 'PLAYING');
    assert.equal(room.pause, null);
    assert.equal(room.roundStartedAt, startedAt + 10_000);
    assert.equal((room.gameState as { phaseEndsAt: number }).phaseEndsAt, phaseEndsAt + 10_000);
    mock.timers.tick(TICK_RATE_MS);
    assert.ok(named('game:state').length > statesBefore);
  });

  it('goes back to the between-rounds break when paused during ROUND_RESULT', () => {
    const { io, named } = fakeIo();
    const room = readyRoom('tug_of_war');
    room.players[0]!.motionScore = 1;
    tryStartMatch(io, room);
    mock.timers.tick(5_000);
    assert.equal(room.status, 'ROUND_RESULT');

    pauseForDisconnect(room);
    mock.timers.tick(ROUND_RESULT_DELAY_MS * 2);
    assert.equal(named('game:start').length, 1, 'the next round waits for the reconnect');

    resumeAfterReconnect(io, room);
    assert.equal(room.status, 'ROUND_RESULT');
    mock.timers.tick(ROUND_RESULT_DELAY_MS);
    assert.equal(room.status, 'PLAYING');
    assert.equal(room.roundNumber, 2);
  });

  it('keeps the pause target when a second player drops mid-pause', () => {
    const room = track(fullRoom('freeze_tag'));
    room.status = 'ROUND_RESULT';
    pauseForDisconnect(room);
    mock.timers.tick(500);
    pauseForDisconnect(room);
    assert.deepEqual(room.pause, { at: 1_000_000, resumeTo: 'ROUND_RESULT' });
  });

  it('resumes as PLAYING even without a recorded pause', () => {
    const { io } = fakeIo();
    const room = readyRoom('freeze_tag');
    tryStartMatch(io, room);
    room.status = 'PAUSED';
    room.pause = null;
    assert.doesNotThrow(() => resumeAfterReconnect(io, room));
    assert.equal(room.status, 'PLAYING');
  });
});

describe('forfeitToRemainingPlayer', () => {
  it('ends the match for the side that stayed', () => {
    const { io, named } = fakeIo();
    const room = readyRoom('freeze_tag');
    tryStartMatch(io, room);
    pauseForDisconnect(room);
    forfeitToRemainingPlayer(io, room, 'A');
    assert.equal(room.status, 'MATCH_RESULT');
    assert.equal(room.pause, null);
    assert.deepEqual(named('game:match_end')[0]?.payload, {
      winner: 'B',
      finalScores: { A: 0, B: 0 },
      reason: 'DISCONNECT',
    });
  });
});
