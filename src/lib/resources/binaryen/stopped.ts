import binaryen from "binaryen";
import { MEM } from "../../runtime/memory";

/** Read the stop flag published by the host (i32.atomic.load at offset 0). */
export function addStopped(module: binaryen.Module): binaryen.FunctionRef {
  return module.addFunction(
    "stopped",
    binaryen.none,
    binaryen.i32,
    [],
    module.i32.atomic.load(0, module.i32.const(MEM.stop)),
  );
}
