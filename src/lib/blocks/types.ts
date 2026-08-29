import {
  type ParamDef,
  type TypeExpr,
  type Variance,
  displayType,
  extendsBound,
  intersectionOf,
  unbounded,
  unionOf,
} from "./ast";
import type { Catalog } from "./catalog";

export { displayType };

export function subst(expr: TypeExpr, bindings: Map<string, TypeExpr>): TypeExpr {
  switch (expr.kind) {
    case "type": {
      if (expr.ns === null) {
        const bound = bindings.get(expr.name);
        if (bound && expr.args.length === 0) {
          return bound;
        }
      }
      return {
        kind: "type",
        name: expr.name,
        ns: expr.ns,
        args: expr.args.map((arg) => subst(arg, bindings)),
      };
    }
    case "wildcard":
      return {
        kind: "wildcard",
        variance: expr.variance,
        bound: expr.bound ? subst(expr.bound, bindings) : null,
      };
    case "self":
      return expr;
    case "union":
      return unionOf(expr.members.map((member) => subst(member, bindings)));
    case "intersection":
      return intersectionOf(expr.members.map((member) => subst(member, bindings)));
  }
}

export function replaceSelf(expr: TypeExpr, selfTy: TypeExpr): TypeExpr {
  switch (expr.kind) {
    case "self":
      return selfTy;
    case "type":
      return {
        kind: "type",
        name: expr.name,
        ns: expr.ns,
        args: expr.args.map((arg) => replaceSelf(arg, selfTy)),
      };
    case "wildcard":
      return {
        kind: "wildcard",
        variance: expr.variance,
        bound: expr.bound ? replaceSelf(expr.bound, selfTy) : null,
      };
    case "union":
      return unionOf(expr.members.map((member) => replaceSelf(member, selfTy)));
    case "intersection":
      return intersectionOf(expr.members.map((member) => replaceSelf(member, selfTy)));
  }
}

export function ground(expr: TypeExpr, params: ParamDef[], catalog: Catalog): TypeExpr {
  return groundRec(expr, params, catalog, new Set());
}

function groundRec(
  expr: TypeExpr,
  params: ParamDef[],
  catalog: Catalog,
  visited: Set<string>,
): TypeExpr {
  const param = asParam(expr, params);
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

  switch (expr.kind) {
    case "type": {
      const ty: TypeExpr = {
        kind: "type",
        name: expr.name,
        ns: expr.ns,
        args: expr.args.map((arg) => groundRec(arg, params, catalog, visited)),
      };
      const alias = catalog.expandAlias(ty);
      return alias ? groundRec(alias, params, catalog, visited) : ty;
    }
    case "wildcard":
      return {
        kind: "wildcard",
        variance: expr.variance,
        bound: expr.bound ? groundRec(expr.bound, params, catalog, visited) : null,
      };
    case "self":
      return expr;
    case "union":
      return unionOf(expr.members.map((member) => groundRec(member, params, catalog, visited)));
    case "intersection":
      return intersectionOf(expr.members.map((member) => groundRec(member, params, catalog, visited)));
  }
}

export function isGround(expr: TypeExpr, params: ParamDef[]): boolean {
  if (asParam(expr, params)) {
    return false;
  }
  switch (expr.kind) {
    case "type":
      return expr.args.every((arg) => isGround(arg, params));
    case "wildcard":
      return expr.bound === null ? true : isGround(expr.bound, params);
    case "self":
      return true;
    case "union":
    case "intersection":
      return expr.members.every((member) => isGround(member, params));
  }
}

export function asParam(expr: TypeExpr, params: ParamDef[]): ParamDef | undefined {
  if (expr.kind === "type" && expr.ns === null && expr.args.length === 0) {
    return params.find((param) => param.name === expr.name);
  }
  return undefined;
}

const PRIMITIVES = new Set(["f64", "f32", "i32", "i64", "str", "bool"]);

export function isPrimitive(name: string): boolean {
  return PRIMITIVES.has(name.split(".").at(-1) ?? name);
}

export type { Variance };
