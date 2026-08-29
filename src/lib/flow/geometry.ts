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

export interface RoutedLink {
  from: Point;
  to: Point;
  route?: Point[];
}

const JUMP_ARGS = {
  size: 10,
  radius: 10,
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
  const view = jumpoverView(from, to, route, others);
  return asPath(connectors.jumpover(from, to, route, { ...JUMP_ARGS, raw: true }, view as never));
}

export function jumpoverLinkPath(
  from: Point,
  to: Point,
  route: Point[] = [],
  others: RoutedLink[] = [],
): string {
  return jumpoverPath(from, to, route, others).serialize();
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
