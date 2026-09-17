import { ARM_WRESTLE_LIMIT, ARM_WRESTLE_SPEED, ARM_WRESTLE_TIME_LIMIT_MS } from '../types.js';
import { createTugStyleModule } from './tugStyle.js';

export const ARM_WRESTLE_ID = 'arm_wrestle';

export const armWrestleModule = createTugStyleModule({
  id: ARM_WRESTLE_ID,
  limit: ARM_WRESTLE_LIMIT,
  speed: ARM_WRESTLE_SPEED,
  timeLimitMs: ARM_WRESTLE_TIME_LIMIT_MS,
  positionField: 'armPosition',
});
