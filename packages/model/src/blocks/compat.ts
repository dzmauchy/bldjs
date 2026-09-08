import { type ParamDef, type TypeExpr, isArrayType, isConsumerType } from "@bld/types/ast";
import {
  isCompatible as baseCompatible,
  isCompatibleWith as baseCompatibleWith,
} from "@bld/types/compat";
import type { Catalog } from "./catalog";

function unwrapMultiplexedConsumer(actual: TypeExpr): TypeExpr {
  if (actual.kind === "type" && isArrayType(actual) && actual.args[0] && isConsumerType(actual.args[0])) {
    return actual.args[0];
  }
  return actual;
}

function checkerCompatible(catalog: Catalog, formal: TypeExpr, actual: TypeExpr): boolean | undefined {
  const source = catalog.lookupCheckerType(actual);
  const target = catalog.lookupCheckerType(formal);
  if (!source || !target || !catalog.tsc) {
    return undefined;
  }
  return catalog.tsc.isTypeAssignableTo(source, target);
}

/** `actual` can be passed where `formal` is required. */
export function isCompatible(
  catalog: Catalog,
  params: ParamDef[],
  formal: TypeExpr,
  actual: TypeExpr,
): boolean {
  return isCompatibleWith(catalog, params, formal, actual, () => {});
}

export function isCompatibleWith(
  catalog: Catalog,
  params: ParamDef[],
  formal: TypeExpr,
  actual: TypeExpr,
  onMatch: (name: string, ty: TypeExpr) => void,
): boolean {
  const unwrapped = unwrapMultiplexedConsumer(actual);
  if (params.length === 0) {
    const viaChecker = checkerCompatible(catalog, formal, unwrapped);
    if (viaChecker !== undefined) {
      return viaChecker;
    }
  }
  return baseCompatibleWith(catalog, params, formal, unwrapped, onMatch);
}

export { baseCompatible };
