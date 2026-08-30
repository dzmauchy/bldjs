import { connectors, g } from "@joint/core";
import { screenToWorld } from "$lib/model";

type JointPath = {
  bbox: () => { x: number; y: number; width: number; height: number } | null;
  translate: (tx: number, ty: number) => JointPath;
  serialize: () => string;
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
const ORTHO_EPS = 0.5;

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

export function translatePolyline(points: Point[], origin: Point): string {
  return polylinePath(points.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y })));
}

export interface RoutedLink {
  from: Point;
  to: Point;
  route?: Point[];
}

const JUMP_ARGS = {
  size: 10,
  // Keep this smaller than a typical port-row gap. Radius 10 turns a short
  // vertical between two horizontals into a cubic S-curve with no right angle.
  radius: 4,
  jump: "arc",
} as const;

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
    return new g.Path(result);
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
  return asPath(connectors.jumpover(from, to, vertices, { ...JUMP_ARGS, raw: true }, view as never));
}

export function jumpoverLinkPath(
  from: Point,
  to: Point,
  route: Point[] = [],
  others: RoutedLink[] = [],
): string {
  return jumpoverPath(from, to, route, others).serialize();
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

export function jumpoverLinkBounds(
  from: Point,
  to: Point,
  route: Point[] = [],
  others: RoutedLink[] = [],
  pad = 16,
): Rect {
  const box = jumpoverPath(from, to, route, others).bbox();
  if (!box) {
    return { left: 0, top: 0, width: 1, height: 1 };
  }
  return {
    left: box.x - pad,
    top: box.y - pad,
    width: Math.max(box.width + pad * 2, 1),
    height: Math.max(box.height + pad * 2, 1),
  };
}

export function translateJumpover(
  from: Point,
  to: Point,
  route: Point[],
  origin: Point,
  others: RoutedLink[] = [],
): string {
  return jumpoverPath(from, to, route, others).translate(-origin.x, -origin.y).serialize();
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
