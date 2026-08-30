import { type ParamDef, type TypeExpr } from "$lib/blocks/ast";
import { isCompatible } from "$lib/blocks/compat";
import type { Catalog } from "$lib/blocks/catalog";
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
