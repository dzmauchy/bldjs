import {
  type Attribute,
  type BlockDef,
  type BlockParameterDef,
  type BlocksDoc,
  type Factory,
  type Namespace,
  type ParamDef,
  type PortDef,
  type TypeDef,
  type TypeExpr,
  type TypeRelationDef,
  type VarianceType,
  intersectionOf,
  isBlockParameterKind,
  isPortDirection,
  isRelationKind,
  isVarianceType,
  named,
  NamedType,
  SelfType,
  unbounded,
  unionOf,
  WildcardType,
} from "@bld/types/ast";

export class ParseError extends Error {
  constructor(
    message: string,
    readonly file?: string,
  ) {
    super(file ? `${file}: ${message}` : message);
    this.name = "ParseError";
  }

  static new(message: string): ParseError {
    return new ParseError(message);
  }
}

function fail(file: string, message: string): never {
  throw new ParseError(message, file);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(file: string, value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(file, `expected ${label} object`);
  }
  return value;
}

function str(file: string, value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(file, `expected ${label} string`);
  }
  return value;
}

function optStr(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optNum(file: string, value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(file, `invalid ${label}`);
  }
  return value;
}

function list(file: string, value: unknown, label: string): unknown[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail(file, `expected ${label} array`);
  }
  return value;
}

function oneOrMore(file: string, value: unknown, label: string): unknown[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? list(file, value, label) : [value];
}

function attrs(value: unknown): Attribute[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).map(([name, item]) => ({ name, value: String(item) }));
}

function flagAttrs(src: Record<string, unknown>, keys: readonly string[]): Attribute[] {
  const extra: Attribute[] = [];
  for (const key of keys) {
    const value = src[key];
    if (value !== undefined) {
      extra.push({ name: key, value: String(value) });
    }
  }
  return [...extra, ...attrs(src.attrs)];
}

export function parseType(file: string, value: unknown): TypeExpr {
  if (typeof value === "string") {
    if (value === "_") return unbounded();
    if (value === "Self") return new SelfType();
    return named(value);
  }
  const node = record(file, value, "type");
  if ("union" in node) {
    return unionOf(list(file, node.union, "union").map((item) => parseType(file, item)));
  }
  if ("intersection" in node) {
    return intersectionOf(list(file, node.intersection, "intersection").map((item) => parseType(file, item)));
  }
  if ("wildcard" in node || node.variance !== undefined || "bound" in node) {
    let variance: VarianceType | null = null;
    let bound: TypeExpr | null = null;
    if (node.variance !== undefined) {
      const raw = str(file, node.variance, "wildcard variance");
      if (!isVarianceType(raw)) {
        fail(file, `wildcard variance must be '+' or '-', got '${raw}'`);
      }
      variance = raw;
    }
    if (node.bound !== undefined) bound = parseType(file, node.bound);
    else if (node.extends !== undefined) {
      bound = parseType(file, node.extends);
      variance = "+";
    } else if (node.super !== undefined) {
      bound = parseType(file, node.super);
      variance = "-";
    }
    return new WildcardType(bound, variance);
  }
  if ("var" in node) {
    return named(str(file, node.var, "var name"));
  }
  const name = str(file, node.name, "type name");
  if (name === "_") return unbounded();
  if (name === "Self") return new SelfType();
  const args = list(file, node.args, "type args").map((item) => parseType(file, item));
  return new NamedType(name, optStr(node.ns) ?? null, args);
}

function parseParam(file: string, value: unknown): ParamDef {
  if (typeof value === "string") {
    return { name: value, extends: [], attributes: [] };
  }
  const node = record(file, value, "param");
  const extendsBounds = oneOrMore(file, node.extends, "param extends").map((item) => parseType(file, item));
  const superBounds = oneOrMore(file, node.super, "param super").map((item) => parseType(file, item));
  const varianceRaw = optStr(node.variance);
  const relationRaw = optStr(node.relation);
  return {
    name: str(file, node.name, "param name"),
    extends: extendsBounds,
    super: superBounds.length > 0 ? superBounds : undefined,
    variance: varianceRaw && isVarianceType(varianceRaw) ? varianceRaw : undefined,
    relation: relationRaw && isRelationKind(relationRaw) ? relationRaw : undefined,
    attributes: attrs(node.attrs),
  };
}

function parsePort(file: string, value: unknown, direction: "in" | "out"): PortDef {
  const node = record(file, value, "port");
  const directionRaw = optStr(node.direction);
  const relationRaw = optStr(node.relation);
  return {
    name: str(file, node.name, "port name"),
    ty: node.type === undefined ? unbounded() : parseType(file, node.type),
    vararg: node.vararg === true,
    icon: optStr(node.icon) ?? null,
    direction: directionRaw && isPortDirection(directionRaw) ? directionRaw : direction,
    relation: relationRaw && isRelationKind(relationRaw) ? relationRaw : undefined,
    relatesTo: optStr(node.relatesTo),
    attributes: attrs(node.attrs),
  };
}

function parseFactory(file: string, value: unknown): Factory {
  if (typeof value === "string") {
    return { id: value, args: [], attributes: [] };
  }
  const node = record(file, value, "factory");
  const args = node.type !== undefined ? [parseType(file, node.type)] : list(file, node.args, "factory args").map((item) => parseType(file, item));
  return { id: str(file, node.id, "factory id"), args, attributes: attrs(node.attrs) };
}

