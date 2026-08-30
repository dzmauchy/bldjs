import { describe, expect, it } from "vitest";
import { assembleModule, assembleWasm } from "./assemble";
import { compileGenerator } from "../blocks/cs";
import { createHost } from "./host";
import { CTX, createSharedMemory, readSamples } from "./memory";
import { instantiateGenerator, startLocalGenerator } from "./generator";

describe("binaryen generator", () => {
  it("assembles block scripts into a valid wasm-gc module", async () => {
    const wasm = await assembleWasm({ stages: ["quantizer", "sin"], delayMs: 10 });
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);
    expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);
  });

  it("ticks sin(pi/2) through the assembled pipeline", async () => {
    const { text, wasm } = await assembleModule({ stages: ["quantizer", "sin"], delayMs: 10 });
    expect(text).toContain("call_ref $fn_timer");
    expect(text).toContain("(param $ctx i32)");
    expect(text).toContain("(result f64)");
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
        { fromBlock: 4, fromOut: "out", toBlock: 3, toIn: "in" },
        { fromBlock: 3, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" },
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

  it("exports library functions that take $ctx and XML ports", async () => {
    const wasm = await assembleWasm({ stages: ["sin"], delayMs: 0 });
    const memory = createSharedMemory();
    const instantiated = await WebAssembly.instantiate(wasm.slice().buffer, createHost(memory, () => 0.5));
    const view = new DataView(memory.buffer);
    view.setFloat64(CTX, 0.5, true);
    const exports = instantiated.instance.exports as {
      timer: (ctx: number) => number;
      quantizer: (ctx: number, value: number) => number;
      sin: (ctx: number, value: number) => number;
      cos: (ctx: number, value: number) => number;
      oscilloscope: (ctx: number, value: number) => void;
    };
    expect(exports.timer(CTX)).toBe(0.5);
    expect(exports.quantizer(CTX, 2)).toBe(2);
    expect(Math.abs(exports.sin(CTX, Math.PI / 2) - 1)).toBeLessThan(1e-9);
    expect(Math.abs(exports.cos(CTX, 0) - 1)).toBeLessThan(1e-9);
    exports.oscilloscope(CTX, 3);
    expect(readSamples(memory)).toEqual([3]);
  });
});
