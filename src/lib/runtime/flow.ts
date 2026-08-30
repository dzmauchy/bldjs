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

const PERIOD_MIN_MS = 40;
const PERIOD_MAX_MS = 2500;

/** CSS animation period for one dash cycle, derived from measured Hz. */
export function flowPeriodMs(hz: number): number {
  if (!(hz > 0) || !Number.isFinite(hz)) {
    return 0;
  }
  return Math.round(Math.min(PERIOD_MAX_MS, Math.max(PERIOD_MIN_MS, 1000 / hz)));
}

/** Interval used by a generator worker (`setInterval`), never zero. */
export function intervalMs(delayMs: number): number {
  if (!Number.isFinite(delayMs)) {
    return 1;
  }
  return Math.max(1, Math.trunc(delayMs));
}
