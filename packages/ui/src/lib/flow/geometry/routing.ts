import { nearlyEqual, snapCoord, type Point } from "./coordinates";

const ORTHO_STUB = 24;
const ORTHO_EPS = 0.5;

export function orthogonalLink(from: Point, to: Point, stub = ORTHO_STUB): Point[] {
  const start = { x: from.x + stub, y: from.y };
  const end = { x: to.x - stub, y: to.y };
  if (nearlyEqual(from.y, to.y, ORTHO_EPS) && start.x <= end.x) {
    return [from, to];
  }
  if (start.x <= end.x) {
    const midX = (start.x + end.x) / 2;
    return [from, start, { x: midX, y: from.y }, { x: midX, y: to.y }, end, to];
  }
  const midY = (from.y + to.y) / 2;
  return [from, start, { x: start.x, y: midY }, { x: end.x, y: midY }, end, to];
}

export function simplifyOrthogonal(points: Point[]): Point[] {
  if (points.length <= 1) {
    return points.map((point) => ({ ...point }));
  }
  const out: Point[] = [{ ...points[0]! }];
  for (let i = 1; i < points.length; i++) {
    const curr = points[i]!;
    const prev = out[out.length - 1]!;
    if (nearlyEqual(curr.x, prev.x, 0.05) && nearlyEqual(curr.y, prev.y, 0.05)) {
      continue;
    }
    if (out.length >= 2) {
      const before = out[out.length - 2]!;
      const colinearX = nearlyEqual(before.x, prev.x, 0.05) && nearlyEqual(prev.x, curr.x, 0.05);
      const colinearY = nearlyEqual(before.y, prev.y, 0.05) && nearlyEqual(prev.y, curr.y, 0.05);
      if (colinearX || colinearY) {
        out[out.length - 1] = { ...curr };
        continue;
      }
    }
    out.push({ ...curr });
  }
  return out;
}

function insertOrthogonalCorners(points: Point[]): Point[] {
  if (points.length <= 1) {
    return points.map((point) => ({ ...point }));
  }
  const out: Point[] = [{ ...points[0]! }];
  for (let i = 1; i < points.length; i++) {
    const curr = points[i]!;
    const prev = out[out.length - 1]!;
    if (nearlyEqual(curr.x, prev.x, 0.05) && nearlyEqual(curr.y, prev.y, 0.05)) {
      continue;
    }
    if (!nearlyEqual(curr.x, prev.x) && !nearlyEqual(curr.y, prev.y)) {
      out.push({ x: snapCoord(curr.x), y: prev.y });
    }
    out.push({ x: snapCoord(curr.x), y: snapCoord(curr.y) });
  }
  return simplifyOrthogonal(out);
}

export function ensureHorizontalStubs(points: Point[], from: Point, to: Point, stub = ORTHO_STUB): Point[] {
  const out = (points.length >= 2 ? points : [from, to]).map((point) => ({ ...point }));
  out[0] = { ...from };
  out[out.length - 1] = { ...to };

  const startStub = { x: snapCoord(from.x + stub), y: from.y };
  const second = out[1]!;
  if (nearlyEqual(second.y, from.y) && second.x > from.x + 1) {
    out[1] = { x: Math.max(second.x, from.x + stub), y: from.y };
  } else {
    out.splice(1, 0, startStub);
  }

  const endStub = { x: snapCoord(to.x - stub), y: to.y };
  const prev = out[out.length - 2]!;
  if (nearlyEqual(prev.y, to.y) && prev.x < to.x - 1) {
    out[out.length - 2] = { x: Math.min(prev.x, to.x - stub), y: to.y };
  } else {
    out.splice(out.length - 1, 0, endStub);
  }

  return out;
}

/**
 * Rebuild an orthogonal polyline from port handles through avoid vertices.
 *
 * Libavoid's vertices are interior corners relative to shape-edge pins, not
 * the inset handles we draw from. Jumpover then connects `from` → vertices →
 * `to` with straight segments, so a missing corner or a 2-point pin route
 * becomes a diagonal. Empty routes fall back to {@link orthogonalLink}.
 */
export function connectorPolyline(from: Point, to: Point, route: Point[] = []): Point[] {
  if (route.length === 0) {
    if (nearlyEqual(from.x, to.x) || nearlyEqual(from.y, to.y)) {
      return [from, to];
    }
    return orthogonalLink(from, to);
  }
  return insertOrthogonalCorners(ensureHorizontalStubs([from, ...route, to], from, to));
}

export function jumpoverRoute(from: Point, to: Point, route: Point[] = []): Point[] {
  const points = connectorPolyline(from, to, route);
  if (points.length <= 2) {
    return [];
  }
  return points.slice(1, -1);
}
