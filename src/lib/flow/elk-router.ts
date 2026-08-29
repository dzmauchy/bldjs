import ELK from "elkjs/lib/elk.bundled.js";
import type { ELK as ElkEngine, ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api.js";
import type { Link } from "$lib/blocks";
import { linkKey, remapElkRoute, routesEqual, snapCoord, type Point } from "./geometry";
import type { NodeLayout, PortSide } from "./types";

export interface RoutePort {
  side: PortSide;
  name: string;
  x: number;
  y: number;
}

export interface RouteObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports: RoutePort[];
}

export interface RouteConnector {
  id: string;
  sourceId: string;
  sourcePort: string;
  targetId: string;
  targetPort: string;
}

const ROOT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "SPLINES",
  "elk.layered.edgeRouting.splines.mode": "CONSERVATIVE_SOFT",
  "elk.portConstraints": "FIXED_POS",
  "elk.layered.allowNonFlowPortsToSwitchSides": "false",
  "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
  "elk.layered.layering.strategy": "INTERACTIVE",
  "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
  "elk.layered.nodePlacement.strategy": "INTERACTIVE",
  "elk.layered.unnecessaryBendpoints": "false",
  "elk.layered.feedbackEdges": "true",
  "elk.layered.nodePlacement.favorStraightEdges": "true",
  "elk.separateConnectedComponents": "false",
  "elk.spacing.nodeNode": "24",
  "elk.layered.spacing.nodeNodeBetweenLayers": "40",
  "elk.spacing.edgeNode": "16",
  "elk.spacing.edgeEdge": "10",
  "elk.layered.spacing.edgeNodeBetweenLayers": "16",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
};

export function elkPortId(nodeId: string, side: PortSide, name: string): string {
  return `${nodeId}:${side}:${name}`;
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
  const ports: RoutePort[] = [];
  for (const [name, anchor] of Object.entries(layout.ports.out)) {
    ports.push({ side: "out", name, x: layout.width, y: anchor.y });
  }
  for (const [name, anchor] of Object.entries(layout.ports.in)) {
    ports.push({ side: "in", name, x: 0, y: anchor.y });
  }
  return { id: String(id), x, y, width: layout.width, height: layout.height, ports };
}

export function connectorFromLink(link: Link): RouteConnector {
  const sourceId = String(link.fromBlock);
  const targetId = String(link.toBlock);
  return {
    id: linkKey(link.fromBlock, link.fromOut, link.toBlock, link.toIn),
    sourceId,
    sourcePort: elkPortId(sourceId, "out", link.fromOut),
    targetId,
    targetPort: elkPortId(targetId, "in", link.toIn),
  };
}

function portWorld(obstacle: RouteObstacle, portId: string): Point | undefined {
  const port = obstacle.ports.find((item) => elkPortId(obstacle.id, item.side, item.name) === portId);
  if (!port) {
    return undefined;
  }
  return { x: obstacle.x + port.x, y: obstacle.y + port.y };
}

export function elkNodeFromObstacle(obstacle: RouteObstacle): ElkNode {
  return {
    id: obstacle.id,
    x: obstacle.x,
    y: obstacle.y,
    width: obstacle.width,
    height: obstacle.height,
    layoutOptions: {
      "elk.portConstraints": "FIXED_POS",
      "elk.position": `(${obstacle.x}, ${obstacle.y})`,
    },
    ports: obstacle.ports.map((port) => ({
      id: elkPortId(obstacle.id, port.side, port.name),
      x: port.x,
      y: port.y,
      width: 0,
      height: 0,
      layoutOptions: {
        "elk.port.side": port.side === "out" ? "EAST" : "WEST",
        "elk.port.borderOffset": "0",
      },
    })),
  };
}

export function elkEdgeFromConnector(connector: RouteConnector): ElkExtendedEdge {
  return {
    id: connector.id,
    sources: [connector.sourcePort],
    targets: [connector.targetPort],
  };
}

export function buildElkGraph(obstacles: RouteObstacle[], connectors: RouteConnector[]): ElkNode {
  return {
    id: "root",
    layoutOptions: ROOT_OPTIONS,
    children: obstacles.map(elkNodeFromObstacle),
    edges: connectors.map(elkEdgeFromConnector),
  };
}

function sectionPoints(edge: ElkExtendedEdge): Point[] {
  const section = edge.sections?.[0];
  if (!section) {
    return [];
  }
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((point) => ({
    x: snapCoord(point.x),
    y: snapCoord(point.y),
  }));
}

export function routesFromLayout(
  laid: ElkNode,
  obstacles: RouteObstacle[],
  connectors: RouteConnector[],
): Map<string, Point[]> {
  const byId = new Map(obstacles.map((item) => [item.id, item]));
  const byEdge = new Map((laid.edges ?? []).map((edge) => [edge.id, edge]));
  const routes = new Map<string, Point[]>();
  for (const connector of connectors) {
    const edge = byEdge.get(connector.id);
    const raw = edge ? sectionPoints(edge) : [];
    const source = byId.get(connector.sourceId);
    const target = byId.get(connector.targetId);
    const from = source ? portWorld(source, connector.sourcePort) : undefined;
    const to = target ? portWorld(target, connector.targetPort) : undefined;
    if (!from || !to) {
      continue;
    }
    routes.set(connector.id, remapElkRoute(raw, from, to));
  }
  return routes;
}

function mapsEqual(a: Map<string, Point[]>, b: Map<string, Point[]>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, points] of a) {
    if (!routesEqual(points, b.get(key))) {
      return false;
    }
  }
  return true;
}

export class ElkRouteEngine {
  #elk: ElkEngine | null = null;
  #routes = new Map<string, Point[]>();
  #onChange: (() => void) | null = null;
  #token = 0;

  get ready(): boolean {
    return this.#elk !== null;
  }

  get routes(): ReadonlyMap<string, Point[]> {
    return this.#routes;
  }

  onRoutesChanged(callback: () => void): void {
    this.#onChange = callback;
  }

  async start(): Promise<void> {
    if (this.#elk) {
      return;
    }
    this.#elk = new ELK();
  }

  destroy(): void {
    this.#elk = null;
    this.#routes = new Map();
    this.#onChange = null;
    this.#token += 1;
  }

  async sync(obstacles: RouteObstacle[], connectors: RouteConnector[]): Promise<Map<string, Point[]>> {
    const elk = this.#elk;
    if (!elk) {
      return new Map();
    }
    const token = ++this.#token;
    const laid = await elk.layout(buildElkGraph(obstacles, connectors));
    if (token !== this.#token) {
      return this.#routes;
    }
    const next = routesFromLayout(laid, obstacles, connectors);
    if (!mapsEqual(this.#routes, next)) {
      this.#routes = next;
      this.#onChange?.();
    }
    return this.#routes;
  }
}
