import { describe, expect, it } from "vitest";
import { DiagramLayoutController } from "./layout-controller";
import type { NodeLayout } from "./types";

const layout: NodeLayout = {
  width: 120,
  height: 48,
  ports: {
    in: { in: { x: 0, y: 24 } },
    out: { out: { x: 120, y: 24 } },
  },
};

describe("DiagramLayoutController", () => {
  it("ignores identical layouts and rebuilds the route payload", () => {
    const controller = new DiagramLayoutController();
    expect(controller.remember(1, layout)).toBe(true);
    expect(controller.remember(1, { ...layout, ports: { in: { in: { x: 0, y: 24 } }, out: { out: { x: 120, y: 24 } } } })).toBe(
      false,
    );
    expect(controller.remember(1, { ...layout, width: 140 })).toBe(true);
    const payload = controller.routePayload(
      [{ id: 1, defId: "timer", x: 10, y: 20 }],
      [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
    );
    expect(payload.obstacles).toHaveLength(1);
    expect(payload.obstacles[0]).toMatchObject({ x: 10, y: 20, width: 140 });
    expect(payload.connectors).toEqual([]);
  });
});
