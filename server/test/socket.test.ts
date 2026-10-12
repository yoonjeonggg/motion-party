import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleGraceExpired } from '../src/socketHandlers.js';
import { findRoomByPlayerId, getRoom, resetRoomToLobby } from '../src/roomManager.js';
import { noEvent, once, settle, stopLoops, useSocketServer, type Session } from './helpers.js';

const server = useSocketServer();
const { client, create, createAndJoin } = server;

describe('room:create', () => {
  it('normalizes invalid mode/gameType/nickname', async () => {
    const session = await create(await client(), { nickname: 'x'.repeat(100), mode: '99v99', gameType: 'nope' });
    assert.equal(session.mode, '1v1');
    assert.equal(session.gameType, 'tug_of_war');
    assert.ok(getRoom(session.roomId)!.players[0]!.nickname.length <= 12);
  });

  it('survives a room:create with no payload at all', async () => {
    const c = await client();
    const created = once<Session>(c, 'room:created');
    c.emit('room:create');
    const session = await created;
    assert.equal(getRoom(session.roomId)!.players[0]!.nickname, '방장');
  });

  for (const [label, payload] of [
    ['a string', 'hello'],
    ['a number', 42],
    ['an array', ['nickname', 'x']],
    ['null', null],
  ] as const) {
    it(`treats ${label} payload as empty and falls back to defaults`, async () => {
      const c = await client();
      const created = once<Session>(c, 'room:created');
      c.emit('room:create', payload);
      const session = await created;
      assert.equal(session.mode, '1v1');
      assert.equal(session.gameType, 'tug_of_war');
    });
  }

  it('falls back to the default nickname for a whitespace-only or non-string nickname', async () => {
    const a = await create(await client(), { nickname: '    ' });
    const b = await create(await client(), { nickname: { evil: true } });
    assert.equal(getRoom(a.roomId)!.players[0]!.nickname, '방장');
    assert.equal(getRoom(b.roomId)!.players[0]!.nickname, '방장');
  });

  it('rejects prototype keys as gameType', async () => {
    const session = await create(await client(), { gameType: '__proto__' });
    assert.equal(session.gameType, 'tug_of_war');
  });

  it('leaves the previous room when the same socket creates another one', async () => {
    const c = await client();
    const first = await create(c, { nickname: 'a', gameType: 'tug_of_war' });
    await create(c, { nickname: 'a', gameType: 'tug_of_war' });
    assert.equal(getRoom(first.roomId), undefined);
  });
});

describe('room:join', () => {
  it('answers a malformed code with a join error instead of silence', async () => {
    const c = await client();
    const err = once<{ reason: string }>(c, 'room:join_error');
    c.emit('room:join', { code: 12345 });
    assert.equal((await err).reason, 'NOT_FOUND');
  });

  it('answers a missing payload with NOT_FOUND', async () => {
    const c = await client();
    const err = once<{ reason: string }>(c, 'room:join_error');
    c.emit('room:join');
    assert.equal((await err).reason, 'NOT_FOUND');
  });

  it('accepts a room code with surrounding whitespace / lowercase', async () => {
    const { code } = await create(await client(), { nickname: 'h', gameType: 'tug_of_war' });
    const guest = await client();
    const joined = once<Session>(guest, 'room:joined');
    guest.emit('room:join', { code: `  ${code.toLowerCase()} `, nickname: 'g' });
    assert.equal((await joined).code, code);
  });

  it('rejects joining a match that already started', async () => {
    const { hostSession } = await createAndJoin();
    const late = await client();
    const err = once<{ reason: string }>(late, 'room:join_error');
    late.emit('room:join', { code: hostSession.code, nickname: 'late' });
    assert.equal((await err).reason, 'ALREADY_STARTED');
  });

  it('resends the session instead of adding a duplicate seat when re-joining its own room', async () => {
    const host = await client();
    const session = await create(host, { mode: '2v2' });
    const again = once<Session>(host, 'room:joined');
    host.emit('room:join', { code: session.code });
    assert.equal((await again).playerId, session.playerId);
    assert.equal(getRoom(session.roomId)!.players.length, 1);
  });

  it('keeps the current room when a join attempt with a typo fails', async () => {
    const host = await client();
    const session = await create(host, { mode: '2v2' });
    const err = once(host, 'room:join_error');
    host.emit('room:join', { code: 'ZZZZZZ' });
    await err;
    assert.equal(getRoom(session.roomId)!.players.length, 1);
  });

  it('moves a player out of their old room once a join to another room succeeds', async () => {
    const a = await client();
    const roomA = await create(a, { mode: '2v2' });
    const roomB = await create(await client(), { mode: '2v2' });
    const joined = once<Session>(a, 'room:joined');
    a.emit('room:join', { code: roomB.code, nickname: 'mover' });
    await joined;
    assert.equal(getRoom(roomA.roomId), undefined, 'the old room emptied and was destroyed');
    assert.equal(getRoom(roomB.roomId)!.players.length, 2);
  });
});

