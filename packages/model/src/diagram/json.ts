import type { Attribute } from "../blocks/ast";
import type { Link } from "../blocks/diagram";
import { ParseError } from "../blocks/parse";
import { nextNumericId } from "./ids";
import { isParameterKind, type BlockExtras, type BlockInstance, type CanvasDiagram, type ParameterValue } from "./types";

export { ParseError };

const CATALOG_FILE = /^[A-Za-z0-9._-]+\.json$/;

export function catalogFileName(value: string): string {
  const file = value.trim();
  if (!CATALOG_FILE.test(file)) {
    throw ParseError.new(`catalog must be a file name, got \`${value}\``);
  }
  return file;
}

export function nowIso(now = new Date()): string {
  return now.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message: string): never {
  throw ParseError.new(message);
}

function str(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`expected ${label} string`);
  }
  return value;
}

function optStr(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`invalid ${label}`);
  }
  return value;
}

function optNum(value: unknown, label: string): number | undefined {
  return value === undefined ? undefined : num(value, label);
}

function attrs(value: unknown): Attribute[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).map(([name, item]) => ({ name, value: String(item) }));
}

function parseParameter(value: unknown): ParameterValue {
  if (!isRecord(value)) {
    fail("expected parameter object");
  }
  const kind = optStr(value.kind) ?? "parameter";
  if (!isParameterKind(kind)) {
    fail(`unsupported parameter kind \`${kind}\``);
  }
  return { kind, name: str(value.name, "parameter name"), value: String(value.value ?? "") };
}

function parseCatalogs(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail("expected catalogs array");
  }
  const files: string[] = [];
  for (const item of value) {
    const file = catalogFileName(str(item, "catalog"));
    if (files.includes(file)) {
      fail(`duplicate catalog \`${file}\``);
    }
    files.push(file);
  }
  return files;
}

function parseBlock(value: unknown): { block: BlockInstance; extra: BlockExtras } {
  if (!isRecord(value)) {
    fail("expected block object");
  }
  const id = num(value.id, "block id");
  if (!Number.isInteger(id) || id < 1) {
    fail(`invalid block id \`${id}\``);
  }
  const parameters = Array.isArray(value.parameters) ? value.parameters.map(parseParameter) : [];
  return {
    block: {
      id,
      defId: str(value.type ?? value.defId, "block type"),
      x: num(value.x, "x"),
      y: num(value.y, "y"),
    },
    extra: {
      name: optStr(value.name),
      description: optStr(value.description),
      width: optNum(value.width, "width"),
      height: optNum(value.height, "height"),
      parameters,
    },
  };
}

function parseLink(value: unknown): Link {
  if (!isRecord(value)) {
    fail("expected link object");
  }
  return {
    fromBlock: num(value.fromBlock, "fromBlock"),
    fromOut: str(value.fromOut, "fromOut"),
    toBlock: num(value.toBlock, "toBlock"),
    toIn: str(value.toIn, "toIn"),
  };
}

export function parseDiagram(json: string, _file = "diagram.json"): CanvasDiagram {
  let data: unknown;
  try {
    data = JSON.parse(json) as unknown;
  } catch (error) {
    fail(error instanceof Error ? error.message : "JSON parse error");
  }
  if (!isRecord(data)) {
    fail("expected diagram object");
  }
  const parsed = Array.isArray(data.blocks) ? data.blocks.map(parseBlock) : [];
  const blocks = parsed.map((item) => item.block);
  const extras = new Map(parsed.map((item) => [item.block.id, item.extra]));
  const known = new Set(blocks.map((block) => block.id));
  const links = Array.isArray(data.links) ? data.links.map(parseLink) : [];
  for (const link of links) {
    if (!known.has(link.fromBlock) || !known.has(link.toBlock)) {
      fail(`link references missing block ${link.fromBlock}->${link.toBlock}`);
    }
  }
  return {
    id: str(data.id, "id"),
    name: optStr(data.name) ?? "Workspace",
    description: optStr(data.description),
    createdAt: str(data.createdAt, "createdAt"),
    updatedAt: str(data.updatedAt, "updatedAt"),
    attributes: attrs(data.attrs),
    catalogs: parseCatalogs(data.catalogs),
    blocks,
    links,
    extras,
    nextId: nextNumericId(blocks.map((block) => block.id)),
  };
}

export type CanvasInput = {
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
};

function extrasFor(block: BlockInstance, extras: Map<number, BlockExtras> | undefined): BlockExtras {
  return extras?.get(block.id) ?? { parameters: [] };
}

export function serializeCanvas(canvas: CanvasInput): string {
  return `${JSON.stringify(
    {
      id: canvas.id,
      name: canvas.name,
      ...(canvas.description ? { description: canvas.description } : {}),
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
      ...(canvas.attributes && canvas.attributes.length > 0
        ? { attrs: Object.fromEntries(canvas.attributes.map((item) => [item.name, item.value])) }
        : {}),
      ...(canvas.catalogs && canvas.catalogs.length > 0 ? { catalogs: canvas.catalogs.map(catalogFileName) } : {}),
      ...(canvas.blocks.length > 0
        ? {
            blocks: canvas.blocks.map((block) => {
              const extra = extrasFor(block, canvas.extras);
              return {
                id: block.id,
                type: block.defId,
                x: block.x,
                y: block.y,
                ...(extra.name ? { name: extra.name } : {}),
                ...(extra.description ? { description: extra.description } : {}),
                ...(extra.width !== undefined ? { width: extra.width } : {}),
                ...(extra.height !== undefined ? { height: extra.height } : {}),
                ...(extra.parameters.length > 0 ? { parameters: extra.parameters } : {}),
              };
            }),
          }
        : {}),
      ...(canvas.links.length > 0 ? { links: canvas.links } : {}),
    },
    null,
    2,
  )}\n`;
}
