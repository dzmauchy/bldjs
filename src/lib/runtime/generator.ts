import { createHost } from "./host";

export interface GeneratorHandle {
  snapshot(): Promise<number[]>;
  stop(): void;
}

export interface StartGeneratorOptions {
  wasm: Uint8Array;
  delayMs: number;
  now?: () => number;
}

export async function instantiateGenerator(
  wasm: Uint8Array,
  buffer: number[],
  now?: () => number,
): Promise<() => void> {
  const { instance } = await WebAssembly.instantiate(wasm, createHost(buffer, now));
  const tick = instance.exports.tick;
  if (typeof tick !== "function") {
    throw new Error("generator wasm is missing exported tick");
  }
  return tick as () => void;
}

/** In-process runner used by unit tests and as a Worker fallback. */
export async function startLocalGenerator(options: StartGeneratorOptions): Promise<GeneratorHandle> {
  const buffer: number[] = [];
  const tick = await instantiateGenerator(options.wasm, buffer, options.now);
  const delay = Math.max(options.delayMs, 1);
  let running = true;
  const loop = (): void => {
    if (!running) {
      return;
    }
    tick();
    handle = setTimeout(loop, delay);
  };
  let handle: ReturnType<typeof setTimeout> | undefined = setTimeout(loop, 0);
  return {
    snapshot: async () => [...buffer],
    stop() {
      running = false;
      if (handle !== undefined) {
        clearTimeout(handle);
      }
    },
  };
}

export async function startWorkerGenerator(options: StartGeneratorOptions): Promise<GeneratorHandle> {
  const worker = new Worker(new URL("./generator.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, (values: number[]) => void>();
  let nextId = 1;
  worker.onmessage = (event: MessageEvent<{ type: string; id?: number; values?: number[] }>) => {
    if (event.data.type !== "samples" || event.data.id === undefined) {
      return;
    }
    const resolve = pending.get(event.data.id);
    pending.delete(event.data.id);
    resolve?.(event.data.values ?? []);
  };
  const copy = options.wasm.slice();
  worker.postMessage({ type: "start", wasm: copy.buffer, delayMs: options.delayMs }, [copy.buffer]);
  return {
    snapshot: () =>
      new Promise<number[]>((resolve) => {
        const id = nextId;
        nextId += 1;
        pending.set(id, resolve);
        worker.postMessage({ type: "snapshot", id });
      }),
    stop() {
      for (const resolve of pending.values()) {
        resolve([]);
      }
      pending.clear();
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
