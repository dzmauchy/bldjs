import type { Link } from "../blocks/diagram";
import { isGeneratorId } from "../blocks/cs/ids";
import { PortLinks } from "../blocks/ports";

/** One placed block in a connected solution (XML `block` instance). */
export interface SolutionViewBlock {
  id: number;
  defId: string;
  pin?: number;
  periodMs?: number;
  zeta?: number;
  omega?: number;
  value?: number;
  count?: number;
  def?: number;
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
    blocks: readonly {
      id: number;
      defId: string;
      pin?: number;
      periodMs?: number;
      zeta?: number;
      omega?: number;
      value?: number;
      count?: number;
      def?: number;
    }[],
    connectors: readonly Link[],
  ): SolutionView {
    return new SolutionView(
      blocks.map((block) => ({
        id: block.id,
        defId: block.defId,
        pin: block.pin,
        periodMs: block.periodMs,
        zeta: block.zeta,
        omega: block.omega,
        value: block.value,
        count: block.count,
        def: block.def,
      })),
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
    return new PortLinks(this.connectors).incoming(toBlock, port);
  }

  outgoing(fromBlock: number, port: string): SolutionViewConnector[] {
    return new PortLinks(this.connectors).outgoing(fromBlock, port);
  }

  /** Blocks and connectors reachable by walking incoming consumer wires from a generator. */
  subgraphFromGenerator(generatorId: number): SolutionView {
    const ids = new Set<number>([generatorId]);
    const walk = (id: number): void => {
      for (const link of this.connectors.filter((item) => item.toBlock === id)) {
        if (ids.has(link.fromBlock)) {
          continue;
        }
        ids.add(link.fromBlock);
        walk(link.fromBlock);
      }
    };
    walk(generatorId);
    return new SolutionView(
      this.blocks.filter((block) => ids.has(block.id)),
      this.connectors.filter((link) => ids.has(link.fromBlock) && ids.has(link.toBlock)),
    );
  }

  /** @deprecated Use {@link subgraphFromGenerator}. */
  subgraphFromTimer(timerId: number): SolutionView {
    return this.subgraphFromGenerator(timerId);
  }

  firstGeneratorId(): number | undefined {
    return this.blocks.find((block) => isGeneratorId(block.defId))?.id;
  }

  /** @deprecated Use {@link firstGeneratorId}. */
  firstTimerId(): number | undefined {
    return this.firstGeneratorId();
  }
}

export function solutionViewFrom(
  blocks: readonly {
    id: number;
    defId: string;
    pin?: number;
    periodMs?: number;
    zeta?: number;
    omega?: number;
    value?: number;
    count?: number;
    def?: number;
  }[],
  connectors: readonly Link[],
): SolutionView {
  return SolutionView.from(blocks, connectors);
}

export { connectorKey } from "../blocks/ports";
