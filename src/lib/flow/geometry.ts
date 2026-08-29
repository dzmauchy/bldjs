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

export interface CubicLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  d: string;
}

const MIN_HANDLE = 40;
const HANDLE_RATIO = 0.45;

export function cubicLink(from: Point, to: Point): CubicLink {
  const dx = Math.max(Math.abs(to.x - from.x) * HANDLE_RATIO, MIN_HANDLE);
  const c1x = from.x + dx;
  const c1y = from.y;
  const c2x = to.x - dx;
  const c2y = to.y;
  return {
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    c1x,
    c1y,
    c2x,
    c2y,
    d: `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`,
  };
}

export function cubicLinkBounds(link: CubicLink, pad = 16): Rect {
  const xs = [link.x1, link.c1x, link.c2x, link.x2];
  const ys = [link.y1, link.c1y, link.c2y, link.y2];
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

export function translatePath(link: CubicLink, origin: Point): string {
  const dx = origin.x;
  const dy = origin.y;
  return `M ${link.x1 - dx} ${link.y1 - dy} C ${link.c1x - dx} ${link.c1y - dy}, ${link.c2x - dx} ${link.c2y - dy}, ${link.x2 - dx} ${link.y2 - dy}`;
}

const ORTHO_STUB = 24;

export function orthogonalLink(from: Point, to: Point, stub = ORTHO_STUB): Point[] {
  const start = { x: from.x + stub, y: from.y };
  const end = { x: to.x - stub, y: to.y };
  if (Math.abs(from.y - to.y) < 0.5 && start.x <= end.x) {
    return [from, to];
  }
  if (start.x <= end.x) {
    const midX = (start.x + end.x) / 2;
    return [from, start, { x: midX, y: from.y }, { x: midX, y: to.y }, end, to];
  }
  const midY = (from.y + to.y) / 2;
  return [from, start, { x: start.x, y: midY }, { x: end.x, y: midY }, end, to];
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

export function translatePolyline(points: Point[], origin: Point): string {
  return polylinePath(points.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y })));
}

export const CORNER_RADIUS = 8;

export function snapCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

export function simplifyOrthogonal(points: Point[]): Point[] {
  if (points.length <= 1) {
    return points.map((point) => ({ ...point }));
  }
  const out: Point[] = [{ ...points[0]! }];
  for (let i = 1; i < points.length; i++) {
    const curr = points[i]!;
    const prev = out[out.length - 1]!;
    if (Math.abs(curr.x - prev.x) < 0.05 && Math.abs(curr.y - prev.y) < 0.05) {
      continue;
    }
    if (out.length >= 2) {
      const before = out[out.length - 2]!;
      const colinearX = Math.abs(before.x - prev.x) < 0.05 && Math.abs(prev.x - curr.x) < 0.05;
      const colinearY = Math.abs(before.y - prev.y) < 0.05 && Math.abs(prev.y - curr.y) < 0.05;
      if (colinearX || colinearY) {
        out[out.length - 1] = { ...curr };
        continue;
      }
    }
    out.push({ ...curr });
  }
  return out;
}

export function remapElkRoute(raw: Point[], from: Point, to: Point): Point[] {
  if (raw.length < 2) {
    return orthogonalLink(from, to);
  }
  const srcOff = { x: from.x - raw[0]!.x, y: from.y - raw[0]!.y };
  const dstOff = { x: to.x - raw[raw.length - 1]!.x, y: to.y - raw[raw.length - 1]!.y };
  const points = raw.map((point) => ({ x: snapCoord(point.x + srcOff.x), y: snapCoord(point.y + srcOff.y) }));
  points[0] = { ...from };
  points[points.length - 1] = { ...to };
  if (Math.abs(srcOff.x - dstOff.x) >= 2 || Math.abs(srcOff.y - dstOff.y) >= 2) {
    if (points.length > 1) {
      points[1] = { x: points[1]!.x, y: from.y };
    }
    if (points.length > 2) {
      points[points.length - 2] = { x: points[points.length - 2]!.x, y: to.y };
    }
  }
  return simplifyOrthogonal(points);
}

export function connectorPolyline(from: Point, to: Point, route: Point[] = []): Point[] {
  if (route.length >= 2) {
    return remapElkRoute(route, from, to);
  }
  return orthogonalLink(from, to);
}

export function roundedPolylinePath(points: Point[], radius = CORNER_RADIUS): string {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    return `M ${points[0]!.x} ${points[0]!.y}`;
  }
  if (points.length === 2) {
    return polylinePath(points);
  }
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;
    const inLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const outLen = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }
    const start = {
      x: curr.x - ((curr.x - prev.x) / inLen) * r,
      y: curr.y - ((curr.y - prev.y) / inLen) * r,
    };
    const end = {
      x: curr.x + ((next.x - curr.x) / outLen) * r,
      y: curr.y + ((next.y - curr.y) / outLen) * r,
    };
    d += ` L ${start.x} ${start.y} Q ${curr.x} ${curr.y} ${end.x} ${end.y}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function translateRounded(points: Point[], origin: Point, radius = CORNER_RADIUS): string {
  return roundedPolylinePath(
    points.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y })),
    radius,
  );
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
