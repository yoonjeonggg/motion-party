import { randomUUID } from 'node:crypto';
import { MAX_PLAYERS, type Player, type PublicPlayer, type Room, type Side } from './types.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const rooms = new Map<string, Room>();
const roomsByCode = new Map<string, string>();

function generateCode(): string {
  let code: string;
  do {
    code = Array.from({ length: CODE_LENGTH }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
    ).join('');
  } while (roomsByCode.has(code));
  return code;
}

export function createRoom(hostSocketId: string, nickname: string): { room: Room; player: Player } {
  const player: Player = {
    id: randomUUID(),
    socketId: hostSocketId,
    nickname,
    side: 'A',
    connectionStatus: 'CONNECTED',
    motionScore: 0,
    lastInputAt: Date.now(),
  };

  const room: Room = {
    id: randomUUID(),
    code: generateCode(),
    status: 'LOBBY',
    mode: '1v1',
    players: [player],
    createdAt: Date.now(),
    roundNumber: 0,
    roundWins: { A: 0, B: 0 },
    ropePosition: 0,
    roundStartedAt: 0,
    roundPower: { A: 0, B: 0 },
    loopHandle: null,
    roundResultTimeout: null,
    disconnectTimers: {},
  };

  rooms.set(room.id, room);
  roomsByCode.set(room.code, room.id);
  return { room, player };
}

export type JoinResult =
  | { ok: true; room: Room; player: Player }
  | { ok: false; reason: 'NOT_FOUND' | 'FULL' | 'ALREADY_STARTED' };

export function joinRoom(code: string, socketId: string, nickname: string): JoinResult {
  const roomId = roomsByCode.get(code.toUpperCase());
  if (!roomId) return { ok: false, reason: 'NOT_FOUND' };
  const room = rooms.get(roomId);
  if (!room) return { ok: false, reason: 'NOT_FOUND' };
  if (room.status !== 'LOBBY') return { ok: false, reason: 'ALREADY_STARTED' };
  if (room.players.length >= MAX_PLAYERS) return { ok: false, reason: 'FULL' };

  const usedSides = new Set(room.players.map((p) => p.side));
  const side: Side = usedSides.has('A') ? 'B' : 'A';

  const player: Player = {
    id: randomUUID(),
    socketId,
    nickname,
    side,
    connectionStatus: 'CONNECTED',
    motionScore: 0,
    lastInputAt: Date.now(),
  };

  room.players.push(player);
  if (room.players.length === MAX_PLAYERS) {
    room.status = 'READY';
  }

  return { ok: true, room, player };
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function findRoomBySocketId(socketId: string): { room: Room; player: Player } | undefined {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.socketId === socketId);
    if (player) return { room, player };
  }
  return undefined;
}

export function findRoomByPlayerId(
  roomId: string,
  playerId: string,
): { room: Room; player: Player } | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return undefined;
  return { room, player };
}

export function toPublicPlayers(room: Room): PublicPlayer[] {
  return room.players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    side: p.side,
    connectionStatus: p.connectionStatus,
  }));
}

export function destroyRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.loopHandle) clearInterval(room.loopHandle);
  if (room.roundResultTimeout) clearTimeout(room.roundResultTimeout);
  for (const timer of Object.values(room.disconnectTimers)) {
    if (timer) clearTimeout(timer);
  }
  rooms.delete(roomId);
  roomsByCode.delete(room.code);
}

export function resetRoomToLobby(room: Room): void {
  room.status = room.players.length >= MAX_PLAYERS ? 'READY' : 'LOBBY';
  room.roundNumber = 0;
  room.roundWins = { A: 0, B: 0 };
  room.ropePosition = 0;
}
