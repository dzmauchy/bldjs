import { describe, expect, it } from "vitest";
import { solutionViewFrom } from "@bld/xml/solution/view";
import {
  AbstractSolutionBuilder,
  BrowserSolutionBuilder,
  McuSolutionBuilder,
  WasmSolutionBuilder,
} from "./wasm";
import {
  AbstractConstantBlock,
  AbstractCosBlock,
  AbstractGpioInBlock,
  AbstractGpioOutBlock,
  AbstractOvershootBlock,
  AbstractProductBlock,
  AbstractRandomBlock,
  AbstractScopeBlock,
  AbstractSinBlock,
  AbstractTimerBlock,
  BrowserConstantBlock,
  BrowserCosBlock,
  BrowserGpioInBlock,
  BrowserGpioOutBlock,
  BrowserOvershootBlock,
  BrowserProductBlock,
  BrowserRandomBlock,
  BrowserScopeBlock,
  BrowserSinBlock,
  BrowserTimerBlock,
  McuConstantBlock,
  McuCosBlock,
  McuGpioInBlock,
  McuGpioOutBlock,
  McuOvershootBlock,
  McuProductBlock,
  McuRandomBlock,
  McuScopeBlock,
  McuSinBlock,
  McuTimerBlock,
} from "../moonbit";
import { createSharedMemory, readSamples } from "../runtime/memory";
import { instantiateGenerator } from "../runtime/generator";

describe("AbstractSolutionBuilder and Target Descendants", () => {
  it("encapsulates browser target wasm-gc in BrowserSolutionBuilder", () => {
    const builder = new BrowserSolutionBuilder();
    expect(builder).toBeInstanceOf(AbstractSolutionBuilder);
    expect(builder.target).toBe("wasm-gc");
    expect(builder.getBlock("timer")).toBeInstanceOf(BrowserTimerBlock);
    expect(builder.getBlock("scope")).toBeInstanceOf(BrowserScopeBlock);
    expect(builder.getBlock("sin")).toBeInstanceOf(BrowserSinBlock);
    expect(builder.getBlock("cos")).toBeInstanceOf(BrowserCosBlock);
    expect(builder.getBlock("overshoot")).toBeInstanceOf(BrowserOvershootBlock);
    expect(builder.getBlock("product")).toBeInstanceOf(BrowserProductBlock);
    expect(builder.getBlock("random")).toBeInstanceOf(BrowserRandomBlock);
    expect(builder.getBlock("constant")).toBeInstanceOf(BrowserConstantBlock);
    expect(builder.getBlock("gpio_in")).toBeInstanceOf(BrowserGpioInBlock);
    expect(builder.getBlock("gpio_out")).toBeInstanceOf(BrowserGpioOutBlock);
  });

  it("encapsulates MCU target wasm in McuSolutionBuilder", () => {
    const builder = new McuSolutionBuilder();
    expect(builder).toBeInstanceOf(AbstractSolutionBuilder);
    expect(builder.target).toBe("wasm");
    expect(builder.getBlock("timer")).toBeInstanceOf(McuTimerBlock);
    expect(builder.getBlock("scope")).toBeInstanceOf(McuScopeBlock);
    expect(builder.getBlock("sin")).toBeInstanceOf(McuSinBlock);
    expect(builder.getBlock("cos")).toBeInstanceOf(McuCosBlock);
    expect(builder.getBlock("overshoot")).toBeInstanceOf(McuOvershootBlock);
    expect(builder.getBlock("product")).toBeInstanceOf(McuProductBlock);
    expect(builder.getBlock("random")).toBeInstanceOf(McuRandomBlock);
    expect(builder.getBlock("constant")).toBeInstanceOf(McuConstantBlock);
    expect(builder.getBlock("gpio_in")).toBeInstanceOf(McuGpioInBlock);
    expect(builder.getBlock("gpio_out")).toBeInstanceOf(McuGpioOutBlock);
  });

  it("provides AbstractXXX and target descendants for each block with target-specific representations", () => {
    expect(new BrowserTimerBlock()).toBeInstanceOf(AbstractTimerBlock);
    expect(new McuTimerBlock()).toBeInstanceOf(AbstractTimerBlock);
    expect(new BrowserTimerBlock().target).toBe("wasm-gc");
    expect(new McuTimerBlock().target).toBe("wasm");

    expect(new BrowserScopeBlock()).toBeInstanceOf(AbstractScopeBlock);
    expect(new McuScopeBlock()).toBeInstanceOf(AbstractScopeBlock);

    expect(new BrowserGpioInBlock()).toBeInstanceOf(AbstractGpioInBlock);
    expect(new McuGpioInBlock()).toBeInstanceOf(AbstractGpioInBlock);

    expect(new BrowserGpioOutBlock()).toBeInstanceOf(AbstractGpioOutBlock);
    expect(new McuGpioOutBlock()).toBeInstanceOf(AbstractGpioOutBlock);

    expect(new BrowserSinBlock()).toBeInstanceOf(AbstractSinBlock);
    expect(new McuSinBlock()).toBeInstanceOf(AbstractSinBlock);

    expect(new BrowserCosBlock()).toBeInstanceOf(AbstractCosBlock);
    expect(new McuCosBlock()).toBeInstanceOf(AbstractCosBlock);

    expect(new BrowserOvershootBlock()).toBeInstanceOf(AbstractOvershootBlock);
    expect(new McuOvershootBlock()).toBeInstanceOf(AbstractOvershootBlock);

    expect(new BrowserRandomBlock()).toBeInstanceOf(AbstractRandomBlock);
    expect(new McuRandomBlock()).toBeInstanceOf(AbstractRandomBlock);

    expect(new BrowserConstantBlock()).toBeInstanceOf(AbstractConstantBlock);
    expect(new McuConstantBlock()).toBeInstanceOf(AbstractConstantBlock);

    expect(new BrowserProductBlock()).toBeInstanceOf(AbstractProductBlock);
    expect(new McuProductBlock()).toBeInstanceOf(AbstractProductBlock);
  });
});

