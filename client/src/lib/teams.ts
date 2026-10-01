import { opposite, type PublicPlayer, type Side } from '../types';

export function joinNicknames(players: PublicPlayer[]): string {
  return players.map((p) => p.nickname).join(' · ');
}

/** Nicknames of everyone on `side`, falling back to the side letter if the roster is empty. */
export function sideLabel(players: PublicPlayer[], side: Side): string {
  return joinNicknames(players.filter((p) => p.side === side)) || side;
}

/** Splits the roster into me / my teammates / the other team, from my point of view. */
export function splitTeams(players: PublicPlayer[], session: { playerId: string; side: Side }) {
  const mySide = session.side;
  const opponentSide = opposite(mySide);
  return {
    mySide,
    opponentSide,
    me: players.find((p) => p.id === session.playerId),
    teammates: players.filter((p) => p.side === mySide && p.id !== session.playerId),
    opponents: players.filter((p) => p.side === opponentSide),
  };
}
