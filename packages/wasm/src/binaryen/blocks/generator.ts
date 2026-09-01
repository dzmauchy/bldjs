import binaryen from "binaryen";
import { exportFunc, nameLocals } from "../util";
import type { WasmCatalogTypes } from "../gc-types";
import type { WasmBlockEmit } from "../consumer";

/** Default generator quantization period in nanoseconds (`10 ms`). */
export const QUANTIZER_PERIOD_NS = 10_000_000;

type BinModule = binaryen.Module;

/**
 * Shared generator: sample from `$ctx.time`, push into `$in`, then run the
 * internal quantizer (`memory.atomic.wait32` when memory is shared).
 * The worker spaces ticks with `setInterval`; the wait timeout is 0.
 */
export abstract class Generator {
  abstract readonly id: string;

  /** Map `$ctx.time` (f64) to the sample pushed into the consumer. */
  abstract sample(module: BinModule, time: number): number;

  add(module: BinModule, types: WasmCatalogTypes, opts: WasmBlockEmit = {}): binaryen.FunctionRef {
    const name = opts.name ?? this.id;
    const time = module.f64.load(0, 8, module.local.get(0, binaryen.i32));
    const push = module.call_ref(
      module.local.get(1, types.c1_f64),
      [this.sample(module, time)],
      binaryen.none,
    );
    const body = opts.sharedMemory
      ? module.block(null, [push, module.drop(module.call("wait", [module.i64.const(0)], binaryen.i32))])
      : push;
    const fn = module.addFunction(
      name,
      binaryen.createType([binaryen.i32, types.c1_f64]),
      binaryen.none,
      [],
      body,
    );
    nameLocals(fn, ["ctx", "in"]);
    exportFunc(module, name);
    return fn;
  }
}

export class TimerGenerator extends Generator {
  readonly id = "timer";

  sample(_module: BinModule, time: number): number {
    return time;
  }
}

export class RandomGenerator extends Generator {
  readonly id = "random";

  sample(module: BinModule, _time: number): number {
    return module.call("host_random", [], binaryen.f64);
  }
}

export function addTimer(
  module: binaryen.Module,
  types: WasmCatalogTypes,
  opts: WasmBlockEmit = {},
): binaryen.FunctionRef {
  return new TimerGenerator().add(module, types, opts);
}

export function addRandom(
  module: binaryen.Module,
  types: WasmCatalogTypes,
  opts: WasmBlockEmit = {},
): binaryen.FunctionRef {
  return new RandomGenerator().add(module, types, opts);
}
