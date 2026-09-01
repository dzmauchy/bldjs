import { describe, expect, it, vi } from "vitest";
import type { Link } from "@bld/xml/blocks/diagram";
import type { NodeLayout } from "./types";
import {
  AvoidRouteEngine,
  connectorFromLink,
  elementFromObstacle,
  jointPortId,
  obstacleFromBlock,
} from "./avoid-router";
import { collinearOverlapLength, connectorPolyline } from "./geometry";

const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? "";
const wasmPath = `${cwd}${cwd.endsWith("packages/ui") ? "/../.." : ""}/node_modules/libavoid-js/dist/libavoid.wasm`;

function longestFlatY(points: { x: number; y: number }[]): number {
  let bestY = points[0]?.y ?? 0;
  let bestLen = 0;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const point = points[index]!;
    if (Math.abs(prev.y - point.y) >= 0.5) {
      continue;
    }
    const length = Math.abs(point.x - prev.x);
    if (length > bestLen) {
      bestLen = length;
      bestY = prev.y;
    }
  }
  return bestY;
}

const layout = (width: number, height: number, outY: number, inY: number): NodeLayout => ({
  width,
  height,
  ports: {
    in: { in: { x: 0, y: inY } },
    out: { out: { x: width, y: outY } },
  },
});

describe("avoid router mapping", () => {
  it("builds an obstacle with named port anchors", () => {
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

  it("maps a diagram link onto JointJS source/target ports", () => {
    const link: Link = { fromBlock: 1, fromOut: "value", toBlock: 2, toIn: "elems" };
    expect(connectorFromLink(link)).toEqual({
      id: "1:value->2:elems",
      sourceId: "1",
      sourcePort: jointPortId("out", "value"),
      targetId: "2",
      targetPort: jointPortId("in", "elems"),
    });
  });

  it("places JointJS ports at the measured anchors", () => {
    const obstacle = obstacleFromBlock(3, 40, 10, layout(180, 90, 40, 48))!;
    const element = elementFromObstacle(obstacle);
    const positions = element.getPortsPositions("pin");
    expect(positions[jointPortId("out", "out")]).toMatchObject({ x: 180, y: 40 });
    expect(positions[jointPortId("in", "in")]).toMatchObject({ x: 0, y: 48 });
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
    const positions = elementFromObstacle(obstacle!).getPortsPositions("pin");
    expect(positions[jointPortId("in", "elems")]).toMatchObject({ x: 0, y: 50 });
    expect(positions[jointPortId("out", "value")]).toMatchObject({ x: 80, y: 28 });
  });
});

describe("avoid router engine", () => {
  it("routes around an obstacle between two pinned shapes", async () => {
    const engine = new AvoidRouteEngine();
    await engine.start({ worker: false, filePath: wasmPath });
    const left = obstacleFromBlock(1, 0, 40, layout(80, 60, 30, 30))!;
    const blocker = obstacleFromBlock(2, 140, 0, layout(80, 160, 80, 80))!;
    const right = obstacleFromBlock(3, 320, 40, layout(80, 60, 30, 30))!;
    engine.sync([left, blocker, right], [
      {
        id: "1:out->3:in",
        sourceId: "1",
        sourcePort: jointPortId("out", "out"),
        targetId: "3",
        targetPort: jointPortId("in", "in"),
      },
    ]);
    await vi.waitFor(
      () => {
        expect((engine.routes.get("1:out->3:in") ?? []).length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 15000 },
    );
    const vertices = engine.routes.get("1:out->3:in") ?? [];
    expect(vertices.length).toBeGreaterThanOrEqual(1);
    const hitsBlocker = vertices.some((point) => point.x > 140 && point.x < 220 && point.y > 0 && point.y < 160);
    expect(hitsBlocker).toBe(false);
    const from = { x: left.x + left.width, y: left.y + 30 };
    const to = { x: right.x, y: right.y + 30 };
    const polyline = connectorPolyline(from, to, vertices);
    for (let index = 1; index < polyline.length; index += 1) {
      const prev = polyline[index - 1]!;
      const point = polyline[index]!;
      expect(Math.abs(prev.x - point.x) < 0.5 || Math.abs(prev.y - point.y) < 0.5).toBe(true);
    }
    engine.destroy();
  }, 20000);

  it("approaches a near-bottom input from the left", async () => {
    const engine = new AvoidRouteEngine();
    await engine.start({ worker: false, filePath: wasmPath });
    const source = obstacleFromBlock(1, 0, 0, layout(80, 60, 30, 30))!;
    const target = obstacleFromBlock(2, 240, 0, {
      width: 80,
      height: 56,
      ports: {
        in: { in: { x: 10, y: 50 } },
        out: { out: { x: 70, y: 28 } },
      },
    })!;
    engine.sync([source, target], [
      {
        id: "1:out->2:in",
        sourceId: "1",
        sourcePort: jointPortId("out", "out"),
        targetId: "2",
        targetPort: jointPortId("in", "in"),
      },
    ]);
    await vi.waitFor(
      () => {
        expect((engine.routes.get("1:out->2:in") ?? []).length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 15000 },
    );
    const last = (engine.routes.get("1:out->2:in") ?? []).at(-1);
    expect(last).toBeDefined();
    expect(last!.x).toBeLessThanOrEqual(240);
    expect(last!.y).toBeGreaterThanOrEqual(0);
    expect(last!.y).toBeLessThanOrEqual(56);
    const from = { x: 80, y: 30 };
    const to = { x: 240, y: 50 };
    const polyline = connectorPolyline(from, to, engine.routes.get("1:out->2:in") ?? []);
    for (let index = 1; index < polyline.length; index += 1) {
      const prev = polyline[index - 1]!;
      const point = polyline[index]!;
      expect(Math.abs(prev.x - point.x) < 0.5 || Math.abs(prev.y - point.y) < 0.5).toBe(true);
    }
    engine.destroy();
  }, 20000);

  it("nudges two parallel routes off the same path", async () => {
    const engine = new AvoidRouteEngine();
    await engine.start({ worker: false, filePath: wasmPath });
    const source = {
      id: "1",
      x: 0,
      y: 0,
      width: 80,
      height: 80,
      ports: [
        { side: "out" as const, name: "a", x: 80, y: 24 },
        { side: "out" as const, name: "b", x: 80, y: 56 },
      ],
    };
    const target = {
      id: "2",
      x: 300,
      y: 0,
      width: 80,
      height: 80,
      ports: [
        { side: "in" as const, name: "a", x: 0, y: 24 },
        { side: "in" as const, name: "b", x: 0, y: 56 },
      ],
    };
    const blocker = obstacleFromBlock(3, 140, -20, layout(80, 160, 80, 80))!;
    engine.sync([source, target, blocker], [
      {
        id: "1:a->2:a",
        sourceId: "1",
        sourcePort: jointPortId("out", "a"),
        targetId: "2",
        targetPort: jointPortId("in", "a"),
      },
      {
        id: "1:b->2:b",
        sourceId: "1",
        sourcePort: jointPortId("out", "b"),
        targetId: "2",
        targetPort: jointPortId("in", "b"),
      },
    ]);
    await vi.waitFor(
      () => {
        expect(engine.routes.has("1:a->2:a")).toBe(true);
        expect(engine.routes.has("1:b->2:b")).toBe(true);
      },
      { timeout: 15000 },
    );
    const a = engine.routes.get("1:a->2:a") ?? [];
    const b = engine.routes.get("1:b->2:b") ?? [];
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(b.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(Math.abs(longestFlatY(a) - longestFlatY(b))).toBeGreaterThanOrEqual(10);
    engine.destroy();
  }, 20000);

  it("re-pins extra inputs so two wires keep distinct approaches", async () => {
    const engine = new AvoidRouteEngine();
    await engine.start({ worker: false, filePath: wasmPath });
    const cos = obstacleFromBlock(1, 0, 0, layout(80, 60, 30, 30))!;
    const sin = obstacleFromBlock(2, 0, 140, layout(80, 60, 30, 30))!;
    const timer = {
      id: "3",
      x: 280,
      y: 40,
      width: 80,
      height: 60,
      ports: [
        { side: "out" as const, name: "out", x: 80, y: 30 },
        { side: "in" as const, name: "in", x: 0, y: 30 },
      ],
    };
    engine.sync([cos, sin, timer], [
      {
        id: "1:out->3:in",
        sourceId: "1",
        sourcePort: jointPortId("out", "out"),
        targetId: "3",
        targetPort: jointPortId("in", "in"),
      },
    ]);
    await vi.waitFor(
      () => {
        expect(engine.routes.has("1:out->3:in")).toBe(true);
      },
      { timeout: 15000 },
    );

    const twoInputs = {
      ...timer,
      height: 84,
      ports: [
        { side: "out" as const, name: "out", x: 80, y: 30 },
        { side: "in" as const, name: "in", x: 0, y: 28 },
        { side: "in" as const, name: "in[1]", x: 0, y: 56 },
      ],
    };
    engine.sync([cos, sin, twoInputs], [
      {
        id: "1:out->3:in",
        sourceId: "1",
        sourcePort: jointPortId("out", "out"),
        targetId: "3",
        targetPort: jointPortId("in", "in"),
      },
      {
        id: "2:out->3:in[1]",
        sourceId: "2",
        sourcePort: jointPortId("out", "out"),
        targetId: "3",
        targetPort: jointPortId("in", "in[1]"),
      },
    ]);
    await vi.waitFor(
      () => {
        expect((engine.routes.get("1:out->3:in") ?? []).length).toBeGreaterThanOrEqual(1);
        expect((engine.routes.get("2:out->3:in[1]") ?? []).length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 15000 },
    );

    const toIn = { x: twoInputs.x, y: twoInputs.y + 28 };
    const toExtra = { x: twoInputs.x, y: twoInputs.y + 56 };
    const routeIn = engine.routes.get("1:out->3:in") ?? [];
    const routeExtra = engine.routes.get("2:out->3:in[1]") ?? [];
    expect(JSON.stringify(routeIn)).not.toBe(JSON.stringify(routeExtra));
    const polyIn = connectorPolyline({ x: 80, y: 30 }, toIn, routeIn);
    const polyExtra = connectorPolyline({ x: 80, y: 170 }, toExtra, routeExtra);
    expect(polyIn.at(-1)).toEqual(toIn);
    expect(polyExtra.at(-1)).toEqual(toExtra);
    expect(Math.abs((polyIn.at(-2)?.y ?? 0) - toIn.y)).toBeLessThan(1);
    expect(Math.abs((polyExtra.at(-2)?.y ?? 0) - toExtra.y)).toBeLessThan(1);
    expect(collinearOverlapLength(polyIn, polyExtra)).toBeLessThan(16);
    engine.destroy();
  }, 20000);
});

describe("avoid router isolation", () => {
  it("starts on the main thread when isolated workers are unavailable", async () => {
    expect(globalThis.crossOriginIsolated).not.toBe(true);
    const engine = new AvoidRouteEngine();
    await engine.start({ worker: true, filePath: wasmPath });
    expect(engine.ready).toBe(true);
    expect(engine.worker).toBe(false);
    engine.destroy();
  }, 20000);
});
