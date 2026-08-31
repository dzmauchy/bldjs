import { describe, expect, it } from "vitest";
import { BLOCK_AS, compileOptions, preambleAs } from "../../resources/assemblyscript";
import { associateBuiltinModels } from "../blocks/builtin";
import { Diagram } from "../blocks/diagram";
import { assembleModule, runtimeTypeAs } from "./assemble";
import { SAMPLE_CAP, createMemory, readSamples } from "./memory";
import { instantiateGenerator } from "./generator";
import { asSignature, asValType, blockSignature } from "./signatures";

describe("block AssemblyScript assembly", () => {
  it("keeps one AssemblyScript function per XML block", () => {
    expect(Object.keys(BLOCK_AS).sort()).toEqual(["cos", "oscilloscope", "quantizer", "sin", "timer"]);
    expect(BLOCK_AS.timer).toContain("function timer(inn: c<f64>): void");
    expect(BLOCK_AS.timer).not.toContain("): c<");
    expect(BLOCK_AS.quantizer).toContain("function quantizer(period: i32, in: c<f64>): c<f64>");
    expect(BLOCK_AS.quantizer).toContain("return atomic.wait<i32>(WAIT, 0, i64(period) * 1_000_000);");
    expect(BLOCK_AS.sin).toContain("function sin(inn: c<f64>, v: f64): void");
    expect(BLOCK_AS.cos).toContain("function cos(inn: c<f64>, v: f64): void");
    expect(BLOCK_AS.oscilloscope).toContain("function oscilloscope(v: f64): void");
    expect(BLOCK_AS.oscilloscope).not.toContain("function oscilloscope(inn:");
    expect(preambleAs()).toContain("type c<T> = (v: T) => void");
    expect(compileOptions({ sharedMemory: false }).optimizeLevel).toBe(1);
  });

  it("matches XML port names in each block script", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    const cat = diagram.catalog();
    for (const id of Object.keys(BLOCK_AS)) {
      const sig = blockSignature(cat.block(id)!);
      const header = asSignature(sig);
      expect(header, id).toContain(`function ${id}(`);
      for (const port of sig.params) {
        expect(header, id).toContain(`${port.name}: ${port.type}`);
      }
    }
  });

  it("assembles every block function into the final module", async () => {
    const { text, wasm } = await assembleModule({ stages: ["quantizer", "sin"], delayMs: 10 });
    expect(text).toContain("type c<T> = (v: T) => void");
    expect(text).toContain("function timer(): void");
    expect(text).toContain("function quantizer(v: f64): void");
    expect(text).toContain("function sin(v: f64): void");
    expect(text).toContain("function oscilloscope(v: f64): void");
    expect(text).toContain("host_sin");
    expect(text).toContain("push_at");
    expect(text).toContain("export function tick(): void");
    expect(text).not.toContain("call_ref");
    expect(text).not.toContain("(ref $c1_f64)");
    expect(text).not.toContain("memory.atomic.wait32");
    expect(text).not.toContain("function tap_0");
    expect(text).toContain(`SAMPLE_CAP: i32 = ${SAMPLE_CAP}`);
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);

    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    expect(asSignature(blockSignature(diagram.catalog().block("timer")!))).toBe(
      "function timer(inn: c<f64>): void",
    );
    expect(asSignature(blockSignature(diagram.catalog().block("oscilloscope")!))).toBe(
      "function oscilloscope(): c<f64>[]",
    );
    expect(runtimeTypeAs()).toContain("function timer(inn: c<f64>): void");
    expect(runtimeTypeAs()).toContain("function oscilloscope(): c<f64>[]");
  });

  it("can skip AssemblyScript text on the run path", async () => {
    const { text, wasm } = await assembleModule({ stages: ["sin"], delayMs: 10, emitText: false });
    expect(text).toBe("");
    expect([...wasm.slice(0, 4)]).toEqual([0, 97, 115, 109]);
  });

  it("emits a non-shared memory module that instantiates without COI", async () => {
    const { text, wasm } = await assembleModule({ stages: ["sin"], delayMs: 10, sharedMemory: false });
    expect(text.toLowerCase()).not.toMatch(/sharedMemory|shared memory/i);
    const memory = createMemory(false);
    const gen = await instantiateGenerator(wasm, memory, () => 0.5);
    gen.tick();
    expect(readSamples(memory)[0]).toBeCloseTo(Math.sin(0.5));
  });
});
