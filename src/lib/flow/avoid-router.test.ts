import { describe, expect, it } from "vitest";
import type { Link } from "$lib/blocks";
import type { NodeLayout } from "./types";
import {
  AvoidRouteEngine,
  CONN_DIR,
  connectorFromLink,
  obstacleFromBlock,
  pinIdFor,
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
  it("allocates stable pin ids for ports", () => {
    expect(pinIdFor("out", "value")).toBe(pinIdFor("out", "value"));
    expect(pinIdFor("out", "value")).not.toBe(pinIdFor("in", "value"));
    expect(pinIdFor("out", "value")).not.toBe(pinIdFor("out", "result"));
  });

  it("builds an obstacle with side-constrained pins", () => {
    const obstacle = obstacleFromBlock(3, 40, 10, layout(180, 90, 40, 48));
    expect(obstacle).toMatchObject({ id: "3", x: 40, y: 10, width: 180, height: 90 });
    expect(obstacle?.pins).toEqual([
      { id: pinIdFor("out", "out"), x: 1, y: 40 / 90, dir: CONN_DIR.right },
      { id: pinIdFor("in", "in"), x: 0, y: 48 / 90, dir: CONN_DIR.left },
    ]);
  });

  it("skips obstacles until the node has a size", () => {
    expect(obstacleFromBlock(1, 0, 0, layout(0, 0, 0, 0))).toBeUndefined();
  });

  it("maps a diagram link onto avoid connector ids", () => {
    const link: Link = { fromBlock: 1, fromOut: "value", toBlock: 2, toIn: "elems" };
    expect(connectorFromLink(link)).toEqual({
      id: "1:value->2:elems",
      sourceId: "1",
      sourcePinId: pinIdFor("out", "value"),
      targetId: "2",
      targetPinId: pinIdFor("in", "elems"),
    });
  });
});

describe("avoid router engine", () => {
  it("routes around an obstacle between two pinned shapes", async () => {
    const engine = new AvoidRouteEngine();
    await engine.start(wasmPath);
    const left = obstacleFromBlock(1, 0, 40, layout(80, 60, 30, 30))!;
    const blocker = obstacleFromBlock(2, 140, 0, layout(80, 160, 80, 80))!;
    const right = obstacleFromBlock(3, 320, 40, layout(80, 60, 30, 30))!;
    const routes = engine.sync([left, blocker, right], [
      {
        id: "1:out->3:in",
        sourceId: "1",
        sourcePinId: pinIdFor("out", "out"),
        targetId: "3",
        targetPinId: pinIdFor("in", "in"),
      },
    ]);
    const points = routes.get("1:out->3:in") ?? [];
    expect(points.length).toBeGreaterThanOrEqual(4);
    expect(points[0]!.x).toBeLessThan(points.at(-1)!.x);
    const hitsBlocker = points.some((point) => point.x > 140 && point.x < 220 && point.y > 0 && point.y < 160);
    expect(hitsBlocker).toBe(false);
    engine.destroy();
  }, 20000);
});
