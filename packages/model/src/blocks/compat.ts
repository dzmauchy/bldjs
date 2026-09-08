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
  // Named aliases such as `type f32 = Float32Array[1]` reduce to `number` in tsc.
  // Catalog compatibility keeps those written names distinct.
  return baseCompatibleWith(catalog, params, formal, unwrapped, onMatch);
}

export { baseCompatible };
