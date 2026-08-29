import {
  type Attribute,
  type BlockDef,
  type BlocksDoc,
  type Factory,
  type LibraryRef,
  type Namespace,
  type ParamDef,
  type PortDef,
  type TypeDef,
  type TypeExpr,
  type Variance,
  intersectionOf,
  parseVariance,
  unbounded,
  unionOf,
  extendsBound,
  superBound,
} from "./ast";

export class ParseError extends Error {
  file?: string;
  row?: number;
  col?: number;

  constructor(message: string, file?: string, row?: number, col?: number) {
    super(formatParseError(message, file, row, col));
    this.name = "ParseError";
    this.file = file;
    this.row = row;
    this.col = col;
  }

  static new(message: string): ParseError {
    return new ParseError(message);
  }
}

function formatParseError(message: string, file?: string, row?: number, col?: number): string {
  if (file !== undefined && row !== undefined && col !== undefined) {
    return `${file}:${row}:${col}: ${message}`;
  }
  if (file !== undefined) {
    return `${file}: ${message}`;
  }
  return message;
}

function at(file: string, node: Element, message: string): ParseError {
  const pos = textPos(node);
  return new ParseError(message, file, pos?.row, pos?.col);
}

function textPos(node: Element): { row: number; col: number } | undefined {
  const source = node.ownerDocument?.documentElement?.getAttribute("data-source");
  void source;
  return undefined;
}

function elements(node: Element): Element[] {
  return [...node.children].filter((child): child is Element => child.nodeType === 1);
}

function optAttr(node: Element, name: string): string | undefined {
  return node.hasAttribute(name) ? node.getAttribute(name) ?? undefined : undefined;
}

function requiredAttr(file: string, node: Element, name: string): string {
  const value = optAttr(node, name);
  if (value === undefined) {
    throw at(file, node, `missing \`${name}\` attribute`);
  }
  return value;
}

function parseAttribute(file: string, node: Element): Attribute {
  return {
    name: requiredAttr(file, node, "name"),
    value: (node.textContent ?? "").trim(),
  };
}

function parseAttributes(file: string, node: Element): Attribute[] {
  return elements(node)
    .filter((child) => child.tagName === "attribute")
    .map((child) => parseAttribute(file, child));
}

