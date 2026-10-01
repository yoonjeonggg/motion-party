import { createTugStyleModule } from './tugStyle.js';

export const ARM_WRESTLE_ID = 'arm_wrestle';

/** Arm-wrestling resolves faster than tug-of-war: quicker push and a shorter time limit. */
export const armWrestleModule = createTugStyleModule({
  id: ARM_WRESTLE_ID,
  limit: 1,
  speed: 0.5,
  timeLimitMs: 20_000,
  positionField: 'armPosition',
});
