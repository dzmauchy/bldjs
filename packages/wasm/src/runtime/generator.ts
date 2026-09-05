import { canShareMemory, canUseIsolatedWorker } from "../isolation";
import type { SolutionViewConnector } from "@bld/xml/solution/view";
import { intervalMs } from "@bld/xml/flow";
import { createHost, type HostOptions } from "./host";
import { createMemory, readFlowCounts, readSamples, requestStop } from "./memory";

export interface GeneratorHandle {
  connectors: readonly SolutionViewConnector[];
  snapshot(scopeIndex?: number): number[];
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
  start: (delayMs: number) => void;
  stopTimers: () => void;
  fire: () => void;
}

function hostOptions(nowOrOptions?: (() => number) | HostOptions): HostOptions {
  if (typeof nowOrOptions === "function") {
    return { now: nowOrOptions };
  }
  return nowOrOptions ?? {};
}

export async function instantiateGenerator(
  wasm: Uint8Array,
  memory: WebAssembly.Memory,
  nowOrOptions?: (() => number) | HostOptions,
): Promise<InstantiatedGenerator> {
  const options = hostOptions(nowOrOptions);
  const host = createHost(memory, options);
  const module = await WebAssembly.compile(wasm.slice());
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

function bindHandle(
  memory: WebAssembly.Memory,
  connectors: readonly SolutionViewConnector[],
  stop: () => void,
  tick?: () => void,
): GeneratorHandle {
  return {
    connectors,
    snapshot: (scopeIndex = 0) => readSamples(memory, scopeIndex),
    readFlowCounts: () => readFlowCounts(memory, connectors.length),
    stop,
    tick,
  };
}

/** Drive `tick` with imported browser `setInterval` on this thread (tests and non-isolated pages). */
export async function startLocalGenerator(options: StartGeneratorOptions): Promise<GeneratorHandle> {
  const memory = createMemory(canShareMemory());
  const connectors = options.connectors ?? [];
  const gen = await instantiateGenerator(options.wasm, memory, {
    now: options.now,
    connectorCount: connectors.length,
  });
  gen.start(options.delayMs);
  return bindHandle(memory, connectors, () => gen.stopTimers(), () => gen.fire());
}

/** One dedicated worker (wasm thread) per generator; `setInterval` lives in that worker. */
export async function startWorkerGenerator(options: StartGeneratorOptions): Promise<GeneratorHandle> {
  const memory = createMemory(true);
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
  if (import.meta.env.MODE !== "test" && canUseIsolatedWorker()) {
    return startWorkerGenerator(options);
  }
  return startLocalGenerator(options);
}
