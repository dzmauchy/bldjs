import binaryen from "binaryen";
import { exportFunc, nameLocals } from "./util";
import type { WasmCatalogTypes } from "./gc-types";
import { nopConsumer } from "./gc-types";

export interface WasmBlockEmit {
  /** WASM function name. Defaults to the XML block id. */
  name?: string;
  /** Dynamic array length (scope `out`). */
  length?: number;
  /** Ring index for each array slot. */
  rings?: readonly number[];
  /** Shared memory + atomics / waits. Off when the page is not cross-origin isolated. */
  sharedMemory?: boolean;
}

type BinModule = binaryen.Module;

/**
 * XML `c<f64> → c<f64>` wrapper: capture `$in` and return a `(ref $c1_f64)` that maps then forwards.
 * Extra runtime param `$ctx i32` is not an XML port.
 */
export function addConsumerWrap(
  module: BinModule,
  types: WasmCatalogTypes,
  name: string,
  mapValue: (value: number) => number,
  afterForward?: (module: BinModule) => number | undefined,
): number {
  const inner = `${name}_inner`;
  const apply = `${name}_apply`;
  module.addGlobal(inner, types.c1_f64, true, nopConsumer(module, types));
  const forward = module.call_ref(
    module.global.get(inner, types.c1_f64),
    [mapValue(module.local.get(0, binaryen.f64))],
    binaryen.none,
  );
  const extra = afterForward?.(module);
  const applyFn = module.addFunction(
    apply,
    binaryen.f64,
    binaryen.none,
    [],
    extra === undefined ? forward : module.block(null, [forward, extra]),
  );
  nameLocals(applyFn, ["v"]);
  const fn = module.addFunction(
    name,
    binaryen.createType([binaryen.i32, types.c1_f64]),
    types.c1_f64,
    [],
    module.block(
      null,
      [module.global.set(inner, module.local.get(1, types.c1_f64)), module.ref.func(apply, types.c1_f64)],
      types.c1_f64,
    ),
  );
  nameLocals(fn, ["ctx", "in"]);
  exportFunc(module, name);
  return fn;
}
