import binaryen from "binaryen";
import { exportFunc, nameLocals } from "../util";

/**
 * fork — fans one sample to two sinks.
 * WASM is identity; assembleTick calls both destination subgraphs.
 */
export function addFork(module: binaryen.Module): binaryen.FunctionRef {
  const fn = module.addFunction(
    "fork",
    binaryen.createType([binaryen.i32, binaryen.f64]),
    binaryen.f64,
    [],
    module.local.get(1, binaryen.f64),
  );
  nameLocals(fn, ["ctx", "in"]);
  exportFunc(module, "fork");
  return fn;
}
