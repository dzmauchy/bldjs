import type { Attribute } from "../blocks/ast";
import { ParseError, XmlElem, XmlWriter } from "../dom";
import { catalogPortName, portSlotIndex, slottedPortName } from "../blocks/ports";
import type { Link } from "../blocks/diagram";
import type { BlockInstance } from "./types";
import { allocateNumericIds, blockXmlId, connectorXmlId, endpointXmlId, nextNumericId } from "./ids";
import {
  type BlockExtras,
  type ConnectorEndpoint,
  type DiagramBlock,
  type DiagramConnector,
  type DiagramDocument,
  type EntityMeta,
  type ParameterKind,
  type ParameterValue,
  PARAMETER_KINDS,
} from "./types";

export { ParseError };

const { attr, pad, escapeAttr, escapeText } = XmlWriter;

const CATALOG_FILE = /^[A-Za-z0-9._-]+\.xml$/;

/** Diagram catalogs are file names only (no directories or URIs). */
export function catalogFileName(value: string): string {
  const file = value.trim();
  if (!CATALOG_FILE.test(file)) {
    throw ParseError.new(`catalog must be a file name, got \`${value}\``);
  }
  return file;
}

function parseEntity(el: XmlElem): EntityMeta {
  return {
    id: el.req("id"),
    createdAt: el.req("createdAt"),
    updatedAt: el.req("updatedAt"),
    name: el.opt("name"),
    description: el.opt("description"),
    attributes: el.attributes(),
  };
}

function isParameterKind(tag: string): tag is ParameterKind {
  return (PARAMETER_KINDS as readonly string[]).includes(tag);
}

function parseParameter(el: XmlElem): ParameterValue {
  if (!isParameterKind(el.tag)) {
    el.fail(`unsupported parameter <${el.tag}>`);
  }
  return {
    ...parseEntity(el),
    kind: el.tag,
    name: el.req("name"),
    value: el.req("value"),
  };
}

function parseBlock(el: XmlElem): DiagramBlock {
  let parameters: ParameterValue[] = [];
  for (const child of el.kids()) {
    switch (child.tag) {
      case "attribute":
        break;
      case "parameters":
        parameters = child.kids().filter((item) => item.tag !== "attribute").map(parseParameter);
        break;
      default:
        child.fail(`unsupported <block> child <${child.tag}>`);
    }
  }
  return {
    ...parseEntity(el),
    type: el.req("type"),
    x: el.num("x", true)!,
    y: el.num("y", true)!,
    width: el.num("width", false),
    height: el.num("height", false),
    parameters,
  };
}

function parseEndpoint(el: XmlElem): ConnectorEndpoint {
  return {
    ...parseEntity(el),
    block: el.req("block"),
    port: el.opt("port"),
    index: el.index(),
  };
}

function parseConnector(el: XmlElem): DiagramConnector {
  let input: ConnectorEndpoint | undefined;
  let output: ConnectorEndpoint | undefined;
  for (const child of el.kids()) {
    switch (child.tag) {
      case "attribute":
        break;
      case "input":
        if (input) {
          child.fail("connector already has an input");
        }
        input = parseEndpoint(child);
        break;
      case "output":
        if (output) {
          child.fail("connector already has an output");
        }
        output = parseEndpoint(child);
        break;
      default:
        child.fail(`unsupported <connector> child <${child.tag}>`);
    }
  }
  if (!input) {
    el.fail("connector missing <input>");
  }
  if (!output) {
    el.fail("connector missing <output>");
  }
  return { ...parseEntity(el), input, output };
}

function parseGroup(el: XmlElem, childTag: string, parentTag: string): XmlElem[] {
  return el.kids().map((child) => {
    if (child.tag !== childTag) {
      child.fail(`unsupported <${parentTag}> child <${child.tag}>`);
    }
    return child;
  });
}

function parseCatalogFile(el: XmlElem): string {
  const file = el.text();
  if (!CATALOG_FILE.test(file)) {
    el.fail(`catalog must be a file name, got \`${file}\``);
  }
  return file;
}

function parseCatalogs(el: XmlElem): string[] {
  const files: string[] = [];
  for (const child of parseGroup(el, "catalog", "catalogs")) {
    const file = parseCatalogFile(child);
    if (files.includes(file)) {
      child.fail(`duplicate catalog \`${file}\``);
    }
    files.push(file);
  }
  return files;
}