function parseTypeDef(file: string, value: unknown): TypeDef {
  const node = record(file, value, "type");
  const params = list(file, node.params ?? node.vars, "type params").map((item) => parseParam(file, item));
  const ancestors = [
    ...list(file, node.ancestors, "type ancestors").map((item) => parseType(file, item)),
    ...oneOrMore(file, node.extends, "type extends").map((item) => parseType(file, item)),
  ];
  return {
    name: str(file, node.name, "type name"),
    ns: optStr(node.ns) ?? null,
    vars: params,
    params,
    ancestors,
    extends: ancestors[0] ?? null,
    attributes: attrs(node.attrs),
    source: file,
  };
}

function parseParameter(file: string, value: unknown, defaultKind = "parameter"): BlockParameterDef {
  const node = record(file, value, "parameter");
  const kindRaw = optStr(node.kind) ?? defaultKind;
  if (!isBlockParameterKind(kindRaw)) {
    fail(file, `unsupported parameter kind \`${kindRaw}\``);
  }
  const type = node.type === undefined ? null : parseType(file, node.type);
  const fallback = node.default === undefined || node.default === null ? null : String(node.default);
  return {
    kind: kindRaw,
    name: str(file, node.name, "parameter name"),
    type,
    description: optStr(node.description) ?? null,
    default: fallback,
    min: optNum(file, node.min, "min"),
    max: optNum(file, node.max, "max"),
    step: optNum(file, node.step, "step"),
    minChars: optNum(file, node.minChars, "minChars"),
    maxChars: optNum(file, node.maxChars, "maxChars"),
    pattern: optStr(node.pattern) ?? null,
    attributes: attrs(node.attrs),
  };
}

function parseRelation(file: string, value: unknown): TypeRelationDef {
  const node = record(file, value, "relation");
  const kindRaw = optStr(node.kind) ?? "intersection";
  const inputs = list(file, node.inputs, "relation inputs").map((item) => str(file, item, "relation input"));
  const outputs = list(file, node.outputs, "relation outputs").map((item) => str(file, item, "relation output"));
  return {
    name: optStr(node.name),
    kind: isRelationKind(kindRaw) ? kindRaw : "intersection",
    from: optStr(node.from),
    to: optStr(node.to),
    input: optStr(node.input),
    output: optStr(node.output),
    param: optStr(node.param),
    type: node.type === undefined ? undefined : parseType(file, node.type),
    expression: optStr(node.expression),
    inputs: inputs.length > 0 ? inputs : undefined,
    outputs: outputs.length > 0 ? outputs : undefined,
    attributes: attrs(node.attrs),
  };
}

const BLOCK_FLAGS = ["kind", "runnable", "generator", "combiner", "description"] as const;

function parseBlock(file: string, value: unknown): BlockDef {
  const node = record(file, value, "block");
  const params = list(file, node.params ?? node.vars, "block params").map((item) => parseParam(file, item));
  const parameters = [
    ...list(file, node.parameters, "parameters").map((item) => parseParameter(file, item)),
    ...list(file, node.settings, "settings").map((item) => parseParameter(file, item, "setting")),
  ];
  return {
    id: str(file, node.id, "block id"),
    name: str(file, node.name, "block name"),
    ns: str(file, node.ns, "block ns"),
    icon: optStr(node.icon) ?? null,
    vars: params,
    params,
    parameters,
    settings: parameters,
    factory: node.factory === undefined ? null : parseFactory(file, node.factory),
    inputs: [...list(file, node.in ?? node.inputs, "inputs").map((item) => parsePort(file, item, "in"))],
    outputs: [...list(file, node.out ?? node.outputs, "outputs").map((item) => parsePort(file, item, "out"))],
    relations: (() => {
      const relations = list(file, node.relations, "relations").map((item) => parseRelation(file, item));
      return relations.length > 0 ? relations : undefined;
    })(),
    attributes: flagAttrs(node, BLOCK_FLAGS),
    source: file,
  };
}

function parseNamespace(file: string, value: unknown): Namespace {
  const node = record(file, value, "namespace");
  return {
    id: str(file, node.id, "namespace id"),
    name: str(file, node.name, "namespace name"),
    parent: optStr(node.parent) ?? null,
    icon: optStr(node.icon) ?? null,
    attributes: attrs(node.attrs),
  };
}

const ROOT_KEYS = new Set(["id", "name", "icon", "attrs", "namespaces", "types", "blocks"]);

export function parseCatalog(file: string, source: string | unknown): BlocksDoc {
  let data: unknown = source;
  if (typeof source === "string") {
    try {
      data = JSON.parse(source) as unknown;
    } catch (error) {
      fail(file, error instanceof Error ? error.message : "JSON parse error");
    }
  }
  const root = record(file, data, "catalog");
  for (const key of Object.keys(root)) {
    if (!ROOT_KEYS.has(key)) {
      fail(file, `unsupported catalog field \`${key}\``);
    }
  }
  return {
    id: str(file, root.id, "id"),
    name: str(file, root.name, "name"),
    icon: optStr(root.icon) ?? null,
    attributes: attrs(root.attrs),
    namespaces: list(file, root.namespaces, "namespaces").map((item) => parseNamespace(file, item)),
    types: list(file, root.types, "types").map((item) => parseTypeDef(file, item)),
    blocks: list(file, root.blocks, "blocks").map((item) => parseBlock(file, item)),
    source: file,
  };
}

export function parseDoc(source: string | unknown): BlocksDoc {
  return parseCatalog("<inline>", source);
}

/** @deprecated Use parseCatalog. */
export const parseBlocks = parseCatalog;
