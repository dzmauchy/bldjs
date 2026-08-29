export const SAMPLE_CAP = 480;

/** Shared memory layout used by the assembled generator. */
export const MEM = {
  stop: 0,
  count: 4,
  wait: 8,
  samples: 16,
} as const;

/** Runtime context pointer: `$ctx` → `{ time: f64, delay_ns: i64 }`. */
export const CTX = MEM.samples + SAMPLE_CAP * 8;
export const CTX_TIME = CTX;
export const CTX_DELAY = CTX + 8;

export const MEMORY_PAGES = 1;

export function createSharedMemory(): WebAssembly.Memory {
  return new WebAssembly.Memory({
    initial: MEMORY_PAGES,
    maximum: MEMORY_PAGES,
    shared: true,
  });
}

export function requestStop(memory: WebAssembly.Memory): void {
  const flags = new Int32Array(memory.buffer);
  Atomics.store(flags, MEM.stop / 4, 1);
  Atomics.notify(flags, MEM.wait / 4);
}

export function readSamples(memory: WebAssembly.Memory): number[] {
  const view = new DataView(memory.buffer);
  const count = view.getInt32(MEM.count, true);
  if (count <= 0) {
    return [];
  }
  const n = Math.min(count, SAMPLE_CAP);
  const start = count > SAMPLE_CAP ? count % SAMPLE_CAP : 0;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const slot = (start + i) % SAMPLE_CAP;
    out.push(view.getFloat64(MEM.samples + slot * 8, true));
  }
  return out;
}
