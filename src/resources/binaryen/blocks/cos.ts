import binaryen from "binaryen";
import { exportFunc, nameLocals } from "../util";

/** cos — Control Systems. inputs: $ctx, $in f64; outputs: $out f64 */
export function addCos(module: binaryen.Module): binaryen.FunctionRef {
  const fn = module.addFunction(
    "cos",
    binaryen.createType([binaryen.i32, binaryen.f64]),
    binaryen.f64,
    [],
    module.call("host_cos", [module.local.get(1, binaryen.f64)], binaryen.f64),
  );
  nameLocals(fn, ["ctx", "in"]);
  exportFunc(module, "cos");
  return fn;
}
