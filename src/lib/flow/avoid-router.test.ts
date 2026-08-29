import { describe, expect, it, vi } from "vitest";
import type { Link } from "$lib/blocks";
import type { NodeLayout } from "./types";
import {
  AvoidRouteEngine,
  connectorFromLink,
  elementFromObstacle,
  jointPortId,
  obstacleFromBlock,
} from "./avoid-router";

const wasmPath = `${(globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? ""}/node_modules/libavoid-js/dist/libavoid.wasm`;

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
    engine.destroy();
  }, 20000);
});
