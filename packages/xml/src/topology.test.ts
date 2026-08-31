import { describe, expect, it } from "vitest";
import { topologyKey, plannedGenerators, nodeSpecsFrom } from "./topology";
import type { Link } from "./blocks";

describe("topology", () => {
  it("ignores block positions", () => {
    const blocks = [
      { id: 1, defId: "sin", x: 0, y: 0 },
      { id: 2, defId: "scope", x: 10, y: 0 },
    ];
    const links: Link[] = [{ fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" }];
    const moved = blocks.map((block) => (block.id === 1 ? { ...block, x: 40, y: -12 } : block));
    expect(topologyKey(moved, links)).toBe(topologyKey(blocks, links));
  });

  it("changes when wiring changes", () => {
    const blocks = [
      { id: 1, defId: "sin" },
      { id: 2, defId: "scope" },
    ];
    const before: Link[] = [{ fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" }];
    expect(topologyKey(blocks, before)).not.toBe(topologyKey(blocks, []));
  });

  it("changes when generator period changes", () => {
    const blocks = [{ id: 1, defId: "sin", periodMs: 10 }];
    const links: Link[] = [];
    expect(topologyKey([{ ...blocks[0], periodMs: 25 }], links)).not.toBe(topologyKey(blocks, links));
  });

  it("plans generators from node specs without AppState", () => {
    const nodes = nodeSpecsFrom([
      { id: 1, defId: "scope" },
      { id: 2, defId: "sin" },
    ]);
    const links: Link[] = [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }];
    const plans = plannedGenerators(nodes, links);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.generatorId).toBe(2);
    expect(plans[0]?.channels).toEqual([{ scopeId: 1, label: "sin" }]);
    expect(plans[0]?.delayMs).toBe(10);
  });
});
