import binaryen from "binaryen";
import { addConsumerWrap, type WasmBlockEmit } from "../consumer";
import type { WasmCatalogTypes } from "../gc-types";

/**
 * quantizer — XML `c<f64> → c<f64>`.
 * Passes samples through; the generator worker spaces ticks with `setInterval`.
 */
export function addQuantizer(
  module: binaryen.Module,
  types: WasmCatalogTypes,
  opts: WasmBlockEmit = {},
): binaryen.FunctionRef {
  return addConsumerWrap(module, types, opts.name ?? "quantizer", (value) => value);
}
