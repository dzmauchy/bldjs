import { type PortDef, type TypeExpr, isArrayType, isConsumerType } from "./ast";
import type { Link } from "./diagram";

const SLOT = /^(.+)\[(\d+)\]$/;

export interface PortSlot {
  name: string;
  catalogName: string;
  index: number;
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
 * Each visual pin on a vector-of-consumer output is one channel (`c<T>`),
 * including the first slot — not the whole vector (`c<T>[]`).
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

export function allocateOutgoingSlot(links: readonly Link[], fromBlock: number, catalogOut: string): string {
  const count = links.filter(
    (link) => link.fromBlock === fromBlock && catalogPortName(link.fromOut) === catalogOut,
  ).length;
  return slottedPortName(catalogOut, count);
}

export function allocateIncomingSlot(links: readonly Link[], toBlock: number, catalogIn: string): string {
  const count = links.filter(
    (link) => link.toBlock === toBlock && catalogPortName(link.toIn) === catalogIn,
  ).length;
  return slottedPortName(catalogIn, count);
}

function slotsFor(catalogName: string, used: Iterable<string>): PortSlot[] {
  const names = new Set<string>([catalogName, ...used]);
  return [...names]
    .sort((left, right) => portSlotIndex(left) - portSlotIndex(right) || left.localeCompare(right))
    .map((name) => ({ name, catalogName, index: portSlotIndex(name) }));
}

export function outputSlotsFor(
  outputs: readonly PortDef[],
  blockId: number,
  links: readonly Link[],
): PortSlot[] {
  return outputs.flatMap((port) =>
    slotsFor(
      port.name,
      links
        .filter((link) => link.fromBlock === blockId && catalogPortName(link.fromOut) === port.name)
        .map((link) => link.fromOut),
    ),
  );
}

export function inputSlotsFor(inputs: readonly PortDef[], blockId: number, links: readonly Link[]): PortSlot[] {
  return inputs.flatMap((port) =>
    slotsFor(
      port.name,
      links
        .filter((link) => link.toBlock === blockId && catalogPortName(link.toIn) === port.name)
        .map((link) => link.toIn),
    ),
  );
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

/**
 * Keep extra `name[n]` slots dense and 1:1 with extra wires.
 * Array order is preserved so a selected link can be remapped by index.
 * When `positionOf` is set, extra pins follow the peer block's canvas Y
 * (a source above another source takes the upper input).
 */
export function compactLinkSlots(links: readonly Link[], positionOf?: BlockPositionOf): Link[] {
  const next = links.map((link) => ({ ...link }));
  compactGroups(
    next,
    (link) => `${link.fromBlock}:${catalogPortName(link.fromOut)}`,
    (link) => catalogPortName(link.fromOut),
    (link, name) => {
      link.fromOut = name;
    },
    (left, right) =>
      positionOf
        ? byPeerPosition(left, right, (link) => link.toBlock, positionOf, (link) => link.fromOut)
        : bySlotThenPeer(left, right, (link) => link.fromOut, (link) => link.toBlock),
  );
  compactGroups(
    next,
    (link) => `${link.toBlock}:${catalogPortName(link.toIn)}`,
    (link) => catalogPortName(link.toIn),
    (link, name) => {
      link.toIn = name;
    },
    (left, right) =>
      positionOf
        ? byPeerPosition(left, right, (link) => link.fromBlock, positionOf, (link) => link.toIn)
        : bySlotThenPeer(left, right, (link) => link.toIn, (link) => link.fromBlock),
  );
  return next;
}
