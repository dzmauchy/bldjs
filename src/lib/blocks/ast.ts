export interface Attribute {
  name: string;
  value: string;
}

export type Variance = "covariant" | "contravariant" | "unbounded";

export function parseVariance(value: string): Variance | undefined {
  switch (value) {
    case "+":
      return "covariant";
    case "-":
      return "contravariant";
    case "?":
      return "unbounded";
    default:
      return undefined;
  }
}

export function varianceAsStr(variance: Variance): string {
  switch (variance) {
    case "covariant":
      return "+";
    case "contravariant":
      return "-";
    case "unbounded":
      return "?";
  }
}

export type TypeExpr =
  | { kind: "type"; name: string; ns: string | null; args: TypeExpr[] }
  | { kind: "wildcard"; variance: Variance; bound: TypeExpr | null }
  | { kind: "self" }
  | { kind: "union"; members: TypeExpr[] }
  | { kind: "intersection"; members: TypeExpr[] };

export function named(name: string): TypeExpr {
  return { kind: "type", name, ns: null, args: [] };
}

export function qualified(ns: string, name: string): TypeExpr {
  return { kind: "type", name, ns, args: [] };
}

export function generic(name: string, args: TypeExpr[]): TypeExpr {
  return { kind: "type", name, ns: null, args };
}

export function unbounded(): TypeExpr {
  return { kind: "wildcard", variance: "unbounded", bound: null };
}

export function extendsBound(bound: TypeExpr): TypeExpr {
  return { kind: "wildcard", variance: "covariant", bound };
}

export function superBound(bound: TypeExpr): TypeExpr {
  return { kind: "wildcard", variance: "contravariant", bound };
}

/** Short display heads used when `compact` is true. */
const COMPACT_HEADS: Record<string, string> = {
  c1: "c",
};

function rawTypeName(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1] ?? name;
}

function compactHead(name: string): string {
  const raw = rawTypeName(name);
  return COMPACT_HEADS[raw] ?? raw;
}

function displayArrayElem(elem: TypeExpr, compact: boolean): string {
  const text = displayType(elem, compact);
  if (elem.kind === "union" || elem.kind === "intersection") {
    return `(${text})`;
  }
  return text;
}

export function isArrayType(expr: TypeExpr): boolean {
  return expr.kind === "type" && (expr.name === "[]" || rawTypeName(expr.name) === "array");
}

export function arrayOf(elem: TypeExpr): TypeExpr {
  return { kind: "type", name: "[]", ns: null, args: [elem] };
}

export function displayType(expr: TypeExpr, compact: boolean): string {
  switch (expr.kind) {
    case "type": {
      if (isArrayType(expr)) {
        const elem = expr.args[0];
        return `${elem ? displayArrayElem(elem, compact) : "?"}[]`;
      }
      const head = compact ? compactHead(expr.name) : expr.ns ? `${expr.ns}.${expr.name}` : expr.name;
      if (expr.args.length === 0) {
        return head;
      }
      return `${head}<${expr.args.map((arg) => displayType(arg, compact)).join(", ")}>`;
    }
    case "wildcard":
      if (expr.variance === "unbounded" || expr.bound === null) {
        return "?";
      }
      if (expr.variance === "covariant") {
        return `? extends ${displayType(expr.bound, compact)}`;
      }
      return `? super ${displayType(expr.bound, compact)}`;
    case "self":
      return "this";
    case "union":
      return expr.members.map((member) => displayType(member, compact)).join(" | ");
    case "intersection":
      return expr.members.map((member) => displayType(member, compact)).join(" & ");
  }
}

function displayKey(expr: TypeExpr): string {
  return displayType(expr, true);
}

function flattenInto(members: TypeExpr[], isUnion: boolean): void {
  let i = 0;
  while (i < members.length) {
    const member = members[i];
    const nested =
      member.kind === "union" && isUnion
        ? member.members
        : member.kind === "intersection" && !isUnion
          ? member.members
          : null;
    if (nested) {
      members.splice(i, 1, ...nested);
    } else {
      i += 1;
    }
  }
}

function typeEquals(left: TypeExpr, right: TypeExpr): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "type": {
      const other = right as Extract<TypeExpr, { kind: "type" }>;
      return (
        left.name === other.name &&
        left.ns === other.ns &&
        left.args.length === other.args.length &&
        left.args.every((arg, index) => typeEquals(arg, other.args[index]))
      );
    }
    case "wildcard": {
      const other = right as Extract<TypeExpr, { kind: "wildcard" }>;
      if (left.variance !== other.variance) {
        return false;
      }
      if (left.bound === null && other.bound === null) {
        return true;
      }
      if (left.bound === null || other.bound === null) {
        return false;
      }
      return typeEquals(left.bound, other.bound);
    }
    case "self":
      return true;
    case "union":
    case "intersection": {
      const other = right as Extract<TypeExpr, { kind: "union" | "intersection" }>;
      return (
        left.members.length === other.members.length &&
        left.members.every((member, index) => typeEquals(member, other.members[index]))
      );
    }
  }
}

