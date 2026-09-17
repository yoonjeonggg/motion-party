import { randomUUID } from 'node:crypto';
import {
  perSideCapacity,
  roomCapacity,
  type Player,
  type PublicPlayer,
  type Room,
  type RoomMode,
  type Side,
} from './types.js';
import { DEFAULT_GAME_TYPE } from './games/registry.js';

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

export function createRoom(
  hostSocketId: string,
  nickname: string,
  mode: RoomMode = '1v1',
  gameType: string = DEFAULT_GAME_TYPE,
): { room: Room; player: Player } {
  const player: Player = {
    id: randomUUID(),
    socketId: hostSocketId,
    nickname,
    side: 'A',
    connectionStatus: 'CONNECTED',
    motionScore: 0,
    expressionScore: 0,
    calibrated: false,
    lastInputAt: Date.now(),
  };

  const room: Room = {
    id: randomUUID(),
    code: generateCode(),
    status: 'LOBBY',
    mode,
    gameType,
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
  if (room.players.length >= roomCapacity(room.mode)) return { ok: false, reason: 'FULL' };

  const cap = perSideCapacity(room.mode);
  const countA = room.players.filter((p) => p.side === 'A').length;
  const countB = room.players.filter((p) => p.side === 'B').length;
  const canA = countA < cap;
  const canB = countB < cap;
  if (!canA && !canB) return { ok: false, reason: 'FULL' };
  const side: Side = canA && (!canB || countA <= countB) ? 'A' : 'B';

  const player: Player = {
    id: randomUUID(),
    socketId,
    nickname,
    side,
    connectionStatus: 'CONNECTED',
    motionScore: 0,
    expressionScore: 0,
    calibrated: false,
    lastInputAt: Date.now(),
  };

  room.players.push(player);
  if (room.players.length === roomCapacity(room.mode)) {
    room.status = 'CALIBRATING';
  }

  return { ok: true, room, player };
}

/** Marks a player as having submitted their expression baseline. Returns true once everyone in the room has. */
export function markCalibrated(room: Room, playerId: string): boolean {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return false;
  player.calibrated = true;
  const allDone =
    room.players.length >= roomCapacity(room.mode) && room.players.every((p) => p.calibrated);
  if (allDone) room.status = 'READY';
  return allDone;
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
    calibrated: p.calibrated,
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
  for (const player of room.players) {
    player.calibrated = false;
    player.expressionScore = 0;
  }
  room.status = room.players.length >= roomCapacity(room.mode) ? 'CALIBRATING' : 'LOBBY';
  room.roundNumber = 0;
  room.roundWins = { A: 0, B: 0 };
  room.ropePosition = 0;
}
