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

function leavesRight(route: { x: number; y: number }[], from: { x: number; y: number }): boolean {
  const next = route[1];
  return next !== undefined && Math.abs(next.y - from.y) < 0.6 && next.x > from.x;
}

function entersFromLeft(route: { x: number; y: number }[], to: { x: number; y: number }): boolean {
  const prev = route.at(-2);
  return prev !== undefined && Math.abs(prev.y - to.y) < 0.6 && prev.x < to.x;
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

  it("builds an ELK graph with fixed ports and spline routing", () => {
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
    expect(graph.layoutOptions?.["elk.edgeRouting"]).toBe("SPLINES");
    expect(graph.layoutOptions?.["elk.layered.edgeRouting.splines.mode"]).toBe("CONSERVATIVE_SOFT");
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
  it("routes a spline between two pinned shapes", async () => {
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
    const from = { x: 80, y: 70 };
    const to = { x: 320, y: 110 };
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(route[0]).toEqual(from);
    expect(route.at(-1)).toEqual(to);
    expect(leavesRight(route, from)).toBe(true);
    expect(entersFromLeft(route, to)).toBe(true);
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
    const from = { x: 80, y: 70 };
    const to = { x: 320, y: 70 };
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(route[0]).toEqual(from);
    expect(route.at(-1)).toEqual(to);
    expect(leavesRight(route, from)).toBe(true);
    expect(entersFromLeft(route, to)).toBe(true);
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
    const from = { x: 80, y: 30 };
    const to = { x: 240, y: 50 };
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(route[0]).toEqual(from);
    expect(route.at(-1)).toEqual(to);
    expect(leavesRight(route, from)).toBe(true);
    expect(entersFromLeft(route, to)).toBe(true);
    engine.destroy();
  });
});
