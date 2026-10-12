import { useGameStore, type SessionInfo } from '../store/gameStore';
import type { GameType, PublicPlayer, RoomMode, Side } from '../types';

export function player(id: string, side: Side, overrides: Partial<PublicPlayer> = {}): PublicPlayer {
  return { id, nickname: id, side, connectionStatus: 'CONNECTED', calibrated: false, ...overrides };
}

export function session(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    roomId: 'room-1',
    code: 'ABC234',
    playerId: 'me',
    side: 'A',
    mode: '1v1',
    gameType: 'tug_of_war',
    ...overrides,
  };
}

/** Puts the store into a room as `me`, with an opponent unless `players` is given. */
export function enterRoom({
  side = 'A',
  mode = '1v1',
  gameType = 'tug_of_war',
  players,
}: { side?: Side; mode?: RoomMode; gameType?: GameType; players?: PublicPlayer[] } = {}) {
  const other: Side = side === 'A' ? 'B' : 'A';
  useGameStore.setState({
    session: session({ side, mode, gameType }),
    players: players ?? [player('me', side), player('rival', other)],
  });
}
