/** Imports shared by the generator worker and the in-process runner. */
export function createHost(
  memory: WebAssembly.Memory,
  now: () => number = () => Date.now() / 1000,
): WebAssembly.Imports {
  return {
    env: { memory },
    host: {
      now,
      sin: Math.sin,
    },
  };
}
