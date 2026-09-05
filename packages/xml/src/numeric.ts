/** Truncate to a positive integer; invalid values use `fallback`. */
export function clampPositiveInt(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(value));
}
