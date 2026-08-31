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
export interface SolutionView {
  blocks: readonly SolutionViewBlock[];
  connectors: readonly SolutionViewConnector[];
}

export function solutionViewFrom(
  blocks: readonly { id: number; defId: string }[],
  connectors: readonly Link[],
): SolutionView {
  return {
    blocks: blocks.map((block) => ({ id: block.id, defId: block.defId })),
    connectors: connectors.map((link) => ({
      fromBlock: link.fromBlock,
      fromOut: link.fromOut,
      toBlock: link.toBlock,
      toIn: link.toIn,
    })),
  };
}

export function defIdOf(view: SolutionView, id: number): string | undefined {
  return view.blocks.find((block) => block.id === id)?.defId;
}

export function instanceName(view: SolutionView, block: SolutionViewBlock): string {
  const same = view.blocks.filter((item) => item.defId === block.defId);
  return same.length === 1 ? block.defId : `${block.defId}_${block.id}`;
}

export function incomingConnectors(
  view: SolutionView,
  toBlock: number,
  port: string,
): SolutionViewConnector[] {
  const catalog = catalogPortName(port);
  return view.connectors
    .filter((link) => link.toBlock === toBlock && catalogPortName(link.toIn) === catalog)
    .toSorted(
      (left, right) =>
        portSlotIndex(left.toIn) - portSlotIndex(right.toIn) ||
        left.fromBlock - right.fromBlock ||
        portSlotIndex(left.fromOut) - portSlotIndex(right.fromOut) ||
        left.fromOut.localeCompare(right.fromOut),
    );
}

export function outgoingConnectors(
  view: SolutionView,
  fromBlock: number,
  port: string,
): SolutionViewConnector[] {
  const catalog = catalogPortName(port);
  return view.connectors
    .filter((link) => link.fromBlock === fromBlock && catalogPortName(link.fromOut) === catalog)
    .toSorted(
      (left, right) =>
        portSlotIndex(left.fromOut) - portSlotIndex(right.fromOut) ||
        left.toBlock - right.toBlock ||
        portSlotIndex(left.toIn) - portSlotIndex(right.toIn),
    );
}

/** Blocks and connectors reachable by walking incoming consumer wires from `timerId`. */
export function subgraphFromTimer(view: SolutionView, timerId: number): SolutionView {
  const ids = new Set<number>([timerId]);
  const walk = (id: number): void => {
    for (const link of view.connectors.filter((item) => item.toBlock === id)) {
      if (ids.has(link.fromBlock)) {
        continue;
      }
      ids.add(link.fromBlock);
      walk(link.fromBlock);
    }
  };
  walk(timerId);
  return {
    blocks: view.blocks.filter((block) => ids.has(block.id)),
    connectors: view.connectors.filter((link) => ids.has(link.fromBlock) && ids.has(link.toBlock)),
  };
}

export function firstTimerId(view: SolutionView): number | undefined {
  return view.blocks.find((block) => block.defId === "timer")?.id;
}

export function connectorKey(link: Pick<SolutionViewConnector, "fromBlock" | "fromOut" | "toBlock" | "toIn">): string {
  return `${link.fromBlock}:${link.fromOut}->${link.toBlock}:${link.toIn}`;
}
