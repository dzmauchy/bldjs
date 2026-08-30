import { describe, expect, it } from "vitest";
import { Catalog } from "./blocks/catalog";
import { associateBuiltinModels } from "./blocks/builtin";
import { Diagram } from "./blocks/diagram";
import { WiringGraph, portAcceptsMany } from "./wiring";

describe("WiringGraph", () => {
  it("keeps multiple consumer wires into one input", () => {
    const graph = new WiringGraph()
      .connect(1, "out", 3, "in", true)
      .graph.connect(2, "out", 3, "in", true).graph;
    expect(graph.links).toEqual([
      { fromBlock: 1, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in[1]" },
    ]);
  });

  it("disconnects a catalog wire and compacts later", () => {
    const connected = new WiringGraph()
      .connect(1, "out", 2, "in", true)
      .graph.connect(1, "out", 3, "in", true).graph;
    const { graph, existing } = connected.connect(1, "out", 3, "in", true);
    expect(existing).toEqual({ fromBlock: 1, fromOut: "out[1]", toBlock: 3, toIn: "in" });
    expect(WiringGraph.compact(graph.links).links).toEqual([
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
    ]);
  });

  it("reads many-accepting from a catalog port", () => {
    const diagram = new Diagram("t", "t");
    associateBuiltinModels(diagram);
    const catalog: Catalog = diagram.catalog();
    expect(portAcceptsMany(catalog.block("timer"), "in")).toBe(true);
    expect(portAcceptsMany(catalog.block("quantizer"), "in")).toBe(true);
  });
});
