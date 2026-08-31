import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "$lib/blocks/builtin";
import { Diagram } from "$lib/blocks/diagram";
import { compileGenerator } from "$lib/blocks/cs";
import sampleXml from "../../resources/models/diagram.xml?raw";
import {
  DiagramCompileError,
  canvasToDocument,
  documentToCanvas,
  loadDiagramSolution,
  parseDiagramXml,
  serializeCanvas,
  serializeDiagramXml,
} from "./index";

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
      { id: 2, defId: "quantizer", x: 180, y: 0 },
      { id: 3, defId: "sin", x: 360, y: 0 },
      { id: 4, defId: "timer", x: 540, y: 0 },
    ],
    links: [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in" },
    ],
  };
}

describe("diagram XML", () => {
  it("parses the sample diagram.xml", () => {
    const doc = parseDiagramXml(sampleXml);
    expect(doc.id).toBe("diag_telemetry_01");
    expect(doc.blocks.map((block) => block.type)).toEqual(["sensor_source", "scaler", "timeseries_sink"]);
    expect(doc.connectors).toHaveLength(2);
    expect(doc.connectors[0]?.input.block).toBe("blk_sensor_in");
    expect(doc.connectors[0]?.input.port).toBe("data_out");
    expect(doc.connectors[0]?.output.port).toBe("raw_in");
    const scaler = doc.blocks.find((block) => block.type === "scaler");
    expect(scaler?.parameters.map((param) => param.kind)).toEqual([
      "decimal-parameter",
      "integer-range-parameter",
      "double-range-parameter",
    ]);
  });

  it("round-trips the sample through serialize and parse", () => {
    const doc = parseDiagramXml(sampleXml);
    const again = parseDiagramXml(serializeDiagramXml(doc));
    expect(again.id).toBe(doc.id);
    expect(again.blocks).toHaveLength(doc.blocks.length);
    expect(again.connectors.map((item) => [item.input.block, item.output.block])).toEqual(
      doc.connectors.map((item) => [item.input.block, item.output.block]),
    );
    expect(again.blocks[1]?.parameters[0]?.value).toBe("0.0042");
  });

  it("serializes canvas blocks and slotted wires to diagram XML", () => {
    const xml = serializeCanvas({
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
    expect(xml).toContain('xsi:noNamespaceSchemaLocation="diagram.xsd"');
    const canvas = documentToCanvas(parseDiagramXml(xml));
    expect(canvas.blocks.map((block) => block.defId)).toEqual(["scope", "sin", "cos", "timer"]);
    expect(canvas.links).toEqual([
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 4, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in[1]" },
    ]);
  });

  it("maps non-numeric XML ids onto canvas ids", () => {
    const doc = canvasToDocument({
      id: "diag_named",
      name: "Named",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:00:00Z",
      blocks: [{ id: 1, defId: "timer", x: 8, y: 4 }],
      links: [],
    });
    doc.blocks[0]!.id = "blk_timer_main";
    const canvas = documentToCanvas(doc);
    expect(canvas.blocks[0]).toEqual({ id: 1, defId: "timer", x: 8, y: 4 });
    expect(canvas.extras.get(1)?.xmlId).toBe("blk_timer_main");
  });
});

describe("diagram compile pipeline", () => {
  it("builds XML first, infers types, then emits wasm", async () => {
    const xml = serializeCanvas(csCanvas());
    const solution = loadDiagramSolution(xml, catalog());
    expect(solution.doc.blocks.map((block) => block.type)).toEqual(["scope", "quantizer", "sin", "timer"]);
    const timer = solution.inferred.get(4);
    expect(timer?.defId).toBe("timer");
    expect(timer?.inputs[0]?.ty).toEqual({
      kind: "type",
      name: "c1",
      ns: null,
      args: [{ kind: "type", name: "f64", ns: null, args: [] }],
    });
    const compiled = await compileGenerator(4, solution.nodes, solution.links);
    expect(compiled?.wasm[0]).toBe(0);
    expect(String.fromCharCode(compiled!.wasm[1]!, compiled!.wasm[2]!, compiled!.wasm[3]!)).toBe("asm");
  });

  it("rejects unknown catalog types before wasm", () => {
    const xml = serializeCanvas({
      id: "diag_bad",
      name: "Bad",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:00:00Z",
      blocks: [{ id: 1, defId: "sensor_source", x: 0, y: 0 }],
      links: [],
    });
    expect(() => loadDiagramSolution(xml, catalog())).toThrow(DiagramCompileError);
    expect(() => loadDiagramSolution(xml, catalog())).toThrow("unknown block type `sensor_source`");
  });
});