function parseVarianceAttr(file: string, node: Element): Variance | null {
  const value = optAttr(node, "variance");
  if (value === undefined) {
    return null;
  }
  const parsed = parseVariance(value);
  if (!parsed) {
    throw at(file, node, `invalid variance \`${value}\``);
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

export function parseTexpr(file: string, node: Element): TypeExpr {
  const tag = node.tagName;
  if (tag === "self") {
    return { kind: "self" };
  }

  const parts: TypeExpr[] = [];
  for (const child of elements(node)) {
    switch (child.tagName) {
      case "attribute":
        break;
      case "t":
      case "self":
      case "union":
      case "intersection":
        parts.push(parseTexpr(file, child));
        break;
      default:
        throw at(file, child, `unsupported type-expression child <${child.tagName}>`);
    }
  }

  if (tag === "union") {
    return unionOf(parts);
  }
  if (tag === "intersection") {
    return intersectionOf(parts);
  }

  const variance = parseVarianceAttr(file, node);
  const typeName = optAttr(node, "type");

  if (variance === "unbounded" && typeName === undefined) {
    return unbounded();
  }

  let inner: TypeExpr;
  if (typeName !== undefined) {
    inner = { kind: "type", name: typeName, ns: null, args: parts };
  } else if (parts.length === 1) {
    inner = parts[0];
  } else if (parts.length === 0) {
    inner = unbounded();
  } else {
    inner = intersectionOf(parts);
  }

  return wrapVariance(inner, variance);
}

function parseLibrary(file: string, node: Element): LibraryRef {
  return {
    id: requiredAttr(file, node, "id"),
    name: requiredAttr(file, node, "name"),
    version: optAttr(node, "version") ?? null,
    attributes: parseAttributes(file, node),
  };
}

function parseNamespace(file: string, node: Element): Namespace {
  return {
    id: requiredAttr(file, node, "id"),
    name: requiredAttr(file, node, "name"),
    parent: optAttr(node, "parent") ?? null,
    icon: optAttr(node, "icon") ?? null,
    attributes: parseAttributes(file, node),
  };
}

function parseParam(file: string, node: Element): ParamDef {
  const attributes: Attribute[] = [];
  const extendsBounds: TypeExpr[] = [];
  const superBounds: TypeExpr[] = [];
  for (const child of elements(node)) {
    switch (child.tagName) {
      case "attribute":
        attributes.push(parseAttribute(file, child));
        break;
      case "extends":
        extendsBounds.push(parseTexpr(file, child));
        break;
      case "super":
        superBounds.push(parseTexpr(file, child));
        break;
      default:
        throw at(file, child, `unsupported <param> child <${child.tagName}>`);
    }
  }
  return {
    name: requiredAttr(file, node, "name"),
    variance: parseVarianceAttr(file, node),
    extends: extendsBounds,
    superBounds,
    attributes,
  };
}

function parsePort(file: string, node: Element): PortDef {
  const vararg = optAttr(node, "vararg");
  return {
    name: requiredAttr(file, node, "name"),
    ty: parseTexpr(file, node),
    vararg: vararg === "true" || vararg === "1",
    icon: optAttr(node, "icon") ?? null,
    attributes: parseAttributes(file, node),
  };
}

function parseFactory(file: string, node: Element): Factory {
  const attributes: Attribute[] = [];
  const args: TypeExpr[] = [];
  for (const child of elements(node)) {
    switch (child.tagName) {
      case "attribute":
        attributes.push(parseAttribute(file, child));
        break;
      case "t":
      case "self":
      case "union":
      case "intersection":
        args.push(parseTexpr(file, child));
        break;
      default:
        throw at(file, child, `unsupported <factory> child <${child.tagName}>`);
    }
  }
  return {
    id: requiredAttr(file, node, "id"),
    args,
    attributes,
  };
}

function parseTypeDef(file: string, node: Element): TypeDef {
  const params: ParamDef[] = [];
  const ancestors: TypeExpr[] = [];
  let alias: TypeExpr | null = null;
  const attributes: Attribute[] = [];
  for (const child of elements(node)) {
    switch (child.tagName) {
      case "attribute":
        attributes.push(parseAttribute(file, child));
        break;
      case "param":
        params.push(parseParam(file, child));
        break;
      case "ancestor":
        ancestors.push(parseTexpr(file, child));
        break;
      case "union":
      case "intersection":
        if (alias !== null) {
          throw at(file, child, "type may have only one union/intersection body");
        }
        alias = parseTexpr(file, child);
        break;
      default:
        throw at(file, child, `unsupported <type> child <${child.tagName}>`);
    }
  }
  return {
    name: requiredAttr(file, node, "name"),
    ns: optAttr(node, "ns") ?? null,
    params,
    ancestors,
    alias,
    attributes,
    source: file,
  };
}

function parseBlock(file: string, node: Element): BlockDef {
  const attributes: Attribute[] = [];
  const params: ParamDef[] = [];
  let factory: Factory | null = null;
  const inputs: PortDef[] = [];
  const outputs: PortDef[] = [];
  for (const child of elements(node)) {
    switch (child.tagName) {
      case "attribute":
        attributes.push(parseAttribute(file, child));
        break;
      case "param":
        params.push(parseParam(file, child));
        break;
      case "factory":
        if (factory !== null) {
          throw at(file, child, "block already has a factory");
        }
        factory = parseFactory(file, child);
        break;
      case "in":
        inputs.push(parsePort(file, child));
        break;
      case "out":
        outputs.push(parsePort(file, child));
        break;
      default:
        throw at(file, child, `unsupported <block> child <${child.tagName}>`);
    }
  }
  return {
    id: requiredAttr(file, node, "id"),
    name: requiredAttr(file, node, "name"),
    ns: requiredAttr(file, node, "ns"),
    icon: optAttr(node, "icon") ?? null,
    params,
    factory,
    inputs,
    outputs,
    attributes,
    source: file,
  };
}

export function parseBlocks(file: string, xml: string): BlocksDoc {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new ParseError(parserError.textContent?.trim() || "XML parse error", file);
  }
  const root = document.documentElement;
  if (root.tagName !== "blocks") {
    throw at(file, root, `expected <blocks>, found <${root.tagName}>`);
  }
  const doc: BlocksDoc = {
    id: requiredAttr(file, root, "id"),
    name: requiredAttr(file, root, "name"),
    icon: optAttr(root, "icon") ?? null,
    attributes: [],
    libraries: [],
    namespaces: [],
    types: [],
    blocks: [],
    source: file,
  };
  for (const child of elements(root)) {
    switch (child.tagName) {
      case "attribute":
        doc.attributes.push(parseAttribute(file, child));
        break;
      case "library":
        doc.libraries.push(parseLibrary(file, child));
        break;
      case "namespace":
        doc.namespaces.push(parseNamespace(file, child));
        break;
      case "type":
        doc.types.push(parseTypeDef(file, child));
        break;
      case "block":
        doc.blocks.push(parseBlock(file, child));
        break;
      default:
        throw at(file, child, `unsupported <blocks> child <${child.tagName}>`);
    }
  }
  return doc;
}
