import { describe, expect, it } from "vitest";
import { assembleModule, assembleWasm } from "./assemble";
import { compileGenerator } from "../compile";
import { createSharedMemory, readFlowCounts, readSamples } from "./memory";
import { instantiateGenerator, startLocalGenerator } from "./generator";

describe("MoonBit generator", () => {
  it("assembles block scripts into a valid wasm-gc module", async () => {
    const wasm = await assembleWasm({ generator: "sin", delayMs: 10 });
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);
    expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);
  });

  it("ticks sin(pi/2) through the assembled pipeline", async () => {
    const { text, wasm } = await assembleModule({ generator: "sin", delayMs: 10 });
    expect(text).toContain("sin(_ctx : Int, input : C1)");
    expect(text).toContain("scope(_ctx : Int)");
    expect(text).toContain("timer(_ctx : Int, input : C1)");
    const memory = createSharedMemory();
    let now = Math.PI / 2;
    const gen = await instantiateGenerator(wasm, memory, () => now);
    gen.tick();
    let samples = readSamples(memory);
    expect(samples).toHaveLength(1);
    expect(Math.abs(samples[0]! - 1)).toBeLessThan(1e-9);
    now = 0;
    gen.tick();
    samples = readSamples(memory);
    expect(Math.abs(samples[1]!)).toBeLessThan(1e-9);
  });

  it("runs a compiled sin pipeline in-process", async () => {
    const compiled = (await compileGenerator(
      3,
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "sin" },
        { id: 3, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      ],
    ))!;
    const handle = await startLocalGenerator({
      wasm: compiled.wasm,
      delayMs: 0,
      now: () => Math.PI / 2,
    });
    const samples = await handle.snapshot();
    handle.stop();
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((value) => Math.abs(value - 1) < 1e-9)).toBe(true);
  });

  it("ticks on setInterval instead of parking", async () => {
    const wasm = await assembleWasm({ generator: "sin", delayMs: 10 });
    const handle = await startLocalGenerator({
      wasm,
      delayMs: 10,
      now: () => 0.25,
    });
    const first = (await handle.snapshot()).length;
    await new Promise((resolve) => setTimeout(resolve, 35));
    const second = (await handle.snapshot()).length;
    handle.stop();
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
  });

  it("tick writes samples through XML-typed block functions", async () => {
    const { text, wasm } = await assembleModule({ generator: "sin", delayMs: 0 });
    expect(text).toContain("fn sin(_ctx : Int, input : C1) -> C1");
    expect(text).toContain("fn scope(_ctx : Int) -> C1");
    const memory = createSharedMemory();
    const gen = await instantiateGenerator(wasm, memory, () => 0.5);
    gen.tick();
    expect(readSamples(memory)[0]).toBeCloseTo(Math.sin(0.5));
  });

  it("ticks a random generator into [0, 1)", async () => {
    const wasm = await assembleWasm({ generator: "random", delayMs: 10 });
    const memory = createSharedMemory();
    const gen = await instantiateGenerator(wasm, memory, () => 0);
    gen.tick();
    const sample = readSamples(memory)[0]!;
    expect(sample).toBeGreaterThanOrEqual(0);
    expect(sample).toBeLessThan(1);
  });

  it("counts connector value changes, not repeated samples", async () => {
    const { wasm, connectors } = await assembleModule({ generator: "sin", delayMs: 10_000 });
    expect(connectors.length).toBeGreaterThan(0);
    const memory = createSharedMemory();
    const gen = await instantiateGenerator(wasm, memory, () => 0);
    gen.tick();
    gen.tick();
    expect(readFlowCounts(memory, connectors.length).every((count) => count === 0)).toBe(true);

    let now = 0;
    const handle = await startLocalGenerator({
      wasm,
      delayMs: 10_000,
      connectors,
      now: () => now,
    });
    expect(handle.readFlowCounts().every((count) => count === 1)).toBe(true);
    handle.tick?.();
    expect(handle.readFlowCounts().every((count) => count === 1)).toBe(true);
    now = 1;
    handle.tick?.();
    expect(handle.readFlowCounts().every((count) => count === 2)).toBe(true);
    handle.stop();
  });

  it("samples the current GPIO In pin once on start, then only on tick()", async () => {
    const compiled = (await compileGenerator(
      2,
      [
        { id: 1, defId: "gpio_out", pin: 1 },
        { id: 2, defId: "gpio_in", pin: 0 },
      ],
      [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
    ))!;
    expect(compiled.delayMs).toBe(0);
    const handle = await startLocalGenerator({
      wasm: compiled.wasm,
      delayMs: compiled.delayMs,
      connectors: compiled.connectors,
      eventDriven: true,
      gpio: new Map([[0, 1]]),
    });
    expect(handle.gpioLevel(1)).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(handle.gpioLevel(1)).toBe(1);
    expect(handle.readFlowCounts().every((count) => count === 1)).toBe(true);
    handle.tick?.();
    expect(handle.gpioLevel(1)).toBe(1);
    expect(handle.readFlowCounts().every((count) => count === 1)).toBe(true);
    handle.setGpio(0, 0);
    handle.tick?.();
    expect(handle.gpioLevel(1)).toBe(0);
    expect(handle.readFlowCounts().every((count) => count === 2)).toBe(true);
    handle.stop();
  });
});