function dedupSorted(members: TypeExpr[]): TypeExpr[] {
  const unique: TypeExpr[] = [];
  for (const member of members) {
    if (!unique.some((existing) => typeEquals(existing, member))) {
      unique.push(member);
    }
  }
  return unique;
}

export function unionOf(membersIn: TypeExpr[]): TypeExpr {
  const members = membersIn.filter(
    (member) => !(member.kind === "wildcard" && member.variance === "unbounded" && member.bound === null),
  );
  flattenInto(members, true);
  members.sort((a, b) => displayKey(a).localeCompare(displayKey(b)));
  const unique = dedupSorted(members);
  if (unique.length === 0) {
    return unbounded();
  }
  if (unique.length === 1) {
    return unique[0];
  }
  return { kind: "union", members: unique };
}

export function intersectionOf(membersIn: TypeExpr[]): TypeExpr {
  const members = [...membersIn];
  flattenInto(members, false);
  members.sort((a, b) => displayKey(a).localeCompare(displayKey(b)));
  const unique = dedupSorted(members);
  if (unique.length === 0) {
    return unbounded();
  }
  if (unique.length === 1) {
    return unique[0];
  }
  return { kind: "intersection", members: unique };
}

export function rawName(expr: TypeExpr): string | undefined {
  return expr.kind === "type" ? expr.name : undefined;
}

/** Catalog consumer `c1<T>` / compact `c<T>`. Multiple such outputs may share one input via a hidden fork. */
export function isConsumerType(expr: TypeExpr): boolean {
  return expr.kind === "type" && rawTypeName(expr.name) === "c1";
}

/**
 * Push-model wire: a consumer (or vector of consumers) is passed out→in, so
 * samples travel the opposite way. Dash animation should reverse for these.
 */
export function isPushType(expr: TypeExpr | undefined): boolean {
  if (!expr) {
    return false;
  }
  if (isConsumerType(expr)) {
    return true;
  }
  return isArrayType(expr) && isPushType(expr.args[0]);
}

export function typeArgs(expr: TypeExpr): TypeExpr[] {
  return expr.kind === "type" ? expr.args : [];
}

export function withArgs(expr: TypeExpr, args: TypeExpr[]): TypeExpr {
  if (expr.kind === "type") {
    return { kind: "type", name: expr.name, ns: expr.ns, args };
  }
  return expr;
}

export function typeToString(expr: TypeExpr): string {
  return displayType(expr, true);
}

export function typesEqual(left: TypeExpr, right: TypeExpr): boolean {
  return typeEquals(left, right);
}

export interface ParamDef {
  name: string;
  variance: Variance | null;
  extends: TypeExpr[];
  superBounds: TypeExpr[];
  attributes: Attribute[];
}

export interface PortDef {
  name: string;
  ty: TypeExpr;
  vararg: boolean;
  icon: string | null;
  attributes: Attribute[];
}

export interface Factory {
  id: string;
  args: TypeExpr[];
  attributes: Attribute[];
}

export interface LibraryRef {
  id: string;
  name: string;
  version: string | null;
  attributes: Attribute[];
}

export interface Namespace {
  id: string;
  name: string;
  parent: string | null;
  icon: string | null;
  attributes: Attribute[];
}

export interface TypeDef {
  name: string;
  ns: string | null;
  params: ParamDef[];
  ancestors: TypeExpr[];
  alias: TypeExpr | null;
  attributes: Attribute[];
  source: string;
}

export function typeDefKey(typeDef: TypeDef): string {
  if (typeDef.ns && typeDef.ns.length > 0) {
    return `${typeDef.ns}.${typeDef.name}`;
  }
  return typeDef.name;
}

export interface BlockDef {
  id: string;
  name: string;
  ns: string;
  icon: string | null;
  params: ParamDef[];
  factory: Factory | null;
  inputs: PortDef[];
  outputs: PortDef[];
  attributes: Attribute[];
  source: string;
}

export function blockAttribute(block: BlockDef, name: string): string | undefined {
  return block.attributes.find((attribute) => attribute.name === name)?.value;
}

export function blockInput(block: BlockDef, name: string): PortDef | undefined {
  return block.inputs.find((port) => port.name === name);
}

export function blockOutput(block: BlockDef, name: string): PortDef | undefined {
  return block.outputs.find((port) => port.name === name);
}

export interface BlocksDoc {
  id: string;
  name: string;
  icon: string | null;
  attributes: Attribute[];
  libraries: LibraryRef[];
  namespaces: Namespace[];
  types: TypeDef[];
  blocks: BlockDef[];
  source: string;
}
