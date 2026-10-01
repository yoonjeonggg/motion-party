import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { handleGraceExpired, registerSocketHandlers } from '../src/socketHandlers.js';
import {
  createRoom,
  decayStaleInputs,
  destroyRoom,
  findRoomByPlayerId,
  getRoom,
  joinRoom,
  markCalibrated,
  resetRoomToLobby,
} from '../src/roomManager.js';
import { pauseForDisconnect } from '../src/gameLoop.js';
import { getMiniGame } from '../src/games/registry.js';
import { leadingSide } from '../src/games/miniGame.js';
import { INPUT_STALE_MS, type Room } from '../src/types.js';

// ---------------------------------------------------------------------------
// Socket-level harness
// ---------------------------------------------------------------------------

let httpServer: HttpServer;
let ioServer: Server;
let url: string;
const clients: ClientSocket[] = [];
const roomIds: string[] = [];

before(async () => {
  httpServer = createServer();
  ioServer = new Server(httpServer);
  ioServer.on('connection', (socket) => registerSocketHandlers(ioServer, socket));
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await settle();
  // Drop rooms left mid-match so their 30s reconnect-grace timers don't hold the run open.
  for (const id of roomIds.splice(0)) destroyRoom(id);
});

after(async () => {
  ioServer.close();
  await new Promise((resolve) => httpServer.close(resolve));
});

async function client(): Promise<ClientSocket> {
  const c = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  await new Promise<void>((resolve) => c.once('connect', () => resolve()));
  return c;
}

