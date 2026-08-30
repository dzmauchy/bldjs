import { screenToWorld } from "$lib/model";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const ORTHO_STUB = 24;
const ORTHO_EPS = 0.5;
const JUMP_SIZE = 10;

export function snapCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

function nearlyEqual(a: number, b: number, eps = ORTHO_EPS): boolean {
  return Math.abs(a - b) < eps;
}

export function orthogonalLink(from: Point, to: Point, stub = ORTHO_STUB): Point[] {
  const start = { x: from.x + stub, y: from.y };
  const end = { x: to.x - stub, y: to.y };
  if (nearlyEqual(from.y, to.y) && start.x <= end.x) {
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
 * the inset handles we draw from. Empty routes fall back to {@link orthogonalLink}.
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

export function polylinePath(points: Point[]): string {
  if (points.length === 0) {
    return "";
  }
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

export function polylineBounds(points: Point[], pad = 16): Rect {
  if (points.length === 0) {
    return { left: 0, top: 0, width: 1, height: 1 };
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs) - pad;
  const top = Math.min(...ys) - pad;
  const right = Math.max(...xs) + pad;
  const bottom = Math.max(...ys) + pad;
  return {
    left,
    top,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
  };
}

export function translatePolyline(points: Point[], origin: Point): Point[] {
  return points.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y }));
}

export interface AxisSegment {
  axis: "h" | "v";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function axisAlignedSegments(points: Point[]): AxisSegment[] {
  const segments: AxisSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const point = points[index]!;
    if (nearlyEqual(prev.y, point.y) && !nearlyEqual(prev.x, point.x)) {
      segments.push({
        axis: "h",
        x1: Math.min(prev.x, point.x),
        y1: prev.y,
        x2: Math.max(prev.x, point.x),
        y2: point.y,
      });
    } else if (nearlyEqual(prev.x, point.x) && !nearlyEqual(prev.y, point.y)) {
      segments.push({
        axis: "v",
        x1: prev.x,
        y1: Math.min(prev.y, point.y),
        x2: point.x,
        y2: Math.max(prev.y, point.y),
      });
    }
  }
  return segments;
}

