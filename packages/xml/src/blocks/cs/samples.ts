import { DEFAULT_METER_MS, DEFAULT_WINDOW_S, sampleCap } from "./ids";

/** Circular window of `cap` measurements (oldest → newest). */
export class WindowBuf {
  readonly cap: number;
  #buf: Float64Array;
  #count = 0;

  constructor(cap: number) {
    this.cap = Math.max(1, Math.trunc(cap));
    this.#buf = new Float64Array(this.cap);
  }

  get length(): number {
    return Math.min(this.#count, this.cap);
  }

  push(value: number): void {
    this.#buf[this.#count % this.cap] = value;
    this.#count += 1;
  }

  snapshot(): number[] {
    const n = this.length;
    if (n === 0) {
      return [];
    }
    const start = this.#count > this.cap ? this.#count % this.cap : 0;
    const out = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      out[i] = this.#buf[(start + i) % this.cap]!;
    }
    return out;
  }

  clear(): void {
    this.#count = 0;
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
