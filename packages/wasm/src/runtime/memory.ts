/** Ring capacity. Keep in sync with the XML package sample ring. */
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

/** Simulated GPIO levels (one i32 per pin), packed just before the flow counters. */
export const GPIO_CAP = 32;
export const GPIO_WORDS = FLOW_COUNTS - GPIO_CAP * 4;

/** Last pushed f64 per ring (NaN until `host.push`), packed just before GPIO. */
export const LATEST_CAP = 32;
export const LATEST = GPIO_WORDS - LATEST_CAP * 8;
/** Publication word so the browser timer observes the latest f64 write. */
export const LATEST_PUB = LATEST - 4;

function isSharedBuffer(buffer: ArrayBufferLike): buffer is SharedArrayBuffer {
  return typeof SharedArrayBuffer === "function" && buffer instanceof SharedArrayBuffer;
}

/** Shared vs local Int32 access with Atomics on SharedArrayBuffer. */
class I32Words {
  constructor(
    private readonly buffer: ArrayBufferLike,
    private readonly byteOffset = 0,
    private readonly length?: number,
  ) {}

  private get shared(): boolean {
    return isSharedBuffer(this.buffer);
  }

  private view(): Int32Array {
    return this.length == null
      ? new Int32Array(this.buffer)
      : new Int32Array(this.buffer, this.byteOffset, this.length);
  }

  load(index: number): number {
    const view = this.view();
    return this.shared ? Atomics.load(view, index) : (view[index] ?? 0);
  }

  store(index: number, value: number): void {
    const view = this.view();
    if (this.shared) {
      Atomics.store(view, index, value);
      return;
    }
    view[index] = value;
  }

  add(index: number, delta: number): void {
    const view = this.view();
    if (this.shared) {
      Atomics.add(view, index, delta);
      return;
    }
    view[index] = (view[index] ?? 0) + delta;
  }
}

export function createMemory(shared: boolean): WebAssembly.Memory {
  const memory = new WebAssembly.Memory({
    initial: MEMORY_PAGES,
    maximum: MEMORY_PAGES,
    shared,
  });
  initLatest(memory);
  return memory;
}

/** Shared memory for worker threads. Throws if the page is not cross-origin isolated. */
export function createSharedMemory(): WebAssembly.Memory {
  return createMemory(true);
}

function latestIndex(ring: number): number {
  if (!Number.isFinite(ring)) {
    return 0;
  }
  const index = Math.trunc(ring);
  if (index < 0) {
    return 0;
  }
  if (index >= LATEST_CAP) {
    return LATEST_CAP - 1;
  }
  return index;
}

function latestView(memory: WebAssembly.Memory): Float64Array {
  return new Float64Array(memory.buffer, LATEST, LATEST_CAP);
}

function latestPub(memory: WebAssembly.Memory): I32Words {
  return new I32Words(memory.buffer, LATEST_PUB, 1);
}

export function initLatest(memory: WebAssembly.Memory): void {
  latestView(memory).fill(Number.NaN);
}

export function writeLatest(memory: WebAssembly.Memory, value: number, ring = 0): void {
  latestView(memory)[latestIndex(ring)] = value;
  latestPub(memory).add(0, 1);
}

/** Current value for a ring. `NaN` until the worker has pushed. */
export function readLatest(memory: WebAssembly.Memory, scopeIndex = 0): number {
  const buffer = memory.buffer;
  if (isSharedBuffer(buffer)) {
    Atomics.load(new Int32Array(buffer, LATEST_PUB, 1), 0);
  } else {
    latestPub(memory).load(0);
  }
  return latestView(memory)[latestIndex(scopeIndex)]!;
}

export function isStopped(memory: WebAssembly.Memory): boolean {
  return new I32Words(memory.buffer).load(MEM.stop / 4) !== 0;
}

export function requestStop(memory: WebAssembly.Memory): void {
  new I32Words(memory.buffer).store(MEM.stop / 4, 1);
}

export function readFlowCounts(memory: WebAssembly.Memory, count: number): number[] {
  const n = Math.max(0, Math.min(count, FLOW_COUNT_CAP));
  if (n === 0) {
    return [];
  }
  const words = new I32Words(memory.buffer, FLOW_COUNTS, n);
  return Array.from({ length: n }, (_, index) => words.load(index));
}

/** Increment the change counter for one connector. */
export function bumpFlowCount(memory: WebAssembly.Memory, index: number): void {
  if (index < 0 || index >= FLOW_COUNT_CAP) {
    return;
  }
  new I32Words(memory.buffer, FLOW_COUNTS, FLOW_COUNT_CAP).add(index, 1);
}

/** The runner records one consumer invocation per connector after each `tick`. */
export function bumpFlowCounts(memory: WebAssembly.Memory, count: number): void {
  const n = Math.max(0, Math.min(count, FLOW_COUNT_CAP));
  if (n === 0) {
    return;
  }
  const words = new I32Words(memory.buffer, FLOW_COUNTS, n);
  for (let i = 0; i < n; i += 1) {
    words.add(i, 1);
  }
}

export function readSamples(memory: WebAssembly.Memory, scopeIndex = 0): number[] {
  const buffer = memory.buffer;
  if (isSharedBuffer(buffer)) {
    // Worker tick writes the ring, then Atomics.add on flow counts. Load that
    // word first so this thread sees the samples.
    Atomics.load(new Int32Array(buffer, FLOW_COUNTS, 1), 0);
  }
  const view = new DataView(buffer);
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

function gpioWords(memory: WebAssembly.Memory): I32Words {
  return new I32Words(memory.buffer, GPIO_WORDS, GPIO_CAP);
}

export function pinIndex(pin: number): number {
  return ((pin % GPIO_CAP) + GPIO_CAP) % GPIO_CAP;
}

export function readGpio(memory: WebAssembly.Memory, pin: number): number {
  return gpioWords(memory).load(pinIndex(pin)) !== 0 ? 1 : 0;
}

export function writeGpio(memory: WebAssembly.Memory, pin: number, level: number): void {
  gpioWords(memory).store(pinIndex(pin), level !== 0 ? 1 : 0);
}

export function initGpio(memory: WebAssembly.Memory, levels?: ReadonlyMap<number, number>): void {
  if (!levels) {
    return;
  }
  for (const [pin, level] of levels) {
    writeGpio(memory, pin, level);
  }
}
