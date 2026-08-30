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

export const FLOW_STYLE_COUNT = 10;
export const FLOW_PERIOD_MIN_MS = 40;
export const FLOW_PERIOD_MAX_MS = 2500;

function flowPeriodForStyle(style: number): number {
  if (FLOW_STYLE_COUNT <= 1) {
    return FLOW_PERIOD_MAX_MS;
  }
  const t = style / (FLOW_STYLE_COUNT - 1);
  return Math.round(FLOW_PERIOD_MAX_MS * (FLOW_PERIOD_MIN_MS / FLOW_PERIOD_MAX_MS) ** t);
}

/** Animation periods for styles 0..9, geometric from slow (0) to fast (9). */
export const FLOW_PERIODS_MS: readonly number[] = Array.from({ length: FLOW_STYLE_COUNT }, (_, style) =>
  flowPeriodForStyle(style),
);

/**
 * Pick animating style 0 (slowest) .. 9 (fastest) from measured Hertz.
 * Returns `null` when the connector is idle.
 */
export function flowStyleIndex(hz: number): number | null {
  if (!(hz > 0) || !Number.isFinite(hz)) {
    return null;
  }
  const period = Math.min(FLOW_PERIOD_MAX_MS, Math.max(FLOW_PERIOD_MIN_MS, 1000 / hz));
  const logPeriod = Math.log(period);
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < FLOW_PERIODS_MS.length; i += 1) {
    const dist = Math.abs(Math.log(FLOW_PERIODS_MS[i]!) - logPeriod);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Interval used by a generator worker (`setInterval`), never zero. */
export function intervalMs(delayMs: number): number {
  if (!Number.isFinite(delayMs)) {
    return 1;
  }
  return Math.max(1, Math.trunc(delayMs));
}
