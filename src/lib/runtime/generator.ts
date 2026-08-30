import type { SolutionViewConnector } from "../solution/view";
import { intervalMs } from "./flow";
import { createHost } from "./host";
import { createSharedMemory, readFlowCounts, readSamples, requestStop } from "./memory";
import { startTickLoop } from "./runner";

export interface GeneratorHandle {
  connectors: readonly SolutionViewConnector[];
  snapshot(scopeIndex?: number): Promise<number[]>;
  readFlowCounts(): number[];
  stop(): void;
  tick?(): void;
}

export interface StartGeneratorOptions {
  wasm: Uint8Array;
  delayMs: number;
  connectors?: readonly SolutionViewConnector[];
  now?: () => number;
}

export interface InstantiatedGenerator {
  memory: WebAssembly.Memory;
  tick: () => void;
}

export async function instantiateGenerator(
  wasm: Uint8Array,
  memory: WebAssembly.Memory,
  now?: () => number,
): Promise<InstantiatedGenerator> {
  const module = await WebAssembly.compile(wasm.slice());
  const instance = await WebAssembly.instantiate(module, createHost(memory, now));
  const tick = instance.exports.tick;
  if (typeof tick !== "function") {
    throw new Error("generator wasm is missing exported tick");
  }
  return {
    memory,
    tick: tick as () => void,
  };
}

function bindHandle(
  memory: WebAssembly.Memory,
  connectors: readonly SolutionViewConnector[],
  stop: () => void,
  tick?: () => void,
): GeneratorHandle {
  return {
    connectors,
    snapshot: async (scopeIndex = 0) => readSamples(memory, scopeIndex),
    readFlowCounts: () => readFlowCounts(memory, connectors.length),
    stop,
    tick,
  };
}

/** Drive `tick` with `setInterval` on this thread (tests and fallback). */
export async function startLocalGenerator(options: StartGeneratorOptions): Promise<GeneratorHandle> {
  const memory = createSharedMemory();
  const gen = await instantiateGenerator(options.wasm, memory, options.now);
  const connectors = options.connectors ?? [];
  const loop = startTickLoop(memory, gen.tick, options.delayMs, connectors.length);
  return bindHandle(memory, connectors, loop.stop, loop.fire);
}

/** One dedicated worker (wasm thread) per generator; `setInterval` lives in that worker. */
export async function startWorkerGenerator(options: StartGeneratorOptions): Promise<GeneratorHandle> {
  const memory = createSharedMemory();
  const connectors = options.connectors ?? [];
  const worker = new Worker(new URL("./generator.worker.ts", import.meta.url), { type: "module" });
  const copy = options.wasm.slice();
  worker.postMessage(
    {
      type: "start",
      wasm: copy.buffer,
      memory,
      delayMs: intervalMs(options.delayMs),
      connectorCount: connectors.length,
    },
    [copy.buffer],
  );
  return bindHandle(memory, connectors, () => {
    requestStop(memory);
    worker.postMessage({ type: "stop" });
    worker.terminate();
  });
}

export async function startGenerator(options: StartGeneratorOptions): Promise<GeneratorHandle> {
  if (typeof Worker === "function" && import.meta.env.MODE !== "test") {
    return startWorkerGenerator(options);
  }
  return startLocalGenerator(options);
}
