import { describe, expect, it } from "vitest";
import { MEM } from "../runtime/memory";
import {
  I32_ATOMICS,
  I32_ATOMIC_OPCODE,
  emitI32Atomic,
  emitI32Atomics,
  hasThreadsOpcode,
  i32Atomic,
} from "./atomics";
import { compileMoonbit } from "./compile";
import { emitStart, emitStopped, preamble } from "./runtime";

function intervalBinding(): string {
  return 'fn js_set_interval(cb : () -> Unit, ms : Int) -> Int = "js" "setInterval"';
}

function compileTick(body: string, extras = ""): Promise<Uint8Array> {
  return compileMoonbit(`${extras}
${intervalBinding()}

pub fn tick() -> Unit {
${body}
}
${emitStart()}
`);
}

async function instantiateTick(wasm: Uint8Array): Promise<() => void> {
  expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);
  const inst = await WebAssembly.instantiate(wasm.slice().buffer, {
    js: { setInterval: () => 0 },
    Date: { now: () => 0 },
    Math: Math as unknown as WebAssembly.ModuleImports,
    host: { push() {} },
    "moonbit:ffi": {
      make_closure: (fn: (...args: unknown[]) => unknown, closure: unknown) => fn.bind(null, closure),
    },
  });
  const tick = inst.instance.exports.tick;
  expect(typeof tick).toBe("function");
  return tick as () => void;
}

describe("i32 atomic library", () => {
  it.each(I32_ATOMICS)("emits $name as unnamed WAT $instruction, not wait", (fn) => {
    const source = emitI32Atomic(fn);
    expect(source).toContain(`extern "wasm" fn ${fn.name}(${fn.params}) -> ${fn.result}`);
    expect(source).toContain(fn.watBody);
    expect(source).toContain(fn.instruction);
    expect(source).not.toMatch(/func \$/);
    expect(source).not.toContain("memory.atomic.wait32");
    expect(source).not.toContain("memory.atomic.wait64");
    expect(emitI32Atomics()).toContain(source);
  });

  it.each(I32_ATOMICS)("compiles $name ($instruction) into wasm-gc", async (fn) => {
    const wasm = await compileTick(`  ${fn.use}`, emitI32Atomic(fn));
    expect(hasThreadsOpcode(wasm, fn.opcode), fn.instruction).toBe(true);
    const tick = await instantiateTick(wasm);
    tick();
  });

  it("compiles every i32 atomic into one wasm-gc module", async () => {
    const wasm = await compileTick(
      I32_ATOMICS.map((fn) => `  ${fn.use}`).join("\n"),
      emitI32Atomics(),
    );
    for (const fn of I32_ATOMICS) {
      expect(hasThreadsOpcode(wasm, fn.opcode), fn.instruction).toBe(true);
    }
    expect(hasThreadsOpcode(wasm, 0x01)).toBe(false);
    const tick = await instantiateTick(wasm);
    tick();
  });
});

describe("atomics in generated blocks", () => {
  it("keeps i32.atomic.load when tick uses stopped", async () => {
    expect(emitStopped()).toContain(`${i32Atomic("load").name}(${MEM.stop})`);
    expect(preamble()).toContain(emitI32Atomics());
    const wasm = await compileTick(`  let _ = stopped()`, `${emitI32Atomics()}\n${emitStopped()}`);
    expect(hasThreadsOpcode(wasm, I32_ATOMIC_OPCODE.load)).toBe(true);
    expect(hasThreadsOpcode(wasm, I32_ATOMIC_OPCODE.store)).toBe(false);
    expect(hasThreadsOpcode(wasm, I32_ATOMIC_OPCODE.add)).toBe(false);
  });

  it("emits wasm with load, store, and add when a block uses them", async () => {
    const load = i32Atomic("load");
    const store = i32Atomic("store");
    const add = i32Atomic("add");
    const source = `${preamble({ sin: false, cos: false, random: false, now: true })}
fn timer(ctx : Int, input : C1) -> Unit {
  let _ = ctx
  let flag = ${load.name}(${MEM.stop})
  let _ = ${add.name}(${MEM.count}, 1)
  ${store.name}(${MEM.wait}, flag)
  input(now())
}

fn scope(ctx : Int) -> C1 {
  let _ = ctx
  fn(_v : Double) { }
}

pub fn tick() -> Unit {
  let _ = stopped()
  timer(0, scope(0))
}
${emitStart()}
`;
    expect(source).toContain("fn timer(ctx : Int, input : C1) -> Unit");
    expect(source).toContain(load.instruction);
    expect(source).toContain(store.instruction);
    expect(source).toContain(add.instruction);
    expect(source).not.toContain("memory.atomic.wait32");
    const wasm = await compileMoonbit(source);
    expect(hasThreadsOpcode(wasm, I32_ATOMIC_OPCODE.load)).toBe(true);
    expect(hasThreadsOpcode(wasm, I32_ATOMIC_OPCODE.store)).toBe(true);
    expect(hasThreadsOpcode(wasm, I32_ATOMIC_OPCODE.add)).toBe(true);
    const tick = await instantiateTick(wasm);
    tick();
  });
});
