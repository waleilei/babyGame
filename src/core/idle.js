
export function afterIdle(callback, delay = 1000) {
  let cancelled = false;
  let idle = null;
  const idleCallback = globalThis.requestIdleCallback;

  const timer = setTimeout(() => {
    if (cancelled) return;
    if (typeof idleCallback === 'function') {
      idle = idleCallback(() => {
        if (!cancelled) callback();
      }, { timeout: 500 });
    } else {
      callback();
    }
  }, delay);

  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (idle != null) globalThis.cancelIdleCallback?.(idle);
  };
}
