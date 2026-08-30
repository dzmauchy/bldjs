import binaryen from "binaryen";
import { nameLocals } from "./util";
import type { WasmCatalogTypes } from "./gc-types";
import { nopConsumer } from "./gc-types";

/**
 * Wrap a `c<f64>` so each invocation increments a shared-memory counter.
 * Used to measure connector data frequency while the generator is running.
 */
export function addTap(
  module: binaryen.Module,
  types: WasmCatalogTypes,
  name: string,
  addr: number,
): binaryen.FunctionRef {
  const inner = `${name}_inner`;
  const apply = `${name}_apply`;
  module.addGlobal(inner, types.c1_f64, true, nopConsumer(module, types));
  const applyFn = module.addFunction(
    apply,
    binaryen.f64,
    binaryen.none,
    [],
    module.block(null, [
      module.i32.store(
        0,
        4,
        module.i32.const(addr),
        module.i32.add(module.i32.load(0, 4, module.i32.const(addr)), module.i32.const(1)),
      ),
      module.call_ref(
        module.global.get(inner, types.c1_f64),
        [module.local.get(0, binaryen.f64)],
        binaryen.none,
      ),
    ]),
  );
  nameLocals(applyFn, ["v"]);
  const fn = module.addFunction(
    name,
    types.c1_f64,
    types.c1_f64,
    [],
    module.block(
      null,
      [
        module.global.set(inner, module.local.get(0, types.c1_f64)),
        module.ref.func(apply, types.c1_f64),
      ],
      types.c1_f64,
    ),
  );
  nameLocals(fn, ["in"]);
  return fn;
}
