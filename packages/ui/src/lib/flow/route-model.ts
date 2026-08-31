import type { Link } from "@bld/xml";
import { linkKey } from "./geometry/coordinates";
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