export function parseDiagramXml(xml: string, file = "diagram.xml"): DiagramDocument {
  const root = XmlElem.parse(file, xml, "diagram");
  const doc: DiagramDocument = {
    ...parseEntity(root),
    blocks: [],
    connectors: [],
  };
  for (const child of root.kids()) {
    switch (child.tag) {
      case "attribute":
        break;
      case "catalogs":
        if (doc.catalogs) {
          child.fail("diagram already has <catalogs>");
        }
        doc.catalogs = parseCatalogs(child);
        break;
      case "blocks":
        doc.blocks.push(...parseGroup(child, "block", "blocks").map(parseBlock));
        break;
      case "connectors":
        doc.connectors.push(...parseGroup(child, "connector", "connectors").map(parseConnector));
        break;
      default:
        child.fail(`unsupported <diagram> child <${child.tag}>`);
    }
  }
  return doc;
}

function writeAttributes(attributes: Attribute[], level: number): string {
  return attributes
    .map(
      (item) =>
        `${pad(level)}<attribute name="${escapeAttr(item.name)}">${escapeText(item.value)}</attribute>`,
    )
    .join("\n");
}

function entityAttrs(entity: EntityMeta, extra = ""): string {
  return `${attr("id", entity.id)}${attr("name", entity.name)}${attr("description", entity.description)}${extra}${attr("createdAt", entity.createdAt)}${attr("updatedAt", entity.updatedAt)}`;
}

function writeLeaf(tag: string, openAttrs: string, attributes: Attribute[], level: number): string {
  const indent = pad(level);
  const attrs = writeAttributes(attributes, level + 1);
  const open = `${indent}<${tag}${openAttrs}`;
  if (!attrs) {
    return `${open}/>`;
  }
  return `${open}>\n${attrs}\n${indent}</${tag}>`;
}

function writeParameter(param: ParameterValue, level: number): string {
  return writeLeaf(param.kind, entityAttrs(param, attr("value", param.value)), param.attributes, level);
}

function writeEndpoint(tag: "input" | "output", endpoint: ConnectorEndpoint, level: number): string {
  const extra = `${attr("block", endpoint.block)}${attr("port", endpoint.port)}${attr("index", endpoint.index)}`;
  return writeLeaf(tag, entityAttrs(endpoint, extra), endpoint.attributes, level);
}

export function serializeDiagramXml(doc: DiagramDocument): string {
  const xml = new XmlWriter();
  xml.line(`<?xml version="1.0" encoding="UTF-8"?>`);
  xml.line(
    `<diagram${entityAttrs(doc)} xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="diagram.xsd">`,
  );
  const rootAttrs = writeAttributes(doc.attributes, 1);
  if (rootAttrs) {
    xml.line(rootAttrs);
  }
  if (doc.catalogs) {
    if (doc.catalogs.length === 0) {
      xml.line("    <catalogs/>");
    } else {
      xml.line("    <catalogs>");
      for (const file of doc.catalogs) {
        xml.line(`        <catalog>${escapeText(catalogFileName(file))}</catalog>`);
      }
      xml.line("    </catalogs>");
    }
  }
  if (doc.blocks.length > 0) {
    xml.line("    <blocks>");
    for (const block of doc.blocks) {
      const extra = `${attr("type", block.type)}${attr("x", block.x)}${attr("y", block.y)}${attr("width", block.width)}${attr("height", block.height)}`;
      xml.line(`        <block${entityAttrs(block, extra)}>`);
      const blockAttrs = writeAttributes(block.attributes, 3);
      if (blockAttrs) {
        xml.line(blockAttrs);
      }
      if (block.parameters.length > 0) {
        xml.line("            <parameters>");
        for (const param of block.parameters) {
          xml.line(writeParameter(param, 4));
        }
        xml.line("            </parameters>");
      }
      xml.line("        </block>");
    }
    xml.line("    </blocks>");
  }
  if (doc.connectors.length > 0) {
    xml.line("    <connectors>");
    for (const connector of doc.connectors) {
      xml.line(`        <connector${entityAttrs(connector)}>`);
      const connAttrs = writeAttributes(connector.attributes, 3);
      if (connAttrs) {
        xml.line(connAttrs);
      }
      xml.line(writeEndpoint("input", connector.input, 3));
      xml.line(writeEndpoint("output", connector.output, 3));
      xml.line("        </connector>");
    }
    xml.line("    </connectors>");
  }
  xml.line("</diagram>");
  return xml.toString();
}

export function nowIso(now = new Date()): string {
  return now.toISOString();
}

export interface CanvasDiagram {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  attributes: Attribute[];
  catalogs?: string[];
  blocks: BlockInstance[];
  links: Link[];
  extras: Map<number, BlockExtras>;
  nextId: number;
}

