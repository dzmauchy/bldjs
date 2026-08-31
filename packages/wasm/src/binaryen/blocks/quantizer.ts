import binaryen from "binaryen";
import { addConsumerWrap, type WasmBlockEmit } from "../consumer";
import type { WasmCatalogTypes } from "../gc-types";

/** Quantizer period in nanoseconds (`10 ms`). */
export const QUANTIZER_PERIOD_NS = 10_000_000;

/**
 * quantizer — XML `c<f64> → c<f64>`. Extra `$ctx i32`.
 * Forwards `$in`, then `memory.atomic.wait32` when memory is shared.
 * The generator worker spaces ticks with `setInterval`, so the wait timeout is
 * 0 (the instruction is present; {@link QUANTIZER_PERIOD_NS} is the catalog period).
 */
export function addQuantizer(
  module: binaryen.Module,
  types: WasmCatalogTypes,
  opts: WasmBlockEmit = {},
): binaryen.FunctionRef {
  return addConsumerWrap(
    module,
    types,
    opts.name ?? "quantizer",
    (value) => value,
    opts.sharedMemory
      ? (bin) => bin.drop(bin.call("wait", [bin.i64.const(0)], binaryen.i32))
      : undefined,
  );
}
