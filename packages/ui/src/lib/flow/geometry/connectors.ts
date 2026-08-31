import { connectors, g } from "@joint/core";
import { nearlyEqual, polylineBounds, type Point, type Rect, type RoutedLink } from "./coordinates";
import { jumpoverRoute } from "./routing";

export type { RoutedLink };

export const JUMPOVER = {
  size: 5,
  radius: 5,
  jump: "cubic",
} as const;

type JointPath = {
  bbox: () => { x: number; y: number; width: number; height: number } | null;
  translate: (tx: number, ty: number) => JointPath;
  serialize: () => string;
  toPoints: (opt?: { precision?: number }) => { x: number; y: number }[][] | null;
};

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

