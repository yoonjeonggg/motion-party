import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom,
  decayStaleInputs,
  destroyRoom,
  findRoomByPlayerId,
  findRoomBySocketId,
  getRoom,
  isRoomFull,
  joinRoom,
  markCalibrated,
  normalizeRoomCode,
  removePlayer,
  resetRoomToLobby,
  stopRoundTimers,
  toPublicPlayers,
} from '../src/roomManager.js';
import { INPUT_STALE_MS } from '../src/types.js';
import { fullRoom } from './helpers.js';

const uid = () => Math.random().toString(36).slice(2);

describe('createRoom', () => {
  it('seats the host on side A with a 6-char unambiguous code', () => {
    const { room, player } = createRoom(uid(), 'host');
    assert.equal(player.side, 'A');
    assert.equal(room.status, 'LOBBY');
    assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
    destroyRoom(room.id);
  });

  it('never hands out the same code twice', () => {
    const rooms = Array.from({ length: 200 }, () => createRoom(uid(), 'h').room);
    assert.equal(new Set(rooms.map((r) => r.code)).size, rooms.length);
    for (const r of rooms) destroyRoom(r.id);
  });
});

describe('joinRoom', () => {
  it('balances sides in 2v2 and rejects a fifth player', () => {
    const { room } = createRoom(uid(), 'p0', '2v2', 'freeze_tag');
    for (let i = 1; i < 4; i++) assert.ok(joinRoom(room.code, uid(), `p${i}`).ok);
    assert.deepEqual(room.players.map((p) => p.side).sort(), ['A', 'A', 'B', 'B']);
    assert.equal(joinRoom(room.code, uid(), 'p5').ok, false);
    destroyRoom(room.id);
  });

  it('alternates sides in 4v4', () => {
    const room = fullRoom('freeze_tag', '4v4');
    assert.deepEqual(room.players.map((p) => p.side), ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B']);
    destroyRoom(room.id);
  });

  it('refills the side a leaver vacated', () => {
    const { room } = createRoom(uid(), 'a', '2v2', 'freeze_tag');
    const b = joinRoom(room.code, uid(), 'b');
    joinRoom(room.code, uid(), 'c');
    assert.ok(b.ok);
    removePlayer(room, b.player.id);
    const refill = joinRoom(room.code, uid(), 'd');
    assert.ok(refill.ok);
    assert.equal(refill.player.side, 'B');
    destroyRoom(room.id);
  });

  it('moves a full room to CALIBRATING for expression games and READY otherwise', () => {
    const tug = fullRoom('tug_of_war');
    const freeze = fullRoom('freeze_tag');
    assert.equal(tug.status, 'CALIBRATING');
    assert.equal(freeze.status, 'READY');
    destroyRoom(tug.id);
    destroyRoom(freeze.id);
  });

  for (const code of [undefined, null, 123, {}, ['ABCDEF'], '', 'NOPE00']) {
    it(`reports NOT_FOUND for code ${JSON.stringify(code)}`, () => {
      assert.deepEqual(joinRoom(code, uid(), 'x'), { ok: false, reason: 'NOT_FOUND' });
    });
  }

  it('reports ALREADY_STARTED once the room left the lobby', () => {
    const { room } = createRoom(uid(), 'h', '2v2');
    room.status = 'PLAYING';
    assert.deepEqual(joinRoom(room.code, uid(), 'x'), { ok: false, reason: 'ALREADY_STARTED' });
    destroyRoom(room.id);
  });

  it('reports FULL for a full room that is somehow still in the lobby', () => {
    const room = fullRoom('freeze_tag');
    room.status = 'LOBBY';
    assert.deepEqual(joinRoom(room.code, uid(), 'x'), { ok: false, reason: 'FULL' });
    destroyRoom(room.id);
  });
});

describe('normalizeRoomCode', () => {
  it('trims and uppercases strings, rejects everything else', () => {
    assert.equal(normalizeRoomCode('  abc123 '), 'ABC123');
    assert.equal(normalizeRoomCode(123), null);
    assert.equal(normalizeRoomCode(undefined), null);
  });
});

describe('markCalibrated', () => {
  it('only marks a room READY via calibration while CALIBRATING', () => {
    const { room, player } = createRoom(uid(), 'p0', '1v1', 'tug_of_war');
    const res = joinRoom(room.code, uid(), 'p1');
    assert.ok(res.ok);
    assert.equal(room.status, 'CALIBRATING');
    assert.equal(markCalibrated(room, player.id), false);
    assert.equal(room.status, 'CALIBRATING');
    assert.ok(markCalibrated(room, res.player.id));
    assert.equal(room.status, 'READY');
    destroyRoom(room.id);
  });

  it('returns false for an unknown player and changes nothing', () => {
    const room = fullRoom('tug_of_war');
    assert.equal(markCalibrated(room, 'ghost'), false);
    assert.ok(room.players.every((p) => !p.calibrated));
    destroyRoom(room.id);
  });

  it('never completes in a room that is not full', () => {
    const { room, player } = createRoom(uid(), 'solo', '1v1', 'tug_of_war');
    room.status = 'CALIBRATING';
    assert.equal(markCalibrated(room, player.id), false);
    destroyRoom(room.id);
  });
});

describe('lookups', () => {
  it('finds a room by socket id and by player id', () => {
    const socketId = uid();
    const { room, player } = createRoom(socketId, 'h');
    assert.equal(findRoomBySocketId(socketId)?.player, player);
    assert.equal(findRoomByPlayerId(room.id, player.id)?.room, room);
    assert.equal(findRoomBySocketId('missing'), undefined);
    assert.equal(findRoomByPlayerId(room.id, 'missing'), undefined);
    assert.equal(findRoomByPlayerId('missing', player.id), undefined);
    destroyRoom(room.id);
  });

  it('treats non-string ids as not found', () => {
    const { room, player } = createRoom(uid(), 'h');
    assert.equal(findRoomByPlayerId(room.id, { toString: () => player.id }), undefined);
    assert.equal(findRoomByPlayerId(undefined, player.id), undefined);
    destroyRoom(room.id);
  });

  it('exposes only public fields in the roster', () => {
    const room = fullRoom('freeze_tag');
    for (const p of toPublicPlayers(room)) {
      assert.deepEqual(Object.keys(p).sort(), ['calibrated', 'connectionStatus', 'id', 'nickname', 'side']);
    }
    destroyRoom(room.id);
  });
});

describe('removePlayer / destroyRoom', () => {
  it('cancels the removed player’s grace timer', () => {
    const room = fullRoom('freeze_tag');
    const victim = room.players[1]!;
    let fired = false;
    room.disconnectTimers[victim.id] = setTimeout(() => (fired = true), 10);
    removePlayer(room, victim.id);
    assert.equal(room.disconnectTimers[victim.id], undefined);
    assert.equal(isRoomFull(room), false);
    destroyRoom(room.id);
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        assert.equal(fired, false);
        resolve();
      }, 30),
    );
  });

  it('frees the code and clears every timer', () => {
    const room = fullRoom('freeze_tag');
    room.loopHandle = setInterval(() => assert.fail('loop survived destroy'), 5);
    room.disconnectTimers[room.players[0]!.id] = setTimeout(() => assert.fail('grace timer survived destroy'), 5);
    destroyRoom(room.id);
    assert.equal(getRoom(room.id), undefined);
    assert.equal(joinRoom(room.code, uid(), 'x').ok, false);
    assert.equal(room.loopHandle, null);
    assert.deepEqual(room.disconnectTimers, {});
    return new Promise<void>((resolve) => setTimeout(resolve, 20));
  });

  it('is a no-op for an unknown room', () => {
    assert.doesNotThrow(() => destroyRoom('nope'));
  });

  it('stopRoundTimers is safe to call twice', () => {
    const room = fullRoom('freeze_tag');
    room.loopHandle = setInterval(() => {}, 1000);
    room.roundResultTimeout = setTimeout(() => {}, 1000);
    stopRoundTimers(room);
    stopRoundTimers(room);
    assert.equal(room.loopHandle, null);
    assert.equal(room.roundResultTimeout, null);
    destroyRoom(room.id);
  });
});

