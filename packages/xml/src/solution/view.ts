import type { Link } from "../blocks/diagram";
import { catalogPortName, portSlotIndex } from "../blocks/ports";

/** One placed block in a connected solution (XML `block` instance). */
export interface SolutionViewBlock {
  id: number;
  defId: string;
}

/** One wire between XML ports. Extra vector slots use `out[1]`, `in[1]`, … */
export interface SolutionViewConnector {
  fromBlock: number;
  fromOut: string;
  toBlock: number;
  toIn: string;
}

/** Connected blocks the SolutionBuilder assembles. Positions are not part of the view. */
export class SolutionView {
  constructor(
    readonly blocks: readonly SolutionViewBlock[],
    readonly connectors: readonly SolutionViewConnector[],
  ) {}

  static from(
    blocks: readonly { id: number; defId: string }[],
    connectors: readonly Link[],
  ): SolutionView {
    return new SolutionView(
      blocks.map((block) => ({ id: block.id, defId: block.defId })),
      connectors.map((link) => ({
        fromBlock: link.fromBlock,
        fromOut: link.fromOut,
        toBlock: link.toBlock,
        toIn: link.toIn,
      })),
    );
  }

  defId(id: number): string | undefined {
    return this.blocks.find((block) => block.id === id)?.defId;
  }

  instanceName(block: SolutionViewBlock): string {
    const same = this.blocks.filter((item) => item.defId === block.defId);
    return same.length === 1 ? block.defId : `${block.defId}_${block.id}`;
  }

  incoming(toBlock: number, port: string): SolutionViewConnector[] {
    return this.portConnectors(toBlock, port, "in");
  }

  outgoing(fromBlock: number, port: string): SolutionViewConnector[] {
    return this.portConnectors(fromBlock, port, "out");
  }

  /** Blocks and connectors reachable by walking incoming consumer wires from `timerId`. */
  subgraphFromTimer(timerId: number): SolutionView {
    const ids = new Set<number>([timerId]);
    const walk = (id: number): void => {
      for (const link of this.connectors.filter((item) => item.toBlock === id)) {
        if (ids.has(link.fromBlock)) {
          continue;
        }
        ids.add(link.fromBlock);
        walk(link.fromBlock);
      }
    };
    walk(timerId);
    return new SolutionView(
      this.blocks.filter((block) => ids.has(block.id)),
      this.connectors.filter((link) => ids.has(link.fromBlock) && ids.has(link.toBlock)),
    );
  }

  firstTimerId(): number | undefined {
    return this.blocks.find((block) => block.defId === "timer")?.id;
  }

  private portConnectors(
    blockId: number,
    port: string,
    side: "in" | "out",
  ): SolutionViewConnector[] {
    const catalog = catalogPortName(port);
    const matches = this.connectors.filter((link) =>
      side === "in"
        ? link.toBlock === blockId && catalogPortName(link.toIn) === catalog
        : link.fromBlock === blockId && catalogPortName(link.fromOut) === catalog,
    );
    return matches.toSorted((left, right) =>
      side === "in"
        ? portSlotIndex(left.toIn) - portSlotIndex(right.toIn) ||
          left.fromBlock - right.fromBlock ||
          portSlotIndex(left.fromOut) - portSlotIndex(right.fromOut) ||
          left.fromOut.localeCompare(right.fromOut)
        : portSlotIndex(left.fromOut) - portSlotIndex(right.fromOut) ||
          left.toBlock - right.toBlock ||
          portSlotIndex(left.toIn) - portSlotIndex(right.toIn),
    );
  }
}

export function solutionViewFrom(
  blocks: readonly { id: number; defId: string }[],
  connectors: readonly Link[],
): SolutionView {
  return SolutionView.from(blocks, connectors);
}

export function connectorKey(link: Pick<SolutionViewConnector, "fromBlock" | "fromOut" | "toBlock" | "toIn">): string {
  return `${link.fromBlock}:${link.fromOut}->${link.toBlock}:${link.toIn}`;
}
