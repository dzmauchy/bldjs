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
  intersectionOf,
  isBlockParameterKind,
  isPortDirection,
  isRelationKind,
  isVarianceType,
  named,
  NamedType,
  WildcardType,
} from "./ast";
import { ParseError, XmlElem } from "../dom";
import { parseType, parseMoonbitType } from "./type-parser";

export { ParseError };
export { parseType, parseMoonbitType } from "./type-parser";

function parseTypeAttr(node: XmlElem, fallback: TypeExpr | undefined): TypeExpr {
  const raw = node.opt("type");
  if (raw === undefined) {
    if (fallback) {
      return fallback;
    }
    return parseType("");
  }
  try {
    return parseType(raw);
  } catch (error) {
    node.fail(error instanceof Error ? error.message : `invalid type \`${raw}\``);
  }
}

function rejectNestedTypes(node: XmlElem, parent: string): void {
  for (const child of node.kids()) {
    if (child.tag === "attribute") {
      continue;
    }
    child.fail(`unsupported ${parent} child <${child.tag}>`);
  }
}

export function parseTexpr(node: XmlElem): TypeExpr {
  return parseTypeAttr(node, undefined);
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

function parseXmlTypeNode(node: XmlElem): TypeExpr {
  switch (node.tag) {
    case "var":
    case "type-var":
      return named(node.req("name"));
    case "raw-type":
      return new NamedType(node.req("name"), node.opt("ns") ?? null, []);
    case "wildcard": {
      const variance = node.opt("variance");
      const extendsAttr = node.opt("extends");
      const superAttr = node.opt("super");
      let bound: TypeExpr | null = null;
      let boundKind: "extends" | "super" | null = null;

      const extendsElem = node.kids().find((k) => k.tag === "extends");
      const superElem = node.kids().find((k) => k.tag === "super");

      if (extendsAttr) {
        bound = parseType(extendsAttr);
        boundKind = "extends";
      } else if (extendsElem) {
        bound = extendsElem.opt("type")
          ? parseType(extendsElem.req("type"))
          : parsePortTypeExpr(extendsElem);
        boundKind = "extends";
      } else if (superAttr) {
        bound = parseType(superAttr);
        boundKind = "super";
      } else if (superElem) {
        bound = superElem.opt("type")
          ? parseType(superElem.req("type"))
          : parsePortTypeExpr(superElem);
        boundKind = "super";
      } else if (variance === "+") {
        boundKind = "extends";
      } else if (variance === "-") {
        boundKind = "super";
      }
      return new WildcardType(bound, boundKind);
    }
    case "intersection": {
      const members = node.kids().filter((k) => k.tag !== "attribute").map(parseXmlTypeNode);
      return intersectionOf(members);
    }
    case "type": {
      const name = node.req("name");
      const ns = node.opt("ns") ?? null;
      const kids = node.kids().filter((k) => k.tag !== "attribute");
      if (kids.length === 0) {
        if (node.opt("type")) {
          return parseType(node.req("type"));
        }
        return new NamedType(name, ns, []);
      }
      const args = kids.map(parseXmlTypeNode);
      return new NamedType(name, ns, args);
    }
    default:
      node.fail(`unsupported type element <${node.tag}>`);
  }
}

function parsePortTypeExpr(node: XmlElem): TypeExpr {
  const typeKids = node.kids().filter((k) => k.tag !== "attribute");
  if (typeKids.length > 0) {
    if (typeKids.length === 1) {
      return parseXmlTypeNode(typeKids[0]!);
    }
    return intersectionOf(typeKids.map(parseXmlTypeNode));
  }
  return parseTypeAttr(node, undefined);
}

function parseParam(node: XmlElem): ParamDef {
  const attributes: Attribute[] = [];
  const extendsBounds: TypeExpr[] = [];
  const superBounds: TypeExpr[] = [];
  const extendsAttr = node.opt("extends");
  if (extendsAttr) {
    extendsBounds.push(parseType(extendsAttr));
  }
  for (const child of node.kids()) {
    switch (child.tag) {
      case "attribute":
        attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "extends":
        if (child.opt("type")) {
          extendsBounds.push(parseTypeAttr(child, undefined));
        } else if (child.text()) {
          extendsBounds.push(parseType(child.text()));
        } else {
          const typeKids = child.kids().filter((k) => k.tag !== "attribute");
          if (typeKids.length > 0) {
            extendsBounds.push(parseXmlTypeNode(typeKids[0]!));
          }
        }
        break;
      case "super":
        if (child.opt("type")) {
          superBounds.push(parseTypeAttr(child, undefined));
        } else if (child.text()) {
          superBounds.push(parseType(child.text()));
        }
        break;
      default:
        child.fail(`unsupported <${node.tag}> child <${child.tag}>`);
    }
  }
  const varianceRaw = node.opt("variance");
  const variance = varianceRaw && isVarianceType(varianceRaw) ? varianceRaw : undefined;
  const relationRaw = node.opt("relation");
  const relation = relationRaw && isRelationKind(relationRaw) ? relationRaw : undefined;
  return {
    name: node.req("name"),
    extends: extendsBounds,
    super: superBounds.length > 0 ? superBounds : undefined,
    variance,
    relation,
    attributes,
  };
}

function parsePort(node: XmlElem, defaultDirection?: "in" | "out"): PortDef {
  const vararg = node.opt("vararg");
  const directionRaw = node.opt("direction");
  const direction =
    directionRaw && isPortDirection(directionRaw)
      ? directionRaw
      : defaultDirection ?? (node.tag === "in" || node.tag === "input" ? "in" : "out");
  const relationRaw = node.opt("relation");
  const relation = relationRaw && isRelationKind(relationRaw) ? relationRaw : undefined;
  return {
    name: node.req("name"),
    ty: parsePortTypeExpr(node),
    vararg: vararg === "true" || vararg === "1",
    icon: node.opt("icon") ?? null,
    direction,
    relation,
    relatesTo: node.opt("relatesTo") ?? undefined,
    attributes: node.attributes(),
  };
}

function parseFactory(node: XmlElem): Factory {
  rejectNestedTypes(node, "<factory>");
  const typeAttr = node.opt("type");
  return {
    id: node.req("id"),
    args: typeAttr !== undefined ? [parseTypeAttr(node, undefined)] : [],
    attributes: node.attributes(),
  };
}

function parseTypeDef(node: XmlElem, file: string): TypeDef {
  const params: ParamDef[] = [];
  const ancestors: TypeExpr[] = [];
  let alias: TypeExpr | null = null;
  const attributes: Attribute[] = [];
  const extendsAttr = node.opt("extends");
  if (extendsAttr) {
    ancestors.push(parseType(extendsAttr));
  }
  for (const child of node.kids()) {
    switch (child.tag) {
      case "attribute":
        attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "var":
      case "param":
        params.push(parseParam(child));
        break;
      case "extends":
      case "ancestor":
        ancestors.push(parsePortTypeExpr(child));
        break;
      case "alias":
        if (alias !== null) {
          child.fail("type may have only one alias");
        }
        alias = parsePortTypeExpr(child);
        break;
      default:
        child.fail(`unsupported <type> child <${child.tag}>`);
    }
  }
  return {
    name: node.req("name"),
    ns: node.opt("ns") ?? null,
    vars: params,
    params,
    ancestors,
    extends: extendsAttr ? parseType(extendsAttr) : (ancestors[0] ?? null),
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
    type: typeAttr !== undefined ? parseTypeAttr(node, undefined) : null,
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
    type: typeAttr !== undefined ? parseTypeAttr(node, undefined) : undefined,
    expression: node.opt("expression") ?? undefined,
    inputs: inputs.length > 0 ? inputs : undefined,
    outputs: outputs.length > 0 ? outputs : undefined,
    attributes,
  };
}

function parseBlock(node: XmlElem, file: string): BlockDef {
  const attributes: Attribute[] = [];
  const params: ParamDef[] = [];
  const parameters: BlockParameterDef[] = [];
  let factory: Factory | null = null;
  const inputs: PortDef[] = [];
  const outputs: PortDef[] = [];
  const relations: TypeRelationDef[] = [];
  for (const child of node.kids()) {
    switch (child.tag) {
      case "attribute":
        attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "var":
      case "param":
        params.push(parseParam(child));
        break;
      case "parameters":
      case "settings":
        parameters.push(...parseParameters(child));
        break;
      case "factory":
        if (factory !== null) {
          child.fail("block already has a factory");
        }
        factory = parseFactory(child);
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
    vars: params,
    params,
    parameters,
    settings: parameters,
    factory,
    inputs,
    outputs,
    relations: relations.length > 0 ? relations : undefined,
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
  const root = new XmlElem(file, document.documentElement);
  if (root.tag !== "blocks" && root.tag !== "types") {
    root.fail(`expected <blocks> or <types>, found <${root.tag}>`);
  }
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
        if (root.tag === "types") {
          child.fail("<types> document cannot contain <block>");
        }
        doc.blocks.push(parseBlock(child, file));
        break;
      default:
        child.fail(`unsupported <${root.tag}> child <${child.tag}>`);
    }
  }
  return doc;
}
