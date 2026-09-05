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
 * A steady GPIO level therefore measures 0 Hz after the edge.
 */
export class ConnectorIntrospector {
  #last: Array<number | undefined>;

  constructor(readonly count: number) {
    this.#last = Array.from({ length: Math.max(0, count) }, () => undefined);
  }

  /** Record one sample. Returns true when this connector's value changed. */
  observe(index: number, value: number): boolean {
    if (index < 0 || index >= this.count) {
      return false;
    }
    const prev = this.#last[index];
    if (prev !== undefined && Object.is(prev, value)) {
      return false;
    }
    this.#last[index] = value;
    return true;
  }
}
