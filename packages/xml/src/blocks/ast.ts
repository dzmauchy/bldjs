export interface Attribute {
  name: string;
  value: string;
}

function rawTypeName(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1] ?? name;
}

function displayHead(name: string, ns: string | null, compact: boolean): string {
  if (compact || !ns) {
    return name;
  }
  return name.includes(".") ? name : `${ns}.${name}`;
}

function parenthesize(expr: TypeExpr, compact: boolean): string {
  if (expr.kind === "union" || expr.kind === "intersection") {
    return `(${expr.display(compact)})`;
  }
  return expr.display(compact);
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
    const head = displayHead(this.name, this.ns, compact);
    if (this.args.length === 0) {
      return head;
    }
    return `${head}[${this.args.map((arg) => parenthesize(arg, compact)).join(", ")}]`;
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
    return rawTypeName(this.name) === "Array";
  }

  isPush(): boolean {
    return this.isArray() && (this.args[0]?.isPush() ?? false);
  }

  asParam(params: ParamDef[]): ParamDef | undefined {
    if (this.ns === null && this.args.length === 0) {
      return params.find((param) => param.name === this.name);
    }
    return undefined;
  }
}

/** MoonBit function type `(T1, T2) -> R`. */
export class FuncType extends TypeNode {
  readonly kind = "func" as const;

  constructor(
    readonly params: TypeExpr[],
    readonly ret: TypeExpr,
  ) {
    super();
  }

  children(): TypeExpr[] {
    return [...this.params, this.ret];
  }

  mapChildren(fn: (child: TypeExpr) => TypeExpr): TypeExpr {
    return new FuncType(this.params.map(fn), fn(this.ret));
  }

  display(compact: boolean): string {
    return `(${this.params.map((param) => param.display(compact)).join(", ")}) -> ${this.ret.display(compact)}`;
  }

  equals(other: TypeExpr): boolean {
    return (
      other.kind === "func" &&
      this.params.length === other.params.length &&
      this.params.every((param, index) => param.equals(other.params[index])) &&
      this.ret.equals(other.ret)
    );
  }

  isConsumer(): boolean {
    return isUnitType(this.ret);
  }
}

/** MoonBit tuple `(T1, T2)`. */
export class TupleType extends TypeNode {
  readonly kind = "tuple" as const;

  constructor(readonly elems: TypeExpr[]) {
    super();
  }

  children(): TypeExpr[] {
    return this.elems;
  }

  mapChildren(fn: (child: TypeExpr) => TypeExpr): TypeExpr {
    return new TupleType(this.elems.map(fn));
  }

  display(compact: boolean): string {
    return `(${this.elems.map((elem) => elem.display(compact)).join(", ")})`;
  }

  equals(other: TypeExpr): boolean {
    return (
      other.kind === "tuple" &&
      this.elems.length === other.elems.length &&
      this.elems.every((elem, index) => elem.equals(other.elems[index]))
    );
  }
}

/** MoonBit type hole `_`. */
export class HoleType extends TypeNode {
  readonly kind = "hole" as const;

  children(): TypeExpr[] {
    return [];
  }

  mapChildren(_fn: (child: TypeExpr) => TypeExpr): TypeExpr {
    return this;
  }

  display(_compact: boolean): string {
    return "_";
  }

  equals(other: TypeExpr): boolean {
    return other.kind === "hole";
  }

