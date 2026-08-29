import { describe, expect, it } from "vitest";
import type { Link } from "$lib/blocks";
import type { NodeLayout } from "./types";
import {
  ElkRouteEngine,
  buildElkGraph,
  connectorFromLink,
  elkPortId,
  obstacleFromBlock,
} from "./elk-router";

const layout = (width: number, height: number, outY: number, inY: number): NodeLayout => ({
  width,
  height,
  ports: {
    in: { in: { x: 0, y: inY } },
    out: { out: { x: width, y: outY } },
  },
});

function isOrthogonal(points: { x: number; y: number }[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const horizontal = Math.abs(prev.y - curr.y) < 0.6;
    const vertical = Math.abs(prev.x - curr.x) < 0.6;
    if (!horizontal && !vertical) {
      return false;
    }
  }
  return true;
}

describe("elk router mapping", () => {
  it("builds an obstacle with ports pinned to the east and west edges", () => {
    const obstacle = obstacleFromBlock(3, 40, 10, layout(180, 90, 40, 48));
    expect(obstacle).toMatchObject({ id: "3", x: 40, y: 10, width: 180, height: 90 });
    expect(obstacle?.ports).toEqual([
      { side: "out", name: "out", x: 180, y: 40 },
      { side: "in", name: "in", x: 0, y: 48 },
    ]);
  });

  it("skips obstacles until the node has a size", () => {
    expect(obstacleFromBlock(1, 0, 0, layout(0, 0, 0, 0))).toBeUndefined();
  });

  it("maps a diagram link onto unique ELK port ids", () => {
    const link: Link = { fromBlock: 1, fromOut: "value", toBlock: 2, toIn: "elems" };
    expect(connectorFromLink(link)).toEqual({
      id: "1:value->2:elems",
      sourceId: "1",
      sourcePort: elkPortId("1", "out", "value"),
      targetId: "2",
      targetPort: elkPortId("2", "in", "elems"),
    });
  });

  it("pins inset input handles to the left edge", () => {
    const obstacle = obstacleFromBlock(1, 0, 0, {
      width: 80,
      height: 56,
      ports: {
        in: { elems: { x: 10, y: 50 } },
        out: { value: { x: 70, y: 28 } },
      },
    });
    expect(obstacle?.ports).toEqual([
      { side: "out", name: "value", x: 80, y: 28 },
      { side: "in", name: "elems", x: 0, y: 50 },
    ]);
  });

  it("builds an ELK graph with fixed ports and orthogonal routing", () => {
    const left = obstacleFromBlock(1, 0, 40, layout(80, 60, 30, 30))!;
    const right = obstacleFromBlock(2, 240, 40, layout(80, 60, 30, 30))!;
    const graph = buildElkGraph([left, right], [
      {
        id: "1:out->2:in",
        sourceId: "1",
        sourcePort: elkPortId("1", "out", "out"),
        targetId: "2",
        targetPort: elkPortId("2", "in", "in"),
      },
    ]);
    expect(graph.layoutOptions?.["elk.edgeRouting"]).toBe("ORTHOGONAL");
    expect(graph.layoutOptions?.["elk.algorithm"]).toBe("layered");
    expect(graph.children).toHaveLength(2);
    expect(graph.children?.[0]?.layoutOptions?.["elk.portConstraints"]).toBe("FIXED_POS");
    expect(graph.children?.[0]?.ports?.[0]).toMatchObject({
      id: "1:out:out",
      x: 80,
      y: 30,
    });
    expect(graph.edges?.[0]).toMatchObject({
      id: "1:out->2:in",
      sources: ["1:out:out"],
      targets: ["2:in:in"],
    });
  });
});

describe("elk router engine", () => {
  it("routes an orthogonal polyline between two pinned shapes", async () => {
    const engine = new ElkRouteEngine();
    await engine.start();
    const left = obstacleFromBlock(1, 0, 40, layout(80, 60, 30, 30))!;
    const right = obstacleFromBlock(3, 320, 80, layout(80, 60, 30, 30))!;
    await engine.sync(
      [left, right],
      [
        {
          id: "1:out->3:in",
          sourceId: "1",
          sourcePort: elkPortId("1", "out", "out"),
          targetId: "3",
          targetPort: elkPortId("3", "in", "in"),
        },
      ],
    );
    const route = engine.routes.get("1:out->3:in") ?? [];
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(route[0]).toEqual({ x: 80, y: 70 });
    expect(route.at(-1)).toEqual({ x: 320, y: 110 });
    expect(isOrthogonal(route)).toBe(true);
    engine.destroy();
  });

  it("routes around an obstacle between two pinned shapes", async () => {
    const engine = new ElkRouteEngine();
    await engine.start();
    const left = obstacleFromBlock(1, 0, 40, layout(80, 60, 30, 30))!;
    const blocker = obstacleFromBlock(2, 140, 0, layout(80, 160, 80, 80))!;
    const right = obstacleFromBlock(3, 320, 40, layout(80, 60, 30, 30))!;
    await engine.sync(
      [left, blocker, right],
      [
        {
          id: "1:out->3:in",
          sourceId: "1",
          sourcePort: elkPortId("1", "out", "out"),
          targetId: "3",
          targetPort: elkPortId("3", "in", "in"),
        },
      ],
    );
    const route = engine.routes.get("1:out->3:in") ?? [];
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(isOrthogonal(route)).toBe(true);
    const hitsBlocker = route.some((point) => point.x > 140 && point.x < 220 && point.y > 0 && point.y < 160);
    expect(hitsBlocker).toBe(false);
    engine.destroy();
  });

  it("approaches a near-bottom input from the left", async () => {
    const engine = new ElkRouteEngine();
    await engine.start();
    const source = obstacleFromBlock(1, 0, 0, layout(80, 60, 30, 30))!;
    const target = obstacleFromBlock(2, 240, 0, {
      width: 80,
      height: 56,
      ports: {
        in: { in: { x: 10, y: 50 } },
        out: { out: { x: 70, y: 28 } },
      },
    })!;
    await engine.sync(
      [source, target],
      [
        {
          id: "1:out->2:in",
          sourceId: "1",
          sourcePort: elkPortId("1", "out", "out"),
          targetId: "2",
          targetPort: elkPortId("2", "in", "in"),
        },
      ],
    );
    const route = engine.routes.get("1:out->2:in") ?? [];
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(isOrthogonal(route)).toBe(true);
    const last = route.at(-1);
    const prev = route.at(-2);
    expect(last).toEqual({ x: 240, y: 50 });
    expect(prev?.y).toBe(50);
    expect(prev!.x).toBeLessThan(last!.x);
    engine.destroy();
  });
});
