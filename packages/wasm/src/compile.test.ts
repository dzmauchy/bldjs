import { describe, expect, it } from "vitest";
import { DEFAULT_PERIOD_MS } from "@bld/xml/blocks/cs/ids";
import { associateBuiltinModels } from "@bld/xml/blocks/builtin";
import { Diagram, type Link } from "@bld/xml/blocks/diagram";
import { loadDiagramSolution } from "@bld/xml/diagram/compile";
import { serializeCanvas } from "@bld/xml/diagram/xml";
import { compileGenerator, generatorText } from "./compile";

function catalog() {
  const diagram = new Diagram("workspace", "Workspace");
  associateBuiltinModels(diagram);
  return diagram.catalog();
}

describe("compileGenerator", () => {
  it("emits typed-function wasm", async () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "sin" },
    ];
    const links: Link[] = [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }];
    const compiled = (await compileGenerator(2, nodes, links))!;
    expect(compiled.scopeId).toBe(1);
    expect(compiled.delayMs).toBe(DEFAULT_PERIOD_MS);
    expect(compiled.text).toContain("(type $c1_f64 (func (param f64)))");
    expect(compiled.text).toContain("(type $array_c1_f64 (array (mut (ref $c1_f64))))");
    expect(compiled.text).toContain("(func $sin");
    expect(compiled.text).toContain("(param $ctx i32) (param $in (ref $c1_f64))");
    expect(compiled.text).toContain("(func $scope");
    expect(compiled.text).toContain("(result (ref $array_c1_f64))");
    expect(compiled.text).toContain("array.new_fixed $array_c1_f64");
    expect(compiled.text).toContain("call $sin");
    expect(compiled.text).toContain("call $scope");
    expect(compiled.text).toContain("call_ref $c1_f64");
    expect(compiled.text).not.toContain("(func $quantizer");
    expect(compiled.text).not.toContain("(func $tap_0");
    expect(compiled.text).toContain('(export "tick"');
    expect(compiled.text).not.toContain('(export "run"');
    expect(compiled.text).not.toContain("setTimeout");
    expect(WebAssembly.validate(compiled.wasm.slice().buffer)).toBe(true);
  });

  it("walks a cos generator", async () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "cos" },
    ];
    const links: Link[] = [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }];
    const compiled = (await compileGenerator(2, nodes, links))!;
    expect(compiled.defId).toBe("cos");
    expect(compiled.text).toContain("(func $cos");
    expect(compiled.text).toContain("call $cos");
  });

  it("emits a fork into two push rings", async () => {
    const nodes = [
      { id: 1, defId: "scope" },
      { id: 2, defId: "scope" },
      { id: 4, defId: "timer" },
    ];
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 4, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
    ];
    const compiled = (await compileGenerator(4, nodes, links))!;
    expect(compiled.scopeIds).toEqual([1, 2]);
    expect(compiled.text).toContain("call $scope_1");
    expect(compiled.text).toContain("call $scope_2");
    expect(compiled.text).toContain("(func $fork_4_in");
    expect(compiled.text).toContain("call $push_at");
    expect(WebAssembly.validate(compiled.wasm.slice().buffer)).toBe(true);
  });

  it("needs a scope", async () => {
    const nodes = [{ id: 4, defId: "timer" }];
    expect(await compileGenerator(4, nodes, [])).toBeUndefined();
  });

  it("uses typed func types even without stages", async () => {
    const text = await generatorText("timer");
    expect(text).toContain("(type $c1_f64 (func (param f64)))");
    expect(text).toContain("(func $tick");
    expect(text).toContain('(export "tick"');
    expect(text).toContain("call $timer");
    expect(text).toContain("call $scope");
    expect(text).not.toContain("(func $sin");
  });

  it("builds XML first, infers types, then emits wasm", async () => {
    const xml = serializeCanvas({
      id: "diag_cs",
      name: "CS pipeline",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:30:00Z",
      blocks: [
        { id: 1, defId: "scope", x: 0, y: 0 },
        { id: 2, defId: "sin", x: 180, y: 0 },
      ],
      links: [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
    });
    const solution = loadDiagramSolution(xml, catalog());
    const compiled = await compileGenerator(2, solution.nodes, solution.links);
    expect(compiled?.wasm[0]).toBe(0);
    expect(String.fromCharCode(compiled!.wasm[1]!, compiled!.wasm[2]!, compiled!.wasm[3]!)).toBe("asm");
  });
});
