import { DEFAULT_METER_MS, DEFAULT_WINDOW_S, sampleCap } from "./ids";

/**
 * Sliding window of `cap` measurements in a `Float64Array`.
 * Slots start as `NaN`. Head and tail walk the ring; samples are never shifted.
 */
export class WindowBuf {
  readonly cap: number;
  #buf: Float64Array;
  #head = 0;
  #tail = 0;
  #size = 0;

  constructor(cap: number) {
    this.cap = Math.max(1, Math.trunc(cap));
    this.#buf = new Float64Array(this.cap);
    this.#buf.fill(Number.NaN);
  }

  get length(): number {
    return this.#size;
  }

  /** Oldest occupied slot. */
  get head(): number {
    return this.#head;
  }

  /** Next write slot. */
  get tail(): number {
    return this.#tail;
  }

  /** Backing store for tests; do not mutate. */
  get values(): Float64Array {
    return this.#buf;
  }

  push(value: number): void {
    this.#buf[this.#tail] = value;
    this.#tail = this.#tail + 1 === this.cap ? 0 : this.#tail + 1;
    if (this.#size < this.cap) {
      this.#size += 1;
      return;
    }
    this.#head = this.#tail;
  }

  snapshot(): number[] {
    const n = this.#size;
    if (n === 0) {
      return [];
    }
    const out = new Array<number>(n);
    let index = this.#head;
    for (let i = 0; i < n; i += 1) {
      out[i] = this.#buf[index]!;
      index = index + 1 === this.cap ? 0 : index + 1;
    }
    return out;
  }

  clear(): void {
    this.#head = 0;
    this.#tail = 0;
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
