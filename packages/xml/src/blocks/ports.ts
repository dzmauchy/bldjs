import { type PortDef, type TypeExpr, isArrayType, isConsumerType } from "./ast";
import type { Link } from "./diagram";

const SLOT = /^(.+)\[(\d+)\]$/;

export type PortSide = "in" | "out";

export interface PortSlot {
  name: string;
  catalogName: string;
  index: number;
}

/** Wire endpoints used by slot allocation and solution views. */
export interface LinkPorts {
  fromBlock: number;
  fromOut: string;
  toBlock: number;
  toIn: string;
}

/** `out[1]` → `out`. Catalog names are unchanged. */
export function catalogPortName(name: string): string {
  const match = SLOT.exec(name);
  return match ? match[1] : name;
}

/** Catalog port is slot 0; `out[1]` is 1. */
export function portSlotIndex(name: string): number {
  const match = SLOT.exec(name);
  return match ? Number(match[2]) : 0;
}

export function slottedPortName(catalogName: string, index: number): string {
  return index <= 0 ? catalogName : `${catalogName}[${index}]`;
}

export function acceptsManyInputs(port: PortDef | undefined): boolean {
  return (port?.vararg ?? false) || (port ? isConsumerType(port.ty) : false);
}

/**
 * Each visual pin on a vector-of-consumer output is one channel (`(T) -> Unit`),
 * including the first slot — not the whole vector (`Array[(T) -> Unit]`).
 */
export function slottedOutputType(catalogType: TypeExpr, _slotName: string): TypeExpr {
  if (
    catalogType.kind === "type" &&
    isArrayType(catalogType) &&
    catalogType.args[0] &&
    isConsumerType(catalogType.args[0])
  ) {
    return catalogType.args[0];
  }
  return catalogType;
}

export function compareIncoming(left: LinkPorts, right: LinkPorts): number {
  return (
    portSlotIndex(left.toIn) - portSlotIndex(right.toIn) ||
    left.fromBlock - right.fromBlock ||
    portSlotIndex(left.fromOut) - portSlotIndex(right.fromOut) ||
    left.fromOut.localeCompare(right.fromOut)
  );
}

export function compareOutgoing(left: LinkPorts, right: LinkPorts): number {
  return (
    portSlotIndex(left.fromOut) - portSlotIndex(right.fromOut) ||
    left.toBlock - right.toBlock ||
    portSlotIndex(left.toIn) - portSlotIndex(right.toIn)
  );
}

export function linksOnPort<T extends LinkPorts>(
  links: readonly T[],
  side: PortSide,
  blockId: number,
  port: string,
): T[] {
  const catalog = catalogPortName(port);
  const matches = links.filter((link) =>
    side === "in"
      ? link.toBlock === blockId && catalogPortName(link.toIn) === catalog
      : link.fromBlock === blockId && catalogPortName(link.fromOut) === catalog,
  );
  return matches.toSorted(side === "in" ? compareIncoming : compareOutgoing);
}

export function incomingTo<T extends LinkPorts>(links: readonly T[], toBlock: number, port: string): T[] {
  return linksOnPort(links, "in", toBlock, port);
}

export function outgoingFrom<T extends LinkPorts>(links: readonly T[], fromBlock: number, port: string): T[] {
  return linksOnPort(links, "out", fromBlock, port);
}

export function connectorKey(link: LinkPorts): string {
  return `${link.fromBlock}:${link.fromOut}->${link.toBlock}:${link.toIn}`;
}

/** Query wires by catalog port, with extra slots ordered densely. */
export class PortLinks<T extends LinkPorts = Link> {
  constructor(readonly links: readonly T[]) {}

  incoming(toBlock: number, port: string): T[] {
    return incomingTo(this.links, toBlock, port);
  }

  outgoing(fromBlock: number, port: string): T[] {
    return outgoingFrom(this.links, fromBlock, port);
  }
}

export function findCatalogLink(
  links: readonly Link[],
  fromBlock: number,
  fromOut: string,
  toBlock: number,
  toIn: string,
): Link | undefined {
  const fromCat = catalogPortName(fromOut);
  const toCat = catalogPortName(toIn);
  return links.find(
    (link) =>
      link.fromBlock === fromBlock &&
      catalogPortName(link.fromOut) === fromCat &&
      link.toBlock === toBlock &&
      catalogPortName(link.toIn) === toCat,
  );
}

export function allocateSlot(
  links: readonly Link[],
  blockId: number,
  catalogName: string,
  side: PortSide,
): string {
  const count = links.filter((link) =>
    side === "in"
      ? link.toBlock === blockId && catalogPortName(link.toIn) === catalogName
      : link.fromBlock === blockId && catalogPortName(link.fromOut) === catalogName,
  ).length;
  return slottedPortName(catalogName, count);
}

export function allocateOutgoingSlot(links: readonly Link[], fromBlock: number, catalogOut: string): string {
  return allocateSlot(links, fromBlock, catalogOut, "out");
}