describe("Unit Tests: Browser WASM Generation (wasm-gc)", () => {
  it("generates valid wasm-gc binary and browser runtime text for linear sin pipeline", async () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "sin" },
        { id: 3, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      ],
    );

    const builder = new BrowserSolutionBuilder();
    const result = await builder.build(view, { generatorId: 3, delayMs: 10 });

    expect(result.target).toBe("wasm-gc");
    expect(result.wasm).toBeInstanceOf(Uint8Array);
    expect(result.wasm.length).toBeGreaterThan(0);
    expect(WebAssembly.validate(result.wasm.slice().buffer)).toBe(true);

    // Verify browser-specific text
    expect(result.text).toContain('fn date_now() -> Double = "Date" "now"');
    expect(result.text).toContain('fn math_sin(x : Double) -> Double = "Math" "sin"');
    expect(result.text).toContain('fn js_set_interval(cb : () -> Unit, ms : Int) -> Int = "js" "setInterval"');
    expect(result.text).toContain('fn host_push(v : Double, ring : Int) -> Unit = "host" "push"');
    expect(result.text).toContain("pub fn start(delay_ms : Int) -> Unit");
    expect(result.text).not.toContain("host_wait_event");
    expect(result.text).not.toContain("host_timer_start");

    // Execute in browser wasm-gc runtime
    const memory = createSharedMemory();
    const gen = await instantiateGenerator(result.wasm, memory, () => 0.5);
    gen.tick();
    expect(readSamples(memory, 0)[0]).toBeCloseTo(Math.sin(0.5));
  });

  it("generates valid wasm-gc binary for product combination", async () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "product", count: 2, def: 1 },
        { id: 3, defId: "constant", value: 3 },
        { id: 4, defId: "constant", value: 4 },
        { id: 5, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
        { fromBlock: 2, fromOut: "out[1]", toBlock: 4, toIn: "in" },
        { fromBlock: 3, fromOut: "out", toBlock: 5, toIn: "in" },
        { fromBlock: 4, fromOut: "out", toBlock: 5, toIn: "in" },
      ],
    );

    const builder = new BrowserSolutionBuilder();
    const result = await builder.build(view, { generatorId: 5, delayMs: 10 });
    expect(WebAssembly.validate(result.wasm.slice().buffer)).toBe(true);
    expect(result.text).toContain("fn product(");
  });
});

