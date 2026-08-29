import { describe, expect, it } from "vitest";
import {
  clientToWorld,
  connectorPath,
  connectorPolyline,
  cubicLink,
  cubicLinkBounds,
  ensureHorizontalStubs,
  linkKey,
  orthogonalLink,
  polylineBounds,
  polylinePath,
  remapElkRoute,
  roundedPolylinePath,
  routesEqual,
  simplifyOrthogonal,
  splinePath,
  translatePath,
  translatePolyline,
  translateRounded,
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

  it("drops colinear orthogonal vertices", () => {
    expect(
      simplifyOrthogonal([
        { x: 0, y: 10 },
        { x: 40, y: 10 },
        { x: 80, y: 10 },
        { x: 80, y: 40 },
      ]),
    ).toEqual([
      { x: 0, y: 10 },
      { x: 80, y: 10 },
      { x: 80, y: 40 },
    ]);
  });

  it("remaps an ELK route onto the actual ports with horizontal stubs", () => {
    const from = { x: 80, y: 40 };
    const to = { x: 240, y: 90 };
    const points = remapElkRoute(
      [
        { x: 100, y: 50 },
        { x: 160, y: 50 },
        { x: 160, y: 100 },
        { x: 260, y: 100 },
      ],
      from,
      to,
    );
    expect(points[0]).toEqual(from);
    expect(points.at(-1)).toEqual(to);
    expect(points[1]?.y).toBe(from.y);
    expect(points[1]!.x).toBeGreaterThan(from.x);
    expect(points.at(-2)?.y).toBe(to.y);
    expect(points.at(-2)!.x).toBeLessThan(to.x);
  });

  it("turns a vertical left-edge approach into a horizontal entry", () => {
    const from = { x: 80, y: 30 };
    const to = { x: 240, y: 50 };
    const points = ensureHorizontalStubs(
      [
        { x: 80, y: 30 },
        { x: 200, y: 30 },
        { x: 240, y: 30 },
        { x: 240, y: 50 },
      ],
      from,
      to,
    );
    expect(points[0]).toEqual(from);
    expect(points.at(-1)).toEqual(to);
    expect(points.at(-2)).toEqual({ x: 216, y: 50 });
    expect(points[1]?.y).toBe(30);
    expect(points[1]!.x).toBeGreaterThan(80);
  });

  it("falls back to a cubic spline when ELK has not routed yet", () => {
    const path = connectorPath({ x: 0, y: 10 }, { x: 200, y: 80 });
    expect(path.startsWith("M 0 10")).toBe(true);
    expect(path.endsWith("200 80")).toBe(true);
    expect(path).toContain("C ");
    const points = connectorPolyline({ x: 0, y: 10 }, { x: 200, y: 80 });
    expect(points[0]).toEqual({ x: 0, y: 10 });
    expect(points.at(-1)).toEqual({ x: 200, y: 80 });
    expect(splinePath(points)).toContain("C ");
  });

  it("ignores an ELK attachment on the bottom of the source node", () => {
    const from = { x: 160, y: 80 };
    const to = { x: 400, y: 220 };
    const path = connectorPath(from, to, [
      { x: 160, y: 120 },
      { x: 160, y: 180 },
      { x: 160, y: 220 },
      { x: 200, y: 220 },
      { x: 400, y: 220 },
    ]);
    expect(path).toBe(cubicLink(from, to).d);
    expect(path.startsWith("M 160 80")).toBe(true);
    expect(path).toContain("C ");
    expect(path.endsWith("400 220")).toBe(true);
  });

  it("does not detour when a box sits under the wire", () => {
    const from = { x: 80, y: 200 };
    const to = { x: 420, y: 40 };
    const empty = connectorPath(from, to);
    const nearBox = connectorPath(from, to, [
      { x: 180, y: 200 },
      { x: 220, y: 120 },
      { x: 260, y: 40 },
      { x: 320, y: 40 },
    ]);
    expect(nearBox).toBe(empty);
    expect(nearBox).toBe(cubicLink(from, to).d);
  });

  it("builds a piecewise cubic SVG path from ELK spline points", () => {
    const path = splinePath([
      { x: 0, y: 10 },
      { x: 40, y: 10 },
      { x: 80, y: 40 },
      { x: 120, y: 40 },
    ]);
    expect(path).toBe("M 0 10 C 40 10, 80 40, 120 40");
  });

  it("rounds orthogonal corners and translates into the connector box", () => {
    const points = [
      { x: 50, y: 80 },
      { x: 90, y: 80 },
      { x: 90, y: 20 },
      { x: 150, y: 20 },
    ];
    const path = roundedPolylinePath(points, 8);
    expect(path.startsWith("M 50 80")).toBe(true);
    expect(path).toContain("Q 90 80");
    expect(path).toContain("L 150 20");
    const box = polylineBounds(points, 16);
    expect(translateRounded(points, { x: box.left, y: box.top }, 8).startsWith("M 16 76")).toBe(true);
  });
});
