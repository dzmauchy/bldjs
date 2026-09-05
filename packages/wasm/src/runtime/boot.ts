import { createHost, type HostOptions } from "./host";

export interface InstantiatedGenerator {
  memory: WebAssembly.Memory;
  tick: () => void;
  start: (delayMs: number) => void;
  stopTimers: () => void;
  fire: () => void;
}

/** Compile and instantiate a generator module with the JS host imports. */
export async function bootGeneratorInstance(
  wasm: BufferSource,
  memory: WebAssembly.Memory,
  options: HostOptions = {},
): Promise<InstantiatedGenerator> {
  const host = createHost(memory, options);
  const module = await WebAssembly.compile(wasm);
  const instance = await WebAssembly.instantiate(module, host.imports);
  const tick = instance.exports.tick;
  const start = instance.exports.start;
  if (typeof tick !== "function") {
    throw new Error("generator wasm is missing exported tick");
  }
  if (typeof start !== "function") {
    throw new Error("generator wasm is missing exported start");
  }
  return {
    memory,
    tick: tick as () => void,
    start: start as (delayMs: number) => void,
    stopTimers: () => host.stopTimers(),
    fire: () => host.fire(),
  };
}
