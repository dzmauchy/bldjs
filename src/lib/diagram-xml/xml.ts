import type { Attribute } from "$lib/blocks/ast";
import { ParseError } from "$lib/blocks/parse";
import { catalogPortName, portSlotIndex, slottedPortName } from "$lib/blocks/ports";
import type { Link } from "$lib/blocks/diagram";
import type { BlockInstance } from "$lib/diagram-model";
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

function elements(node: Element): Element[] {
  return [...node.children].filter((child): child is Element => child.nodeType === 1);
}

function optAttr(node: Element, name: string): string | undefined {
  return node.hasAttribute(name) ? (node.getAttribute(name) ?? undefined) : undefined;
}

function requiredAttr(file: string, node: Element, name: string): string {
  const value = optAttr(node, name);
  if (value === undefined) {
    throw at(file, node, `missing \`${name}\` attribute`);
  }
  return value;
}

function at(file: string, node: Element, message: string): ParseError {
  return new ParseError(message, file);
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

function parseEntityMeta(file: string, node: Element): EntityMeta {
  return {
    id: requiredAttr(file, node, "id"),
    createdAt: requiredAttr(file, node, "createdAt"),
    updatedAt: requiredAttr(file, node, "updatedAt"),
    name: optAttr(node, "name"),
    description: optAttr(node, "description"),
    attributes: parseAttributes(file, node),
  };
}

function parseNumber(file: string, node: Element, name: string, required: boolean): number | undefined {
  const raw = optAttr(node, name);
  if (raw === undefined) {
    if (required) {
      throw at(file, node, `missing \`${name}\` attribute`);
    }
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw at(file, node, `invalid \`${name}\` \`${raw}\``);
  }
  return value;
}

function parseIndex(file: string, node: Element): number {
  const raw = optAttr(node, "index");
  if (raw === undefined) {
    return 0;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw at(file, node, `invalid \`index\` \`${raw}\``);
  }
  return value;
}

function isParameterKind(tag: string): tag is ParameterKind {
  return (PARAMETER_KINDS as readonly string[]).includes(tag);
}

function parseParameter(file: string, node: Element): ParameterValue {
  if (!isParameterKind(node.tagName)) {
    throw at(file, node, `unsupported parameter <${node.tagName}>`);
  }
  const meta = parseEntityMeta(file, node);
  return {
    ...meta,
    kind: node.tagName,
    name: requiredAttr(file, node, "name"),
    value: requiredAttr(file, node, "value"),
  };
}

function parseParameters(file: string, node: Element): ParameterValue[] {
  const values: ParameterValue[] = [];
  for (const child of elements(node)) {
    if (child.tagName === "attribute") {
      continue;
    }
    values.push(parseParameter(file, child));
  }
  return values;
}

function parseBlock(file: string, node: Element): DiagramBlock {
  const meta = parseEntityMeta(file, node);
  let parameters: ParameterValue[] = [];
  for (const child of elements(node)) {
    switch (child.tagName) {
      case "attribute":
        break;
      case "parameters":
        parameters = parseParameters(file, child);
        break;
      default:
        throw at(file, child, `unsupported <block> child <${child.tagName}>`);
    }
  }
  return {
    ...meta,
    type: requiredAttr(file, node, "type"),
    x: parseNumber(file, node, "x", true)!,
    y: parseNumber(file, node, "y", true)!,
    width: parseNumber(file, node, "width", false),
    height: parseNumber(file, node, "height", false),
    parameters,
  };
}

function parseEndpoint(file: string, node: Element): ConnectorEndpoint {
  return {
    ...parseEntityMeta(file, node),
    block: requiredAttr(file, node, "block"),
    port: optAttr(node, "port"),
    index: parseIndex(file, node),
  };
}

function parseConnector(file: string, node: Element): DiagramConnector {
  const meta = parseEntityMeta(file, node);
  let input: ConnectorEndpoint | undefined;
  let output: ConnectorEndpoint | undefined;
  for (const child of elements(node)) {
    switch (child.tagName) {
      case "attribute":
        break;
      case "input":
        if (input) {
          throw at(file, child, "connector already has an input");
        }
        input = parseEndpoint(file, child);
        break;
      case "output":
        if (output) {
          throw at(file, child, "connector already has an output");
        }
        output = parseEndpoint(file, child);
        break;
      default:
        throw at(file, child, `unsupported <connector> child <${child.tagName}>`);
    }
  }
  if (!input) {
    throw at(file, node, "connector missing <input>");
  }
  if (!output) {
    throw at(file, node, "connector missing <output>");
  }
  return { ...meta, input, output };
}

export function parseDiagramXml(xml: string, file = "diagram.xml"): DiagramDocument {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new ParseError(parserError.textContent?.trim() || "XML parse error", file);
  }
  const root = document.documentElement;
  if (root.tagName !== "diagram") {
    throw at(file, root, `expected <diagram>, found <${root.tagName}>`);
  }
  const doc: DiagramDocument = {
    ...parseEntityMeta(file, root),
    blocks: [],
    connectors: [],
  };
  for (const child of elements(root)) {
    switch (child.tagName) {
      case "attribute":
        break;
      case "blocks":
        for (const block of elements(child)) {
          if (block.tagName !== "block") {
            throw at(file, block, `unsupported <blocks> child <${block.tagName}>`);
          }
          doc.blocks.push(parseBlock(file, block));
        }
        break;
      case "connectors":
        for (const connector of elements(child)) {
          if (connector.tagName !== "connector") {
            throw at(file, connector, `unsupported <connectors> child <${connector.tagName}>`);
          }
          doc.connectors.push(parseConnector(file, connector));
        }
        break;
      default:
        throw at(file, child, `unsupported <diagram> child <${child.tagName}>`);
    }
  }
  return doc;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function attr(name: string, value: string | number | undefined): string {
  if (value === undefined) {
    return "";
  }
  return ` ${name}="${escapeAttr(String(value))}"`;
}

function writeAttributes(attributes: Attribute[], level: number): string {
  return attributes
    .map(
      (item) =>
        `${"    ".repeat(level)}<attribute name="${escapeAttr(item.name)}">${escapeText(item.value)}</attribute>`,
    )
    .join("\n");
}

function writeEntityAttrs(entity: EntityMeta, extra = ""): string {
  return `${attr("id", entity.id)}${attr("name", entity.name)}${attr("description", entity.description)}${extra}${attr("createdAt", entity.createdAt)}${attr("updatedAt", entity.updatedAt)}`;
}

function writeParameter(param: ParameterValue, level: number): string {
  const pad = "    ".repeat(level);
  const attrs = writeAttributes(param.attributes, level + 1);
  const open = `${pad}<${param.kind}${writeEntityAttrs(param, attr("value", param.value))}`;
  if (!attrs) {
    return `${open}/>`;
  }
  return `${open}>\n${attrs}\n${pad}</${param.kind}>`;
}

function writeEndpoint(tag: "input" | "output", endpoint: ConnectorEndpoint, level: number): string {
  const pad = "    ".repeat(level);
  const extra = `${attr("block", endpoint.block)}${attr("port", endpoint.port)}${attr("index", endpoint.index)}`;
  const attrs = writeAttributes(endpoint.attributes, level + 1);
  const open = `${pad}<${tag}${writeEntityAttrs(endpoint, extra)}`;
  if (!attrs) {
    return `${open}/>`;
  }
  return `${open}>\n${attrs}\n${pad}</${tag}>`;
}

export function serializeDiagramXml(doc: DiagramDocument): string {
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<diagram${writeEntityAttrs(doc)} xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="diagram.xsd">`,
  ];
  const rootAttrs = writeAttributes(doc.attributes, 1);
  if (rootAttrs) {
    lines.push(rootAttrs);
  }
  if (doc.blocks.length > 0) {
    lines.push("    <blocks>");
    for (const block of doc.blocks) {
      const extra = `${attr("type", block.type)}${attr("x", block.x)}${attr("y", block.y)}${attr("width", block.width)}${attr("height", block.height)}`;
      lines.push(`        <block${writeEntityAttrs(block, extra)}>`);
      const blockAttrs = writeAttributes(block.attributes, 3);
      if (blockAttrs) {
        lines.push(blockAttrs);
      }
      if (block.parameters.length > 0) {
        lines.push("            <parameters>");
        for (const param of block.parameters) {
          lines.push(writeParameter(param, 4));
        }
        lines.push("            </parameters>");
      }
      lines.push("        </block>");
    }
    lines.push("    </blocks>");
  }
  if (doc.connectors.length > 0) {
    lines.push("    <connectors>");
    for (const connector of doc.connectors) {
      lines.push(`        <connector${writeEntityAttrs(connector)}>`);
      const connAttrs = writeAttributes(connector.attributes, 3);
      if (connAttrs) {
        lines.push(connAttrs);
      }
      lines.push(writeEndpoint("input", connector.input, 3));
      lines.push(writeEndpoint("output", connector.output, 3));
      lines.push("        </connector>");
    }
    lines.push("    </connectors>");
  }
  lines.push("</diagram>");
  lines.push("");
  return lines.join("\n");
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
    blocks,
    links,
    extras,
    nextId: nextNumericId(blocks.map((block) => block.id)),
  };
}

export function serializeCanvas(canvas: Parameters<typeof canvasToDocument>[0]): string {
  return serializeDiagramXml(canvasToDocument(canvas));
}
