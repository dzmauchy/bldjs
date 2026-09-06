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
import { ParseError, XmlElem } from "../dom";

export { ParseError };

function rejectNestedTypes(node: XmlElem, parent: string): void {
  for (const child of node.kids()) {
    if (child.tag === "attribute") {
      continue;
    }
    child.fail(`unsupported ${parent} child <${child.tag}>`);
  }
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

export function parseXmlTypeNode(node: XmlElem): TypeExpr {
  switch (node.tag) {
    case "var":
    case "type-var":
      return named(node.req("name"));
    case "raw-type":
      return new NamedType(node.req("name"), node.opt("ns") ?? null, []);
    case "wildcard": {
      const varianceRaw = node.opt("variance");
      let variance: VarianceType | null = null;
      if (varianceRaw) {
        if (varianceRaw === "+" || varianceRaw === "-") {
          variance = varianceRaw;
        } else {
          node.fail(`wildcard variance must be '+' or '-', got '${varianceRaw}'`);
        }
      }
      const typeKids = node.kids().filter((k) => k.tag !== "attribute");
      let bound: TypeExpr | null = null;
      if (typeKids.length > 0) {
        bound = parseXmlTypeNode(typeKids[0]!);
      } else if (node.opt("type")) {
        bound = named(node.req("type"));
      } else if (node.opt("extends")) {
        bound = named(node.req("extends"));
        variance = "+";
      } else if (node.opt("super")) {
        bound = named(node.req("super"));
        variance = "-";
      }
      return new WildcardType(bound, variance);
    }
    case "union": {
      const members = node.kids().filter((k) => k.tag !== "attribute").map(parseXmlTypeNode);
      return unionOf(members);
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
          const t = node.req("type");
          if (t === "_") return unbounded();
          if (t === "Self") return new SelfType();
          return named(t);
        }
        if (name === "_") return unbounded();
        if (name === "Self") return new SelfType();
        return new NamedType(name, ns, []);
      }
      const args = kids.map(parseXmlTypeNode);
      return new NamedType(name, ns, args);
    }
    default:
      node.fail(`unsupported type element <${node.tag}>`);
  }
}

export function parsePortTypeExpr(node: XmlElem): TypeExpr {
  const typeKids = node.kids().filter((k) => k.tag !== "attribute");
  if (typeKids.length > 0) {
    if (typeKids.length === 1) {
      return parseXmlTypeNode(typeKids[0]!);
    }
    return intersectionOf(typeKids.map(parseXmlTypeNode));
  }
  const typeAttr = node.opt("type");
  if (typeAttr !== undefined) {
    if (typeAttr === "_") return unbounded();
    if (typeAttr === "Self") return new SelfType();
    return named(typeAttr);
  }
  const nameAttr = node.opt("name");
  if (nameAttr !== undefined) {
    if (nameAttr === "_") return unbounded();
    if (nameAttr === "Self") return new SelfType();
    return named(nameAttr);
  }
  return unbounded();
}

function parseParam(node: XmlElem): ParamDef {
  const attributes: Attribute[] = [];
  const extendsBounds: TypeExpr[] = [];
  const superBounds: TypeExpr[] = [];
  const extendsAttr = node.opt("extends");
  if (extendsAttr) {
    extendsBounds.push(named(extendsAttr));
  }
  for (const child of node.kids()) {
    switch (child.tag) {
      case "attribute":
        attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "extends":
        if (child.opt("type")) {
          extendsBounds.push(named(child.req("type")));
        } else {
          const typeKids = child.kids().filter((k) => k.tag !== "attribute");
          if (typeKids.length > 0) {
            extendsBounds.push(parseXmlTypeNode(typeKids[0]!));
          }
        }
        break;
      case "super":
        if (child.opt("type")) {
          superBounds.push(named(child.req("type")));
        } else {
          const typeKids = child.kids().filter((k) => k.tag !== "attribute");
          if (typeKids.length > 0) {
            superBounds.push(parseXmlTypeNode(typeKids[0]!));
          }
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
    args: typeAttr !== undefined ? [named(typeAttr)] : [],
    attributes: node.attributes(),
  };
}

function parseTypeDef(node: XmlElem, file: string): TypeDef {
  const params: ParamDef[] = [];
  const ancestors: TypeExpr[] = [];
  const attributes: Attribute[] = [];
  const extendsAttr = node.opt("extends");
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
      default:
        child.fail(`unsupported <type> child <${child.tag}>`);
    }
  }
  if (ancestors.length === 0 && extendsAttr) {
    ancestors.push(named(extendsAttr));
  }
  return {
    name: node.req("name"),
    ns: node.opt("ns") ?? null,
    vars: params,
    params,
    ancestors,
    extends: ancestors[0] ?? (extendsAttr ? named(extendsAttr) : null),
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
    type: typeAttr !== undefined ? named(typeAttr) : null,
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
    type: typeAttr !== undefined ? named(typeAttr) : undefined,
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

export function parseDoc(xml: string): BlocksDoc {
  return parseBlocks("<inline>", xml);
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
  const attributes: Attribute[] = [];
  const namespaces: Namespace[] = [];
  const types: TypeDef[] = [];
  const blocks: BlockDef[] = [];

  for (const child of root.kids()) {
    switch (child.tag) {
      case "attribute":
        attributes.push({ name: child.req("name"), value: child.text() });
        break;
      case "namespace":
        namespaces.push(parseNamespace(child));
        break;
      case "type":
        types.push(parseTypeDef(child, file));
        break;
      case "block":
        if (root.tag === "types") {
          child.fail("<types> document cannot contain <block>");
        }
        blocks.push(parseBlock(child, file));
        break;
      default:
        child.fail(`unsupported <${root.tag}> child <${child.tag}>`);
    }
  }

  return {
    id: root.req("id"),
    name: root.req("name"),
    icon: root.opt("icon") ?? null,
    attributes,
    namespaces,
    types,
    blocks,
    source: file,
  };
}
