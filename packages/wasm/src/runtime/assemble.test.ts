import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "@bld/xml/blocks/builtin";
import { Diagram } from "@bld/xml/blocks/diagram";
import { BLOCK_SCRIPTS, I32_ATOMIC_OPCODE, QUANTIZER_PERIOD_NS, hasThreadsOpcode, preamble } from "../moonbit";
import { assembleModule, blockTypeWat, runtimeTypeWat } from "./assemble";
import { createMemory, readSamples } from "./memory";
import { instantiateGenerator } from "./generator";
import { blockSignature } from "./signatures";

function wasmImports(wasm: Uint8Array): { module: string; name: string }[] {
  return WebAssembly.Module.imports(new WebAssembly.Module(wasm.slice().buffer)).map((item) => ({
    module: item.module,
    name: item.name,
  }));
}

describe("block MoonBit assembly", () => {
  it("keeps one MoonBit script per XML block", () => {
    expect(Object.keys(BLOCK_SCRIPTS).sort()).toEqual([
      "cos",
      "gpio_in",
      "gpio_out",
      "overshoot",
      "random",
      "scope",
      "sin",
      "timer",
    ]);
    for (const id of ["timer", "random", "gpio_in"] as const) {
      const source = BLOCK_SCRIPTS[id]!();
      expect(source).toContain(`fn ${id}(_ctx : Int, input : C1) -> Unit`);
    }
    for (const id of ["sin", "cos", "overshoot"] as const) {
      const source = BLOCK_SCRIPTS[id]!();
      expect(source).toContain(`fn ${id}(_ctx : Int, input : C1) -> C1`);
    }
    expect(BLOCK_SCRIPTS.scope!()).toContain("fn scope(_ctx : Int) -> C1");
    expect(BLOCK_SCRIPTS.gpio_out!()).toContain("fn gpio_out(_ctx : Int) -> C1");
    expect(BLOCK_SCRIPTS.gpio_in!({ pin: 3 })).toContain("host_pin_read(3)");
    expect(BLOCK_SCRIPTS.overshoot!({ zeta: 0.7 })).toContain("-0.7 * t");
    expect(BLOCK_SCRIPTS.scope!({ length: 2, rings: [0, 1] })).toContain("fn scope(_ctx : Int) -> (C1, C1)");
  });

  it("matches XML port names as MoonBit params (input is XML in)", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const cat = diagram.catalog();
    for (const id of Object.keys(BLOCK_SCRIPTS)) {
      const sig = blockSignature(cat.block(id)!);
      const source = BLOCK_SCRIPTS[id]!();
      expect(source, id).toContain(`fn ${id}(_ctx : Int`);
      if (sig.params.some((port) => port.name === "in")) {
        expect(source, id).toContain("input : C1");
      }
    }
    expect(QUANTIZER_PERIOD_NS).toBe(10_000_000);
  });

  it("assembles every block script into a wasm-gc module", async () => {
    const { text, wasm } = await assembleModule({
      generator: "sin",
      delayMs: 10,
      sharedMemory: true,
    });
    expect(text).toContain("fn sin(_ctx : Int, input : C1) -> C1");
    expect(text).toContain("fn timer(_ctx : Int, input : C1) -> Unit");
    expect(text).toContain("fn scope(_ctx : Int) -> C1");
    expect(text).toContain("pub fn tick() -> Unit");
    expect(text).toContain("  stopped()");
    expect(text).toContain("fn stopped() -> Unit");
    expect(text).toContain('extern "wasm" fn i32_atomic_load');
    expect(text).toContain("i32.atomic.load");
    expect(hasThreadsOpcode(wasm, I32_ATOMIC_OPCODE.load)).toBe(true);
    expect(hasThreadsOpcode(wasm, I32_ATOMIC_OPCODE.store)).toBe(false);
    expect(hasThreadsOpcode(wasm, I32_ATOMIC_OPCODE.add)).toBe(false);
    expect(text).toContain("pub fn start(delay_ms : Int) -> Unit");
    expect(text).toContain("js_set_interval(tick, delay_ms)");
    expect(text).toContain('fn math_sin(x : Double) -> Double = "Math" "sin"');
    expect(text).toContain('fn date_now() -> Double = "Date" "now"');
    expect(text).not.toContain("memory.atomic.wait32");
    expect(text).not.toContain("setTimeout");
    expect(text).not.toContain("fn quantizer");
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);

    const imports = wasmImports(wasm);
    expect(imports).toContainEqual({ module: "Math", name: "sin" });
    expect(imports).toContainEqual({ module: "Date", name: "now" });
    expect(imports).toContainEqual({ module: "js", name: "setInterval" });
    expect(imports).toContainEqual({ module: "host", name: "push" });
    expect(imports).toContainEqual({ module: "host", name: "tap" });
    expect(imports).toContainEqual({ module: "moonbit:ffi", name: "make_closure" });
    expect(imports.some((item) => item.module === "host" && item.name === "sin")).toBe(false);
    expect(imports.some((item) => item.module === "env")).toBe(false);

    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    expect(blockTypeWat(blockSignature(diagram.catalog().block("timer")!))).toContain(
      "(type $fn_timer (func (param $ctx i32) (param $in (ref $fn_Double_Unit))))",
    );
    expect(blockTypeWat(blockSignature(diagram.catalog().block("sin")!))).toContain(
      "(type $fn_sin (func (param $ctx i32) (param $in (ref $fn_Double_Unit)) (result $out (ref $fn_Double_Unit))))",
    );
    expect(blockTypeWat(blockSignature(diagram.catalog().block("scope")!))).toContain(
      "(type $fn_scope (func (param $ctx i32) (result $out (ref $array_fn_Double_Unit))))",
    );
    expect(runtimeTypeWat()).toContain("(type $fn_timer (func (param $ctx i32) (param $in (ref $fn_Double_Unit))))");
  });

  it("can skip MoonBit source on the run path", async () => {
    const { text, wasm } = await assembleModule({ stages: ["sin"], delayMs: 10, emitText: false });
    expect(text).toBe("");
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);
  });

  it("emits a module that instantiates without imported linear memory", async () => {
    const { text, wasm } = await assembleModule({ stages: ["sin"], delayMs: 10, sharedMemory: false });
    expect(text).not.toContain("memory.atomic.wait32");
    expect(preamble()).toContain('= "Math" "sin"');
    const memory = createMemory(false);
    const gen = await instantiateGenerator(wasm, memory, () => 0.5);
    gen.tick();
    expect(readSamples(memory)[0]).toBeCloseTo(Math.sin(0.5));
  });
});
