import type { Attribute } from "../blocks/ast";
import type { Link } from "../blocks/diagram";
import { ParseError } from "../blocks/parse";
import { emitDiagramStart } from "../solution/emit";
import { findDecoratorCalls } from "../tsc/literal-text";
import { nextNumericId } from "./ids";
import { isParameterKind, type BlockExtras, type BlockInstance, type CanvasDiagram, type ParameterValue } from "./types";
import MODEL_TS from "../resources/models/model.ts?raw";

export { ParseError };

const CATALOG_FILE = /^[A-Za-z0-9._-]+\.ts$/;

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

function instanceName(defId: string, id: number): string {
  return `${defId.replace(/[^A-Za-z0-9_]/g, "_")}_${id}`;
}

function jsString(value: string): string {
  return JSON.stringify(value);
}

function emitObject(value: Record<string, unknown>, indent: number): string {
  const pad = "  ".repeat(indent);
  const inner = "  ".repeat(indent + 1);
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  if (entries.length === 0) {
    return "{}";
  }
  const lines = entries.map(([key, item]) => {
    const ident = /^[A-Za-z_$][\w$]*$/.test(key) ? key : jsString(key);
    return `${inner}${ident}: ${emitValue(item, indent + 1)},`;
  });
  return `{\n${lines.join("\n")}\n${pad}}`;
}

function emitValue(value: unknown, indent: number): string {
  if (typeof value === "string") {
    return jsString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const pad = "  ".repeat(indent);
    const inner = "  ".repeat(indent + 1);
    return `[\n${value.map((item) => `${inner}${emitValue(item, indent + 1)},`).join("\n")}\n${pad}]`;
  }
  if (isRecord(value)) {
    return emitObject(value, indent);
  }
  return "undefined";
}

export function parseDiagram(source: string, _file = "diagram.ts"): CanvasDiagram {
  const diagrams = findDecoratorCalls(source, "Diagram");
  if (diagrams.length === 0) {
    fail("expected @Diagram(...) catalog");
  }
  const meta = diagrams[0]!.args[0];
  if (!isRecord(meta)) {
    fail("expected @Diagram meta object");
  }
  const parsedBlocks = findDecoratorCalls(source, "DiagramBlock").map((call) => {
    const value = call.args[0];
    if (!isRecord(value)) {
      fail("expected @DiagramBlock meta object");
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
      } satisfies BlockInstance,
      extra: {
        name: optStr(value.caption) ?? optStr(value.name),
        description: optStr(value.description),
        width: optNum(value.width, "width"),
        height: optNum(value.height, "height"),
        parameters,
      } satisfies BlockExtras,
    };
  });
  const blocks = parsedBlocks.map((item) => item.block);
  const extras = new Map(parsedBlocks.map((item) => [item.block.id, item.extra]));
  const known = new Set(blocks.map((block) => block.id));
  const links = findDecoratorCalls(source, "Connection").map((call) => {
    const value = call.args[2] ?? call.args[0];
    if (!isRecord(value)) {
      fail("expected @Connection meta object");
    }
    return {
      fromBlock: num(value.fromBlock, "fromBlock"),
      fromOut: str(value.fromOut, "fromOut"),
      toBlock: num(value.toBlock, "toBlock"),
      toIn: str(value.toIn, "toIn"),
    } satisfies Link;
  });
  for (const link of links) {
    if (!known.has(link.fromBlock) || !known.has(link.toBlock)) {
      fail(`link references missing block ${link.fromBlock}->${link.toBlock}`);
    }
  }
  return {
    id: str(meta.id, "id"),
    name: optStr(meta.name) ?? "Workspace",
    description: optStr(meta.description),
    createdAt: str(meta.createdAt, "createdAt"),
    updatedAt: str(meta.updatedAt, "updatedAt"),
    attributes: attrs(meta.attrs),
    catalogs: parseCatalogs(meta.catalogs),
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
  const diagramMeta: Record<string, unknown> = {
    id: canvas.id,
    name: canvas.name,
    createdAt: canvas.createdAt,
    updatedAt: canvas.updatedAt,
  };
  if (canvas.description) {
    diagramMeta.description = canvas.description;
  }
  if (canvas.attributes && canvas.attributes.length > 0) {
    diagramMeta.attrs = Object.fromEntries(canvas.attributes.map((item) => [item.name, item.value]));
  }
  if (canvas.catalogs && canvas.catalogs.length > 0) {
    diagramMeta.catalogs = canvas.catalogs.map(catalogFileName);
  }
  const lines: string[] = [`@Diagram(${emitValue(diagramMeta, 0)})`, `function diagram() {`];
  for (const block of canvas.blocks) {
    const extra = extrasFor(block, canvas.extras);
    const meta: Record<string, unknown> = {
      id: block.id,
      type: block.defId,
      x: block.x,
      y: block.y,
    };
    if (extra.name) {
      meta.caption = extra.name;
      meta.name = extra.name;
    } else {
      meta.caption = block.defId;
    }
    if (extra.description) meta.description = extra.description;
    if (extra.width !== undefined) meta.width = extra.width;
    if (extra.height !== undefined) meta.height = extra.height;
    if (extra.parameters.length > 0) {
      meta.parameters = extra.parameters.map((param) => ({
        kind: param.kind,
        name: param.name,
        value: param.value,
      }));
    }
    const fn = instanceName(block.defId, block.id);
    lines.push(`  @DiagramBlock(${emitValue(meta, 1)})`);
    lines.push(`  function ${fn}() {}`);
    lines.push("");
  }
  for (const link of canvas.links) {
    const from = `${instanceName("", link.fromBlock).replace(/^_/, "")}${link.fromOut}`;
    const fromName = `${instanceName("block", link.fromBlock)}_${link.fromOut.replace(/[^A-Za-z0-9_]/g, "_")}`;
    const toName = `${instanceName("block", link.toBlock)}_${link.toIn.replace(/[^A-Za-z0-9_]/g, "_")}`;
    void from;
    lines.push(
      `  @Connection(${jsString(fromName)}, ${jsString(toName)}, ${emitValue(
        {
          fromBlock: link.fromBlock,
          fromOut: link.fromOut,
          toBlock: link.toBlock,
          toIn: link.toIn,
        },
        1,
      )})`,
    );
  }
  if (canvas.links.length > 0) {
    lines.push(`  function wires() {}`);
  }
  const start = emitDiagramStart(canvas);
  if (start.trim().length > 0) {
    lines.push("");
    lines.push(start);
  }
  lines.push(`}`);
  lines.push(`diagram();`);
  lines.push("");
  return `${MODEL_TS.replace(/\s+$/, "")}\n\n${lines.join("\n")}\n`;
}
