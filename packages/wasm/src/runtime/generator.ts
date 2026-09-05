import { canShareMemory, canUseIsolatedWorker } from "../isolation";
import type { SolutionViewConnector } from "@bld/xml/solution/view";
import { intervalMs } from "@bld/xml/flow";
import { bootGeneratorInstance, type InstantiatedGenerator } from "./boot";
import { type HostOptions } from "./host";
import { createMemory, readFlowCounts, readSamples, requestStop } from "./memory";

export type { InstantiatedGenerator } from "./boot";

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
  return bootGeneratorInstance(wasm.slice(), memory, hostOptions(nowOrOptions));
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
