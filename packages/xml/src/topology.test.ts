import { describe, expect, it } from "vitest";
import { topologyKey, plannedGenerators, nodeSpecsFrom } from "./topology";
import type { Link } from "./blocks";

describe("topology", () => {
  it("ignores block positions", () => {
    const blocks = [
      { id: 1, defId: "timer", x: 0, y: 0 },
      { id: 2, defId: "sin", x: 10, y: 0 },
    ];
    const links: Link[] = [{ fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" }];
    const moved = blocks.map((block) => (block.id === 1 ? { ...block, x: 40, y: -12 } : block));
    expect(topologyKey(moved, links)).toBe(topologyKey(blocks, links));
  });

  it("changes when wiring changes", () => {
    const blocks = [
      { id: 1, defId: "timer" },
      { id: 2, defId: "sin" },
    ];
    const before: Link[] = [{ fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" }];
    expect(topologyKey(blocks, before)).not.toBe(topologyKey(blocks, []));
  });

  it("plans generators from node specs without AppState", () => {
    const nodes = nodeSpecsFrom([
      { id: 1, defId: "scope" },
      { id: 2, defId: "quantizer" },
      { id: 3, defId: "sin" },
      { id: 4, defId: "timer" },
    ]);
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
      { fromBlock: 3, fromOut: "out", toBlock: 4, toIn: "in" },
    ];
    const plans = plannedGenerators(nodes, links);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.timerId).toBe(4);
    expect(plans[0]?.channels).toEqual([{ scopeId: 1, label: "sin → quantizer" }]);
  });
});
