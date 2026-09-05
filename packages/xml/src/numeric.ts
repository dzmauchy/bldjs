/** Truncate to a positive integer; invalid values use `fallback`. */
export function clampPositiveInt(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(value));
}

/** Truncate into `[min, max]`; invalid values use `fallback`. */
export function clampInt(value: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Clamp into `[min, max]` without truncating; invalid values use `fallback`. */
export function clampDouble(value: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
