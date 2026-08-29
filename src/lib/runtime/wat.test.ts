import { describe, expect, it } from "vitest";
import { assembleWat } from "./assemble";
import { CTX } from "./memory";
import { compileWat, parseSexps } from "./wat";
import { createHost } from "./host";
import { createSharedMemory, readSamples } from "./memory";
import { instantiateGenerator, startLocalGenerator } from "./generator";
import { compileGenerator } from "../blocks/cs";

describe("WAT compiler", () => {
  it("parses nested lists and comments", () => {
    const [mod] = parseSexps(`
      ;; header
      (module
        (; nested ;)
        (func $add (param $a i32) (param $b i32) (result $sum i32)
          (i32.add (local.get $a) (local.get $b))))
    `);
    expect(Array.isArray(mod) && mod[0]).toBe("module");
  });

  it("compiles a multi-value function", () => {
    const wasm = compileWat(`
      (module
        (func $pair (export "pair") (param $a i32) (param $b i32) (result $left i32) (result $right i32)
          (local.get $a)
          (local.get $b)))
    `);
    expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);
  });

  it("assembles block WAT then compiles a valid wasm-gc module", () => {
    const wat = assembleWat({ stages: ["quantizer", "sin"], delayMs: 10 });
    const wasm = compileWat(wat);
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);
    expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);
  });

  it("ticks sin(pi/2) through the assembled pipeline", async () => {
    const wat = assembleWat({ stages: ["quantizer", "sin"], delayMs: 10 });
    expect(wat).toContain("call_ref $fn_timer");
    expect(wat).toContain("(param $ctx i32)");
    expect(wat).toContain("(result $out f64)");
    const wasm = compileWat(wat);
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

  it("exports library functions that take $ctx and XML ports", async () => {
    const wasm = compileWat(assembleWat({ stages: ["sin"], delayMs: 0 }));
    const memory = createSharedMemory();
    const instantiated = await WebAssembly.instantiate(wasm.slice().buffer, createHost(memory, () => 0.5));
    const view = new DataView(memory.buffer);
    view.setFloat64(CTX, 0.5, true);
    const exports = instantiated.instance.exports as {
      timer: (ctx: number) => number;
      quantizer: (ctx: number, value: number) => number;
      sin: (ctx: number, value: number) => number;
      oscilloscope: (ctx: number, value: number) => void;
    };
    expect(exports.timer(CTX)).toBe(0.5);
    expect(exports.quantizer(CTX, 2)).toBe(2);
    expect(Math.abs(exports.sin(CTX, Math.PI / 2) - 1)).toBeLessThan(1e-9);
    exports.oscilloscope(CTX, 3);
    expect(readSamples(memory)).toEqual([3]);
  });
});
