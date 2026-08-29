import binaryen from "binaryen";
import { exportFunc, nameLocals } from "../util";

/** timer — Control Systems. inputs: $ctx; outputs: $out f64 */
export function addTimer(module: binaryen.Module): binaryen.FunctionRef {
  const fn = module.addFunction(
    "timer",
    binaryen.i32,
    binaryen.f64,
    [],
    module.f64.load(0, 8, module.local.get(0, binaryen.i32)),
  );
  nameLocals(fn, ["ctx"]);
  exportFunc(module, "timer");
  return fn;
}
