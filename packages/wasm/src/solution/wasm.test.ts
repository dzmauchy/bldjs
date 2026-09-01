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
    expect(unique.instanceName(unique.blocks[0])).toBe("scope");
    const two = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "scope" },
        { id: 4, defId: "timer" },
      ],
      [],
    );
    expect(two.instanceName(two.blocks[0])).toBe("scope_1");
    expect(two.instanceName(two.blocks[1])).toBe("scope_2");
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
      ],
    );
    const graph = view.subgraphFromGenerator(2);
    expect(graph.blocks.map((block) => block.defId).sort()).toEqual(["scope", "sin"]);
  });
});

describe("WasmSolutionBuilder", () => {
  it("sizes scope out from SolutionViewConnectors", async () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "scope" },
        { id: 2, defId: "sin" },
        { id: 3, defId: "cos" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
      ],
    );
    const { text, wasm } = await new WasmSolutionBuilder().build(view, { generatorId: 2, delayMs: 0 });
    expect(text).toContain("array.new_fixed $array_c1_f64 1");
    expect(text).toContain("array.get $array_c1_f64");
    expect(text).toContain("(func $scope");
    expect(text).toContain("(result (ref $array_c1_f64))");
    expect(text).toContain("(func $sin");
    expect(text).toContain("(param $in (ref $c1_f64))");
    expect(text).not.toContain("(result (ref $c1_f64))");
    expect(text).not.toContain("(func $cos");
    expect(text).not.toContain("(func $timer");
    expect(text).not.toContain("(param $in f64)");
    expect(text).not.toContain("(func $tap_0");
    expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);

    const memory = createSharedMemory();
    const gen = await instantiateGenerator(wasm, memory, () => 0);
    gen.tick();
    expect(Math.abs(readSamples(memory, 0)[0])).toBeLessThan(1e-9);
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
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
      ],
    );
    const { text, wasm } = await new WasmSolutionBuilder().build(view, { generatorId: 3, delayMs: 0 });
    expect(text).toContain("(func $cos");
    expect(text).not.toContain("(func $sin");
    expect(text).toContain("array.new_fixed $array_c1_f64 1");
    const memory = createSharedMemory();
    const gen = await instantiateGenerator(wasm, memory, () => 0);
    gen.tick();
    expect(Math.abs(readSamples(memory, 0)[0] - 1)).toBeLessThan(1e-9);
  });

  it("compiles the same pipeline as compileGenerator", async () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "sin" },
    ];
    const links = [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }];
    const compiled = (await compileGenerator(2, nodes, links))!;
    expect(compiled.text).toContain("call $sin");
    expect(compiled.text).toContain("call $scope");
    expect(compiled.text).not.toContain("call $timer");
    expect(compiled.text).toContain("array.get $array_c1_f64");
  });
});
