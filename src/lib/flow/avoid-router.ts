import { dia, shapes } from "@joint/core";
import { initAvoidRouter, type RouterService } from "@joint/router-avoid";
import type { Link } from "$lib/blocks";
import { canUseIsolatedWorker } from "$lib/isolation";
import type { Point } from "./geometry";
import { linkKey, routesEqual } from "./geometry";
import type { NodeLayout, PortSide } from "./types";

/** Served separately so the LGPL libavoid binary is not inlined into the app bundle. */
export const LIBAVOID_WASM = "/assets/libavoid.wasm";

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

export function jointPortId(side: PortSide, name: string): string {
  return `${side}:${name}`;
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
    // Snap to the left edge. Avoid picks connectionDirection via
    // sideNearestToPoint; an inset handle near the bottom of a short
    // block is closer to the bottom than the left, so routes attach there.
    ports.push({ side: "in", name, x: 0, y: anchor.y });
  }
  return { id: String(id), x, y, width: layout.width, height: layout.height, ports };
}

export function connectorFromLink(link: Link): RouteConnector {
  return {
    id: linkKey(link.fromBlock, link.fromOut, link.toBlock, link.toIn),
    sourceId: String(link.fromBlock),
    sourcePort: jointPortId("out", link.fromOut),
    targetId: String(link.toBlock),
    targetPort: jointPortId("in", link.toIn),
  };
}

export function elementFromObstacle(obstacle: RouteObstacle): dia.Element {
  return new shapes.standard.Rectangle({
    id: obstacle.id,
    position: { x: obstacle.x, y: obstacle.y },
    size: { width: obstacle.width, height: obstacle.height },
    ports: {
      groups: {
        pin: { position: { name: "absolute" } },
      },
      items: obstacle.ports.map((port) => ({
        id: jointPortId(port.side, port.name),
        group: "pin",
        args: { x: port.x, y: port.y },
      })),
    },
  });
}

export function linkFromConnector(connector: RouteConnector): dia.Link {
  return new shapes.standard.Link({
    id: connector.id,
    source: { id: connector.sourceId, port: connector.sourcePort },
    target: { id: connector.targetId, port: connector.targetPort },
  });
}

function snap(value: number): number {
  return Math.round(value * 10) / 10;
}

function portsEqual(a: RoutePort[], b: RoutePort[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((port, index) => {
    const other = b[index]!;
    return port.side === other.side && port.name === other.name && port.x === other.x && port.y === other.y;
  });
}

export class AvoidRouteEngine {
  #graph: dia.Graph | null = null;
  #service: RouterService | null = null;
  #routes = new Map<string, Point[]>();
  #onChange: (() => void) | null = null;

  get ready(): boolean {
    return this.#service !== null;
  }

  get worker(): boolean {
    return this.#service !== null && this.#usesWorker;
  }

  get routes(): ReadonlyMap<string, Point[]> {
    return this.#routes;
  }

  #usesWorker = false;

  onRoutesChanged(callback: () => void): void {
    this.#onChange = callback;
  }

  async start(options?: { worker?: boolean; filePath?: string }): Promise<void> {
    if (this.#service) {
      return;
    }
    const requested = options?.worker ?? true;
    const wantWorker = requested === true || typeof requested === "object";
    const worker = wantWorker && canUseIsolatedWorker();
    try {
      await this.#boot(worker, options?.filePath);
    } catch (error) {
      if (!worker) {
        throw error;
      }
      console.warn("avoid router worker unavailable, using main thread", error);
      await this.#boot(false, options?.filePath);
    }
  }

  async #boot(worker: boolean, filePath?: string): Promise<void> {
    this.#usesWorker = worker;
    const graph = new dia.Graph({}, { cellNamespace: shapes });
    graph.on("remove", (cell: dia.Cell) => {
      if (cell.isLink()) {
        this.#routes.delete(String(cell.id));
        this.#emit();
      }
    });
    const service = await initAvoidRouter(graph, {
      worker,
      libavoidFilePath: filePath ?? LIBAVOID_WASM,
      shapeBufferDistance: 12,
      idealNudgingDistance: 16,
      setRouteAttributes: ({ link, attributes }) => {
        link.set(attributes, { avoidRouter: true });
        const vertices = (attributes.vertices ?? []).map((point) => ({ x: snap(point.x), y: snap(point.y) }));
        const key = String(link.id);
        if (!routesEqual(this.#routes.get(key), vertices)) {
          this.#routes.set(key, vertices);
          this.#emit();
        }
      },
    });
    service.start();
    this.#graph = graph;
    this.#service = service;
  }

  destroy(): void {
    this.#service?.destroy();
    this.#graph = null;
    this.#service = null;
    this.#routes = new Map();
    this.#onChange = null;
  }

  sync(obstacles: RouteObstacle[], connectors: RouteConnector[]): Map<string, Point[]> {
    const graph = this.#graph;
    if (!graph || !this.#service) {
      return new Map();
    }
    const nextElements = new Set(obstacles.map((item) => item.id));
    const nextLinks = new Set(connectors.map((item) => item.id));
    for (const cell of graph.getLinks()) {
      if (!nextLinks.has(String(cell.id))) {
        cell.remove();
      }
    }
    for (const cell of graph.getElements()) {
      if (!nextElements.has(String(cell.id))) {
        cell.remove();
      }
    }
    for (const obstacle of obstacles) {
      const existing = graph.getCell(obstacle.id);
      if (existing?.isElement()) {
        this.#updateElement(existing, obstacle);
      } else {
        graph.addCell(elementFromObstacle(obstacle));
      }
    }
    for (const connector of connectors) {
      const existing = graph.getCell(connector.id);
      if (existing?.isLink()) {
        this.#updateLink(existing, connector);
      } else {
        graph.addCell(linkFromConnector(connector));
      }
    }
    return this.#routes;
  }

  #elementPorts(element: dia.Element): RoutePort[] {
    return element.getPorts().map((port) => {
      const [side, name] = String(port.id).split(":");
      return {
        side: side === "in" ? "in" : "out",
        name: name ?? String(port.id),
        x: Number(port.args?.x ?? 0),
        y: Number(port.args?.y ?? 0),
      };
    });
  }

  #updateElement(element: dia.Element, obstacle: RouteObstacle): void {
    const graph = this.#graph;
    if (!graph) {
      return;
    }
    const size = element.size();
    const sizeChanged = size.width !== obstacle.width || size.height !== obstacle.height;
    // Libavoid pins are created only when a shape is first inserted. Resize
    // keeps proportional pin fractions, and extra ports (in[1], …) never get a
    // pin, so two inputs share one approach. Recreate the shape instead.
    if (sizeChanged || !portsEqual(this.#elementPorts(element), obstacle.ports)) {
      element.remove();
      graph.addCell(elementFromObstacle(obstacle));
      return;
    }
    const position = element.position();
    if (position.x !== obstacle.x || position.y !== obstacle.y) {
      element.position(obstacle.x, obstacle.y);
    }
  }

  #updateLink(link: dia.Link, connector: RouteConnector): void {
    const source = link.source();
    const target = link.target();
    if (source.id !== connector.sourceId || source.port !== connector.sourcePort) {
      link.source({ id: connector.sourceId, port: connector.sourcePort });
    }
    if (target.id !== connector.targetId || target.port !== connector.targetPort) {
      link.target({ id: connector.targetId, port: connector.targetPort });
    }
  }

  #emit(): void {
    this.#onChange?.();
  }
}
