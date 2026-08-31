import binaryen from "binaryen";
import { exportFunc, nameLocals } from "./util";
import type { WasmCatalogTypes } from "./gc-types";
import { nopConsumer } from "./gc-types";

/** Hidden fan-in: XML does not declare fork; SolutionBuilder inserts it when many connectors share an input. */
export function addFork(
  module: binaryen.Module,
  types: WasmCatalogTypes,
  name: string,
  arity: number,
): binaryen.FunctionRef {
  const count = Math.max(arity, 1);
  const apply = `${name}_apply`;
  const globals = Array.from({ length: count }, (_, index) => `${name}_inner_${index}`);
  for (const global of globals) {
    module.addGlobal(global, types.c1_f64, true, nopConsumer(module, types));
  }
  const applyFn = module.addFunction(
    apply,
    binaryen.f64,
    binaryen.none,
    [],
    module.block(
      null,
      globals.map((global) =>
        module.call_ref(
          module.global.get(global, types.c1_f64),
          [module.local.get(0, binaryen.f64)],
          binaryen.none,
        ),
      ),
      binaryen.none,
    ),
  );
  nameLocals(applyFn, ["v"]);
  const paramTypes = [binaryen.i32, ...Array.from({ length: count }, () => types.c1_f64)];
  const fn = module.addFunction(
    name,
    binaryen.createType(paramTypes),
    types.c1_f64,
    [],
    module.block(
      null,
      [
        ...globals.map((global, index) => module.global.set(global, module.local.get(index + 1, types.c1_f64))),
        module.ref.func(apply, types.c1_f64),
      ],
      types.c1_f64,
    ),
  );
  nameLocals(fn, ["ctx", ...Array.from({ length: count }, (_, index) => `in${index}`)]);
  exportFunc(module, name);
  return fn;
}
