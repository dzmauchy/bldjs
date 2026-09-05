import { DEFAULT_METER_MS, DEFAULT_WINDOW_S, sampleCap } from "./ids";

/**
 * Sliding window of `cap` measurements in a `Float64Array`.
 * Slots start as `NaN`. One write index walks the ring; samples are never shifted.
 * Oldest is slot 0 until the window is full, then the write index.
 */
export class WindowBuf {
  readonly cap: number;
  #buf: Float64Array;
  #pos = 0;
  #size = 0;

  constructor(cap: number) {
    this.cap = Math.max(1, Math.trunc(cap));
    this.#buf = new Float64Array(this.cap);
    this.#buf.fill(Number.NaN);
  }

  get length(): number {
    return this.#size;
  }

  /** Next write slot; oldest occupied slot once the window is full. */
  get index(): number {
    return this.#pos;
  }

  /** Backing store for tests; do not mutate. */
  get values(): Float64Array {
    return this.#buf;
  }

  push(value: number): void {
    this.#buf[this.#pos] = value;
    this.#pos = this.#pos + 1 === this.cap ? 0 : this.#pos + 1;
    if (this.#size < this.cap) {
      this.#size += 1;
    }
  }

  snapshot(): number[] {
    const n = this.#size;
    if (n === 0) {
      return [];
    }
    const out = new Array<number>(n);
    let index = n < this.cap ? 0 : this.#pos;
    for (let i = 0; i < n; i += 1) {
      out[i] = this.#buf[index]!;
      index = index + 1 === this.cap ? 0 : index + 1;
    }
    return out;
  }

  clear(): void {
    this.#pos = 0;
    this.#size = 0;
    this.#buf.fill(Number.NaN);
  }
}

/** Time-windowed scope buffer. Capacity is `N * (1000 / M)` measurements. */
export class SampleBuf {
  private readonly window: WindowBuf;

  constructor(cap = sampleCap(DEFAULT_WINDOW_S, DEFAULT_METER_MS)) {
    this.window = new WindowBuf(cap);
  }

  push(value: number): void {
    this.window.push(value);
  }

  snapshot(): number[] {
    return this.window.snapshot();
  }

  clear(): void {
    this.window.clear();
  }
}
