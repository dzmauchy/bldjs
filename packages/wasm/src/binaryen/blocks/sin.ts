import binaryen from "binaryen";
import { addConsumerWrap, type WasmBlockEmit } from "../consumer";
import type { WasmCatalogTypes } from "../gc-types";

/** XML `c<f64> → c<f64>`: map each sample with `sin`. */
export function addSin(
  module: binaryen.Module,
  types: WasmCatalogTypes,
  opts: WasmBlockEmit = {},
): binaryen.FunctionRef {
  return addConsumerWrap(module, types, opts.name ?? "sin", (value) =>
    module.call("host_sin", [value], binaryen.f64),
  );
}
