import binaryen from "binaryen";
import { exportFunc, nameLocals } from "../util";

/** sin — Control Systems. inputs: $ctx, $in f64; outputs: $out f64 */
export function addSin(module: binaryen.Module): binaryen.FunctionRef {
  const fn = module.addFunction(
    "sin",
    binaryen.createType([binaryen.i32, binaryen.f64]),
    binaryen.f64,
    [],
    module.call("host_sin", [module.local.get(1, binaryen.f64)], binaryen.f64),
  );
  nameLocals(fn, ["ctx", "in"]);
  exportFunc(module, "sin");
  return fn;
}