/** Longest collinear overlap of two orthogonal polylines. */
export function collinearOverlapLength(left: Point[], right: Point[], eps = 1): number {
  let longest = 0;
  for (const a of axisAlignedSegments(left)) {
    for (const b of axisAlignedSegments(right)) {
      if (a.axis !== b.axis) {
        continue;
      }
      if (a.axis === "h") {
        if (Math.abs(a.y1 - b.y1) > eps) {
          continue;
        }
        longest = Math.max(longest, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
      } else if (Math.abs(a.x1 - b.x1) <= eps) {
        longest = Math.max(longest, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
      }
    }
  }
  return longest;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function segmentCross(
  a: Point,
  b: Point,
  other: AxisSegment,
): { t: number; x: number; y: number } | null {
  const horizontal = nearlyEqual(a.y, b.y) && !nearlyEqual(a.x, b.x);
  const vertical = nearlyEqual(a.x, b.x) && !nearlyEqual(a.y, b.y);
  if (horizontal && other.axis === "v") {
    const x = other.x1;
    const y = a.y;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (x <= minX + 1 || x >= maxX - 1 || y <= other.y1 + 1 || y >= other.y2 - 1) {
      return null;
    }
    return { t: (x - a.x) / (b.x - a.x), x, y };
  }
  if (vertical && other.axis === "h") {
    const x = a.x;
    const y = other.y1;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (y <= minY + 1 || y >= maxY - 1 || x <= other.x1 + 1 || x >= other.x2 - 1) {
      return null;
    }
    return { t: (y - a.y) / (b.y - a.y), x, y };
  }
  return null;
}

function hopAround(a: Point, b: Point, hit: Point, size: number): Point[] {
  if (nearlyEqual(a.y, b.y)) {
    const dir = Math.sign(b.x - a.x) || 1;
    return [
      { x: hit.x - dir * size, y: hit.y },
      { x: hit.x - dir * size, y: hit.y - size },
      { x: hit.x + dir * size, y: hit.y - size },
      { x: hit.x + dir * size, y: hit.y },
    ];
  }
  const dir = Math.sign(b.y - a.y) || 1;
  return [
    { x: hit.x, y: hit.y - dir * size },
    { x: hit.x - size, y: hit.y - dir * size },
    { x: hit.x - size, y: hit.y + dir * size },
    { x: hit.x, y: hit.y + dir * size },
  ];
}

/**
 * Raise later wires over earlier ones with an orthogonal hop so clip-path
 * connectors stay axis-aligned.
 */
export function insertOrthogonalJumps(points: Point[], others: Point[][], size = JUMP_SIZE): Point[] {
  if (points.length < 2 || others.length === 0) {
    return simplifyOrthogonal(points);
  }
  const out: Point[] = [{ ...points[0]! }];
  const minGap = size * 2;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const hits: { t: number; x: number; y: number }[] = [];
    for (const other of others) {
      for (const seg of axisAlignedSegments(other)) {
        const hit = segmentCross(a, b, seg);
        if (hit) {
          hits.push(hit);
        }
      }
    }
    hits.sort((left, right) => left.t - right.t);
    let last: Point | null = null;
    for (const hit of hits) {
      const point = { x: hit.x, y: hit.y };
      if (dist(point, a) < minGap || dist(point, b) < minGap) {
        continue;
      }
      if (last && dist(point, last) < minGap) {
        continue;
      }
      if (hits.some((other) => other !== hit && nearlyEqual(other.x, hit.x) && nearlyEqual(other.y, hit.y) && other.t < hit.t)) {
        continue;
      }
      out.push(...hopAround(a, b, point, size));
      last = point;
    }
    out.push({ ...b });
  }
  return simplifyOrthogonal(out);
}

export function connectorWorldPolyline(
  from: Point,
  to: Point,
  route: Point[] = [],
  crossings: Point[][] = [],
): Point[] {
  return insertOrthogonalJumps(connectorPolyline(from, to, route), crossings);
}

function tangent(from: Point, to: Point): Point {
  return {
    x: nearlyEqual(from.x, to.x) ? 0 : Math.sign(to.x - from.x),
    y: nearlyEqual(from.y, to.y) ? 0 : Math.sign(to.y - from.y),
  };
}

function leftNormal(dir: Point): Point {
  return { x: -dir.y, y: dir.x };
}

/** Outline of an orthogonal polyline stroke, for CSS `clip-path: polygon(...)`. */
export function strokePolygon(points: Point[], width: number): Point[] {
  const simplified = simplifyOrthogonal(points);
  if (simplified.length < 2 || !(width > 0)) {
    return [];
  }
  const h = width / 2;
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < simplified.length; i += 1) {
    const curr = simplified[i]!;
    const prev = i > 0 ? simplified[i - 1]! : null;
    const next = i < simplified.length - 1 ? simplified[i + 1]! : null;
    const tin = prev ? tangent(prev, curr) : next ? tangent(curr, next) : { x: 1, y: 0 };
    const tout = next ? tangent(curr, next) : tin;
    const nIn = leftNormal(tin);
    const nOut = leftNormal(tout);
    if (!prev || !next || (nIn.x === nOut.x && nIn.y === nOut.y)) {
      left.push({ x: curr.x + nOut.x * h, y: curr.y + nOut.y * h });
      right.push({ x: curr.x - nOut.x * h, y: curr.y - nOut.y * h });
      continue;
    }
    const mx = nIn.x + nOut.x;
    const my = nIn.y + nOut.y;
    const denom = mx * nIn.x + my * nIn.y;
    const scale = denom === 0 ? h : h / denom;
    left.push({ x: curr.x + mx * scale, y: curr.y + my * scale });
    right.push({ x: curr.x - mx * scale, y: curr.y - my * scale });
  }
  return [...left, ...right.reverse()];
}

export function cssPolygon(points: Point[]): string {
  if (points.length < 3) {
    return "none";
  }
  return `polygon(${points.map((point) => `${snapCoord(point.x)}px ${snapCoord(point.y)}px`).join(", ")})`;
}

/**
 * Earlier wires stay flat so only the later crossing wire hops.
 */
export function jumpoverUnderlays<T>(items: readonly T[], index: number): T[] {
  if (index <= 0) {
    return [];
  }
  return items.slice(0, index);
}

export function routesEqual(a: Point[] | undefined, b: Point[] | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every((point, index) => point.x === b[index]!.x && point.y === b[index]!.y);
}

export function clientToWorld(
  clientX: number,
  clientY: number,
  viewport: Pick<DOMRect, "left" | "top">,
  panX: number,
  panY: number,
  zoom: number,
): Point {
  const [x, y] = screenToWorld(clientX - viewport.left, clientY - viewport.top, panX, panY, zoom);
  return { x, y };
}

export function linkKey(fromBlock: number, fromOut: string, toBlock: number, toIn: string): string {
  return `${fromBlock}:${fromOut}->${toBlock}:${toIn}`;
}

export function formatPolyline(points: Point[]): string {
  return points.map((point) => `${snapCoord(point.x)},${snapCoord(point.y)}`).join(" ");
}
