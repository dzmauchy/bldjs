import {
  type Attribute,
  type BlockDef,
  type BlockParameterDef,
  type BlocksDoc,
  type Namespace,
  type PortDef,
  type TypeDef,
  type TypeExpr,
  type TypeRelationDef,
  type VarDef,
  isBlockParameterKind,
  isPortDirection,
  isRelationKind,
} from "./ast";
import { ParseError, XmlElem } from "../dom";
import { parseMoonbitType } from "./moonbit-type";

export { ParseError };
export { parseMoonbitType } from "./moonbit-type";

function parseMoonbitAttr(node: XmlElem, fallback: TypeExpr | undefined): TypeExpr {
  const raw = node.opt("type");
  if (raw === undefined) {
    if (fallback) {
      return fallback;
    }
    return parseMoonbitType("");
  }
  try {
    return parseTypeSpec(raw).ty;
  } catch (error) {
    node.fail(error instanceof Error ? error.message : `invalid type \`${raw}\``);
  }
}

/** Split `T:extends(h(F))` or `array[T]:comparable(?(super(T)))` at a top-level colon. */
export function splitTypeConstraint(raw: string): { typeRaw: string; constraint: string | null } {
  const text = raw.trim();
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === "(" || ch === "[") {
      depth += 1;
    } else if (ch === ")" || ch === "]") {
      depth -= 1;
    } else if (ch === ":" && depth === 0) {
      const typeRaw = text.slice(0, i).trim();
      const constraint = text.slice(i + 1).trim();
      return { typeRaw: typeRaw.length > 0 ? typeRaw : "_", constraint: constraint.length > 0 ? constraint : null };
    }
  }
  return { typeRaw: text, constraint: null };
}

/** Port / var type string: MoonBit type, optional `:constraint`, or a bare Prolog constraint. */
export function parseTypeSpec(raw: string): { ty: TypeExpr; constraint: string | null } {
  if (raw.trim().length === 0) {
    return { ty: parseMoonbitType(""), constraint: null };
  }
  const { typeRaw, constraint } = splitTypeConstraint(raw);
  try {
    return { ty: parseMoonbitType(typeRaw), constraint };
  } catch (error) {
    if (constraint === null) {
      return { ty: parseMoonbitType("_"), constraint: typeRaw };
    }
    throw error;
  }
}

function rejectNestedTypes(node: XmlElem, parent: string): void {
  for (const child of node.kids()) {
    if (child.tag === "attribute") {
      continue;
    }
    child.fail(`unsupported ${parent} child <${child.tag}>; use a type string`);
  }
}

export function parseTexpr(node: XmlElem): TypeExpr {
  return parseMoonbitAttr(node, undefined);
}

function parseNamespace(node: XmlElem): Namespace {
  return {
    id: node.req("id"),
    name: node.req("name"),
    parent: node.opt("parent") ?? null,
    icon: node.opt("icon") ?? null,
    attributes: node.attributes(),
  };
}

/** `<var>T</var>` or `<var>F:extends(h(F))</var>`. */
export function parseVar(node: XmlElem): VarDef {
  const text = node.text();
  if (text.length === 0) {
    node.fail("empty <var>; expected `T` or `F:extends(h(F))`");
  }
  const colon = text.indexOf(":");
  const name = (colon < 0 ? text : text.slice(0, colon)).trim();
  const constraint = colon < 0 ? null : text.slice(colon + 1).trim();
  if (!/^[A-Z_][A-Za-z0-9_]*$/.test(name)) {
    node.fail(`type variable \`${name}\` must be a Prolog variable (uppercase)`);
  }
  if (constraint !== null && constraint.length === 0) {
    node.fail(`empty constraint on <var>${name}</var>`);
  }
  return {
    name,
    constraint,
    attributes: node.attributes(),
  };
}

function parsePort(node: XmlElem, defaultDirection?: "in" | "out"): PortDef {
  rejectNestedTypes(node, `<${node.tag}>`);
  const vararg = node.opt("vararg");
  const directionRaw = node.opt("direction");
  const direction =
    directionRaw && isPortDirection(directionRaw)
      ? directionRaw
      : defaultDirection ?? (node.tag === "in" || node.tag === "input" ? "in" : "out");
  const relationRaw = node.opt("relation");
  const relation = relationRaw && isRelationKind(relationRaw) ? relationRaw : undefined;
  const typeRaw = node.opt("type") ?? "";
  let spec: { ty: TypeExpr; constraint: string | null };
  try {
    spec = parseTypeSpec(typeRaw);
  } catch (error) {
    node.fail(error instanceof Error ? error.message : `invalid type \`${typeRaw}\``);
  }
  return {
    name: node.req("name"),
    ty: spec.ty,
    constraint: spec.constraint,
    vararg: vararg === "true" || vararg === "1",
    icon: node.opt("icon") ?? null,
    direction,
    relation,
    relatesTo: node.opt("relatesTo") ?? undefined,
    attributes: node.attributes(),
  };
}

