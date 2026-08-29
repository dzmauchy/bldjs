import { loadAvoidRouter } from "@joint/router-avoid";
import { AvoidLib } from "libavoid-js";
import libavoidWasm from "libavoid-js/dist/libavoid.wasm?url";
import type { Point } from "./geometry";
import { linkKey } from "./geometry";
import type { NodeLayout, PortSide } from "./types";
import type { Link } from "$lib/blocks";

const SHAPE_BUFFER = 10;
const IDEAL_NUDGE = 5;

/** Matches libavoid ConnDirFlags / JointJS RouterService. */
export const CONN_DIR = {
  top: 1,
  right: 8,
  bottom: 2,
  left: 4,
  all: 15,
} as const;

export interface RoutePin {
  id: number;
  x: number;
  y: number;
  dir: number;
}

export interface RouteObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pins: RoutePin[];
}

export interface RouteConnector {
  id: string;
  sourceId: string;
  sourcePinId: number;
  targetId: string;
  targetPinId: number;
}

type AvoidInstance = ReturnType<typeof AvoidLib.getInstance>;
type AvoidRouter = InstanceType<AvoidInstance["Router"]>;
type AvoidShapeRef = InstanceType<AvoidInstance["ShapeRef"]>;
type AvoidConnRef = InstanceType<AvoidInstance["ConnRef"]>;