describe("Unit Tests: MCU WASM Generation (wasm)", () => {
  it("generates valid linear wasm binary and MCU runtime text for linear sin pipeline", async () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "sin" },
        { id: 3, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      ],
    );

    const builder = new McuSolutionBuilder();
    const result = await builder.build(view, { generatorId: 3, delayMs: 10 });

    expect(result.target).toBe("wasm");
    expect(result.wasm).toBeInstanceOf(Uint8Array);
    expect(result.wasm.length).toBeGreaterThan(0);
    expect(WebAssembly.validate(result.wasm.slice().buffer)).toBe(true);

    // Verify MCU-specific text
    expect(result.text).toContain('extern "wasm" fn host_wait_event(timeout_ms : Int) -> Int = "env" "wait_event"');
    expect(result.text).toContain('extern "wasm" fn host_timer_start(timer_id : Int, period_us : Int) = "env" "timer_start"');
    expect(result.text).toContain('extern "wasm" fn host_usb_write(ptr : Int, len : Int) -> Int = "env" "usb_write"');
    expect(result.text).toContain("pub fn app_main() -> Unit");
    expect(result.text).toContain("priv struct McuState");
    expect(result.text).not.toContain('"Date" "now"');
    expect(result.text).not.toContain('"js" "setInterval"');
    expect(result.text).not.toContain('"Math" "sin"');
  });

  it("generates valid linear wasm binary for GPIO event-driven mode", async () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "gpio_out", pin: 2 },
        { id: 2, defId: "gpio_in", pin: 0 },
      ],
      [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
    );

    const builder = new McuSolutionBuilder();
    const result = await builder.build(view, { generatorId: 2 });

    expect(result.target).toBe("wasm");
    expect(WebAssembly.validate(result.wasm.slice().buffer)).toBe(true);
    expect(result.text).toContain("host_attach_irq(0, 3)");
    expect(result.text).toContain("if event_type == 2");
    expect(result.text).not.toContain("host_timer_start");
  });

  it("generates valid linear wasm binary for second-order overshoot step response", async () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "overshoot", zeta: 0.6, omega: 3 },
        { id: 3, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      ],
    );

    const builder = new McuSolutionBuilder();
    const result = await builder.build(view, { generatorId: 3 });

    expect(WebAssembly.validate(result.wasm.slice().buffer)).toBe(true);
    expect(result.text).toContain("fn overshoot(");
    expect(result.text).toContain("let zeta = 0.6");
    expect(result.text).toContain("let w = 3.0");
    expect(result.text).toContain("math_exp(");
    expect(result.text).toContain("math_sqrt(");
  });
});

describe("WasmSolutionBuilder Composition", () => {
  it("builds both browser wasm-gc and MCU linear wasm modules concurrently", async () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "sin" },
        { id: 3, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      ],
    );

    const builder = new WasmSolutionBuilder();
    const assembly = await builder.build(view, { generatorId: 3, delayMs: 10 });

    expect(assembly.wasm).toBeInstanceOf(Uint8Array);
    expect(assembly.prodWasm).toBeInstanceOf(Uint8Array);
    expect(WebAssembly.validate(assembly.wasm.slice().buffer)).toBe(true);
    expect(WebAssembly.validate(assembly.prodWasm.slice().buffer)).toBe(true);
    expect(assembly.connectors).toHaveLength(2);
    expect(assembly.text).toContain("fn sin(");
  });
});
