import { clampPositiveInt } from "./numeric";

/** Convert a count delta over `dtMs` milliseconds into Hertz. */
export function hzFromDelta(prev: number, next: number, dtMs: number): number {
  if (!(dtMs > 0) || !Number.isFinite(dtMs)) {
    return 0;
  }
  const delta = next - prev;
  if (!(delta > 0) || !Number.isFinite(delta)) {
    return 0;
  }
  return (delta * 1000) / dtMs;
}

/** Slowest visual dash cycle. */
export const FLOW_PERIOD_MAX_MS = 2500;
/** Fastest visual dash cycle. 40 ms was too quick on phones. */
export const FLOW_PERIOD_MIN_MS = 200;

/**
 * CSS animation duration for a live connector.
 * Returns `null` when the connector is idle.
 */
export function flowPeriodMs(hz: number): number | null {
  if (!(hz > 0) || !Number.isFinite(hz)) {
    return null;
  }
  return Math.min(FLOW_PERIOD_MAX_MS, Math.max(FLOW_PERIOD_MIN_MS, 1000 / hz));
}

/** Interval used by a generator worker (`setInterval`), never zero. */
export function intervalMs(delayMs: number): number {
  return clampPositiveInt(delayMs, 1);
}

/**
 * Per-connector introspector: count value *changes*, not invocations.
 * The frequency is measured in a 1s window (sliding buffer with a single write pointer)
 * by counting value changes. A steady GPIO level therefore measures 0 Hz after the edge.
 */
export class ConnectorIntrospector {
  readonly count: number;
  readonly slotDurationMs: number;
  readonly windowSlots: number;
  readonly initialAsChange: boolean;

  #buffer: Int32Array;
  #totalChanges: Int32Array;
  #changesThisSlot: Int32Array;
  #writePos = 0;
  #lastTimeMs?: number;
  #last: Array<number | undefined>;

  constructor(count: number, delayMs = 10, initialAsChange = true) {
    this.count = Math.max(0, count);
    this.slotDurationMs = intervalMs(delayMs);
    this.windowSlots = Math.max(1, Math.round(1000 / this.slotDurationMs));
    this.initialAsChange = initialAsChange;
    this.#buffer = new Int32Array(this.windowSlots * this.count);
    this.#totalChanges = new Int32Array(this.count);
    this.#changesThisSlot = new Int32Array(this.count);
    this.#last = Array.from({ length: this.count }, () => undefined);
  }

  /** Current write pointer position in the sliding buffer (0 <= pos < windowSlots). */
  get writePos(): number {
    return this.#writePos;
  }

  /** Record one sample. Returns true when this connector's value changed. */
  observe(index: number, value: number): boolean {
    if (index < 0 || index >= this.count) {
      return false;
    }
    const prev = this.#last[index];
    if (prev === undefined) {
      this.#last[index] = value;
      if (this.initialAsChange) {
        this.#changesThisSlot[index] += 1;
      }
      return true;
    }
    if (Object.is(prev, value)) {
      return false;
    }
    this.#last[index] = value;
    this.#changesThisSlot[index] += 1;
    return true;
  }

  /**
   * Advance the single write pointer through the 1s sliding window buffer.
   * Updates total value changes in the 1s window and returns frequencies in Hz.
   */
  advance(nowMs?: number): number[] {
    if (this.count === 0) {
      return [];
    }
    let steps = 1;
    if (nowMs !== undefined) {
      if (this.#lastTimeMs === undefined) {
        this.#lastTimeMs = nowMs;
        steps = 0;
      } else {
        const elapsed = nowMs - this.#lastTimeMs;
        if (elapsed > 0) {
          steps = Math.floor(elapsed / this.slotDurationMs);
          this.#lastTimeMs += steps * this.slotDurationMs;
        } else {
          steps = 0;
        }
      }
    }

    if (steps >= this.windowSlots) {
      this.#buffer.fill(0);
      this.#totalChanges.fill(0);
      this.#writePos = 0;
      for (let i = 0; i < this.count; i++) {
        const c = this.#changesThisSlot[i]!;
        this.#buffer[i] = c;
        this.#totalChanges[i] = c;
        this.#changesThisSlot[i] = 0;
      }
      this.#writePos = 1 % this.windowSlots;
      return this.frequencies();
    }

    if (steps > 0) {
      for (let i = 0; i < this.count; i++) {
        const offset = this.#writePos * this.count + i;
        const oldChanges = this.#buffer[offset]!;
        const newChanges = this.#changesThisSlot[i]!;
        this.#buffer[offset] = newChanges;
        this.#totalChanges[i] = Math.max(0, this.#totalChanges[i]! - oldChanges + newChanges);
        this.#changesThisSlot[i] = 0;
      }
      this.#writePos = (this.#writePos + 1) % this.windowSlots;

      for (let s = 1; s < steps; s++) {
        for (let i = 0; i < this.count; i++) {
          const offset = this.#writePos * this.count + i;
          const oldChanges = this.#buffer[offset]!;
          this.#buffer[offset] = 0;
          this.#totalChanges[i] = Math.max(0, this.#totalChanges[i]! - oldChanges);
        }
        this.#writePos = (this.#writePos + 1) % this.windowSlots;
      }
    }

    return this.frequencies();
  }

  /** Total value changes in the 1s sliding window for each connector (Hz). */
  frequencies(): number[] {
    return Array.from(this.#totalChanges);
  }

  /** Frequency in Hz for a specific connector. */
  frequency(index: number): number {
    return this.#totalChanges[index] ?? 0;
  }

  reset(): void {
    this.#writePos = 0;
    this.#lastTimeMs = undefined;
    this.#buffer.fill(0);
    this.#totalChanges.fill(0);
    this.#changesThisSlot.fill(0);
    this.#last.fill(undefined);
  }
}
