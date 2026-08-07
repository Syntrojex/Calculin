import { useEffect, useRef } from "react";

/**
 * When `enabled` is true, calls `callback` automatically `delay` ms after
 * any value in `deps` changes (debounced) — powers the global
 * "Auto Calculate" setting. When `enabled` is false, this is a no-op and
 * the calculator relies on its normal "Calculate" button instead.
 */
export function useAutoRun(
  deps: unknown[],
  callback: () => void,
  enabled: boolean,
  delay = 450
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const handle = setTimeout(() => {
      callbackRef.current();
    }, delay);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, delay, ...deps]);
}
