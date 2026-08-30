import { createHost } from "./host";
import { createSharedMemory, readSamples, requestStop } from "./memory";

export interface GeneratorHandle {
  snapshot(scopeIndex?: number): Promise<number[]>;
  stop(): void;
  tick?(): void;
}

export interface StartGeneratorOptions {
  wasm: Uint8Array;
  delayMs: number;
  now?: () => number;
}

export interface InstantiatedGenerator {
  memory: WebAssembly.Memory;
  tick: () => void;
  run: () => void;
}

export async function instantiateGenerator(
  wasm: Uint8Array,
  memory: WebAssembly.Memory,
  now?: () => number,
): Promise<InstantiatedGenerator> {
  const module = await WebAssembly.compile(wasm.slice());
  const instance = await WebAssembly.instantiate(module, createHost(memory, now));
  const tick = instance.exports.tick;
  const run = instance.exports.run;
  if (typeof tick !== "function" || typeof run !== "function") {
    throw new Error("generator wasm is missing exported tick/run");
  }
  return {
    memory,
    tick: tick as () => void,
    run: run as () => void,
  };
}

/** In-process runner used by unit tests. Call `tick` — do not `run` (that waits). */
export async function startLocalGenerator(options: StartGeneratorOptions): Promise<GeneratorHandle> {
  const memory = createSharedMemory();
  const gen = await instantiateGenerator(options.wasm, memory, options.now);
  for (let i = 0; i < 8; i += 1) {
    gen.tick();
  }
  return {
    snapshot: async (scopeIndex = 0) => readSamples(memory, scopeIndex),
    stop() {
      requestStop(memory);
    },
    tick: () => gen.tick(),
  };
}

export async function startWorkerGenerator(options: StartGeneratorOptions): Promise<GeneratorHandle> {
  const memory = createSharedMemory();
  const worker = new Worker(new URL("./generator.worker.ts", import.meta.url), { type: "module" });
  const copy = options.wasm.slice();
  worker.postMessage({ type: "start", wasm: copy.buffer, memory }, [copy.buffer]);
  return {
    snapshot: async (scopeIndex = 0) => readSamples(memory, scopeIndex),
    stop() {
      requestStop(memory);
      worker.postMessage({ type: "stop" });
      worker.terminate();
    },
  };
}

export async function startGenerator(options: StartGeneratorOptions): Promise<GeneratorHandle> {
  if (typeof Worker === "function" && import.meta.env.MODE !== "test") {
    return startWorkerGenerator(options);
  }
  return startLocalGenerator(options);
}
