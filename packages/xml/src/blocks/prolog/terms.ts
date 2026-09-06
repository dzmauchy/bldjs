import {
  FuncType,
  HoleType,
  IntersectionType,
  NamedType,
  SelfType,
  TupleType,
  UnionType,
  arrayOf,
  funcType,
  intersectionOf,
  named,
  type TypeExpr,
  unbounded,
  unionOf,
} from "../ast";

export function quoteAtom(name: string): string {
  if (/^[a-z][a-zA-Z0-9_]*$/.test(name)) {
    return name;
  }
  return `'${name.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

export function typeToProlog(ty: TypeExpr, vars: ReadonlySet<string>): string {
  return writeType(ty, vars, false);
}

/** Catalog spec term: type variables are `v('T')` so `block/4` facts stay ground. */
export function typeToSpec(ty: TypeExpr, vars: ReadonlySet<string>): string {
  return writeType(ty, vars, true);
}

export function constraintToSpec(constraint: string | null | undefined, vars: ReadonlySet<string>): string {
  if (!constraint || constraint === "none") {
    return "none";
  }
  let out = constraint;
  const names = [...vars].sort((left, right) => right.length - left.length);
  for (const name of names) {
    out = out.replace(new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, "g"), `v(${quoteAtom(name)})`);
  }
  return out;
}

function writeType(ty: TypeExpr, vars: ReadonlySet<string>, spec: boolean): string {
  switch (ty.kind) {
    case "hole":
      return spec ? "top" : "_";
    case "self":
      return "self";
    case "func":
      return `fn([${ty.params.map((param) => writeType(param, vars, spec)).join(", ")}], ${writeType(ty.ret, vars, spec)})`;
    case "tuple":
      return `tuple([${ty.elems.map((elem) => writeType(elem, vars, spec)).join(", ")}])`;
    case "union":
      return ty.members.map((member) => writeType(member, vars, spec)).reduce((left, right) => `union(${left}, ${right})`);
    case "intersection":
      return ty.members
        .map((member) => writeType(member, vars, spec))
        .reduce((left, right) => `inter(${left}, ${right})`);
    case "type":
      if (ty.ns === null && ty.args.length === 0) {
        if (vars.has(ty.name) || isPrologVar(ty.name)) {
          return spec ? `v(${quoteAtom(ty.name)})` : ty.name;
        }
        return quoteAtom(ty.name);
      }
      const head = quoteAtom(ty.ns && !ty.name.includes(".") ? `${ty.ns}.${ty.name}` : ty.name);
      if (ty.args.length === 0) {
        return head;
      }
      if (rawName(ty.name) === "array" && ty.args.length === 1) {
        return `array(${writeType(ty.args[0], vars, spec)})`;
      }
      return `${head}(${ty.args.map((arg) => writeType(arg, vars, spec)).join(", ")})`;
  }
}

export function isPrologVar(name: string): boolean {
  return /^[A-Z_][A-Za-z0-9_]*$/.test(name);
}

function rawName(name: string): string {
  return name.split(".").at(-1) ?? name;
}

interface PrologTerm {
  functor?: string;
  args?: unknown[];
  var?: string;
  attr?: unknown;
}

export function prologTermToType(term: unknown): TypeExpr {
  if (term === null || term === undefined) {
    return unbounded();
  }
  if (typeof term === "string") {
    if (term === "top" || term === "_") {
      return unbounded();
    }
    if (term === "self") {
      return new SelfType();
    }
    return named(term);
  }
  if (Array.isArray(term)) {
    return new TupleType(term.map(prologTermToType));
  }
  if (typeof term !== "object") {
    return unbounded();
  }
  const node = term as PrologTerm;
  if (typeof node.var === "string") {
    const fromAttr = attrType(node.attr);
    if (fromAttr) {
      return fromAttr;
    }
    if (node.var === "_" || node.var.startsWith("_")) {
      return unbounded();
    }
    return named(node.var);
  }
  const functor = node.functor;
  const args = node.args ?? [];
  if (!functor) {
    return unbounded();
  }
  if (args.length === 0) {
    if (functor === "self") {
      return new SelfType();
    }
    if (functor === "top" || functor === "_") {
      return unbounded();
    }
    return named(functor);
  }
  if (functor === "v" && args.length === 1) {
    const inner = args[0];
    return typeof inner === "string" ? named(inner) : prologTermToType(inner);
  }
  if (functor === "array" && args.length === 1) {
    return arrayOf(prologTermToType(args[0]));
  }
  if (functor === "fn" && args.length === 2) {
    const params = Array.isArray(args[0]) ? args[0].map(prologTermToType) : [prologTermToType(args[0])];
    return funcType(params, prologTermToType(args[1]));
  }
  if (functor === "tuple" && args.length === 1 && Array.isArray(args[0])) {
    return new TupleType(args[0].map(prologTermToType));
  }
  if (functor === "union") {
    return unionOf(args.map(prologTermToType));
  }
  if (functor === "inter" || functor === "intersection") {
    return intersectionOf(args.map(prologTermToType));
  }
  if (functor === "constraint") {
    return unbounded();
  }
  return new NamedType(functor, null, args.map(prologTermToType));
}

function attrType(attr: unknown): TypeExpr | undefined {
  if (!Array.isArray(attr) || attr.length === 0) {
    return undefined;
  }
  for (const item of attr) {
    const extracted = extractTypeAttr(item);
    if (extracted) {
      return extracted;
    }
  }
  return undefined;
}

function extractTypeAttr(item: unknown): TypeExpr | undefined {
  if (!item || typeof item !== "object") {
    return undefined;
  }
  const node = item as PrologTerm;
  if (node.functor === "put_atts" && Array.isArray(node.args) && node.args.length >= 2) {
    return extractTypeAttr(node.args[1]);
  }
  if (node.functor === "+" && Array.isArray(node.args) && node.args.length >= 1) {
    return extractTypeAttr(node.args[0]);
  }
  if (node.functor === "type" && Array.isArray(node.args) && node.args.length >= 1) {
    const inner = prologTermToType(node.args[0]);
    if (inner.kind === "hole" || (inner.kind === "type" && inner.name === "top")) {
      return unbounded();
    }
    return inner;
  }
  return undefined;
}

export function flattenInterUnion(ty: TypeExpr): TypeExpr {
  if (ty.kind === "intersection") {
    return intersectionOf(ty.members);
  }
  if (ty.kind === "union") {
    return unionOf(ty.members);
  }
  return ty;
}

export function portVar(direction: "in" | "out", name: string): string {
  const suffix = name.replace(/[^A-Za-z0-9_]/g, "_");
  return direction === "in" ? `In_${suffix}` : `Out_${suffix}`;
}
