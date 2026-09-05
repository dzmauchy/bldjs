import { RANDOM_BLOCK, TIMER_BLOCK } from "../block";
import type { MoonBlockEmit } from "../types";

/** Default generator quantization period in nanoseconds (`10 ms`). */
export const QUANTIZER_PERIOD_NS = 10_000_000;

/**
 * Shared generator: sample from `now()`, push into `input`.
 * The imported browser `setInterval` spaces ticks; there is no atomic wait.
 */
export function emitGenerator(id: string, sample: string, opts: MoonBlockEmit = {}): string {
  const name = opts.name ?? id;
  return `fn ${name}(ctx : Int, input : C1) -> Unit {
  let _ = ctx
  input(${sample})
}
`;
}

export function emitTimer(opts: MoonBlockEmit = {}): string {
  return TIMER_BLOCK.emit(opts);
}

export function emitRandom(opts: MoonBlockEmit = {}): string {
  return RANDOM_BLOCK.emit(opts);
}
