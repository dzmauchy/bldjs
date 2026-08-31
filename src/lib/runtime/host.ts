/**
 * Imports shared by the generator worker and the in-process runner.
 * JS Promise Integration (`WebAssembly.Suspending` / `Promising`) is the JS-side
 * of stack-switching; this runtime uses shared-memory worker threads instead.
 */
export function createHost(
  memory: WebAssembly.Memory,
  now: () => number = () => Date.now() / 1000,
): WebAssembly.Imports {
  return {
    env: { memory },
    host: {
      now,
      sin: Math.sin,
      cos: Math.cos,
    },
  };
}
