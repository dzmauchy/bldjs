import { describe, expect, it } from "vitest";
import { compileGenerator } from "../compile";
import { createSharedMemory, readSamples } from "../runtime/memory";
import { instantiateGenerator } from "../runtime/generator";
import { solutionViewFrom } from "@bld/xml/solution/view";
import { WasmSolutionBuilder } from "./wasm";

describe("SolutionView", () => {
  it("names a unique XML block by id and suffixes duplicates", () => {
    const unique = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 4, defId: "timer" },
      ],
      [],
    );
    expect(unique.instanceName(unique.blocks[0]!)).toBe("scope");
    const two = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "scope" },
        { id: 4, defId: "timer" },
      ],
      [],
    );
    expect(two.instanceName(two.blocks[0]!)).toBe("scope_1");
    expect(two.instanceName(two.blocks[1]!)).toBe("scope_2");
  });

  it("keeps the generator subgraph of connected blocks", () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "sin" },
        { id: 9, defId: "cos" },
        { id: 4, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 1, fromOut: "out[1]", toBlock: 9, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
        { fromBlock: 9, fromOut: "out", toBlock: 4, toIn: "in" },
      ],
    );
    const graph = view.subgraphFromGenerator(4);
    expect(graph.blocks.map((block) => block.defId).sort()).toEqual(["cos", "scope", "sin", "timer"]);
  });
});

describe("WasmSolutionBuilder", () => {
  it("sizes scope out from SolutionViewConnectors", async () => {
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
    const { text, wasm } = await new WasmSolutionBuilder().build(view, { generatorId: 3, delayMs: 0 });
    expect(text).toContain("fn scope(_ctx : Int) -> C1");
    expect(text).toContain("fn sin(_ctx : Int, input : C1) -> C1");
    expect(text).toContain("fn timer(_ctx : Int, input : C1) -> Unit");
    expect(text).toContain("let b1 = scope(0)");
    expect(text).toContain("let b2 = sin(0, b1)");
    expect(text).toContain("timer(0, b2)");
    expect(text).not.toContain("fn cos(");
    expect(text).not.toContain("memory.atomic.wait32");
    expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);

    const memory = createSharedMemory();
    const gen = await instantiateGenerator(wasm, memory, () => 0);
    gen.tick();
    expect(Math.abs(readSamples(memory, 0)[0]!)).toBeLessThan(1e-9);
    for (let i = 0; i < 40; i += 1) {
      gen.tick();
    }
    expect(readSamples(memory, 0).length).toBeGreaterThan(1);
  });

  it("reads a dense array slot when the subgraph keeps only out[1]", async () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "sin" },
        { id: 3, defId: "cos" },
        { id: 4, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
        { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in" },
      ],
    );
    const { text, wasm } = await new WasmSolutionBuilder().build(view, { generatorId: 4, delayMs: 0 });
    expect(text).toContain("fn cos(");
    expect(text).not.toContain("fn sin(");
    expect(text).toContain("fn scope(_ctx : Int) -> C1");
    const memory = createSharedMemory();
    const gen = await instantiateGenerator(wasm, memory, () => 0);
    gen.tick();
    expect(Math.abs(readSamples(memory, 0)[0]! - 1)).toBeLessThan(1e-9);
  });

  it("compiles the same pipeline as compileGenerator", async () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "timer" },
    ];
    const links = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
    ];
    const compiled = (await compileGenerator(3, nodes, links))!;
    expect(compiled.text).toContain("sin(0,");
    expect(compiled.text).toContain("scope(0)");
    expect(compiled.text).toContain("timer(0,");
  });

  it("writes two scope rings through a fork", async () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "scope" },
        { id: 4, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 4, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
      ],
    );
    const { text, wasm } = await new WasmSolutionBuilder().build(view, { generatorId: 4, delayMs: 0 });
    expect(text).toContain("fn fork_4_in(");
    const memory = createSharedMemory();
    const gen = await instantiateGenerator(wasm, memory, () => 0.25);
    gen.tick();
    expect(readSamples(memory, 0)[0]).toBeCloseTo(0.25);
    expect(readSamples(memory, 1)[0]).toBeCloseTo(0.25);
  });
});
