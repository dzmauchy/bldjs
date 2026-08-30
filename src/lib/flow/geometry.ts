import { connectors, g } from "@joint/core";
import { screenToWorld } from "$lib/model";

type JointPath = {
  bbox: () => { x: number; y: number; width: number; height: number } | null;
  translate: (tx: number, ty: number) => JointPath;
  serialize: () => string;
  toPoints: (opt?: { precision?: number }) => { x: number; y: number }[][] | null;
};

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

export const JUMPOVER = {
  size: 5,
  radius: 5,
  jump: "cubic",
} as const;

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

export interface RoutedLink {
  from: Point;
  to: Point;
  route?: Point[];
}

type FakeLink = {
  id: string;
  get: (key: string) => { name: string } | undefined;
};

type FakeLinkView = {
  paper: FakePaper;
  model: FakeLink;
  sourcePoint: Point;
  targetPoint: Point;
  route: Point[];
  listenToOnce: () => void;
};

type FakePaper = {
  options: Record<string, never>;
  model: { on: () => void; getLinks: () => FakeLink[] };
  findViewByModel: (link: FakeLink) => FakeLinkView | undefined;
};

function jumpoverView(from: Point, to: Point, route: Point[], others: RoutedLink[]): FakeLinkView {
  const thisLink: FakeLink = { id: "this", get: () => ({ name: "jumpover" }) };
  const otherLinks = others.map((_, index): FakeLink => ({
    id: `other-${index}`,
    get: () => ({ name: "jumpover" }),
  }));
  const allLinks = [...otherLinks, thisLink];
  const views = new Map<FakeLink, FakeLinkView>();
  const paper: FakePaper = {
    options: {},
    model: {
      on() {},
      getLinks: () => allLinks,
    },
    findViewByModel(link) {
      return views.get(link);
    },
  };
  const thisView: FakeLinkView = {
    paper,
    model: thisLink,
    sourcePoint: from,
    targetPoint: to,
    route,
    listenToOnce() {},
  };
  views.set(thisLink, thisView);
  others.forEach((item, index) => {
    const model = otherLinks[index]!;
    views.set(model, {
      paper,
      model,
      sourcePoint: item.from,
      targetPoint: item.to,
      route: item.route ?? [],
      listenToOnce() {},
    });
  });
  return thisView;
}

function asPath(result: unknown): JointPath {
  if (typeof result === "string") {
    return new g.Path(result) as unknown as JointPath;
  }
  return result as JointPath;
}

export function jumpoverPath(
  from: Point,
  to: Point,
  route: Point[] = [],
  others: RoutedLink[] = [],
): JointPath {
  const vertices = jumpoverRoute(from, to, route);
  const crossings = others.map((item) => ({
    from: item.from,
    to: item.to,
    route: jumpoverRoute(item.from, item.to, item.route ?? []),
  }));
  const view = jumpoverView(from, to, vertices, crossings);
  return asPath(connectors.jumpover(from, to, vertices, { ...JUMPOVER, raw: true }, view as never));
}

export function jumpoverLinkPath(
  from: Point,
  to: Point,
  route: Point[] = [],
  others: RoutedLink[] = [],
): string {
  return jumpoverPath(from, to, route, others).serialize();
}

function sampleJumpoverPath(path: JointPath): Point[] {
  const groups = path.toPoints({ precision: 2 }) ?? [];
  const points: Point[] = [];
  for (const group of groups) {
    for (const point of group) {
      const next = { x: point.x, y: point.y };
      const prev = points[points.length - 1];
      if (prev && nearlyEqual(prev.x, next.x, 0.05) && nearlyEqual(prev.y, next.y, 0.05)) {
        continue;
      }
      points.push(next);
    }
  }
  return points;
}

export function connectorWorldPolyline(
  from: Point,
  to: Point,
  route: Point[] = [],
  crossings: RoutedLink[] = [],
): Point[] {
  return sampleJumpoverPath(jumpoverPath(from, to, route, crossings));
}

export function connectorWorldBounds(
  from: Point,
  to: Point,
  route: Point[] = [],
  crossings: RoutedLink[] = [],
  pad = 16,
): Rect {
  const box = jumpoverPath(from, to, route, crossings).bbox();
  if (!box) {
    return polylineBounds(connectorWorldPolyline(from, to, route, crossings), pad);
  }
  return {
    left: box.x - pad,
    top: box.y - pad,
    width: Math.max(box.width + pad * 2, 1),
    height: Math.max(box.height + pad * 2, 1),
  };
}

function unitTangent(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return { x: 1, y: 0 };
  }
  return { x: dx / len, y: dy / len };
}

function leftNormal(dir: Point): Point {
  return { x: -dir.y, y: dir.x };
}

function dedupePoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (prev && nearlyEqual(prev.x, point.x, 0.05) && nearlyEqual(prev.y, point.y, 0.05)) {
      continue;
    }
    out.push({ ...point });
  }
  return out;
}

/** Outline of a (possibly rounded) polyline stroke, for CSS `clip-path: polygon(...)`. */
export function strokePolygon(points: Point[], width: number): Point[] {
  const simplified = dedupePoints(points);
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
    const tin = prev ? unitTangent(prev, curr) : next ? unitTangent(curr, next) : { x: 1, y: 0 };
    const tout = next ? unitTangent(curr, next) : tin;
    const nIn = leftNormal(tin);
    const nOut = leftNormal(tout);
    if (!prev || !next || (Math.abs(nIn.x - nOut.x) < 1e-6 && Math.abs(nIn.y - nOut.y) < 1e-6)) {
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

export interface StrokeRun {
  x: number;
  y: number;
  length: number;
  angleDeg: number;
}

/** Consecutive samples as rotated stroke runs for dash animation along jumpover curves. */
export function strokeRuns(points: Point[]): StrokeRun[] {
  const runs: StrokeRun[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const point = points[index]!;
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.05) {
      continue;
    }
    runs.push({
      x: prev.x,
      y: prev.y,
      length,
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }
  return runs;
}

export function cssPolygon(points: Point[]): string {
  if (points.length < 3) {
    return "none";
  }
  return `polygon(${points.map((point) => `${snapCoord(point.x)}px ${snapCoord(point.y)}px`).join(", ")})`;
}

/**
 * JointJS jumpover draws a hoop on every link that lists the other as a
 * crossing. Only earlier wires should be passed in, or both lines get an
 * overlap hoop at the same intersection.
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
