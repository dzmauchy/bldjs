import { type ParamDef, type TypeExpr, unbounded } from "./ast";
import type { Catalog } from "./catalog";

export function ground(expr: TypeExpr, params: ParamDef[], catalog: Catalog): TypeExpr {
  return groundRec(expr, params, catalog);
}

function groundRec(expr: TypeExpr, params: ParamDef[], catalog: Catalog): TypeExpr {
  if (expr.asParam(params)) {
    return unbounded();
  }
  const mapped = expr.mapChildren((child) => groundRec(child, params, catalog));
  if (mapped.kind !== "type") {
    return mapped;
  }
  const alias = catalog.expandAlias(mapped);
  return alias ? groundRec(alias, params, catalog) : mapped;
}

const PRIMITIVES = new Set([
  "Double",
  "Float",
  "Int",
  "Int64",
  "UInt",
  "UInt64",
  "String",
  "Bool",
  "Byte",
  "Char",
  "Unit",
]);

export function isPrimitive(name: string): boolean {
  return PRIMITIVES.has(name.split(".").at(-1) ?? name);
}
