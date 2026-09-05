import { DEFAULT_METER_MS, DEFAULT_WINDOW_S, sampleCap } from "./ids";

/**
 * Sliding window in a `Float64Array`. Length is the array length from
 * construction and never changes. Slots start as `NaN`. One write index walks
 * the ring; samples are never shifted.
 */
export class WindowBuf {
  #buf: Float64Array;
  #pos = 0;

  constructor(length: number) {
    this.#buf = new Float64Array(Math.max(1, Math.trunc(length)));
    this.#buf.fill(Number.NaN);
  }

  /** Next write slot; oldest slot once the ring has wrapped. */
  get index(): number {
    return this.#pos;
  }

  /** Backing store for tests; do not mutate. */
  get values(): Float64Array {
    return this.#buf;
  }

  push(value: number): void {
    const n = this.#buf.length;
    this.#buf[this.#pos] = value;
    this.#pos = this.#pos + 1 === n ? 0 : this.#pos + 1;
  }

  snapshot(): number[] {
    const n = this.#buf.length;
    const out = new Array<number>(n);
    let index = this.#pos;
    for (let i = 0; i < n; i += 1) {
      out[i] = this.#buf[index]!;
      index = index + 1 === n ? 0 : index + 1;
    }
    return out;
  }

  clear(): void {
    this.#pos = 0;
    this.#buf.fill(Number.NaN);
  }
}

/** Time-windowed scope buffer. Length is `N * (1000 / M)` measurements. */
export class SampleBuf {
  private readonly window: WindowBuf;

  constructor(length = sampleCap(DEFAULT_WINDOW_S, DEFAULT_METER_MS)) {
    this.window = new WindowBuf(length);
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
