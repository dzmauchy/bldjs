import { describe, expect, it } from "vitest";
import { compileGenerator } from "../blocks/cs";
import { createSharedMemory, readSamples } from "../runtime/memory";
import { instantiateGenerator } from "../runtime/generator";
import { solutionViewFrom, subgraphFromTimer, instanceName } from "./view";
import { WasmSolutionBuilder } from "./wasm";

describe("SolutionView", () => {
  it("names a unique XML block by id and suffixes duplicates", () => {
    const unique = solutionViewFrom(
      [
        { id: 1, defId: "oscilloscope" },
        { id: 4, defId: "timer" },
      ],
      [],
    );
    expect(instanceName(unique, unique.blocks[0])).toBe("oscilloscope");
    const two = solutionViewFrom(
      [
        { id: 1, defId: "oscilloscope" },
        { id: 2, defId: "oscilloscope" },
        { id: 4, defId: "timer" },
      ],
      [],
    );
    expect(instanceName(two, two.blocks[0])).toBe("oscilloscope_1");
    expect(instanceName(two, two.blocks[1])).toBe("oscilloscope_2");
  });

  it("keeps the timer subgraph of connected blocks", () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "oscilloscope" },
        { id: 2, defId: "sin" },
        { id: 9, defId: "cos" },
        { id: 4, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
      ],
    );
    const graph = subgraphFromTimer(view, 4);
    expect(graph.blocks.map((block) => block.defId).sort()).toEqual(["oscilloscope", "sin", "timer"]);
  });
});

describe("WasmSolutionBuilder", () => {
  it("sizes oscilloscope out from SolutionViewConnectors", async () => {
    const view = solutionViewFrom(
      [
        { id: 1, defId: "oscilloscope" },
        { id: 2, defId: "sin" },
        { id: 3, defId: "cos" },
        { id: 4, defId: "timer" },
      ],
      [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
        { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in[1]" },
      ],
    );
    const { text, wasm } = await new WasmSolutionBuilder().build(view, { timerId: 4, delayMs: 0 });
    expect(text).toContain("function oscilloscope_0(v: f64): void");
    expect(text).toContain("function oscilloscope_1(v: f64): void");
    expect(text).toContain("function fork_4_in(v: f64): void");
    expect(text).toContain("function sin(v: f64): void");
    expect(text).toContain("host_sin");
    expect(text).toContain("function timer(): void");
    expect(text).not.toContain("inn: f64");
    expect(text).not.toContain("function tap_0");
    expect(WebAssembly.validate(wasm.slice().buffer)).toBe(true);

    const memory = createSharedMemory();
    const gen = await instantiateGenerator(wasm, memory, () => 0);
    gen.tick();
    expect(Math.abs(readSamples(memory, 0)[0])).toBeLessThan(1e-9);
    expect(Math.abs(readSamples(memory, 1)[0] - 1)).toBeLessThan(1e-9);
  });

  it("compiles the same pipeline as compileGenerator", async () => {
    const nodes = [
      { id: 1, defId: "oscilloscope" },
      { id: 2, defId: "sin" },
      { id: 4, defId: "timer" },
    ];
    const links = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
    ];
    const compiled = (await compileGenerator(4, nodes, links))!;
    expect(compiled.text).toContain("function sin(v: f64): void");
    expect(compiled.text).toContain("function timer(): void");
    expect(compiled.text).toContain("oscilloscope(v: f64)");
  });
});
