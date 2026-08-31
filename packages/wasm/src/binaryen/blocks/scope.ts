import binaryen from "binaryen";
import { exportFunc, nameLocals } from "../util";
import type { WasmCatalogTypes } from "../gc-types";
import type { WasmBlockEmit } from "../consumer";

/**
 * scope — XML `() → c<f64>[]`. Extra `$ctx i32`.
 * Returns a dynamically sized array of plot sinks; `length` is the number of outgoing connectors.
 */
export function addScope(
  module: binaryen.Module,
  types: WasmCatalogTypes,
  opts: WasmBlockEmit = {},
): binaryen.FunctionRef {
  const name = opts.name ?? "scope";
  const length = Math.max(opts.length ?? 1, 1);
  const rings = opts.rings ?? Array.from({ length }, (_, index) => index);
  const plots: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const plotName = `${name}_plot_${index}`;
    const ring = rings[index] ?? index;
    const plot = module.addFunction(
      plotName,
      binaryen.f64,
      binaryen.none,
      [],
      module.call("push_at", [module.local.get(0, binaryen.f64), module.i32.const(ring)], binaryen.none),
    );
    nameLocals(plot, ["v"]);
    plots.push(module.ref.func(plotName, types.c1_f64));
  }
  const fn = module.addFunction(
    name,
    binaryen.i32,
    types.array_c1_f64,
    [],
    module.array.new_fixed(types.array_c1_f64, plots),
  );
  nameLocals(fn, ["ctx"]);
  exportFunc(module, name);
  return fn;
}
