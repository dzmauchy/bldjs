import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "../blocks/builtin";
import { Diagram } from "../blocks/diagram";
import { DiagramCompileError, loadDiagramSolution, parseDiagram, serializeCanvas } from "./index";
import { displayType, BLOCK_PARAMETER_KINDS } from "../blocks/ast";
import { PARAMETER_KINDS } from "./types";

function catalog() {
  const diagram = new Diagram("workspace", "Workspace");
  associateBuiltinModels(diagram);
  return diagram.catalog();
}

function csCanvas() {
  return {
    id: "diag_cs",
    name: "CS pipeline",
    createdAt: "2026-08-31T05:00:00Z",
    updatedAt: "2026-08-31T05:30:00Z",
    blocks: [
      { id: 1, defId: "scope", x: 0, y: 0 },
      { id: 2, defId: "sin", x: 180, y: 0 },
    ],
    links: [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
  };
}

describe("diagram TypeScript", () => {
  it("shares parameter kinds with the catalog AST", () => {
    expect(PARAMETER_KINDS).toEqual(BLOCK_PARAMETER_KINDS);
  });

  it("round-trips diagram TypeScript through serialize and parse", () => {
    const source = serializeCanvas({
      id: "diag_telemetry_01",
      name: "Telemetry",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:30:00Z",
      catalogs: ["model.ts"],
      blocks: [
        { id: 1, defId: "sensor_source", x: 120, y: 80 },
        { id: 2, defId: "scaler", x: 460, y: 80 },
      ],
      links: [{ fromBlock: 1, fromOut: "data_out", toBlock: 2, toIn: "raw_in" }],
      extras: new Map([
        [
          2,
          {
            parameters: [{ kind: "decimal-parameter", name: "calibrationOffset", value: "0.0042" }],
          },
        ],
      ]),
    });
    const doc = parseDiagram(source);
    const again = parseDiagram(serializeCanvas(doc));
    expect(again.id).toBe(doc.id);
    expect(again.blocks).toHaveLength(doc.blocks.length);
    expect(again.links.map((item) => [item.fromBlock, item.toBlock])).toEqual(
      doc.links.map((item) => [item.fromBlock, item.toBlock]),
    );
    expect(again.extras.get(2)?.parameters[0]?.value).toBe("0.0042");
    expect(again.catalogs).toEqual(["model.ts"]);
  });

  it("parses catalog file names and rejects paths", () => {
    expect(
      parseDiagram(
        `@Diagram({ id: "diag_cats", name: "Cats", createdAt: "2026-08-31T05:00:00Z", updatedAt: "2026-08-31T05:00:00Z", catalogs: ["model.ts"] })\nfunction diagram() {}\n`,
      ).catalogs,
    ).toEqual(["model.ts"]);
    expect(() =>
      parseDiagram(
        `@Diagram({ id: "diag_path", createdAt: "2026-08-31T05:00:00Z", updatedAt: "2026-08-31T05:00:00Z", catalogs: ["models/model.ts"] })\nfunction diagram() {}\n`,
      ),
    ).toThrow("catalog must be a file name");
    expect(() =>
      parseDiagram(
        `@Diagram({ id: "diag_dup", createdAt: "2026-08-31T05:00:00Z", updatedAt: "2026-08-31T05:00:00Z", catalogs: ["model.ts", "model.ts"] })\nfunction diagram() {}\n`,
      ),
    ).toThrow("duplicate catalog");
  });

  it("serializes selected catalog file names", () => {
    const source = serializeCanvas({
      id: "diag_cats",
      name: "Cats",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:00:00Z",
      catalogs: ["model.ts"],
      blocks: [],
      links: [],
    });
    expect(source).toContain("catalogs");
    expect(source).toContain("model.ts");
    expect(source).not.toContain("resources/models");
    expect(parseDiagram(source).catalogs).toEqual(["model.ts"]);
    const empty = serializeCanvas({
      id: "diag_none",
      name: "None",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:00:00Z",
      catalogs: [],
      blocks: [],
      links: [],
    });
    expect(parseDiagram(empty).catalogs).toEqual([]);
    expect(empty).toMatch(/@Diagram\(\{[\s\S]*id: "diag_none"/);
  });

  it("treats missing catalogs as none", () => {
    expect(
      parseDiagram(
        `@Diagram({ id: "diag_empty", name: "Empty", createdAt: "2026-08-31T05:00:00Z", updatedAt: "2026-08-31T05:00:00Z" })\nfunction diagram() {}\n`,
      ).catalogs,
    ).toEqual([]);
  });

  it("serializes canvas blocks and slotted wires", () => {
    const source = serializeCanvas({
      id: "diag_slots",
      name: "Slots",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:00:00Z",
      blocks: [
        { id: 1, defId: "scope", x: 0, y: 0 },
        { id: 2, defId: "sin", x: 180, y: 0 },
        { id: 3, defId: "cos", x: 180, y: 120 },
        { id: 4, defId: "timer", x: 360, y: 40 },
      ],
      links: [
        { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
        { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
        { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
        { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in[1]" },
      ],
    });
    const canvas = parseDiagram(source);
    expect(canvas.blocks.map((block) => block.defId)).toEqual(["scope", "sin", "cos", "timer"]);
    expect(canvas.links).toEqual([
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in[1]" },
    ]);
  });
});

describe("diagram compile pipeline", () => {
  it("parses TypeScript first, then infers types", () => {
    const source = serializeCanvas(csCanvas());
    const solution = loadDiagramSolution(source, catalog());
    expect(solution.canvas.blocks.map((block) => block.defId)).toEqual(["scope", "sin"]);
    const sin = solution.inferred.get(2);
    expect(sin?.defId).toBe("sin");
    expect(displayType(sin!.inputs[0]!.ty, true)).toBe("(f32) -> void");
    expect(displayType(sin!.outputs[0]!.ty, true)).toBe("(f32) -> void");
  });

  it("rejects unknown catalog types before compile", () => {
    const source = serializeCanvas({
      id: "diag_bad",
      name: "Bad",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:00:00Z",
      blocks: [{ id: 1, defId: "sensor_source", x: 0, y: 0 }],
      links: [],
    });
    expect(() => loadDiagramSolution(source, catalog())).toThrow(DiagramCompileError);
    expect(() => loadDiagramSolution(source, catalog())).toThrow("unknown block type `sensor_source`");
  });
});
