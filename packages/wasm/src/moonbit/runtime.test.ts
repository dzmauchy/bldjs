import { describe, expect, it } from "vitest";
import { MEM } from "../runtime/memory";
import { I32_ATOMIC_OPCODE, emitI32Atomics, hasThreadsOpcode, i32Atomic } from "./atomics";
import { compileMoonbit } from "./compile";
import { emitStart, emitStopped, preamble } from "./runtime";

describe("extern wasm stopped", () => {
  it("loads the stop word through i32.atomic.load, not wait", () => {
    const source = emitStopped();
    expect(source).toContain("fn stopped() -> Unit");
    expect(source).toContain(`${i32Atomic("load").name}(${MEM.stop})`);
    expect(source).not.toContain("memory.atomic.wait32");
    expect(source).not.toContain("memory.atomic.wait64");
    expect(preamble()).toContain(emitI32Atomics([i32Atomic("load")]));
    expect(preamble()).toContain(source);
    expect(preamble()).toContain("i32.atomic.load");
    expect(preamble()).not.toContain("i32.atomic.store");
  });

  it("compiles stopped into wasm-gc and runs tick", async () => {
    const source = `${emitI32Atomics([i32Atomic("load")])}
${emitStopped()}
fn js_set_interval(cb : () -> Unit, ms : Int) -> Int = "js" "setInterval"

pub fn tick() -> Unit {
  stopped()
}
${emitStart()}
`;
    const wasm = await compileMoonbit(source);
    expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);
    expect(hasThreadsOpcode(wasm, I32_ATOMIC_OPCODE.load)).toBe(true);
    const inst = await WebAssembly.instantiate(wasm.slice().buffer, {
      js: { setInterval: () => 0 },
      "moonbit:ffi": {
        make_closure: (fn: (...args: unknown[]) => unknown, closure: unknown) => fn.bind(null, closure),
      },
    });
    const tick = inst.instance.exports.tick;
    expect(typeof tick).toBe("function");
    (tick as () => void)();
  });
});
