import { useLayoutEffect, useRef } from 'react';

/** A ref that always holds the latest committed `value`, for reading from intervals/rAF loops without re-subscribing. */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
