import { describe, expect, it } from "vitest";
import {
  clientToWorld,
  collinearOverlapLength,
  connectorPolyline,
  connectorWorldPolyline,
  cssPolygon,
  insertOrthogonalJumps,
  jumpoverUnderlays,
  linkKey,
  orthogonalLink,
  polylineBounds,
  polylinePath,
  routesEqual,
  strokePolygon,
  translatePolyline,
  type Point,
} from "./geometry";

function expectOrthogonal(points: Point[]): void {
  expect(points.length).toBeGreaterThanOrEqual(2);
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const point = points[index]!;
    const flatX = Math.abs(prev.x - point.x) < 0.5;
    const flatY = Math.abs(prev.y - point.y) < 0.5;
    expect(flatX || flatY).toBe(true);
  }
}

describe("flow geometry", () => {
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
    expectOrthogonal(points);
  });

  it("does not draw a diagonal when avoid returns no vertices", () => {
    const from = { x: 400, y: 80 };
    const to = { x: 520, y: 88 };
    const points = connectorPolyline(from, to, []);
    expect(points[0]).toEqual(from);
    expect(points.at(-1)).toEqual(to);
    expect(points.length).toBeGreaterThan(2);
    expectOrthogonal(points);
  });

  it("stitches avoid vertices onto inset handles without diagonal ends", () => {
    const from = { x: 200, y: 40 };
    const to = { x: 380, y: 70 };
    const points = connectorPolyline(from, to, [
      { x: 230, y: 42 },
      { x: 230, y: 10 },
      { x: 350, y: 10 },
      { x: 350, y: 68 },
    ]);
    expect(points[0]).toEqual(from);
    expect(points.at(-1)).toEqual(to);
    expectOrthogonal(points);
    expect(points[1]?.y).toBe(from.y);
    expect(points.at(-2)?.y).toBe(to.y);
  });

  it("keeps axis-aligned empty routes as a single segment", () => {
    expect(connectorPolyline({ x: 0, y: 50 }, { x: 200, y: 50 }, [])).toEqual([
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ]);
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
    expect(translatePolyline(points, { x: box.left, y: box.top })).toEqual([
      { x: 16, y: 76 },
      { x: 56, y: 76 },
      { x: 56, y: 16 },
      { x: 116, y: 16 },
    ]);
  });

  it("compares routed point lists", () => {
    expect(routesEqual([{ x: 1, y: 2 }], [{ x: 1, y: 2 }])).toBe(true);
    expect(routesEqual([{ x: 1, y: 2 }], [{ x: 1, y: 3 }])).toBe(false);
  });

  it("measures collinear overlap of two orthogonal polylines", () => {
    const top = [
      { x: 0, y: 10 },
      { x: 80, y: 10 },
      { x: 80, y: 40 },
      { x: 200, y: 40 },
    ];
    const shared = [
      { x: 0, y: 80 },
      { x: 120, y: 80 },
      { x: 120, y: 40 },
      { x: 200, y: 40 },
    ];
    expect(collinearOverlapLength(top, shared)).toBe(80);
    expect(
      collinearOverlapLength(
        [
          { x: 0, y: 10 },
          { x: 200, y: 10 },
        ],
        [
          { x: 0, y: 40 },
          { x: 200, y: 40 },
        ],
      ),
    ).toBeLessThanOrEqual(0);
  });

  it("builds a clip-path polygon for an orthogonal stroke", () => {
    const poly = strokePolygon(
      [
        { x: 0, y: 10 },
        { x: 100, y: 10 },
      ],
      2,
    );
    expect(poly.length).toBe(4);
    expect(cssPolygon(poly).startsWith("polygon(")).toBe(true);
    expect(cssPolygon(poly)).toContain("px");
    const ys = poly.map((point) => point.y);
    expect(Math.min(...ys)).toBe(9);
    expect(Math.max(...ys)).toBe(11);
  });

  it("inserts an orthogonal hop where two routes cross", () => {
    const from = { x: 0, y: 50 };
    const to = { x: 200, y: 50 };
    const plain = connectorWorldPolyline(from, to, []);
    expect(plain).toEqual([from, to]);
    const jumped = connectorWorldPolyline(from, to, [], [[{ x: 100, y: 0 }, { x: 100, y: 100 }]]);
    expect(jumped.length).toBeGreaterThan(plain.length);
    expectOrthogonal(jumped);
    expect(jumped.some((point) => point.y === 40)).toBe(true);
  });

  it("only the later crossing wire hops so both lines do not overlap", () => {
    const horizontal = [
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ];
    const vertical = [
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const wires = [horizontal, vertical];
    const under = insertOrthogonalJumps(wires[0]!, jumpoverUnderlays(wires, 0));
    const over = insertOrthogonalJumps(wires[1]!, jumpoverUnderlays(wires, 1));
    expect(jumpoverUnderlays(wires, 0)).toEqual([]);
    expect(jumpoverUnderlays(wires, 1)).toEqual([horizontal]);
    expect(under).toEqual(horizontal);
    expect(over.length).toBeGreaterThan(vertical.length);
    expectOrthogonal(over);
  });
});
