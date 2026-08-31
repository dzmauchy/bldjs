import type { Link } from "@bld/xml";
import type { BlockInstance } from "$lib/diagram-model";
import { connectorFromLink, obstacleFromBlock, type RouteConnector, type RouteObstacle } from "./avoid-router";
import type { NodeLayout } from "./types";

export class DiagramLayoutController {
  layouts = new Map<number, NodeLayout>();

  remember(blockId: number, layout: NodeLayout): boolean {
    const prev = this.layouts.get(blockId);
    if (
      prev &&
      prev.width === layout.width &&
      prev.height === layout.height &&
      JSON.stringify(prev.ports) === JSON.stringify(layout.ports)
    ) {
      return false;
    }
    const next = new Map(this.layouts);
    next.set(blockId, layout);
    this.layouts = next;
    return true;
  }

  routePayload(
    blocks: readonly BlockInstance[],
    links: readonly Link[],
  ): { obstacles: RouteObstacle[]; connectors: RouteConnector[] } {
    const obstacles: RouteObstacle[] = [];
    for (const block of blocks) {
      const layout = this.layouts.get(block.id);
      if (!layout) {
        continue;
      }
      const obstacle = obstacleFromBlock(block.id, block.x, block.y, layout);
      if (obstacle) {
        obstacles.push(obstacle);
      }
    }
    const connectors = links
      .filter((link) => this.layouts.has(link.fromBlock) && this.layouts.has(link.toBlock))
      .map(connectorFromLink);
    return { obstacles, connectors };
  }
}
