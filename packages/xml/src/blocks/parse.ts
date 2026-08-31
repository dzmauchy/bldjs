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
  type Variance,
  NamedType,
  SelfType,
  intersectionOf,
  isBlockParameterKind,
  parseVariance,
  unbounded,
  unionOf,
  extendsBound,
  superBound,
} from "./ast";
import { ParseError, XmlElem } from "../dom";

export { ParseError };

function parseVarianceAttr(node: XmlElem): Variance | null {
  const value = node.opt("variance");
  if (value === undefined) {
    return null;
  }
  const parsed = parseVariance(value);
  if (!parsed) {
    node.fail(`invalid variance \`${value}\``);
  }
  return parsed;
}

function wrapVariance(inner: TypeExpr, variance: Variance | null): TypeExpr {
  if ((variance === null || variance === "unbounded") && inner.kind === "wildcard") {
    return inner;
  }
  if (variance === "unbounded") {
    return unbounded();
  }
  if (variance === "covariant") {
    return extendsBound(inner);
  }
  if (variance === "contravariant") {
    return superBound(inner);
  }
  return inner;
}

const ARRAY_SUFFIX = "[]";

/** `f64[]` / `T[]` / `array` become the language-agnostic array type `[]`. */
export function parseNamedType(typeName: string, args: TypeExpr[]): TypeExpr {
  if (typeName === "array") {
    return new NamedType("[]", null, args);
  }
  if (typeName.endsWith(ARRAY_SUFFIX)) {
    const innerName = typeName.slice(0, -ARRAY_SUFFIX.length);
    if (innerName.length === 0) {
      return new NamedType("[]", null, args);
    }
    return new NamedType("[]", null, [parseNamedType(innerName, args)]);
  }
  return new NamedType(typeName, null, args);
}

function parseTypeParts(node: XmlElem, parent: string): TypeExpr[] {
  const parts: TypeExpr[] = [];
  for (const child of node.kids()) {
    switch (child.tag) {
      case "attribute":
        break;
      case "t":
      case "self":
      case "union":
      case "intersection":
        parts.push(parseTexpr(child));
        break;
      default:
        child.fail(`unsupported ${parent} child <${child.tag}>`);
    }
  }
  return parts;
}

export function parseTexpr(node: XmlElem): TypeExpr {
  if (node.tag === "self") {
    return new SelfType();
  }

  const parts = parseTypeParts(node, "type-expression");
  if (node.tag === "union") {
    return unionOf(parts);
  }
  if (node.tag === "intersection") {
    return intersectionOf(parts);
  }

  const variance = parseVarianceAttr(node);
  const typeName = node.opt("type");

  if (variance === "unbounded" && typeName === undefined) {
    return unbounded();
  }

  let inner: TypeExpr;
  if (typeName !== undefined) {
    inner = parseNamedType(typeName, parts);
  } else if (parts.length === 1) {
    inner = parts[0];
  } else if (parts.length === 0) {
    inner = unbounded();
  } else {
    inner = intersectionOf(parts);
  }

  return wrapVariance(inner, variance);
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

function parseParam(node: XmlElem): ParamDef {
  const attributes: Attribute[] = [];
  const extendsBounds: TypeExpr[] = [];
  const superBounds: TypeExpr[] = [];
  for (const child of node.kids()) {
    switch (child.tag) {
      case "attribute":
        attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "extends":
        extendsBounds.push(parseTexpr(child));
        break;
      case "super":
        superBounds.push(parseTexpr(child));
        break;
      default:
        child.fail(`unsupported <param> child <${child.tag}>`);
    }
  }
  return {
    name: node.req("name"),
    variance: parseVarianceAttr(node),
    extends: extendsBounds,
    superBounds,
    attributes,
  };
}

function parsePort(node: XmlElem): PortDef {
  const vararg = node.opt("vararg");
  return {
    name: node.req("name"),
    ty: parseTexpr(node),
    vararg: vararg === "true" || vararg === "1",
    icon: node.opt("icon") ?? null,
    attributes: node.attributes(),
  };
}

function parseFactory(node: XmlElem): Factory {
  return {
    id: node.req("id"),
    args: parseTypeParts(node, "<factory>"),
    attributes: node.attributes(),
  };
}

function parseTypeDef(node: XmlElem, file: string): TypeDef {
  const params: ParamDef[] = [];
  const ancestors: TypeExpr[] = [];
  let alias: TypeExpr | null = null;
  const attributes: Attribute[] = [];
  for (const child of node.kids()) {
    switch (child.tag) {
      case "attribute":
        attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "param":
        params.push(parseParam(child));
        break;
      case "ancestor":
        ancestors.push(parseTexpr(child));
        break;
      case "union":
      case "intersection":
        if (alias !== null) {
          child.fail("type may have only one union/intersection body");
        }
        alias = parseTexpr(child);
        break;
      default:
        child.fail(`unsupported <type> child <${child.tag}>`);
    }
  }
  return {
    name: node.req("name"),
    ns: node.opt("ns") ?? null,
    params,
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
  return {
    kind: node.tag,
    name: node.req("name"),
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

function parseBlock(node: XmlElem, file: string): BlockDef {
  const attributes: Attribute[] = [];
  const params: ParamDef[] = [];
  const parameters: BlockParameterDef[] = [];
  let factory: Factory | null = null;
  const inputs: PortDef[] = [];
  const outputs: PortDef[] = [];
  for (const child of node.kids()) {
    switch (child.tag) {
      case "attribute":
        attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "param":
        params.push(parseParam(child));
        break;
      case "parameters":
        if (parameters.length > 0) {
          child.fail("block already has parameters");
        }
        parameters.push(...parseParameters(child));
        break;
      case "factory":
        if (factory !== null) {
          child.fail("block already has a factory");
        }
        factory = parseFactory(child);
        break;
      case "in":
        inputs.push(parsePort(child));
        break;
      case "out":
        outputs.push(parsePort(child));
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
    params,
    parameters,
    factory,
    inputs,
    outputs,
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
