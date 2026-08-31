import { bumpFlowCounts, isStopped, requestStop } from "./memory";

function tickDelayMs(delayMs: number): number {
  if (!Number.isFinite(delayMs)) {
    return 1;
  }
  return Math.max(1, Math.trunc(delayMs));
}

/**
 * Count one invocation on each c<?> connector the runner just fired.
 * Frequency lives here, not in WASM runtime taps.
 */
export function interceptConsumerFrequency(memory: WebAssembly.Memory, connectorCount: number): void {
  bumpFlowCounts(memory, connectorCount);
}

/** Drive `tick` with `setInterval` and intercept c<?> frequency after every fire. */
export function startTickLoop(
  memory: WebAssembly.Memory,
  tick: () => void,
  delayMs: number,
  connectorCount: number,
): { stop: () => void; fire: () => void } {
  const delay = tickDelayMs(delayMs);
  const fire = (): void => {
    if (isStopped(memory)) {
      return;
    }
    tick();
    interceptConsumerFrequency(memory, connectorCount);
  };
  fire();
  const interval = setInterval(() => {
    if (isStopped(memory)) {
      clearInterval(interval);
      return;
    }
    fire();
  }, delay);
  return {
    fire,
    stop() {
      clearInterval(interval);
      requestStop(memory);
    },
  };
}
