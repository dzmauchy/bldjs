import { describe, expect, it } from "vitest";
import { DEFAULT_PERIOD_MS } from "@bld/xml/blocks/cs/ids";
import { associateBuiltinModels } from "@bld/xml/blocks/builtin";
import { Diagram, type Link } from "@bld/xml/blocks/diagram";
import { loadDiagramSolution } from "@bld/xml/diagram/compile";
import { serializeCanvas } from "@bld/xml/diagram/xml";
import { I32_ATOMIC_OPCODE, hasThreadsOpcode } from "./moonbit";
import { compileGenerator, generatorText } from "./compile";
import { instantiateGenerator } from "./runtime/generator";
import { createEnvImports } from "./runtime/env-host";
import { createMemory, readGpio, writeGpio } from "./runtime/memory";
import { wasmDeployFrame, WASM_MAGIC } from "./runtime/webusb";

function catalog() {
  const diagram = new Diagram("workspace", "Workspace");
  associateBuiltinModels(diagram);
  return diagram.catalog();
}

function sinPipeline(): { nodes: { id: number; defId: string }[]; links: Link[] } {
  return {
    nodes: [
      { id: 1, defId: "scope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "timer" },
    ],
    links: [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
    ],
  };
}

describe("compileGenerator", () => {
  it("emits MoonBit wasm-gc with browser Math/Date/setInterval bindings", async () => {
    const { nodes, links } = sinPipeline();
    const compiled = (await compileGenerator(3, nodes, links))!;
    expect(compiled.scopeId).toBe(1);
    expect(compiled.delayMs).toBe(DEFAULT_PERIOD_MS);
    expect(compiled.text).toContain("fn sin(_ctx : Int, input : C1) -> C1");
    expect(compiled.text).toContain("fn timer(_ctx : Int, input : C1) -> Unit");
    expect(compiled.text).toContain("fn scope(_ctx : Int) -> C1");
    expect(compiled.text).toContain("math_sin(");
    expect(compiled.text).toContain("js_set_interval(tick, delay_ms)");
    expect(compiled.text).toContain('fn math_sin(x : Double) -> Double = "Math" "sin"');
    expect(compiled.text).toContain('fn date_now() -> Double = "Date" "now"');
    expect(compiled.text).toContain('fn js_set_interval(cb : () -> Unit, ms : Int) -> Int = "js" "setInterval"');
    expect(compiled.text).toContain("pub fn tick() -> Unit");
    expect(compiled.text).toContain("  stopped()");
    expect(compiled.text).toContain("fn stopped() -> Unit");
    expect(compiled.text).toContain('extern "wasm" fn i32_atomic_load');
    expect(compiled.text).toContain("i32.atomic.load");
    expect(compiled.text).toContain("pub fn start(delay_ms : Int) -> Unit");
    expect(compiled.text).not.toContain("fn quantizer");
    expect(compiled.text).not.toContain("memory.atomic.wait32");
    expect(compiled.text).not.toContain("setTimeout");
    expect(WebAssembly.validate(compiled.wasm.slice().buffer)).toBe(true);
    expect(hasThreadsOpcode(compiled.wasm, I32_ATOMIC_OPCODE.load)).toBe(true);
    expect(hasThreadsOpcode(compiled.wasm, I32_ATOMIC_OPCODE.store)).toBe(false);
    expect([...compiled.prodWasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);
    expect(WebAssembly.validate(compiled.prodWasm.slice().buffer)).toBe(true);
    const prodImports = WebAssembly.Module.imports(new WebAssembly.Module(compiled.prodWasm.slice().buffer)).map(
      (item) => `${item.module}.${item.name}`,
    );
    expect(prodImports).toContain("env.wait_event");
    expect(prodImports).toContain("env.timer_start");
    expect(prodImports).toContain("env.usb_write");
    expect(prodImports.some((item) => item.startsWith("Math."))).toBe(false);
    expect(prodImports.some((item) => item.startsWith("js."))).toBe(false);
    const prodExports = WebAssembly.Module.exports(new WebAssembly.Module(compiled.prodWasm.slice().buffer)).map(
      (item) => item.name,
    );
    expect(prodExports).toContain("app_main");
    expect(prodExports).toContain("tick");
    const inst = await WebAssembly.instantiate(compiled.prodWasm.slice().buffer, createEnvImports());
    expect(typeof inst.instance.exports.tick).toBe("function");
    expect(typeof inst.instance.exports.app_main).toBe("function");
    const frame = wasmDeployFrame(compiled.prodWasm);
    expect(new DataView(frame.buffer).getUint32(0, true)).toBe(WASM_MAGIC);
    expect(new DataView(frame.buffer).getUint32(4, true)).toBe(compiled.prodWasm.byteLength);
  });

  it("walks a cos transformer", async () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "cos" },
      { id: 3, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
    ];
    const compiled = (await compileGenerator(3, nodes, links))!;
    expect(compiled.defId).toBe("timer");
    expect(compiled.channels).toEqual([{ scopeId: 1, label: "cos" }]);
    expect(compiled.text).toContain("fn cos(_ctx : Int, input : C1) -> C1");
    expect(compiled.text).toContain("cos(0,");
    expect(compiled.text).toContain("timer(0,");
  });

  it("walks an overshoot transformer and bakes ζ", async () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "overshoot", zeta: 0.5 },
      { id: 3, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
    ];
    const compiled = (await compileGenerator(3, nodes, links))!;
    expect(compiled.channels).toEqual([{ scopeId: 1, label: "overshoot" }]);
    expect(compiled.text).toContain("fn overshoot(_ctx : Int, input : C1) -> C1");
    expect(compiled.text).toContain("math_exp(");
    expect(compiled.text).toContain('fn math_exp(x : Double) -> Double = "Math" "exp"');
    expect(compiled.text).not.toContain("math_sqrt");
    expect(WebAssembly.validate(compiled.wasm.slice().buffer)).toBe(true);
  });

  it("emits a fork into two push rings", async () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "scope" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 4, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
    ];
    const compiled = (await compileGenerator(4, nodes, links))!;
    expect(compiled.scopeIds).toEqual([1, 2]);
    expect(compiled.text).toContain("fn scope_1(");
    expect(compiled.text).toContain("fn scope_2(");
    expect(compiled.text).toContain("fn fork_4_in(");
    expect(compiled.text).toContain("host_push(");
    expect(WebAssembly.validate(compiled.wasm.slice().buffer)).toBe(true);
  });

  it("needs a scope", async () => {
    const nodes = [{ id: 4, defId: "timer" }];
    expect(await compileGenerator(4, nodes, [])).toBeUndefined();
  });

  it("compiles GPIO in/out with a simulated pin toggle", async () => {
    const nodes = [
      { id: 1, defId: "gpio_out", pin: 1 },
      { id: 2, defId: "gpio_in", pin: 0 },
    ];
    const links: Link[] = [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }];
    const compiled = (await compileGenerator(2, nodes, links))!;
    expect(compiled.defId).toBe("gpio_in");
    expect(compiled.delayMs).toBe(0);
    expect(compiled.text).toContain("host_pin_read(0)");
    expect(compiled.text).toContain("host_pin_write(1,");
    expect(compiled.text).toContain('fn host_pin_read(pin : Int) -> Int = "host" "pin_read"');
    const prod = compiled.prodWasm;
    const prodText = compiled.text;
    expect(prodText).not.toContain('= "env" "pin_read"');
    const prodImports = WebAssembly.Module.imports(new WebAssembly.Module(prod.slice().buffer)).map(
      (item) => `${item.module}.${item.name}`,
    );
    expect(prodImports).toContain("env.pin_read");
    expect(prodImports).toContain("env.pin_write");
    expect(WebAssembly.validate(compiled.wasm.slice().buffer)).toBe(true);

    const memory = createMemory(false);
    writeGpio(memory, 0, 1);
    const gen = await instantiateGenerator(compiled.wasm, memory);
    gen.tick();
    expect(readGpio(memory, 1)).toBe(1);
    writeGpio(memory, 0, 0);
    gen.tick();
    expect(readGpio(memory, 1)).toBe(0);
  });

  it("uses typed consumers even without stages", async () => {
    const text = await generatorText("timer");
    expect(text).toContain("type C1 = (Double) -> Unit");
    expect(text).toContain("pub fn tick() -> Unit");
    expect(text).toContain("timer(0,");
    expect(text).toContain("scope(0)");
    expect(text).not.toContain("fn sin(");
  });

  it("builds XML first, infers types, then emits wasm", async () => {
    const xml = serializeCanvas({
      id: "diag_cs",
      name: "CS pipeline",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:30:00Z",
      blocks: [
        { id: 1, defId: "scope", x: 0, y: 0 },
        { id: 2, defId: "sin", x: 180, y: 0 },
        { id: 3, defId: "timer", x: 360, y: 0 },
      ],
      links: [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      ],
    });
    const solution = loadDiagramSolution(xml, catalog());
    const compiled = await compileGenerator(3, solution.nodes, solution.links);
    expect(compiled?.wasm[0]).toBe(0);
    expect(String.fromCharCode(compiled!.wasm[1]!, compiled!.wasm[2]!, compiled!.wasm[3]!)).toBe("asm");
  });
});
