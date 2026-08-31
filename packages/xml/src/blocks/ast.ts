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
  const text = elem.display(compact);
  if (elem.kind === "union" || elem.kind === "intersection") {
    return `(${text})`;
  }
  return text;
}

abstract class TypeNode {
  abstract readonly kind: TypeExpr["kind"];

  abstract display(compact: boolean): string;
  abstract equals(other: TypeExpr): boolean;
  abstract children(): TypeExpr[];
  abstract mapChildren(fn: (child: TypeExpr) => TypeExpr): TypeExpr;

  subst(bindings: Map<string, TypeExpr>): TypeExpr {
    return this.mapChildren((child) => child.subst(bindings));
  }

  replaceSelf(selfTy: TypeExpr): TypeExpr {
    return this.mapChildren((child) => child.replaceSelf(selfTy));
  }

  isGround(params: ParamDef[]): boolean {
    if (this.asParam(params)) {
      return false;
    }
    return this.children().every((child) => child.isGround(params));
  }

  asParam(_params: ParamDef[]): ParamDef | undefined {
    return undefined;
  }

  isArray(): boolean {
    return false;
  }

  isConsumer(): boolean {
    return false;
  }

  isPush(): boolean {
    return this.isConsumer();
  }
}

export class NamedType extends TypeNode {
  readonly kind = "type" as const;

  constructor(
    readonly name: string,
    readonly ns: string | null,
    readonly args: TypeExpr[],
  ) {
    super();
  }

  children(): TypeExpr[] {
    return this.args;
  }

  mapChildren(fn: (child: TypeExpr) => TypeExpr): TypeExpr {
    return new NamedType(this.name, this.ns, this.args.map(fn));
  }

  display(compact: boolean): string {
    if (this.isArray()) {
      const elem = this.args[0];
      return `${elem ? displayArrayElem(elem, compact) : "?"}[]`;
    }
    const head = compact ? compactHead(this.name) : this.ns ? `${this.ns}.${this.name}` : this.name;
    if (this.args.length === 0) {
      return head;
    }
    return `${head}<${this.args.map((arg) => arg.display(compact)).join(", ")}>`;
  }

  equals(other: TypeExpr): boolean {
    return (
      other.kind === "type" &&
      this.name === other.name &&
      this.ns === other.ns &&
      this.args.length === other.args.length &&
      this.args.every((arg, index) => arg.equals(other.args[index]))
    );
  }

  subst(bindings: Map<string, TypeExpr>): TypeExpr {
    if (this.ns === null && this.args.length === 0) {
      const bound = bindings.get(this.name);
      if (bound) {
        return bound;
      }
    }
    return super.subst(bindings);
  }

  isArray(): boolean {
    return this.name === "[]" || rawTypeName(this.name) === "array";
  }

  isConsumer(): boolean {
    return rawTypeName(this.name) === "c1";
  }

  isPush(): boolean {
    return this.isConsumer() || (this.isArray() && (this.args[0]?.isPush() ?? false));
  }

  asParam(params: ParamDef[]): ParamDef | undefined {
    if (this.ns === null && this.args.length === 0) {
      return params.find((param) => param.name === this.name);
    }
    return undefined;
  }
}

export class WildcardType extends TypeNode {
  readonly kind = "wildcard" as const;

  constructor(
    readonly variance: Variance,
    readonly bound: TypeExpr | null,
  ) {
    super();
  }

  children(): TypeExpr[] {
    return this.bound ? [this.bound] : [];
  }

  mapChildren(fn: (child: TypeExpr) => TypeExpr): TypeExpr {
    return this.bound ? new WildcardType(this.variance, fn(this.bound)) : this;
  }

  display(compact: boolean): string {
    if (this.variance === "unbounded" || this.bound === null) {
      return "?";
    }
    if (this.variance === "covariant") {
      return `? extends ${this.bound.display(compact)}`;
    }
    return `? super ${this.bound.display(compact)}`;
  }

