import binaryen from "binaryen";
import { exportFunc, nameLocals } from "../util";
import type { WasmCatalogTypes } from "../gc-types";
import type { WasmBlockEmit } from "../consumer";

/** timer — XML `c<f64> → void`. Extra `$ctx i32`. Pushes `$ctx.time` into `$in`. */
export function addTimer(
  module: binaryen.Module,
  types: WasmCatalogTypes,
  opts: WasmBlockEmit = {},
): binaryen.FunctionRef {
  const name = opts.name ?? "timer";
  const fn = module.addFunction(
    name,
    binaryen.createType([binaryen.i32, types.c1_f64]),
    binaryen.none,
    [],
    module.call_ref(
      module.local.get(1, types.c1_f64),
      [module.f64.load(0, 8, module.local.get(0, binaryen.i32))],
      binaryen.none,
    ),
  );
  nameLocals(fn, ["ctx", "in"]);
  exportFunc(module, name);
  return fn;
}
