import { after, afterEach, before } from 'node:test';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../src/socketHandlers.js';
import { createRoom, destroyRoom, getRoom, joinRoom } from '../src/roomManager.js';
import { logger } from '../src/logger.js';
import { roomCapacity, type Room, type RoomMode } from '../src/types.js';

// Expected errors (bad payloads, a deliberately broken tick) would otherwise flood the test output.
logger.level = 'silent';

/** Lets in-flight socket messages reach the server. */
export const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

export function once<T = any>(c: ClientSocket, event: string, timeoutMs = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    c.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Resolves false if `event` does NOT arrive within `ms` - for asserting the server stayed silent. */
export function noEvent(c: ClientSocket, event: string, ms = 100): Promise<boolean> {
  return once(c, event, ms).then(
    () => false,
    () => true,
  );
}

export interface Session {
  roomId: string;
  code: string;
  playerId: string;
  side: 'A' | 'B';
  mode: string;
  gameType: string;
}

export function stopLoops(room: Room) {
  if (room.loopHandle) clearInterval(room.loopHandle);
  if (room.roundResultTimeout) clearTimeout(room.roundResultTimeout);
  room.loopHandle = null;
  room.roundResultTimeout = null;
}

/**
 * Spins up a real socket.io server for the calling test file and tears down every client
 * and room between tests, so one test's leftovers (or its 30s grace timers) never leak.
 */
export function useSocketServer() {
  let httpServer: HttpServer;
  let io: Server;
  let url: string;
  const clients: ClientSocket[] = [];
  const roomIds: string[] = [];

  before(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    io.on('connection', (socket) => registerSocketHandlers(io, socket));
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const c of clients.splice(0)) c.disconnect();
    await settle();
    for (const id of roomIds.splice(0)) destroyRoom(id);
  });

  after(async () => {
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  async function client(): Promise<ClientSocket> {
    const c = connect(url, { transports: ['websocket'], forceNew: true });
    clients.push(c);
    await new Promise<void>((resolve) => c.once('connect', () => resolve()));
    return c;
  }

  async function create(c: ClientSocket, payload: Record<string, unknown> = { nickname: 'host' }): Promise<Session> {
    const created = once<Session>(c, 'room:created');
    c.emit('room:create', payload);
    const session = await created;
    roomIds.push(session.roomId);
    return session;
  }

  /** Host + guest in a 1v1 room. freeze_tag skips calibration, so the match is already PLAYING on return. */
  async function createAndJoin(gameType = 'freeze_tag') {
    const host = await client();
    const hostSession = await create(host, { nickname: 'host', mode: '1v1', gameType });

    const guest = await client();
    const joined = once<Session>(guest, 'room:joined');
    const started = once(host, 'game:start');
    guest.emit('room:join', { code: hostSession.code, nickname: 'guest' });
    const guestSession = await joined;
    if (gameType === 'freeze_tag') await started;
    return { host, guest, hostSession, guestSession, room: getRoom(hostSession.roomId)! };
  }

  return { io: () => io, client, create, createAndJoin };
}

/** Records every emit, so gameLoop can be driven without a real socket.io server. */
export function fakeIo() {
  const events: { event: string; payload: any }[] = [];
  const emitter = {
    emit(event: string, payload: unknown) {
      events.push({ event, payload });
      return true;
    },
  };
  const io = { to: () => ({ ...emitter, volatile: emitter }) } as unknown as Server;
  const named = (event: string) => events.filter((e) => e.event === event);
  return { io, events, named };
}

/** A full room of `mode` straight from roomManager, with no sockets attached. */
export function fullRoom(gameType: string, mode: RoomMode = '1v1'): Room {
  const tag = `${gameType}-${Math.random()}`;
  const { room } = createRoom(`host-${tag}`, 'host', mode, gameType);
  while (room.players.length < roomCapacity(mode)) {
    const res = joinRoom(room.code, `guest-${tag}-${room.players.length}`, 'guest');
    if (!res.ok) throw new Error(`fullRoom: join rejected (${res.reason})`);
  }
  return room;
}
