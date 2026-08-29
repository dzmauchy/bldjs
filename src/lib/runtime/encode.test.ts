import { describe, expect, it } from "vitest";
import { compileGenerator, generatorWat } from "../blocks/cs";
import { encodeLibrary } from "./encode";
import { instantiateGenerator, startLocalGenerator } from "./generator";
import { createHost } from "./host";
import { createSharedMemory, readSamples } from "./memory";

describe("wasm-gc library", () => {
  it("encodes a valid wasm-gc module", () => {
    const wasm = encodeLibrary(["quantizer", "sin"], 10);
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);
    expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);
  });

  it("compiles typed-function wat and ticks sin(pi/2)", async () => {
    const wat = generatorWat(["quantizer", "sin"]);
    expect(wat).toContain("call_ref $fn_timer");
    const wasm = encodeLibrary(["quantizer", "sin"], 10);
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
    const compiled = compileGenerator(
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
    )!;
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

  it("exports library functions that match XML ports", async () => {
    const wasm = encodeLibrary(["sin"], 0);
    const memory = createSharedMemory();
    const instantiated = await WebAssembly.instantiate(wasm.slice().buffer, createHost(memory, () => 0.5));
    const exports = instantiated.instance.exports as {
      timer: () => number;
      quantizer: (value: number) => number;
      sin: (value: number) => number;
      oscilloscope: (value: number) => void;
    };
    expect(exports.timer()).toBe(0.5);
    expect(exports.quantizer(2)).toBe(2);
    expect(Math.abs(exports.sin(Math.PI / 2) - 1)).toBeLessThan(1e-9);
    exports.oscilloscope(3);
    expect(readSamples(memory)).toEqual([3]);
  });
});
