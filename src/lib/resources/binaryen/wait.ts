import binaryen from "binaryen";
import { MEM } from "../../runtime/memory";
import { nameLocals } from "./util";

/**
 * `memory.atomic.wait32` at `$wait`. Timeout is nanoseconds (`i64`).
 * Shared memory only; the wait cell stays 0 so the timeout always elapses.
 */
export function addWait(module: binaryen.Module): binaryen.FunctionRef {
  const fn = module.addFunction(
    "wait",
    binaryen.i64,
    binaryen.i32,
    [],
    module.memory.atomic.wait32(
      module.i32.const(MEM.wait),
      module.i32.const(0),
      module.local.get(0, binaryen.i64),
    ),
  );
  nameLocals(fn, ["timeout_ns"]);
  return fn;
}

/** `memory.atomic.notify` at `$wait` so a parked quantizer can be woken on stop. */
export function addNotify(module: binaryen.Module): binaryen.FunctionRef {
  const fn = module.addFunction(
    "notify",
    binaryen.i32,
    binaryen.i32,
    [],
    module.memory.atomic.notify(module.i32.const(MEM.wait), module.local.get(0, binaryen.i32)),
  );
  nameLocals(fn, ["count"]);
  return fn;
}