export function pinIdFor(side: PortSide, name: string): number {
  const key = `${side}:${name}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 900000) + 1;
}

export function obstacleFromBlock(
  id: number,
  x: number,
  y: number,
  layout: NodeLayout,
): RouteObstacle | undefined {
  if (layout.width <= 0 || layout.height <= 0) {
    return undefined;
  }
  const pins: RoutePin[] = [];
  for (const [name, anchor] of Object.entries(layout.ports.out)) {
    pins.push({
      id: pinIdFor("out", name),
      x: anchor.x / layout.width,
      y: anchor.y / layout.height,
      dir: CONN_DIR.right,
    });
  }
  for (const [name, anchor] of Object.entries(layout.ports.in)) {
    pins.push({
      id: pinIdFor("in", name),
      x: anchor.x / layout.width,
      y: anchor.y / layout.height,
      dir: CONN_DIR.left,
    });
  }
  return { id: String(id), x, y, width: layout.width, height: layout.height, pins };
}

export function connectorFromLink(link: Link): RouteConnector {
  return {
    id: linkKey(link.fromBlock, link.fromOut, link.toBlock, link.toIn),
    sourceId: String(link.fromBlock),
    sourcePinId: pinIdFor("out", link.fromOut),
    targetId: String(link.toBlock),
    targetPinId: pinIdFor("in", link.toIn),
  };
}

export function loadRouterWasm(filePath?: string): Promise<void> {
  return loadAvoidRouter(filePath ?? libavoidWasm);
}

function snap(value: number): number {
  return Math.round(value * 10) / 10;
}

function pinsEqual(a: RoutePin[], b: RoutePin[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((pin, index) => {
    const other = b[index]!;
    return pin.id === other.id && pin.x === other.x && pin.y === other.y && pin.dir === other.dir;
  });
}

function readRoute(conn: AvoidConnRef): Point[] {
  const route = conn.displayRoute();
  const points: Point[] = [];
  for (let i = 0; i < route.size(); i++) {
    const point = route.get_ps(i);
    points.push({ x: snap(point.x), y: snap(point.y) });
  }
  return points;
}

export class AvoidRouteEngine {
  #avoid: AvoidInstance | null = null;
  #router: AvoidRouter | null = null;
  #shapes = new Map<string, { ref: AvoidShapeRef; meta: RouteObstacle }>();
  #connectors = new Map<string, AvoidConnRef>();
  #routes = new Map<string, Point[]>();

  get ready(): boolean {
    return this.#router !== null;
  }

  get routes(): ReadonlyMap<string, Point[]> {
    return this.#routes;
  }

  async start(filePath?: string): Promise<void> {
    if (this.#router) {
      return;
    }
    await loadRouterWasm(filePath);
    const avoid = AvoidLib.getInstance();
    this.#avoid = avoid;
    this.#router = this.#createRouter(avoid);
  }

  destroy(): void {
    if (this.#router) {
      for (const conn of this.#connectors.values()) {
        this.#router.deleteConnector(conn);
      }
      for (const { ref } of this.#shapes.values()) {
        this.#router.deleteShape(ref);
      }
    }
    this.#connectors.clear();
    this.#shapes.clear();
    this.#routes = new Map();
    this.#router = null;
    this.#avoid = null;
  }

  sync(obstacles: RouteObstacle[], connectors: RouteConnector[]): Map<string, Point[]> {
    if (!this.#router || !this.#avoid) {
      return new Map();
    }
    const nextShapeIds = new Set(obstacles.map((item) => item.id));
    const nextConnIds = new Set(connectors.map((item) => item.id));
    for (const id of [...this.#connectors.keys()]) {
      if (!nextConnIds.has(id)) {
        this.#deleteConnector(id);
      }
    }
    for (const id of [...this.#shapes.keys()]) {
      if (!nextShapeIds.has(id)) {
        this.#deleteShape(id);
      }
    }
    for (const shape of obstacles) {
      this.#setShape(shape);
    }
    for (const connector of connectors) {
      this.#setConnector(connector);
    }
    this.#router.processTransaction();
    const routes = new Map<string, Point[]>();
    for (const [id, conn] of this.#connectors) {
      const points = readRoute(conn);
      if (points.length >= 2) {
        routes.set(id, points);
      }
    }
    this.#routes = routes;
    return routes;
  }

  #createRouter(avoid: AvoidInstance): AvoidRouter {
    const router = new avoid.Router(avoid.OrthogonalRouting);
    router.setRoutingParameter(avoid.shapeBufferDistance, SHAPE_BUFFER);
    router.setRoutingParameter(avoid.idealNudgingDistance, IDEAL_NUDGE);
    router.setRoutingOption(avoid.nudgeOrthogonalTouchingColinearSegments, false);
    router.setRoutingOption(avoid.performUnifyingNudgingPreprocessingStep, true);
    router.setRoutingOption(avoid.nudgeSharedPathsWithCommonEndPoint, true);
    router.setRoutingOption(avoid.nudgeOrthogonalSegmentsConnectedToShapes, true);
    return router;
  }

  #setShape(shape: RouteObstacle): void {
    const avoid = this.#avoid!;
    const router = this.#router!;
    const rect = new avoid.Rectangle(
      new avoid.Point(shape.x, shape.y),
      new avoid.Point(shape.x + shape.width, shape.y + shape.height),
    );
    const existing = this.#shapes.get(shape.id);
    if (existing && pinsEqual(existing.meta.pins, shape.pins)) {
      if (
        existing.meta.x !== shape.x ||
        existing.meta.y !== shape.y ||
        existing.meta.width !== shape.width ||
        existing.meta.height !== shape.height
      ) {
        router.moveShape(existing.ref, rect);
      }
      existing.meta = shape;
      return;
    }
    if (existing) {
      this.#deleteShape(shape.id);
    }
    const shapeRef = new avoid.ShapeRef(router, rect);
    for (const pin of shape.pins) {
      const pinRef = new avoid.ShapeConnectionPin(shapeRef, pin.id, pin.x, pin.y, true, 0, pin.dir);
      pinRef.setExclusive(false);
    }
    this.#shapes.set(shape.id, { ref: shapeRef, meta: shape });
  }

  #setConnector(connector: RouteConnector): void {
    const avoid = this.#avoid!;
    const source = this.#shapes.get(connector.sourceId);
    const target = this.#shapes.get(connector.targetId);
    if (!source || !target) {
      this.#deleteConnector(connector.id);
      return;
    }
    const sourceEnd = new avoid.ConnEnd(source.ref, connector.sourcePinId);
    const targetEnd = new avoid.ConnEnd(target.ref, connector.targetPinId);
    const existing = this.#connectors.get(connector.id);
    if (existing) {
      existing.setSourceEndpoint(sourceEnd);
      existing.setDestEndpoint(targetEnd);
      return;
    }
    const connRef = new avoid.ConnRef(this.#router!);
    connRef.setSourceEndpoint(sourceEnd);
    connRef.setDestEndpoint(targetEnd);
    this.#connectors.set(connector.id, connRef);
  }

  #deleteShape(id: string): void {
    const existing = this.#shapes.get(id);
    if (!existing || !this.#router) {
      return;
    }
    this.#router.deleteShape(existing.ref);
    this.#shapes.delete(id);
  }

  #deleteConnector(id: string): void {
    const existing = this.#connectors.get(id);
    if (!existing || !this.#router) {
      return;
    }
    this.#router.deleteConnector(existing);
    this.#connectors.delete(id);
  }
}
