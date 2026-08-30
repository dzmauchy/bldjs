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

/** Extra vector-of-consumer slots are one channel (`c<T>`), not the whole vector. */
export function slottedOutputType(catalogType: TypeExpr, slotName: string): TypeExpr {
  if (catalogPortName(slotName) === slotName) {
    return catalogType;
  }
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

/**
 * Keep extra `name[n]` slots dense and 1:1 with extra wires.
 * Array order is preserved so a selected link can be remapped by index.
 */
export function compactLinkSlots(links: readonly Link[]): Link[] {
  const next = links.map((link) => ({ ...link }));

  const outgoing = new Map<string, Link[]>();
  for (const link of next) {
    const key = `${link.fromBlock}:${catalogPortName(link.fromOut)}`;
    const group = outgoing.get(key);
    if (group) {
      group.push(link);
    } else {
      outgoing.set(key, [link]);
    }
  }
  for (const group of outgoing.values()) {
    const catalog = catalogPortName(group[0].fromOut);
    group
      .toSorted((left, right) => bySlotThenPeer(left, right, (link) => link.fromOut, (link) => link.toBlock))
      .forEach((link, index) => {
        link.fromOut = slottedPortName(catalog, index);
      });
  }

  const incoming = new Map<string, Link[]>();
  for (const link of next) {
    const key = `${link.toBlock}:${catalogPortName(link.toIn)}`;
    const group = incoming.get(key);
    if (group) {
      group.push(link);
    } else {
      incoming.set(key, [link]);
    }
  }
  for (const group of incoming.values()) {
    const catalog = catalogPortName(group[0].toIn);
    group
      .toSorted((left, right) => bySlotThenPeer(left, right, (link) => link.toIn, (link) => link.fromBlock))
      .forEach((link, index) => {
        link.toIn = slottedPortName(catalog, index);
      });
  }

  return next;
}
