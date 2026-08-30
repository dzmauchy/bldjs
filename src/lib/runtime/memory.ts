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

/** Extra rings start after `$ctx` (`time` + `delay_ns`). */
export const RING_STRIDE = 8 + SAMPLE_CAP * 8;

export function scopeCountAddr(index: number): number {
  return index <= 0 ? MEM.count : CTX + 16 + (index - 1) * RING_STRIDE;
}

export function scopeSamplesAddr(index: number): number {
  return index <= 0 ? MEM.samples : scopeCountAddr(index) + 8;
}

export const MEMORY_PAGES = 1;
export const MEMORY_BYTES = MEMORY_PAGES * 65536;

/** Per-connector invocation counters, packed at the end of the shared page. */
export const FLOW_COUNT_CAP = 256;
export const FLOW_COUNTS = MEMORY_BYTES - FLOW_COUNT_CAP * 4;

export function createSharedMemory(): WebAssembly.Memory {
  return new WebAssembly.Memory({
    initial: MEMORY_PAGES,
    maximum: MEMORY_PAGES,
    shared: true,
  });
}

export function isStopped(memory: WebAssembly.Memory): boolean {
  return Atomics.load(new Int32Array(memory.buffer), MEM.stop / 4) !== 0;
}

export function requestStop(memory: WebAssembly.Memory): void {
  Atomics.store(new Int32Array(memory.buffer), MEM.stop / 4, 1);
}

export function readFlowCounts(memory: WebAssembly.Memory, count: number): number[] {
  const n = Math.max(0, Math.min(count, FLOW_COUNT_CAP));
  if (n === 0) {
    return [];
  }
  const view = new Int32Array(memory.buffer, FLOW_COUNTS, n);
  return Array.from({ length: n }, (_, index) => Atomics.load(view, index));
}

/** The runner records one c<?> invocation per connector after each `tick`. */
export function bumpFlowCounts(memory: WebAssembly.Memory, count: number): void {
  const n = Math.max(0, Math.min(count, FLOW_COUNT_CAP));
  if (n === 0) {
    return;
  }
  const view = new Int32Array(memory.buffer, FLOW_COUNTS, n);
  for (let i = 0; i < n; i += 1) {
    Atomics.add(view, i, 1);
  }
}

export function readSamples(memory: WebAssembly.Memory, scopeIndex = 0): number[] {
  const view = new DataView(memory.buffer);
  const countAddr = scopeCountAddr(scopeIndex);
  const samplesAddr = scopeSamplesAddr(scopeIndex);
  const count = view.getInt32(countAddr, true);
  if (count <= 0) {
    return [];
  }
  const n = Math.min(count, SAMPLE_CAP);
  const start = count > SAMPLE_CAP ? count % SAMPLE_CAP : 0;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const slot = (start + i) % SAMPLE_CAP;
    out.push(view.getFloat64(samplesAddr + slot * 8, true));
  }
  return out;
}