function once<T = any>(c: ClientSocket, event: string, timeoutMs = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    c.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Lets in-flight socket messages reach the server. */
const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

interface Session {
  roomId: string;
  code: string;
  playerId: string;
  side: 'A' | 'B';
  mode: string;
  gameType: string;
}

async function createAndJoin(gameType = 'freeze_tag') {
  const host = await client();
  const created = once<Session>(host, 'room:created');
  host.emit('room:create', { nickname: 'host', mode: '1v1', gameType });
  const hostSession = await created;
  roomIds.push(hostSession.roomId);

  const guest = await client();
  const joined = once<Session>(guest, 'room:joined');
  const started = once(host, 'game:start');
  guest.emit('room:join', { code: hostSession.code, nickname: 'guest' });
  const guestSession = await joined;
  // freeze_tag doesn't use expressions, so a full room starts immediately.
  if (gameType === 'freeze_tag') await started;
  return { host, guest, hostSession, guestSession, room: getRoom(hostSession.roomId)! };
}

function stopLoops(room: Room) {
  if (room.loopHandle) clearInterval(room.loopHandle);
  if (room.roundResultTimeout) clearTimeout(room.roundResultTimeout);
  room.loopHandle = null;
  room.roundResultTimeout = null;
}

describe('socket input validation', () => {
  it('normalizes invalid mode/gameType/nickname on room:create', async () => {
    const c = await client();
    const created = once<Session>(c, 'room:created');
    c.emit('room:create', { nickname: 'x'.repeat(100), mode: '99v99', gameType: 'nope' });
    const session = await created;
    assert.equal(session.mode, '1v1');
    assert.equal(session.gameType, 'tug_of_war');
    const room = getRoom(session.roomId)!;
    assert.ok(room.players[0]!.nickname.length <= 12);
  });

  it('survives a room:create with no payload at all', async () => {
    const c = await client();
    const created = once<Session>(c, 'room:created');
    c.emit('room:create');
    const session = await created;
    assert.equal(getRoom(session.roomId)!.players[0]!.nickname, '방장');
  });

  it('answers a malformed room:join with a join error instead of silence', async () => {
    const c = await client();
    const err = once<{ reason: string }>(c, 'room:join_error');
    c.emit('room:join', { code: 12345 });
    assert.equal((await err).reason, 'NOT_FOUND');
  });

  it('accepts a room code with surrounding whitespace / lowercase', async () => {
    const host = await client();
    const created = once<Session>(host, 'room:created');
    host.emit('room:create', { nickname: 'h', mode: '1v1', gameType: 'tug_of_war' });
    const { code } = await created;
    const guest = await client();
    const joined = once<Session>(guest, 'room:joined');
    guest.emit('room:join', { code: `  ${code.toLowerCase()} `, nickname: 'g' });
    assert.equal((await joined).code, code);
  });

  it('ignores non-finite motion scores', async () => {
    const { host, hostSession, room } = await createAndJoin();
    stopLoops(room);
    host.emit('input:power', { roomId: hostSession.roomId, playerId: hostSession.playerId, motionScore: 'abc' });
    host.emit('input:power', { roomId: hostSession.roomId, playerId: hostSession.playerId, motionScore: null, expressionScore: {} });
    await settle();
    const player = findRoomByPlayerId(hostSession.roomId, hostSession.playerId)!.player;
    assert.ok(Number.isFinite(player.motionScore));
    assert.ok(Number.isFinite(player.expressionScore));
  });

  it('rejects input:power sent for another player from a different socket', async () => {
    const { guest, hostSession, room } = await createAndJoin();
    stopLoops(room);
    guest.emit('input:power', { roomId: hostSession.roomId, playerId: hostSession.playerId, motionScore: 1 });
    await settle();
    assert.equal(findRoomByPlayerId(hostSession.roomId, hostSession.playerId)!.player.motionScore, 0);
  });
});

describe('match flow guards', () => {
  it('does not restart the round on a late calibration:submit mid-match', async () => {
    const { host, hostSession, room } = await createAndJoin();
    stopLoops(room);
    assert.equal(room.status, 'PLAYING');
    assert.equal(room.roundNumber, 1);
    host.emit('calibration:submit', { roomId: hostSession.roomId, playerId: hostSession.playerId, baseline: 0 });
    await settle();
    assert.equal(room.roundNumber, 1);
    assert.equal(room.status, 'PLAYING');
    stopLoops(room);
  });

  it('ignores room:rematch while a match is still running', async () => {
    const { host, hostSession, room } = await createAndJoin();
    stopLoops(room);
    room.roundWins = { A: 1, B: 0 };
    host.emit('room:rematch', { roomId: hostSession.roomId });
    await settle();
    assert.deepEqual(room.roundWins, { A: 1, B: 0 });
    assert.equal(room.roundNumber, 1);
    stopLoops(room);
  });

  it('leaves the previous room when the same socket creates another one', async () => {
    const c = await client();
    const first = once<Session>(c, 'room:created');
    c.emit('room:create', { nickname: 'a', mode: '1v1', gameType: 'tug_of_war' });
    const firstSession = await first;
    const second = once<Session>(c, 'room:created');
    c.emit('room:create', { nickname: 'a', mode: '1v1', gameType: 'tug_of_war' });
    await second;
    assert.equal(getRoom(firstSession.roomId), undefined);
  });

  it('removes forfeited players so a rematch does not start with a ghost', async () => {
    const { guest, guestSession, room } = await createAndJoin();
    stopLoops(room);
    guest.disconnect();
    await settle();
    assert.equal(room.status, 'PAUSED');
    const ghost = room.players.find((p) => p.id === guestSession.playerId)!;
    clearTimeout(room.disconnectTimers[ghost.id]);

    handleGraceExpired(ioServer, room, ghost);
    assert.equal(room.status, 'MATCH_RESULT');
    assert.equal(room.players.length, 1);

    resetRoomToLobby(room);
    assert.equal(room.status, 'LOBBY');
  });

  it('destroys the room when everyone has dropped and the grace period expires', async () => {
    const { host, guest, hostSession, room } = await createAndJoin();
    stopLoops(room);
    host.disconnect();
    guest.disconnect();
    await settle();
    for (const t of Object.values(room.disconnectTimers)) clearTimeout(t);
    handleGraceExpired(ioServer, room, room.players[0]!);
    assert.equal(getRoom(hostSession.roomId), undefined);
  });

  it('resumes a paused round when the dropped player reconnects', async () => {
    const { guest, guestSession, room } = await createAndJoin();
    stopLoops(room);
    guest.disconnect();
    await settle();
    assert.equal(room.status, 'PAUSED');
    const back = await client();
    const ack = once(back, 'player:reconnect');
    back.emit('player:reconnect', { roomId: guestSession.roomId, playerId: guestSession.playerId });
    await ack;
    assert.equal(room.status, 'PLAYING');
    stopLoops(room);
  });

  it('answers a reconnect for an unknown session with an error', async () => {
    const c = await client();
    const err = once<{ reason: string }>(c, 'player:reconnect_error');
    c.emit('player:reconnect', { roomId: 'nope', playerId: 'nope' });
    assert.equal((await err).reason, 'NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

describe('roomManager', () => {
  it('balances sides in 2v2 and rejects a fifth player', () => {
    const { room } = createRoom('s0', 'p0', '2v2', 'freeze_tag');
    for (let i = 1; i < 4; i++) assert.ok(joinRoom(room.code, `s${i}`, `p${i}`).ok);
    const sides = room.players.map((p) => p.side).sort();
    assert.deepEqual(sides, ['A', 'A', 'B', 'B']);
    const fifth = joinRoom(room.code, 's5', 'p5');
    assert.equal(fifth.ok, false);
  });

  it('only marks a room READY via calibration while CALIBRATING', () => {
    const { room, player } = createRoom('c0', 'p0', '1v1', 'tug_of_war');
    const res = joinRoom(room.code, 'c1', 'p1');
    assert.ok(res.ok);
    assert.equal(room.status, 'CALIBRATING');
    markCalibrated(room, player.id);
    assert.equal(room.status, 'CALIBRATING');
    assert.ok(markCalibrated(room, res.player.id));
    assert.equal(room.status, 'READY');
  });

  it('zeroes inputs that stopped arriving', () => {
    const { room, player } = createRoom('d0', 'p0');
    player.motionScore = 0.9;
    player.expressionScore = 0.5;
    player.lastInputAt = Date.now() - INPUT_STALE_MS - 1;
    decayStaleInputs(room, Date.now());
    assert.equal(player.motionScore, 0);
    assert.equal(player.expressionScore, 0);
  });

  it('keeps the pause target when a second player drops mid-pause', () => {
    const { room } = createRoom('e0', 'p0');
    room.status = 'ROUND_RESULT';
    pauseForDisconnect(room);
    pauseForDisconnect(room);
    assert.equal(room.pause?.resumeTo, 'ROUND_RESULT');
  });
});

describe('minigames', () => {
  function roomFor(gameType: string): Room {
    const { room } = createRoom(`g-${gameType}-${Math.random()}`, 'a', '1v1', gameType);
    joinRoom(room.code, `g2-${Math.random()}`, 'b');
    room.roundStartedAt = Date.now();
    getMiniGame(gameType).resetRound(room);
    return room;
  }

  it('tug of war: the stronger side eventually pulls the rope over', () => {
    const room = roomFor('tug_of_war');
    room.players[0]!.motionScore = 1;
    let result = getMiniGame('tug_of_war').tick(room);
    for (let i = 0; i < 1000 && !result.ended; i++) result = getMiniGame('tug_of_war').tick(room);
    assert.deepEqual(result, { ended: true, winner: 'A' });
  });

  it('tug of war: time-up awards the side with more accumulated power', () => {
    const room = roomFor('tug_of_war');
    room.players[1]!.motionScore = 0.1;
    getMiniGame('tug_of_war').tick(room);
    room.roundStartedAt = Date.now() - 60_000;
    room.players[1]!.motionScore = 0;
    assert.deepEqual(getMiniGame('tug_of_war').tick(room), { ended: true, winner: 'B' });
  });

  it('freeze tag: moving during FREEZE loses the round', () => {
    const room = roomFor('freeze_tag');
    (room.gameState as { phase: string }).phase = 'FREEZE';
    room.players[0]!.motionScore = 0.5;
    assert.deepEqual(getMiniGame('freeze_tag').tick(room), { ended: true, winner: 'B' });
  });

  it('simon says: broadcast always carries a valid cue', () => {
    const room = roomFor('simon_says');
    const payload = getMiniGame('simon_says').broadcastPayload(room);
    assert.match(String(payload.cue), /^(LEFT_ARM_UP|RIGHT_ARM_UP|BOTH_ARMS_UP|ARMS_OUT)$/);
  });

  it('leadingSide gives ties to A', () => {
    assert.equal(leadingSide({ A: 1, B: 1 }), 'A');
    assert.equal(leadingSide({ A: 1, B: 2 }), 'B');
  });
});
