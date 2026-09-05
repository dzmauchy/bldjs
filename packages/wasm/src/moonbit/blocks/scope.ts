import { SCOPE_BLOCK } from "../block";
import type { MoonBlockEmit } from "../types";

/**
 * scope — XML `() → c<f64>[]`. Extra `ctx : Int`.
 * Returns plot sinks; `length` is the number of outgoing connectors.
 */
export function emitScope(opts: MoonBlockEmit = {}): string {
  return SCOPE_BLOCK.emit(opts);
}
