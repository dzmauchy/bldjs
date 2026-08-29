import { type ParamDef, type TypeExpr, type Variance, unbounded } from "./ast";
import { type Catalog, sameRaw } from "./catalog";
import { asParam, isPrimitive } from "./types";

const MAX_DEPTH = 64;

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
  return visit(catalog, params, formal, actual, [], true, 0, onMatch);
}

function visit(
  catalog: Catalog,
  params: ParamDef[],
  from: TypeExpr,
  to: TypeExpr,
  visited: string[],
  covariant: boolean | null,
  depth: number,
  onMatch: (name: string, ty: TypeExpr) => void,
): boolean {
  if (depth > MAX_DEPTH) {
    return false;
  }
  if (typeEq(catalog, from, to)) {
    const param = asParam(from, params);
    if (param) {
      onMatch(param.name, to);
    }
    return true;
  }

  switch (to.kind) {
    case "wildcard":
      return visitActualWildcard(
        catalog,
        params,
        from,
        to.variance,
        to.bound,
        visited,
        covariant,
        depth,
        onMatch,
      );
    case "union":
      return to.members.every((member) =>
        visit(catalog, params, from, member, visited, covariant, depth + 1, onMatch),
      );
    case "intersection":
      return to.members.some((member) =>
        visit(catalog, params, from, member, visited, covariant, depth + 1, onMatch),
      );
    default:
      break;
  }

  const param = asParam(from, params);
  if (param) {
    return visitVar(catalog, params, param, to, visited, depth, onMatch);
  }

  switch (from.kind) {
    case "wildcard":
      return visitFormalWildcard(catalog, params, from.variance, from.bound, to, visited, depth, onMatch);
    case "union":
      return from.members.some((member) =>
        visit(catalog, params, member, to, visited, covariant, depth + 1, onMatch),
      );
    case "intersection":
      return from.members.every((member) =>
        visit(catalog, params, member, to, visited, covariant, depth + 1, onMatch),
      );
    case "self":
      return false;
    case "type":
      return visitNamed(
        catalog,
        params,
        from.name,
        from.ns,
        from.args,
        to,
        visited,
        covariant,
        depth,
        onMatch,
      );
  }
}

function visitActualWildcard(
  catalog: Catalog,
  params: ParamDef[],
  from: TypeExpr,
  variance: Variance,
  bound: TypeExpr | null,
  visited: string[],
  covariant: boolean | null,
  depth: number,
  onMatch: (name: string, ty: TypeExpr) => void,
): boolean {
  switch (variance) {
    case "unbounded":
      return true;
    case "covariant":
      return visit(catalog, params, from, bound ?? unbounded(), visited, covariant, depth + 1, onMatch);
    case "contravariant":
      if (bound) {
        visit(catalog, params, from, bound, visited, covariant, depth + 1, onMatch);
      }
      return false;
  }
}

function visitFormalWildcard(
  catalog: Catalog,
  params: ParamDef[],
  variance: Variance,
  bound: TypeExpr | null,
  to: TypeExpr,
  visited: string[],
  depth: number,
  onMatch: (name: string, ty: TypeExpr) => void,
): boolean {
  switch (variance) {
    case "unbounded":
      return true;
    case "contravariant":
      if (!bound) {
        return true;
      }
      return visit(catalog, params, bound, to, visited, false, depth + 1, onMatch);
    case "covariant":
      return visit(catalog, params, bound ?? unbounded(), to, visited, true, depth + 1, onMatch);
  }
}

function visitVar(
  catalog: Catalog,
  params: ParamDef[],
  param: ParamDef,
  to: TypeExpr,
  visited: string[],
  depth: number,
  onMatch: (name: string, ty: TypeExpr) => void,
): boolean {
  if (visited.includes(param.name)) {
    return true;
  }
  const next = [...visited, param.name];
  const boundsOk =
    param.extends.every((bound) =>
      visit(catalog, params, bound, to, next, true, depth + 1, onMatch),
    ) &&
    param.superBounds.every((bound) =>
      visit(catalog, params, to, bound, next, true, depth + 1, onMatch),
    );
  if (boundsOk) {
    onMatch(param.name, to);
    return true;
  }
  return false;
}

function visitNamed(
  catalog: Catalog,
  params: ParamDef[],
  name: string,
  ns: string | null,
  args: TypeExpr[],
  to: TypeExpr,
  visited: string[],
  covariant: boolean | null,
  depth: number,
  onMatch: (name: string, ty: TypeExpr) => void,
): boolean {
  if (to.kind !== "type") {
    return false;
  }
  if (args.length === 0 && to.args.length === 0) {
    return rawAssignable(catalog, name, ns, to.name, to.ns, covariant);
  }
  if (sameRaw(name, ns, to.name, to.ns)) {
    return (
      args.length === to.args.length &&
      args.every((formalArg, index) =>
        visit(catalog, params, formalArg, to.args[index], visited, null, depth + 1, onMatch),
      )
    );
  }
  if (covariant === null) {
    return false;
  }
  if (covariant) {
    const projected = catalog.asSupertype(to, name, ns);
    if (projected) {
      return visit(
        catalog,
        params,
        { kind: "type", name, ns, args },
        projected,
        visited,
        null,
        depth + 1,
        onMatch,
      );
    }
    return false;
  }
  return catalog.isRawSubtype(name, ns, to.name, to.ns);
}

function rawAssignable(
  catalog: Catalog,
  formal: string,
  formalNs: string | null,
  actual: string,
  actualNs: string | null,
  covariant: boolean | null,
): boolean {
  if (sameRaw(formal, formalNs, actual, actualNs)) {
    return true;
  }
  if (isPrimitive(formal) || isPrimitive(actual)) {
    return false;
  }
  if (covariant === true) {
    return catalog.isRawSubtype(actual, actualNs, formal, formalNs);
  }
  if (covariant === false) {
    return catalog.isRawSubtype(formal, formalNs, actual, actualNs);
  }
  return false;
}

function typeEq(catalog: Catalog, left: TypeExpr, right: TypeExpr): boolean {
  void catalog;
  if (left.kind === "type" && right.kind === "type") {
    return (
      sameRaw(left.name, left.ns, right.name, right.ns) &&
      left.args.length === right.args.length &&
      left.args.every((arg, index) => typeEq(catalog, arg, right.args[index]))
    );
  }
  if (left.kind === "wildcard" && right.kind === "wildcard") {
    if (left.variance !== right.variance) {
      return false;
    }
    if (left.bound === null && right.bound === null) {
      return true;
    }
    if (left.bound && right.bound) {
      return typeEq(catalog, left.bound, right.bound);
    }
    return false;
  }
  if (left.kind === "self" && right.kind === "self") {
    return true;
  }
  if (
    (left.kind === "union" && right.kind === "union") ||
    (left.kind === "intersection" && right.kind === "intersection")
  ) {
    return (
      left.members.length === right.members.length &&
      left.members.every((member, index) => typeEq(catalog, member, right.members[index]))
    );
  }
  return false;
}
