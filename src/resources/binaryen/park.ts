import binaryen from "binaryen";
import { MEM } from "../../lib/runtime/memory";
import { nameLocals } from "./util";

/** Park the worker with memory.atomic.wait32 on the shared wait word. */
export function addPark(module: binaryen.Module): binaryen.FunctionRef {
  const fn = module.addFunction(
    "park",
    binaryen.i64,
    binaryen.none,
    [],
    module.if(
      module.i64.gt_s(module.local.get(0, binaryen.i64), module.i64.const(0n)),
      module.drop(
        module.memory.atomic.wait32(
          module.i32.const(MEM.wait),
          module.i32.const(0),
          module.local.get(0, binaryen.i64),
        ),
      ),
    ),
  );
  nameLocals(fn, ["ns"]);
  return fn;
}
