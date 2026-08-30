import binaryen from "binaryen";
import { exportFunc, nameLocals } from "../util";

/** oscilloscope — Control Systems. inputs: $ctx, $in f64; outputs: none */
export function addOscilloscope(module: binaryen.Module): binaryen.FunctionRef {
  const fn = module.addFunction(
    "oscilloscope",
    binaryen.createType([binaryen.i32, binaryen.f64]),
    binaryen.none,
    [],
    module.call("push", [module.local.get(1, binaryen.f64)], binaryen.none),
  );
  nameLocals(fn, ["ctx", "in"]);
  exportFunc(module, "oscilloscope");
  return fn;
}
