import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLatch } from './useLatch';
import { useLatestRef } from './useLatestRef';

describe('useLatch', () => {
  it('starts false and stays true once the condition held', () => {
    const { result, rerender } = renderHook(({ c }) => useLatch(c), { initialProps: { c: false } });
    expect(result.current).toBe(false);
    rerender({ c: true });
    expect(result.current).toBe(true);
    rerender({ c: false });
    expect(result.current).toBe(true);
  });

  it('is true on the very first render if the condition already holds', () => {
    const { result } = renderHook(() => useLatch(true));
    expect(result.current).toBe(true);
  });
});

describe('useLatestRef', () => {
  it('keeps a stable ref that tracks the latest value', () => {
    const { result, rerender } = renderHook(({ v }) => useLatestRef(v), { initialProps: { v: 1 } });
    const ref = result.current;
    expect(ref.current).toBe(1);
    rerender({ v: 2 });
    expect(result.current).toBe(ref);
    expect(ref.current).toBe(2);
  });
});
