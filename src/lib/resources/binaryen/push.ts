import binaryen from "binaryen";
import { CTX, MEM, RING_STRIDE, SAMPLE_CAP } from "../../runtime/memory";
import { nameLocals } from "./util";

/** Push a sample into ring 0 (count at 4, samples at 16). */
export function addPush(module: binaryen.Module, sampleCap = SAMPLE_CAP): binaryen.FunctionRef {
  addPushAt(module, sampleCap);
  const fn = module.addFunction(
    "push",
    binaryen.f64,
    binaryen.none,
    [],
    module.call("push_at", [module.local.get(0, binaryen.f64), module.i32.const(0)], binaryen.none),
  );
  nameLocals(fn, ["v"]);
  return fn;
}

/** Push a sample into ring `$buf` (0 keeps the historic layout). */
export function addPushAt(module: binaryen.Module, sampleCap = SAMPLE_CAP): binaryen.FunctionRef {
  const fn = module.addFunction(
    "push_at",
    binaryen.createType([binaryen.f64, binaryen.i32]),
    binaryen.none,
    [binaryen.i32, binaryen.i32, binaryen.i32],
    module.block(null, [
      module.local.set(
        2,
        module.if(
          module.i32.eqz(module.local.get(1, binaryen.i32)),
          module.i32.const(MEM.count),
          module.i32.add(
            module.i32.const(CTX + 16 - RING_STRIDE),
            module.i32.mul(module.local.get(1, binaryen.i32), module.i32.const(RING_STRIDE)),
          ),
        ),
      ),
      module.local.set(
        3,
        module.if(
          module.i32.eqz(module.local.get(1, binaryen.i32)),
          module.i32.const(MEM.samples),
          module.i32.add(module.local.get(2, binaryen.i32), module.i32.const(8)),
        ),
      ),
      module.local.set(4, module.i32.load(0, 4, module.local.get(2, binaryen.i32))),
      module.f64.store(
        0,
        8,
        module.i32.add(
          module.local.get(3, binaryen.i32),
          module.i32.mul(
            module.i32.rem_u(module.local.get(4, binaryen.i32), module.i32.const(sampleCap)),
            module.i32.const(8),
          ),
        ),
        module.local.get(0, binaryen.f64),
      ),
      module.i32.store(
        0,
        4,
        module.local.get(2, binaryen.i32),
        module.i32.add(module.local.get(4, binaryen.i32), module.i32.const(1)),
      ),
    ]),
  );
  nameLocals(fn, ["v", "buf", "count_addr", "samples", "i"]);
  return fn;
}
