import { ROPE_LIMIT, ROPE_SPEED, ROUND_TIME_LIMIT_MS } from '../types.js';
import { createTugStyleModule } from './tugStyle.js';

export const TUG_OF_WAR_ID = 'tug_of_war';

export const tugOfWarModule = createTugStyleModule({
  id: TUG_OF_WAR_ID,
  limit: ROPE_LIMIT,
  speed: ROPE_SPEED,
  timeLimitMs: ROUND_TIME_LIMIT_MS,
  positionField: 'ropePosition',
});
