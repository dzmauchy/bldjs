import { isArrayType, isPushType, typeToString, type BlockDef, type TypeExpr } from "@bld/xml/blocks/ast";
import type { Catalog } from "@bld/xml/blocks/catalog";
import type { Link } from "@bld/xml/blocks/diagram";
import { inputSlotsFor, outputSlotsFor, type PortSlot } from "@bld/xml/blocks/ports";
import { isResolvedCompatible, resolvedInput, resolvedOutput, type ResolvedBlock } from "@bld/xml/blocks/resolve";
import type { BlockInstance } from "$lib/diagram-model";
import type { BlockKindInfo } from "$lib/model";
import { shouldShowPortType } from "./link-types";
import { worldPort } from "./layout";
import { jumpoverUnderlays, linkKey, type Point, type RoutedLink } from "./geometry";
import type { BldNodeState, NodeLayout, PortView } from "./types";

export interface ConnectorView {
  key: string;
  link: Link;
  from: Point;
  to: Point;
  points: Point[];
  crossings: RoutedLink[];
  selected: boolean;
}

export function buildConnectorViews(
  links: readonly Link[],
  block: (id: number) => BlockInstance | undefined,
  layouts: ReadonlyMap<number, NodeLayout>,
  routes: ReadonlyMap<string, Point[]>,
  selected: (link: Link) => boolean,
): ConnectorView[] {
  const views: ConnectorView[] = [];
  for (const link of links) {
    const from = worldPort(block(link.fromBlock), layouts.get(link.fromBlock), "out", link.fromOut);
    const to = worldPort(block(link.toBlock), layouts.get(link.toBlock), "in", link.toIn);
    if (!from || !to) {
      continue;
    }
    const key = linkKey(link.fromBlock, link.fromOut, link.toBlock, link.toIn);
    views.push({
      key,
      link,
      from,
      to,
      points: routes.get(key) ?? [],
      crossings: [],
      selected: selected(link),
    });
  }
  views.forEach((item, index) => {
    item.crossings = jumpoverUnderlays(views, index).map((other) => ({
      from: other.from,
      to: other.to,
      route: other.points,
    }));
  });
  return views;
}

export function linkPushes(resolved: Map<number, ResolvedBlock>, link: Link): boolean {
  const from = resolved.get(link.fromBlock);
  const to = resolved.get(link.toBlock);
  return (
    isPushType(from ? resolvedOutput(from, link.fromOut) : undefined) ||
    isPushType(to ? resolvedInput(to, link.toIn) : undefined)
  );
}

export function paramLine(resolved: Map<number, ResolvedBlock>, blockId: number): string {
  const block = resolved.get(blockId);
  if (!block || block.params.size === 0) {
    return "";
  }
  return block.params
    .entries()
    .toArray()
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, ty]) => `${name} = ${typeToString(ty)}`)
    .join(" · ");
}

export interface NodeViewContext {
  catalog: Catalog;
  links: readonly Link[];
  selected: number;
  linkingFrom: { blockId: number; port: string } | null;
  isScopeLive: (id: number) => boolean;
  inputIsGrounded: (blockId: number, port: string) => boolean;
  blockDef: (defId: string) => BlockDef | undefined;
  kindOf: (def: BlockDef) => BlockKindInfo;
}

export function buildNodeState(
  block: BlockInstance,
  resolved: Map<number, ResolvedBlock>,
  ctx: NodeViewContext,
): BldNodeState | null {
  const def = ctx.blockDef(block.defId);
  if (!def) {
    return null;
  }
  const kind = ctx.kindOf(def);
  const resolvedBlock = resolved.get(block.id);
  const linking = ctx.linkingFrom;
  const sourceResolved = linking ? resolved.get(linking.blockId) : undefined;
  const sourceOut = linking && sourceResolved ? resolvedOutput(sourceResolved, linking.port) : undefined;
  return {
    blockId: block.id,
    defId: block.defId,
    name: def.name,
    icon: def.icon,
    kindClass: kind.className,
    selected: ctx.selected === block.id,
    paramsLine: paramLine(resolved, block.id),
    showChart: block.defId === "scope",
    chartEnabled: block.defId === "scope" && ctx.isScopeLive(block.id),
    showInputs: (def.parameters?.length ?? 0) > 0,
    inputs: inputSlotsFor(def.inputs, block.id, ctx.links).map((slot) => {
      const catalogPort = def.inputs.find((item) => item.name === slot.catalogName)!;
      const ty = resolvedBlock ? (resolvedInput(resolvedBlock, slot.name) ?? catalogPort.ty) : catalogPort.ty;
      return portView(slot, catalogPort, ty, {
        grounded: ctx.inputIsGrounded(block.id, slot.name),
        compatible: resolvedBlock ? isResolvedCompatible(resolvedBlock, slot.catalogName) : true,
        showType: shouldShowPortType(linking, block.id, "in", slot.name, sourceOut, ty, ctx.catalog, def.params),
      });
    }),
    outputs: outputSlotsFor(def.outputs, block.id, ctx.links).map((slot) => {
      const catalogPort = def.outputs.find((item) => item.name === slot.catalogName)!;
      const ty = resolvedBlock ? (resolvedOutput(resolvedBlock, slot.name) ?? catalogPort.ty) : catalogPort.ty;
      return portView(slot, catalogPort, ty, {
        linking: linking?.blockId === block.id && linking.port === slot.name,
        showType: shouldShowPortType(linking, block.id, "out", slot.name, sourceOut, ty, ctx.catalog, def.params),
      });
    }),
  };
}

function portView(
  slot: PortSlot,
  catalogPort: { ty: TypeExpr; vararg: boolean },
  ty: TypeExpr,
  extra: Pick<PortView, "grounded" | "compatible" | "linking" | "showType">,
): PortView {
  return {
    name: slot.name,
    typeLabel: typeToString(ty),
    vararg: catalogPort.vararg && slot.index === 0,
    vectorized: catalogPort.vararg || isArrayType(catalogPort.ty),
    ...extra,
  };
}

export function previewFromPort(
  linking: { blockId: number; port: string } | null,
  block: (id: number) => BlockInstance | undefined,
  layouts: ReadonlyMap<number, NodeLayout>,
): Point | null {
  if (!linking) {
    return null;
  }
  return worldPort(block(linking.blockId), layouts.get(linking.blockId), "out", linking.port) ?? null;
}
