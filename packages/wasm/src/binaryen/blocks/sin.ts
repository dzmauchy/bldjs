import binaryen from "binaryen";
import { addConsumerWrap, type WasmBlockEmit } from "../consumer";
import type { WasmCatalogTypes } from "../gc-types";

/** sin — XML `c<f64> → c<f64>`. Extra `$ctx i32`. Maps `$in` through host `f64.sin`. */
export function addSin(
  module: binaryen.Module,
  types: WasmCatalogTypes,
  opts: WasmBlockEmit = {},
): binaryen.FunctionRef {
  return addConsumerWrap(module, types, opts.name ?? "sin", (value) =>
    module.call("host_sin", [value], binaryen.f64),
  );
}
