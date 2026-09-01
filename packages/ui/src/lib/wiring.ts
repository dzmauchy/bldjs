import { type BlockDef, blockInput } from "@bld/xml/blocks/ast";
import { type Link, linksEqual } from "@bld/xml/blocks/diagram";
import {
  acceptsManyInputs,
  allocateIncomingSlot,
  allocateOutgoingSlot,
  catalogPortName,
  compactLinkSlots,
  findCatalogLink,
  type BlockPositionOf,
} from "@bld/xml/blocks/ports";

export function inputIsGrounded(links: readonly Link[], blockId: number, port: string): boolean {
  return links.some((link) => link.toBlock === blockId && link.toIn === port);
}

export function linksWithoutBlock(links: readonly Link[], id: number): Link[] {
  return links.filter((link) => link.fromBlock !== id && link.toBlock !== id);
}

export function remapSelectedLink(
  remaining: readonly Link[],
  compacted: readonly Link[],
  selected: Link | null,
  removed?: Link,
): Link | null {
  if (removed && selected && linksEqual(selected, removed)) {
    return null;
  }
  if (!selected) {
    return null;
  }
  const index = remaining.findIndex((item) => linksEqual(item, selected));
  return index >= 0 ? (compacted[index] ?? null) : null;
}

/** Slot allocation and connect/disconnect policy for the canvas graph. */
export class WiringGraph {
  readonly links: Link[];

  constructor(links: readonly Link[] = []) {
    this.links = [...links];
  }

  static compact(links: readonly Link[], positionOf?: BlockPositionOf): WiringGraph {
    return new WiringGraph(compactLinkSlots(links, positionOf));
  }

  connect(
    fromBlock: number,
    fromOut: string,
    toBlock: number,
    toIn: string,
    many: boolean,
  ): { graph: WiringGraph; existing?: Link } {
    const existing = findCatalogLink(this.links, fromBlock, fromOut, toBlock, toIn);
    if (existing) {
      return { graph: this.disconnect(existing), existing };
    }
    const catalogIn = catalogPortName(toIn);
    const catalogOut = catalogPortName(fromOut);
    let next = this.links;
    if (!many) {
      next = next.filter((item) => !(item.toBlock === toBlock && catalogPortName(item.toIn) === catalogIn));
    }
    const link: Link = {
      fromBlock,
      fromOut: allocateOutgoingSlot(next, fromBlock, catalogOut),
      toBlock,
      toIn: many ? allocateIncomingSlot(next, toBlock, catalogIn) : catalogIn,
    };
    return { graph: new WiringGraph([...next, link]) };
  }

  disconnect(link: Link): WiringGraph {
    return new WiringGraph(this.links.filter((item) => !linksEqual(item, link)));
  }

  withoutBlock(id: number): WiringGraph {
    return new WiringGraph(linksWithoutBlock(this.links, id));
  }

  inputIsGrounded(blockId: number, port: string): boolean {
    return inputIsGrounded(this.links, blockId, port);
  }
}

export function portAcceptsMany(def: BlockDef | undefined, toIn: string): boolean {
  const catalogIn = catalogPortName(toIn);
  const targetPort = def ? blockInput(def, catalogIn) : undefined;
  return acceptsManyInputs(targetPort);
}