function extrasFor(block: BlockInstance, extras: Map<number, BlockExtras> | undefined, now: string): BlockExtras {
  const existing = extras?.get(block.id);
  return (
    existing ?? {
      xmlId: blockXmlId(block.id),
      createdAt: now,
      updatedAt: now,
      attributes: [],
      parameters: [],
    }
  );
}

export function canvasToDocument(canvas: {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  attributes?: Attribute[];
  catalogs?: string[];
  blocks: readonly BlockInstance[];
  links: readonly Link[];
  extras?: Map<number, BlockExtras>;
}): DiagramDocument {
  const now = nowIso();
  const blocks: DiagramBlock[] = canvas.blocks.map((block) => {
    const extra = extrasFor(block, canvas.extras, now);
    return {
      id: extra.xmlId,
      type: block.defId,
      name: extra.name,
      description: extra.description,
      x: block.x,
      y: block.y,
      width: extra.width,
      height: extra.height,
      createdAt: extra.createdAt,
      updatedAt: extra.updatedAt,
      attributes: extra.attributes,
      parameters: extra.parameters,
    };
  });
  const xmlByNumeric = new Map(canvas.blocks.map((block) => [block.id, extrasFor(block, canvas.extras, now).xmlId]));
  const connectors: DiagramConnector[] = canvas.links.map((link, index) => {
    const n = index + 1;
    const fromXml = xmlByNumeric.get(link.fromBlock);
    const toXml = xmlByNumeric.get(link.toBlock);
    if (!fromXml || !toXml) {
      throw ParseError.new(`connector references missing block ${link.fromBlock}->${link.toBlock}`);
    }
    return {
      id: connectorXmlId(n),
      createdAt: canvas.updatedAt,
      updatedAt: canvas.updatedAt,
      attributes: [],
      input: {
        id: endpointXmlId("in", n),
        createdAt: canvas.updatedAt,
        updatedAt: canvas.updatedAt,
        attributes: [],
        block: fromXml,
        port: catalogPortName(link.fromOut),
        index: portSlotIndex(link.fromOut),
      },
      output: {
        id: endpointXmlId("out", n),
        createdAt: canvas.updatedAt,
        updatedAt: canvas.updatedAt,
        attributes: [],
        block: toXml,
        port: catalogPortName(link.toIn),
        index: portSlotIndex(link.toIn),
      },
    };
  });
  return {
    id: canvas.id,
    name: canvas.name,
    description: canvas.description,
    createdAt: canvas.createdAt,
    updatedAt: canvas.updatedAt,
    attributes: canvas.attributes ?? [],
    catalogs: canvas.catalogs,
    blocks,
    connectors,
  };
}

function portName(endpoint: ConnectorEndpoint, fallback: string): string {
  return slottedPortName(endpoint.port ?? fallback, endpoint.index);
}

export function documentToCanvas(doc: DiagramDocument): CanvasDiagram {
  const xmlIds = doc.blocks.map((block) => block.id);
  const numeric = allocateNumericIds(xmlIds);
  const extras = new Map<number, BlockExtras>();
  const blocks: BlockInstance[] = doc.blocks.map((block) => {
    const id = numeric.get(block.id)!;
    extras.set(id, {
      xmlId: block.id,
      createdAt: block.createdAt,
      updatedAt: block.updatedAt,
      name: block.name,
      description: block.description,
      width: block.width,
      height: block.height,
      attributes: block.attributes,
      parameters: block.parameters,
    });
    return { id, defId: block.type, x: block.x, y: block.y };
  });
  const known = new Set(xmlIds);
  for (const connector of doc.connectors) {
    if (!known.has(connector.input.block)) {
      throw ParseError.new(`connector \`${connector.id}\` input references unknown block \`${connector.input.block}\``);
    }
    if (!known.has(connector.output.block)) {
      throw ParseError.new(
        `connector \`${connector.id}\` output references unknown block \`${connector.output.block}\``,
      );
    }
  }
  const links: Link[] = doc.connectors.map((connector) => ({
    fromBlock: numeric.get(connector.input.block)!,
    fromOut: portName(connector.input, "out"),
    toBlock: numeric.get(connector.output.block)!,
    toIn: portName(connector.output, "in"),
  }));
  return {
    id: doc.id,
    name: doc.name ?? "Workspace",
    description: doc.description,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    attributes: doc.attributes,
    catalogs: doc.catalogs,
    blocks,
    links,
    extras,
    nextId: nextNumericId(blocks.map((block) => block.id)),
  };
}

export function serializeCanvas(canvas: Parameters<typeof canvasToDocument>[0]): string {
  return serializeDiagramXml(canvasToDocument(canvas));
}