describe('input:power', () => {
  it('ignores non-finite motion scores', async () => {
    const { host, hostSession, room } = await createAndJoin();
    stopLoops(room);
    const { roomId, playerId } = hostSession;
    host.emit('input:power', { roomId, playerId, motionScore: 'abc' });
    host.emit('input:power', { roomId, playerId, motionScore: null, expressionScore: {} });
    host.emit('input:power', { roomId, playerId, motionScore: Infinity, expressionScore: NaN });
    await settle();
    const player = findRoomByPlayerId(roomId, playerId)!.player;
    assert.equal(player.motionScore, 0);
    assert.equal(player.expressionScore, 0);
  });

  it('clamps scores into [0, 1]', async () => {
    const { host, hostSession, room } = await createAndJoin();
    stopLoops(room);
    const { roomId, playerId } = hostSession;
    host.emit('input:power', { roomId, playerId, motionScore: 5, expressionScore: -3 });
    await settle();
    const player = findRoomByPlayerId(roomId, playerId)!.player;
    assert.equal(player.motionScore, 1);
    assert.equal(player.expressionScore, 0);
  });

  it('rejects input sent for another player from a different socket', async () => {
    const { guest, hostSession, room } = await createAndJoin();
    stopLoops(room);
    guest.emit('input:power', { roomId: hostSession.roomId, playerId: hostSession.playerId, motionScore: 1 });
    await settle();
    assert.equal(findRoomByPlayerId(hostSession.roomId, hostSession.playerId)!.player.motionScore, 0);
  });

  it('ignores input for an unknown room or with non-string ids', async () => {
    const { host, hostSession, room } = await createAndJoin();
    stopLoops(room);
    host.emit('input:power', { roomId: 'nope', playerId: hostSession.playerId, motionScore: 1 });
    host.emit('input:power', { roomId: [hostSession.roomId], playerId: hostSession.playerId, motionScore: 1 });
    await settle();
    assert.equal(findRoomByPlayerId(hostSession.roomId, hostSession.playerId)!.player.motionScore, 0);
  });
});

describe('calibration:submit', () => {
  it('starts the match once every player has calibrated', async () => {
    const host = await client();
    const hostSession = await create(host, { gameType: 'tug_of_war' });
    const guest = await client();
    const joined = once<Session>(guest, 'room:joined');
    guest.emit('room:join', { code: hostSession.code });
    const guestSession = await joined;
    const room = getRoom(hostSession.roomId)!;
    assert.equal(room.status, 'CALIBRATING');

    const started = once(host, 'game:start');
    host.emit('calibration:submit', { roomId: hostSession.roomId, playerId: hostSession.playerId, baseline: 0 });
    guest.emit('calibration:submit', { roomId: guestSession.roomId, playerId: guestSession.playerId, baseline: 0 });
    await started;
    assert.equal(room.status, 'PLAYING');
    stopLoops(room);
  });

  it('ignores a submit claiming to be another player', async () => {
    const host = await client();
    const hostSession = await create(host, { gameType: 'tug_of_war' });
    const guest = await client();
    const joined = once(guest, 'room:joined');
    guest.emit('room:join', { code: hostSession.code });
    await joined;
    guest.emit('calibration:submit', { roomId: hostSession.roomId, playerId: hostSession.playerId });
    await settle();
    assert.equal(getRoom(hostSession.roomId)!.players[0]!.calibrated, false);
  });

  it('does not restart the round on a late submit mid-match', async () => {
    const { host, hostSession, room } = await createAndJoin();
    stopLoops(room);
    host.emit('calibration:submit', { roomId: hostSession.roomId, playerId: hostSession.playerId, baseline: 0 });
    await settle();
    assert.equal(room.roundNumber, 1);
    assert.equal(room.status, 'PLAYING');
    stopLoops(room);
  });
});

