import {
  type ParamDef,
  type TypeExpr,
  extendsBound,
  intersectionOf,
  unbounded,
} from "./ast";
import type { Catalog } from "./catalog";

export function ground(expr: TypeExpr, params: ParamDef[], catalog: Catalog): TypeExpr {
  return groundRec(expr, params, catalog, new Set());
}

function groundRec(
  expr: TypeExpr,
  params: ParamDef[],
  catalog: Catalog,
  visited: Set<string>,
): TypeExpr {
  const param = expr.asParam(params);
  if (param) {
    if (visited.has(param.name)) {
      return unbounded();
    }
    visited.add(param.name);
    const bounds = param.extends.map((bound) => groundRec(bound, params, catalog, visited));
    visited.delete(param.name);
    if (bounds.length === 0) {
      return unbounded();
    }
    if (bounds.length === 1) {
      return extendsBound(bounds[0]);
    }
    return extendsBound(intersectionOf(bounds));
  }

  const mapped = expr.mapChildren((child) => groundRec(child, params, catalog, visited));
  if (mapped.kind !== "type") {
    return mapped;
  }
  const alias = catalog.expandAlias(mapped);
  return alias ? groundRec(alias, params, catalog, visited) : mapped;
}

const PRIMITIVES = new Set(["f64", "f32", "i32", "i64", "str", "bool"]);

export function isPrimitive(name: string): boolean {
  return PRIMITIVES.has(name.split(".").at(-1) ?? name);
}