  isGround(_params: ParamDef[]): boolean {
    return false;
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
    return "Self";
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

export type TypeExpr = NamedType | FuncType | TupleType | HoleType | SelfType | UnionType | IntersectionType;

export function named(name: string): TypeExpr {
  return new NamedType(name, null, []);
}

export function generic(name: string, args: TypeExpr[]): TypeExpr {
  return new NamedType(name, null, args);
}

export function unbounded(): TypeExpr {
  return new HoleType();
}

export function unitType(): TypeExpr {
  return named("Unit");
}

export function funcType(params: TypeExpr[], ret: TypeExpr = unitType()): TypeExpr {
  return new FuncType(params, ret);
}

/** MoonBit consumer `(T) -> Unit`. */
export function consumerType(...params: TypeExpr[]): TypeExpr {
  return funcType(params, unitType());
}

export function isUnitType(expr: TypeExpr): boolean {
  return expr.kind === "type" && rawTypeName(expr.name) === "Unit" && expr.args.length === 0;
}

export function isArrayType(expr: TypeExpr): boolean {
  return expr.isArray();
}

export function arrayOf(elem: TypeExpr): TypeExpr {
  return new NamedType("Array", null, [elem]);
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
  const members = membersIn.filter((member) => member.kind !== "hole");
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
  const nonHoles = membersIn.filter((member) => member.kind !== "hole");
  const members = nonHoles.length > 0 ? nonHoles : [...membersIn];
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

/** Catalog consumer `(T) -> Unit`. Multiple such outputs may share one input via a hidden fork. */
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

export const PRIMITIVE_TYPES = [
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
] as const;

export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

export const BUILTIN_CONTAINER_TYPES = ["Array"] as const;
export type BuiltinContainerType = (typeof BUILTIN_CONTAINER_TYPES)[number];

export const SPECIAL_TYPES = ["Self", "_"] as const;
export type SpecialType = (typeof SPECIAL_TYPES)[number];

export const TYPE_KINDS = [
  "type",
  "func",
  "tuple",
  "array",
  "union",
  "intersection",
  "hole",
  "self",
] as const;
export type TypeKind = (typeof TYPE_KINDS)[number];

export const PORT_DIRECTIONS = ["in", "out"] as const;
export type PortDirection = (typeof PORT_DIRECTIONS)[number];

export const RELATION_KINDS = [
  "intersection",
  "union",
  "identity",
  "map",
  "subtype",
  "supertype",
  "custom",
] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

export const VARIANCE_TYPES = ["+", "-", "=", "?"] as const;
export type VarianceType = (typeof VARIANCE_TYPES)[number];

export function isPrimitiveType(name: string): name is PrimitiveType {
  const head = name.split(".").at(-1) ?? name;
  return (PRIMITIVE_TYPES as readonly string[]).includes(head);
}

export function isBuiltinContainerType(name: string): name is BuiltinContainerType {
  const head = name.split(".").at(-1) ?? name;
  return (BUILTIN_CONTAINER_TYPES as readonly string[]).includes(head);
}

export function isSpecialType(name: string): name is SpecialType {
  return (SPECIAL_TYPES as readonly string[]).includes(name);
}

export function isTypeKind(tag: string): tag is TypeKind {
  return (TYPE_KINDS as readonly string[]).includes(tag);
}

export function isPortDirection(tag: string): tag is PortDirection {
  return (PORT_DIRECTIONS as readonly string[]).includes(tag);
}

export function isRelationKind(tag: string): tag is RelationKind {
  return (RELATION_KINDS as readonly string[]).includes(tag);
}

export function isVarianceType(val: string): val is VarianceType {
  return (VARIANCE_TYPES as readonly string[]).includes(val);
}

export interface ParamDef {
  name: string;
  extends: TypeExpr[];
  super?: TypeExpr[];
  variance?: VarianceType;
  relation?: RelationKind;
  attributes: Attribute[];
}

export interface PortDef {
  name: string;
  ty: TypeExpr;
  vararg: boolean;
  icon: string | null;
  direction?: PortDirection;
  relation?: RelationKind;
  relatesTo?: string;
  attributes: Attribute[];
}

export interface Factory {
  id: string;
  args: TypeExpr[];
  attributes: Attribute[];
}

export const BLOCK_PARAMETER_KINDS = [
  "integer-parameter",
  "count-parameter",
  "decimal-parameter",
  "duration-parameter",
  "date-parameter",
  "time-parameter",
  "date-time-parameter",
  "integer-range-parameter",
  "double-range-parameter",
  "text-parameter",
  "setting",
  "parameter",
] as const;

export type BlockParameterKind = (typeof BLOCK_PARAMETER_KINDS)[number];
export const SETTING_KINDS = BLOCK_PARAMETER_KINDS;
export type SettingKind = BlockParameterKind;

export function isBlockParameterKind(tag: string): tag is BlockParameterKind {
  return (BLOCK_PARAMETER_KINDS as readonly string[]).includes(tag);
}

export function isSettingKind(tag: string): tag is SettingKind {
  return isBlockParameterKind(tag);
}

/** Catalog `<parameters>` or `<settings>` entry — configurable constant input or setting. */
export interface BlockParameterDef {
  kind: BlockParameterKind;
  name: string;
  type?: TypeExpr | string | null;
  description: string | null;
  default: string | null;
  min: number | undefined;
  max: number | undefined;
  step: number | undefined;
  minChars: number | undefined;
  maxChars: number | undefined;
  pattern: string | null;
  attributes: Attribute[];
}

export type BlockSettingDef = BlockParameterDef;

/** Relation between input types and output types */
export interface TypeRelationDef {
  name?: string;
  kind: RelationKind;
  from?: string;
  to?: string;
  input?: string;
  output?: string;
  param?: string;
  type?: TypeExpr;
  expression?: string;
  inputs?: string[];
  outputs?: string[];
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
  parameters: BlockParameterDef[];
  settings?: BlockParameterDef[];
  factory: Factory | null;
  inputs: PortDef[];
  outputs: PortDef[];
  relations?: TypeRelationDef[];
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
  namespaces: Namespace[];
  types: TypeDef[];
  blocks: BlockDef[];
  source: string;
}