function parseTypeDef(node: XmlElem, file: string): TypeDef {
  const vars: VarDef[] = [];
  const ancestors: TypeExpr[] = [];
  let alias: TypeExpr | null = null;
  const attributes: Attribute[] = [];
  for (const child of node.kids()) {
    switch (child.tag) {
      case "attribute":
        attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "var":
        vars.push(parseVar(child));
        break;
      case "param":
        child.fail("<param> was replaced by <var>T</var>");
        break;
      case "ancestor":
        ancestors.push(parseMoonbitAttr(child, undefined));
        rejectNestedTypes(child, "<ancestor>");
        break;
      case "alias":
        if (alias !== null) {
          child.fail("type may have only one alias");
        }
        alias = parseMoonbitAttr(child, undefined);
        rejectNestedTypes(child, "<alias>");
        break;
      default:
        child.fail(`unsupported <type> child <${child.tag}>`);
    }
  }
  return {
    name: node.req("name"),
    ns: node.opt("ns") ?? null,
    vars,
    ancestors,
    alias,
    attributes,
    source: file,
  };
}

function parseParameterDef(node: XmlElem): BlockParameterDef {
  if (!isBlockParameterKind(node.tag)) {
    node.fail(`unsupported parameter <${node.tag}>`);
  }
  const typeAttr = node.opt("type");
  return {
    kind: node.tag,
    name: node.req("name"),
    type: typeAttr !== undefined ? parseMoonbitAttr(node, undefined) : null,
    description: node.opt("description") ?? null,
    default: node.opt("default") ?? null,
    min: node.num("min", false),
    max: node.num("max", false),
    step: node.num("step", false),
    minChars: node.num("minChars", false),
    maxChars: node.num("maxChars", false),
    pattern: node.opt("pattern") ?? null,
    attributes: node.attributes(),
  };
}

function parseParameters(node: XmlElem): BlockParameterDef[] {
  const parameters: BlockParameterDef[] = [];
  for (const child of node.kids()) {
    if (child.tag === "attribute") {
      continue;
    }
    parameters.push(parseParameterDef(child));
  }
  return parameters;
}

function parseRelation(node: XmlElem): TypeRelationDef {
  const attributes: Attribute[] = [];
  const inputs: string[] = [];
  const outputs: string[] = [];
  for (const child of node.kids()) {
    switch (child.tag) {
      case "attribute":
        attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "in":
      case "input":
        inputs.push(child.text());
        break;
      case "out":
      case "output":
        outputs.push(child.text());
        break;
      default:
        child.fail(`unsupported <relation> child <${child.tag}>`);
    }
  }
  const kindRaw = node.opt("kind") ?? "intersection";
  const kind = isRelationKind(kindRaw) ? kindRaw : "intersection";
  const typeAttr = node.opt("type");
  return {
    name: node.opt("name") ?? undefined,
    kind,
    from: node.opt("from") ?? undefined,
    to: node.opt("to") ?? undefined,
    input: node.opt("input") ?? undefined,
    output: node.opt("output") ?? undefined,
    param: node.opt("param") ?? undefined,
    type: typeAttr !== undefined ? parseMoonbitAttr(node, undefined) : undefined,
    expression: node.opt("expression") ?? undefined,
    inputs: inputs.length > 0 ? inputs : undefined,
    outputs: outputs.length > 0 ? outputs : undefined,
    attributes,
  };
}

function parseBlock(node: XmlElem, file: string): BlockDef {
  const attributes: Attribute[] = [];
  const vars: VarDef[] = [];
  const parameters: BlockParameterDef[] = [];
  const inputs: PortDef[] = [];
  const outputs: PortDef[] = [];
  const relations: TypeRelationDef[] = [];
  for (const child of node.kids()) {
    switch (child.tag) {
      case "attribute":
        attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "var":
        vars.push(parseVar(child));
        break;
      case "param":
        child.fail("<param> was replaced by <var>T</var>");
        break;
      case "type":
        child.fail("block <type> was removed; inference is blocks.pl by id");
        break;
      case "parameters":
      case "settings":
        parameters.push(...parseParameters(child));
        break;
      case "factory":
        child.fail("<factory> was removed; the block id links the asm generator");
        break;
      case "in":
      case "input":
        inputs.push(parsePort(child, "in"));
        break;
      case "out":
      case "output":
        outputs.push(parsePort(child, "out"));
        break;
      case "relation":
      case "type-relation":
        relations.push(parseRelation(child));
        break;
      default:
        child.fail(`unsupported <block> child <${child.tag}>`);
    }
  }
  return {
    id: node.req("id"),
    name: node.req("name"),
    ns: node.req("ns"),
    icon: node.opt("icon") ?? null,
    vars,
    parameters,
    settings: parameters,
    inputs,
    outputs,
    relations: relations.length > 0 ? relations : undefined,
    attributes,
    source: file,
  };
}

export function parseBlocks(file: string, xml: string): BlocksDoc {
  const root = XmlElem.parse(file, xml, "blocks");
  const doc: BlocksDoc = {
    id: root.req("id"),
    name: root.req("name"),
    icon: root.opt("icon") ?? null,
    attributes: [],
    namespaces: [],
    types: [],
    blocks: [],
    source: file,
  };
  for (const child of root.kids()) {
    switch (child.tag) {
      case "attribute":
        doc.attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "namespace":
        doc.namespaces.push(parseNamespace(child));
        break;
      case "type":
        doc.types.push(parseTypeDef(child, file));
        break;
      case "block":
        doc.blocks.push(parseBlock(child, file));
        break;
      default:
        child.fail(`unsupported <blocks> child <${child.tag}>`);
    }
  }
  return doc;
}
