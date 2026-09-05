/** Clamp a `setInterval` delay so it is never zero or NaN. */
export function clampDelayMs(delayMs: number): number {
  if (!Number.isFinite(delayMs)) {
    return 1;
  }
  return Math.max(1, Math.trunc(delayMs));
}

/** Fire immediately, then on an interval, until `isStopped`. */
export function startQuantizedLoop(options: {
  delayMs: number;
  isStopped: () => boolean;
  fire: () => void;
}): { stop: () => void; fire: () => void } {
  const delay = clampDelayMs(options.delayMs);
  const run = (): void => {
    if (options.isStopped()) {
      return;
    }
    options.fire();
  };
  run();
  const interval = setInterval(() => {
    if (options.isStopped()) {
      clearInterval(interval);
      return;
    }
    run();
  }, delay);
  return {
    fire: run,
    stop() {
      clearInterval(interval);
    },
  };
}
