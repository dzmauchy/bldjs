import binaryen from "binaryen";
import { MEM, SAMPLE_CAP } from "../memory";
import { nameLocals } from "./util";

/** Push a sample into the shared ring buffer (count at 4, samples at 16). */
export function addPush(module: binaryen.Module, sampleCap = SAMPLE_CAP): binaryen.FunctionRef {
  const fn = module.addFunction(
    "push",
    binaryen.f64,
    binaryen.none,
    [binaryen.i32],
    module.block(null, [
      module.local.set(1, module.i32.load(0, 4, module.i32.const(MEM.count))),
      module.f64.store(
        MEM.samples,
        8,
        module.i32.mul(
          module.i32.rem_u(module.local.get(1, binaryen.i32), module.i32.const(sampleCap)),
          module.i32.const(8),
        ),
        module.local.get(0, binaryen.f64),
      ),
      module.i32.store(
        0,
        4,
        module.i32.const(MEM.count),
        module.i32.add(module.local.get(1, binaryen.i32), module.i32.const(1)),
      ),
    ]),
  );
  nameLocals(fn, ["v", "i"]);
  return fn;
}
