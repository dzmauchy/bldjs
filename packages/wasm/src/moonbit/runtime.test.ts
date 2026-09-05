import { describe, expect, it } from "vitest";
import { MEM } from "../runtime/memory";
import { compileMoonbit } from "./compile";
import { emitStart, emitStopped, preamble } from "./runtime";

/** Threads opcode `i32.atomic.load` is `0xFE 0x10`. */
function hasI32AtomicLoad(wasm: Uint8Array): boolean {
  for (let i = 0; i < wasm.length - 1; i += 1) {
    if (wasm[i] === 0xfe && wasm[i + 1] === 0x10) {
      return true;
    }
  }
  return false;
}

describe("extern wasm stopped", () => {
  it("defines one i32.atomic.load WAT function, not wait", () => {
    const source = emitStopped();
    expect(source).toContain('extern "wasm" fn stopped() -> Int');
    expect(source).toContain(`(i32.atomic.load (i32.const ${MEM.stop}))`);
    expect(source).not.toContain("memory.atomic.wait32");
    expect(source).not.toContain("memory.atomic.wait64");
    expect(preamble()).toContain(source);
  });

  it("compiles stopped into wasm-gc and runs tick", async () => {
    const source = `${preamble({ now: false })}
pub fn tick() -> Unit {
  let _ = stopped()
}
${emitStart()}
`;
    const wasm = await compileMoonbit(source);
    expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);
    expect(hasI32AtomicLoad(wasm)).toBe(true);
    const inst = await WebAssembly.instantiate(wasm.slice().buffer, {
      js: { setInterval: () => 0 },
      host: { push: () => undefined },
      "moonbit:ffi": {
        make_closure: (fn: (...args: unknown[]) => unknown, closure: unknown) => fn.bind(null, closure),
      },
    });
    const tick = inst.instance.exports.tick;
    expect(typeof tick).toBe("function");
    (tick as () => void)();
  });
});
