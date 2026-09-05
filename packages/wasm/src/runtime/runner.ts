import { bumpFlowCounts, isStopped, requestStop } from "./memory";
import { startQuantizedLoop } from "./tick";

/**
 * Count one invocation on each consumer connector the runner just fired.
 * Frequency lives here, not in WASM runtime taps.
 */
export function interceptConsumerFrequency(memory: WebAssembly.Memory, connectorCount: number): void {
  bumpFlowCounts(memory, connectorCount);
}

/** Drive `tick` with `setInterval` and intercept consumer frequency after every fire. */
export function startTickLoop(
  memory: WebAssembly.Memory,
  tick: () => void,
  delayMs: number,
  connectorCount: number,
): { stop: () => void; fire: () => void } {
  const loop = startQuantizedLoop({
    delayMs,
    isStopped: () => isStopped(memory),
    fire() {
      tick();
      interceptConsumerFrequency(memory, connectorCount);
    },
  });
  return {
    fire: loop.fire,
    stop() {
      loop.stop();
      requestStop(memory);
    },
  };
}
