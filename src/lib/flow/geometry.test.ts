import { describe, expect, it } from "vitest";
import {
  clientToWorld,
  cubicLink,
  cubicLinkBounds,
  linkKey,
  orthogonalLink,
  polylineBounds,
  polylinePath,
  routesEqual,
  jumpoverLinkPath,
  jumpoverUnderlays,
  translateJumpover,
  translatePath,
  translatePolyline,
} from "./geometry";

describe("flow geometry", () => {
  it("builds a cubic bezier that starts and ends on the ports", () => {
    const link = cubicLink({ x: 10, y: 20 }, { x: 200, y: 80 });
    expect(link.d.startsWith("M 10 20")).toBe(true);
    expect(link.d.endsWith("200 80")).toBe(true);
    expect(link.c1x).toBeGreaterThan(link.x1);
    expect(link.c2x).toBeLessThan(link.x2);
    expect(link.c1y).toBe(20);
    expect(link.c2y).toBe(80);
  });

  it("keeps a minimum handle length for short links", () => {
    const link = cubicLink({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(link.c1x - link.x1).toBe(40);
    expect(link.x2 - link.c2x).toBe(40);
  });

  it("bounds include control points and padding", () => {
    const link = cubicLink({ x: 0, y: 0 }, { x: 100, y: 0 });
    const box = cubicLinkBounds(link, 16);
    expect(box.left).toBeLessThanOrEqual(-16);
    expect(box.top).toBeLessThanOrEqual(-16);
    expect(box.left + box.width).toBeGreaterThanOrEqual(100 + 16);
  });

  it("translates a path into the connector's local box", () => {
    const link = cubicLink({ x: 50, y: 80 }, { x: 150, y: 90 });
    const local = translatePath(link, { x: 40, y: 70 });
    expect(local.startsWith("M 10 10")).toBe(true);
  });

  it("converts client coordinates into world space", () => {
    const point = clientToWorld(150, 80, { left: 50, top: 20 }, 10, 4, 2);
    expect(point.x).toBe(45);
    expect(point.y).toBe(28);
  });

  it("formats a stable link key", () => {
    expect(linkKey(1, "out", 2, "in")).toBe("1:out->2:in");
  });

  it("builds an orthogonal polyline between ports", () => {
    const points = orthogonalLink({ x: 0, y: 10 }, { x: 200, y: 80 });
    expect(points[0]).toEqual({ x: 0, y: 10 });
    expect(points.at(-1)).toEqual({ x: 200, y: 80 });
    expect(polylinePath(points).startsWith("M 0 10")).toBe(true);
    expect(polylinePath(points)).toContain("L ");
  });

  it("bounds and translates a routed polyline", () => {
    const points = [
      { x: 50, y: 80 },
      { x: 90, y: 80 },
      { x: 90, y: 20 },
      { x: 150, y: 20 },
    ];
    const box = polylineBounds(points, 16);
    expect(box.left).toBe(34);
    expect(box.top).toBe(4);
    expect(translatePolyline(points, { x: box.left, y: box.top })).toBe("M 16 76 L 56 76 L 56 16 L 116 16");
  });

  it("compares routed point lists", () => {
    expect(routesEqual([{ x: 1, y: 2 }], [{ x: 1, y: 2 }])).toBe(true);
    expect(routesEqual([{ x: 1, y: 2 }], [{ x: 1, y: 3 }])).toBe(false);
  });

  it("builds a JointJS jumpover path with rounded orthogonal corners", () => {
    const from = { x: 0, y: 10 };
    const to = { x: 200, y: 80 };
    const straight = jumpoverLinkPath(from, to, []);
    expect(straight.startsWith("M 0 10")).toBe(true);
    expect(straight).toContain("L ");
    const routed = jumpoverLinkPath(from, to, [
      { x: 80, y: 10 },
      { x: 80, y: 80 },
    ]);
    expect(routed).toContain("L ");
    expect(routed).toContain("C ");
    expect(routed).not.toBe(straight);
    const local = translateJumpover(from, to, [], { x: -16, y: -6 });
    expect(local.startsWith("M 16 16")).toBe(true);
  });

  it("inserts an arc jump where two routes cross", () => {
    const from = { x: 0, y: 50 };
    const to = { x: 200, y: 50 };
    const plain = jumpoverLinkPath(from, to, []);
    expect(plain).not.toContain("C ");
    const jumped = jumpoverLinkPath(from, to, [], [
      { from: { x: 100, y: 0 }, to: { x: 100, y: 100 }, route: [] },
    ]);
    expect(jumped).toContain("C ");
    expect(jumped).not.toBe(plain);
  });

  it("only the later crossing wire jumps so both lines do not overlap hoops", () => {
    const horizontal = { from: { x: 0, y: 50 }, to: { x: 200, y: 50 }, route: [] as { x: number; y: number }[] };
    const vertical = { from: { x: 100, y: 0 }, to: { x: 100, y: 100 }, route: [] as { x: number; y: number }[] };
    const wires = [horizontal, vertical];
    const under = jumpoverLinkPath(
      wires[0]!.from,
      wires[0]!.to,
      wires[0]!.route,
      jumpoverUnderlays(wires, 0),
    );
    const over = jumpoverLinkPath(
      wires[1]!.from,
      wires[1]!.to,
      wires[1]!.route,
      jumpoverUnderlays(wires, 1),
    );
    expect(jumpoverUnderlays(wires, 0)).toEqual([]);
    expect(jumpoverUnderlays(wires, 1)).toEqual([horizontal]);
    expect(under).not.toContain("C ");
    expect(over).toContain("C ");
  });
});