export function allocateIncomingSlot(links: readonly Link[], toBlock: number, catalogIn: string): string {
  return allocateSlot(links, toBlock, catalogIn, "in");
}

function slotsFor(catalogName: string, used: Iterable<string>): PortSlot[] {
  const names = new Set<string>([catalogName, ...used]);
  return [...names]
    .sort((left, right) => portSlotIndex(left) - portSlotIndex(right) || left.localeCompare(right))
    .map((name) => ({ name, catalogName, index: portSlotIndex(name) }));
}

function usedSlotNames(links: readonly Link[], blockId: number, catalogName: string, side: PortSide): string[] {
  return links
    .filter((link) =>
      side === "in"
        ? link.toBlock === blockId && catalogPortName(link.toIn) === catalogName
        : link.fromBlock === blockId && catalogPortName(link.fromOut) === catalogName,
    )
    .map((link) => (side === "in" ? link.toIn : link.fromOut));
}

function slotsForPorts(
  ports: readonly PortDef[],
  blockId: number,
  links: readonly Link[],
  side: PortSide,
): PortSlot[] {
  return ports.flatMap((port) => slotsFor(port.name, usedSlotNames(links, blockId, port.name, side)));
}

export function outputSlotsFor(
  outputs: readonly PortDef[],
  blockId: number,
  links: readonly Link[],
): PortSlot[] {
  return slotsForPorts(outputs, blockId, links, "out");
}

export function inputSlotsFor(inputs: readonly PortDef[], blockId: number, links: readonly Link[]): PortSlot[] {
  return slotsForPorts(inputs, blockId, links, "in");
}

export interface BlockPosition {
  x: number;
  y: number;
}

export type BlockPositionOf = (blockId: number) => BlockPosition | undefined;

function bySlotThenPeer(
  left: Link,
  right: Link,
  slotOf: (link: Link) => string,
  peer: (link: Link) => number,
): number {
  const slot = portSlotIndex(slotOf(left)) - portSlotIndex(slotOf(right));
  if (slot !== 0) {
    return slot;
  }
  const other = peer(left) - peer(right);
  if (other !== 0) {
    return other;
  }
  return slotOf(left).localeCompare(slotOf(right));
}

function byPeerPosition(
  left: Link,
  right: Link,
  peer: (link: Link) => number,
  positionOf: BlockPositionOf,
  slotOf: (link: Link) => string,
): number {
  const leftPos = positionOf(peer(left));
  const rightPos = positionOf(peer(right));
  const dy = (leftPos?.y ?? 0) - (rightPos?.y ?? 0);
  if (dy !== 0) {
    return dy;
  }
  const dx = (leftPos?.x ?? 0) - (rightPos?.x ?? 0);
  if (dx !== 0) {
    return dx;
  }
  return bySlotThenPeer(left, right, slotOf, peer);
}

function compactGroups(
  links: Link[],
  keyOf: (link: Link) => string,
  catalogOf: (link: Link) => string,
  assign: (link: Link, name: string) => void,
  compare: (left: Link, right: Link) => number,
): void {
  const groups = new Map<string, Link[]>();
  for (const link of links) {
    const key = keyOf(link);
    const group = groups.get(key);
    if (group) {
      group.push(link);
    } else {
      groups.set(key, [link]);
    }
  }
  for (const group of groups.values()) {
    const catalog = catalogOf(group[0]);
    group.toSorted(compare).forEach((link, index) => {
      assign(link, slottedPortName(catalog, index));
    });
  }
}

function compactSide(next: Link[], side: PortSide, positionOf?: BlockPositionOf): void {
  const portOf = (link: Link) => (side === "in" ? link.toIn : link.fromOut);
  const blockOf = (link: Link) => (side === "in" ? link.toBlock : link.fromBlock);
  const peerOf = (link: Link) => (side === "in" ? link.fromBlock : link.toBlock);
  compactGroups(
    next,
    (link) => `${blockOf(link)}:${catalogPortName(portOf(link))}`,
    (link) => catalogPortName(portOf(link)),
    (link, name) => {
      if (side === "in") {
        link.toIn = name;
      } else {
        link.fromOut = name;
      }
    },
    (left, right) =>
      positionOf
        ? byPeerPosition(left, right, peerOf, positionOf, portOf)
        : bySlotThenPeer(left, right, portOf, peerOf),
  );
}

/**
 * Keep extra `name[n]` slots dense and 1:1 with extra wires.
 * Array order is preserved so a selected link can be remapped by index.
 * When `positionOf` is set, extra pins follow the peer block's canvas Y
 * (a source above another source takes the upper input).
 */
export function compactLinkSlots(links: readonly Link[], positionOf?: BlockPositionOf): Link[] {
  const next = links.map((link) => ({ ...link }));
  compactSide(next, "out", positionOf);
  compactSide(next, "in", positionOf);
  return next;
}
