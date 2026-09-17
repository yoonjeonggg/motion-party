import type { MiniGameModule } from './miniGame.js';
import { tugOfWarModule, TUG_OF_WAR_ID } from './tugOfWar.js';
import { armWrestleModule } from './armWrestle.js';
import { freezeTagModule } from './freezeTag.js';

const registry: Record<string, MiniGameModule> = {
  [tugOfWarModule.id]: tugOfWarModule,
  [armWrestleModule.id]: armWrestleModule,
  [freezeTagModule.id]: freezeTagModule,
};

export const DEFAULT_GAME_TYPE = TUG_OF_WAR_ID;

/** Falls back to the default game for an unknown/omitted gameType. */
export function getMiniGame(gameType: string): MiniGameModule {
  return registry[gameType] ?? tugOfWarModule;
}
