import binaryen from "binaryen";
import { exportFunc, nameLocals } from "../util";

/**
 * quantizer — Control Systems.
 * inputs: $ctx, $in f64; outputs: $out f64
 * Parks from $ctx.delay_ns when the worker run-loop asks it to wait.
 */
export function addQuantizer(module: binaryen.Module): binaryen.FunctionRef {
  const fn = module.addFunction(
    "quantizer",
    binaryen.createType([binaryen.i32, binaryen.f64]),
    binaryen.f64,
    [],
    module.local.get(1, binaryen.f64),
  );
  nameLocals(fn, ["ctx", "in"]);
  exportFunc(module, "quantizer");
  return fn;
}