  equals(other: TypeExpr): boolean {
    if (other.kind !== "wildcard" || this.variance !== other.variance) {
      return false;
    }
    if (this.bound === null && other.bound === null) {
      return true;
    }
    if (this.bound === null || other.bound === null) {
      return false;
    }
    return this.bound.equals(other.bound);
  }
}

export class SelfType extends TypeNode {
  readonly kind = "self" as const;

  children(): TypeExpr[] {
    return [];
  }

  mapChildren(_fn: (child: TypeExpr) => TypeExpr): TypeExpr {
    return this;
  }

  replaceSelf(selfTy: TypeExpr): TypeExpr {
    return selfTy;
  }

  display(_compact: boolean): string {
    return "this";
  }

  equals(other: TypeExpr): boolean {
    return other.kind === "self";
  }
}

abstract class MemberType extends TypeNode {
  abstract override readonly kind: "union" | "intersection";

  constructor(readonly members: TypeExpr[]) {
    super();
  }

  children(): TypeExpr[] {
    return this.members;
  }

  display(compact: boolean): string {
    const sep = this.kind === "union" ? " | " : " & ";
    return this.members.map((member) => member.display(compact)).join(sep);
  }

  equals(other: TypeExpr): boolean {
    if (other.kind !== this.kind) {
      return false;
    }
    return (
      this.members.length === other.members.length &&
      this.members.every((member, index) => member.equals(other.members[index]))
    );
  }
}

export class UnionType extends MemberType {
  readonly kind = "union" as const;

  mapChildren(fn: (child: TypeExpr) => TypeExpr): TypeExpr {
    return unionOf(this.members.map(fn));
  }
}

export class IntersectionType extends MemberType {
  readonly kind = "intersection" as const;

  mapChildren(fn: (child: TypeExpr) => TypeExpr): TypeExpr {
    return intersectionOf(this.members.map(fn));
  }
}

export type TypeExpr = NamedType | WildcardType | SelfType | UnionType | IntersectionType;

export function named(name: string): TypeExpr {
  return new NamedType(name, null, []);
}

export function generic(name: string, args: TypeExpr[]): TypeExpr {
  return new NamedType(name, null, args);
}

export function unbounded(): TypeExpr {
  return new WildcardType("unbounded", null);
}

export function extendsBound(bound: TypeExpr): TypeExpr {
  return new WildcardType("covariant", bound);
}

export function superBound(bound: TypeExpr): TypeExpr {
  return new WildcardType("contravariant", bound);
}

export function isArrayType(expr: TypeExpr): boolean {
  return expr.isArray();
}

export function arrayOf(elem: TypeExpr): TypeExpr {
  return new NamedType("[]", null, [elem]);
}

export function displayType(expr: TypeExpr, compact: boolean): string {
  return expr.display(compact);
}

function displayKey(expr: TypeExpr): string {
  return expr.display(true);
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

function dedupSorted(members: TypeExpr[]): TypeExpr[] {
  const unique: TypeExpr[] = [];
  for (const member of members) {
    if (!unique.some((existing) => existing.equals(member))) {
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
  return new UnionType(unique);
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
  return new IntersectionType(unique);
}

/** Catalog consumer `c1<T>` / compact `c<T>`. Multiple such outputs may share one input via a hidden fork. */
export function isConsumerType(expr: TypeExpr): boolean {
  return expr.isConsumer();
}

/**
 * Push-model wire: a consumer (or vector of consumers) is passed out→in, so
 * samples travel the opposite way. Dash animation should reverse for these.
 */
export function isPushType(expr: TypeExpr | undefined): boolean {
  return expr?.isPush() ?? false;
}

export function typeToString(expr: TypeExpr): string {
  return expr.display(true);
}

export function typesEqual(left: TypeExpr, right: TypeExpr): boolean {
  return left.equals(right);
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
