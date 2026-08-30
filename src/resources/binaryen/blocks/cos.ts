import binaryen from "binaryen";
import { addConsumerWrap, type WasmBlockEmit } from "../consumer";
import type { WasmCatalogTypes } from "../gc-types";

/** cos — XML `c<f64> → c<f64>`. Maps `$in` through host `f64.cos`. */
export function addCos(
  module: binaryen.Module,
  types: WasmCatalogTypes,
  opts: WasmBlockEmit = {},
): binaryen.FunctionRef {
  return addConsumerWrap(module, types, opts.name ?? "cos", (value) =>
    module.call("host_cos", [value], binaryen.f64),
  );
}
