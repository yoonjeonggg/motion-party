import { useState } from 'react';

/** Becomes true the first time `condition` holds and stays true for the component's lifetime. */
export function useLatch(condition: boolean): boolean {
  const [latched, setLatched] = useState(false);
  // Adjusting state during render (rather than in an effect) avoids an extra commit with a stale value.
  if (condition && !latched) setLatched(true);
  return latched;
}