describe('decayStaleInputs', () => {
  it('zeroes inputs that stopped arriving', () => {
    const { room, player } = createRoom(uid(), 'p0');
    player.motionScore = 0.9;
    player.expressionScore = 0.5;
    player.lastInputAt = Date.now() - INPUT_STALE_MS - 1;
    decayStaleInputs(room, Date.now());
    assert.equal(player.motionScore, 0);
    assert.equal(player.expressionScore, 0);
    destroyRoom(room.id);
  });

  it('keeps fresh inputs', () => {
    const { room, player } = createRoom(uid(), 'p0');
    player.motionScore = 0.9;
    player.lastInputAt = Date.now();
    decayStaleInputs(room, Date.now() + INPUT_STALE_MS);
    assert.equal(player.motionScore, 0.9);
    destroyRoom(room.id);
  });
});

describe('resetRoomToLobby', () => {
  it('clears scores and calibration, and re-enters the pre-match flow when full', () => {
    const room = fullRoom('tug_of_war');
    room.status = 'MATCH_RESULT';
    room.roundNumber = 3;
    room.roundWins = { A: 2, B: 1 };
    room.pause = { at: 1, resumeTo: 'PLAYING' };
    for (const p of room.players) Object.assign(p, { calibrated: true, motionScore: 1, expressionScore: 1 });

    resetRoomToLobby(room);
    assert.equal(room.status, 'CALIBRATING');
    assert.equal(room.roundNumber, 0);
    assert.deepEqual(room.roundWins, { A: 0, B: 0 });
    assert.equal(room.pause, null);
    assert.ok(room.players.every((p) => !p.calibrated && p.motionScore === 0 && p.expressionScore === 0));
    destroyRoom(room.id);
  });

  it('goes back to LOBBY when the room is no longer full', () => {
    const { room } = createRoom(uid(), 'solo');
    room.status = 'MATCH_RESULT';
    resetRoomToLobby(room);
    assert.equal(room.status, 'LOBBY');
    destroyRoom(room.id);
  });
});