describe('room:rematch', () => {
  it('is ignored while a match is still running', async () => {
    const { host, hostSession, room } = await createAndJoin();
    stopLoops(room);
    room.roundWins = { A: 1, B: 0 };
    host.emit('room:rematch', { roomId: hostSession.roomId });
    await settle();
    assert.deepEqual(room.roundWins, { A: 1, B: 0 });
    assert.equal(room.roundNumber, 1);
    stopLoops(room);
  });

  it('is ignored for a room the socket is not in', async () => {
    const { host, room } = await createAndJoin();
    stopLoops(room);
    room.status = 'MATCH_RESULT';
    room.roundWins = { A: 2, B: 0 };
    host.emit('room:rematch', { roomId: 'some-other-room' });
    await settle();
    assert.deepEqual(room.roundWins, { A: 2, B: 0 });
  });

  it('resets a finished match and starts a fresh one', async () => {
    const { host, hostSession, room } = await createAndJoin();
    stopLoops(room);
    room.status = 'MATCH_RESULT';
    room.roundWins = { A: 2, B: 1 };
    room.roundNumber = 3;
    const started = once<{ roundNumber: number }>(host, 'game:start');
    host.emit('room:rematch', { roomId: hostSession.roomId });
    assert.equal((await started).roundNumber, 1);
    assert.deepEqual(room.roundWins, { A: 0, B: 0 });
    stopLoops(room);
  });
});

describe('disconnect and reconnect', () => {
  it('drops a player who leaves before the match and reopens the room', async () => {
    const host = await client();
    const session = await create(host, { mode: '2v2' });
    const guest = await client();
    const seen = once(host, 'room:player_joined');
    guest.emit('room:join', { code: session.code });
    await seen;

    const roster = once<{ players: unknown[]; status: string }>(host, 'room:player_joined');
    guest.disconnect();
    const update = await roster;
    assert.equal(update.players.length, 1);
    assert.equal(update.status, 'LOBBY');
  });

  it('destroys a lobby room when its last player leaves', async () => {
    const host = await client();
    const session = await create(host);
    host.disconnect();
    await settle();
    assert.equal(getRoom(session.roomId), undefined);
  });

  it('tells the remaining players the room is paused and who dropped', async () => {
    const { host, guest, guestSession, room } = await createAndJoin();
    stopLoops(room);
    const roster = new Promise<{ status: string; players: { id: string; connectionStatus: string }[] }>((resolve) =>
      host.on('room:player_joined', (p) => p.status === 'PAUSED' && resolve(p)),
    );
    const dropped = once<{ playerId: string; side: string }>(host, 'player:disconnect');
    guest.disconnect();
    assert.equal((await dropped).playerId, guestSession.playerId);
    const paused = await roster;
    assert.equal(paused.players.find((p) => p.id === guestSession.playerId)?.connectionStatus, 'DISCONNECTED');
  });

  it('resumes a paused round when the dropped player reconnects', async () => {
    const { guest, guestSession, room } = await createAndJoin();
    stopLoops(room);
    guest.disconnect();
    await settle();
    assert.equal(room.status, 'PAUSED');
    assert.ok(room.disconnectTimers[guestSession.playerId], 'a grace timer is running');

    const back = await client();
    const ack = once(back, 'player:reconnect');
    back.emit('player:reconnect', { roomId: guestSession.roomId, playerId: guestSession.playerId });
    await ack;
    assert.equal(room.status, 'PLAYING');
    assert.equal(room.disconnectTimers[guestSession.playerId], undefined, 'the grace timer was cancelled');
    stopLoops(room);
  });

  it('stays paused until every dropped player is back', async () => {
    const host = await client();
    const hostSession = await create(host, { mode: '2v2', gameType: 'freeze_tag' });
    const guests = [];
    for (let i = 0; i < 3; i++) {
      const g = await client();
      const joined = once<Session>(g, 'room:joined');
      g.emit('room:join', { code: hostSession.code });
      guests.push({ socket: g, session: await joined });
    }
    const room = getRoom(hostSession.roomId)!;
    await settle();
    stopLoops(room);
    assert.equal(room.status, 'PLAYING');

    guests[0]!.socket.disconnect();
    guests[1]!.socket.disconnect();
    await settle();
    assert.equal(room.status, 'PAUSED');

    const back = await client();
    const ack = once(back, 'player:reconnect');
    back.emit('player:reconnect', { roomId: room.id, playerId: guests[0]!.session.playerId });
    await ack;
    assert.equal(room.status, 'PAUSED', 'one teammate is still missing');
  });

  it('answers a reconnect for an unknown session with an error', async () => {
    const c = await client();
    const err = once<{ reason: string }>(c, 'player:reconnect_error');
    c.emit('player:reconnect', { roomId: 'nope', playerId: 'nope' });
    assert.equal((await err).reason, 'NOT_FOUND');
  });

  it('answers a reconnect with non-string ids with an error', async () => {
    const c = await client();
    const err = once<{ reason: string }>(c, 'player:reconnect_error');
    c.emit('player:reconnect', { roomId: 1, playerId: { $ne: null } });
    assert.equal((await err).reason, 'NOT_FOUND');
  });
});

