import { describe, expect, it } from "vitest";
import { topologyKey, plannedGenerators, nodeSpecsFrom } from "./topology";
import type { Link } from "./blocks/diagram";

describe("topology", () => {
  it("ignores block positions", () => {
    const blocks = [
      { id: 1, defId: "timer", x: 0, y: 0 },
      { id: 2, defId: "scope", x: 10, y: 0 },
    ];
    const links: Link[] = [{ fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" }];
    const moved = blocks.map((block) => (block.id === 1 ? { ...block, x: 40, y: -12 } : block));
    expect(topologyKey(moved, links)).toBe(topologyKey(blocks, links));
  });

  it("changes when wiring changes", () => {
    const blocks = [
      { id: 1, defId: "timer" },
      { id: 2, defId: "scope" },
    ];
    const before: Link[] = [{ fromBlock: 2, fromOut: "out", toBlock: 1, toIn: "in" }];
    expect(topologyKey(blocks, before)).not.toBe(topologyKey(blocks, []));
  });

  it("changes when generator period changes", () => {
    const blocks = [{ id: 1, defId: "timer", periodMs: 10 }];
    const links: Link[] = [];
    expect(topologyKey([{ ...blocks[0], periodMs: 25 }], links)).not.toBe(topologyKey(blocks, links));
  });

  it("changes when overshoot damping ratio changes", () => {
    const blocks = [{ id: 1, defId: "overshoot", zeta: 0.5 }];
    const links: Link[] = [];
    expect(topologyKey([{ ...blocks[0], zeta: 0.7 }], links)).not.toBe(topologyKey(blocks, links));
  });

  it("changes when overshoot natural frequency changes", () => {
    const blocks = [{ id: 1, defId: "overshoot", zeta: 0.5, omega: 1 }];
    const links: Link[] = [];
    expect(topologyKey([{ ...blocks[0], omega: 2 }], links)).not.toBe(topologyKey(blocks, links));
  });

  it("changes when scope window or quantizer period changes", () => {
    const blocks = [{ id: 1, defId: "scope", windowS: 30, meterMs: 10 }];
    const links: Link[] = [];
    expect(topologyKey([{ ...blocks[0], windowS: 60 }], links)).not.toBe(topologyKey(blocks, links));
    expect(topologyKey([{ ...blocks[0], meterMs: 20 }], links)).not.toBe(topologyKey(blocks, links));
  });

  it("changes when constant value changes", () => {
    const blocks = [{ id: 1, defId: "constant", value: 1 }];
    const links: Link[] = [];
    expect(topologyKey([{ ...blocks[0], value: 2 }], links)).not.toBe(topologyKey(blocks, links));
  });

  it("changes when product count or default changes", () => {
    const blocks = [{ id: 1, defId: "product", count: 2, def: 1 }];
    const links: Link[] = [];
    expect(topologyKey([{ ...blocks[0], count: 3 }], links)).not.toBe(topologyKey(blocks, links));
    expect(topologyKey([{ ...blocks[0], def: 0.5 }], links)).not.toBe(topologyKey(blocks, links));
  });

  it("plans generators from node specs without AppState", () => {
    const nodes = nodeSpecsFrom([
      { id: 1, defId: "scope" },
      { id: 2, defId: "sin" },
      { id: 3, defId: "timer" },
    ]);
    const links: Link[] = [
      { fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" },
      { fromBlock: 2, fromOut: "out", toBlock: 3, toIn: "in" },
    ];
    const plans = plannedGenerators(nodes, links);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.generatorId).toBe(3);
    expect(plans[0]?.channels).toEqual([{ scopeId: 1, label: "sin" }]);
    expect(plans[0]?.delayMs).toBe(10);
  });

  it("plans GPIO In with no quantization delay", () => {
    const plans = plannedGenerators(
      [
        { id: 1, defId: "gpio_out", pin: 1 },
        { id: 2, defId: "gpio_in", pin: 0 },
      ],
      [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]?.defId).toBe("gpio_in");
    expect(plans[0]?.delayMs).toBe(0);
  });
});
