import { type ParamDef, type TypeExpr, isArrayType, isConsumerType, NamedType } from "./ast";
import { type Catalog, sameRaw } from "./catalog";
import { isPrimitive } from "./types";

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
    const param = from.asParam(params);
    if (param) {
      onMatch(param.name, to);
    }
    return true;
  }

  // A vector of consumers `Array[(T) -> Unit]` may ground a `(T) -> Unit` input (one channel per wire).
  if (to.kind === "type" && isArrayType(to) && to.args[0] && isConsumerType(to.args[0])) {
    return visit(catalog, params, from, to.args[0], visited, covariant, depth + 1, onMatch);
  }

  switch (to.kind) {
    case "hole":
      return true;
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

  const param = from.asParam(params);
  if (param) {
    return visitVar(catalog, params, param, to, visited, depth, onMatch);
  }

  switch (from.kind) {
    case "hole":
      return true;
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
    case "func":
      return visitFunc(catalog, params, from, to, visited, depth, onMatch);
    case "tuple":
      return (
        to.kind === "tuple" &&
        from.elems.length === to.elems.length &&
        from.elems.every((elem, index) =>
          visit(catalog, params, elem, to.elems[index], visited, covariant, depth + 1, onMatch),
        )
      );
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

function visitFunc(
  catalog: Catalog,
  params: ParamDef[],
  from: Extract<TypeExpr, { kind: "func" }>,
  to: TypeExpr,
  visited: string[],
  depth: number,
  onMatch: (name: string, ty: TypeExpr) => void,
): boolean {
  if (to.kind !== "func" || from.params.length !== to.params.length) {
    return false;
  }
  const paramsOk = from.params.every((formal, index) =>
    visit(catalog, params, formal, to.params[index], visited, null, depth + 1, onMatch),
  );
  return paramsOk && visit(catalog, params, from.ret, to.ret, visited, true, depth + 1, onMatch);
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
  const boundsOk = param.extends.every((bound) =>
    visit(catalog, params, bound, to, next, true, depth + 1, onMatch),
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
        new NamedType(name, ns, args),
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
  if (left.kind === "func" && right.kind === "func") {
    return (
      left.params.length === right.params.length &&
      left.params.every((param, index) => typeEq(catalog, param, right.params[index])) &&
      typeEq(catalog, left.ret, right.ret)
    );
  }
  if (left.kind === "tuple" && right.kind === "tuple") {
    return (
      left.elems.length === right.elems.length &&
      left.elems.every((elem, index) => typeEq(catalog, elem, right.elems[index]))
    );
  }
  if (left.kind === "hole" && right.kind === "hole") {
    return true;
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
