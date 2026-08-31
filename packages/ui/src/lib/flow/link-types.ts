import { type BlockDef, type ParamDef, type TypeExpr } from "@bld/xml";
import { isCompatible } from "@bld/xml";
import type { Catalog } from "@bld/xml";
import { resolvedInput, resolvedOutput, type ResolvedBlock } from "@bld/xml";
import type { PortSide } from "./types";

export interface LinkingPort {
  blockId: number;
  port: string;
}

/** Show the port type while a wire is in progress: the source output, and compatible inputs on other blocks. */
export function shouldShowPortType(
  linking: LinkingPort | null,
  blockId: number,
  side: PortSide,
  portName: string,
  sourceType: TypeExpr | undefined,
  targetType: TypeExpr | undefined,
  catalog: Catalog,
  params: ParamDef[],
): boolean {
  if (!linking) {
    return false;
  }
  if (side === "out") {
    return linking.blockId === blockId && linking.port === portName;
  }
  if (linking.blockId === blockId || sourceType === undefined || targetType === undefined) {
    return false;
  }
  return isCompatible(catalog, params, targetType, sourceType);
}

export interface CompatibleInputTarget {
  blockId: number;
  inputs: readonly { name: string; ty: TypeExpr }[];
  params: ParamDef[];
}

/** If the target has exactly one input that accepts `sourceType`, return that catalog port name. */
export function uniqueCompatibleInput(
  linking: LinkingPort | null,
  sourceType: TypeExpr | undefined,
  target: CompatibleInputTarget,
  catalog: Catalog,
): string | undefined {
  if (!linking || sourceType === undefined || linking.blockId === target.blockId) {
    return undefined;
  }
  const matches: string[] = [];
  for (const port of target.inputs) {
    if (isCompatible(catalog, target.params, port.ty, sourceType)) {
      matches.push(port.name);
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

export interface LinkDropContext {
  catalog: Catalog;
  linkingFrom: LinkingPort | null;
  block(id: number): { defId: string } | undefined;
  blockDef(defId: string): BlockDef | undefined;
  resolveAll(): Map<number, ResolvedBlock>;
}

/** Resolve a drop-on-block target to a single compatible catalog input, if unambiguous. */
export function uniqueCompatibleDropPort(ctx: LinkDropContext, toBlock: number): string | undefined {
  const linking = ctx.linkingFrom;
  if (!linking) {
    return undefined;
  }
  const target = ctx.block(toBlock);
  const def = target ? ctx.blockDef(target.defId) : undefined;
  if (!def) {
    return undefined;
  }
  const resolved = ctx.resolveAll();
  const sourceResolved = resolved.get(linking.blockId);
  const sourceType = sourceResolved ? resolvedOutput(sourceResolved, linking.port) : undefined;
  const targetResolved = resolved.get(toBlock);
  return uniqueCompatibleInput(
    linking,
    sourceType,
    {
      blockId: toBlock,
      params: def.params,
      inputs: def.inputs.map((port) => ({
        name: port.name,
        ty: targetResolved ? (resolvedInput(targetResolved, port.name) ?? port.ty) : port.ty,
      })),
    },
    ctx.catalog,
  );
}
