import { describe, expect, it } from "vitest";
import { assembleModule, assembleWasm } from "./assemble";
import { compileGenerator } from "../blocks/cs";
import { createSharedMemory, readFlowCounts, readSamples } from "./memory";
import { instantiateGenerator, startLocalGenerator } from "./generator";

describe("binaryen generator", () => {
  it("assembles block scripts into a valid wasm-gc module", async () => {
    const wasm = await assembleWasm({ stages: ["quantizer", "sin"], delayMs: 10 });
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);
    expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);
  });

  it("ticks sin(pi/2) through the assembled pipeline", async () => {
    const { text, wasm } = await assembleModule({ stages: ["quantizer", "sin"], delayMs: 10 });
    expect(text).toContain("call $timer");
    expect(text).toContain("call $oscilloscope");
    expect(text).toContain("(param $ctx i32)");
    expect(text).toContain("(param $in (ref $c1_f64))");
    expect(text).toContain("(result (ref $array_c1_f64))");
    const memory = createSharedMemory();
    let now = Math.PI / 2;
    const gen = await instantiateGenerator(wasm, memory, () => now);
    gen.tick();
    let samples = readSamples(memory);
    expect(samples).toHaveLength(1);
    expect(Math.abs(samples[0] - 1)).toBeLessThan(1e-9);
    now = 0;
    gen.tick();
    samples = readSamples(memory);
    expect(Math.abs(samples[1])).toBeLessThan(1e-9);
  });

  it("runs a compiled timer pipeline in-process", async () => {
    const compiled = (await compileGenerator(
      4,
      [
        { id: 1, defId: "oscilloscope" },
        { id: 2, defId: "sin" },
        { id: 3, defId: "quantizer" },
        { id: 4, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 3, toIn: "in" },
        { fromBlock: 3, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
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
    const wasm = await assembleWasm({ stages: ["sin"], delayMs: 10 });
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
    const { text, wasm } = await assembleModule({ stages: ["sin"], delayMs: 0 });
    expect(text).toContain("(func $timer");
    expect(text).toContain("(param $in (ref $c1_f64))");
    expect(text).toContain("(func $oscilloscope");
    expect(text).toContain("(result (ref $array_c1_f64))");
    const memory = createSharedMemory();
    const gen = await instantiateGenerator(wasm, memory, () => 0.5);
    gen.tick();
    expect(readSamples(memory)[0]).toBeCloseTo(Math.sin(0.5));
  });

  it("counts each c<f64> connector invocation in the runner, not the runtime", async () => {
    const { wasm, connectors } = await assembleModule({ stages: ["quantizer", "sin"], delayMs: 10_000 });
    expect(connectors.length).toBeGreaterThan(0);
    const memory = createSharedMemory();
    const gen = await instantiateGenerator(wasm, memory, () => 0);
    gen.tick();
    gen.tick();
    expect(readFlowCounts(memory, connectors.length).every((count) => count === 0)).toBe(true);

    const handle = await startLocalGenerator({
      wasm,
      delayMs: 10_000,
      connectors,
      now: () => 0,
    });
    expect(handle.readFlowCounts().every((count) => count === 1)).toBe(true);
    handle.tick?.();
    expect(handle.readFlowCounts().every((count) => count === 2)).toBe(true);
    handle.stop();
  });
});