describe('handleGraceExpired', () => {
  it('removes forfeited players so a rematch does not start with a ghost', async () => {
    const { guest, guestSession, room } = await createAndJoin();
    stopLoops(room);
    guest.disconnect();
    await settle();
    const ghost = room.players.find((p) => p.id === guestSession.playerId)!;
    clearTimeout(room.disconnectTimers[ghost.id]);

    handleGraceExpired(server.io(), room, ghost);
    assert.equal(room.status, 'MATCH_RESULT');
    assert.equal(room.players.length, 1);

    resetRoomToLobby(room);
    assert.equal(room.status, 'LOBBY');
  });

  it('awards the match to the side that stayed', async () => {
    const { host, guest, guestSession, room } = await createAndJoin();
    stopLoops(room);
    const matchEnd = once<{ winner: string; reason: string }>(host, 'game:match_end');
    guest.disconnect();
    await settle();
    const ghost = room.players.find((p) => p.id === guestSession.playerId)!;
    clearTimeout(room.disconnectTimers[ghost.id]);
    handleGraceExpired(server.io(), room, ghost);
    assert.deepEqual(await matchEnd, { winner: 'A', finalScores: { A: 0, B: 0 }, reason: 'DISCONNECT' });
  });

  it('destroys the room when everyone has dropped', async () => {
    const { host, guest, hostSession, room } = await createAndJoin();
    stopLoops(room);
    host.disconnect();
    guest.disconnect();
    await settle();
    for (const t of Object.values(room.disconnectTimers)) clearTimeout(t);
    handleGraceExpired(server.io(), room, room.players[0]!);
    assert.equal(getRoom(hostSession.roomId), undefined);
  });

  it('does nothing if the room is no longer paused', async () => {
    const { host, guest, guestSession, room } = await createAndJoin();
    stopLoops(room);
    guest.disconnect();
    await settle();
    const ghost = room.players.find((p) => p.id === guestSession.playerId)!;
    clearTimeout(room.disconnectTimers[ghost.id]);
    room.status = 'PLAYING';
    const silent = noEvent(host, 'game:match_end');
    handleGraceExpired(server.io(), room, ghost);
    assert.ok(await silent);
    assert.equal(room.players.length, 2);
  });

  it('does nothing if the player already reconnected', async () => {
    const { guest, guestSession, room } = await createAndJoin();
    stopLoops(room);
    guest.disconnect();
    await settle();
    const ghost = room.players.find((p) => p.id === guestSession.playerId)!;
    clearTimeout(room.disconnectTimers[ghost.id]);
    ghost.connectionStatus = 'CONNECTED';
    handleGraceExpired(server.io(), room, ghost);
    assert.equal(room.status, 'PAUSED');
  });
});

describe('robustness', () => {
  it('keeps serving after a burst of garbage on every event', async () => {
    const c = await client();
    for (const event of ['room:create', 'room:join', 'input:power', 'calibration:submit', 'player:reconnect', 'room:rematch']) {
      for (const payload of [undefined, null, 0, 'x', [], { roomId: {}, playerId: [] }]) c.emit(event, payload);
    }
    await settle(100);
    const session = await create(await client(), { nickname: 'still-alive' });
    assert.equal(getRoom(session.roomId)!.players[0]!.nickname, 'still-alive');
  });
});
